const nodemailer = require('nodemailer');
const { google } = require('googleapis');

const REDIRECT_URI = 'https://developers.google.com/oauthplayground';

/**
 * Sends an email using Gmail API OAuth2 credentials.
 * Designed for serverless environments (Vercel Functions):
 * - Stateless: Obtains a fresh access token per invocation.
 * - Ephemeral: Does not reuse long-lived SMTP connection pools across cold starts.
 * - Validates credentials and provides clear error diagnostics.
 *
 * @param {Object} options
 * @param {string} options.to - Recipient email address
 * @param {string} options.subject - Email subject line
 * @param {string} options.html - HTML email body
 * @param {string} [options.text] - Optional plain text alternative
 * @returns {Promise<Object>} Nodemailer sendMail result
 */
async function sendMail({ to, subject, html, text }) {
    const user = process.env.GMAIL_USER;
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

    if (!user || !clientId || !clientSecret || !refreshToken) {
        throw new Error(
            'Missing Gmail OAuth2 configuration. Please set GMAIL_USER, GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, and GMAIL_REFRESH_TOKEN.'
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

    // 3. Fetch a fresh access token per call (serverless-friendly)
    const tokenResponse = await oauth2Client.getAccessToken();
    const accessToken = typeof tokenResponse === 'object' && tokenResponse?.token
        ? tokenResponse.token
        : tokenResponse;

    if (!accessToken) {
        throw new Error('Failed to generate a fresh access token from Gmail OAuth2.');
    }

    // 4. Build a Nodemailer transporter using Gmail OAuth2
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

    // 5. Send the email and return result
    const mailOptions = {
        from: `"Blockchain Health Records" <${user}>`,
        to,
        subject,
        html,
        text: text || (typeof html === 'string' ? html.replace(/<[^>]*>?/gm, ' ') : '')
    };

    const result = await transporter.sendMail(mailOptions);
    return result;
}

module.exports = {
    sendMail
};
