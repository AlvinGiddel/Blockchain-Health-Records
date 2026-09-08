/**
 * Patient Consents Controller
 * Exposes endpoints for granting, listing, and revoking granular patient record access.
 */

const crypto = require('crypto');
const consentRepo = require('../repositories/consentRepository');
const authRepo = require('../repositories/authRepository');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { verifyAuthToken } = require('../utils/helpers');
const { sendSms } = require('../services/smsService');

/**
 * List consents for the authenticated user
 * GET /api/consents
 */
const getConsents = catchAsync(async (req, res) => {
    const authUser = verifyAuthToken(req);

    if (authUser.role === 'patient') {
        const consents = await consentRepo.getConsentsByPatient(authUser.id);
        return res.json({ success: true, consents });
    }

    if (authUser.role === 'doctor') {
        const consents = await consentRepo.getConsentsForDoctor(authUser.id, authUser.organization_id);
        return res.json({ success: true, consents });
    }

    if (authUser.role === 'admin' || authUser.role === 'super_admin') {
        // Admins can see facility or platform-wide consents if needed
        const consents = await consentRepo.getConsentsByPatient(req.query.patientId || authUser.id);
        return res.json({ success: true, consents });
    }

    throw new AppError('Access denied: Unauthorized role for consents list.', 403);
});

/**
 * Grant access to a doctor or organization
 * POST /api/consents
 */
const grantConsent = catchAsync(async (req, res) => {
    const authUser = verifyAuthToken(req);
    if (authUser.role !== 'patient') {
        throw new AppError('Access denied: Only patients can grant access consent to their health records.', 403);
    }

    const {
        granteeType = 'doctor',
        doctorId,
        organizationId,
        scope = 'full_record',
        durationDays = null, // null = indefinite, or number of days
        purpose = 'Clinical Consultation & Diagnostic Review'
    } = req.body;

    if (granteeType === 'doctor' && !doctorId) {
        throw new AppError('Please select a valid practitioner to grant access to.', 400);
    }
    if (granteeType === 'organization' && !organizationId) {
        throw new AppError('Please select a healthcare organization to grant access to.', 400);
    }

    let targetDoctor = null;
    if (doctorId) {
        targetDoctor = await authRepo.findUserByIdAndRole(doctorId, 'doctor');
        if (!targetDoctor) {
            throw new AppError('The selected practitioner was not found on the platform.', 404);
        }
    }

    // Calculate optional expiration
    let expiresAt = null;
    if (durationDays && Number(durationDays) > 0) {
        expiresAt = new Date(Date.now() + (Number(durationDays) * 24 * 60 * 60 * 1000));
    }

    // Cryptographic hash for non-repudiation
    const payloadForHash = `${authUser.id}:${doctorId || organizationId}:${scope}:${expiresAt ? expiresAt.toISOString() : 'indefinite'}:${Date.now()}`;
    const transactionHash = crypto.createHash('sha256').update(payloadForHash).digest('hex');

    const consent = await consentRepo.createConsent({
        patientId: authUser.id,
        granteeType,
        doctorId: doctorId || null,
        organizationId: organizationId || (targetDoctor ? targetDoctor.organization_id : null),
        scope,
        expiresAt,
        purpose,
        transactionHash
    });

    // Notify doctor via SMS (asynchronously)
    if (targetDoctor) {
        const docPhone = targetDoctor.doctor_profile?.phone || targetDoctor.phone;
        if (docPhone) {
            const expiryText = expiresAt ? `valid for ${durationDays} days` : 'valid indefinitely';
            const smsText = `BHC CONSENT: Patient ${authUser.name} has granted you access (${scope.replace('_', ' ')}) to their electronic health records, ${expiryText}. Purpose: "${purpose}".`;
            sendSms({ to: docPhone, message: smsText, type: 'consent_granted' }).catch(err =>
                console.warn('[SMS Dispatch] Failed consent SMS to doctor:', err.message)
            );
        }
    }

    // Create Audit Log
    authRepo.createAuditLog({
        organizationId: targetDoctor ? targetDoctor.organization_id : (organizationId || null),
        eventType: 'consent_granted',
        patientId: authUser.id,
        patientName: authUser.name,
        doctorId: doctorId || null,
        doctorName: targetDoctor ? targetDoctor.name : null,
        details: `Patient ${authUser.name} granted ${scope} access consent to Dr. ${targetDoctor?.name || 'Facility'}. Scope: ${scope}, Expires: ${expiresAt ? expiresAt.toISOString() : 'Never'}.`
    }).catch(err => console.error('Failed to log consent grant audit:', err));

    res.status(201).json({
        success: true,
        message: `Record access consent granted successfully to ${targetDoctor ? 'Dr. ' + targetDoctor.name : 'facility'}.`,
        consent
    });
});

/**
 * Revoke an active consent grant
 * POST /api/consents/:id/revoke
 */
const revokeConsent = catchAsync(async (req, res) => {
    const authUser = verifyAuthToken(req);
    const { id } = req.params;
    const { reason = 'Revoked by patient' } = req.body;

    if (authUser.role !== 'patient') {
        throw new AppError('Access denied: Only patients can revoke their record access consents.', 403);
    }

    const consent = await consentRepo.findConsentById(id);
    if (!consent) {
        throw new AppError('Consent record not found.', 404);
    }

    if (consent.patient_id !== authUser.id) {
        throw new AppError('Access denied: You cannot revoke another patient\'s consent.', 403);
    }

    if (consent.status === 'revoked') {
        return res.json({ success: true, message: 'Consent is already revoked.', consent });
    }

    const updated = await consentRepo.revokeConsent(id, authUser.id, reason);

    // Notify doctor of revocation (asynchronously)
    if (consent.doctor_id) {
        const doctor = await authRepo.findUserByIdAndRole(consent.doctor_id, 'doctor');
        const docPhone = doctor?.doctor_profile?.phone || doctor?.phone;
        if (docPhone) {
            const smsText = `BHC NOTICE: Patient ${authUser.name} has revoked your access consent to their health records.`;
            sendSms({ to: docPhone, message: smsText, type: 'consent_revoked' }).catch(err =>
                console.warn('[SMS Dispatch] Failed revocation SMS to doctor:', err.message)
            );
        }
    }

    // Create Audit Log
    authRepo.createAuditLog({
        organizationId: consent.organization_id || null,
        eventType: 'consent_revoked',
        patientId: authUser.id,
        patientName: authUser.name,
        doctorId: consent.doctor_id || null,
        details: `Patient ${authUser.name} revoked access consent for ID: ${id}. Reason: "${reason}".`
    }).catch(err => console.error('Failed to log consent revocation audit:', err));

    res.json({
        success: true,
        message: 'Access consent successfully revoked. Clinician access has been terminated.',
        consent: updated
    });
});

module.exports = {
    getConsents,
    grantConsent,
    revokeConsent
};
