const crypto = require('crypto');
const db = require('../db');
const { getKenyanTimestamp, signRecord } = require('../blockchain');
const {
    logAuditEvent,
    encrypt,
    getRequesterOrgScope,
    verifyAuthToken
} = require('../utils/helpers');

/**
 * Format a 24-hour time string into a 12-hour AM/PM string
 * @param {string} timeStr
 * @returns {string}
 */
function formatTime12hBackend(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return '';
    const [hStr, mStr] = timeStr.split(':');
    let h = parseInt(hStr, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${mStr} ${ampm}`;
}

/**
 * Request a new appointment
 * POST /api/appointments
 */
async function bookAppointment(req, res) {
    try {
        const authUser = verifyAuthToken(req);
        let { doctorId, date, time, reason, patientId, organizationId } = req.body;

        // If patient, strictly enforce booking only under their own authenticated identity
        if (authUser.role === 'patient') {
            patientId = authUser.id;
        } else if (!patientId) {
            patientId = authUser.id;
        }

        const [patientsRes, doctorsRes] = await Promise.all([
            db.query('SELECT * FROM users WHERE id = $1', [patientId]),
            db.query('SELECT * FROM users WHERE id = $1', [doctorId])
        ]);
        const patients = patientsRes.rows;
        const doctors = doctorsRes.rows;
        if (patients.length === 0 || doctors.length === 0) {
            return res.status(404).json({ error: 'Patient or Doctor not found.' });
        }
        const patient = patients[0];
        const doctor = doctors[0];

        // Prevent duplicate appointment bookings and doctor double-booking (Uses idx_appointments_doc_date_status)
        const { rows: existingAppt } = await db.query(
            `SELECT id FROM appointments 
             WHERE doctor_id = $1 AND date = $2 AND time = $3 AND status != 'Declined'`,
            [doctorId, date, time]
        );
        if (existingAppt.length > 0) {
            return res.status(400).json({ error: 'An appointment request at this date and time already exists.' });
        }

        // Doctor Availability Validation
        const availability = doctor.doctor_profile?.availability || {
            status: 'available',
            workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
            workingHoursStart: '08:00',
            workingHoursEnd: '17:00'
        };

        if (availability.status === 'busy') {
            return res.status(400).json({ error: `Appointment booking is currently disabled because Dr. ${doctor.name} is busy.` });
        }
        if (availability.status === 'on leave') {
            return res.status(400).json({ error: `Appointment booking is currently disabled because Dr. ${doctor.name} is on leave.` });
        }

        // Validate working day
        const parts = date.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);

        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        const currentDay = today.getDate();

        if (year < currentYear) {
            return res.status(400).json({ error: 'You cannot book an appointment in a past year.' });
        }
        if (year === currentYear) {
            if (month < currentMonth) {
                return res.status(400).json({ error: 'You cannot book an appointment for a month that has already passed.' });
            }
            if (month === currentMonth && day < currentDay) {
                return res.status(400).json({ error: 'You cannot book an appointment for a date that has already passed.' });
            }
        }

        const dateObj = new Date(Date.UTC(year, month, day));
        const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayOfWeek = weekdays[dateObj.getUTCDay()];

        if (!availability.workingDays.includes(dayOfWeek)) {
            return res.status(400).json({ error: `Dr. ${doctor.name} is not available on ${dayOfWeek}s. Available days: ${availability.workingDays.join(', ')}` });
        }

        // Validate working hours
        if (time < availability.workingHoursStart || time > availability.workingHoursEnd) {
            return res.status(400).json({
                error: `Appointments must be booked during working hours: ${formatTime12hBackend(availability.workingHoursStart)} to ${formatTime12hBackend(availability.workingHoursEnd)}.`
            });
        }

        // Determine target hospital facility
        const targetOrgId = organizationId || doctor.organization_id;

        // Auto-enroll patient into the hospital facility via tenant_memberships (Requirement 2)
        if (targetOrgId) {
            await db.query(`
                INSERT INTO tenant_memberships (user_id, organization_id, role, status, joined_at)
                VALUES ($1, $2, 'patient', 'active', NOW())
                ON CONFLICT (user_id, organization_id)
                DO UPDATE SET status = 'active';
            `, [patientId, targetOrgId]);
        }

        const createdAt = getKenyanTimestamp();
        const { rows: appointments } = await db.query(
            `INSERT INTO appointments (patient_id, doctor_id, patient_name, doctor_name, date, time, reason, status, created_at, organization_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [patientId, doctorId, patient.name, doctor.name, date, time, reason, 'Pending', createdAt, targetOrgId]
        );
        const appointment = appointments[0];

        // Audit Log Entry with organization context
        db.query(
            `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [targetOrgId, 'appointment_request', patientId, patient.name, doctorId, doctor.name, `Patient ${patient.name} requested an appointment with Dr. ${doctor.name} on ${date} at ${time}.`, createdAt]
        ).catch(err => console.error('Failed to log appointment request audit:', err));

        const responseAppointment = {
            id: appointment.id,
            patientId: appointment.patient_id,
            doctorId: appointment.doctor_id,
            patientName: appointment.patient_name,
            doctorName: appointment.doctor_name,
            date: appointment.date,
            time: appointment.time,
            reason: appointment.reason,
            status: appointment.status,
            createdAt: appointment.created_at,
            organizationId: appointment.organization_id
        };

        res.status(201).json({ success: true, message: 'Appointment request submitted successfully!', appointment: responseAppointment });
    } catch (err) {
        console.error('Book appointment error:', err);
        res.status(err.statusCode || 500).json({ error: err.message });
    }
}

/**
 * Fetch appointments filtered by user role
 * GET /api/appointments
 */
async function getAppointments(req, res) {
    try {
        const authUser = verifyAuthToken(req);
        let query = `
            SELECT a.id, a.patient_id as "patientId", a.doctor_id as "doctorId", a.patient_name as "patientName", 
                   a.doctor_name as "doctorName", a.date, a.time, a.reason, a.status, a.created_at as "createdAt",
                   a.organization_id as "organizationId", o.name as "organizationName"
            FROM appointments a
            LEFT JOIN organizations o ON a.organization_id = o.id
        `;
        let params = [];

        // Strict identity binding from verified token
        if (authUser.role === 'patient') {
            query += ' WHERE a.patient_id = $1';
            params.push(authUser.id);
        } else if (authUser.role === 'doctor') {
            query += ' WHERE a.doctor_id = $1';
            params.push(authUser.id);
        } else if (authUser.role === 'admin') {
            const { targetOrgId } = getRequesterOrgScope(req);
            if (targetOrgId) {
                query += ' WHERE a.organization_id = $1';
                params.push(targetOrgId);
            }
        } else if (authUser.role === 'super_admin') {
            const explicitOrg = req.headers['x-organization-id'] || req.query.orgId || req.query.organizationId;
            if (explicitOrg) {
                query += ' WHERE a.organization_id = $1';
                params.push(explicitOrg);
            }
        } else {
            return res.status(403).json({ error: 'Access denied: Invalid requester role.' });
        }

        query += ' ORDER BY a.created_at DESC';
        const { rows: appointments } = await db.query(query, params);
        res.json(appointments);
    } catch (err) {
        console.error('Get appointments error:', err);
        res.status(err.statusCode || 500).json({ error: err.message });
    }
}

/**
 * Update appointment status
 * POST /api/appointments/:id/status
 */
async function updateAppointmentStatus(req, res) {
    try {
        const authUser = verifyAuthToken(req);
        const { status } = req.body;
        const appointmentId = req.params.id;

        const { rows: existingAppointments } = await db.query('SELECT * FROM appointments WHERE id = $1', [appointmentId]);
        if (existingAppointments.length === 0) {
            return res.status(404).json({ error: 'Appointment not found.' });
        }
        const appointment = existingAppointments[0];

        // Access Control: Doctor can update their appointments; patient can decline their own; admin of org can update; super_admin can update
        const isDoctor = authUser.role === 'doctor' && authUser.id === appointment.doctor_id;
        const isPatient = authUser.role === 'patient' && authUser.id === appointment.patient_id;
        const isAdmin = authUser.role === 'admin' && authUser.organization_id === appointment.organization_id;
        const isSuperAdmin = authUser.role === 'super_admin';

        if (!isDoctor && !isPatient && !isAdmin && !isSuperAdmin) {
            return res.status(403).json({ error: 'Access denied: You are not authorized to update this appointment.' });
        }

        if (isPatient && status !== 'Declined') {
            return res.status(403).json({ error: 'Patients can only cancel (decline) their own appointments.' });
        }

        const { rows: appointments } = await db.query('UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *', [status, appointmentId]);
        const updatedAppointment = appointments[0];

        // Audit Log Entry (in background)
        const eventType = status === 'Confirmed' ? 'appointment_confirm' : (status === 'Declined' ? 'appointment_decline' : 'appointment_complete');
        db.query(
            `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [updatedAppointment.organization_id || null, eventType, updatedAppointment.patient_id, updatedAppointment.patient_name, updatedAppointment.doctor_id, updatedAppointment.doctor_name, `Appointment status updated to ${status} for ${updatedAppointment.patient_name} with Dr. ${updatedAppointment.doctor_name}.`]
        ).catch(err => console.error('Failed to log appointment status update audit:', err));

        const responseAppointment = {
            id: updatedAppointment.id,
            patientId: updatedAppointment.patient_id,
            doctorId: updatedAppointment.doctor_id,
            patientName: updatedAppointment.patient_name,
            doctorName: updatedAppointment.doctor_name,
            date: updatedAppointment.date,
            time: updatedAppointment.time,
            reason: updatedAppointment.reason,
            status: updatedAppointment.status,
            createdAt: updatedAppointment.created_at
        };

        res.json({ success: true, message: `Appointment status updated to ${status}.`, appointment: responseAppointment });
    } catch (err) {
        console.error('Update appointment status error:', err);
        res.status(err.statusCode || 500).json({ error: err.message });
    }
}

/**
 * Update doctor availability status and working hours/days
 * PUT /api/users/doctor/availability
 */
async function updateDoctorAvailability(req, res) {
    try {
        const authUser = verifyAuthToken(req);
        const { doctorId, workingDays, workingHoursStart, workingHoursEnd, status } = req.body;

        const targetDoctorId = doctorId || authUser.id;
        if (authUser.role !== 'doctor' && authUser.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied: Only doctors can update their availability schedule.' });
        }
        if (authUser.role === 'doctor' && authUser.id !== targetDoctorId) {
            return res.status(403).json({ error: 'Access denied: You cannot modify availability for another doctor.' });
        }

        const { rows: users } = await db.query('SELECT * FROM users WHERE id = $1', [targetDoctorId]);
        if (users.length === 0 || users[0].role !== 'doctor') {
            return res.status(404).json({ error: 'Doctor not found.' });
        }
        const doctor = users[0];

        let profile = doctor.doctor_profile || {};
        profile.availability = {
            workingDays: workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
            workingHoursStart: workingHoursStart || '08:00',
            workingHoursEnd: workingHoursEnd || '17:00',
            status: status || 'available'
        };

        const { rows: updatedDoctors } = await db.query(
            'UPDATE users SET doctor_profile = $1 WHERE id = $2 RETURNING *',
            [JSON.stringify(profile), targetDoctorId]
        );
        const updatedDoctor = updatedDoctors[0];

        // Log the change in the audit trail (in background)
        db.query(
            `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
                doctor.organization_id || null,
                'availability_update',
                null,
                null,
                updatedDoctor.id,
                updatedDoctor.name,
                `Dr. ${updatedDoctor.name} updated availability: Days: ${profile.availability.workingDays.join(', ')}, Hours: ${profile.availability.workingHoursStart} - ${profile.availability.workingHoursEnd}, Status: ${profile.availability.status}.`
            ]
        ).catch(err => console.error('Failed to log availability update audit:', err));

        res.json({
            success: true,
            message: 'Availability updated successfully!',
            doctor: {
                id: updatedDoctor.id,
                name: updatedDoctor.name,
                email: updatedDoctor.email,
                role: updatedDoctor.role,
                publicKey: updatedDoctor.public_key,
                patientProfile: updatedDoctor.patient_profile,
                doctorProfile: updatedDoctor.doctor_profile,
                isApproved: updatedDoctor.is_approved
            }
        });
    } catch (err) {
        console.error('Update availability error:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to update availability.' });
    }
}

/**
 * Complete a consultation (Doctor only)
 * POST /api/consultations
 */
async function completeConsultation(req, res, dependencies = {}) {
    const { healthBlockchain = null, checkMempoolThreshold = null } = dependencies;
    try {
        const authUser = verifyAuthToken(req);
        if (authUser.role !== 'doctor' && authUser.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied: Only clinical doctors can complete consultations.' });
        }

        const appointmentId = req.body?.appointmentId || req.params?.id;
        const { symptoms = '', diagnosis = '', treatment = '', notes = '', prescriptions, labRequest } = req.body || {};
        const { rows: appointments } = await db.query('SELECT * FROM appointments WHERE id = $1', [appointmentId]);
        if (appointments.length === 0) {
            return res.status(404).json({ error: 'Appointment not found.' });
        }
        const appointment = appointments[0];

        if (authUser.role === 'doctor' && authUser.id !== appointment.doctor_id) {
            return res.status(403).json({ error: 'Access denied: You are not the assigned doctor for this appointment.' });
        }

        const [doctorsRes, patientsRes] = await Promise.all([
            db.query('SELECT * FROM users WHERE id = $1', [appointment.doctor_id]),
            db.query('SELECT * FROM users WHERE id = $1', [appointment.patient_id])
        ]);
        if (doctorsRes.rows.length === 0 || patientsRes.rows.length === 0) {
            return res.status(404).json({ error: 'Doctor or Patient not found.' });
        }
        const doctor = doctorsRes.rows[0];
        const patient = patientsRes.rows[0];

        const prescriptionsArray = prescriptions ? prescriptions.split(',').map(p => p.trim()).filter(p => p !== '') : [];

        // Generate SHA-256 hash of the consultation record details
        const consultationDetails = symptoms + diagnosis + treatment + notes + prescriptionsArray.join(',') + (labRequest || '');
        const consultationHash = crypto.createHash('sha256').update(consultationDetails).digest('hex');

        const timestamp = getKenyanTimestamp();

        // Sign the record using Doctor's Private Key
        console.log(`Doctor ${doctor.name} is signing consultation record cryptographically...`);
        const signature = signRecord(doctor.private_key, { txType: 'consultation', patientId: appointment.patient_id, consultationHash, timestamp });

        const transactionHash = crypto.createHash('sha256').update(signature + timestamp).digest('hex');

        // Create encrypted values
        const encryptedDiagnosis = encrypt(diagnosis);
        const encryptedTreatment = encrypt(treatment);

        const consultationOrgId = appointment.organization_id || doctor.organization_id || null;

        // Create consultation record in PostgreSQL records table
        const { rows: newRecords } = await db.query(
            `INSERT INTO records (organization_id, patient_id, doctor_id, doctor_name, diagnosis, treatment, prescriptions, record_type, symptoms, notes, lab_request, consultation_hash, transaction_hash, signature, doctor_public_key, timestamp) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
            [consultationOrgId, appointment.patient_id, appointment.doctor_id, doctor.name, encryptedDiagnosis, encryptedTreatment, JSON.stringify(prescriptionsArray), 'consultation', symptoms, notes, labRequest, consultationHash, transactionHash, signature, doctor.public_key, timestamp]
        );
        const newRecord = newRecords[0];

        // Perform appointment status update and audit log in parallel
        await Promise.all([
            db.query("UPDATE appointments SET status = 'Completed' WHERE id = $1", [appointmentId]),
            db.query(
                `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [consultationOrgId, 'consultation_complete', appointment.patient_id, patient.name, appointment.doctor_id, doctor.name, `Dr. ${doctor.name} completed consultation for ${patient.name}.`, timestamp]
            )
        ]);

        // Construct blockchain pending record payload
        const pendingRecord = {
            recordId: newRecord.id,
            organizationId: consultationOrgId,
            txType: 'consultation',
            patientId: appointment.patient_id,
            patientName: patient.name,
            doctorId: appointment.doctor_id,
            doctorName: doctor.name,
            diagnosis,
            treatment,
            prescriptions: prescriptionsArray,
            ipfsHash: '',
            signature,
            doctorPublicKey: doctor.public_key,
            timestamp,
            consultationHash,
            transactionHash
        };

        if (healthBlockchain && typeof healthBlockchain.addRecord === 'function') {
            healthBlockchain.addRecord(pendingRecord);
        }
        if (checkMempoolThreshold && typeof checkMempoolThreshold === 'function') {
            checkMempoolThreshold();
        }

        // Return updated record
        const responseRecord = {
            id: newRecord.id,
            patientId: newRecord.patient_id,
            doctorId: newRecord.doctor_id,
            doctorName: newRecord.doctor_name,
            diagnosis: diagnosis,
            treatment: treatment,
            prescriptions: newRecord.prescriptions,
            recordType: newRecord.record_type,
            symptoms: newRecord.symptoms,
            notes: newRecord.notes,
            labRequest: newRecord.lab_request,
            consultationHash: newRecord.consultation_hash,
            transactionHash: newRecord.transaction_hash,
            signature: newRecord.signature,
            doctorPublicKey: newRecord.doctor_public_key,
            isMined: false,
            blockIndex: -1,
            timestamp: newRecord.timestamp
        };

        res.status(201).json({ success: true, message: 'Consultation completed, signed, and broadcast to Ledger Pool!', record: responseRecord });
    } catch (err) {
        console.error('Consultation completion error:', err);
        res.status(err.statusCode || 500).json({ error: err.message });
    }
}

module.exports = {
    bookAppointment,
    getAppointments,
    updateAppointmentStatus,
    updateDoctorAvailability,
    completeConsultation
};
