const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { 
    initializeTransaction, 
    verifyTransaction, 
    verifyWebhookSignature, 
    SUBSCRIPTION_PLANS 
} = require('../services/paystackService');
const { processSuccessfulPayment } = require('../services/paymentHandler');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

/**
 * Authentication & Authorization middleware for payments
 */
function authenticatePaymentUser(req, res, next) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required for billing operations.' });
    }

    const token = authHeader.substring(7).trim();
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired authentication session.' });
    }
}

/**
 * Creates Payment Router with blockchain ledger binding
 */
function createPaymentRouter(blockchainInstance) {
    const router = express.Router();

    // 1. Get available subscription plans
    router.get('/plans', (req, res) => {
        res.json({
            success: true,
            plans: SUBSCRIPTION_PLANS,
            publicKey: process.env.PAYSTACK_PUBLIC_KEY || ''
        });
    });

    // 1b. Get authenticated clinic organization license status
    router.get('/clinic-license', authenticatePaymentUser, async (req, res) => {
        try {
            const orgId = req.user.organization_id || req.headers['x-organization-id'];
            if (!orgId) {
                return res.status(400).json({ error: 'No clinic organization associated with user.' });
            }
            const { rows } = await db.query(
                'SELECT id, name, slug, status, license_expires_at, max_doctors, max_patients, created_at FROM organizations WHERE id = $1',
                [orgId]
            );
            if (rows.length === 0) {
                return res.status(404).json({ error: 'Clinic organization not found.' });
            }
            return res.json({ success: true, organization: rows[0] });
        } catch (err) {
            return res.status(500).json({ error: err.message });
        }
    });

    // 2. Initialize a Paystack renewal transaction
    router.post('/initialize', authenticatePaymentUser, async (req, res) => {
        try {
            const { planId = 'plan_1m', organizationId: requestedOrgId } = req.body;
            const currentUser = req.user;

            // Resolve target organization with strict multi-tenant scoping
            let targetOrgId = null;
            if (currentUser.role === 'super_admin') {
                targetOrgId = requestedOrgId || req.headers['x-organization-id'] || currentUser.organization_id;
            } else if (currentUser.role === 'admin' || currentUser.role === 'doctor') {
                targetOrgId = currentUser.organization_id || req.headers['x-organization-id'];
            }

            if (!targetOrgId) {
                return res.status(400).json({ error: 'No organization specified or associated with your user account.' });
            }

            // Fetch organization details
            const { rows: orgRows } = await db.query(
                'SELECT id, name, slug, status, license_expires_at FROM organizations WHERE id = $1',
                [targetOrgId]
            );

            if (orgRows.length === 0) {
                return res.status(404).json({ error: 'Target health organization not found.' });
            }
            const organization = orgRows[0];

            // Resolve selected subscription plan
            const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId) || SUBSCRIPTION_PLANS[0];

            // Generate clean, traceable Paystack reference
            const safeOrgSlug = (organization.slug || organization.name.toLowerCase().replace(/[^a-z0-9]/g, '-')).slice(0, 15);
            const reference = `bhc_${safeOrgSlug}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

            // Save initial payment row as 'pending'
            await db.query(`
                INSERT INTO payments (
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
            `, [
                organization.id,
                currentUser.id,
                reference,
                plan.amountKES,
                Math.round(plan.amountKES * 100),
                'KES',
                'license_renewal',
                plan.days,
                plan.name,
                currentUser.email
            ]);

            // Call Paystack API
            const paystackResult = await initializeTransaction({
                email: currentUser.email,
                amountInKES: plan.amountKES,
                reference: reference,
                metadata: {
                    organization_id: organization.id,
                    organization_name: organization.name,
                    plan_id: plan.id,
                    plan_days: plan.days,
                    user_id: currentUser.id,
                    purpose: 'license_renewal'
                }
            });

            return res.json({
                success: true,
                reference: reference,
                access_code: paystackResult.access_code,
                authorization_url: paystackResult.authorization_url,
                publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
                amountKES: plan.amountKES,
                plan: plan,
                organization: {
                    id: organization.id,
                    name: organization.name,
                    license_expires_at: organization.license_expires_at
                }
            });
        } catch (err) {
            console.error('[Payments API] Failed to initialize payment:', err);
            return res.status(500).json({ error: err.message || 'Failed to initialize payment.' });
        }
    });

    // 3. Verify payment (Called immediately by client when Paystack popup succeeds)
    router.get('/verify/:reference', authenticatePaymentUser, async (req, res) => {
        try {
            const { reference } = req.params;
            if (!reference) {
                return res.status(400).json({ error: 'Payment reference is required.' });
            }

            // Verify with Paystack
            const verificationData = await verifyTransaction(reference);

            if (verificationData.status === 'success') {
                // Idempotently settle payment and extend license
                const settlement = await processSuccessfulPayment({
                    reference: reference,
                    channel: verificationData.channel,
                    paystackResponse: verificationData.raw,
                    blockchainInstance: blockchainInstance
                });

                return res.json({
                    success: true,
                    message: settlement.message,
                    idempotentNoOp: settlement.idempotentNoOp,
                    payment: settlement.payment,
                    organization: settlement.organization
                });
            } else {
                // Mark failed in DB
                await db.query(
                    "UPDATE payments SET status = 'failed', updated_at = NOW() WHERE reference = $1 AND status = 'pending'",
                    [reference]
                );

                return res.status(400).json({
                    success: false,
                    message: 'Payment was not completed successfully according to Paystack.'
                });
            }
        } catch (err) {
            console.error('[Payments API] Verification error:', err);
            return res.status(500).json({ error: err.message || 'Payment verification failed.' });
        }
    });

    // 4. Paystack Webhook (Async backup notifications)
    router.post('/webhook', async (req, res) => {
        try {
            const signature = req.headers['x-paystack-signature'];
            const rawBody = req.rawBody || JSON.stringify(req.body);

            // In production with real keys, strictly verify signature
            const secret = process.env.PAYSTACK_SECRET_KEY;
            if (secret && secret.startsWith('sk_')) {
                const isValid = verifyWebhookSignature(rawBody, signature);
                if (!isValid) {
                    console.warn('[Payments Webhook] Invalid signature received from IP:', req.ip);
                    return res.status(401).send('Invalid webhook signature');
                }
            }

            const event = req.body;
            if (event && event.event === 'charge.success') {
                const reference = event.data?.reference;
                if (reference) {
                    console.log(`[Payments Webhook] Processing charge.success for reference: ${reference}`);
                    await processSuccessfulPayment({
                        reference: reference,
                        channel: event.data?.channel || 'mpesa',
                        paystackResponse: event.data,
                        blockchainInstance: blockchainInstance
                    });
                }
            }

            // Paystack expects a quick HTTP 200 acknowledgment
            return res.status(200).json({ status: 'success' });
        } catch (err) {
            console.error('[Payments Webhook] Webhook processing error:', err);
            // Return 200 so Paystack does not perpetually retry unrecoverable internal errors
            return res.status(200).json({ status: 'error_handled', message: err.message });
        }
    });

    // 5. Payment history
    router.get('/history', authenticatePaymentUser, async (req, res) => {
        try {
            const currentUser = req.user;
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

            if (currentUser.role !== 'super_admin') {
                const orgId = currentUser.organization_id || req.headers['x-organization-id'];
                if (!orgId) {
                    return res.json({ success: true, payments: [] });
                }
                query += ' WHERE p.organization_id = $1';
                params.push(orgId);
            } else if (req.query.orgId || req.query.organizationId) {
                query += ' WHERE p.organization_id = $1';
                params.push(req.query.orgId || req.query.organizationId);
            }

            query += ' ORDER BY p.created_at DESC LIMIT 50';

            const { rows: payments } = await db.query(query, params);
            return res.json({ success: true, payments });
        } catch (err) {
            console.error('[Payments API] Error fetching payment history:', err);
            return res.status(500).json({ error: 'Failed to retrieve payment records.' });
        }
    });

    return router;
}

module.exports = createPaymentRouter;
