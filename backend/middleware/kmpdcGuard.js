/**
 * KMPDC License Guard Middleware
 * 
 * Intercepts doctor registrations and transactions to ensure the medical practitioner
 * possesses an active, verified license with the Kenya Medical Practitioners and Dentists Council.
 */

const { verifyKmpdcLicense } = require('../services/kmpdcVerification');

async function kmpdcGuard(req, res, next) {
    try {
        const { role, profile, name, doctorName, licenseNumber: topLicense } = req.body || {};

        // Only enforce for doctor registrations or actions
        const isDoctorRegistration = role === 'doctor';
        const rawLicense = topLicense || profile?.licenseNumber;
        const candidateName = name || doctorName || req.user?.name;

        if (isDoctorRegistration || rawLicense) {
            if (!rawLicense) {
                return res.status(422).json({
                    error: 'A valid KMPDC medical license number (e.g. A12345) is mandatory for medical practitioner registration.'
                });
            }

            const verification = await verifyKmpdcLicense(rawLicense, candidateName);

            if (!verification.verified) {
                return res.status(422).json({
                    error: verification.error,
                    details: {
                        providedLicense: rawLicense,
                        providedName: candidateName
                    }
                });
            }

            // Attach verified council record to request object for downstream handlers
            req.kmpdcRecord = verification.record;
        }

        return next();
    } catch (err) {
        console.error('[KMPDC Guard Error]:', err);
        return res.status(500).json({ error: 'Internal error during KMPDC license verification.' });
    }
}

module.exports = kmpdcGuard;
