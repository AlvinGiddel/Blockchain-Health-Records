/**
 * Fail-fast, non-blocking SMS & Mobile Dispatcher Service
 * Supports Africa's Talking (Kenyan telcos standard: Safaricom, Airtel, Telkom)
 * with graceful fallback to console mock logger for local dev/testing.
 */

const https = require('https');

/**
 * Format local Kenyan phone numbers to E.164 international standard (+254...)
 * @param {string} phone 
 * @returns {string} E.164 formatted phone number
 */
function sanitizeKenyanPhone(phone) {
    if (!phone) return '';
    let cleaned = String(phone).replace(/[^\d+]/g, '').trim();
    if (cleaned.startsWith('0')) {
        cleaned = '+254' + cleaned.substring(1);
    } else if (cleaned.startsWith('254') && !cleaned.startsWith('+')) {
        cleaned = '+' + cleaned;
    } else if (!cleaned.startsWith('+') && cleaned.length === 9) {
        cleaned = '+254' + cleaned;
    }
    return cleaned;
}

/**
 * Dispatches an SMS message with a 3000ms hard timeout guard.
 * Non-blocking: logs warnings on failure without crashing or stalling API requests.
 * 
 * @param {object} params
 * @param {string} params.to - Recipient phone number
 * @param {string} params.message - SMS message text
 * @param {string} [params.type] - Category (e.g. 'break_glass', 'appointment', 'prescription')
 * @returns {Promise<{ success: boolean, messageId?: string, mode: string }>}
 */
async function sendSms({ to, message, type = 'general' }) {
    const recipient = sanitizeKenyanPhone(to);
    if (!recipient) {
        console.warn(`[SMS Service] Warning: Skipped SMS (${type}), invalid recipient phone: "${to}"`);
        return { success: false, mode: 'skipped', error: 'Invalid phone number' };
    }

    const username = process.env.AFRICASTALKING_USERNAME;
    const apiKey = process.env.AFRICASTALKING_API_KEY;
    const senderId = process.env.AFRICASTALKING_SENDER_ID || 'BHC-ALERT';

    // 1. If Africa's Talking API credentials are configured, execute upstream dispatch
    if (username && apiKey && username !== 'sandbox_test_dummy') {
        return new Promise((resolve) => {
            const postData = new URLSearchParams({
                username,
                to: recipient,
                message,
                ...(senderId ? { from: senderId } : {})
            }).toString();

            const isSandbox = username.toLowerCase() === 'sandbox';
            const host = isSandbox ? 'api.sandbox.africastalking.com' : 'api.africastalking.com';

            const options = {
                hostname: host,
                port: 443,
                path: '/version1/messaging',
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'apiKey': apiKey,
                    'Content-Length': Buffer.byteLength(postData)
                },
                timeout: 3000 // 3-second fail-fast timeout protection
            };

            const req = https.request(options, (res) => {
                let responseBody = '';
                res.on('data', chunk => responseBody += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(responseBody);
                        const recipientData = parsed?.SMSMessageData?.Recipients?.[0];
                        console.log(`[SMS Service] [${type.toUpperCase()}] Dispatched to ${recipient}: Status ${recipientData?.status || 'Sent'}`);
                        resolve({ success: true, mode: 'africastalking', messageId: recipientData?.messageId });
                    } catch {
                        console.log(`[SMS Service] [${type.toUpperCase()}] Dispatched to ${recipient} (raw response received)`);
                        resolve({ success: true, mode: 'africastalking' });
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                console.warn(`[SMS Service] Gateway timeout after 3000ms sending ${type} SMS to ${recipient}. Falling back.`);
                resolve({ success: false, mode: 'timeout_fallback' });
            });

            req.on('error', (err) => {
                console.warn(`[SMS Service] Gateway network error: ${err.message}. Non-blocking fallback.`);
                resolve({ success: false, mode: 'error_fallback', error: err.message });
            });

            req.write(postData);
            req.end();
        });
    }

    // 2. Dev / Testing Mock Dispatcher: logs cleanly to standard output
    console.log('\n========================================================');
    console.log(`📱 [CLINICAL SMS DISPATCH] Type: ${type.toUpperCase()}`);
    console.log(`TO:      ${recipient}`);
    console.log(`MESSAGE: ${message}`);
    console.log('STATUS:  DELIVERED (SIMULATED CONSOLE GATEWAY)');
    console.log('========================================================\n');

    return {
        success: true,
        mode: 'mock_console',
        messageId: `sim_sms_${Date.now()}`
    };
}

module.exports = {
    sendSms,
    sanitizeKenyanPhone
};
