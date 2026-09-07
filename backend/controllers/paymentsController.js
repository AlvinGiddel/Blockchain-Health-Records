const crypto = require('crypto');
const paymentsRepository = require('../repositories/paymentsRepository');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const errorHandler = require('../middleware/errorHandler');
const { 
    initializeTransaction, 
    verifyTransaction, 
    verifyWebhookSignature, 
    SUBSCRIPTION_PLANS 
} = require('../services/paystackService');
const { processSuccessfulPayment } = require('../services/paymentHandler');

/**
 * 1. Get available subscription plans and public key
 */
function getPlans(req, res) {
    res.json({
        success: true,
        plans: SUBSCRIPTION_PLANS,
        publicKey: (process.env.PAYSTACK_PUBLIC_KEY || '').trim()
    });
}

/**
 * 1b. Get authenticated clinic organization license status
 */
const getClinicLicense = catchAsync(async (req, res) => {
    const orgId = req.user.organization_id || req.headers['x-organization-id'];
    if (!orgId) {
        throw new AppError('No clinic organization associated with user.', 400);
    }

    const organization = await paymentsRepository.findOrganizationById(orgId);
    if (!organization) {
        throw new AppError('Clinic organization not found.', 404);
    }
    return res.json({ success: true, organization });
});

/**
 * 2. Initialize a Paystack renewal transaction
 */
const initializePayment = catchAsync(async (req, res) => {
    const { planId = 'plan_1m', organizationId: requestedOrgId, email: providedEmail } = req.body;
    const currentUser = req.user;

    // Resolve target organization with strict multi-tenant scoping
    let targetOrgId = null;
    if (currentUser.role === 'super_admin') {
        targetOrgId = requestedOrgId || req.headers['x-organization-id'] || currentUser.organization_id;
    } else if (currentUser.role === 'admin' || currentUser.role === 'doctor') {
        targetOrgId = currentUser.organization_id || req.headers['x-organization-id'];
    }

    if (!targetOrgId) {
        throw new AppError('No organization specified or associated with your user account.', 400);
    }

    // Fetch organization details via repository
    const organization = await paymentsRepository.findOrganizationById(targetOrgId);
    if (!organization) {
        throw new AppError('Target health organization not found.', 404);
    }

    // Resolve selected subscription plan
    const plan = SUBSCRIPTION_PLANS.find(p => p.id === planId) || SUBSCRIPTION_PLANS[0];

    // Resolve customer email with robust fallbacks
    let customerEmail = providedEmail || currentUser.email;
    if (!customerEmail) {
        customerEmail = (process.env.PAYSTACK_EMAIL || '').trim()
            || `admin@${organization.slug || 'clinic'}.local`;
    }

    // Generate clean, traceable Paystack reference
    const safeOrgSlug = (organization.slug || organization.name.toLowerCase().replace(/[^a-z0-9]/g, '-')).slice(0, 15);
    const reference = `bhc_${safeOrgSlug}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    // Save initial payment row as 'pending' via repository
    await paymentsRepository.createPendingPayment({
        organizationId: organization.id,
        userId: currentUser.id,
        reference,
        amount: plan.amountKES,
        amountSubunits: Math.round(plan.amountKES * 100),
        currency: 'KES',
        purpose: 'license_renewal',
        planDays: plan.days,
        planName: plan.name,
        customerEmail
    });

    // Call Paystack API
    const paystackResult = await initializeTransaction({
        email: customerEmail,
        amountInKES: plan.amountKES,
        reference: reference,
        metadata: {
            organization_id: organization.id,
            organization_name: organization.name,
            plan_id: plan.id,
            plan_days: plan.days,
            user_id: currentUser.id,
            user_email: customerEmail,
            purpose: 'license_renewal'
        }
    });

    return res.json({
        success: true,
        reference: reference,
        access_code: paystackResult.access_code,
        authorization_url: paystackResult.authorization_url,
        publicKey: (process.env.PAYSTACK_PUBLIC_KEY || '').trim(),
        amountKES: plan.amountKES,
        plan: plan,
        organization: {
            id: organization.id,
            name: organization.name,
            license_expires_at: organization.license_expires_at
        }
    });
});

/**
 * 3. Verify payment (Called immediately by client when Paystack popup succeeds)
 */
async function verifyPayment(req, res, blockchainInstance = null, next = null) {
    try {
        const { reference } = req.params;
        if (!reference) {
            throw new AppError('Payment reference is required.', 400);
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
            // Mark failed in DB via repository
            await paymentsRepository.markPaymentFailed(reference);

            return res.status(400).json({
                success: false,
                message: 'Payment was not completed successfully according to Paystack.'
            });
        }
    } catch (err) {
        if (next) return next(err);
        return errorHandler(err, req, res);
    }
}

/**
 * 4. Paystack Webhook (Async backup notifications)
 */
async function handleWebhook(req, res, blockchainInstance = null) {
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
}

/**
 * 5. Payment history
 */
const getHistory = catchAsync(async (req, res) => {
    const currentUser = req.user;
    const isSuperAdmin = currentUser.role === 'super_admin';
    const orgId = isSuperAdmin
        ? (req.query.orgId || req.query.organizationId)
        : (currentUser.organization_id || req.headers['x-organization-id']);

    const payments = await paymentsRepository.getPaymentHistory({
        orgId,
        isSuperAdmin,
        limit: 50
    });
    return res.json({ success: true, payments });
});

module.exports = {
    getPlans,
    getClinicLicense,
    initializePayment,
    verifyPayment,
    handleWebhook,
    getHistory
};
