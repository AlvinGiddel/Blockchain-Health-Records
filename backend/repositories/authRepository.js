/**
 * Auth Domain Data Repository
 *
 * Encapsulates all PostgreSQL data access for authentication, registration,
 * tenant onboarding, credential lifecycle, and emergency break-glass authorization.
 * Supports multi-step database transactions via the optional `client` parameter.
 */

const db = require('../db');

/**
 * Fetch all user profiles to check for phone number availability
 * @param {object} [client] - Optional transactional database client
 * @returns {Promise<Array>}
 */
async function getAllUserProfilesForPhoneCheck(client = null) {
    const runner = client || db;
    const { rows } = await runner.query('SELECT patient_profile, doctor_profile FROM users');
    return rows;
}

/**
 * Find an active/trial healthcare organization by ID (excluding placeholder unassigned)
 * @param {string} orgId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findActiveOrganizationById(orgId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        "SELECT id, name, status, license_expires_at FROM organizations WHERE id = $1 AND status IN ('active', 'trial') AND LOWER(name) NOT LIKE '%unassigned%'",
        [orgId]
    );
    return rows[0] || null;
}

/**
 * Find an organization by name (case-insensitive)
 * @param {string} name
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findOrganizationByName(name, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'SELECT id, name, status FROM organizations WHERE LOWER(name) = LOWER($1)',
        [name]
    );
    return rows[0] || null;
}

/**
 * Find an organization by ID
 * @param {string} id
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findOrganizationById(id, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'SELECT id, name, status, license_expires_at FROM organizations WHERE id = $1',
        [id]
    );
    return rows[0] || null;
}

/**
 * Find user by email (case-insensitive)
 * @param {string} email
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findUserByEmail(email, client = null) {
    const runner = client || db;
    const cleanEmail = email.toLowerCase().trim();
    const { rows } = await runner.query('SELECT * FROM users WHERE LOWER(email) = $1', [cleanEmail]);
    return rows[0] || null;
}

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
 * Find existing users with same email excluding a given user ID
 * @param {string} email
 * @param {string} excludeUserId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findOtherUserByEmail(email, excludeUserId, client = null) {
    const runner = client || db;
    const cleanEmail = email.toLowerCase().trim();
    const { rows } = await runner.query('SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2', [cleanEmail, excludeUserId]);
    return rows[0] || null;
}

/**
 * Create a new user record (patient, doctor, or admin)
 * @param {object} userData
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function createUser({
    name,
    email,
    password,
    role,
    publicKey,
    privateKey,
    isApproved = true,
    isRejected = false,
    organizationId = null,
    patientProfile = null,
    doctorProfile = null,
    createdAt = null
}, client = null) {
    const runner = client || db;
    const query = `
        INSERT INTO users (
            name, email, password, role, public_key, private_key, 
            is_approved, is_rejected, organization_id, 
            patient_profile, doctor_profile, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, NOW()))
        RETURNING *;
    `;
    const params = [
        name,
        email.toLowerCase().trim(),
        password,
        role,
        publicKey,
        privateKey,
        isApproved,
        isRejected,
        organizationId,
        patientProfile ? (typeof patientProfile === 'string' ? patientProfile : JSON.stringify(patientProfile)) : null,
        doctorProfile ? (typeof doctorProfile === 'string' ? doctorProfile : JSON.stringify(doctorProfile)) : null,
        createdAt
    ];
    const { rows } = await runner.query(query, params);
    return rows[0];
}

/**
 * Create or link a tenant membership
 * @param {object} membershipData
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function createTenantMembership({
    userId,
    organizationId,
    role,
    status = 'active'
}, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `INSERT INTO tenant_memberships (user_id, organization_id, role, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, organization_id) DO UPDATE SET status = EXCLUDED.status, role = EXCLUDED.role
         RETURNING *;`,
        [userId, organizationId, role, status]
    );
    return rows[0];
}

/**
 * Create an organization record
 * @param {object} orgData
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function createOrganization({
    name,
    slug,
    status = 'pending_approval',
    licenseExpiresAt = null
}, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `INSERT INTO organizations (name, slug, status, license_expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING *;`,
        [name, slug, status, licenseExpiresAt]
    );
    return rows[0];
}

/**
 * Update user password
 * @param {string} id
 * @param {string} hash
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function updateUserPassword(id, hash, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'UPDATE users SET password = $1 WHERE id = $2 RETURNING id, name, email, role',
        [hash, id]
    );
    return rows[0];
}

/**
 * Update user email address
 * @param {string} id
 * @param {string} email
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function updateUserEmail(id, email, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `UPDATE users 
         SET email = $1 
         WHERE id = $2 
         RETURNING id, name, email, role, public_key as "publicKey", patient_profile as "patientProfile", doctor_profile as "doctorProfile", is_approved as "isApproved"`,
        [email.toLowerCase().trim(), id]
    );
    return rows[0];
}

/**
 * Set password reset token and expiration
 * @param {string} id
 * @param {string} token
 * @param {Date} expiry
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function setResetToken(id, token, expiry, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE id = $3 RETURNING id',
        [token, expiry, id]
    );
    return rows[0];
}

/**
 * Find user with valid, unexpired reset token
 * @param {string} token
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findUserByResetToken(token, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'SELECT * FROM users WHERE reset_password_token = $1 AND reset_password_expires > NOW()',
        [token]
    );
    return rows[0] || null;
}

/**
 * Clear reset token and set new password
 * @param {string} id
 * @param {string} hashedPassword
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function completePasswordReset(id, hashedPassword, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'UPDATE users SET password = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2 RETURNING id, email',
        [hashedPassword, id]
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
        `INSERT INTO audit_logs (
            organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))
        RETURNING *;`,
        [organizationId, eventType, patientId, patientName, doctorId, doctorName, details, timestamp]
    );
    return rows[0];
}

/**
 * Fetch active emergency break-glass override (< 1 hour ago)
 * @param {string} doctorId
 * @param {string} patientId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function getBreakGlassStatus(doctorId, patientId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `SELECT * FROM audit_logs 
         WHERE event_type = 'emergency_break_glass' AND doctor_id = $1 AND patient_id = $2 
           AND timestamp >= NOW() - INTERVAL '1 hour' 
         ORDER BY timestamp DESC LIMIT 1`,
        [doctorId, patientId]
    );
    return rows[0] || null;
}

/**
 * Get active tenant memberships for a user
 * @param {string} userId
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getUserMemberships(userId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `SELECT tm.organization_id as "organizationId", o.name as "organizationName", tm.role, tm.status
         FROM tenant_memberships tm
         JOIN organizations o ON tm.organization_id = o.id
         WHERE tm.user_id = $1 AND tm.status = 'active';`,
        [userId]
    );
    return rows;
}

/**
 * Seed Genesis block for a newly created organization
 * @param {object} blockData
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function createGenesisBlock({
    organizationId,
    timestamp,
    records,
    previousHash = '0',
    nonce,
    hash
}, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `INSERT INTO blocks (organization_id, index, timestamp, records, previous_hash, nonce, hash)
         VALUES ($1, 0, $2, $3, $4, $5, $6)
         RETURNING *;`,
        [organizationId, timestamp, typeof records === 'string' ? records : JSON.stringify(records), previousHash, nonce.toString(), hash]
    );
    return rows[0];
}

/**
 * Create license entry for organization
 * @param {object} licenseData
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function createLicense({
    organizationId,
    clientId,
    status = 'pending_approval',
    expiresAt = null
}, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `INSERT INTO licenses (organization_id, client_id, status, expires_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         RETURNING *;`,
        [organizationId, clientId, status, expiresAt]
    );
    return rows[0];
}

/**
 * Get facility admins for alert notification
 * @param {string} orgId
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getFacilityAdmins(orgId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `SELECT DISTINCT u.name, u.email 
         FROM users u
         LEFT JOIN tenant_memberships tm ON tm.user_id = u.id
         WHERE (u.organization_id = $1 OR tm.organization_id = $1)
           AND (u.role = 'admin' OR tm.role = 'admin')
           AND u.email IS NOT NULL;`,
        [orgId]
    );
    return rows;
}

/**
 * Get super admin recipient email
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function getSuperAdmin(client = null) {
    const runner = client || db;
    const { rows } = await runner.query("SELECT name, email FROM users WHERE role = 'super_admin' LIMIT 1;");
    return rows[0] || null;
}

/**
 * Transition organization and license trial to expired
 * @param {string} orgId
 * @param {object} [client]
 */
async function expireOrganizationTrial(orgId, client = null) {
    const runner = client || db;
    await runner.query("UPDATE organizations SET status = 'expired', updated_at = NOW() WHERE id = $1;", [orgId]);
    await runner.query("UPDATE licenses SET status = 'expired', updated_at = NOW() WHERE organization_id = $1;", [orgId]);
}

/**
 * Fetch all users with basic profile for registration duplicate checking
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getAllUsersForDuplicateCheck(client = null) {
    const runner = client || db;
    const { rows } = await runner.query('SELECT id, name, email, role, patient_profile, doctor_profile FROM users');
    return rows;
}

/**
 * Find user by ID and Role
 * @param {string} id
 * @param {string} role
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findUserByIdAndRole(id, role, client = null) {
    const runner = client || db;
    const { rows } = await runner.query('SELECT * FROM users WHERE id = $1 AND role = $2', [id, role]);
    return rows[0] || null;
}

/**
 * Get first active organization membership for user
 * @param {string} userId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function getFirstActiveMembership(userId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        "SELECT organization_id FROM tenant_memberships WHERE user_id = $1 AND status = 'active' ORDER BY joined_at ASC LIMIT 1;",
        [userId]
    );
    return rows[0] || null;
}

/**
 * Update user's organization_id
 * @param {string} userId
 * @param {string} organizationId
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function updateUserOrganizationId(userId, organizationId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'UPDATE users SET organization_id = $1 WHERE id = $2 RETURNING id, organization_id',
        [organizationId, userId]
    );
    return rows[0] || null;
}

module.exports = {
    getAllUserProfilesForPhoneCheck,
    getAllUsersForDuplicateCheck,
    findActiveOrganizationById,
    findOrganizationByName,
    findOrganizationById,
    findUserByEmail,
    findUserById,
    findUserByIdAndRole,
    findOtherUserByEmail,
    createUser,
    createTenantMembership,
    createOrganization,
    updateUserPassword,
    updateUserEmail,
    updateUserOrganizationId,
    getFirstActiveMembership,
    setResetToken,
    findUserByResetToken,
    completePasswordReset,
    createAuditLog,
    getBreakGlassStatus,
    getUserMemberships,
    createGenesisBlock,
    createLicense,
    getFacilityAdmins,
    getSuperAdmin,
    expireOrganizationTrial
};
