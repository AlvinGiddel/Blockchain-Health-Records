const db = require('./db');

async function testPerformance() {
    console.log('=== Performance Test Suite Started ===\n');

    try {
        // 1. Fetch a doctor and a patient from DB
        const { rows: doctors } = await db.query("SELECT id, name, email FROM users WHERE role = 'doctor' AND is_approved = true LIMIT 1");
        const { rows: patients } = await db.query("SELECT id, name, email FROM users WHERE role = 'patient' LIMIT 1");

        if (doctors.length === 0 || patients.length === 0) {
            console.error('Test aborted: Please make sure you have at least one approved doctor and one patient in the database.');
            process.exit(1);
        }

        const doctor = doctors[0];
        const patient = patients[0];

        console.log(`Using Doctor: ${doctor.name} (${doctor.email})`);
        console.log(`Using Patient: ${patient.name} (${patient.email})\n`);

        // 2. Measure login time for doctor
        const tStartLogin = Date.now();
        const loginRes = await fetch('http://localhost:5000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: doctor.email, password: 'Password123' })
        });
        const loginTime = Date.now() - tStartLogin;
        const loginData = await loginRes.json();
        console.log(`[API] POST /api/auth/login took ${loginTime}ms (Status: ${loginRes.status})`);

        // 3. Measure appointment booking time
        const tStartBook = Date.now();
        const bookRes = await fetch('http://localhost:5000/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                doctorId: doctor.id,
                patientId: patient.id,
                date: '2026-08-10',
                time: '10:00',
                reason: 'Routine cryptographic wellness checkup.'
            })
        });
        const bookTime = Date.now() - tStartBook;
        const bookData = await bookRes.json();
        console.log(`[API] POST /api/appointments took ${bookTime}ms (Status: ${bookRes.status})`);

        let appointmentId = null;
        if (bookData.success && bookData.appointment) {
            appointmentId = bookData.appointment.id;
        } else {
            // Find existing pending or confirmed appointment
            const { rows: appts } = await db.query("SELECT id FROM appointments WHERE patient_id = $1 AND doctor_id = $2 ORDER BY created_at DESC LIMIT 1", [patient.id, doctor.id]);
            if (appts.length > 0) {
                appointmentId = appts[0].id;
            }
        }

        if (!appointmentId) {
            console.warn('Warning: Could not create or find an appointment. Skipping appointment-dependent tests.');
        } else {
            // Ensure appointment status is updated to confirmed (doctor approves)
            await db.query("UPDATE appointments SET status = 'Confirmed' WHERE id = $1", [appointmentId]);

            // 4. Measure consultation completion time (which triggers background mining)
            const tStartConsult = Date.now();
            const consultRes = await fetch('http://localhost:5000/api/consultations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    appointmentId: appointmentId,
                    symptoms: 'Mild digital fatigue, signature verification delays.',
                    diagnosis: 'Latency issue resolved.',
                    treatment: 'Apply parallel database queries and background logging.',
                    notes: 'Mining block and audit logging now run asynchronously.',
                    prescriptions: 'Parallelism 200mg, Asynchrony 50mg',
                    labRequest: ''
                })
            });
            const consultTime = Date.now() - tStartConsult;
            const consultData = await consultRes.json();
            console.log(`[API] POST /api/consultations took ${consultTime}ms (Status: ${consultRes.status})`);

            // 5. Measure fetching records time
            const tStartGetRecords = Date.now();
            const recordsRes = await fetch(`http://localhost:5000/api/records/patient/${patient.id}?requesterId=${doctor.id}&requesterRole=doctor`);
            const getRecordsTime = Date.now() - tStartGetRecords;
            console.log(`[API] GET /api/records/patient/:id took ${getRecordsTime}ms (Status: ${recordsRes.status})`);
        }

        console.log('\n=== Performance Test Suite Completed ===');
        process.exit(0);
    } catch (err) {
        console.error('Error executing performance test:', err);
        process.exit(1);
    }
}

testPerformance();
