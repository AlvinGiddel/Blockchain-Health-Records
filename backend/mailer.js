const nodemailer = require('nodemailer');

let transporter = null;
let testAccount = null;

/**
 * Initializes the Nodemailer transporter using Ethereal dynamic test credentials.
 * Falls back to a mock transporter if dynamic generation fails (offline/network errors).
 */
async function getTransporter() {
    if (transporter) return transporter;

    try {
        console.log('Generating Ethereal Email test account for development mail delivery...');
        testAccount = await nodemailer.createTestAccount();
        
        transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: testAccount.user,
                pass: testAccount.pass
            }
        });
        
        console.log(`Ethereal SMTP configured successfully. Test account: ${testAccount.user}`);
        return transporter;
    } catch (error) {
        console.warn('Unable to create Ethereal Email test account. Falling back to Mock Console Mailer.', error.message);
        // Fallback mock transporter
        transporter = {
            sendMail: async (mailOptions) => {
                console.log('\n--- MOCK CONSOLE MAILER DISPATCH ---');
                console.log(`TO: ${mailOptions.to}`);
                console.log(`SUBJECT: ${mailOptions.subject}`);
                console.log(`BODY:\n${mailOptions.text}`);
                console.log('-------------------------------------\n');
                return {
                    messageId: 'mock-id-12345',
                    mockFallback: true
                };
            }
        };
        return transporter;
    }
}

/**
 * Send password reset email to the specified user
 * @param {string} email - Destination email
 * @param {string} name - User's full name
 * @param {string} resetUrl - Clickable frontend link to reset password
 */
async function sendResetEmail(email, name, resetUrl) {
    const currentTransporter = await getTransporter();

    // Elegant dark glassmorphic HTML email template alignment with Block Health theme
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Password Reset Request</title>
        <style>
            body {
                background-color: #0a0b10;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 0;
                color: #f3f4f6;
            }
            .container {
                max-width: 600px;
                margin: 40px auto;
                background: linear-gradient(145deg, #11131c, #1b1e2c);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 16px;
                padding: 40px;
                box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5);
            }
            .header {
                text-align: center;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                padding-bottom: 20px;
                margin-bottom: 30px;
            }
            .logo {
                font-size: 1.5rem;
                font-weight: 700;
                color: #6366f1;
                text-transform: uppercase;
                letter-spacing: 1.5px;
                display: inline-flex;
                align-items: center;
                gap: 8px;
            }
            .shield-icon {
                color: #6366f1;
                display: inline-block;
                width: 24px;
                height: 24px;
                vertical-align: middle;
            }
            h2 {
                color: #f3f4f6;
                font-size: 1.5rem;
                margin-top: 0;
            }
            p {
                color: #9ca3af;
                font-size: 1rem;
                line-height: 1.6;
            }
            .btn-container {
                text-align: center;
                margin: 30px 0;
            }
            .btn {
                background-color: #6366f1;
                color: #ffffff !important;
                text-decoration: none;
                padding: 12px 30px;
                border-radius: 8px;
                font-weight: 600;
                display: inline-block;
                box-shadow: 0 4px 14px rgba(99, 102, 241, 0.4);
                transition: background-color 0.2s;
            }
            .btn:hover {
                background-color: #4f46e5;
            }
            .warning {
                font-size: 0.85rem;
                color: #6b7280;
                border-top: 1px solid rgba(255, 255, 255, 0.06);
                padding-top: 20px;
                margin-top: 30px;
            }
            .token-box {
                background: rgba(255, 255, 255, 0.04);
                border: 1px dashed rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                padding: 12px;
                font-family: monospace;
                word-break: break-all;
                color: #06b6d4;
                text-align: center;
                margin: 15px 0;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">
                    🛡️ BLOCKCHAIN HEALTH RECORDS
                </div>
            </div>
            <h2>Password Reset Requested</h2>
            <p>Hello ${name},</p>
            <p>A request was made to reset the password for your Blockchain Health account. If you made this request, please click the button below to complete the setup of your new password:</p>
            
            <div class="btn-container">
                <a href="${resetUrl}" class="btn" target="_blank">Reset Password</a>
            </div>

            <p>If the button doesn't work, copy and paste the following URL into your browser:</p>
            <div class="token-box">${resetUrl}</div>
            
            <p><strong>Note:</strong> This link is valid for 1 hour. If you did not request this, you can safely ignore this email; your password will remain secure.</p>
            
            <div class="warning">
                <p>This is a secure automated transmission from your Distributed Ledger Node. Please do not reply directly to this mail.</p>
            </div>
        </div>
    </body>
    </html>
    `;

    const textContent = `Hello ${name},\n\nA request was made to reset your password on the Blockchain Health Records system. Please visit the following link to reset your password:\n\n${resetUrl}\n\nThis link is valid for 1 hour. If you did not request this, you can ignore this email.`;

    const mailOptions = {
        from: '"Blockchain Health Security Node" <security@blockhealthchain.local>',
        to: email,
        subject: '🔐 Reset Password - Blockchain Health Records',
        text: textContent,
        html: htmlContent
    };

    try {
        const info = await currentTransporter.sendMail(mailOptions);
        console.log(`[Mailer] Reset password mail dispatched to ${email}. Message ID: ${info.messageId}`);

        // If Ethereal test account is active, log the URL to preview the email
        if (testAccount && !info.mockFallback) {
            const etherealUrl = nodemailer.getTestMessageUrl(info);
            console.log(`[Mailer Preview] Email received in sandbox inbox! View it at: ${etherealUrl}`);
            return {
                success: true,
                messageId: info.messageId,
                previewUrl: etherealUrl,
                resetUrl: resetUrl
            };
        }

        return {
            success: true,
            messageId: info.messageId,
            previewUrl: null,
            resetUrl: resetUrl
        };
    } catch (sendError) {
        console.error(`[Mailer] SMTP delivery failed to ${email}. Falling back to console dispatch. Error:`, sendError.message);
        
        console.log('\n--- CONSOLE FALLBACK DISPATCH ---');
        console.log(`TO: ${mailOptions.to}`);
        console.log(`SUBJECT: ${mailOptions.subject}`);
        console.log(`BODY:\n${mailOptions.text}`);
        console.log('---------------------------------\n');

        return {
            success: true,
            messageId: 'console-fallback-id',
            previewUrl: null,
            resetUrl: resetUrl
        };
    }
}

/**
 * Send email to notify a doctor that their registration was approved
 * @param {string} email - Destination email
 * @param {string} name - Doctor's full name
 */
async function sendDoctorApprovalEmail(email, name) {
    const currentTransporter = await getTransporter();

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Clinical Node Activated</title>
        <style>
            body {
                background-color: #0a0b10;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 0;
                color: #f3f4f6;
            }
            .container {
                max-width: 600px;
                margin: 40px auto;
                background: linear-gradient(145deg, #11131c, #1b1e2c);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 16px;
                padding: 40px;
                box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5);
            }
            .header {
                text-align: center;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                padding-bottom: 20px;
                margin-bottom: 30px;
            }
            .logo {
                font-size: 1.5rem;
                font-weight: 700;
                color: #10b981;
                text-transform: uppercase;
                letter-spacing: 1.5px;
                display: inline-flex;
                align-items: center;
                gap: 8px;
            }
            h2 {
                color: #f3f4f6;
                font-size: 1.5rem;
                margin-top: 0;
            }
            p {
                color: #9ca3af;
                font-size: 1rem;
                line-height: 1.6;
            }
            .warning {
                font-size: 0.85rem;
                color: #6b7280;
                border-top: 1px solid rgba(255, 255, 255, 0.06);
                padding-top: 20px;
                margin-top: 30px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">
                    🛡️ BLOCKCHAIN HEALTH RECORDS
                </div>
            </div>
            <h2>Doctor Registration Approved</h2>
            <p>Hello Dr. ${name},</p>
            <p>Your registration request as a Healthcare Provider on the Blockchain Health Records system has been approved by the administrator.</p>
            <p>Your clinical node has been successfully activated. You can now log in to access the system, view authorized patient records, and sign new diagnoses.</p>
            <div class="warning">
                <p>This is a secure automated transmission from your Distributed Ledger Node. Please do not reply directly to this mail.</p>
            </div>
        </div>
    </body>
    </html>
    `;

    const textContent = `Hello Dr. ${name},\n\nYour registration request as a Healthcare Provider on the Blockchain Health Records system has been approved by the administrator. You can now log in to access the system and manage patient dossiers.`;

    const mailOptions = {
        from: '"Blockchain Health Security Node" <security@blockhealthchain.local>',
        to: email,
        subject: '🩺 Clinical Node Activated - Blockchain Health Records',
        text: textContent,
        html: htmlContent
    };

    try {
        const info = await currentTransporter.sendMail(mailOptions);
        console.log(`[Mailer] Doctor approval mail dispatched to ${email}. Message ID: ${info.messageId}`);
        
        if (testAccount && !info.mockFallback) {
            const etherealUrl = nodemailer.getTestMessageUrl(info);
            console.log(`[Mailer Preview] Email received in sandbox inbox! View it at: ${etherealUrl}`);
            return { success: true, messageId: info.messageId, previewUrl: etherealUrl };
        }
        return { success: true, messageId: info.messageId };
    } catch (sendError) {
        console.error(`[Mailer] SMTP delivery failed to ${email}. Error:`, sendError.message);
        
        console.log('\n--- CONSOLE FALLBACK DISPATCH (APPROVAL) ---');
        console.log(`TO: ${mailOptions.to}`);
        console.log(`SUBJECT: ${mailOptions.subject}`);
        console.log(`BODY:\n${mailOptions.text}`);
        console.log('--------------------------------------------\n');

        return { success: true, messageId: 'console-fallback-id', previewUrl: null };
    }
}

/**
 * Send email to notify a doctor that their registration was rejected
 * @param {string} email - Destination email
 * @param {string} name - Doctor's full name
 */
async function sendDoctorRejectionEmail(email, name) {
    const currentTransporter = await getTransporter();

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Clinical Node Rejected</title>
        <style>
            body {
                background-color: #0a0b10;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                margin: 0;
                padding: 0;
                color: #f3f4f6;
            }
            .container {
                max-width: 600px;
                margin: 40px auto;
                background: linear-gradient(145deg, #11131c, #1b1e2c);
                border: 1px solid rgba(255, 255, 255, 0.06);
                border-radius: 16px;
                padding: 40px;
                box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.5);
            }
            .header {
                text-align: center;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                padding-bottom: 20px;
                margin-bottom: 30px;
            }
            .logo {
                font-size: 1.5rem;
                font-weight: 700;
                color: #ef4444;
                text-transform: uppercase;
                letter-spacing: 1.5px;
                display: inline-flex;
                align-items: center;
                gap: 8px;
            }
            h2 {
                color: #f3f4f6;
                font-size: 1.5rem;
                margin-top: 0;
            }
            p {
                color: #9ca3af;
                font-size: 1rem;
                line-height: 1.6;
            }
            .warning {
                font-size: 0.85rem;
                color: #6b7280;
                border-top: 1px solid rgba(255, 255, 255, 0.06);
                padding-top: 20px;
                margin-top: 30px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">
                    🛡️ BLOCKCHAIN HEALTH RECORDS
                </div>
            </div>
            <h2>Doctor Registration Rejected</h2>
            <p>Hello Dr. ${name},</p>
            <p>We regret to inform you that your registration request as a Healthcare Provider on the Blockchain Health Records system has been rejected by the administrator.</p>
            <p>If you believe this is an error or have additional credentials to submit, please contact a system administrator.</p>
            <div class="warning">
                <p>This is a secure automated transmission from your Distributed Ledger Node. Please do not reply directly to this mail.</p>
            </div>
        </div>
    </body>
    </html>
    `;

    const textContent = `Hello Dr. ${name},\n\nWe regret to inform you that your registration request as a Healthcare Provider on the Blockchain Health Records system has been rejected by the administrator.`;

    const mailOptions = {
        from: '"Blockchain Health Security Node" <security@blockhealthchain.local>',
        to: email,
        subject: '❌ Clinical Node Rejected - Blockchain Health Records',
        text: textContent,
        html: htmlContent
    };

    try {
        const info = await currentTransporter.sendMail(mailOptions);
        console.log(`[Mailer] Doctor rejection mail dispatched to ${email}. Message ID: ${info.messageId}`);
        
        if (testAccount && !info.mockFallback) {
            const etherealUrl = nodemailer.getTestMessageUrl(info);
            console.log(`[Mailer Preview] Email received in sandbox inbox! View it at: ${etherealUrl}`);
            return { success: true, messageId: info.messageId, previewUrl: etherealUrl };
        }
        return { success: true, messageId: info.messageId };
    } catch (sendError) {
        console.error(`[Mailer] SMTP delivery failed to ${email}. Error:`, sendError.message);
        
        console.log('\n--- CONSOLE FALLBACK DISPATCH (REJECTION) ---');
        console.log(`TO: ${mailOptions.to}`);
        console.log(`SUBJECT: ${mailOptions.subject}`);
        console.log(`BODY:\n${mailOptions.text}`);
        console.log('---------------------------------------------\n');

        return { success: true, messageId: 'console-fallback-id', previewUrl: null };
    }
}

module.exports = {
    sendResetEmail,
    sendDoctorApprovalEmail,
    sendDoctorRejectionEmail
};
