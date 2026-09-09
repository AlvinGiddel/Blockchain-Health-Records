/**
 * Paystack Integration Service
 * 
 * Supports both real Paystack API calls (with live/test keys)
 * and seamless offline/sandbox fallback for local verification.
 */

const https = require('https');
const crypto = require('crypto');

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || '';

/**
 * Standard HTTP/HTTPS request helper
 */
function makePaystackRequest(endpoint, method = 'GET', postData = null) {
    return new Promise((resolve, reject) => {
        const secret = process.env.PAYSTACK_SECRET_KEY || PAYSTACK_SECRET_KEY;
        if (!secret || secret.startsWith('mock_')) {
            return reject(new Error('Paystack secret key is in mock mode.'));
        }

        const options = {
            hostname: 'api.paystack.co',
            port: 443,
            path: endpoint,
            method: method,
            headers: {
                'Authorization': `Bearer ${secret.trim()}`,
                'Content-Type': 'application/json',
                'User-Agent': 'BlockchainHealthRecords/1.0'
            },
            timeout: 10000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300 && parsed.status === true) {
                        resolve(parsed.data);
                    } else {
                        reject(new Error(parsed.message || `Paystack error status HTTP ${res.statusCode}`));
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse Paystack response: ${data}`));
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Paystack request timed out after 10000ms'));
        });

        if (postData) {
            req.write(JSON.stringify(postData));
        }
        req.end();
    });
}

/**
 * Initializes a transaction with Paystack
 * @param {Object} params
 * @param {string} params.email
 * @param {number} params.amountInKES e.g. 2500
 * @param {string} params.reference Unique reference code
 * @param {Object} params.metadata Custom organization metadata
 */
async function initializeTransaction({ email, amountInKES, reference, metadata = {}, callback_url = '' }) {
    const amountInSubunits = Math.round(Number(amountInKES) * 100);
    const secret = process.env.PAYSTACK_SECRET_KEY || PAYSTACK_SECRET_KEY;

    // If real key exists, use real Paystack API
    if (secret && secret.startsWith('sk_') && !secret.includes('placeholder')) {
        try {
            const data = await makePaystackRequest('/transaction/initialize', 'POST', {
                email,
                amount: amountInSubunits,
                currency: 'KES',
                reference,
                metadata,
                callback_url,
                channels: ['card', 'mobile_money']
            });

            return {
                authorization_url: data.authorization_url,
                access_code: data.access_code,
                reference: data.reference,
                mode: 'live'
            };
        } catch (apiErr) {
            console.warn('[PaystackService] Real API initialization failed, checking error:', apiErr.message);
            throw apiErr;
        }
    }

    // Offline / Mock fallback (when testing locally without API keys)
    console.log(`[PaystackService Mock] Initializing sandbox transaction for ${email}, KES ${amountInKES}`);
    return {
        authorization_url: `https://checkout.paystack.com/mock_${reference}`,
        access_code: `mock_code_${reference}`,
        reference: reference,
        mode: 'mock'
    };
}

/**
 * Verifies transaction status with Paystack
 * @param {string} reference
 */
async function verifyTransaction(reference) {
    const secret = process.env.PAYSTACK_SECRET_KEY || PAYSTACK_SECRET_KEY;

    if (secret && secret.startsWith('sk_') && !secret.includes('placeholder')) {
        try {
            const data = await makePaystackRequest(`/transaction/verify/${encodeURIComponent(reference)}`, 'GET');
            return {
                status: data.status === 'success' ? 'success' : 'failed',
                reference: data.reference,
                amount_subunits: data.amount,
                amount: (data.amount / 100),
                currency: data.currency || 'KES',
                channel: data.channel || 'mpesa',
                paid_at: data.paid_at || new Date().toISOString(),
                customer: data.customer,
                metadata: data.metadata || {},
                raw: data
            };
        } catch (apiErr) {
            console.warn('[PaystackService] Real API verification failed:', apiErr.message);
            throw apiErr;
        }
    }

    // Offline / Mock fallback: Auto-verifies mock references
    console.log(`[PaystackService Mock] Verifying sandbox transaction for reference: ${reference}`);
    return {
        status: 'success',
        reference: reference,
        amount_subunits: 250000,
        amount: 2500,
        currency: 'KES',
        channel: 'mpesa',
        paid_at: new Date().toISOString(),
        customer: { email: 'clinic-admin@health.go.ke' },
        metadata: {},
        raw: { mock: true, verified_at: new Date().toISOString() }
    };
}

/**
 * Verifies Paystack Webhook HMAC SHA512 Signature
 * @param {string|Buffer} rawBody
 * @param {string} signatureHeader
 */
function verifyWebhookSignature(rawBody, signatureHeader) {
    const secret = process.env.PAYSTACK_SECRET_KEY || PAYSTACK_SECRET_KEY;
    if (!secret || !signatureHeader) return false;

    try {
        const hash = crypto
            .createHmac('sha512', secret.trim())
            .update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'))
            .digest('hex');

        return crypto.timingSafeEqual(Buffer.from(hash, 'utf8'), Buffer.from(signatureHeader, 'utf8'));
    } catch (e) {
        console.error('[PaystackService] Signature verification error:', e.message);
        return false;
    }
}

/**
 * Standard Available Subscription Plans
 *
 * Active tiered plans (Netflix-style, all billed monthly):
 *   plan_starter       — KES 15,000/month  — up to 5 practitioners
 *   plan_professional  — KES 30,000/month  — up to 30 practitioners
 *   plan_enterprise    — KES 60,000/month  — unlimited practitioners
 *   plan_pharmacy_monthly — KES 4,500/month — pharmacy dispensing portal
 *
 * Legacy plans (retained for existing subscribers, not shown on landing page):
 *   plan_1m / plan_3m / plan_1y
 */
const SUBSCRIPTION_PLANS = [
    // ── Active tiered plans ────────────────────────────────────────────────
    {
        id: 'plan_starter',
        name: 'Starter',
        days: 30,
        amountKES: 15000,
        tier: 'starter',
        description: 'Core tamper-evident records, QR health passports, and KMPDC/NCK verification for small clinics.'
    },
    {
        id: 'plan_professional',
        name: 'Professional',
        days: 30,
        amountKES: 30000,
        tier: 'professional',
        description: 'Adds QR prescription tokens, compliance reports, and pharmacy dispensing integration for growing facilities.'
    },
    {
        id: 'plan_enterprise',
        name: 'Enterprise',
        days: 30,
        amountKES: 60000,
        tier: 'enterprise',
        description: 'Unlimited practitioners, emergency break-glass, EHR/HMIS bridge, dedicated node, and 24/7 SLA support.'
    },
    {
        id: 'plan_pharmacy_monthly',
        name: 'Pharmacy Dispensing License',
        days: 30,
        amountKES: 4500,
        organizationType: 'pharmacy',
        description: '30-day dispensing terminal license with cryptographic QR verification, rival-claim locking, and PPB statutory audit trails.'
    },

    // ── Legacy plans (existing subscribers only — do not surface on UI) ───
    {
        id: 'plan_1m',
        name: 'Standard Monthly Renewal (Legacy)',
        days: 30,
        amountKES: 20000,
        legacy: true,
        description: 'Legacy 30-day clinic license.'
    },
    {
        id: 'plan_3m',
        name: 'Quarterly Clinic Plan (Legacy)',
        days: 90,
        amountKES: 54000,
        legacy: true,
        description: 'Legacy 90-day clinic license.'
    },
    {
        id: 'plan_1y',
        name: 'Annual Medical License (Legacy)',
        days: 365,
        amountKES: 192000,
        legacy: true,
        description: 'Legacy 365-day clinic license.'
    }
];

module.exports = {
    initializeTransaction,
    verifyTransaction,
    verifyWebhookSignature,
    SUBSCRIPTION_PLANS
};
