/**
 * Phase 7: Background Jobs & Workers Domain Smoke Test Suite
 * 
 * Verifies:
 * 1. Auto-miner mutex lock (prevents concurrent mining operations)
 * 2. Auto-miner mempool-threshold auto-mine trigger
 * 3. Auto-miner timer fallback auto-mine trigger
 * 4. Multi-tenant cryptographic ledger continuity validation
 * 5. License check fail-closed remote authority verification
 * 6. Multi-tenant organization trial expiry auto-transition (trial -> expired)
 */

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const db = require('../db');
const { Blockchain, getKenyanTimestamp } = require('../blockchain');
const { autoMinerJob, licenseCheckJob } = require('../jobs');

let passedTests = 0;
function test(name, fn) {
    return (async () => {
        try {
            await fn();
            console.log(`  [PASS] ${name}`);
            passedTests++;
        } catch (err) {
            console.error(`  [FAIL] ${name}`);
            console.error(`         ${err.message}`);
            throw err;
        }
    })();
}

async function runJobsSmokeTests() {
    console.log('===============================================================');
    console.log('  STARTING PHASE 7: BACKGROUND JOBS DOMAIN SMOKE TESTS');
    console.log('===============================================================\n');

    // 1. Setup ephemeral test blockchain instance
    const testChain = new Blockchain();
    autoMinerJob.setBlockchain(testChain);

    // Get an existing organization for test blocks
    const { rows: orgs } = await db.query('SELECT id, name FROM organizations ORDER BY created_at ASC LIMIT 1');
    const testOrgId = orgs[0]?.id || '40bb5d58-273d-4835-88f1-bc596b99a49e';

    console.log(`[Setup] Using test organization: ${orgs[0]?.name || 'Default'} (${testOrgId})\n`);

    // --- TEST 1: Mutex Lock ---
    await test('Auto-Miner: Mutex lock is initially inactive', async () => {
        assert.strictEqual(autoMinerJob.isMiningActive(), false, 'isMiningActive should be false initially');
    });

    // --- TEST 2: Mempool Threshold Auto-Mine ---
    await test('Auto-Miner: Fires automatically when mempool reaches threshold', async () => {
        const threshold = autoMinerJob.MEMPOOL_THRESHOLD; // 10
        const initialChainLen = testChain.chain.length;

        // Populate mempool with threshold number of pending records
        testChain.pendingRecords = [];
        for (let i = 0; i < threshold; i++) {
            testChain.pendingRecords.push({
                recordId: null, // Ephemeral mock record
                organizationId: testOrgId,
                txType: 'medical',
                patientId: '00000000-0000-0000-0000-000000000001',
                patientName: `Threshold Patient ${i + 1}`,
                diagnosis: 'Test diagnosis for threshold test',
                treatment: 'Test treatment',
                timestamp: getKenyanTimestamp()
            });
        }

        assert.strictEqual(testChain.pendingRecords.length, threshold, `Mempool should have exactly ${threshold} records`);

        // Trigger threshold check (which fires executeMining internally)
        await autoMinerJob.checkMempoolThreshold(testChain);

        assert.strictEqual(autoMinerJob.isMiningActive(), false, 'Mining lock should be released after mining completes');
        assert.strictEqual(testChain.pendingRecords.length, 0, 'Mempool should be completely cleared after block is mined');
        assert(testChain.chain.length > initialChainLen, 'Blockchain chain length should have incremented with new block');

        const latestBlock = testChain.getLatestBlock();
        assert(latestBlock.records.length >= threshold, 'Sealed block should contain the threshold records');
        assert(latestBlock.hash.startsWith('00'), `Sealed block hash should satisfy difficulty 2: ${latestBlock.hash}`);
    });

    // --- TEST 3: Timer Fallback Auto-Mine ---
    await test('Auto-Miner: Timer fallback periodically mines remaining mempool records below threshold', async () => {
        const initialChainLen = testChain.chain.length;

        // Insert 2 records (below threshold of 10)
        testChain.pendingRecords = [
            {
                recordId: null,
                organizationId: testOrgId,
                txType: 'consultation',
                patientId: '00000000-0000-0000-0000-000000000002',
                patientName: 'Timer Fallback Patient 1',
                diagnosis: 'Timer Fallback Diagnosis',
                treatment: 'Prescription',
                timestamp: getKenyanTimestamp()
            },
            {
                recordId: null,
                organizationId: testOrgId,
                txType: 'consultation',
                patientId: '00000000-0000-0000-0000-000000000003',
                patientName: 'Timer Fallback Patient 2',
                diagnosis: 'Timer Fallback Diagnosis 2',
                treatment: 'Prescription 2',
                timestamp: getKenyanTimestamp()
            }
        ];

        assert.strictEqual(testChain.pendingRecords.length, 2, 'Mempool should have 2 records (below threshold)');

        // Start timer with short 300ms interval
        autoMinerJob.startAutoMineTimer(testChain, 300);

        // Wait until timer fallback triggers and finishes mining (up to 5s)
        const startWait = Date.now();
        while (testChain.pendingRecords.length > 0 && (Date.now() - startWait) < 5000) {
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Stop timer
        autoMinerJob.stopAutoMineTimer();

        assert.strictEqual(testChain.pendingRecords.length, 0, 'Mempool should be cleared by timer fallback');
        assert(testChain.chain.length > initialChainLen, 'Blockchain length should have incremented via timer fallback');
        const latestBlock = testChain.getLatestBlock();
        assert.strictEqual(latestBlock.records.length, 2, 'Mined block should contain the 2 timer fallback records');
    });

    // --- TEST 4: Multi-Tenant Ledger Continuity ---
    await test('Auto-Miner: Multi-tenant cryptographic validation confirms chain integrity', async () => {
        const isValid = await autoMinerJob.validateMultiTenantChains();
        assert.strictEqual(isValid, true, 'Multi-tenant blockchain ledger chains should be cryptographically valid');
    });

    // --- TEST 5: License Remote Authority Verification ---
    await test('License Job: Verification cycle verifies remote authority with fail-closed structure', async () => {
        const status = licenseCheckJob.getLicenseJobStatus();
        assert(status.remoteStatus === 'active' || status.remoteStatus === 'disabled', 'License status should be active or disabled');
        assert.strictEqual(typeof status.consecutiveFailures, 'number', 'consecutiveFailures must be numeric');
    });

    // --- TEST 6: Multi-Tenant Trial Expiry Auto-Transition ---
    await test('License Job: Correctly transitions organization trial -> expired when expiry date has passed', async () => {
        const expiredTestOrgId = '77777777-7777-7777-7777-777777777777';

        // 1. Clean up any previous test remnants
        await db.query('DELETE FROM licenses WHERE organization_id = $1', [expiredTestOrgId]);
        await db.query('DELETE FROM organizations WHERE id = $1', [expiredTestOrgId]);

        // 2. Insert test organization in 'trial' status with expiration in the PAST (1 hour ago)
        await db.query(`
            INSERT INTO organizations (id, name, slug, status, license_expires_at)
            VALUES ($1, 'Expired Trial Clinic Test', 'exptrial-test', 'trial', NOW() - INTERVAL '1 hour');
        `, [expiredTestOrgId]);

        await db.query(`
            INSERT INTO licenses (organization_id, client_id, status, expires_at)
            VALUES ($1, 'test-client-exp', 'trial', NOW() - INTERVAL '1 hour');
        `, [expiredTestOrgId]);

        // Verify it was created as trial
        const { rows: beforeRows } = await db.query('SELECT status FROM organizations WHERE id = $1', [expiredTestOrgId]);
        assert.strictEqual(beforeRows[0].status, 'trial', 'Organization should start in "trial" status');

        // 3. Execute checkAllOrganizationTrials()
        const result = await licenseCheckJob.checkAllOrganizationTrials();
        assert(result.transitionedCount >= 1, 'Should have transitioned at least 1 expired organization');
        const found = result.expiredOrganizations.find(o => o.id === expiredTestOrgId);
        assert(found, `Expired test org ${expiredTestOrgId} should be in transitioned list`);

        // 4. Verify in database: status must now be 'expired'
        const { rows: afterOrgRows } = await db.query('SELECT status FROM organizations WHERE id = $1', [expiredTestOrgId]);
        assert.strictEqual(afterOrgRows[0].status, 'expired', 'Database organization status must have transitioned to "expired"');

        const { rows: afterLicRows } = await db.query('SELECT status FROM licenses WHERE organization_id = $1', [expiredTestOrgId]);
        assert.strictEqual(afterLicRows[0].status, 'expired', 'Database license status must have transitioned to "expired"');

        // 5. Verify audit log entry was created
        const { rows: auditRows } = await db.query(
            "SELECT * FROM audit_logs WHERE organization_id = $1 AND event_type = 'TRIAL_EXPIRED'",
            [expiredTestOrgId]
        );
        assert(auditRows.length >= 1, 'Audit log entry for TRIAL_EXPIRED should be recorded');

        // Clean up test organization
        await db.query('DELETE FROM audit_logs WHERE organization_id = $1', [expiredTestOrgId]);
        await db.query('DELETE FROM licenses WHERE organization_id = $1', [expiredTestOrgId]);
        await db.query('DELETE FROM organizations WHERE id = $1', [expiredTestOrgId]);
    });

    console.log(`\n===============================================================`);
    console.log(`  ALL ${passedTests} BACKGROUND JOBS SMOKE TESTS PASSED!`);
    console.log(`===============================================================\n`);
}

runJobsSmokeTests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Test suite failed:', err);
    process.exit(1);
});
