/**
 * Super Admin & User Management Domain Data Repository
 *
 * Encapsulates all PostgreSQL data access for platform governance,
 * audit trail inspection, public health analytics, doctor/admin approval workflows,
 * tenant user directories, and scoped user deletion with ledger rebuilding.
 * Supports multi-step transactions via the optional `client` parameter.
 */

const db = require('../db');

/**
 * Get audit logs scoped to organization or global
 * @param {object} params
 * @param {string} [params.orgId]
 * @param {boolean} [params.isSuperAdmin]
 * @param {string} [params.patientId]
 * @param {number} [params.limit]
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getAuditLogs({ orgId, isSuperAdmin, patientId, limit }, client = null) {
    const runner = client || db;
    let query = 'SELECT id, event_type as "eventType", patient_id as "patientId", patient_name as "patientName", doctor_id as "doctorId", doctor_name as "doctorName", details, timestamp, is_mined as "isMined", block_index as "blockIndex", signature FROM audit_logs';
    const conditions = [];
    const params = [];

    if (orgId) {
        params.push(orgId);
        conditions.push(`organization_id = $${params.length}`);
    } else if (!isSuperAdmin) {
        return [];
    }

    if (patientId) {
        params.push(patientId);
        conditions.push(`patient_id = $${params.length}`);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY timestamp DESC';
    if (limit) {
        params.push(limit);
        query += ` LIMIT $${params.length}`;
    }

    const { rows } = await runner.query(query, params);
    return rows;
}

/**
 * Get public health analytics datasets scoped to organization or global
 * @param {object} params
 * @param {string} [params.orgId]
 * @param {boolean} [params.isSuperAdmin]
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function getPublicHealthAnalytics({ orgId, isSuperAdmin }, client = null) {
    const runner = client || db;
    let doctors = [];
    let patients = [];
    let recordsList = [];
    let blocksList = [];
    let breakGlassLogs = [];

    if (orgId) {
        const [docRes, patRes, recRes, blkRes, bgRes] = await Promise.all([
            runner.query(`
                SELECT id, name, email, role, is_approved, doctor_profile as "doctorProfile", created_at as "createdAt"
                FROM users 
                WHERE organization_id = $1 AND role = 'doctor' AND is_approved = true
                ORDER BY created_at DESC;
            `, [orgId]),
            runner.query(`
                SELECT u.id, u.name, u.email, u.role, u.patient_profile as "patientProfile", tm.joined_at as "createdAt"
                FROM users u
                JOIN tenant_memberships tm ON u.id = tm.user_id
                WHERE tm.organization_id = $1 AND tm.status = 'active' AND u.role = 'patient'
                ORDER BY tm.joined_at DESC;
            `, [orgId]),
            runner.query(`
                SELECT id, patient_id as "patientId", doctor_id as "doctorId", doctor_name as "doctorName", is_mined as "isMined", block_index as "blockIndex", timestamp 
                FROM records 
                WHERE organization_id = $1 
                ORDER BY timestamp DESC;
            `, [orgId]),
            runner.query(`
                SELECT index, hash, previous_hash as "previousHash", nonce, records, timestamp 
                FROM blocks 
                WHERE organization_id = $1 
                ORDER BY index ASC;
            `, [orgId]),
            runner.query(`
                SELECT id, patient_id as "patientId", patient_name as "patientName", doctor_id as "doctorId", doctor_name as "doctorName", details, timestamp 
                FROM audit_logs 
                WHERE organization_id = $1 AND event_type = 'emergency_break_glass' 
                ORDER BY timestamp DESC;
            `, [orgId])
        ]);

        doctors = docRes.rows;
        patients = patRes.rows;
        recordsList = recRes.rows;
        blocksList = blkRes.rows;
        breakGlassLogs = bgRes.rows;
    } else if (isSuperAdmin) {
        const [docRes, patRes, recRes, blkRes, bgRes] = await Promise.all([
            runner.query(`
                SELECT id, name, email, role, is_approved, doctor_profile as "doctorProfile", created_at as "createdAt"
                FROM users 
                WHERE role = 'doctor' AND is_approved = true
                ORDER BY created_at DESC;
            `),
            runner.query(`
                SELECT id, name, email, role, patient_profile as "patientProfile", created_at as "createdAt"
                FROM users 
                WHERE role = 'patient'
                ORDER BY created_at DESC;
            `),
            runner.query(`
                SELECT id, patient_id as "patientId", doctor_id as "doctorId", doctor_name as "doctorName", is_mined as "isMined", block_index as "blockIndex", timestamp 
                FROM records 
                ORDER BY timestamp DESC;
            `),
            runner.query(`
                SELECT index, hash, previous_hash as "previousHash", nonce, records, timestamp 
                FROM blocks 
                ORDER BY index ASC;
            `),
            runner.query(`
                SELECT id, patient_id as "patientId", patient_name as "patientName", doctor_id as "doctorId", doctor_name as "doctorName", details, timestamp 
                FROM audit_logs 
                WHERE event_type = 'emergency_break_glass' 
                ORDER BY timestamp DESC;
            `)
        ]);

        doctors = docRes.rows;
        patients = patRes.rows;
        recordsList = recRes.rows;
        blocksList = blkRes.rows;
        breakGlassLogs = bgRes.rows;
    }

    return { doctors, patients, recordsList, blocksList, breakGlassLogs };
}

/**
 * Get consolidated admin stats counts
 * @param {object} params
 * @param {string} [params.orgId]
 * @param {boolean} [params.isSuperAdmin]
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function getAdminStats({ orgId, isSuperAdmin }, client = null) {
    const runner = client || db;
    if (orgId) {
        const [aCount, pACount, cCCount, bCount, dCount, paCount, admCount] = await Promise.all([
            runner.query('SELECT count(*) FROM appointments WHERE organization_id = $1', [orgId]),
            runner.query("SELECT count(*) FROM appointments WHERE organization_id = $1 AND status = 'Pending'", [orgId]),
            runner.query("SELECT count(*) FROM records WHERE organization_id = $1 AND record_type = 'consultation'", [orgId]),
            runner.query('SELECT count(*) FROM blocks WHERE organization_id = $1', [orgId]),
            runner.query("SELECT count(*) FROM users WHERE organization_id = $1 AND role = 'doctor' AND is_approved = true", [orgId]),
            runner.query("SELECT count(DISTINCT tm.user_id) FROM tenant_memberships tm JOIN users u ON tm.user_id = u.id WHERE tm.organization_id = $1 AND tm.status = 'active' AND u.role = 'patient'", [orgId]),
            runner.query("SELECT count(*) FROM users WHERE organization_id = $1 AND role = 'admin' AND is_approved = true", [orgId])
        ]);

        return {
            totalAppointments: parseInt(aCount.rows[0].count),
            pendingAppointments: parseInt(pACount.rows[0].count),
            completedConsultations: parseInt(cCCount.rows[0].count),
            blocks: parseInt(bCount.rows[0].count),
            mempool: 0,
            doctors: parseInt(dCount.rows[0].count),
            patients: parseInt(paCount.rows[0].count),
            admins: parseInt(admCount.rows[0]?.count || 0)
        };
    }

    if (isSuperAdmin) {
        const [aCount, pACount, cCCount, bCount, dCount, paCount, admCount] = await Promise.all([
            runner.query('SELECT count(*) FROM appointments'),
            runner.query("SELECT count(*) FROM appointments WHERE status = 'Pending'"),
            runner.query("SELECT count(*) FROM records WHERE record_type = 'consultation'"),
            runner.query('SELECT count(*) FROM blocks'),
            runner.query("SELECT count(*) FROM users WHERE role = 'doctor' AND is_approved = true"),
            runner.query("SELECT count(*) FROM users WHERE role = 'patient'"),
            runner.query("SELECT count(*) FROM users WHERE role IN ('admin', 'super_admin') AND is_approved = true")
        ]);

        return {
            totalAppointments: parseInt(aCount.rows[0].count),
            pendingAppointments: parseInt(pACount.rows[0].count),
            completedConsultations: parseInt(cCCount.rows[0].count),
            blocks: parseInt(bCount.rows[0].count),
            doctors: parseInt(dCount.rows[0].count),
            patients: parseInt(paCount.rows[0].count),
            admins: parseInt(admCount.rows[0]?.count || 0)
        };
    }

    return null;
}

/**
 * Get pending doctors
 * @param {string} [orgId]
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getPendingDoctors(orgId = null, client = null) {
    const runner = client || db;
    let query;
    let params = [];

    if (orgId) {
        query = `SELECT id, name, email, role, public_key as "publicKey", profile_photo as "profilePhoto", 
                        doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" 
                 FROM users 
                 WHERE organization_id = $1 AND role = 'doctor' AND is_approved = false AND is_rejected = false 
                 ORDER BY created_at DESC;`;
        params = [orgId];
    } else {
        query = `SELECT id, name, email, role, public_key as "publicKey", profile_photo as "profilePhoto", 
                        doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" 
                 FROM users 
                 WHERE role = 'doctor' AND is_approved = false AND is_rejected = false 
                 ORDER BY created_at DESC;`;
    }

    const { rows } = await runner.query(query, params);
    return rows;
}

/**
 * Find doctor by ID
 * @param {string} doctorId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findDoctorById(doctorId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query("SELECT * FROM users WHERE id = $1 AND role = 'doctor'", [doctorId]);
    return rows[0] || null;
}

/**
 * Update doctor approval status
 * @param {string} doctorId
 * @param {string} status - 'approve' | 'reject'
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function updateDoctorStatus(doctorId, status, client = null) {
    const runner = client || db;
    const isApproved = status === 'approve';
    const isRejected = status === 'reject';
    const membershipStatus = isApproved ? 'active' : 'disabled';

    const { rows } = await runner.query(
        'UPDATE users SET is_approved = $1, is_rejected = $2 WHERE id = $3 RETURNING *',
        [isApproved, isRejected, doctorId]
    );

    await runner.query(
        'UPDATE tenant_memberships SET status = $1 WHERE user_id = $2 AND role = \'doctor\'',
        [membershipStatus, doctorId]
    );

    return rows[0] || null;
}

/**
 * Get pending admins
 * @param {string} [orgId]
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getPendingAdmins(orgId = null, client = null) {
    const runner = client || db;
    let query;
    let params = [];

    if (orgId) {
        query = 'SELECT id, name, email, role, public_key as "publicKey", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE organization_id = $1 AND role = \'admin\' AND is_approved = false AND is_rejected = false ORDER BY created_at DESC;';
        params = [orgId];
    } else {
        query = 'SELECT id, name, email, role, public_key as "publicKey", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE role = \'admin\' AND is_approved = false AND is_rejected = false ORDER BY created_at DESC;';
    }

    const { rows } = await runner.query(query, params);
    return rows;
}

/**
 * Get all administrators
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getAllAdmins(client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        SELECT 
            u.id, 
            u.name, 
            u.email, 
            u.role, 
            u.organization_id as "organizationId", 
            COALESCE(o.name, CASE WHEN u.role = 'super_admin' THEN 'Global Platform Governance' ELSE 'Unassigned Facility' END) as "organizationName",
            o.status as "organizationStatus",
            o.license_expires_at as "licenseExpiresAt",
            u.profile_photo as "profilePhoto", 
            u.is_approved as "isApproved", 
            u.created_at as "createdAt" 
        FROM users u 
        LEFT JOIN organizations o ON u.organization_id = o.id 
        WHERE u.role IN ('admin', 'super_admin') 
        ORDER BY u.created_at DESC;
    `);
    return rows;
}

/**
 * Update administrator approval status
 * @param {string} adminId
 * @param {string} status - 'approve' | 'reject'
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function updateUserApprovalStatus(adminId, status, client = null) {
    const runner = client || db;
    const isApproved = status === 'approve';
    const isRejected = status === 'reject';

    const { rows } = await runner.query(
        'UPDATE users SET is_approved = $1, is_rejected = $2 WHERE id = $3 RETURNING *',
        [isApproved, isRejected, adminId]
    );
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
 * Delete a user by ID
 * @param {string} userId
 * @param {object} [client]
 */
async function deleteUser(userId, client = null) {
    const runner = client || db;
    await runner.query('DELETE FROM users WHERE id = $1', [userId]);
}

/**
 * Get blocks for an organization
 * @param {string} orgId
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getBlocksForOrg(orgId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'SELECT * FROM blocks WHERE organization_id = $1 ORDER BY index ASC',
        [orgId]
    );
    return rows;
}

/**
 * Delete blocks for an organization
 * @param {string} orgId
 * @param {object} [client]
 */
async function deleteBlocksForOrg(orgId, client = null) {
    const runner = client || db;
    await runner.query('DELETE FROM blocks WHERE organization_id = $1', [orgId]);
}

/**
 * Insert a block into the blockchain blocks table
 * @param {object} blockData
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function insertBlock({
    organizationId,
    index,
    timestamp,
    records,
    previousHash,
    nonce,
    hash
}, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'INSERT INTO blocks (organization_id, index, timestamp, records, previous_hash, nonce, hash) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [organizationId, index, timestamp, typeof records === 'string' ? records : JSON.stringify(records), previousHash || '0', nonce, hash]
    );
    return rows[0];
}

/**
 * Check if patient, doctor, and record exist for rebuilding blockchain
 * @param {string} patientId
 * @param {string} doctorId
 * @param {string} recordId
 * @param {object} [client]
 * @returns {Promise<boolean>}
 */
async function checkRecordEntitiesExist(patientId, doctorId, recordId, client = null) {
    const runner = client || db;
    const [pRes, dRes, rRes] = await Promise.all([
        runner.query('SELECT 1 FROM users WHERE id = $1', [patientId]),
        runner.query('SELECT 1 FROM users WHERE id = $1', [doctorId]),
        runner.query('SELECT 1 FROM records WHERE id = $1', [recordId])
    ]);
    return pRes.rows.length > 0 && dRes.rows.length > 0 && rRes.rows.length > 0;
}

/**
 * Update remaining records and audit logs in PostgreSQL with new block index for organization
 * @param {string} orgId
 * @param {number} blockIndex
 * @param {Array<string>} recordIds
 * @param {object} [client]
 */
async function updateMinedRecordsForOrg(orgId, blockIndex, recordIds, client = null) {
    const runner = client || db;
    if (!recordIds || recordIds.length === 0) return;
    await Promise.all([
        runner.query('UPDATE records SET is_mined = true, block_index = $1 WHERE id = ANY($2::uuid[]) AND organization_id = $3', [blockIndex, recordIds, orgId]),
        runner.query('UPDATE audit_logs SET is_mined = true, block_index = $1 WHERE patient_id = ANY($2::uuid[]) AND organization_id = $3', [blockIndex, recordIds, orgId])
    ]);
}

/**
 * Get patients scoped by organization or global
 * @param {object} params
 * @param {string} [params.orgId]
 * @param {boolean} [params.isSuperAdmin]
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getPatientsByOrg({ orgId, isSuperAdmin }, client = null) {
    const runner = client || db;
    let query;
    let params = [];

    if (orgId) {
        query = `
            SELECT u.id, u.name, u.email, u.role, u.public_key as "publicKey", u.profile_photo as "profilePhoto", 
                   u.patient_profile as "patientProfile", u.is_approved as "isApproved", tm.joined_at as "createdAt"
            FROM users u
            JOIN tenant_memberships tm ON u.id = tm.user_id
            WHERE tm.organization_id = $1 AND tm.status = 'active' AND u.role = 'patient'
            ORDER BY tm.joined_at DESC;
        `;
        params = [orgId];
    } else if (isSuperAdmin) {
        query = 'SELECT id, name, email, role, public_key as "publicKey", profile_photo as "profilePhoto", patient_profile as "patientProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE role = \'patient\' ORDER BY created_at DESC;';
    } else {
        return [];
    }

    const { rows } = await runner.query(query, params);
    return rows;
}

/**
 * Get doctors scoped by organization, patient membership, or global
 * @param {object} params
 * @param {string} [params.orgId]
 * @param {boolean} [params.isSuperAdmin]
 * @param {string} [params.requestedOrgId]
 * @param {boolean} [params.isPatient]
 * @param {string} [params.patientId]
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getDoctorsByOrg({ orgId, isSuperAdmin, requestedOrgId, isPatient, patientId }, client = null) {
    const runner = client || db;
    let query;
    let params = [];

    if (isPatient && patientId) {
        const { rows: mems } = await runner.query(
            "SELECT organization_id FROM tenant_memberships WHERE user_id = $1 AND status = 'active'",
            [patientId]
        );
        if (mems.length > 0) {
            const orgIds = mems.map(m => m.organization_id);
            if (requestedOrgId && orgIds.includes(requestedOrgId)) {
                query = 'SELECT id, name, email, role, organization_id as "organizationId", public_key as "publicKey", profile_photo as "profilePhoto", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE organization_id = $1 AND role = \'doctor\' AND is_approved = true ORDER BY created_at DESC;';
                params = [requestedOrgId];
            } else {
                query = 'SELECT id, name, email, role, organization_id as "organizationId", public_key as "publicKey", profile_photo as "profilePhoto", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE organization_id = ANY($1::uuid[]) AND role = \'doctor\' AND is_approved = true ORDER BY created_at DESC;';
                params = [orgIds];
            }
        } else {
            return [];
        }
    } else if (orgId) {
        query = 'SELECT id, name, email, role, organization_id as "organizationId", public_key as "publicKey", profile_photo as "profilePhoto", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE organization_id = $1 AND role = \'doctor\' AND is_approved = true ORDER BY created_at DESC;';
        params = [orgId];
    } else if (requestedOrgId) {
        query = 'SELECT id, name, email, role, organization_id as "organizationId", public_key as "publicKey", profile_photo as "profilePhoto", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE organization_id = $1 AND role = \'doctor\' AND is_approved = true ORDER BY created_at DESC;';
        params = [requestedOrgId];
    } else if (isSuperAdmin) {
        query = 'SELECT u.id, u.name, u.email, u.role, u.organization_id as "organizationId", o.name as "organizationName", o.status as "organizationStatus", u.public_key as "publicKey", u.profile_photo as "profilePhoto", u.doctor_profile as "doctorProfile", u.is_approved as "isApproved", u.created_at as "createdAt" FROM users u LEFT JOIN organizations o ON u.organization_id = o.id WHERE u.role = \'doctor\' AND u.is_approved = true ORDER BY u.created_at DESC;';
    } else {
        return [];
    }

    const { rows } = await runner.query(query, params);
    return rows;
}

/**
 * Update user profile photo
 * @param {string} userId
 * @param {string} photoUrl
 * @param {boolean} isDoctor
 * @param {object} [doctorProfile]
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function updateUserProfilePhoto(userId, photoUrl, isDoctor = false, doctorProfile = null, client = null) {
    const runner = client || db;
    await runner.query('UPDATE users SET profile_photo = $1 WHERE id = $2', [photoUrl || null, userId]);

    if (isDoctor && doctorProfile) {
        await runner.query('UPDATE users SET doctor_profile = $1 WHERE id = $2', [JSON.stringify(doctorProfile), userId]);
    }

    const { rows } = await runner.query(
        'SELECT id, name, email, role, organization_id, public_key as "publicKey", profile_photo as "profilePhoto", patient_profile as "patientProfile", doctor_profile as "doctorProfile", is_approved as "isApproved" FROM users WHERE id = $1',
        [userId]
    );
    return rows[0] || null;
}

/**
 * Fetch all other users for phone check
 * @param {string} excludeUserId
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getAllOtherUserProfiles(excludeUserId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query('SELECT id, patient_profile, doctor_profile FROM users WHERE id != $1', [excludeUserId]);
    return rows;
}

/**
 * Update patient profile details
 * @param {string} userId
 * @param {string} name
 * @param {object} profile
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function updatePatientProfile(userId, name, profile, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'UPDATE users SET name = $1, patient_profile = $2 WHERE id = $3 RETURNING *',
        [name, typeof profile === 'string' ? profile : JSON.stringify(profile), userId]
    );
    return rows[0] || null;
}

/**
 * Update doctor profile details
 * @param {string} userId
 * @param {string} name
 * @param {object} profile
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function updateDoctorProfile(userId, name, profile, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'UPDATE users SET name = $1, doctor_profile = $2 WHERE id = $3 RETURNING *',
        [name, typeof profile === 'string' ? profile : JSON.stringify(profile), userId]
    );
    return rows[0] || null;
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

module.exports = {
    getAuditLogs,
    getPublicHealthAnalytics,
    getAdminStats,
    getPendingDoctors,
    findDoctorById,
    updateDoctorStatus,
    getPendingAdmins,
    getAllAdmins,
    updateUserApprovalStatus,
    findUserById,
    deleteUser,
    getBlocksForOrg,
    deleteBlocksForOrg,
    insertBlock,
    checkRecordEntitiesExist,
    updateMinedRecordsForOrg,
    getPatientsByOrg,
    getDoctorsByOrg,
    updateUserProfilePhoto,
    getAllOtherUserProfiles,
    updatePatientProfile,
    updateDoctorProfile,
    createAuditLog
};
