/**
 * Integration Test Suite for Medical Records & Blockchain Domain
 */

const http = require('http');
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');
const createRecordsRouter = require('../routes/records');
const { Blockchain, generateKeyPair } = require('../blockchain');
const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

async function runRecordsTests() {
    console.log('======================================================');
    console.log('      RUNNING RECORDS & BLOCKCHAIN TEST SUITE         ');
    console.log('======================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, name, details = '') {
        if (condition) {
            console.log(`✅ [PASS] ${name}`);
            passed++;
        } else {
            console.error(`❌ [FAIL] ${name} -> ${details}`);
            failed++;
        }
    }

    const testOrgId = crypto.randomUUID();
    const patientId = crypto.randomUUID();
    const doctorId = crypto.randomUUID();
    const adminId = crypto.randomUUID();

    const orgName = 'Test Hospital Records ' + testOrgId.substring(0, 8);
    const orgSlug = 'test-records-' + testOrgId.substring(0, 8);

    const docKeys = generateKeyPair();
    const patKeys = generateKeyPair();

    // 1. Setup Test Fixtures
    await db.query(`
        INSERT INTO organizations (id, name, slug, status)
        VALUES ($1, $2, $3, 'active')
        ON CONFLICT (id) DO NOTHING;
    `, [testOrgId, orgName, orgSlug]);

    const docEmail = `doc_rec_${testOrgId.substring(0, 8)}@test.com`;
    const patEmail = `pat_rec_${testOrgId.substring(0, 8)}@test.com`;
    const adminEmail = `admin_rec_${testOrgId.substring(0, 8)}@test.com`;

    await db.query(`
        INSERT INTO users (id, name, email, password, role, organization_id, is_approved, public_key, private_key)
        VALUES 
            ($1, 'Dr. Records Tester', $11, 'hashed', 'doctor', $2, true, $3, $4),
            ($5, 'Patient Records Tester', $12, 'hashed', 'patient', $6, true, $7, $8),
            ($9, 'Admin Records Tester', $13, 'hashed', 'admin', $10, true, 'admin_pub', 'admin_priv')
        ON CONFLICT (id) DO NOTHING;
    `, [
        doctorId, testOrgId, docKeys.publicKey, docKeys.privateKey,
        patientId, testOrgId, patKeys.publicKey, patKeys.privateKey,
        adminId, testOrgId,
        docEmail, patEmail, adminEmail
    ]);

    // Active treating relationship via appointment
    await db.query(`
        INSERT INTO appointments (patient_id, doctor_id, patient_name, doctor_name, date, time, reason, status, created_at, organization_id)
        VALUES ($1, $2, 'Patient Records Tester', 'Dr. Records Tester', '2027-02-01', '10:00', 'Checkup', 'Confirmed', NOW(), $3)
    `, [patientId, doctorId, testOrgId]);

    const doctorToken = jwt.sign({ id: doctorId, name: 'Dr. Records Tester', role: 'doctor', organization_id: testOrgId }, JWT_SECRET);
    const patientToken = jwt.sign({ id: patientId, name: 'Patient Records Tester', role: 'patient', organization_id: testOrgId }, JWT_SECRET);
    const adminToken = jwt.sign({ id: adminId, name: 'Admin Records Tester', role: 'admin', organization_id: testOrgId }, JWT_SECRET);

    const app = express();
    app.use(express.json());

    const mockBlockchain = new Blockchain();
    app.use('/api', createRecordsRouter({
        healthBlockchain: mockBlockchain,
        checkMempoolThreshold: () => {}
    }));

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    function request(path, options = {}) {
        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port,
                path,
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(options.headers || {})
                }
            }, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(data) });
                    } catch (e) {
                        resolve({ status: res.statusCode, body: data });
                    }
                });
            });
            req.on('error', reject);
            if (options.body) req.write(JSON.stringify(options.body));
            req.end();
        });
    }

    let createdRecordId = null;

    try {
        // TEST 1: Create Medical Record
        console.log('--- TEST 1: Create Medical Record ---');
        const createRes = await request('/api/records', {
            method: 'POST',
            headers: { Authorization: `Bearer ${doctorToken}` },
            body: {
                patientId,
                diagnosis: 'Hypertension Stage 1',
                treatment: 'Lifestyle modification and medication',
                prescriptions: 'Lisinopril 10mg daily',
                ipfsHash: 'QmTestHash12345'
            }
        });
        assert(createRes.status === 201, 'Record creation returns HTTP 201');
        assert(createRes.body.record && createRes.body.record.id, 'Record created with valid ID');
        createdRecordId = createRes.body.record?.id;

        // TEST 2: Patient Retrieve Own Records
        console.log('\n--- TEST 2: Patient Retrieve Own Records ---');
        const patRes = await request(`/api/records/patient/${patientId}`, {
            headers: { Authorization: `Bearer ${patientToken}` }
        });
        assert(patRes.status === 200, 'Patient record retrieval returns HTTP 200');
        assert(Array.isArray(patRes.body) && patRes.body.length > 0, 'Patient receives records list');
        assert(patRes.body[0].diagnosis === 'Hypertension Stage 1', 'Diagnosis correctly decrypted');

        // TEST 3: Admin Scoped Records Retrieval
        console.log('\n--- TEST 3: Admin Scoped Records Retrieval ---');
        const adminRes = await request('/api/admin/records', {
            headers: { Authorization: `Bearer ${adminToken}` }
        });
        assert(adminRes.status === 200, 'Admin records retrieval returns HTTP 200');
        assert(Array.isArray(adminRes.body) && adminRes.body.length > 0, 'Admin receives scoped records');

        // TEST 4: Specialist Note Addition
        console.log('\n--- TEST 4: Add Specialist Note ---');
        const noteRes = await request(`/api/records/${createdRecordId}/specialist-note`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${doctorToken}` },
            body: { specialistNote: 'Patient advised to monitor blood pressure twice daily.' }
        });
        assert(noteRes.status === 200, 'Specialist note attached successfully');
        assert(noteRes.body.record && noteRes.body.record.notes.includes('blood pressure'), 'Note preserved in record');

        // TEST 5: Cryptographic Seal Verification
        console.log('\n--- TEST 5: Verify Record Seal ---');
        const sealRes = await request('/api/records/verify-seal', {
            method: 'POST',
            body: { recordId: createdRecordId }
        });
        assert(sealRes.status === 200, 'Record seal verification returns HTTP 200');
        assert(sealRes.body.isVerified === true, 'Cryptographic seal signature verified');

        // TEST 6: Non-Demo Tamper Protection Safeguard
        console.log('\n--- TEST 6: Tamper Safeguard on Real Patient Record ---');
        const superAdminToken = jwt.sign({ id: 'sa', name: 'SA', role: 'super_admin' }, JWT_SECRET);
        const tamperRes = await request('/api/blockchain/tamper', {
            method: 'POST',
            headers: { Authorization: `Bearer ${superAdminToken}` },
            body: { recordId: createdRecordId, tamperedDiagnosis: 'Malicious Diagnosis' }
        });
        assert(tamperRes.status === 403, 'Tampering with non-demo record strictly rejected with HTTP 403');

    } finally {
        server.close();
        if (testOrgId) {
            await db.query('DELETE FROM audit_logs WHERE organization_id = $1', [testOrgId]);
            await db.query('DELETE FROM records WHERE organization_id = $1', [testOrgId]);
            await db.query('DELETE FROM appointments WHERE organization_id = $1', [testOrgId]);
            await db.query('DELETE FROM users WHERE organization_id = $1', [testOrgId]);
            await db.query('DELETE FROM organizations WHERE id = $1', [testOrgId]);
        }
        if (db.pool && db.pool.end) await db.pool.end();
    }

    console.log('\n======================================================');
    console.log(`  RECORDS TEST FINISHED: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');
    process.exit(failed > 0 ? 1 : 0);
}

runRecordsTests().catch(err => {
    console.error('Records test suite error:', err);
    process.exit(1);
});
