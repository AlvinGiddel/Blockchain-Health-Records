/**
 * =========================================================================
 * ARCHIVAL REFERENCE / DOCUMENTATION UTILITY SCRIPT
 * =========================================================================
 * Purpose: One-time database and blockchain ledger repair utility written
 * to resolve the block-index desynchronization bug following the migration
 * from MongoDB to Supabase (PostgreSQL).
 * 
 * Executed: July 2026
 * Status: Kept for reference and technical documentation purposes only.
 *         NOT part of the active production application runtime.
 * =========================================================================
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../db');
const { Blockchain } = require('../blockchain');

// Instantiates temporary blockchain for re-mining sequence
const tempBlockchain = new Blockchain();

function parseJsonIfNeeded(val) {
    if (!val) return null;
    if (typeof val === 'object') return val;
    try {
        return JSON.parse(val);
    } catch (e) {
        return val;
    }
}

async function repairLedger() {
    try {
        console.log('====================================================');
        console.log('  STARTING BLOCKCHAIN LEDGER DATA REPAIR SEQUENCE  ');
        console.log('====================================================\n');

        // 1. Fetch BEFORE State of Records
        const { rows: beforeRecords } = await db.query(
            'SELECT id, doctor_name, is_mined, block_index, timestamp FROM records ORDER BY timestamp ASC'
        );
        console.log(`Found ${beforeRecords.length} records in database.`);
        console.log('\n--- BEFORE REPAIR RECORD STATES ---');
        console.table(beforeRecords.map(r => ({
            id: r.id,
            doctorName: r.doctor_name,
            isMined: r.is_mined,
            blockIndex: r.block_index,
            timestamp: r.timestamp
        })));

        // 2. Fetch BEFORE State of Blocks
        const { rows: beforeBlocks } = await db.query(
            'SELECT index, hash, previous_hash, nonce FROM blocks ORDER BY index ASC'
        );
        console.log('\n--- BEFORE REPAIR BLOCKS TABLE ---');
        console.table(beforeBlocks);

        // 3. Reset all records and audit_logs to unmined state
        console.log('\nStep 1: Resetting is_mined = false and block_index = -1 on all records & audit_logs...');
        await db.query('UPDATE records SET is_mined = false, block_index = -1');
        await db.query('UPDATE audit_logs SET is_mined = false, block_index = -1');

        // 4. Clear all blocks EXCEPT Genesis block (index 0)
        console.log('Step 2: Clearing non-genesis blocks from database (DELETE FROM blocks WHERE index > 0)...');
        await db.query('DELETE FROM blocks WHERE index > 0');

        // 5. Initialize Genesis block in memory if not already in DB
        const { rows: genesisRows } = await db.query('SELECT * FROM blocks WHERE index = 0');
        if (genesisRows.length === 0) {
            console.log('Genesis block missing! Inserting standard Genesis block...');
            const gen = tempBlockchain.chain[0];
            await db.query(
                'INSERT INTO blocks (index, timestamp, records, previous_hash, nonce, hash) VALUES ($1, $2, $3, $4, $5, $6)',
                [gen.index, gen.timestamp, JSON.stringify(gen.records), gen.previousHash, gen.nonce, gen.hash]
            );
        } else {
            const g = genesisRows[0];
            const gBlock = new (require('../blockchain').Block)(
                g.index,
                g.timestamp,
                parseJsonIfNeeded(g.records),
                g.previous_hash
            );
            gBlock.nonce = parseInt(g.nonce, 10);
            gBlock.hash = g.hash;
            tempBlockchain.chain = [gBlock];
        }

        // 6. Fetch full record payload details for re-mining
        const { rows: recordsToMine } = await db.query(
            'SELECT * FROM records ORDER BY timestamp ASC'
        );

        console.log(`\nStep 3: Re-mining ${recordsToMine.length} records sequentially into clean blocks...`);

        for (let i = 0; i < recordsToMine.length; i++) {
            const rec = recordsToMine[i];
            const { rows: pUsers } = await db.query('SELECT name FROM users WHERE id = $1', [rec.patient_id]);
            const patientName = pUsers.length > 0 ? pUsers[0].name : 'Patient';

            // Construct valid block payload item
            const payloadItem = {
                recordId: rec.id,
                txType: rec.record_type || 'medical',
                patientId: rec.patient_id,
                patientName: patientName,
                doctorId: rec.doctor_id,
                doctorName: rec.doctor_name,
                diagnosis: rec.diagnosis,
                treatment: rec.treatment,
                prescriptions: rec.prescriptions,
                ipfsHash: rec.ipfs_hash || '',
                signature: rec.signature,
                doctorPublicKey: rec.doctor_public_key,
                timestamp: rec.timestamp
            };

            // Set pending record & mine block
            tempBlockchain.pendingRecords = [payloadItem];
            const newBlock = tempBlockchain.minePendingRecords();

            // Insert new block into DB
            await db.query(
                'INSERT INTO blocks (index, timestamp, records, previous_hash, nonce, hash) VALUES ($1, $2, $3, $4, $5, $6)',
                [newBlock.index, newBlock.timestamp, JSON.stringify(newBlock.records), newBlock.previousHash, newBlock.nonce, newBlock.hash]
            );

            // Update record's block_index in DB
            await db.query(
                'UPDATE records SET is_mined = true, block_index = $1 WHERE id = $2',
                [newBlock.index, rec.id]
            );

            console.log(`  ✓ Re-mined Record #${i + 1} (${rec.id}) -> Assigned Block #${newBlock.index} (Hash: ${newBlock.hash.slice(0, 20)}...)`);
        }

        // 7. Fetch AFTER State of Records
        const { rows: afterRecords } = await db.query(
            'SELECT id, doctor_name, is_mined, block_index, timestamp FROM records ORDER BY timestamp ASC'
        );
        const { rows: afterBlocks } = await db.query(
            'SELECT index, hash, previous_hash, nonce FROM blocks ORDER BY index ASC'
        );

        console.log('\n====================================================');
        console.log('             REPAIR COMPLETED SUCCESSFULLY          ');
        console.log('====================================================\n');

        console.log('--- SIDE-BY-SIDE COMPARISON: BEFORE VS AFTER REPAIR ---');
        const comparison = beforeRecords.map(b => {
            const a = afterRecords.find(item => item.id === b.id);
            return {
                RecordId: b.id,
                DoctorName: b.doctor_name,
                BEFORE_block_index: b.block_index,
                AFTER_block_index: a ? a.block_index : -1,
                Status: b.block_index === (a ? a.block_index : -1) ? 'Unchanged' : 'Fixed'
            };
        });
        console.table(comparison);

        console.log('\n--- AFTER REPAIR BLOCKS TABLE ---');
        console.table(afterBlocks);

    } catch (err) {
        console.error('Fatal error during ledger repair:', err);
    } finally {
        process.exit();
    }
}

repairLedger();
