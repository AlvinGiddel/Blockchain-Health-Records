const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('../db');
const paymentsController = require('../controllers/paymentsController');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

/**
 * Authentication & Authorization middleware for payments
 */
async function authenticatePaymentUser(req, res, next) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required for billing operations.' });
    }

    const token = authHeader.substring(7).trim();
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;

        // Ensure email and organization_id exist on req.user
        if (!req.user.email && req.user.id) {
            try {
                const { rows } = await db.query('SELECT email, name, organization_id FROM users WHERE id = $1', [req.user.id]);
                if (rows.length > 0) {
                    req.user.email = rows[0].email;
                    if (!req.user.name) req.user.name = rows[0].name;
                    if (!req.user.organization_id) req.user.organization_id = rows[0].organization_id;
                }
            } catch (queryErr) {
                console.warn('[PaymentAuth] Could not prefetch user email:', queryErr.message);
            }
        }
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired authentication session.' });
    }
}

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
