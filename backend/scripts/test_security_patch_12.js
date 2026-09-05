process.env.VERCEL = '1';
const http = require('http');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { generateKeyPair } = require('../blockchain');
const app = require('../server');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

async function runSecurityPatchTests() {
    console.log('================================================================');
    console.log('       RUNNING COMPREHENSIVE SECURITY PATCH TEST (12 ENDPOINTS) ');
    console.log('================================================================\n');

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

    const { rows: orgs } = await db.query('SELECT id FROM organizations ORDER BY created_at ASC LIMIT 1');
    const testOrgId = orgs[0]?.id;

    // Create test identities
    const patientAId = crypto.randomUUID();
    const patientBId = crypto.randomUUID();
    const doctorAId = crypto.randomUUID();
    const doctorBId = crypto.randomUUID();
    const adminId = crypto.randomUUID();

    const { publicKey: docAPubKey, privateKey: docAPrivKey } = generateKeyPair();
    const { publicKey: docBPubKey, privateKey: docBPrivKey } = generateKeyPair();

    const tokenPatientA = jwt.sign({ id: patientAId, role: 'patient', organization_id: testOrgId, organizationId: testOrgId }, JWT_SECRET, { expiresIn: '1h' });
    const tokenPatientB = jwt.sign({ id: patientBId, role: 'patient', organization_id: testOrgId, organizationId: testOrgId }, JWT_SECRET, { expiresIn: '1h' });
    const tokenDoctorA = jwt.sign({ id: doctorAId, role: 'doctor', organization_id: testOrgId, organizationId: testOrgId }, JWT_SECRET, { expiresIn: '1h' });
    const tokenDoctorB = jwt.sign({ id: doctorBId, role: 'doctor', organization_id: testOrgId, organizationId: testOrgId }, JWT_SECRET, { expiresIn: '1h' });
    const tokenAdmin = jwt.sign({ id: adminId, role: 'admin', organization_id: testOrgId, organizationId: testOrgId }, JWT_SECRET, { expiresIn: '1h' });

    try {
        // Insert test actors individually into DB
        await db.query(`
            INSERT INTO users (id, name, email, password, role, organization_id, is_approved, public_key, private_key)
            VALUES ($1, 'Patient Alpha', 'patient_alpha@sec.com', 'hash', 'patient', $2, true, 'pKeyA', 'prKeyA')
            ON CONFLICT (id) DO NOTHING;
        `, [patientAId, testOrgId]);

        await db.query(`
            INSERT INTO users (id, name, email, password, role, organization_id, is_approved, public_key, private_key)
            VALUES ($1, 'Patient Beta', 'patient_beta@sec.com', 'hash', 'patient', $2, true, 'pKeyB', 'prKeyB')
            ON CONFLICT (id) DO NOTHING;
        `, [patientBId, testOrgId]);

        await db.query(`
            INSERT INTO users (id, name, email, password, role, organization_id, is_approved, public_key, private_key)
            VALUES ($1, 'Dr. Alpha', 'doc_alpha@sec.com', 'hash', 'doctor', $2, true, $3, $4)
            ON CONFLICT (id) DO NOTHING;
        `, [doctorAId, testOrgId, docAPubKey, docAPrivKey]);

        await db.query(`
            INSERT INTO users (id, name, email, password, role, organization_id, is_approved, public_key, private_key)
            VALUES ($1, 'Dr. Beta', 'doc_beta@sec.com', 'hash', 'doctor', $2, true, $3, $4)
            ON CONFLICT (id) DO NOTHING;
        `, [doctorBId, testOrgId, docBPubKey, docBPrivKey]);

        await db.query(`
            INSERT INTO users (id, name, email, password, role, organization_id, is_approved, public_key, private_key)
            VALUES ($1, 'Admin Clin', 'admin_clin@sec.com', 'hash', 'admin', $2, true, 'adKey', 'adPrKey')
            ON CONFLICT (id) DO NOTHING;
        `, [adminId, testOrgId]);

        // =========================================================================
        // 1. GET /api/records/patient/:id
        // =========================================================================
        console.log('\n--- 1. Testing GET /api/records/patient/:id ---');
        const recNoAuth = await request(`/api/records/patient/${patientAId}`);
        assert(recNoAuth.status === 401, 'Endpoint 1: Rejects unauthenticated request with 401');

        const recOtherPatient = await request(`/api/records/patient/${patientAId}`, {
            headers: { Authorization: `Bearer ${tokenPatientB}` }
        });
        assert(recOtherPatient.status === 403, 'Endpoint 1: Rejects patient viewing other patient records with 403');

        const recOwnPatient = await request(`/api/records/patient/${patientAId}`, {
            headers: { Authorization: `Bearer ${tokenPatientA}` }
        });
        assert(recOwnPatient.status === 200, 'Endpoint 1: Allows patient viewing own records with 200');

        const recNonTreatingDoc = await request(`/api/records/patient/${patientAId}`, {
            headers: { Authorization: `Bearer ${tokenDoctorA}` }
        });
        assert(recNonTreatingDoc.status === 403, 'Endpoint 1: Rejects non-treating doctor with 403');

        // Establish confirmed appointment for Dr. Alpha
        const apptAlpha = crypto.randomUUID();
        await db.query(`
            INSERT INTO appointments (id, organization_id, patient_id, patient_name, doctor_id, doctor_name, date, time, status, reason)
            VALUES ($1, $2, $3, 'Patient Alpha', $4, 'Dr. Alpha', CURRENT_DATE, '09:00', 'Confirmed', 'Annual checkup')
        `, [apptAlpha, testOrgId, patientAId, doctorAId]);

        const recTreatingDoc = await request(`/api/records/patient/${patientAId}`, {
            headers: { Authorization: `Bearer ${tokenDoctorA}` }
        });
        assert(recTreatingDoc.status === 200, 'Endpoint 1: Allows confirmed treating doctor with 200', `Status: ${recTreatingDoc.status}, Body: ${JSON.stringify(recTreatingDoc.body)}`);

        // =========================================================================
        // 2. POST /api/records
        // =========================================================================
        console.log('\n--- 2. Testing POST /api/records ---');
        const createNoAuth = await request('/api/records', {
            method: 'POST',
            body: { patientId: patientAId, doctorId: doctorAId, diagnosis: 'Flu', treatment: 'Rest' }
        });
        assert(createNoAuth.status === 401, 'Endpoint 2: Rejects unauthenticated request with 401', `Status: ${createNoAuth.status}, Body: ${JSON.stringify(createNoAuth.body)}`);

        const createPatient = await request('/api/records', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenPatientA}` },
            body: { patientId: patientAId, doctorId: doctorAId, diagnosis: 'Flu', treatment: 'Rest' }
        });
        assert(createPatient.status === 403, 'Endpoint 2: Rejects patient attempting record creation with 403', `Status: ${createPatient.status}, Body: ${JSON.stringify(createPatient.body)}`);

        // Dr. Alpha attempts to impersonate Dr. Beta
        const createImpersonate = await request('/api/records', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenDoctorA}` },
            body: { patientId: patientAId, doctorId: doctorBId, diagnosis: 'Flu', treatment: 'Rest' }
        });
        assert(createImpersonate.status === 403, 'Endpoint 2: Rejects doctor impersonating another doctor ID with 403', `Status: ${createImpersonate.status}, Body: ${JSON.stringify(createImpersonate.body)}`);

        // Dr. Alpha creating as themselves for Patient Alpha (has confirmed appointment)
        const createSuccess = await request('/api/records', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenDoctorA}` },
            body: { patientId: patientAId, doctorId: doctorAId, diagnosis: 'Flu', treatment: 'Rest', prescriptions: ['Paracetamol'] }
        });
        assert(createSuccess.status === 201 && createSuccess.body?.record?.id, 'Endpoint 2: Allows legitimate treating doctor with 201', `Status: ${createSuccess.status}, Body: ${JSON.stringify(createSuccess.body)}`);
        const createdRecordId = createSuccess.body?.record?.id;

        // =========================================================================
        // 3. POST /api/records/:id/specialist-note
        // =========================================================================
        console.log('\n--- 3. Testing POST /api/records/:id/specialist-note ---');
        const noteNoAuth = await request(`/api/records/${createdRecordId || '00000000-0000-0000-0000-000000000000'}/specialist-note`, {
            method: 'POST',
            body: { specialistNote: 'Second opinion required' }
        });
        assert(noteNoAuth.status === 401, 'Endpoint 3: Rejects unauthenticated request with 401', `Status: ${noteNoAuth.status}, Body: ${JSON.stringify(noteNoAuth.body)}`);

        const notePatient = await request(`/api/records/${createdRecordId}/specialist-note`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenPatientA}` },
            body: { specialistNote: 'Second opinion required' }
        });
        assert(notePatient.status === 403, 'Endpoint 3: Rejects patient attempting to add specialist note with 403');

        const noteDoc = await request(`/api/records/${createdRecordId}/specialist-note`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenDoctorB}` },
            body: { specialistDoctorName: 'Beta', specialistNote: 'Cardio consultation cleared' }
        });
        assert(noteDoc.status === 200 && noteDoc.body?.success, 'Endpoint 3: Allows doctor to add specialist note with 200');

        // =========================================================================
        // 4. POST /api/blockchain/mine
        // =========================================================================
        console.log('\n--- 4. Testing POST /api/blockchain/mine ---');
        const mineNoAuth = await request('/api/blockchain/mine', { method: 'POST' });
        assert(mineNoAuth.status === 401, 'Endpoint 4: Rejects unauthenticated mine trigger with 401');

        const minePatient = await request('/api/blockchain/mine', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenPatientA}` }
        });
        assert(minePatient.status === 403, 'Endpoint 4: Rejects patient attempting to mine block with 403');

        const mineDoctor = await request('/api/blockchain/mine', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenDoctorA}` }
        });
        assert(mineDoctor.status === 403, 'Endpoint 4: Rejects doctor attempting to mine block with 403');

        const mineAdmin = await request('/api/blockchain/mine', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenAdmin}` }
        });
        // 200 (if records mined) or 400 (no pending records) or 500 (test harness standalone), but NOT 401 or 403
        assert(mineAdmin.status !== 401 && mineAdmin.status !== 403, 'Endpoint 4: Admin authorized to access mining endpoint (status: ' + mineAdmin.status + ')');

        // =========================================================================
        // 5. POST /api/auth/break-glass
        // =========================================================================
        console.log('\n--- 5. Testing POST /api/auth/break-glass ---');
        const bgNoAuth = await request('/api/auth/break-glass', {
            method: 'POST',
            body: { patientId: patientBId, doctorId: doctorBId, reason: 'Trauma ICU emergency' }
        });
        assert(bgNoAuth.status === 401, 'Endpoint 5: Rejects unauthenticated break-glass with 401');

        const bgPatient = await request('/api/auth/break-glass', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenPatientA}` },
            body: { patientId: patientBId, doctorId: doctorBId, reason: 'Trauma ICU emergency' }
        });
        assert(bgPatient.status === 403, 'Endpoint 5: Rejects non-doctor attempting break-glass with 403');

        // Doctor A tries to break-glass claiming to be Doctor B
        const bgImpersonate = await request('/api/auth/break-glass', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenDoctorA}` },
            body: { patientId: patientBId, doctorId: doctorBId, reason: 'Trauma ICU emergency' }
        });
        assert(bgImpersonate.status === 403, 'Endpoint 5: Rejects doctor impersonating another doctor ID with 403');

        // Doctor B breaks glass legitimately for Patient B
        const bgSuccess = await request('/api/auth/break-glass', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenDoctorB}` },
            body: { patientId: patientBId, doctorId: doctorBId, reason: 'Acute cardiac arrest ICU' }
        });
        assert(bgSuccess.status === 200 && (bgSuccess.body?.success || bgSuccess.body?.hasBreakGlass), 'Endpoint 5: Doctor successfully activates break-glass with 200', `Status: ${bgSuccess.status}, Body: ${JSON.stringify(bgSuccess.body)}`);

        // =========================================================================
        // 6. POST /api/consultations
        // =========================================================================
        console.log('\n--- 6. Testing POST /api/consultations ---');
        const consultNoAuth = await request('/api/consultations', {
            method: 'POST',
            body: { appointmentId: apptAlpha, diagnosis: 'Migraine', treatment: 'Triptan' }
        });
        assert(consultNoAuth.status === 401, 'Endpoint 6: Rejects unauthenticated consultation with 401');

        // Doctor B is NOT assigned to apptAlpha (assigned to Doctor A)
        const consultWrongDoc = await request('/api/consultations', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenDoctorB}` },
            body: { appointmentId: apptAlpha, diagnosis: 'Migraine', treatment: 'Triptan' }
        });
        assert(consultWrongDoc.status === 403, 'Endpoint 6: Rejects unassigned doctor with 403');

        // Doctor A (assigned) completes consultation
        const consultSuccess = await request('/api/consultations', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenDoctorA}` },
            body: { appointmentId: apptAlpha, symptoms: 'Headache', diagnosis: 'Migraine', treatment: 'Triptan' }
        });
        assert((consultSuccess.status === 200 || consultSuccess.status === 201) && consultSuccess.body?.record, 'Endpoint 6: Allows assigned doctor to complete consultation with 200/201', `Status: ${consultSuccess.status}, Body: ${JSON.stringify(consultSuccess.body)}`);

        // =========================================================================
        // 7. GET /api/appointments
        // =========================================================================
        console.log('\n--- 7. Testing GET /api/appointments ---');
        const apptListNoAuth = await request('/api/appointments');
        assert(apptListNoAuth.status === 401, 'Endpoint 7: Rejects unauthenticated GET /api/appointments with 401', `Status: ${apptListNoAuth.status}, Body: ${JSON.stringify(apptListNoAuth.body)}`);

        const apptListPatientA = await request('/api/appointments', {
            headers: { Authorization: `Bearer ${tokenPatientA}` }
        });
        assert(apptListPatientA.status === 200 && Array.isArray(apptListPatientA.body), 'Endpoint 7: Patient receives scoped appointments list with 200', `Status: ${apptListPatientA.status}, Body: ${JSON.stringify(apptListPatientA.body)}`);

        // =========================================================================
        // 8. POST /api/appointments
        // =========================================================================
        console.log('\n--- 8. Testing POST /api/appointments ---');
        const bookNoAuth = await request('/api/appointments', {
            method: 'POST',
            body: { doctorId: doctorBId, date: '2026-10-02', time: '14:00', reason: 'Consult' }
        });
        assert(bookNoAuth.status === 401, 'Endpoint 8: Rejects unauthenticated booking with 401', `Status: ${bookNoAuth.status}, Body: ${JSON.stringify(bookNoAuth.body)}`);

        const bookPatientA = await request('/api/appointments', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenPatientA}` },
            body: { doctorId: doctorBId, date: '2026-10-02', time: '14:00', reason: 'Consult' }
        });
        const createdApptPatientId = bookPatientA.body?.appointment?.patientId || bookPatientA.body?.appointment?.patient_id;
        assert(bookPatientA.status === 201 && createdApptPatientId === patientAId, 'Endpoint 8: Patient books appointment bound to their token ID with 201', `Status: ${bookPatientA.status}, Body: ${JSON.stringify(bookPatientA.body)}`);
        const newApptId = bookPatientA.body?.appointment?.id;

        // =========================================================================
        // 9. POST /api/appointments/:id/status
        // =========================================================================
        console.log('\n--- 9. Testing POST /api/appointments/:id/status ---');
        const statusNoAuth = await request(`/api/appointments/${newApptId || '00000000-0000-0000-0000-000000000000'}/status`, {
            method: 'POST',
            body: { status: 'Confirmed' }
        });
        assert(statusNoAuth.status === 401, 'Endpoint 9: Rejects unauthenticated status update with 401', `Status: ${statusNoAuth.status}, Body: ${JSON.stringify(statusNoAuth.body)}`);

        // Doctor A is not assigned to newApptId (assigned to Doctor B)
        const statusDocA = await request(`/api/appointments/${newApptId || '00000000-0000-0000-0000-000000000000'}/status`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenDoctorA}` },
            body: { status: 'Confirmed' }
        });
        assert(statusDocA.status === 403, 'Endpoint 9: Rejects unassigned doctor status update with 403', `Status: ${statusDocA.status}, Body: ${JSON.stringify(statusDocA.body)}`);

        // Doctor B confirms appointment
        const statusDocB = await request(`/api/appointments/${newApptId || '00000000-0000-0000-0000-000000000000'}/status`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenDoctorB}` },
            body: { status: 'Confirmed' }
        });
        const updatedStatus = statusDocB.body?.status || statusDocB.body?.appointment?.status;
        assert(statusDocB.status === 200 && updatedStatus === 'Confirmed', 'Endpoint 9: Allows assigned doctor to confirm appointment with 200', `Status: ${statusDocB.status}, Body: ${JSON.stringify(statusDocB.body)}`);

        // =========================================================================
        // 10. PUT /api/users/doctor/availability
        // =========================================================================
        console.log('\n--- 10. Testing PUT /api/users/doctor/availability ---');
        const availNoAuth = await request('/api/users/doctor/availability', {
            method: 'PUT',
            body: { doctorId: doctorAId, workingDays: ['Monday'] }
        });
        assert(availNoAuth.status === 401, 'Endpoint 10: Rejects unauthenticated availability update with 401', `Status: ${availNoAuth.status}, Body: ${JSON.stringify(availNoAuth.body)}`);

        // Patient attempting to set doctor availability
        const availPatient = await request('/api/users/doctor/availability', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${tokenPatientA}` },
            body: { doctorId: doctorAId, workingDays: ['Monday'] }
        });
        assert(availPatient.status === 403, 'Endpoint 10: Rejects non-doctor attempting to update availability with 403', `Status: ${availPatient.status}, Body: ${JSON.stringify(availPatient.body)}`);

        // Doctor A attempting to update Doctor B's availability
        const availDocImpersonate = await request('/api/users/doctor/availability', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${tokenDoctorA}` },
            body: { doctorId: doctorBId, workingDays: ['Monday'] }
        });
        assert(availDocImpersonate.status === 403, 'Endpoint 10: Rejects doctor modifying another doctor availability with 403', `Status: ${availDocImpersonate.status}, Body: ${JSON.stringify(availDocImpersonate.body)}`);

        // Doctor A updating own availability
        const availDocOwn = await request('/api/users/doctor/availability', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${tokenDoctorA}` },
            body: { doctorId: doctorAId, workingDays: ['Monday', 'Tuesday'], workingHoursStart: '08:00', workingHoursEnd: '17:00', status: 'available' }
        });
        assert(availDocOwn.status === 200, 'Endpoint 10: Allows doctor to update own availability with 200', `Status: ${availDocOwn.status}, Body: ${JSON.stringify(availDocOwn.body)}`);

        // =========================================================================
        // 11. POST /api/auth/change-password
        // =========================================================================
        console.log('\n--- 11. Testing POST /api/auth/change-password ---');
        const pwNoAuth = await request('/api/auth/change-password', {
            method: 'POST',
            body: { userId: patientAId, currentPassword: 'any', newPassword: 'new' }
        });
        assert(pwNoAuth.status === 401, 'Endpoint 11: Rejects unauthenticated change password with 401', `Status: ${pwNoAuth.status}, Body: ${JSON.stringify(pwNoAuth.body)}`);

        // Patient B attempting to change Patient A's password
        const pwWrongUser = await request('/api/auth/change-password', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenPatientB}` },
            body: { userId: patientAId, currentPassword: 'any', newPassword: 'new' }
        });
        assert(pwWrongUser.status === 403, 'Endpoint 11: Rejects user attempting to change another user password with 403', `Status: ${pwWrongUser.status}, Body: ${JSON.stringify(pwWrongUser.body)}`);

        // =========================================================================
        // 12. POST /api/auth/update-email
        // =========================================================================
        console.log('\n--- 12. Testing POST /api/auth/update-email ---');
        const emailNoAuth = await request('/api/auth/update-email', {
            method: 'POST',
            body: { userId: patientAId, newEmail: 'hacked@hack.com', currentPassword: 'password123' }
        });
        assert(emailNoAuth.status === 401, 'Endpoint 12: Rejects unauthenticated update email with 401', `Status: ${emailNoAuth.status}, Body: ${JSON.stringify(emailNoAuth.body)}`);

        // Patient B attempting to change Patient A's email
        const emailWrongUser = await request('/api/auth/update-email', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenPatientB}` },
            body: { userId: patientAId, newEmail: 'hacked@hack.com', currentPassword: 'password123' }
        });
        assert(emailWrongUser.status === 403, 'Endpoint 12: Rejects user attempting to update another user email with 403', `Status: ${emailWrongUser.status}, Body: ${JSON.stringify(emailWrongUser.body)}`);

    } catch (err) {
        console.error('Fatal error during security patch tests:', err);
        failed++;
    } finally {
        // Cleanup test actors and associated data
        await db.query('DELETE FROM appointments WHERE patient_id IN ($1, $2) OR doctor_id IN ($3, $4)', [patientAId, patientBId, doctorAId, doctorBId]);
        await db.query('DELETE FROM records WHERE patient_id IN ($1, $2)', [patientAId, patientBId]);
        await db.query('DELETE FROM audit_logs WHERE patient_id IN ($1, $2)', [patientAId, patientBId]);
        await db.query('DELETE FROM users WHERE id IN ($1, $2, $3, $4, $5)', [patientAId, patientBId, doctorAId, doctorBId, adminId]);

        server.close();
    }

    console.log('\n======================================================');
    console.log(`  SECURITY PATCH SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runSecurityPatchTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
