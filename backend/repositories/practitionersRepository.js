/**
 * Practitioners Domain Data Repository
 *
 * Encapsulates all PostgreSQL data access for regulatory registries (KMPDC & NCK).
 * Supports transactional execution via the optional `client` parameter.
 */

const db = require('../db');

/**
 * Fetch all registered KMPDC practitioners with their associated organization name
 * @param {object} [client] - Optional transactional database client
 * @returns {Promise<Array>}
 */
async function getKmpdcPractitioners(client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        SELECT k.*, o.name as "organizationName"
        FROM kmpdc_registry k
        LEFT JOIN organizations o ON k.organization_id = o.id
        ORDER BY k.full_name ASC
    `);
    return rows;
}

/**
 * Find a KMPDC practitioner by normalized license number
 * @param {string} cleanLicense
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findKmpdcByLicense(cleanLicense, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `SELECT k.*, o.name as "organizationName"
         FROM kmpdc_registry k
         LEFT JOIN organizations o ON k.organization_id = o.id
         WHERE UPPER(k.license_number) = $1`,
        [cleanLicense]
    );
    return rows[0] || null;
}

/**
 * Find basic organization details by ID
 * @param {string} orgId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findOrganizationById(orgId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'SELECT id, name FROM organizations WHERE id = $1',
        [orgId]
    );
    return rows[0] || null;
}

/**
 * Insert or update a KMPDC practitioner record
 * @param {object} data
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function upsertKmpdcPractitioner({
    licenseNumber,
    fullName,
    cadre,
    specialization,
    facility,
    organizationId,
    status,
    retentionYear = 2026
}, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `INSERT INTO kmpdc_registry (
            license_number, full_name, cadre, specialization, facility, organization_id, status, retention_year
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (license_number) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            cadre = EXCLUDED.cadre,
            specialization = EXCLUDED.specialization,
            facility = EXCLUDED.facility,
            organization_id = EXCLUDED.organization_id,
            status = EXCLUDED.status,
            updated_at = NOW()
        RETURNING *`,
        [licenseNumber, fullName, cadre, specialization, facility, organizationId, status, retentionYear]
    );
    return rows[0];
}

/**
 * Fetch all registered NCK nurses and midwives with their associated organization name
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getNckPractitioners(client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        SELECT n.*, o.name as "organizationName"
        FROM nck_registry n
        LEFT JOIN organizations o ON n.organization_id = o.id
        ORDER BY n.full_name ASC
    `);
    return rows;
}

/**
 * Find an NCK practitioner by normalized license number
 * @param {string} cleanLicense
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findNckByLicense(cleanLicense, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `SELECT n.*, o.name as "organizationName"
         FROM nck_registry n
         LEFT JOIN organizations o ON n.organization_id = o.id
         WHERE UPPER(n.license_number) = $1`,
        [cleanLicense]
    );
    return rows[0] || null;
}

/**
 * Insert or update an NCK practitioner record
 * @param {object} data
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function upsertNckPractitioner({
    licenseNumber,
    fullName,
    cadre,
    status,
    validTill,
    facility,
    organizationId
}, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `INSERT INTO nck_registry (
            license_number, full_name, cadre, status, valid_till, facility, organization_id, last_verified_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        ON CONFLICT (license_number) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            cadre = EXCLUDED.cadre,
            status = EXCLUDED.status,
            valid_till = EXCLUDED.valid_till,
            facility = EXCLUDED.facility,
            organization_id = EXCLUDED.organization_id,
            last_verified_at = NOW()
        RETURNING *`,
        [licenseNumber, fullName, cadre, status, validTill, facility, organizationId]
    );
    return rows[0];
}

module.exports = {
    getKmpdcPractitioners,
    findKmpdcByLicense,
    findOrganizationById,
    findOrganizationBasic: findOrganizationById,
    upsertKmpdcPractitioner,
    getNckPractitioners,
    findNckByLicense,
    upsertNckPractitioner
};
