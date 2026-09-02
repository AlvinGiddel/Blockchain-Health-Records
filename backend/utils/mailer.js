const nodemailer = require('nodemailer');
const { google } = require('googleapis');

const REDIRECT_URI = 'https://developers.google.com/oauthplayground';

/**
 * Sends an email using Gmail API OAuth2 credentials.
 * Designed for serverless environments (Vercel Functions):
 * - Stateless: Obtains a fresh access token per invocation.
 * - Robust dual delivery: Tries Nodemailer SMTP OAuth2, with automatic fallback
 *   to direct Gmail REST API (users.messages.send) for maximum reliability on serverless.
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} options.html - HTML email body
 * @param {string} [options.text] - Optional plain text alternative
 * @returns {Promise<Object>} Nodemailer or Gmail API result
 */
async function sendMail({ to, subject, html, text }) {
    const user = (process.env.GMAIL_USER || '').trim().replace(/^["']|["']$/g, '');
    const clientId = (process.env.GMAIL_CLIENT_ID || '').trim().replace(/^["']|["']$/g, '');
    const clientSecret = (process.env.GMAIL_CLIENT_SECRET || '').trim().replace(/^["']|["']$/g, '');
    const refreshToken = (process.env.GMAIL_REFRESH_TOKEN || '').trim().replace(/^["']|["']$/g, '');

    if (!user || !clientId || !clientSecret || !refreshToken) {
        throw new Error(
            'Missing Gmail OAuth2 configuration. Please check GMAIL_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN in Vercel Environment Variables.'
        );
    }

    // 1. Create a fresh OAuth2 client per request
    const oauth2Client = new google.auth.OAuth2(
        clientId,
        clientSecret,
        REDIRECT_URI
    );

    // 2. Set credentials with the refresh token
    oauth2Client.setCredentials({
        refresh_token: refreshToken
    });

    // 3. Fetch a fresh access token per call (stateless serverless execution)
    let accessToken;
    try {
        const tokenResponse = await oauth2Client.getAccessToken();
        accessToken = typeof tokenResponse === 'object' && tokenResponse?.token
            ? tokenResponse.token
            : tokenResponse;
    } catch (authErr) {
        console.error('[Mailer] Failed to exchange refresh token for access token:', authErr.message);
        throw new Error(`Google OAuth2 Token Error: ${authErr.message}`);
    }

    if (!accessToken) {
        throw new Error('Failed to generate a fresh access token from Gmail OAuth2.');
    }

    const plainText = text || (typeof html === 'string' ? html.replace(/<[^>]*>?/gm, ' ') : '');

    // 4. Attempt delivery via Nodemailer OAuth2
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: user,
                clientId: clientId,
                clientSecret: clientSecret,
                refreshToken: refreshToken,
                accessToken: accessToken
            }
        });

        const mailOptions = {
            from: `"Blockchain Health Records" <${user}>`,
            to,
            subject,
            html,
            text: plainText
        };

        const result = await transporter.sendMail(mailOptions);
        console.log(`[Mailer] Email dispatched via Nodemailer Gmail OAuth2. Message ID: ${result.messageId}`);
        return result;
    } catch (smtpErr) {
        console.warn('[Mailer] Nodemailer SMTP OAuth2 failed (' + smtpErr.message + '). Attempting direct Gmail REST API...');

        // 5. Fallback: Direct Gmail REST API (bypasses SMTP connection quirks)
        try {
            const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
            const utf8Subject = `=?utf-8?B?${Buffer.from(subject).toString('base64')}?=`;
            const messageParts = [
                `From: "Blockchain Health Records" <${user}>`,
                `To: ${to}`,
                `Content-Type: text/html; charset=utf-8`,
                `MIME-Version: 1.0`,
                `Subject: ${utf8Subject}`,
                ``,
                html
            ];
            const message = messageParts.join('\n');
            const encodedMessage = Buffer.from(message)
                .toString('base64')
                .replace(/\+/g, '-')
                .replace(/\//g, '_')
                .replace(/=+$/, '');

            const res = await gmail.users.messages.send({
                userId: 'me',
                requestBody: {
                    raw: encodedMessage
                }
            });

            console.log(`[Mailer] Email successfully dispatched via direct Gmail REST API! Message ID: ${res.data.id}`);
            return {
                messageId: res.data.id,
                response: '250 Sent via Gmail REST API'
            };
        } catch (apiErr) {
            console.error('[Mailer] Gmail REST API also failed:', apiErr.message);
            throw new Error(apiErr.message || smtpErr.message);
        }
    }
}

module.exports = {
    sendMail
};
