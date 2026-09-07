const crypto = require('crypto');
const db = require('../db');
const appointmentsRepo = require('../repositories/appointmentsRepository');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { getKenyanTimestamp, signRecord } = require('../blockchain');
const {
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
const bookAppointment = catchAsync(async (req, res) => {
    const authUser = verifyAuthToken(req);
    let { doctorId, date, time, reason, patientId, organizationId } = req.body;

    // If patient, strictly enforce booking only under their own authenticated identity
    if (authUser.role === 'patient') {
        patientId = authUser.id;
    } else if (!patientId) {
        patientId = authUser.id;
    }

    const [patient, doctor] = await Promise.all([
        appointmentsRepo.findUserById(patientId),
        appointmentsRepo.findUserById(doctorId)
    ]);

    if (!patient || !doctor) {
        throw new AppError('Patient or Doctor not found.', 404);
    }

    // Prevent duplicate appointment bookings and doctor double-booking (Uses idx_appointments_doc_date_status)
    const existingAppt = await appointmentsRepo.findExistingAppointmentSlot(doctorId, date, time);
    if (existingAppt) {
        throw new AppError('An appointment request at this date and time already exists.', 400);
    }

    // Doctor Availability Validation
    const availability = doctor.doctor_profile?.availability || {
        status: 'available',
        workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        workingHoursStart: '08:00',
        workingHoursEnd: '17:00'
    };

    if (availability.status === 'busy') {
        throw new AppError(`Appointment booking is currently disabled because Dr. ${doctor.name} is busy.`, 400);
    }
    if (availability.status === 'on leave') {
        throw new AppError(`Appointment booking is currently disabled because Dr. ${doctor.name} is on leave.`, 400);
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
        throw new AppError('You cannot book an appointment in a past year.', 400);
    }
    if (year === currentYear) {
        if (month < currentMonth) {
            throw new AppError('You cannot book an appointment for a month that has already passed.', 400);
        }
        if (month === currentMonth && day < currentDay) {
            throw new AppError('You cannot book an appointment for a date that has already passed.', 400);
        }
    }

    const dateObj = new Date(Date.UTC(year, month, day));
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = weekdays[dateObj.getUTCDay()];

    if (!availability.workingDays.includes(dayOfWeek)) {
        throw new AppError(`Dr. ${doctor.name} is not available on ${dayOfWeek}s. Available days: ${availability.workingDays.join(', ')}`, 400);
    }

    // Validate working hours
    if (time < availability.workingHoursStart || time > availability.workingHoursEnd) {
        throw new AppError(
            `Appointments must be booked during working hours: ${formatTime12hBackend(availability.workingHoursStart)} to ${formatTime12hBackend(availability.workingHoursEnd)}.`,
            400
        );
    }

    // Determine target hospital facility
    const targetOrgId = organizationId || doctor.organization_id;

    // Auto-enroll patient into the hospital facility via tenant_memberships
    if (targetOrgId) {
        await appointmentsRepo.createTenantMembership({
            userId: patientId,
            organizationId: targetOrgId,
            role: 'patient',
            status: 'active'
        });
    }

    const createdAt = getKenyanTimestamp();
    const appointment = await appointmentsRepo.createAppointment({
        patientId,
        doctorId,
        patientName: patient.name,
        doctorName: doctor.name,
        date,
        time,
        reason,
        status: 'Pending',
        createdAt,
        organizationId: targetOrgId
    });

    // Audit Log Entry with organization context (in background)
    appointmentsRepo.createAuditLog({
        organizationId: targetOrgId,
        eventType: 'appointment_request',
        patientId,
        patientName: patient.name,
        doctorId,
        doctorName: doctor.name,
        details: `Patient ${patient.name} requested an appointment with Dr. ${doctor.name} on ${date} at ${time}.`,
        timestamp: createdAt
    }).catch(err => console.error('Failed to log appointment request audit:', err));

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
});

/**
 * Fetch appointments filtered by user role
 * GET /api/appointments
 */
const getAppointments = catchAsync(async (req, res) => {
    const authUser = verifyAuthToken(req);
    let targetOrgId = null;

    if (authUser.role === 'admin') {
        const scope = getRequesterOrgScope(req);
        targetOrgId = scope.targetOrgId;
    } else if (authUser.role === 'super_admin') {
        targetOrgId = req.headers['x-organization-id'] || req.query.orgId || req.query.organizationId || null;
    } else if (authUser.role !== 'patient' && authUser.role !== 'doctor') {
        throw new AppError('Access denied: Invalid requester role.', 403);
    }

    const appointments = await appointmentsRepo.getAppointments({
        role: authUser.role,
        userId: authUser.id,
        orgId: targetOrgId
    });

    res.json(appointments);
});

/**
 * Update appointment status
 * POST /api/appointments/:id/status
 */
const updateAppointmentStatus = catchAsync(async (req, res) => {
    const authUser = verifyAuthToken(req);
    const { status } = req.body;
    const appointmentId = req.params.id;

    const appointment = await appointmentsRepo.findAppointmentById(appointmentId);
    if (!appointment) {
        throw new AppError('Appointment not found.', 404);
    }

    // Access Control: Doctor can update their appointments; patient can decline their own; admin of org can update; super_admin can update
    const isDoctor = authUser.role === 'doctor' && authUser.id === appointment.doctor_id;
    const isPatient = authUser.role === 'patient' && authUser.id === appointment.patient_id;
    const isAdmin = authUser.role === 'admin' && authUser.organization_id === appointment.organization_id;
    const isSuperAdmin = authUser.role === 'super_admin';

    if (!isDoctor && !isPatient && !isAdmin && !isSuperAdmin) {
        throw new AppError('Access denied: You are not authorized to update this appointment.', 403);
    }

    if (isPatient && status !== 'Declined') {
        throw new AppError('Patients can only cancel (decline) their own appointments.', 403);
    }

    const updatedAppointment = await appointmentsRepo.updateAppointmentStatus(appointmentId, status);

    // Audit Log Entry (in background)
    const eventType = status === 'Confirmed' ? 'appointment_confirm' : (status === 'Declined' ? 'appointment_decline' : 'appointment_complete');
    appointmentsRepo.createAuditLog({
        organizationId: updatedAppointment.organization_id || null,
        eventType,
        patientId: updatedAppointment.patient_id,
        patientName: updatedAppointment.patient_name,
        doctorId: updatedAppointment.doctor_id,
        doctorName: updatedAppointment.doctor_name,
        details: `Appointment status updated to ${status} for ${updatedAppointment.patient_name} with Dr. ${updatedAppointment.doctor_name}.`
    }).catch(err => console.error('Failed to log appointment status update audit:', err));

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
});

/**
 * Update doctor availability status and working hours/days
 * PUT /api/users/doctor/availability
 */
const updateDoctorAvailability = catchAsync(async (req, res) => {
    const authUser = verifyAuthToken(req);
    const { doctorId, workingDays, workingHoursStart, workingHoursEnd, status } = req.body;

    const targetDoctorId = doctorId || authUser.id;
    if (authUser.role !== 'doctor' && authUser.role !== 'super_admin') {
        throw new AppError('Access denied: Only doctors can update their availability schedule.', 403);
    }
    if (authUser.role === 'doctor' && authUser.id !== targetDoctorId) {
        throw new AppError('Access denied: You cannot modify availability for another doctor.', 403);
    }

    const doctor = await appointmentsRepo.findUserById(targetDoctorId);
    if (!doctor || doctor.role !== 'doctor') {
        throw new AppError('Doctor not found.', 404);
    }

    let profile = doctor.doctor_profile || {};
    profile.availability = {
        workingDays: workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        workingHoursStart: workingHoursStart || '08:00',
        workingHoursEnd: workingHoursEnd || '17:00',
        status: status || 'available'
    };

    const updatedDoctor = await appointmentsRepo.updateDoctorAvailability(targetDoctorId, profile);

    // Log the change in the audit trail (in background)
    appointmentsRepo.createAuditLog({
        organizationId: doctor.organization_id || null,
        eventType: 'availability_update',
        doctorId: updatedDoctor.id,
        doctorName: updatedDoctor.name,
        details: `Dr. ${updatedDoctor.name} updated availability: Days: ${profile.availability.workingDays.join(', ')}, Hours: ${profile.availability.workingHoursStart} - ${profile.availability.workingHoursEnd}, Status: ${profile.availability.status}.`
    }).catch(err => console.error('Failed to log availability update audit:', err));

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
});

/**
 * Complete a consultation (Doctor only)
 * POST /api/consultations
 * Preserves multi-step database transaction pattern across record creation, appointment update, and audit log.
 */
async function completeConsultation(req, res, dependencies = {}) {
    const { healthBlockchain = null, checkMempoolThreshold = null } = dependencies;
    const authUser = verifyAuthToken(req);
    if (authUser.role !== 'doctor' && authUser.role !== 'super_admin') {
        throw new AppError('Access denied: Only clinical doctors can complete consultations.', 403);
    }

    const appointmentId = req.body?.appointmentId || req.params?.id;
    const { symptoms = '', diagnosis = '', treatment = '', notes = '', prescriptions, labRequest } = req.body || {};

    const appointment = await appointmentsRepo.findAppointmentById(appointmentId);
    if (!appointment) {
        throw new AppError('Appointment not found.', 404);
    }

    if (authUser.role === 'doctor' && authUser.id !== appointment.doctor_id) {
        throw new AppError('Access denied: You are not the assigned doctor for this appointment.', 403);
    }

    const [doctor, patient] = await Promise.all([
        appointmentsRepo.findUserById(appointment.doctor_id),
        appointmentsRepo.findUserById(appointment.patient_id)
    ]);

    if (!doctor || !patient) {
        throw new AppError('Doctor or Patient not found.', 404);
    }

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

    // Multi-step atomic transaction: record creation + appointment status update + audit log
    const client = await db.pool.connect();
    let newRecord;
    try {
        await client.query('BEGIN;');

        newRecord = await appointmentsRepo.createConsultationNoteRecord({
            organizationId: consultationOrgId,
            patientId: appointment.patient_id,
            doctorId: appointment.doctor_id,
            doctorName: doctor.name,
            diagnosis: encryptedDiagnosis,
            treatment: encryptedTreatment,
            prescriptions: prescriptionsArray,
            recordType: 'consultation',
            symptoms,
            notes,
            labRequest,
            consultationHash,
            transactionHash,
            signature,
            doctorPublicKey: doctor.public_key,
            timestamp
        }, client);

        await appointmentsRepo.updateAppointmentStatus(appointmentId, 'Completed', client);

        await appointmentsRepo.createAuditLog({
            organizationId: consultationOrgId,
            eventType: 'consultation_complete',
            patientId: appointment.patient_id,
            patientName: patient.name,
            doctorId: appointment.doctor_id,
            doctorName: doctor.name,
            details: `Dr. ${doctor.name} completed consultation for ${patient.name}.`,
            timestamp
        }, client);

        await client.query('COMMIT;');
    } catch (txErr) {
        await client.query('ROLLBACK;');
        throw txErr;
    } finally {
        client.release();
    }

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
}

module.exports = {
    bookAppointment,
    getAppointments,
    updateAppointmentStatus,
    updateDoctorAvailability,
    completeConsultation
};
