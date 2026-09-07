const jwt = require('jsonwebtoken');
const practitionersRepository = require('../repositories/practitionersRepository');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { verifyKmpdcLicense, inspectKmpdcLicense } = require('../services/kmpdcVerification');
const { verifyNckLicense, inspectNckLicense, validateNckLicenseFormat } = require('../services/nckVerification');
const { verifyPractitioner } = require('../services/practitionerAttestation');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

/**
 * Real-time KMPDC Doctor License Verification API
 * GET /api/kmpdc/verify?license=A12345&name=Jane+Doe
 */
const verifyKmpdc = catchAsync(async (req, res) => {
    const { license, name } = req.query;
    if (!license) {
        throw new AppError('License query parameter is required (e.g. /api/kmpdc/verify?license=A12345&name=Jane+Doe)', 400);
    }
    const result = await verifyKmpdcLicense(String(license), name ? String(name) : undefined);
    if (!result.verified) {
        return res.status(422).json({
            valid: false,
            error: result.error,
            matchScore: result.matchScore || 0
        });
    }
    res.json({
        valid: true,
        practitioner: result.record,
        matchScore: result.matchScore
    });
});

/**
 * Real-time NCK Nurse / Midwife License Verification API
 * GET /api/nck/verify?license=594079&name=Mary+Kungu&cadre=nurse
 */
const verifyNck = catchAsync(async (req, res) => {
    const { license, name, cadre = 'nurse' } = req.query;
    if (!license) {
        throw new AppError('License query parameter is required (e.g. /api/nck/verify?license=594079&name=Mary+Kungu)', 400);
    }
    const result = await verifyNckLicense(String(license), name ? String(name) : undefined, String(cadre));
    if (!result.verified) {
        return res.status(422).json({
            valid: false,
            error: result.error,
            matchScore: result.matchScore || 0
        });
    }
    res.json({
        valid: true,
        practitioner: result.record,
        matchScore: result.matchScore
    });
});

/**
 * Unified Practitioner Verification API (KMPDC + NCK based on cadre)
 * GET /api/practitioner/verify?license=...&name=...&cadre=doctor
 */
const verifyPractitionerHandler = catchAsync(async (req, res) => {
    const { license, name, cadre = 'doctor' } = req.query;
    if (!license) {
        throw new AppError('License query parameter is required', 400);
    }
    const result = await verifyPractitioner({
        cadre: String(cadre),
        licenseNumber: String(license),
        practitionerName: name ? String(name) : undefined
    });
    if (!result.verified) {
        return res.status(422).json({
            valid: false,
            error: result.error,
            regulator: result.regulator,
            matchScore: result.matchScore || 0
        });
    }
    res.json({
        valid: true,
        regulator: result.regulator,
        cadre: result.cadre,
        practitioner: result.record,
        matchScore: result.matchScore
    });
});

/**
 * Get Master KMPDC Practitioners Register
 * GET /api/kmpdc/practitioners
 */
const getKmpdcPractitioners = catchAsync(async (req, res) => {
    const rows = await practitionersRepository.getKmpdcPractitioners();
    res.json({ success: true, practitioners: rows });
});

/**
 * Super Admin Pre-flight Inspection of KMPDC License
 * GET /api/kmpdc/inspect?license=A12345&name=Dr.+John+Doe
 */
const inspectKmpdc = catchAsync(async (req, res) => {
    const { license, name } = req.query;
    if (!license) {
        throw new AppError('License parameter is required', 400);
    }

    const result = await inspectKmpdcLicense(String(license), name ? String(name) : undefined);
    res.json({ success: true, ...result });
});

/**
 * Super Admin Add Practitioner to Master KMPDC Registry
 * POST /api/kmpdc/practitioners
 */
const addKmpdcPractitioner = catchAsync(async (req, res) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        throw new AppError('Authentication token required.', 401);
    }
    const token = authHeader.substring(7).trim();
    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
        throw new AppError('Invalid or expired authentication token.', 401);
    }
    if (!decoded || decoded.role !== 'super_admin') {
        throw new AppError('Access restricted to Super Administrators only.', 403);
    }

    const { licenseNumber, fullName, cadre, specialization, facility, organizationId, status, confirmOverwrite } = req.body;
    if (!licenseNumber || !fullName) {
        throw new AppError('licenseNumber and fullName are required.', 400);
    }

    const cleanLicense = licenseNumber.trim().toUpperCase();
    const cleanName = fullName.trim();
    const cleanCadre = cadre || 'Medical Practitioner';
    const cleanSpec = specialization || 'General Practice';
    const cleanStatus = status || 'active';

    // 1. Check if practitioner license already exists in registry (Duplicate Safeguard)
    const existing = await practitionersRepository.findKmpdcByLicense(cleanLicense);
    const isDuplicate = Boolean(existing);
    if (isDuplicate && !confirmOverwrite) {
        return res.status(409).json({
            error: `Practitioner license ${cleanLicense} already exists on record for '${existing.full_name}' at '${existing.facility}'. Explicit confirmation is required to overwrite this record.`,
            isDuplicate: true,
            existingRecord: {
                licenseNumber: existing.license_number,
                fullName: existing.full_name,
                facility: existing.facility,
                cadre: existing.cadre,
                specialization: existing.specialization,
                status: existing.status,
                organizationName: existing.organizationName
            }
        });
    }

    let targetOrgId = null;
    let cleanFacility = facility ? facility.trim() : 'Kenyatta National Hospital';

    if (organizationId && organizationId !== 'other') {
        const org = await practitionersRepository.findOrganizationById(organizationId);
        if (org) {
            targetOrgId = org.id;
            cleanFacility = org.name; // Ensure consistent canonical name
        }
    }

    const practitioner = await practitionersRepository.upsertKmpdcPractitioner({
        licenseNumber: cleanLicense,
        fullName: cleanName,
        cadre: cleanCadre,
        specialization: cleanSpec,
        facility: cleanFacility,
        organizationId: targetOrgId,
        status: cleanStatus,
        retentionYear: 2026
    });

    const actionText = isDuplicate ? 'updated' : 'registered';
    res.status(201).json({
        success: true,
        message: `Practitioner ${cleanName} (${cleanLicense}) successfully ${actionText} in KMPDC Oracle!`,
        isDuplicate,
        practitioner
    });
});

/**
 * Get Master NCK Nurses & Midwives Register
 * GET /api/nck/practitioners
 */
const getNckPractitioners = catchAsync(async (req, res) => {
    const rows = await practitionersRepository.getNckPractitioners();
    res.json({ success: true, practitioners: rows });
});

/**
 * Super Admin Pre-flight Inspection of NCK License
 * GET /api/nck/inspect?license=594079&name=Mary+Kungu
 */
const inspectNck = catchAsync(async (req, res) => {
    const { license, name } = req.query;
    if (!license) {
        throw new AppError('License parameter is required', 400);
    }

    const result = await inspectNckLicense(String(license), name ? String(name) : undefined);
    res.json({ success: true, ...result });
});

/**
 * Super Admin Add Nurse/Midwife to Master NCK Registry
 * POST /api/nck/practitioners
 */
const addNckPractitioner = catchAsync(async (req, res) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        throw new AppError('Authentication token required.', 401);
    }

    const token = authHeader.substring(7).trim();
    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
        throw new AppError('Invalid or expired authentication token.', 401);
    }

    if (decoded.role !== 'super_admin') {
        throw new AppError('Access restricted: Only Super Administrators can manage statutory registries.', 403);
    }

    const { licenseNumber, fullName, cadre, status, validTill, facility, organizationId, confirmOverwrite } = req.body;

    if (!licenseNumber || !fullName) {
        throw new AppError('NCK License number and practitioner name are required.', 400);
    }

    const cleanLicense = String(licenseNumber).trim().toUpperCase();
    const cleanName = String(fullName).trim();
    const cleanCadre = cadre === 'midwife' ? 'midwife' : 'nurse';
    const cleanStatus = ['active', 'suspended', 'inactive'].includes(String(status).toLowerCase()) ? String(status).toLowerCase() : 'active';

    // 1. Syntactic format validation
    if (!validateNckLicenseFormat(cleanLicense)) {
        throw new AppError(`Invalid NCK license format '${cleanLicense}'. Expected numeric (e.g. 594079) or council registration format (e.g. KRCHN-12345).`, 400);
    }

    // 2. Safeguard: Duplicate Check in nck_registry
    const existing = await practitionersRepository.findNckByLicense(cleanLicense);
    const isDuplicate = Boolean(existing);
    if (isDuplicate && confirmOverwrite !== true) {
        return res.status(409).json({
            error: `Duplicate license: ${cleanLicense} is already registered in NCK Oracle.`,
            isDuplicate: true,
            existingRecord: {
                licenseNumber: existing.license_number,
                fullName: existing.full_name,
                cadre: existing.cadre,
                facility: existing.facility,
                status: existing.status,
                organizationName: existing.organizationName
            }
        });
    }

    // 3. Resolve Organization linkage
    let targetOrgId = null;
    let cleanFacility = facility ? String(facility).trim() : 'National Health Service';

    if (organizationId && typeof organizationId === 'string' && organizationId.trim()) {
        const org = await practitionersRepository.findOrganizationById(organizationId.trim());
        if (org) {
            targetOrgId = org.id;
            cleanFacility = org.name;
        }
    }

    // 4. Save to nck_registry via repository
    const practitioner = await practitionersRepository.upsertNckPractitioner({
        licenseNumber: cleanLicense,
        fullName: cleanName,
        cadre: cleanCadre,
        status: cleanStatus,
        validTill: validTill || null,
        facility: cleanFacility,
        organizationId: targetOrgId
    });

    const actionText = isDuplicate ? 'updated' : 'registered';
    res.status(201).json({
        success: true,
        message: `Nurse practitioner ${cleanName} (${cleanLicense}) successfully ${actionText} in NCK Oracle!`,
        isDuplicate,
        practitioner
    });
});

module.exports = {
    verifyKmpdc,
    verifyNck,
    verifyPractitionerHandler,
    getKmpdcPractitioners,
    inspectKmpdc,
    addKmpdcPractitioner,
    getNckPractitioners,
    inspectNck,
    addNckPractitioner
};
