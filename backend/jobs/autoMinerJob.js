/**
 * Auto-Miner Background Worker (Jobs Domain)
 * 
 * Handles multi-tenant per-organization blockchain mining, mempool synchronization,
 * mempool-threshold auto-mining, and fallback interval timer mining with mutex locking.
 */

const db = require('../db');
const { Block, getKenyanTimestamp } = require('../blockchain');
const { decrypt } = require('../utils/helpers');

// Configuration
const MEMPOOL_THRESHOLD = parseInt(process.env.MEMPOOL_THRESHOLD, 10) || 10;
const MINE_INTERVAL_MS = parseInt(process.env.MINE_INTERVAL_MS, 10) || 60000;

// Mutex lock to prevent concurrent mining operations across triggers
let isMining = false;

// Active blockchain reference
let activeBlockchain = null;

/**
 * Sets or updates the active Blockchain instance reference.
 * @param {object} bc - Blockchain instance
 */
function setBlockchain(bc) {
    activeBlockchain = bc;
}

/**
 * Gets the current active Blockchain instance.
 * @returns {object|null}
 */
function getBlockchain() {
    return activeBlockchain;
}

/**
 * Checks if a mining operation is currently in progress.
 * @returns {boolean}
 */
function isMiningActive() {
    return isMining;
}

/**
 * Synchronize the in-memory blockchain state with the database.
 * Loads mined blocks from PostgreSQL, or saves the Genesis block if the DB is empty.
 * Populates mempool with pending unmined records from the records table.
 * 
 * @param {object} [blockchain] - Optional blockchain instance (defaults to activeBlockchain)
 */
async function syncBlockchainWithDatabase(blockchain = activeBlockchain) {
    if (!blockchain) {
        console.warn('[Auto-Miner] No blockchain instance provided for syncBlockchainWithDatabase.');
        return;
    }

    try {
        const { rows: dbBlocks } = await db.query('SELECT * FROM blocks ORDER BY organization_id, index ASC');
        console.log(`[Auto-Miner] Synchronized ${dbBlocks.length} multi-tenant blocks across all organizations.`);

        // Load primary ledger blocks into blockchain.chain for backward-compatible in-memory access
        const { rows: firstOrg } = await db.query('SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1');
        const defaultOrgId = firstOrg[0]?.id;

        if (defaultOrgId) {
            const { rows: primaryBlocks } = await db.query(`
                SELECT * FROM blocks 
                WHERE organization_id = $1 
                ORDER BY index ASC;
            `, [defaultOrgId]);

            if (primaryBlocks.length > 0) {
                blockchain.chain = primaryBlocks.map(dbBlock => {
                    const b = new Block(
                        dbBlock.index,
                        dbBlock.timestamp,
                        dbBlock.records,
                        dbBlock.previous_hash
                    );
                    b.nonce = parseInt(dbBlock.nonce, 10);
                    b.hash = dbBlock.hash;
                    return b;
                });
            } else {
                const genesis = blockchain.chain[0];
                await db.query(`
                    INSERT INTO blocks (index, timestamp, records, previous_hash, nonce, hash, organization_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT DO NOTHING;
                `, [genesis.index, genesis.timestamp, JSON.stringify(genesis.records), genesis.previousHash, genesis.nonce, genesis.hash, defaultOrgId]);
            }
        }

        // Sync pending records from database (records not yet mined) using JOIN query
        const { rows: pendingDbRecords } = await db.query(`
            SELECT r.*, u.name as patient_name 
            FROM records r 
            LEFT JOIN users u ON r.patient_id = u.id 
            WHERE r.is_mined = false 
            ORDER BY r.timestamp ASC
        `);

        const medicalPending = pendingDbRecords.map(rec => ({
            recordId: rec.id,
            organizationId: rec.organization_id,
            txType: rec.record_type || 'medical',
            patientId: rec.patient_id,
            patientName: rec.patient_name || 'Unknown Patient',
            doctorId: rec.doctor_id,
            doctorName: rec.doctor_name,
            diagnosis: decrypt(rec.diagnosis),
            treatment: decrypt(rec.treatment),
            prescriptions: rec.prescriptions,
            ipfsHash: rec.ipfs_hash,
            signature: rec.signature,
            doctorPublicKey: rec.doctor_public_key,
            timestamp: rec.timestamp,
            consultationHash: rec.consultation_hash || '',
            transactionHash: rec.transaction_hash || ''
        }));

        // Merge database pending records with any in-memory pending records (e.g. from tests or prior to sync)
        const dbRecordIds = new Set(medicalPending.map(r => r.recordId).filter(Boolean));
        const inMemoryPending = (blockchain.pendingRecords || []).filter(r => !r.recordId || !dbRecordIds.has(r.recordId));
        const combined = [...medicalPending, ...inMemoryPending];

        // Sort by timestamp
        blockchain.pendingRecords = combined.sort(
            (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );

        console.log(`[Auto-Miner] Blockchain active. Chain length: ${blockchain.chain.length}. Pending records: ${blockchain.pendingRecords.length}`);
    } catch (error) {
        console.error('[Auto-Miner] Error synchronizing blockchain with database:', error.message);
    }
}

/**
 * Executes a mining operation for pending records with race-condition locking.
 * Mines the pending records into the target organization's ledger chain.
 * 
 * @param {string} triggerReason - Reason/source for mine trigger ('manual admin trigger', 'threshold hit', 'timer fallback')
 * @param {object} [blockchain] - Optional blockchain instance (defaults to activeBlockchain)
 * @returns {Promise<{success: boolean, block?: any, skipped?: boolean, error?: string, reason?: string}>}
 */
async function executeMining(triggerReason = 'manual', blockchain = activeBlockchain) {
    if (isMining) {
        console.log(`[Auto-Miner] Mining is currently in progress. Skipping trigger (${triggerReason}).`);
        return { skipped: true, reason: 'Mining in progress' };
    }

    if (!blockchain) {
        return { success: false, error: 'Blockchain instance not initialized.' };
    }

    isMining = true;
    try {
        await syncBlockchainWithDatabase(blockchain);

        if (blockchain.pendingRecords.length === 0) {
            if (triggerReason.startsWith('manual')) {
                return { success: false, error: 'No pending records to mine. Add new records first.' };
            }
            console.log(`[Auto-Miner] No pending records in mempool to mine (${triggerReason}).`);
            return { skipped: true, reason: 'No pending records' };
        }

        console.log(`[Auto-Miner] Mining block started (${triggerReason}). Mempool count: ${blockchain.pendingRecords.length}. Starting Proof of Work...`);

        let blockOrgId = blockchain.pendingRecords[0]?.organizationId || 
                         blockchain.pendingRecords[0]?.organization_id;

        if (!blockOrgId) {
            const { rows: fallbackOrgs } = await db.query('SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1');
            blockOrgId = fallbackOrgs[0]?.id;
        }

        // Query target organization's highest block index and hash for accurate multi-tenant chaining
        const { rows: latestOrgBlocks } = await db.query(
            'SELECT index, hash FROM blocks WHERE organization_id = $1 ORDER BY index DESC LIMIT 1',
            [blockOrgId]
        );

        const nextOrgIndex = latestOrgBlocks.length > 0 ? (parseInt(latestOrgBlocks[0].index, 10) + 1) : 0;
        const prevOrgHash = latestOrgBlocks.length > 0 ? latestOrgBlocks[0].hash : '0';

        const newBlock = new Block(
            nextOrgIndex,
            getKenyanTimestamp(),
            [...blockchain.pendingRecords],
            prevOrgHash
        );
        newBlock.mineBlock(blockchain.difficulty || 2);
        blockchain.chain.push(newBlock);
        blockchain.pendingRecords = [];

        // Save block in database
        await db.query(
            'INSERT INTO blocks (index, timestamp, records, previous_hash, nonce, hash, organization_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
            [newBlock.index, newBlock.timestamp, JSON.stringify(newBlock.records), newBlock.previousHash, newBlock.nonce, newBlock.hash, blockOrgId]
        );

        // Update records and audit logs
        const recordIds = newBlock.records.map(r => r.recordId).filter(Boolean);
        if (recordIds.length > 0) {
            await Promise.all([
                db.query('UPDATE records SET is_mined = true, block_index = $1 WHERE id = ANY($2::uuid[])', [newBlock.index, recordIds]),
                db.query('UPDATE audit_logs SET is_mined = true, block_index = $1 WHERE patient_id = ANY($2::uuid[])', [newBlock.index, recordIds])
            ]);
        }

        console.log(`[Auto-Miner] Block #${newBlock.index} mined successfully (${triggerReason}) with ${newBlock.records.length} record(s). Hash: ${newBlock.hash}`);
        return { success: true, block: newBlock };
    } catch (error) {
        console.error(`[Auto-Miner ERROR] Mining failed (${triggerReason}):`, error);
        throw error;
    } finally {
        isMining = false;
    }
}

/**
 * Checks if pending records in mempool have reached MEMPOOL_THRESHOLD and triggers auto-mine.
 * @param {object} [blockchain] - Optional blockchain instance (defaults to activeBlockchain)
 */
function checkMempoolThreshold(blockchain = activeBlockchain) {
    const bc = blockchain || activeBlockchain;
    if (!bc) return Promise.resolve({ skipped: true, reason: 'No blockchain instance' });

    if (bc.pendingRecords.length >= MEMPOOL_THRESHOLD) {
        console.log(`[Auto-Miner] Mempool threshold reached (${bc.pendingRecords.length}/${MEMPOOL_THRESHOLD} records). Triggering auto-mine...`);
        return executeMining(`threshold hit: ${bc.pendingRecords.length}/${MEMPOOL_THRESHOLD} records`, bc).catch(err => {
            console.error('[Auto-Miner] Threshold-triggered mining failed:', err);
            return { success: false, error: err.message };
        });
    }
    return Promise.resolve({ skipped: true, reason: 'Threshold not met' });
}

/**
 * Starts a background interval timer to periodically mine pending records that have not met the threshold.
 * Uses global._autoMineTimer to prevent duplicate timers across hot-reloads or tests.
 * 
 * @param {object} [blockchain] - Optional blockchain instance (defaults to activeBlockchain)
 * @param {number} [intervalMs] - Mining interval in milliseconds
 */
function startAutoMineTimer(blockchain = activeBlockchain, intervalMs = MINE_INTERVAL_MS) {
    if (blockchain) {
        activeBlockchain = blockchain;
    }

    if (global._autoMineTimer) {
        clearInterval(global._autoMineTimer);
        global._autoMineTimer = null;
    }

    console.log(`[Auto-Miner] Background timer initialized (Interval: ${intervalMs}ms, Threshold: ${MEMPOOL_THRESHOLD} records).`);

    global._autoMineTimer = setInterval(async () => {
        try {
            const bc = activeBlockchain;
            if (bc && bc.pendingRecords.length > 0) {
                console.log(`[Auto-Miner] Timer interval (${intervalMs}ms) triggered with ${bc.pendingRecords.length} pending record(s).`);
                await executeMining(`timer fallback (${bc.pendingRecords.length} pending record(s))`, bc);
            }
        } catch (err) {
            console.error('[Auto-Miner] Timer-triggered mining error:', err);
        }
    }, intervalMs);

    if (global._autoMineTimer.unref) {
        global._autoMineTimer.unref();
    }
}

/**
 * Stops the background auto-mine timer.
 */
function stopAutoMineTimer() {
    if (global._autoMineTimer) {
        clearInterval(global._autoMineTimer);
        global._autoMineTimer = null;
        console.log('[Auto-Miner] Background timer stopped.');
    }
}

/**
 * Validates cryptographic chain integrity across all multi-tenant hospital ledgers.
 * Ensures each individual organization's chain starts with Genesis (index: 0, prev: '0')
 * and maintains continuous SHA-256 hash linkage.
 * 
 * @param {string|null} targetOrgId - Optional organization ID filter
 * @returns {Promise<boolean>}
 */
async function validateMultiTenantChains(targetOrgId = null) {
    try {
        let query = `
            SELECT organization_id, index, timestamp, records, previous_hash, nonce, hash 
            FROM blocks 
        `;
        const params = [];
        if (targetOrgId) {
            query += ` WHERE organization_id = $1 `;
            params.push(targetOrgId);
        }
        query += ` ORDER BY organization_id, index ASC;`;

        const { rows: blocks } = await db.query(query, params);
        if (blocks.length === 0) return true;

        const orgMap = {};
        for (const b of blocks) {
            const orgId = b.organization_id || 'default';
            if (!orgMap[orgId]) orgMap[orgId] = [];
            orgMap[orgId].push(b);
        }

        for (const orgId in orgMap) {
            const chain = orgMap[orgId];
            if (parseInt(chain[0].index, 10) !== 0 || chain[0].previous_hash !== '0') {
                return false;
            }
            for (let i = 1; i < chain.length; i++) {
                if (chain[i].previous_hash !== chain[i - 1].hash) {
                    return false;
                }
            }
        }
        return true;
    } catch (e) {
        console.error('[Auto-Miner] validateMultiTenantChains error:', e);
        return false;
    }
}

/**
 * Initializes the auto-miner worker with database sync and background timer.
 * 
 * @param {object} blockchain - Blockchain instance
 * @param {object} [options] - Options: { startTimer?: boolean, intervalMs?: number }
 */
async function initAutoMiner(blockchain, options = {}) {
    setBlockchain(blockchain);
    await syncBlockchainWithDatabase(blockchain);
    if (options.startTimer !== false) {
        startAutoMineTimer(blockchain, options.intervalMs || MINE_INTERVAL_MS);
    }
    return {
        setBlockchain,
        getBlockchain,
        isMiningActive,
        syncBlockchainWithDatabase,
        executeMining,
        checkMempoolThreshold,
        startAutoMineTimer,
        stopAutoMineTimer,
        validateMultiTenantChains
    };
}

module.exports = {
    setBlockchain,
    getBlockchain,
    isMiningActive,
    syncBlockchainWithDatabase,
    executeMining,
    checkMempoolThreshold,
    startAutoMineTimer,
    stopAutoMineTimer,
    validateMultiTenantChains,
    initAutoMiner,
    MEMPOOL_THRESHOLD,
    MINE_INTERVAL_MS
};
