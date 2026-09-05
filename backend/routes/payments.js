const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const paymentsController = require('../controllers/paymentsController');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

const { requireAuth } = require('../middleware/auth');

/**
 * Enriches req.user with email/organization_id if not present in token
 */
async function enrichPaymentUser(req, res, next) {
    if (req.user && (!req.user.email || !req.user.organization_id)) {
        try {
            const { rows } = await db.query('SELECT email, name, organization_id FROM users WHERE id = $1', [req.user.id]);
            if (rows.length > 0) {
                if (!req.user.email) req.user.email = rows[0].email;
                if (!req.user.name) req.user.name = rows[0].name;
                if (!req.user.organization_id) req.user.organization_id = rows[0].organization_id;
            }
        } catch (queryErr) {
            console.warn('[PaymentAuth] Could not prefetch user email:', queryErr.message);
        }
    }
    next();
}

/**
 * Standardized payment authentication pipeline using shared requireAuth
 */
const authenticatePaymentUser = [requireAuth, enrichPaymentUser];

/**
 * Creates Payment Router with blockchain ledger binding
 * @param {Object} [blockchainInstance]
 */
function createPaymentRouter(blockchainInstance = null) {
    const router = express.Router();

    // 1. Get available subscription plans
    router.get('/plans', paymentsController.getPlans);

    // 1b. Get authenticated clinic organization license status
    router.get('/clinic-license', authenticatePaymentUser, paymentsController.getClinicLicense);

    // 2. Initialize a Paystack renewal transaction
    router.post('/initialize', authenticatePaymentUser, paymentsController.initializePayment);

    // 3. Verify payment (Called immediately by client when Paystack popup succeeds)
    router.get('/verify/:reference', authenticatePaymentUser, (req, res) => {
        paymentsController.verifyPayment(req, res, blockchainInstance);
    });

    // 4. Paystack Webhook (Async backup notifications)
    router.post('/webhook', (req, res) => {
        paymentsController.handleWebhook(req, res, blockchainInstance);
    });

    // 5. Payment history
    router.get('/history', authenticatePaymentUser, paymentsController.getHistory);

    return router;
}

module.exports = createPaymentRouter;
module.exports.createPaymentRouter = createPaymentRouter;
module.exports.authenticatePaymentUser = authenticatePaymentUser;
