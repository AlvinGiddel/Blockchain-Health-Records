/**
 * Healthcare Organizations Domain Data Repository
 *
 * Encapsulates all PostgreSQL data access for healthcare organizations,
 * clinic facility licensing, administrative approval queues, tenant provisioning,
 * and aggregated privacy-preserving patient directories.
 * Supports multi-step database transactions via the optional `client` parameter.
 */

const db = require('../db');

/**
 * Public list of active healthcare facilities (for registration and booking dropdowns)
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getActiveOrganizations(client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        SELECT id, name, status 
        FROM organizations 
        WHERE status IN ('active', 'trial') 
          AND (org_type = 'clinic' OR org_type IS NULL)
          AND LOWER(name) NOT LIKE '%unassigned%'
        ORDER BY name ASC;
    `);
    return rows;
}

/**
 * List all organizations with ledger metrics for Super Admin
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getAdminOrganizations(client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        SELECT 
            o.id,
            o.name,
            o.slug,
            o.status,
            o.org_type as "orgType",
            o.ppb_license_number as "ppbLicenseNumber",
            o.contact_phone as "contactPhone",
            o.physical_address as "physicalAddress",
            o.license_expires_at as "licenseExpiresAt",
            o.max_doctors as "maxDoctors",
            o.max_patients as "maxPatients",
            o.created_at as "createdAt",
            COUNT(DISTINCT CASE WHEN tm.role = 'doctor' THEN tm.user_id END) as "doctorCount",
            COUNT(DISTINCT CASE WHEN tm.role = 'patient' THEN tm.user_id END) as "patientCount",
            COUNT(DISTINCT a.id) as "appointmentCount",
            COUNT(DISTINCT r.id) as "recordCount",
            COALESCE(MAX(b.index), 0) as "blockHeight"
        FROM organizations o
        LEFT JOIN tenant_memberships tm ON o.id = tm.organization_id
        LEFT JOIN appointments a ON o.id = a.organization_id
        LEFT JOIN records r ON o.id = r.organization_id
        LEFT JOIN blocks b ON o.id = b.organization_id
        GROUP BY o.id
        ORDER BY o.name ASC;
    `);
    return rows;
}

/**
 * Pending organizations awaiting Super Admin review
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getPendingOrganizations(client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        SELECT 
            o.id,
            o.name as "organizationName",
            o.slug,
            o.status,
            o.org_type as "orgType",
            o.ppb_license_number as "ppbLicenseNumber",
            o.contact_phone as "contactPhone",
            o.physical_address as "physicalAddress",
            o.created_at as "createdAt",
            u.id as "adminId",
            u.name as "adminName",
            u.email as "adminEmail",
            u.role as "adminRole"
        FROM organizations o
        LEFT JOIN users u ON u.organization_id = o.id AND u.role IN ('admin', 'pharmacist')
        WHERE o.status IN ('pending_approval', 'pending')
        ORDER BY o.created_at ASC;
    `);
    return rows;
}

/**
 * Find organization by ID
 * @param {string} id
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findOrganizationById(id, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'SELECT * FROM organizations WHERE id = $1',
        [id]
    );
    return rows[0] || null;
}

/**
 * Find organization by name using case-insensitive match (ILIKE)
 * @param {string} name
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findOrganizationByNameIlike(name, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'SELECT id, name FROM organizations WHERE name ILIKE $1 LIMIT 1',
        [name]
    );
    return rows[0] || null;
}

/**
 * Update organization approval status (activates 7-day trial)
 * @param {string} id
 * @param {object} params
 * @param {string} [params.status='trial']
 * @param {Date|string} [params.licenseExpiresAt]
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function updateOrganizationApproval(id, { status = 'trial', licenseExpiresAt = null }, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        UPDATE organizations 
        SET status = $1,
            license_expires_at = COALESCE(
                $2, 
                CASE WHEN org_type = 'pharmacy' THEN NOW() + INTERVAL '14 days' 
                     ELSE NOW() + INTERVAL '7 days' END
            ),
            updated_at = NOW()
        WHERE id = $3
        RETURNING *;
    `, [status, licenseExpiresAt, id]);
    return rows[0] || null;
}

/**
 * Update licenses table status and expiration for an organization
 * @param {string} organizationId
 * @param {object} params
 * @param {string} params.status
 * @param {Date|string} [params.expiresAt]
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function updateLicenseStatus(organizationId, { status, expiresAt = null }, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        UPDATE licenses 
        SET status = $1,
            expires_at = $2,
            updated_at = NOW()
        WHERE organization_id = $3
        RETURNING *;
    `, [status, expiresAt, organizationId]);
    return rows[0] || null;
}

/**
 * Approve the clinic or pharmacy admin/superintendent user
 * @param {string} organizationId
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function approveClinicAdmin(organizationId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        UPDATE users 
        SET is_approved = true, is_rejected = false 
        WHERE organization_id = $1 AND role IN ('admin', 'pharmacist')
        RETURNING id, name, email, role;
    `, [organizationId]);
    return rows;
}

/**
 * Reject the clinic or pharmacy admin/superintendent user
 * @param {string} organizationId
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function rejectClinicAdmin(organizationId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        UPDATE users 
        SET is_approved = false, is_rejected = true 
        WHERE organization_id = $1 AND role IN ('admin', 'pharmacist')
        RETURNING id, name, email, role;
    `, [organizationId]);
    return rows;
}

/**
 * Update tenant membership status for an organization and role
 * @param {string} organizationId
 * @param {string} role
 * @param {string} status
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function updateTenantMembershipStatus(organizationId, role, status, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        UPDATE tenant_memberships 
        SET status = $1 
        WHERE organization_id = $2 AND role = $3
        RETURNING *;
    `, [status, organizationId, role]);
    return rows;
}

/**
 * Update an organization's license status or extend trial (Kill-Switch)
 * @param {string} id
 * @param {object} params
 * @param {string} params.status
 * @param {number} [params.extendDays]
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function updateOrganizationStatus(id, { status, extendDays = null }, client = null) {
    const runner = client || db;
    let updateQuery = `
        UPDATE organizations 
        SET status = $1, updated_at = NOW()
    `;
    const params = [status, id];

    if (extendDays && typeof extendDays === 'number' && extendDays > 0) {
        updateQuery += `, license_expires_at = NOW() + INTERVAL '${parseInt(extendDays)} days'`;
    }

    updateQuery += ` WHERE id = $2 RETURNING *;`;

    const { rows } = await runner.query(updateQuery, params);
    return rows[0] || null;
}

/**
 * Create a new organization record
 * @param {string} name
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function createOrganization(name, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'INSERT INTO organizations (name) VALUES ($1) RETURNING id, name',
        [name]
    );
    return rows[0];
}

/**
 * Insert a block into the blockchain blocks table
 * @param {object} blockData
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function insertBlock({
    index,
    timestamp,
    records,
    previousHash,
    hash,
    nonce,
    organizationId
}, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'INSERT INTO blocks (index, timestamp, records, previous_hash, hash, nonce, organization_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [index, timestamp, typeof records === 'string' ? records : JSON.stringify(records), previousHash, hash, nonce, organizationId]
    );
    return rows[0];
}

/**
 * Insert tenant admin user
 * @param {object} adminData
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function createTenantAdminUser({
    name,
    email,
    password,
    organizationId,
    publicKey,
    privateKey
}, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `INSERT INTO users (name, email, password, role, organization_id, public_key, private_key, is_approved, is_rejected)
         VALUES ($1, $2, $3, 'admin', $4, $5, $6, true, false)
         RETURNING id, name, email, role, organization_id as "organizationId", is_approved as "isApproved", created_at as "createdAt"`,
        [name, email, password, organizationId, publicKey, privateKey]
    );
    return rows[0];
}

/**
 * Create tenant membership
 * @param {object} membershipData
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function createTenantMembership({
    userId,
    organizationId,
    role = 'admin',
    status = 'active'
}, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `INSERT INTO tenant_memberships (user_id, organization_id, role, status)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, organization_id) DO NOTHING
         RETURNING *;`,
        [userId, organizationId, role, status]
    );
    return rows[0] || null;
}

/**
 * Aggregated Patient Counts by Organization (Super Admin Privacy-by-Design view)
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getPatientCountsByOrg(client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        SELECT 
            o.id,
            o.name,
            o.slug,
            o.status,
            o.license_expires_at as "licenseExpiresAt",
            COUNT(DISTINCT CASE WHEN tm.role IN ('doctor', 'nurse') THEN tm.user_id END) as "doctorCount",
            COUNT(DISTINCT p.user_id) as "patientCount"
        FROM organizations o
        LEFT JOIN tenant_memberships tm ON o.id = tm.organization_id
        LEFT JOIN (
            SELECT organization_id, user_id FROM tenant_memberships WHERE role = 'patient'
            UNION
            SELECT organization_id, id as user_id FROM users WHERE organization_id IS NOT NULL AND role = 'patient'
            UNION
            SELECT organization_id, patient_id as user_id FROM records WHERE organization_id IS NOT NULL
            UNION
            SELECT organization_id, patient_id as user_id FROM appointments WHERE organization_id IS NOT NULL
        ) p ON o.id = p.organization_id
        WHERE LOWER(o.name) NOT LIKE '%unassigned%'
        GROUP BY o.id
        ORDER BY o.name ASC;
    `);
    return rows;
}

/**
 * Query demographic & account info strictly for an organization's patients
 * @param {string} orgId
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getOrganizationPatients(orgId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        SELECT DISTINCT
            u.id,
            u.name,
            u.email,
            u.created_at as "registeredAt",
            u.is_approved as "isApproved",
            COALESCE(tm.status, 'active') as "membershipStatus",
            COALESCE(tm.joined_at, u.created_at) as "joinedAt",
            u.patient_profile->>'phone' as "phone"
        FROM users u
        LEFT JOIN tenant_memberships tm ON u.id = tm.user_id AND tm.organization_id = $1
        LEFT JOIN records r ON u.id = r.patient_id AND r.organization_id = $1
        LEFT JOIN appointments a ON u.id = a.patient_id AND a.organization_id = $1
        WHERE (
            tm.organization_id = $1 OR 
            u.organization_id = $1 OR 
            r.organization_id = $1 OR 
            a.organization_id = $1
        ) AND u.role = 'patient'
        ORDER BY u.name ASC;
    `, [orgId]);
    return rows;
}

/**
 * Find user by ID
 * @param {string} id
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findUserById(id, client = null) {
    const runner = client || db;
    const { rows } = await runner.query('SELECT id, name FROM users WHERE id = $1', [id]);
    return rows[0] || null;
}

/**
 * Find user by Email
 * @param {string} email
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findUserByEmail(email, client = null) {
    const runner = client || db;
    const { rows } = await runner.query('SELECT 1 FROM users WHERE email = $1', [email]);
    return rows[0] || null;
}

/**
 * Query aggregate prescription metrics by organization (Zero PII, statistical oversight)
 */
async function getPrescriptionCountsByOrg(client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        SELECT 
            o.id,
            o.name,
            o.slug,
            o.status,
            COUNT(p.id)::int as "totalPrescriptions",
            COUNT(CASE WHEN p.status = 'ISSUED' THEN 1 END)::int as "issuedCount",
            COUNT(CASE WHEN p.status = 'PARTIALLY_FILLED' THEN 1 END)::int as "partiallyFilledCount",
            COUNT(CASE WHEN p.status = 'FILLED' THEN 1 END)::int as "filledCount",
            COUNT(CASE WHEN p.status = 'CANCELLED' THEN 1 END)::int as "cancelledCount",
            COUNT(CASE WHEN p.status = 'EXPIRED' OR (p.expires_at < NOW() AND p.status IN ('ISSUED', 'PARTIALLY_FILLED')) THEN 1 END)::int as "expiredCount"
        FROM organizations o
        LEFT JOIN prescriptions p ON o.id = p.organization_id
        WHERE LOWER(o.name) NOT LIKE '%unassigned%'
        GROUP BY o.id, o.name, o.slug, o.status
        ORDER BY o.name ASC;
    `);
    return rows;
}

/**
 * Query prescriptions for a specific organization upon justified drill-down
 */
async function getOrganizationPrescriptions(orgId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        SELECT 
            p.id,
            p.status,
            p.qr_token as "qrToken",
            p.instructions,
            p.expires_at as "expiresAt",
            p.created_at as "createdAt",
            p.updated_at as "updatedAt",
            pat.name as "patientName",
            doc.name as "doctorName",
            o.name as "organizationName"
        FROM prescriptions p
        JOIN users pat ON p.patient_id = pat.id
        JOIN users doc ON p.doctor_id = doc.id
        JOIN organizations o ON p.organization_id = o.id
        WHERE p.organization_id = $1
        ORDER BY p.created_at DESC;
    `, [orgId]);

    if (rows.length === 0) return [];

    const prescriptionIds = rows.map(r => r.id);
    const { rows: itemRows } = await runner.query(`
        SELECT 
            id, prescription_id, medication_name as "medicationName",
            dosage, frequency, duration, quantity_prescribed as "quantityPrescribed",
            quantity_dispensed as "quantityDispensed"
        FROM prescription_items
        WHERE prescription_id = ANY($1::uuid[]);
    `, [prescriptionIds]);

    const itemMap = new Map();
    for (const item of itemRows) {
        if (!itemMap.has(item.prescription_id)) {
            itemMap.set(item.prescription_id, []);
        }
        itemMap.get(item.prescription_id).push(item);
    }

    return rows.map(rx => ({
        ...rx,
        items: itemMap.get(rx.id) || []
    }));
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
    getActiveOrganizations,
    getAdminOrganizations,
    getPendingOrganizations,
    findOrganizationById,
    findOrganizationByNameIlike,
    updateOrganizationApproval,
    updateLicenseStatus,
    approveClinicAdmin,
    rejectClinicAdmin,
    updateTenantMembershipStatus,
    updateOrganizationStatus,
    createOrganization,
    insertBlock,
    createTenantAdminUser,
    createTenantMembership,
    getPatientCountsByOrg,
    getOrganizationPatients,
    getPrescriptionCountsByOrg,
    getOrganizationPrescriptions,
    findUserById,
    findUserByEmail,
    createAuditLog
};
