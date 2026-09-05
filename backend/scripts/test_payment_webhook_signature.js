process.env.VERCEL = '1';
const http = require('http');
const crypto = require('crypto');
const app = require('../server');

async function testWebhookSignatures() {
    console.log('================================================================');
    console.log('TESTING PAYSTACK WEBHOOK SIGNATURE VALIDATION & TAMPER REJECTION');
    console.log('================================================================\n');

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(5098, resolve));
    console.log('Test server listening on port 5098');

    const sendWebhook = (bodyObj, signatureHeader) => {
        return new Promise((resolve, reject) => {
            const data = JSON.stringify(bodyObj);
            const headers = {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            };
            if (signatureHeader) {
                headers['x-paystack-signature'] = signatureHeader;
            }

            const req = http.request({
                hostname: 'localhost',
                port: 5098,
                path: '/api/payments/webhook',
                method: 'POST',
                headers
            }, (res) => {
                let resBody = '';
                res.on('data', chunk => resBody += chunk);
                res.on('end', () => resolve({ status: res.statusCode, body: resBody }));
            });
            req.on('error', reject);
            req.write(data);
            req.end();
        });
    };

    try {
        const payload = {
            event: 'charge.success',
            data: {
                reference: 'bhc_test_sig_' + Date.now(),
                amount: 250000,
                channel: 'mpesa'
            }
        };

        const secret = process.env.PAYSTACK_SECRET_KEY || 'sk_test_fake_secret_key';

        // 1. Test with invalid/tampered signature
        console.log('--- 1. Testing webhook with INVALID signature ---');
        const invalidSig = 'deadbeefcafebabe1234567890abcdef1234567890abcdef1234567890abcdef';
        const resInvalid = await sendWebhook(payload, invalidSig);
        console.log('Response Status:', resInvalid.status, 'Body:', resInvalid.body);

        if (secret.startsWith('sk_')) {
            if (resInvalid.status === 401 && resInvalid.body.includes('Invalid webhook signature')) {
                console.log('✅ Correctly rejected invalid webhook signature with HTTP 401!');
            } else {
                throw new Error(`Expected HTTP 401 for invalid signature, got: ${resInvalid.status}`);
            }
        } else {
            console.log('ℹ️ Secret key not configured with sk_ prefix; signature enforcement skipped as expected in dev mode.');
        }

        // 2. Test with VALID HMAC SHA512 signature
        console.log('\n--- 2. Testing webhook with VALID HMAC SHA512 signature ---');
        const validSig = crypto
            .createHmac('sha512', secret.trim())
            .update(JSON.stringify(payload))
            .digest('hex');

        const resValid = await sendWebhook(payload, validSig);
        console.log('Response Status:', resValid.status, 'Body:', resValid.body);
        if (resValid.status === 200) {
            console.log('✅ Valid webhook signature accepted with HTTP 200!');
        } else {
            throw new Error(`Expected HTTP 200 for valid signature, got: ${resValid.status}`);
        }

        console.log('\n================================================================');
        console.log('WEBHOOK SIGNATURE VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
        console.log('================================================================\n');

    } finally {
        server.close();
        process.exit(0);
    }
}

testWebhookSignatures().catch(err => {
    console.error('Webhook signature test failed:', err);
    process.exit(1);
});
