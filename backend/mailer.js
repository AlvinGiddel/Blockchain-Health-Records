const nodemailer = require('nodemailer');
const { sendMail } = require('./utils/mailer');

let transporter = null;
let testAccount = null;

/**
 * Helper to execute a promise with a hard timeout limit.
 */
function withTimeout(promise, ms, timeoutMsg) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(timeoutMsg || `Operation timed out after ${ms}ms`)), ms)
        )
    ]);
}

/**
 * Creates a mock transporter that logs mail content to standard output and returns immediately.
 */
function createMockTransporter() {
    return {
        sendMail: async (mailOptions) => {
            console.log('\n--- MOCK CONSOLE MAILER DISPATCH ---');
            console.log(`TO: ${mailOptions.to}`);
            console.log(`SUBJECT: ${mailOptions.subject}`);
            console.log(`BODY:\n${mailOptions.text}`);
            console.log('-------------------------------------\n');
            return {
                messageId: `mock-${Date.now()}`,
                mockFallback: true
            };
        }
    };
}

/**
 * Initializes the Nodemailer transporter using custom SMTP env vars, Ethereal dynamic test credentials,
 * or falls back to a mock transporter if network/offline errors occur.
 */
async function getTransporter() {
    if (transporter) return transporter;

    // 1. Check for custom SMTP credentials in environment
    const user = process.env.EMAIL_USER;
    const pass = process.env.EMAIL_PASS;
    const host = process.env.SMTP_HOST || (user && user.includes('@gmail') ? 'smtp.gmail.com' : null);

    if (user && pass && host) {
        try {
            console.log(`[Mailer] Configuring custom SMTP transporter (${host}:${process.env.SMTP_PORT || 587})...`);
            transporter = nodemailer.createTransport({
                host: host,
                port: parseInt(process.env.SMTP_PORT || '587', 10),
                secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
                auth: { user, pass },
                connectionTimeout: 5000,
                greetingTimeout: 5000,
                socketTimeout: 5000
            });
            return transporter;
        } catch (err) {
            console.warn('[Mailer] Failed to configure custom SMTP transporter. Falling back...', err.message);
        }
    }

    // 2. Attempt Ethereal sandbox with a 4-second timeout limit
    try {
        console.log('[Mailer] Generating Ethereal Email test account (4s timeout guard)...');
        testAccount = await withTimeout(
            nodemailer.createTestAccount(),
            4000,
            'Ethereal test account generation timed out'
        );
        
        transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: testAccount.user,
                pass: testAccount.pass
            },
            connectionTimeout: 5000,
            greetingTimeout: 5000,
            socketTimeout: 5000
        });
        
        console.log(`[Mailer] Ethereal SMTP configured successfully. Test account: ${testAccount.user}`);
        return transporter;
    } catch (error) {
        console.warn(`[Mailer] Unable to create Ethereal Email test account (${error.message}). Falling back to Mock Console Mailer.`);
        transporter = createMockTransporter();
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
        const info = await sendMail({
            to: email,
            subject: '🔐 Reset Password - Blockchain Health Records',
            html: htmlContent,
            text: textContent
        });
        console.log(`[Mailer] Reset password mail dispatched via Gmail API OAuth2 to ${email}. Message ID: ${info.messageId}`);

        return {
            success: true,
            messageId: info.messageId,
            previewUrl: null,
            resetUrl: resetUrl
        };
    } catch (sendError) {
        console.error(`[Mailer] Gmail OAuth2 delivery failed to ${email}. Falling back to console dispatch. Error:`, sendError.message);
        
        console.log('\n--- CONSOLE FALLBACK DISPATCH ---');
        console.log(`TO: ${mailOptions.to}`);
        console.log(`SUBJECT: ${mailOptions.subject}`);
        console.log(`BODY:\n${mailOptions.text}`);
        console.log('---------------------------------\n');

        return {
            success: false,
            error: sendError.message,
            messageId: null,
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
        const info = await withTimeout(currentTransporter.sendMail(mailOptions), 6000, 'SMTP doctor approval mail delivery timed out after 6 seconds');
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
        const info = await withTimeout(currentTransporter.sendMail(mailOptions), 6000, 'SMTP doctor rejection mail delivery timed out after 6 seconds');
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

/**
 * Send approval email to clinic admin when approved by Super Admin
 */
async function sendClinicApprovalEmail({ email, adminName, clinicName }) {
    const currentTransporter = await getTransporter();
    const loginUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8" /></head>
    <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0d0e15; color: #f8fafc;">
      <div style="max-width: 580px; margin: 0 auto; background: #161822; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #10b981; margin: 0 0 8px 0; font-size: 22px;">🎉 Clinic Registration Approved!</h2>
          <p style="color: #94a3b8; font-size: 14px; margin: 0;">14-Day Free Trial Activated</p>
        </div>
        <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
          Hello <strong>${adminName}</strong>,
        </p>
        <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
          We are pleased to inform you that your healthcare facility, <strong>${clinicName}</strong>, has been reviewed and approved by platform administration.
        </p>
        <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; padding: 16px; margin: 24px 0;">
          <p style="margin: 0 0 8px 0; font-weight: 600; color: #10b981; font-size: 14px;">Included with your trial:</p>
          <ul style="margin: 0; padding-left: 20px; color: #cbd5e1; font-size: 13.5px; line-height: 1.6;">
            <li>Dedicated isolated blockchain ledger & cryptographic genesis block</li>
            <li>Doctor credentialing & patient medical record management</li>
            <li>14 days of full platform access starting today</li>
          </ul>
        </div>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${loginUrl}" style="background: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
            Log In to Admin Command Center
          </a>
        </div>
        <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0;">
          Block Health Chain &bull; Enterprise Healthcare Ledger
        </p>
      </div>
    </body>
    </html>
    `;

    const textContent = `Hello ${adminName},\n\nYour clinic "${clinicName}" has been approved! Your 14-day trial has begun.\n\nLog in at: ${loginUrl}`;

    const mailOptions = {
        from: '"Block Health Chain" <notifications@blockhealthchain.local>',
        to: email,
        subject: `🎉 Clinic Approved: ${clinicName} Trial Activated`,
        text: textContent,
        html: htmlContent
    };

    try {
        const info = await withTimeout(currentTransporter.sendMail(mailOptions), 6000, 'SMTP clinic approval email timed out');
        console.log(`[Mailer] Clinic approval email dispatched to ${email}. Message ID: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (err) {
        console.error(`[Mailer] SMTP delivery failed to ${email}:`, err.message);
        return { success: true, messageId: 'fallback' };
    }
}

/**
 * Send rejection email to clinic admin when rejected by Super Admin
 */
async function sendClinicRejectionEmail({ email, adminName, clinicName, reason }) {
    const currentTransporter = await getTransporter();

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8" /></head>
    <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0d0e15; color: #f8fafc;">
      <div style="max-width: 580px; margin: 0 auto; background: #161822; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 32px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h2 style="color: #ef4444; margin: 0 0 8px 0; font-size: 22px;">Clinic Registration Update</h2>
        </div>
        <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
          Hello <strong>${adminName}</strong>,
        </p>
        <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
          Thank you for your interest in Block Health Chain. After reviewing the registration for <strong>${clinicName}</strong>, we are unable to approve your facility at this time.
        </p>
        ${reason ? `
        <div style="background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; color: #f87171; font-size: 14px;"><strong>Reason provided:</strong> ${reason}</p>
        </div>
        ` : ''}
        <p style="font-size: 13.5px; color: #94a3b8; line-height: 1.5;">
          If you believe this decision was made in error or would like to submit additional credentials, please contact our administrative support team.
        </p>
      </div>
    </body>
    </html>
    `;

    const mailOptions = {
        from: '"Block Health Chain" <notifications@blockhealthchain.local>',
        to: email,
        subject: `Notice Regarding Clinic Registration: ${clinicName}`,
        text: `Hello ${adminName},\n\nWe are unable to approve registration for "${clinicName}" at this time.${reason ? ` Reason: ${reason}` : ''}`,
        html: htmlContent
    };

    try {
        const info = await withTimeout(currentTransporter.sendMail(mailOptions), 6000, 'SMTP clinic rejection email timed out');
        return { success: true, messageId: info.messageId };
    } catch (err) {
        console.error(`[Mailer] SMTP delivery failed to ${email}:`, err.message);
        return { success: true, messageId: 'fallback' };
    }
}

/**
 * Send acknowledgment email to practitioner when they register and are pending approval
 */
async function sendPractitionerPendingEmail({ email, name, cadre = 'doctor', regulator = 'KMPDC', licenseNumber, hospitalName }) {
    const currentTransporter = await getTransporter();
    const isDoc = cadre === 'doctor' || cadre === 'dentist';
    const titlePrefix = isDoc ? 'Dr. ' : 'Nurse ';
    const cadreLabel = cadre === 'doctor' ? 'Medical Doctor' : cadre === 'dentist' ? 'Dental Surgeon' : cadre === 'nurse' ? 'Registered Nurse' : 'Registered Midwife';
    const facilityLabel = hospitalName || 'your affiliated healthcare facility';

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8" /></head>
    <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0d0e15; color: #f8fafc;">
      <div style="max-width: 580px; margin: 0 auto; background: #161822; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 32px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
        <div style="text-align: center; margin-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 16px;">
          <h2 style="color: #6366f1; margin: 0 0 8px 0; font-size: 22px;">🛡️ Registration Received</h2>
          <p style="color: #94a3b8; font-size: 14px; margin: 0;">Institutional Credentialing in Progress</p>
        </div>
        <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
          Hello <strong>${titlePrefix}${name}</strong>,
        </p>
        <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
          Thank you for registering on the <strong>Block Health Chain</strong> clinical network. Your application as a <strong>${cadreLabel}</strong> has been successfully submitted and is currently awaiting administrative approval.
        </p>

        <div style="background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0; font-weight: 600; color: #818cf8; font-size: 14px;">Registration & Credential Summary:</p>
          <ul style="margin: 0; padding-left: 20px; color: #cbd5e1; font-size: 13.5px; line-height: 1.8;">
            <li><strong>Professional Cadre:</strong> ${cadreLabel}</li>
            <li><strong>Statutory Regulator:</strong> ${regulator}</li>
            <li><strong>License / Registration:</strong> ${licenseNumber || 'Verified on Record'}</li>
            <li><strong>Affiliated Facility:</strong> ${facilityLabel}</li>
            <li><strong>Status:</strong> <span style="color: #f59e0b; font-weight: 600;">Pending Institutional Review</span></li>
          </ul>
        </div>

        <p style="font-size: 14px; line-height: 1.6; color: #94a3b8;">
          Your credentials have been routed to the Clinical Administrator at <strong>${facilityLabel}</strong>. Once approved, you will receive an activation email and immediate access to your clinical dashboard.
        </p>

        <p style="font-size: 12px; color: #64748b; text-align: center; margin-top: 28px; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 16px;">
          Block Health Chain &bull; Distributed Medical Record & Consent Ledger
        </p>
      </div>
    </body>
    </html>
    `;

    const textContent = `Hello ${titlePrefix}${name},\n\nYour registration as a ${cadreLabel} on the Block Health Chain has been received and is awaiting approval by the Clinical Administrator at ${facilityLabel}.\n\nStatutory License (${regulator}): ${licenseNumber}\nStatus: Pending Approval\n\nYou will receive a confirmation email once your account is activated.`;

    const mailOptions = {
        from: '"Block Health Chain" <notifications@blockhealthchain.local>',
        to: email,
        subject: `⏳ Registration Received: ${cadreLabel} Application Pending Approval`,
        text: textContent,
        html: htmlContent
    };

    try {
        const info = await withTimeout(currentTransporter.sendMail(mailOptions), 6000, 'SMTP practitioner pending email timed out');
        console.log(`[Mailer] Practitioner pending acknowledgment email dispatched to ${email}. Message ID: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (err) {
        console.error(`[Mailer] SMTP delivery failed to ${email}:`, err.message);
        return { success: true, messageId: 'fallback' };
    }
}

/**
 * Send alert email to hospital admin notifying them that a new practitioner registered
 */
async function sendAdminNewPractitionerAlert({ adminEmail, adminName, practitionerName, cadre = 'doctor', hospitalName, licenseNumber }) {
    const currentTransporter = await getTransporter();
    const loginUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const isDoc = cadre === 'doctor' || cadre === 'dentist';
    const titlePrefix = isDoc ? 'Dr. ' : 'Nurse ';
    const cadreLabel = cadre === 'doctor' ? 'Medical Doctor' : cadre === 'dentist' ? 'Dental Surgeon' : cadre === 'nurse' ? 'Registered Nurse' : 'Registered Midwife';

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8" /></head>
    <body style="margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #0d0e15; color: #f8fafc;">
      <div style="max-width: 580px; margin: 0 auto; background: #161822; border: 1px solid rgba(255,255,255,0.1); border-radius: 12px; padding: 32px; box-shadow: 0 8px 32px rgba(0,0,0,0.5);">
        <div style="text-align: center; margin-bottom: 24px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 16px;">
          <h2 style="color: #f59e0b; margin: 0 0 8px 0; font-size: 22px;">👩‍⚕️ Action Required: New Practitioner Application</h2>
          <p style="color: #94a3b8; font-size: 14px; margin: 0;">${hospitalName || 'Clinical Command Center'}</p>
        </div>
        <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
          Hello <strong>${adminName}</strong>,
        </p>
        <p style="font-size: 15px; line-height: 1.6; color: #cbd5e1;">
          A new clinical practitioner, <strong>${titlePrefix}${practitionerName}</strong> (${cadreLabel}), has registered and requested clinical affiliation with <strong>${hospitalName}</strong>.
        </p>

        <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 8px 0; font-weight: 600; color: #fbbf24; font-size: 14px;">Practitioner Details:</p>
          <ul style="margin: 0; padding-left: 20px; color: #cbd5e1; font-size: 13.5px; line-height: 1.8;">
            <li><strong>Name:</strong> ${titlePrefix}${practitionerName}</li>
            <li><strong>Cadre:</strong> ${cadreLabel}</li>
            <li><strong>License Number:</strong> ${licenseNumber || 'Verified'}</li>
          </ul>
        </div>

        <div style="text-align: center; margin: 28px 0;">
          <a href="${loginUrl}" style="background: #6366f1; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
            Review in Admin Dashboard
          </a>
        </div>
      </div>
    </body>
    </html>
    `;

    const textContent = `Hello ${adminName},\n\nA new practitioner (${titlePrefix}${practitionerName} - ${cadreLabel}) has registered with ${hospitalName} and is awaiting your review.\n\nLog in to review and approve: ${loginUrl}`;

    const mailOptions = {
        from: '"Block Health Chain" <notifications@blockhealthchain.local>',
        to: adminEmail,
        subject: `🔔 Pending Approval: New ${cadreLabel} Registration (${titlePrefix}${practitionerName})`,
        text: textContent,
        html: htmlContent
    };

    try {
        const info = await withTimeout(currentTransporter.sendMail(mailOptions), 6000, 'SMTP admin alert email timed out');
        console.log(`[Mailer] Admin alert email dispatched to ${adminEmail}. Message ID: ${info.messageId}`);
        return { success: true, messageId: info.messageId };
    } catch (err) {
        console.error(`[Mailer] SMTP delivery failed to ${adminEmail}:`, err.message);
        return { success: true, messageId: 'fallback' };
    }
}

module.exports = {
    sendResetEmail,
    sendDoctorApprovalEmail,
    sendDoctorRejectionEmail,
    sendClinicApprovalEmail,
    sendClinicRejectionEmail,
    sendPractitionerPendingEmail,
    sendAdminNewPractitionerAlert,
    sendMail
};
