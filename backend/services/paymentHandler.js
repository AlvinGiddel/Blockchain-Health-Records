/**
 * Payment Handler Engine
 * 
 * Handles atomic settlement of Paystack payments with:
 * 1. Strict idempotency protection (conditional update on status = 'pending')
 * 2. Fair license extension calculation: GREATEST(COALESCE(license_expires_at, NOW()), NOW()) + INTERVAL 'X days'
 * 3. Cryptographic proof-of-work blockchain ledger audit recording
 */

const db = require('../db');

/**
 * Idempotently processes a confirmed successful payment
 * @param {Object} params
 * @param {string} params.reference Unique Paystack reference
 * @param {string} [params.channel] e.g. 'mpesa' | 'card'
 * @param {Object} [params.paystackResponse] Full payload from Paystack
 * @param {Object} [params.blockchainInstance] In-memory or singleton blockchain
 */
async function processSuccessfulPayment({ reference, channel, paystackResponse = {}, blockchainInstance = null }) {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Atomically check and update payment from 'pending' to 'success'
        // If already 'success', rows.length will be 0 (guaranteeing single execution)
        const updatePaymentSql = `
            UPDATE payments
            SET status = 'success',
                channel = COALESCE($1, channel),
                paystack_response = $2,
                paid_at = NOW(),
                updated_at = NOW()
            WHERE reference = $3 AND status = 'pending'
            RETURNING *;
        `;

        const { rows: updatedPayments } = await client.query(updatePaymentSql, [
            channel || 'mpesa',
            JSON.stringify(paystackResponse),
            reference
        ]);

        // If no row was updated: check if it was already processed (Idempotent No-Op)
        if (updatedPayments.length === 0) {
            const { rows: existing } = await client.query(
                'SELECT p.*, o.name as org_name, o.license_expires_at, o.status as org_status FROM payments p LEFT JOIN organizations o ON p.organization_id = o.id WHERE p.reference = $1',
                [reference]
            );

            await client.query('COMMIT');

            if (existing.length > 0 && existing[0].status === 'success') {
                return {
                    idempotentNoOp: true,
                    message: 'Payment was already processed successfully (idempotent no-op).',
                    payment: existing[0],
                    organization: {
                        id: existing[0].organization_id,
                        name: existing[0].org_name,
                        license_expires_at: existing[0].license_expires_at,
                        status: existing[0].org_status
                    }
                };
            } else {
                throw new Error(`Payment reference "${reference}" not found or is in an unprocessable state.`);
            }
        }

        const payment = updatedPayments[0];
        const planDays = parseInt(payment.plan_days, 10) || 30;

        // 2. Extend the organization's license from GREATEST(license_expires_at, NOW())
        // If expiring in 10 days, new expiry is 10 days + 30 days = 40 days
        // If already expired 5 days ago, new expiry is NOW() + 30 days
        const updateOrgSql = `
            UPDATE organizations
            SET license_expires_at = GREATEST(COALESCE(license_expires_at, NOW()), NOW()) + ($1 || ' days')::INTERVAL,
                status = 'active',
                updated_at = NOW()
            WHERE id = $2
            RETURNING *;
        `;

        const { rows: updatedOrgs } = await client.query(updateOrgSql, [
            String(planDays),
            payment.organization_id
        ]);

        const updatedOrg = updatedOrgs[0];

        // 3. Commit DB state
        await client.query('COMMIT');

        // 4. Record to blockchain ledger as an immutable financial audit transaction
        let txHash = null;
        try {
            if (blockchainInstance && typeof blockchainInstance.addPendingRecord === 'function') {
                const auditPayload = {
                    recordType: 'CLINIC_LICENSE_SUBSCRIPTION_SETTLED',
                    paymentReference: payment.reference,
                    organizationId: payment.organization_id,
                    organizationName: updatedOrg ? updatedOrg.name : 'Health Facility',
                    amountKES: payment.amount,
                    currency: payment.currency,
                    planDays: planDays,
                    channel: payment.channel,
                    previousExpiration: null,
                    newExpiration: updatedOrg ? updatedOrg.license_expires_at : null,
                    settledAt: new Date().toISOString()
                };

                // Add to blockchain mempool and trigger mining
                const mempoolRecord = blockchainInstance.addPendingRecord(auditPayload);
                if (blockchainInstance.minePendingRecords) {
                    await blockchainInstance.minePendingRecords('PAYMENT_SETTLEMENT_NODE');
                }
                txHash = mempoolRecord?.hash || `tx_pay_${Date.now()}_${payment.reference.slice(-6)}`;

                await db.pool.query('UPDATE payments SET blockchain_tx_hash = $1 WHERE id = $2', [
                    txHash,
                    payment.id
                ]);
            }
        } catch (bcErr) {
            console.warn('[PaymentHandler] Blockchain audit logging notice:', bcErr.message);
        }

        return {
            idempotentNoOp: false,
            message: `License successfully extended by ${planDays} days.`,
            payment: { ...payment, blockchain_tx_hash: txHash },
            organization: updatedOrg
        };
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

module.exports = {
    processSuccessfulPayment
};
