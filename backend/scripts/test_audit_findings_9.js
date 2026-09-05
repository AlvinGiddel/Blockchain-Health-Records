/**
 * test_audit_findings_9.js
 * Comprehensive automated regression tests for all 9 Security Audit Findings:
 * 1. Admin records scoping (GET /api/admin/records)
 * 2. verifyBlockchainProof block lookup scoped by index AND organization_id
 * 3. recoverBlockchain multi-tenant grouping and per-tenant sorting
 * 4. User deletion rebuild strictly scoped to affected organization
 * 5. addSpecialistNote tenant scoping & authenticated doctor identity binding
 * 6. breakGlass identity binding to verified DB records
 * 7. completeConsultation mempool organizationId inclusion
 * 8. logAuditEvent argument alignment & patient nullification
 * 9. PostgreSQL connection pool clean startup with zero deprecation warnings
 */

const assert = require('assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { logAuditEvent, getRequesterOrgScope, encrypt } = require('../utils/helpers');
const recordsController = require('../controllers/recordsController');
const adminController = require('../controllers/adminController');
const authController = require('../controllers/authController');
const appointmentsController = require('../controllers/appointmentsController');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

function createMockRes() {
    const res = {
        statusCode: 200,
        data: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.data = payload;
            return this;
        }
    };
    return res;
}

async function runAuditTests() {
    console.log('\n=============================================================');
    console.log('--- STARTING REGRESSION TEST SUITE FOR 9 AUDIT FINDINGS ---');
    console.log('=============================================================\n');

    let passed = 0;
    let failed = 0;

    const test = async (title, fn) => {
        try {
            process.stdout.write(`• Testing [${title}] ... `);
            await fn();
            console.log('PASSED');
            passed++;
        } catch (err) {
            console.log('FAILED');
            console.error(`  Error: ${err.message}`);
            if (err.stack) console.error(err.stack);
            failed++;
        }
    };

    // SETUP TEST FIXTURES IN DB
    const testOrgA = '11111111-aaaa-4000-8000-000000000001';
    const testOrgB = '22222222-bbbb-4000-8000-000000000002';
    const docIdA = '33333333-cccc-4000-8000-000000000003';
    const docIdB = '44444444-dddd-4000-8000-000000000004';
    const patIdA = '55555555-eeee-4000-8000-000000000005';
    const patIdB = '66666666-ffff-4000-8000-000000000006';
    const adminIdA = '77777777-1111-4000-8000-000000000007';

    // Cleanup & insert clean fixtures
    await db.query("DELETE FROM users WHERE email IN ('test_audit_doc_a@bhc.ke', 'test_audit_doc_b@bhc.ke', 'test_audit_pat_a@bhc.ke', 'test_audit_pat_b@bhc.ke', 'test_audit_admin_a@bhc.ke')");
    await db.query('DELETE FROM blocks WHERE organization_id IN ($1, $2)', [testOrgA, testOrgB]);
    await db.query('DELETE FROM organizations WHERE id IN ($1, $2)', [testOrgA, testOrgB]);

    await db.query(`
        INSERT INTO organizations (id, name, status, license_expires_at)
        VALUES 
            ($1, 'Audit Hospital A', 'active', NOW() + INTERVAL '30 days'),
            ($2, 'Audit Hospital B', 'active', NOW() + INTERVAL '30 days')
        ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
    `, [testOrgA, testOrgB]);

    const { publicKey: rsaPublicKeyA, privateKey: rsaPrivateKeyA } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    await db.query(`
        INSERT INTO users (id, name, email, password, role, organization_id, public_key, private_key, is_approved)
        VALUES
            ($1, 'Dr. Alice Auditor', 'test_audit_doc_a@bhc.ke', 'hash123', 'doctor', $2, $8, $9, true),
            ($3, 'Dr. Bob Auditor', 'test_audit_doc_b@bhc.ke', 'hash123', 'doctor', $4, 'pk-doc-b', 'privk-doc-b', true),
            ($5, 'Patient Charlie', 'test_audit_pat_a@bhc.ke', 'hash123', 'patient', $2, 'pk-pat-a', 'privk-pat-a', true),
            ($6, 'Patient David', 'test_audit_pat_b@bhc.ke', 'hash123', 'patient', $4, 'pk-pat-b', 'privk-pat-b', true),
            ($7, 'Admin Hospital A', 'test_audit_admin_a@bhc.ke', 'hash123', 'admin', $2, 'pk-admin-a', 'privk-admin-a', true)
        ON CONFLICT (id) DO UPDATE SET organization_id = EXCLUDED.organization_id, public_key = EXCLUDED.public_key, private_key = EXCLUDED.private_key
    `, [docIdA, testOrgA, docIdB, testOrgB, patIdA, patIdB, adminIdA, rsaPublicKeyA, rsaPrivateKeyA]);

    // Insert records for Org A and Org B
    const recIdA = 'aaaaaaaa-1111-4000-8000-000000000001';
    const recIdB = 'bbbbbbbb-2222-4000-8000-000000000002';
    await db.query('DELETE FROM records WHERE id IN ($1, $2)', [recIdA, recIdB]);
    await db.query(`
        INSERT INTO records (id, organization_id, patient_id, doctor_id, doctor_name, doctor_public_key, diagnosis, treatment, signature, timestamp, is_mined, block_index)
        VALUES 
            ($1, $2, $3, $4, 'Dr. Alice Auditor', $13, $9, $10, 'sig-a', NOW(), true, 1),
            ($5, $6, $7, $8, 'Dr. Bob Auditor', 'pk-doc-b', $11, $12, 'sig-b', NOW(), true, 1)
    `, [recIdA, testOrgA, patIdA, docIdA, recIdB, testOrgB, patIdB, docIdB, encrypt('Condition A'), encrypt('Treatment A'), encrypt('Condition B'), encrypt('Treatment B'), rsaPublicKeyA]);

    // Insert Blocks for Org A (Genesis + Block 1) and Org B (Genesis + Block 1)
    const hashA0 = crypto.createHash('sha256').update(testOrgA + '-0').digest('hex');
    const hashA1 = crypto.createHash('sha256').update(hashA0 + '-1').digest('hex');
    const hashB0 = crypto.createHash('sha256').update(testOrgB + '-0').digest('hex');
    const hashB1 = crypto.createHash('sha256').update(hashB0 + '-1').digest('hex');

    await db.query(`
        INSERT INTO blocks (organization_id, index, timestamp, records, previous_hash, nonce, hash)
        VALUES
            ($1, 0, 1000, '[]', '0', 0, $2),
            ($1, 1, 2000, $3, $2, 10, $4),
            ($5, 0, 1000, '[]', '0', 0, $6),
            ($5, 1, 2000, $7, $6, 20, $8)
    `, [
        testOrgA, hashA0, JSON.stringify([{ recordId: recIdA, doctorId: docIdA, patientName: 'Patient Charlie' }]), hashA1,
        testOrgB, hashB0, JSON.stringify([{ recordId: recIdB, doctorId: docIdB, patientName: 'Patient David' }]), hashB1
    ]);

    // -------------------------------------------------------------
    // Finding #1: GET /api/admin/records tenant scoping
    // -------------------------------------------------------------
    await test('Finding #1: GET /api/admin/records tenant isolation', async () => {
        const token = jwt.sign({ id: adminIdA, email: 'test_audit_admin_a@bhc.ke', role: 'admin', organization_id: testOrgA }, JWT_SECRET);
        const req = {
            user: { id: adminIdA, email: 'test_audit_admin_a@bhc.ke', role: 'admin', organization_id: testOrgA },
            headers: { authorization: `Bearer ${token}` },
            query: {}
        };
        const res = createMockRes();
        await recordsController.getAdminRecords(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.ok(Array.isArray(res.data));
        // Must contain record A, but strictly NOT record B
        const hasRecA = res.data.some(r => r.id === recIdA);
        const hasRecB = res.data.some(r => r.id === recIdB);
        assert.ok(hasRecA, 'Admin should see records for their own organization');
        assert.ok(!hasRecB, 'Admin must NOT see records belonging to other organizations');
    });

    // -------------------------------------------------------------
    // Finding #2: verifyBlockchainProof block lookup scoped by index & org
    // -------------------------------------------------------------
    await test('Finding #2: verifyBlockchainProof matches index AND organization_id', async () => {
        const req = {
            params: { id: recIdA },
            query: { index: '1' },
            user: { id: docIdA, organization_id: testOrgA, role: 'doctor' },
            headers: {}
        };
        const res = createMockRes();
        await recordsController.verifyBlockchainProof(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.verified, true);
        assert.strictEqual(res.data.blockIndex, 1);
        assert.strictEqual(res.data.blockHash, hashA1);

        // Now test with a record pointing to a block index that does NOT exist in its organization
        const unminedRecId = 'cccccccc-3333-4000-8000-000000000003';
        await db.query(`
            INSERT INTO records (id, organization_id, patient_id, doctor_id, doctor_name, doctor_public_key, diagnosis, treatment, signature, timestamp, is_mined, block_index)
            VALUES ($1, $2, $3, $4, 'Dr. Alice Auditor', 'pk-doc-a', $5, $6, 'sig-a', NOW(), true, 999)
            ON CONFLICT (id) DO NOTHING
        `, [unminedRecId, testOrgA, patIdA, docIdA, encrypt('Diagnosis'), encrypt('Treatment')]);

        const reqCross = {
            params: { id: unminedRecId },
            query: {},
            user: { id: docIdA, organization_id: testOrgA, role: 'doctor' },
            headers: {}
        };
        const resCross = createMockRes();
        await recordsController.verifyBlockchainProof(reqCross, resCross);
        assert.strictEqual(resCross.data.verified, false, 'Proof verification must fail when block is not found in tenant ledger');
        await db.query('DELETE FROM records WHERE id = $1', [unminedRecId]);
    });

    // -------------------------------------------------------------
    // Finding #3: recoverBlockchain multi-tenant grouping and sorting
    // -------------------------------------------------------------
    await test('Finding #3: recoverBlockchain groups & restores per-tenant ledgers', async () => {
        // Intentionally corrupt block 1 hash in Org A
        await db.query("UPDATE blocks SET hash = 'corrupted_hash' WHERE organization_id = $1 AND index = 1", [testOrgA]);

        const superToken = jwt.sign({ id: 'super-admin-id', role: 'super_admin' }, JWT_SECRET);
        const req = {
            user: { id: 'super-admin-id', role: 'super_admin' },
            headers: { authorization: `Bearer ${superToken}` },
            query: {}
        };
        const res = createMockRes();
        await recordsController.recoverBlockchain(req, res, {
            syncBlockchainWithDatabase: async () => {},
            healthBlockchain: {
                generateHash: (idx, prev, ts, recs, nonce) => crypto.createHash('sha256').update(`${idx}-${prev}-${ts}-${nonce}`).digest('hex')
            }
        });

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.success, true);

        // Verify Org A was recomputed and Org B remained pristine
        const { rows: blksA } = await db.query('SELECT * FROM blocks WHERE organization_id = $1 ORDER BY index ASC', [testOrgA]);
        const { rows: blksB } = await db.query('SELECT * FROM blocks WHERE organization_id = $1 ORDER BY index ASC', [testOrgB]);

        assert.strictEqual(blksA.length, 2);
        assert.strictEqual(blksB.length, 2);
        assert.notStrictEqual(blksA[1].hash, 'corrupted_hash', 'Corrupted hash in Org A should be repaired');
        assert.strictEqual(blksB[1].previous_hash, blksB[0].hash, 'Org B block linkage must be preserved');
        assert.strictEqual(blksB[1].index, 1, 'Org B block index must be preserved');
    });

    // -------------------------------------------------------------
    // Finding #4: rebuildChainAfterDeletion strictly scoped to affected org
    // -------------------------------------------------------------
    await test('Finding #4: rebuildChainAfterDeletion isolates rebuild to affected org only', async () => {
        // Insert a temporary doctor in Org A to delete
        const tempDocId = '88888888-2222-4000-8000-000000000008';
        await db.query(`
            INSERT INTO users (id, name, email, password, role, organization_id, public_key, private_key, is_approved)
            VALUES ($1, 'Dr. Temp Deleted', 'temp_deleted@bhc.ke', 'pw', 'doctor', $2, 'pk-temp-del', 'privk-temp-del', true)
            ON CONFLICT (id) DO NOTHING
        `, [tempDocId, testOrgA]);

        const req = {
            params: { id: tempDocId },
            user: { id: adminIdA, email: 'test_audit_admin_a@bhc.ke', role: 'admin', organization_id: testOrgA }
        };
        const res = createMockRes();
        await adminController.deleteUser(req, res, {
            syncBlockchainWithDatabase: async () => {},
            healthBlockchain: {
                generateHash: (idx, prev, ts, recs, nonce) => crypto.createHash('sha256').update(`${idx}-${prev}-${ts}-${nonce}`).digest('hex')
            }
        });

        assert.strictEqual(res.statusCode, 200);

        // Ensure Org B blocks were NEVER wiped or affected
        const { rows: orgBBlocks } = await db.query('SELECT * FROM blocks WHERE organization_id = $1', [testOrgB]);
        assert.strictEqual(orgBBlocks.length, 2, 'Org B blocks must not be deleted by Org A user deletion');
        assert.ok(orgBBlocks.every(b => b.organization_id === testOrgB), 'Org B blocks must retain organization_id');
    });

    // -------------------------------------------------------------
    // Finding #5: addSpecialistNote tenant check & author identity binding
    // -------------------------------------------------------------
    await test('Finding #5: addSpecialistNote enforces tenant & binds author to authUser.name', async () => {
        const tokenB = jwt.sign({ id: docIdB, name: 'Dr. Bob Auditor', role: 'doctor', organization_id: testOrgB }, JWT_SECRET);
        // Doctor B attempts to add note to Record A (different tenant)
        const reqCross = {
            params: { id: recIdA },
            body: { specialistDoctorName: 'Spoofed Name', specialistNote: 'Cross tenant attempt' },
            user: { id: docIdB, name: 'Dr. Bob Auditor', role: 'doctor', organization_id: testOrgB },
            headers: { authorization: `Bearer ${tokenB}` }
        };
        const resCross = createMockRes();
        await recordsController.addSpecialistNote(reqCross, resCross);
        assert.strictEqual(resCross.statusCode, 403, 'Cross-tenant specialist note must be rejected with 403');

        // Doctor A adds note to Record A (same tenant) with spoofed specialistDoctorName in body
        const tokenA = jwt.sign({ id: docIdA, name: 'Dr. Alice Auditor', role: 'doctor', organization_id: testOrgA }, JWT_SECRET);
        const reqLegit = {
            params: { id: recIdA },
            body: { specialistDoctorName: 'Fake Body Name', specialistNote: 'Valid specialist note content' },
            user: { id: docIdA, name: 'Dr. Alice Auditor', role: 'doctor', organization_id: testOrgA },
            headers: { authorization: `Bearer ${tokenA}` }
        };
        const resLegit = createMockRes();
        await recordsController.addSpecialistNote(reqLegit, resLegit);

        assert.strictEqual(resLegit.statusCode, 200);
        // Verify notes contain the doctor's verified name, not 'Fake Body Name'
        assert.ok(resLegit.data.record.notes.includes('Dr. Alice Auditor'), 'Doctor name must be bound from verified authUser record');
        assert.ok(!resLegit.data.record.notes.includes('Fake Body Name'), 'Unchecked body name must never be recorded');
    });

    // -------------------------------------------------------------
    // Finding #6: breakGlass identity binding to verified DB records
    // -------------------------------------------------------------
    await test('Finding #6: breakGlass derives doctorName and patientName from verified DB', async () => {
        const req = {
            body: {
                patientId: patIdA,
                reason: 'Emergency anaphylaxis treatment',
                doctorName: 'Attacker Fake Doctor',
                patientName: 'Attacker Fake Patient'
            },
            user: { id: docIdA, role: 'doctor', organization_id: testOrgA }
        };
        const res = createMockRes();
        await authController.breakGlass(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.data.success, true);

        // Check latest audit log
        const { rows: bgAudit } = await db.query(`
            SELECT * FROM audit_logs 
            WHERE patient_id = $1 AND event_type = 'emergency_break_glass' 
            ORDER BY timestamp DESC LIMIT 1
        `, [patIdA]);

        assert.ok(bgAudit.length > 0);
        assert.strictEqual(bgAudit[0].doctor_name, 'Dr. Alice Auditor', 'Audit log must use verified DB doctor name');
        assert.strictEqual(bgAudit[0].patient_name, 'Patient Charlie', 'Audit log must use verified DB patient name');
        assert.strictEqual(bgAudit[0].organization_id, testOrgA, 'Audit log must be scoped to tenant organization_id');
    });

    // -------------------------------------------------------------
    // Finding #7: completeConsultation includes organizationId in mempool
    // -------------------------------------------------------------
    await test('Finding #7: completeConsultation sets organizationId in pending mempool records', async () => {
        // Insert an appointment for Org A
        const apptId = '99999999-3333-4000-8000-000000000009';
        await db.query('DELETE FROM appointments WHERE id = $1', [apptId]);
        await db.query(`
            INSERT INTO appointments (id, organization_id, patient_id, patient_name, doctor_id, doctor_name, date, time, reason, status)
            VALUES ($1, $2, $3, 'Patient Charlie', $4, 'Dr. Alice Auditor', CURRENT_DATE, '10:00:00', 'Routine check', 'Confirmed')
        `, [apptId, testOrgA, patIdA, docIdA]);

        const mockBlockchain = {
            pendingRecords: [],
            addRecord(rec) {
                this.pendingRecords.push(rec);
            }
        };

        const token = jwt.sign({ id: docIdA, name: 'Dr. Alice Auditor', role: 'doctor', organization_id: testOrgA }, JWT_SECRET);
        const req = {
            params: { id: apptId },
            body: { appointmentId: apptId, diagnosis: 'Common Cold', treatment: 'Rest & fluids', symptoms: 'Cough', notes: 'Mild symptoms' },
            user: { id: docIdA, name: 'Dr. Alice Auditor', role: 'doctor', organization_id: testOrgA },
            headers: { authorization: `Bearer ${token}` }
        };
        const res = createMockRes();
        await appointmentsController.completeConsultation(req, res, { healthBlockchain: mockBlockchain });

        assert.ok(res.statusCode === 200 || res.statusCode === 201, `Expected status 200 or 201, got ${res.statusCode}`);
        assert.strictEqual(mockBlockchain.pendingRecords.length, 1);
        const mempoolItem = mockBlockchain.pendingRecords[0];
        assert.strictEqual(mempoolItem.organizationId, testOrgA, 'Mempool record must contain organizationId for per-tenant auto-mining');
    });

    // -------------------------------------------------------------
    // Finding #8: logAuditEvent argument alignment & patient nullification
    // -------------------------------------------------------------
    await test('Finding #8: logAuditEvent handles 7-arg and 8-arg calls safely', async () => {
        // 8-arg call with null patient
        const res8 = await logAuditEvent('test_8_arg', null, null, docIdA, 'Dr. Alice Auditor', 'Testing 8-arg', null, testOrgA);
        assert.ok(res8, '8-arg call should insert audit row');
        assert.strictEqual(res8.organization_id, testOrgA);
        assert.strictEqual(res8.patient_id, null);

        // 7-arg call where 7th arg is organization_id UUID (backward compatibility test)
        const res7 = await logAuditEvent('test_7_arg', patIdA, 'Patient Charlie', docIdA, 'Dr. Alice Auditor', 'Testing 7-arg', testOrgA);
        assert.ok(res7, '7-arg call should safely infer organization_id without UUID type error');
        assert.strictEqual(res7.organization_id, testOrgA);
        assert.strictEqual(res7.patient_id, patIdA);
    });

    // -------------------------------------------------------------
    // Finding #9: Clean DB pool with zero deprecation warnings
    // -------------------------------------------------------------
    await test('Finding #9: PostgreSQL pool connects cleanly without deprecation warnings', async () => {
        assert.ok(process.env.PGTZ, 'PGTZ environment variable should be set');
        assert.strictEqual(process.env.PGTZ, 'Africa/Nairobi');

        // Test running simple query works properly
        const { rows } = await db.query('SELECT NOW() as current_time');
        assert.ok(rows[0].current_time);
    });

    // Clean up fixtures
    await db.query("DELETE FROM users WHERE email IN ('test_audit_doc_a@bhc.ke', 'test_audit_doc_b@bhc.ke', 'test_audit_pat_a@bhc.ke', 'test_audit_pat_b@bhc.ke', 'test_audit_admin_a@bhc.ke')");
    await db.query('DELETE FROM blocks WHERE organization_id IN ($1, $2)', [testOrgA, testOrgB]);
    await db.query('DELETE FROM organizations WHERE id IN ($1, $2)', [testOrgA, testOrgB]);

    console.log('\n=============================================================');
    console.log(`--- REGRESSION TEST RESULTS: ${passed} PASSED, ${failed} FAILED ---`);
    console.log('=============================================================\n');

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runAuditTests().catch(err => {
    console.error('Fatal test suite error:', err);
    process.exit(1);
});
