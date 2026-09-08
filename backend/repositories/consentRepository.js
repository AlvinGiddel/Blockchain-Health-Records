/**
 * Patient Consents Domain Data Repository
 * PostgreSQL data access for patient consent grants, scope delegation, and revocations.
 */

const db = require('../db');

/**
 * Create a new patient consent grant
 * @param {object} params
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function createConsent({
    patientId,
    granteeType,
    doctorId = null,
    organizationId = null,
    scope = 'full_record',
    expiresAt = null,
    purpose = 'Clinical Care & Consultation',
    transactionHash = null
}, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        INSERT INTO patient_consents (
            patient_id,
            grantee_type,
            doctor_id,
            organization_id,
            scope,
            status,
            expires_at,
            purpose,
            transaction_hash
        ) VALUES ($1, $2, $3, $4, $5, 'active', $6, $7, $8)
        RETURNING *;
    `, [
        patientId,
        granteeType,
        doctorId,
        organizationId,
        scope,
        expiresAt,
        purpose,
        transactionHash
    ]);
    return rows[0];
}

/**
 * Fetch active and historical consents for a patient with doctor/org details
 * @param {string} patientId
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getConsentsByPatient(patientId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        SELECT 
            c.id,
            c.patient_id as "patientId",
            c.grantee_type as "granteeType",
            c.doctor_id as "doctorId",
            d.name as "doctorName",
            d.doctor_profile->>'specialization' as "doctorSpecialization",
            c.organization_id as "organizationId",
            o.name as "organizationName",
            c.scope,
            c.status,
            c.granted_at as "grantedAt",
            c.expires_at as "expiresAt",
            c.revoked_at as "revokedAt",
            c.revocation_reason as "revocationReason",
            c.purpose,
            c.transaction_hash as "transactionHash",
            c.created_at as "createdAt"
        FROM patient_consents c
        LEFT JOIN users d ON c.doctor_id = d.id
        LEFT JOIN organizations o ON c.organization_id = o.id
        WHERE c.patient_id = $1
        ORDER BY c.created_at DESC;
    `, [patientId]);
    return rows;
}

/**
 * Fetch consents granted to a specific doctor
 * @param {string} doctorId
 * @param {string} [organizationId]
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getConsentsForDoctor(doctorId, organizationId = null, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        SELECT 
            c.id,
            c.patient_id as "patientId",
            p.name as "patientName",
            p.email as "patientEmail",
            c.grantee_type as "granteeType",
            c.scope,
            c.status,
            c.granted_at as "grantedAt",
            c.expires_at as "expiresAt",
            c.purpose,
            c.transaction_hash as "transactionHash"
        FROM patient_consents c
        JOIN users p ON c.patient_id = p.id
        WHERE (c.doctor_id = $1 OR (c.organization_id = $2 AND $2 IS NOT NULL))
          AND c.status = 'active'
          AND (c.expires_at IS NULL OR c.expires_at > NOW())
        ORDER BY c.granted_at DESC;
    `, [doctorId, organizationId]);
    return rows;
}

/**
 * Find consent by ID
 * @param {string} consentId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findConsentById(consentId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query('SELECT * FROM patient_consents WHERE id = $1', [consentId]);
    return rows[0] || null;
}

/**
 * Revoke a consent grant
 * @param {string} consentId
 * @param {string} patientId
 * @param {string} reason
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function revokeConsent(consentId, patientId, reason = 'Revoked by patient', client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        UPDATE patient_consents
        SET status = 'revoked',
            revoked_at = NOW(),
            revocation_reason = $1,
            updated_at = NOW()
        WHERE id = $2 AND patient_id = $3
        RETURNING *;
    `, [reason, consentId, patientId]);
    return rows[0] || null;
}

/**
 * Check if active consent exists between a patient and doctor
 * @param {string} patientId
 * @param {string} doctorId
 * @param {object} [client]
 * @returns {Promise<boolean>}
 */
async function hasActiveConsent(patientId, doctorId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        SELECT 1 FROM patient_consents
        WHERE patient_id = $1
          AND (doctor_id = $2 OR organization_id IN (SELECT organization_id FROM users WHERE id = $2 AND organization_id IS NOT NULL))
          AND status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1;
    `, [patientId, doctorId]);
    return rows.length > 0;
}

module.exports = {
    createConsent,
    getConsentsByPatient,
    getConsentsForDoctor,
    findConsentById,
    revokeConsent,
    hasActiveConsent
};
