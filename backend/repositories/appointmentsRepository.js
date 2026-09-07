/**
 * Appointments Domain Data Repository
 *
 * Encapsulates all PostgreSQL data access for appointments, consultations,
 * doctor availability, and clinic tenant memberships.
 * Supports multi-step database transactions via the optional `client` parameter.
 */

const db = require('../db');

/**
 * Find user by ID
 * @param {string} id
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findUserById(id, client = null) {
    const runner = client || db;
    const { rows } = await runner.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] || null;
}

/**
 * Check if an active appointment slot already exists for doctor on date/time
 * @param {string} doctorId
 * @param {string} date
 * @param {string} time
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findExistingAppointmentSlot(doctorId, date, time, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `SELECT id FROM appointments 
         WHERE doctor_id = $1 AND date = $2 AND time = $3 AND status != 'Declined'`,
        [doctorId, date, time]
    );
    return rows[0] || null;
}

/**
 * Find tenant membership for user and organization
 * @param {string} userId
 * @param {string} orgId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findTenantMembership(userId, orgId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'SELECT * FROM tenant_memberships WHERE user_id = $1 AND organization_id = $2',
        [userId, orgId]
    );
    return rows[0] || null;
}

/**
 * Auto-enroll or update tenant membership
 * @param {object} membershipData
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function createTenantMembership({
    userId,
    organizationId,
    role = 'patient',
    status = 'active'
}, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `INSERT INTO tenant_memberships (user_id, organization_id, role, status, joined_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (user_id, organization_id)
         DO UPDATE SET status = EXCLUDED.status
         RETURNING *;`,
        [userId, organizationId, role, status]
    );
    return rows[0];
}

/**
 * Create a new appointment
 * @param {object} appointmentData
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function createAppointment({
    patientId,
    doctorId,
    patientName,
    doctorName,
    date,
    time,
    reason,
    status = 'Pending',
    createdAt,
    organizationId = null
}, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `INSERT INTO appointments (patient_id, doctor_id, patient_name, doctor_name, date, time, reason, status, created_at, organization_id) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
         RETURNING *;`,
        [patientId, doctorId, patientName, doctorName, date, time, reason, status, createdAt, organizationId]
    );
    return rows[0];
}

/**
 * Create immutable audit log entry
 * @param {object} logData
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function createAuditLog({
    organizationId = null,
    eventType,
    patientId = null,
    patientName = null,
    doctorId = null,
    doctorName = null,
    details,
    timestamp = null
}, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW())) 
         RETURNING *;`,
        [organizationId, eventType, patientId, patientName, doctorId, doctorName, details, timestamp]
    );
    return rows[0];
}

/**
 * Fetch appointments scoped by role, user ID, or organization
 * @param {object} params
 * @param {string} params.role
 * @param {string} [params.userId]
 * @param {string} [params.orgId]
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getAppointments({ role, userId, orgId }, client = null) {
    const runner = client || db;
    let query = `
        SELECT a.id, a.patient_id as "patientId", a.doctor_id as "doctorId", a.patient_name as "patientName", 
               a.doctor_name as "doctorName", a.date, a.time, a.reason, a.status, a.created_at as "createdAt",
               a.organization_id as "organizationId", o.name as "organizationName"
        FROM appointments a
        LEFT JOIN organizations o ON a.organization_id = o.id
    `;
    const params = [];

    if (role === 'patient') {
        query += ' WHERE a.patient_id = $1';
        params.push(userId);
    } else if (role === 'doctor') {
        query += ' WHERE a.doctor_id = $1';
        params.push(userId);
    } else if (role === 'admin') {
        if (orgId) {
            query += ' WHERE a.organization_id = $1';
            params.push(orgId);
        }
    } else if (role === 'super_admin') {
        if (orgId) {
            query += ' WHERE a.organization_id = $1';
            params.push(orgId);
        }
    }

    query += ' ORDER BY a.created_at DESC';
    const { rows } = await runner.query(query, params);
    return rows;
}

/**
 * Find appointment by ID
 * @param {string} id
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findAppointmentById(id, client = null) {
    const runner = client || db;
    const { rows } = await runner.query('SELECT * FROM appointments WHERE id = $1', [id]);
    return rows[0] || null;
}

/**
 * Update status of an appointment
 * @param {string} id
 * @param {string} status
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function updateAppointmentStatus(id, status, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *',
        [status, id]
    );
    return rows[0] || null;
}

/**
 * Update doctor availability schedule in doctor_profile
 * @param {string} doctorId
 * @param {object} doctorProfile
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function updateDoctorAvailability(doctorId, doctorProfile, client = null) {
    const runner = client || db;
    const profileJson = typeof doctorProfile === 'string' ? doctorProfile : JSON.stringify(doctorProfile);
    const { rows } = await runner.query(
        'UPDATE users SET doctor_profile = $1 WHERE id = $2 RETURNING *',
        [profileJson, doctorId]
    );
    return rows[0] || null;
}

/**
 * Create consultation medical record entry
 * @param {object} recordData
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function createConsultationNoteRecord({
    organizationId,
    patientId,
    doctorId,
    doctorName,
    diagnosis,
    treatment,
    prescriptions,
    recordType = 'consultation',
    symptoms,
    notes,
    labRequest,
    consultationHash,
    transactionHash,
    signature,
    doctorPublicKey,
    timestamp
}, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `INSERT INTO records (organization_id, patient_id, doctor_id, doctor_name, diagnosis, treatment, prescriptions, record_type, symptoms, notes, lab_request, consultation_hash, transaction_hash, signature, doctor_public_key, timestamp) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) 
         RETURNING *;`,
        [
            organizationId,
            patientId,
            doctorId,
            doctorName,
            diagnosis,
            treatment,
            typeof prescriptions === 'string' ? prescriptions : JSON.stringify(prescriptions),
            recordType,
            symptoms,
            notes,
            labRequest,
            consultationHash,
            transactionHash,
            signature,
            doctorPublicKey,
            timestamp
        ]
    );
    return rows[0];
}

module.exports = {
    findUserById,
    findExistingAppointmentSlot,
    findTenantMembership,
    createTenantMembership,
    createAppointment,
    createAuditLog,
    getAppointments,
    findAppointmentById,
    updateAppointmentStatus,
    updateDoctorAvailability,
    createConsultationNoteRecord
};
