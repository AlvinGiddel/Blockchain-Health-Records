process.env.VERCEL = '1';
const http = require('http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { generateKeyPair, Blockchain } = require('../blockchain');
const { encrypt, decrypt } = require('../utils/helpers');
const app = require('../server');
const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

async function runRecordsDomainTests() {
    console.log('======================================================');
    console.log('    RUNNING MEDICAL RECORDS & BLOCKCHAIN DOMAIN TESTS  ');
    console.log('======================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, testName, details = '') {
        if (condition) {
            console.log(`✅ [PASS] ${testName}`);
            passed++;
        } else {
            console.error(`❌ [FAIL] ${testName} -> ${details}`);
            failed++;
        }
    }

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
            }, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    let parsed;
                    try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
                    resolve({ status: res.statusCode, body: parsed });
                });
            });
            req.on('error', reject);
            if (options.body) req.write(JSON.stringify(options.body));
            req.end();
        });
    }

    // IDs for testing
    const { rows: firstOrg } = await db.query('SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1');
    const testOrgId = firstOrg[0]?.id;

    const patientId = crypto.randomUUID();
    const otherPatientId = crypto.randomUUID();
    const doctorId = crypto.randomUUID();
    const nonTreatingDoctorId = crypto.randomUUID();

    const { publicKey: docPubKey, privateKey: docPrivKey } = generateKeyPair();
    const { publicKey: nonDocPubKey, privateKey: nonDocPrivKey } = generateKeyPair();

    let createdRecordId = null;
    let minedBlockIndex = null;

    try {
        await db.query(`DELETE FROM users WHERE email IN ('doc_rec_test@hospital.com', 'doc_rec_test_2@hospital.com', 'patient_rec_test@hospital.com', 'patient_rec_test_2@hospital.com')`);

        // Setup Test Users individually to avoid param count mismatches
        await db.query(`
            INSERT INTO users (id, name, email, password, role, organization_id, is_approved, public_key, private_key)
            VALUES ($1, 'Dr. Records Tester', 'doc_rec_test@hospital.com', 'hash', 'doctor', $2, true, $3, $4)
            ON CONFLICT (id) DO NOTHING;
        `, [doctorId, testOrgId, docPubKey, docPrivKey]);

        await db.query(`
            INSERT INTO users (id, name, email, password, role, organization_id, is_approved, public_key, private_key)
            VALUES ($1, 'Dr. Non Treating', 'doc_non_treat@hospital.com', 'hash', 'doctor', $2, true, $3, $4)
            ON CONFLICT (id) DO NOTHING;
        `, [nonTreatingDoctorId, testOrgId, nonDocPubKey, nonDocPrivKey]);

        await db.query(`
            INSERT INTO users (id, name, email, password, role, organization_id, is_approved, public_key, private_key)
            VALUES ($1, 'Jane Test Patient', 'jane_patient@test.com', 'hash', 'patient', $2, true, 'pubKeyP1', 'privKeyP1')
            ON CONFLICT (id) DO NOTHING;
        `, [patientId, testOrgId]);

        await db.query(`
            INSERT INTO users (id, name, email, password, role, organization_id, is_approved, public_key, private_key)
            VALUES ($1, 'Other Test Patient', 'other_patient@test.com', 'hash', 'patient', $2, true, 'pubKeyP2', 'privKeyP2')
            ON CONFLICT (id) DO NOTHING;
        `, [otherPatientId, testOrgId]);

        const tokenDoc = jwt.sign({ id: doctorId, role: 'doctor', organization_id: testOrgId, organizationId: testOrgId }, JWT_SECRET);
        const tokenNonTreatingDoc = jwt.sign({ id: nonTreatingDoctorId, role: 'doctor', organization_id: testOrgId, organizationId: testOrgId }, JWT_SECRET);
        const tokenPatient = jwt.sign({ id: patientId, role: 'patient', organization_id: testOrgId, organizationId: testOrgId }, JWT_SECRET);
        const tokenOtherPatient = jwt.sign({ id: otherPatientId, role: 'patient', organization_id: testOrgId, organizationId: testOrgId }, JWT_SECRET);
        const tokenAdmin = jwt.sign({ id: crypto.randomUUID(), role: 'admin', organization_id: testOrgId, organizationId: testOrgId }, JWT_SECRET);


        // ==========================================
        // TEST 1: GET /api/blockchain/mempool
        // ==========================================
        const unauthMempoolRes = await request('/api/blockchain/mempool');
        assert(unauthMempoolRes.status === 401, 'GET /api/blockchain/mempool rejects unauthenticated requests with 401');

        const mempoolRes = await request('/api/blockchain/mempool', {
            headers: { Authorization: `Bearer ${tokenAdmin}` }
        });
        assert(mempoolRes.status === 200 && Array.isArray(mempoolRes.body), 'GET /api/blockchain/mempool returns array for admin', JSON.stringify(mempoolRes.body));

        // ==========================================
        // TEST 2: POST /api/records - Treating Relationship Check
        // ==========================================
        // Attempt without treating relationship or break-glass -> should be 403
        const unauthorizedRecRes = await request('/api/records', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenNonTreatingDoc}` },
            body: {
                patientId,
                doctorId: nonTreatingDoctorId,
                diagnosis: 'Hypertension',
                treatment: 'Lisinopril 10mg daily',
                prescriptions: ['Lisinopril 10mg']
            }
        });
        assert(
            unauthorizedRecRes.status === 403,
            'POST /api/records rejects non-treating doctor with 403',
            `Expected 403, got ${unauthorizedRecRes.status}: ${JSON.stringify(unauthorizedRecRes.body)}`
        );

        // Now create a confirmed appointment establishing treating relationship with doctorId
        const apptId = crypto.randomUUID();
        await db.query(`
            INSERT INTO appointments (id, organization_id, patient_id, patient_name, doctor_id, doctor_name, date, time, status, reason)
            VALUES ($1, $2, $3, 'Jane Test Patient', $4, 'Dr. Records Tester', CURRENT_DATE, '10:00', 'Confirmed', 'Routine consultation')
        `, [apptId, testOrgId, patientId, doctorId]);



        // Attempt again with treating doctor -> should succeed (201)
        const createRecRes = await request('/api/records', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenDoc}` },
            body: {
                patientId,
                doctorId,
                diagnosis: 'Acute Bronchitis',
                treatment: 'Amoxicillin 500mg TDS for 7 days',
                prescriptions: ['Amoxicillin 500mg']
            }
        });
        assert(
            createRecRes.status === 201 && createRecRes.body?.record?.id,
            'POST /api/records succeeds for treating doctor',
            `Status: ${createRecRes.status}, Body: ${JSON.stringify(createRecRes.body)}`
        );
        createdRecordId = createRecRes.body?.record?.id;

        // Verify record in PostgreSQL is stored with AES encrypted diagnosis/treatment
        const { rows: dbRows } = await db.query('SELECT diagnosis, treatment FROM records WHERE id = $1', [createdRecordId]);
        assert(
            dbRows.length > 0 && dbRows[0].diagnosis.includes(':') && decrypt(dbRows[0].diagnosis) === 'Acute Bronchitis',
            'Record diagnosis is stored encrypted in PostgreSQL (AES-256-CBC)',
            `Raw DB diagnosis: ${dbRows[0]?.diagnosis}`
        );

        // ==========================================
        // TEST 3: GET /api/records/patient/:id Access Controls
        // ==========================================
        // Patient viewing own records -> 200
        const patientOwnRes = await request(`/api/records/patient/${patientId}`, {
            headers: { Authorization: `Bearer ${tokenPatient}` }
        });
        assert(
            patientOwnRes.status === 200 && Array.isArray(patientOwnRes.body) && patientOwnRes.body.length > 0 && patientOwnRes.body[0].diagnosis === 'Acute Bronchitis',
            'GET /api/records/patient/:id allows patient to view own decrypted records',
            JSON.stringify(patientOwnRes.body)
        );

        // Patient viewing another patient's records -> 403
        const patientOtherRes = await request(`/api/records/patient/${patientId}`, {
            headers: { Authorization: `Bearer ${tokenOtherPatient}` }
        });
        assert(
            patientOtherRes.status === 403,
            'GET /api/records/patient/:id rejects patient viewing other patient with 403',
            JSON.stringify(patientOtherRes.body)
        );

        // Treating doctor viewing patient records -> 200
        const docPatientRes = await request(`/api/records/patient/${patientId}`, {
            headers: { Authorization: `Bearer ${tokenDoc}` }
        });
        assert(
            docPatientRes.status === 200 && Array.isArray(docPatientRes.body),
            'GET /api/records/patient/:id allows treating doctor access',
            JSON.stringify(docPatientRes.body)
        );

        // Non-treating doctor without break-glass -> 403
        const nonDocPatientRes = await request(`/api/records/patient/${patientId}`, {
            headers: { Authorization: `Bearer ${tokenNonTreatingDoc}` }
        });
        assert(
            nonDocPatientRes.status === 403,
            'GET /api/records/patient/:id rejects non-treating doctor with 403',
            JSON.stringify(nonDocPatientRes.body)
        );

        // ==========================================
        // TEST 4: POST /api/records/:id/specialist-note
        // ==========================================
        const noteRes = await request(`/api/records/${createdRecordId}/specialist-note`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenDoc}` },
            body: {
                specialistDoctorId: doctorId,
                specialistDoctorName: 'Dr. Records Tester',
                specialistNote: 'Patient advised to rest and maintain hydration.'
            }
        });
        assert(
            noteRes.status === 200 && noteRes.body?.success === true,
            'POST /api/records/:id/specialist-note attaches note',
            JSON.stringify(noteRes.body)
        );

        // ==========================================
        // TEST 5: POST /api/blockchain/mine
        // ==========================================
        const mineRes = await request('/api/blockchain/mine', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenAdmin}` }
        });
        assert(
            mineRes.status === 200 && mineRes.body?.block,
            'POST /api/blockchain/mine seals pending records into a new block',
            JSON.stringify(mineRes.body)
        );
        minedBlockIndex = mineRes.body?.block?.index;

        // ==========================================
        // TEST 6: GET /api/blockchain/blocks
        // ==========================================
        const blocksRes = await request('/api/blockchain/blocks');
        assert(
            blocksRes.status === 200 && Array.isArray(blocksRes.body) && blocksRes.body.length > 0,
            'GET /api/blockchain/blocks returns block list',
            `Count: ${blocksRes.body?.length}`
        );

        // ==========================================
        // TEST 7: POST /api/records/verify-seal
        // ==========================================
        const sealRes = await request('/api/records/verify-seal', {
            method: 'POST',
            body: { recordId: createdRecordId }
        });
        assert(
            sealRes.status === 200 && sealRes.body?.isVerified === true && sealRes.body?.isMined === true,
            'POST /api/records/verify-seal verifies mined cryptographic seal',
            JSON.stringify(sealRes.body)
        );

        // ==========================================
        // TEST 8: GET /api/records/:id/verify-blockchain (Public QR Proof)
        // ==========================================
        const qrProofRes = await request(`/api/records/${createdRecordId}/verify-blockchain`);
        assert(
            qrProofRes.status === 200 && qrProofRes.body?.verified === true && qrProofRes.body?.signatureValid === true && qrProofRes.body?.blockchainSealStatus === 'IMMUTABLE_MINED_ON_CHAIN',
            'GET /api/records/:id/verify-blockchain verifies public QR cryptographic proof',
            JSON.stringify(qrProofRes.body)
        );

        // ==========================================
        // TEST 9: GET /api/blockchain/validate (Initial Clean State)
        // ==========================================
        const initialValRes = await request('/api/blockchain/validate', {
            headers: { 'x-organization-id': testOrgId }
        });
        assert(
            initialValRes.status === 200 && initialValRes.body?.isValid === true,
            'GET /api/blockchain/validate confirms valid SHA-256 chain integrity initially',
            JSON.stringify(initialValRes.body)
        );

        // ==========================================
        // TEST 10: TAMPER & RECOVER SECURITY SAFEGUARDS & SIMULATION
        // ==========================================
        console.log('\n--- Running Tamper and Recover Security Tests ---');

        const superAdminToken = jwt.sign({ id: 'sa-001', role: 'super_admin' }, JWT_SECRET, { expiresIn: '1h' });
        const doctorToken = jwt.sign({ id: doctorId, role: 'doctor' }, JWT_SECRET, { expiresIn: '1h' });

        // Step 1: Reject unauthenticated tampering requests (401)
        const noAuthTamperRes = await request('/api/blockchain/tamper', {
            method: 'POST',
            body: {
                recordId: createdRecordId,
                tamperedDiagnosis: 'UNAUTHORIZED HACK'
            }
        });
        assert(
            noAuthTamperRes.status === 401,
            'POST /api/blockchain/tamper rejects unauthenticated requests with 401',
            JSON.stringify(noAuthTamperRes.body)
        );

        // Step 2: Reject non-super_admin role (e.g. doctor) tampering requests (403)
        const doctorTamperRes = await request('/api/blockchain/tamper', {
            method: 'POST',
            headers: { Authorization: `Bearer ${doctorToken}` },
            body: {
                recordId: createdRecordId,
                tamperedDiagnosis: 'DOCTOR HACK'
            }
        });
        assert(
            doctorTamperRes.status === 403,
            'POST /api/blockchain/tamper rejects non-super_admin requests with 403',
            JSON.stringify(doctorTamperRes.body)
        );

        // Step 3: CRITICAL DEMO-DATA SAFEGUARD: Reject tampering with real patient records even by Super Admin (403)
        const realRecordTamperRes = await request('/api/blockchain/tamper', {
            method: 'POST',
            headers: { Authorization: `Bearer ${superAdminToken}` },
            body: {
                recordId: createdRecordId, // This is a real patient record (is_demo_data = false)
                tamperedDiagnosis: 'ATTEMPT ON REAL RECORD'
            }
        });
        assert(
            realRecordTamperRes.status === 403 && realRecordTamperRes.body?.error?.includes('designated demo records'),
            'POST /api/blockchain/tamper rejects tampering with real patient records (demo data safeguard)',
            JSON.stringify(realRecordTamperRes.body)
        );

        // Step 4: Verify GET /api/blockchain/demo-records returns designated demo records
        const demoRecordsRes = await request('/api/blockchain/demo-records', {
            headers: { Authorization: `Bearer ${superAdminToken}` }
        });
        assert(
            demoRecordsRes.status === 200 && Array.isArray(demoRecordsRes.body) && demoRecordsRes.body.length > 0,
            'GET /api/blockchain/demo-records returns designated simulation demo records',
            `Count: ${demoRecordsRes.body?.length}`
        );
        const demoTargetRecord = demoRecordsRes.body.find(r => r.is_mined) || demoRecordsRes.body[0];

        // Step 5: Authorized Super Admin tampering on designated demo record succeeds (200)
        const superAdminTamperRes = await request('/api/blockchain/tamper', {
            method: 'POST',
            headers: { Authorization: `Bearer ${superAdminToken}` },
            body: {
                recordId: demoTargetRecord.id,
                tamperedDiagnosis: 'SIMULATED DEMO CORRUPTED DIAGNOSIS'
            }
        });
        assert(
            superAdminTamperRes.status === 200 && superAdminTamperRes.body?.success === true,
            'POST /api/blockchain/tamper succeeds for Super Admin on designated demo record',
            JSON.stringify(superAdminTamperRes.body)
        );

        // Step 6: Verify unauthorized recovery is rejected (401 without token, 403 with doctor token)
        const noAuthRecoverRes = await request('/api/blockchain/recover', { method: 'POST' });
        assert(
            noAuthRecoverRes.status === 401,
            'POST /api/blockchain/recover rejects unauthenticated requests with 401',
            JSON.stringify(noAuthRecoverRes.body)
        );

        const doctorRecoverRes = await request('/api/blockchain/recover', {
            method: 'POST',
            headers: { Authorization: `Bearer ${doctorToken}` }
        });
        assert(
            doctorRecoverRes.status === 403,
            'POST /api/blockchain/recover rejects non-super_admin requests with 403',
            JSON.stringify(doctorRecoverRes.body)
        );

        // Step 7: Authorized Super Admin recovery succeeds (200)
        const superAdminRecoverRes = await request('/api/blockchain/recover', {
            method: 'POST',
            headers: { Authorization: `Bearer ${superAdminToken}` }
        });
        assert(
            superAdminRecoverRes.status === 200 && superAdminRecoverRes.body?.success === true,
            'POST /api/blockchain/recover succeeds for Super Admin restoring ledger integrity',
            JSON.stringify(superAdminRecoverRes.body)
        );

        // Step 8: Verify chain validation confirms valid integrity
        const finalValRes = await request('/api/blockchain/validate', {
            headers: { 'x-organization-id': testOrgId }
        });
        assert(
            finalValRes.status === 200 && finalValRes.body?.isValid === true,
            'GET /api/blockchain/validate confirms ledger integrity is fully valid after self-healing',
            JSON.stringify(finalValRes.body)
        );

    } finally {
        // Cleanup test data
        console.log('\nCleaning up test data...');
        if (createdRecordId) {
            await db.query('DELETE FROM records WHERE id = $1', [createdRecordId]);
        }
        await db.query('DELETE FROM blocks WHERE organization_id = $1', [testOrgId]);
        await db.query('DELETE FROM appointments WHERE patient_id = $1', [patientId]);
        await db.query('DELETE FROM audit_logs WHERE patient_id = $1', [patientId]);
        await db.query('DELETE FROM users WHERE id IN ($1, $2, $3, $4)', [doctorId, nonTreatingDoctorId, patientId, otherPatientId]);
        await db.query('DELETE FROM organizations WHERE id = $1', [testOrgId]);
        server.close();
    }

    console.log('\n======================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================');

    if (failed > 0) {
        process.exit(1);
    }
    process.exit(0);
}

runRecordsDomainTests().catch(err => {
    console.error('Test runner fatal error:', err);
    process.exit(1);
});
