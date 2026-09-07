/**
 * Payments Domain Data Repository
 *
 * Encapsulates all PostgreSQL data access for the billing, payments, and subscription domain.
 * Strictly preserves tenant-scoping clauses (WHERE organization_id = $1) and supports
 * transactional execution via the optional `client` parameter.
 */

const db = require('../db');

/**
 * Find organization licensing status by organization ID
 * @param {string} orgId
 * @param {object} [client] - Optional transactional database client
 * @returns {Promise<object|null>}
 */
async function findOrganizationById(orgId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `SELECT id, name, slug, status, license_expires_at, max_doctors, max_patients, created_at 
         FROM organizations 
         WHERE id = $1`,
        [orgId]
    );
    return rows[0] || null;
}

/**
 * Create a new pending payment record
 * @param {object} data
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function createPendingPayment({
    organizationId,
    userId,
    reference,
    amount,
    amountSubunits,
    currency = 'KES',
    purpose = 'license_renewal',
    planDays,
    planName,
    customerEmail
}, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `INSERT INTO payments (
            organization_id,
            user_id,
            reference,
            amount,
            amount_subunits,
            currency,
            purpose,
            plan_days,
            plan_name,
            status,
            customer_email
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10)
        RETURNING *`,
        [
            organizationId,
            userId,
            reference,
            amount,
            amountSubunits,
            currency,
            purpose,
            planDays,
            planName,
            customerEmail
        ]
    );
    return rows[0];
}

/**
 * Mark a pending payment as failed
 * @param {string} reference
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function markPaymentFailed(reference, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `UPDATE payments 
         SET status = 'failed', updated_at = NOW() 
         WHERE reference = $1 AND status = 'pending'
         RETURNING *`,
        [reference]
    );
    return rows[0] || null;
}

/**
 * Retrieve payment history with strict multi-tenant scoping
 * Non-super-admins are strictly confined to their own organization_id.
 *
 * @param {object} options
 * @param {string} [options.orgId] - Organization ID filter
 * @param {boolean} [options.isSuperAdmin=false] - Whether caller is super admin
 * @param {number} [options.limit=50] - Result limit
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getPaymentHistory({ orgId, isSuperAdmin = false, limit = 50 }, client = null) {
    const runner = client || db;
    let query = `
        SELECT 
            p.id,
            p.reference,
            p.amount,
            p.currency,
            p.plan_days,
            p.plan_name,
            p.status,
            p.channel,
            p.customer_email,
            p.blockchain_tx_hash,
            p.paid_at,
            p.created_at,
            o.id as organization_id,
            o.name as organization_name
        FROM payments p
        LEFT JOIN organizations o ON p.organization_id = o.id
    `;
    const params = [];

    if (!isSuperAdmin) {
        if (!orgId) {
            return [];
        }
        query += ' WHERE p.organization_id = $1';
        params.push(orgId);
    } else if (orgId) {
        query += ' WHERE p.organization_id = $1';
        params.push(orgId);
    }

    params.push(limit);
    query += ` ORDER BY p.created_at DESC LIMIT $${params.length}`;

    const { rows } = await runner.query(query, params);
    return rows;
}

module.exports = {
    findOrganizationById,
    createPendingPayment,
    markPaymentFailed,
    getPaymentHistory
};
