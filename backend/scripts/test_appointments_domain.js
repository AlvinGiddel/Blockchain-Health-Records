const http = require('http');
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const createAppointmentsRouter = require('../routes/appointments');
const { Blockchain } = require('../blockchain');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

async function runAppointmentTests() {
    console.log('======================================================');
    console.log('   RUNNING APPOINTMENTS & CONSULTATIONS TEST SUITE    ');
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

    const testOrgAId = crypto.randomUUID();
    const testOrgBId = crypto.randomUUID();
    const patientId = crypto.randomUUID();
    const patient2Id = crypto.randomUUID();
    const doctorAId = crypto.randomUUID();
    const doctorBId = crypto.randomUUID();

    const nameA = 'Test Hospital Alpha ' + testOrgAId.substring(0, 8);
    const slugA = 'test-alpha-' + testOrgAId.substring(0, 8);
    const nameB = 'Test Hospital Beta ' + testOrgBId.substring(0, 8);
    const slugB = 'test-beta-' + testOrgBId.substring(0, 8);

    // 1. Setup Test Organizations & Users in DB
    await db.query(`
        INSERT INTO organizations (id, name, slug, status)
        VALUES 
            ($1, $2, $3, 'active'),
            ($4, $5, $6, 'active')
        ON CONFLICT (id) DO NOTHING;
    `, [testOrgAId, nameA, slugA, testOrgBId, nameB, slugB]);

    // Insert Doctors
    await db.query(`
        INSERT INTO users (id, name, email, password, role, organization_id, is_approved, is_rejected, public_key, private_key, doctor_profile)
        VALUES 
            ($1, 'Dr. Alpha Specialist', 'doc_alpha@test.com', 'hashed', 'doctor', $2, true, false, 'dummy_pub_key_alpha', 'dummy_priv_key_alpha', $3),
            ($4, 'Dr. Beta Physician', 'doc_beta@test.com', 'hashed', 'doctor', $5, true, false, 'dummy_pub_key_beta', 'dummy_priv_key_beta', $6)
        ON CONFLICT (id) DO NOTHING;
    `, [
        doctorAId, testOrgAId, JSON.stringify({
            specialization: 'Cardiology',
            availability: {
                status: 'available',
                workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                workingHoursStart: '08:00',
                workingHoursEnd: '18:00'
            }
        }),
        doctorBId, testOrgBId, JSON.stringify({
            specialization: 'Pediatrics',
            availability: {
                status: 'available',
                workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                workingHoursStart: '08:00',
                workingHoursEnd: '18:00'
            }
        })
    ]);

    // Insert Patients (Patient 1 is member of Alpha only; Patient 2 is clean)
    await db.query(`
        INSERT INTO users (id, name, email, password, role, organization_id, is_approved, public_key, private_key)
        VALUES 
            ($1, 'Patient One', 'patient1@test.com', 'hashed', 'patient', $2, true, 'dummy_pub_key_p1', 'dummy_priv_key_p1'),
            ($3, 'Patient Two', 'patient2@test.com', 'hashed', 'patient', null, true, 'dummy_pub_key_p2', 'dummy_priv_key_p2')
        ON CONFLICT (id) DO NOTHING;
    `, [patientId, testOrgAId, patient2Id]);

    // Initial membership for Patient One in Org A only
    await db.query(`
        INSERT INTO tenant_memberships (user_id, organization_id, role, status)
        VALUES ($1, $2, 'patient', 'active')
        ON CONFLICT (user_id, organization_id) DO NOTHING;
    `, [patientId, testOrgAId]);

    // Setup Mock Express App
    const app = express();
    app.use(express.json());

    const mockBlockchain = new Blockchain();
    let mempoolTriggered = false;
    const mockCheckMempool = () => { mempoolTriggered = true; };

    app.use('/api', createAppointmentsRouter({
        healthBlockchain: mockBlockchain,
        checkMempoolThreshold: mockCheckMempool
    }));

    // Start local server
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

    try {
        // Pick a future date (10 days from now)
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 10);
        const dateStr = futureDate.toISOString().split('T')[0];
        const timeSlot = '10:00';

        const tokenPatient1 = jwt.sign({ id: patientId, role: 'patient', organization_id: testOrgAId }, JWT_SECRET);
        const tokenPatient2 = jwt.sign({ id: patient2Id, role: 'patient' }, JWT_SECRET);
        const tokenDoctorB = jwt.sign({ id: doctorBId, role: 'doctor', organization_id: testOrgBId }, JWT_SECRET);

        // TEST 1: Booking an appointment as an existing patient at a new hospital
        console.log('--- TEST 1: Dynamic Tenant Membership Creation on First Booking ---');
        // Verify patient has NO membership in Beta yet
        const { rows: preMems } = await db.query(
            'SELECT * FROM tenant_memberships WHERE user_id = $1 AND organization_id = $2',
            [patientId, testOrgBId]
        );
        assert(preMems.length === 0, 'Patient 1 initially has NO membership in Hospital Beta');

        // Patient 1 books with Dr. Beta at Hospital Beta
        const bookRes1 = await request('/api/appointments', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenPatient1}` },
            body: {
                patientId,
                doctorId: doctorBId,
                organizationId: testOrgBId,
                date: dateStr,
                time: timeSlot,
                reason: 'Routine pediatric checkup'
            }
        });

        assert(bookRes1.status === 201, 'Appointment booking succeeded with HTTP 201');
        assert(bookRes1.body.appointment && bookRes1.body.appointment.status === 'Pending', 'Appointment is created with Pending status');
        assert(bookRes1.body.appointment.organizationId === testOrgBId, 'Appointment is associated with Hospital Beta');

        const createdApptId = bookRes1.body.appointment.id;

        // Verify tenant_memberships was automatically created
        const { rows: postMems } = await db.query(
            'SELECT * FROM tenant_memberships WHERE user_id = $1 AND organization_id = $2',
            [patientId, testOrgBId]
        );
        assert(postMems.length === 1, 'tenant_memberships row was created automatically for Hospital Beta');
        assert(postMems[0].role === 'patient' && postMems[0].status === 'active', 'Membership has role "patient" and status "active"');

        // TEST 2: Conflict Detection & Doctor Double-Booking Prevention
        console.log('\n--- TEST 2: Conflict Detection & Double-Booking Prevention ---');
        // Patient 2 attempts to book Dr. Beta at the EXACT SAME date & time
        const conflictRes = await request('/api/appointments', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenPatient2}` },
            body: {
                patientId: patient2Id,
                doctorId: doctorBId,
                organizationId: testOrgBId,
                date: dateStr,
                time: timeSlot,
                reason: 'Conflicting slot request'
            }
        });

        assert(conflictRes.status === 400, 'Duplicate booking returns HTTP 400 Bad Request');
        assert(conflictRes.body.error === 'An appointment request at this date and time already exists.', 'Returns exact conflict error message');

        // TEST 3: Slot release when appointment is Declined
        console.log('\n--- TEST 3: Slot Release upon Appointment Decline ---');
        // Update first appointment to 'Declined'
        const declineRes = await request(`/api/appointments/${createdApptId}/status`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenDoctorB}` },
            body: { status: 'Declined' }
        });
        assert(declineRes.status === 200, 'Appointment status successfully updated to Declined');

        // Patient 2 now attempts booking the previously conflicting slot
        const retryRes = await request('/api/appointments', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenPatient2}` },
            body: {
                patientId: patient2Id,
                doctorId: doctorBId,
                organizationId: testOrgBId,
                date: dateStr,
                time: timeSlot,
                reason: 'Second chance booking'
            }
        });
        assert(retryRes.status === 201, 'Re-booking previously declined slot succeeded with HTTP 201');

        // TEST 4: Fetch appointments filtered by user role
        console.log('\n--- TEST 4: Fetch Appointments Filtered by Role ---');
        const patientAppts = await request('/api/appointments', {
            headers: { Authorization: `Bearer ${tokenPatient1}` }
        });
        assert(patientAppts.status === 200, 'Patient appointments returned HTTP 200');
        assert(Array.isArray(patientAppts.body) && patientAppts.body.length >= 1, 'Patient receives their appointments');

        const doctorAppts = await request('/api/appointments', {
            headers: { Authorization: `Bearer ${tokenDoctorB}` }
        });
        assert(doctorAppts.status === 200, 'Doctor appointments returned HTTP 200');
        assert(Array.isArray(doctorAppts.body) && doctorAppts.body.length >= 2, 'Doctor receives appointments assigned to them');

        // TEST 5: Doctor Availability Settings Update
        console.log('\n--- TEST 5: Update Doctor Availability Settings ---');
        const availRes = await request('/api/users/doctor/availability', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${tokenDoctorB}` },
            body: {
                doctorId: doctorBId,
                workingDays: ['Monday', 'Wednesday', 'Friday'],
                workingHoursStart: '09:00',
                workingHoursEnd: '15:00',
                status: 'busy'
            }
        });
        assert(availRes.status === 200, 'Doctor availability update returned HTTP 200');
        assert(availRes.body.doctor && availRes.body.doctor.doctorProfile.availability.status === 'busy', 'Doctor status updated to busy in profile');

        // Attempting to book a busy doctor should fail
        const busyBookRes = await request('/api/appointments', {
            method: 'POST',
            headers: { Authorization: `Bearer ${tokenPatient1}` },
            body: {
                patientId,
                doctorId: doctorBId,
                organizationId: testOrgBId,
                date: '2027-01-01',
                time: '10:00',
                reason: 'Booking while busy'
            }
        });
        assert(busyBookRes.status === 400, 'Booking busy doctor rejected with HTTP 400');
        assert(busyBookRes.body.error && busyBookRes.body.error.includes('is busy'), 'Error message specifies doctor is busy');

    } finally {
        server.close();
        // Clean up test rows
        await db.query('DELETE FROM appointments WHERE organization_id IN ($1, $2)', [testOrgAId, testOrgBId]);
        await db.query('DELETE FROM tenant_memberships WHERE organization_id IN ($1, $2)', [testOrgAId, testOrgBId]);
        await db.query('DELETE FROM users WHERE id IN ($1, $2, $3, $4)', [patientId, patient2Id, doctorAId, doctorBId]);
        await db.query('DELETE FROM organizations WHERE id IN ($1, $2)', [testOrgAId, testOrgBId]);
        if (db.pool && db.pool.end) await db.pool.end();
    }

    console.log('\n======================================================');
    console.log(`  APPOINTMENTS TEST FINISHED: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');
    process.exit(failed > 0 ? 1 : 0);
}

runAppointmentTests().catch(err => {
    console.error('Test failed with unhandled error:', err);
    process.exit(1);
});
