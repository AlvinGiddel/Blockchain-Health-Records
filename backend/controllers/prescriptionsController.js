/**
 * Prescriptions Controller
 * 
 * Handles drug autocomplete (RxNav + Curated Cache), prescription creation,
 * patient/doctor/clinic querying, public QR verification, and pharmacy dispensing.
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const prescriptionsRepo = require('../repositories/prescriptionsRepository');
const recordsRepo = require('../repositories/recordsRepository');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

// In-memory LRU Cache for drug searches (TTL: 10 minutes)
const drugSearchCache = new Map();
const DRUG_CACHE_TTL = 10 * 60 * 1000;

// Curated Clinical Reference Database for instant offline / fallback search
const CURATED_DRUGS = [
    { name: 'Amoxicillin', rxnormCode: '723', category: 'Antibiotic', commonDosages: ['250mg', '500mg', '875mg'], standardFrequency: 'Three times daily for 7 days' },
    { name: 'Amoxicillin / Clavulanate (Augmentin)', rxnormCode: '617314', category: 'Antibiotic', commonDosages: ['625mg', '1000mg'], standardFrequency: 'Twice daily with meals for 7 days' },
    { name: 'Paracetamol (Acetaminophen)', rxnormCode: '161', category: 'Analgesic / Antipyretic', commonDosages: ['500mg', '1000mg'], standardFrequency: 'Every 6-8 hours as needed for pain' },
    { name: 'Ibuprofen', rxnormCode: '5640', category: 'NSAID', commonDosages: ['200mg', '400mg', '600mg'], standardFrequency: 'Three times daily after meals' },
    { name: 'Metformin Hydrochloride', rxnormCode: '6809', category: 'Antidiabetic', commonDosages: ['500mg', '850mg', '1000mg'], standardFrequency: 'Twice daily with breakfast and dinner' },
    { name: 'Atorvastatin', rxnormCode: '83367', category: 'Statin / Lipid-lowering', commonDosages: ['10mg', '20mg', '40mg', '80mg'], standardFrequency: 'Once daily at bedtime' },
    { name: 'Omeprazole', rxnormCode: '7646', category: 'Proton Pump Inhibitor', commonDosages: ['20mg', '40mg'], standardFrequency: 'Once daily 30 minutes before breakfast' },
    { name: 'Ciprofloxacin', rxnormCode: '2551', category: 'Fluoroquinolone Antibiotic', commonDosages: ['250mg', '500mg'], standardFrequency: 'Twice daily for 5-7 days' },
    { name: 'Azithromycin', rxnormCode: '18631', category: 'Macrolide Antibiotic', commonDosages: ['250mg', '500mg'], standardFrequency: '500mg on day 1, then 250mg daily on days 2-5' },
    { name: 'Losartan Potassium', rxnormCode: '52246', category: 'Antihypertensive (ARB)', commonDosages: ['25mg', '50mg', '100mg'], standardFrequency: 'Once daily in the morning' },
    { name: 'Amlodipine Besylate', rxnormCode: '17767', category: 'Calcium Channel Blocker', commonDosages: ['5mg', '10mg'], standardFrequency: 'Once daily' },
    { name: 'Ceftriaxone Sodium', rxnormCode: '2193', category: 'Cephalosporin Antibiotic', commonDosages: ['1g', '2g'], standardFrequency: 'IV/IM once daily' },
    { name: 'Salbutamol Inhaler (Albuterol)', rxnormCode: '435', category: 'Bronchodilator', commonDosages: ['100mcg/puff'], standardFrequency: '1-2 puffs every 4-6 hours as needed' },
    { name: 'Cetirizine Hydrochloride', rxnormCode: '20610', category: 'Antihistamine', commonDosages: ['10mg'], standardFrequency: 'Once daily at bedtime' },
    { name: 'Artemether / Lumefantrine (Coartem)', rxnormCode: '847910', category: 'Antimalarial', commonDosages: ['20mg/120mg'], standardFrequency: '4 tablets twice daily for 3 days' },
    { name: 'Metronidazole (Flagyl)', rxnormCode: '6922', category: 'Antiprotozoal / Antibacterial', commonDosages: ['400mg', '500mg'], standardFrequency: 'Three times daily for 7 days' },
    { name: 'Doxycycline', rxnormCode: '3640', category: 'Tetracycline Antibiotic', commonDosages: ['100mg'], standardFrequency: 'Twice daily with a full glass of water' },
    { name: 'Pantoprazole Sodium', rxnormCode: '40790', category: 'Proton Pump Inhibitor', commonDosages: ['40mg'], standardFrequency: 'Once daily before breakfast' },
    { name: 'Hydrochlorothiazide', rxnormCode: '5487', category: 'Diuretic', commonDosages: ['12.5mg', '25mg'], standardFrequency: 'Once daily in the morning' },
    { name: 'Prednisone', rxnormCode: '8640', category: 'Corticosteroid', commonDosages: ['5mg', '10mg', '20mg'], standardFrequency: 'Once daily with breakfast, tapering schedule' }
];

/**
 * Mask patient name for public verification privacy (e.g. "John Doe" -> "J*** D***")
 */
function maskName(fullName) {
    if (!fullName) return 'Patient';
    return fullName
        .trim()
        .split(/\s+/)
        .map(part => part.length <= 1 ? part : part[0] + '***')
        .join(' ');
}

/**
 * Drug Autocomplete API
 * GET /api/prescriptions/drugs/search?q=
 */
const searchDrugs = catchAsync(async (req, res) => {
    const query = (req.query.q || '').trim();
    if (!query || query.length < 2) {
        return res.json({ results: [] });
    }

    const cacheKey = query.toLowerCase();
    const cached = drugSearchCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < DRUG_CACHE_TTL)) {
        return res.json({ results: cached.data });
    }

    let results = [];

    // 1. Check Curated Local Reference Set
    const localMatches = CURATED_DRUGS.filter(d => 
        d.name.toLowerCase().includes(cacheKey) || 
        d.category.toLowerCase().includes(cacheKey)
    );

    // 2. Try querying external NIH RxNav API with a tight 2.5s timeout
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        const rxNavUrl = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(query)}&maxEntries=12`;
        const resp = await fetch(rxNavUrl, { 
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
        });
        clearTimeout(timeoutId);

        if (resp.ok) {
            const data = await resp.json();
            const candidates = data?.approximateGroup?.candidate || [];
            
            const rxNavResults = candidates
                .filter(c => c.rxcui)
                .map(c => ({
                    name: c.name || query,
                    rxnormCode: String(c.rxcui),
                    category: 'Standard Clinical Drug',
                    commonDosages: ['Standard Dosage'],
                    standardFrequency: 'As directed by physician',
                    score: c.score
                }));

            // Merge local matches with RxNav, deduplicating by name
            const seen = new Set();
            for (const item of localMatches) {
                seen.add(item.name.toLowerCase());
                results.push(item);
            }
            for (const item of rxNavResults) {
                if (!seen.has(item.name.toLowerCase())) {
                    seen.add(item.name.toLowerCase());
                    results.push(item);
                }
            }
        } else {
            results = localMatches;
        }
    } catch (err) {
        // Fallback directly to local catalog on timeout or offline
        results = localMatches;
    }

    // Cache the result
    drugSearchCache.set(cacheKey, { data: results.slice(0, 15), timestamp: Date.now() });

    return res.json({ results: results.slice(0, 15) });
});

/**
 * Create a new Prescription (Doctor only)
 * POST /api/prescriptions
 */
const createPrescription = catchAsync(async (req, res) => {
    const { patientId, instructions, expiresAt, items, overrideJustification } = req.body;
    const doctorId = req.user.id;
    const organizationId = req.user.organization_id || req.user.organizationId;

    if (!organizationId) {
        throw new AppError('Doctor must be affiliated with an active healthcare facility to issue prescriptions.', 403);
    }

    if (!patientId) {
        throw new AppError('Patient ID is required.', 400);
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new AppError('At least one prescription medication item is required.', 400);
    }

    // 1. Enforce Treating Relationship Check (confirmed/completed appointment or active emergency break-glass < 1 hr)
    const isTreating = await recordsRepo.checkTreatingRelationship(doctorId, patientId);
    if (!isTreating) {
        throw new AppError('Access Denied: You do not have an active treatment relationship (confirmed/completed appointment) or emergency break-glass authorization for this patient.', 403);
    }

    // 2. Generate cryptographic QR verification token
    const qrToken = `rx_${crypto.randomBytes(18).toString('hex')}`;

    // 3. Clinical Contraindication / Allergy Safety Cross-Check
    const patientAllergies = await prescriptionsRepo.getPatientAllergies(patientId);
    const allergyWarnings = [];

    if (patientAllergies && patientAllergies.length > 0) {
        const allergyTerms = patientAllergies.map(a => a.toLowerCase().trim());
        for (const item of items) {
            const drugName = (item.medicationName || '').toLowerCase();
            for (const allergy of allergyTerms) {
                if (allergy && (drugName.includes(allergy) || (allergy.includes('penicillin') && (drugName.includes('amoxicillin') || drugName.includes('ampicillin') || drugName.includes('augmentin'))))) {
                    allergyWarnings.push({
                        medication: item.medicationName,
                        allergyAlert: `Patient has documented allergy: "${allergy}". High clinical risk.`
                    });
                }
            }
        }
    }

    // 4. Clinical Allergy Hard Block: If contraindications detected, require explicit rationale (min 10 chars)
    const trimmedOverride = (overrideJustification || '').trim();
    if (allergyWarnings.length > 0 && trimmedOverride.length < 10) {
        return res.status(400).json({
            status: 'fail',
            requiresOverride: true,
            message: `Clinical safety block: Patient has documented allergy contraindications (${allergyWarnings.map(w => w.medication).join(', ')}). Explicit clinical override justification (minimum 10 characters) is required to issue this prescription.`,
            allergyWarnings
        });
    }

    const prescription = await prescriptionsRepo.createPrescription({
        patientId,
        doctorId,
        organizationId,
        instructions,
        expiresAt,
        qrToken,
        items,
        overrideJustification: trimmedOverride || null
    });

    return res.status(201).json({
        status: 'success',
        message: 'Prescription issued successfully.',
        prescription,
        allergyWarnings
    });
});

/**
 * List prescriptions based on caller role & organization scope
 * GET /api/prescriptions
 */
const listPrescriptions = catchAsync(async (req, res) => {
    const userRole = req.user.role;
    const userId = req.user.id;
    const organizationId = req.user.organization_id || req.user.organizationId;
    const { status, search } = req.query;

    let prescriptions = [];

    if (userRole === 'patient') {
        prescriptions = await prescriptionsRepo.getPrescriptionsByPatient(userId);
    } else if (userRole === 'doctor') {
        // Doctors see prescriptions from their facility or issued by themselves
        prescriptions = await prescriptionsRepo.getPrescriptionsByOrganization(organizationId, { status, search });
    } else if (userRole === 'admin' || userRole === 'clinic') {
        prescriptions = await prescriptionsRepo.getPrescriptionsByOrganization(organizationId, { status, search });
    } else if (userRole === 'super_admin') {
        // Super admin can filter by org or see given org
        const targetOrgId = req.query.organizationId || organizationId;
        if (targetOrgId) {
            prescriptions = await prescriptionsRepo.getPrescriptionsByOrganization(targetOrgId, { status, search });
        } else {
            prescriptions = await prescriptionsRepo.getPrescriptionsByOrganization(organizationId, { status, search });
        }
    } else {
        throw new AppError('Unauthorized access to prescriptions.', 403);
    }

    return res.json({
        status: 'success',
        results: prescriptions.length,
        prescriptions
    });
});

/**
 * Get single prescription details by ID
 * GET /api/prescriptions/:id
 */
const getPrescriptionById = catchAsync(async (req, res) => {
    const { id } = req.params;
    const prescription = await prescriptionsRepo.getPrescriptionById(id);

    if (!prescription) {
        throw new AppError('Prescription not found.', 404);
    }

    // Tenant / role access check
    const userRole = req.user.role;
    const userId = req.user.id;
    const organizationId = req.user.organization_id || req.user.organizationId;

    if (userRole === 'patient' && prescription.patient_id !== userId) {
        throw new AppError('Access denied to this prescription.', 403);
    }

    if ((userRole === 'doctor' || userRole === 'admin' || userRole === 'clinic') && 
        prescription.organization_id !== organizationId && 
        userRole !== 'super_admin') {
        throw new AppError('Access denied: Prescription belongs to a different healthcare facility.', 403);
    }

    return res.json({
        status: 'success',
        prescription
    });
});

/**
 * Public Verification Endpoint (Scanned QR code passport view)
 * GET /api/prescriptions/verify/:qr_token
 */
const verifyPrescriptionByToken = catchAsync(async (req, res) => {
    const { qr_token } = req.params;
    if (!qr_token) {
        throw new AppError('QR Token is required for prescription verification.', 400);
    }

    const rx = await prescriptionsRepo.getPrescriptionByQrToken(qr_token);
    if (!rx) {
        return res.status(404).json({
            verified: false,
            error: 'Invalid or unrecognized prescription token. No active medical record corresponds to this digital seal.'
        });
    }

    const isExpired = new Date(rx.expires_at) < new Date();
    const effectiveStatus = (rx.status === 'ISSUED' || rx.status === 'PARTIALLY_FILLED') && isExpired
        ? 'EXPIRED'
        : rx.status;

    // Zero-Knowledge Tiered Privacy Check:
    // Determine whether caller is authenticated OR provided valid patient verification challenge
    let isUnlockedByAuth = false;
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
            const decoded = jwt.verify(authHeader.substring(7).trim(), JWT_SECRET);
            if (['doctor', 'admin', 'super_admin'].includes(decoded.role) || decoded.id === rx.patient_id) {
                isUnlockedByAuth = true;
            }
        } catch {
            // Unauthenticated or invalid token, fallback to verification code challenge
        }
    }

    const patientProfile = typeof rx.patient_profile === 'string'
        ? (JSON.parse(rx.patient_profile || '{}') || {})
        : (rx.patient_profile || {});

    const birthYearMatch = String(patientProfile.dob || patientProfile.dateOfBirth || patientProfile.date_of_birth || '').match(/\b(19\d\d|20\d\d)\b/);
    const expectedBirthYear = birthYearMatch ? birthYearMatch[0] : null;
    const patientPhone = String(patientProfile.phone || rx.patient_phone || '').replace(/\D/g, '');
    const last4Phone = patientPhone.length >= 4 ? patientPhone.slice(-4) : null;

    const userVerifyCode = String(req.query.dobYear || req.query.verifyCode || req.headers['x-patient-verify'] || '').trim();
    let isUnlockedByChallenge = false;
    if (userVerifyCode) {
        if (expectedBirthYear && userVerifyCode === expectedBirthYear) {
            isUnlockedByChallenge = true;
        } else if (last4Phone && userVerifyCode === last4Phone) {
            isUnlockedByChallenge = true;
        } else if (!expectedBirthYear && !last4Phone) {
            // Patient account has no recorded DOB or phone: accept 4-digit verification code
            if (/^\d{4}$/.test(userVerifyCode)) {
                isUnlockedByChallenge = true;
            }
        }
    }

    const isMedicationsUnlocked = isUnlockedByAuth || isUnlockedByChallenge;

    // Mask sensitive details while providing verifiable clinical trust anchors
    const sanitizedPayload = {
        verified: effectiveStatus !== 'CANCELLED' && effectiveStatus !== 'EXPIRED',
        status: effectiveStatus,
        qrToken: rx.qr_token,
        issuedAt: rx.created_at,
        expiresAt: rx.expires_at,
        patientMaskedName: maskName(rx.patient_name),
        issuingDoctor: {
            name: rx.doctor_name,
            cadre: rx.doctor_profile?.cadre || 'Medical Practitioner',
            licenseNumber: rx.doctor_profile?.licenseNumber ? `****${rx.doctor_profile.licenseNumber.slice(-4)}` : 'Verified',
            specialization: rx.doctor_profile?.specialization || 'Clinical Practice'
        },
        issuingFacility: {
            name: rx.organization_name
        },
        medicationsRestricted: !isMedicationsUnlocked,
        requiresVerificationToViewMedications: !isMedicationsUnlocked,
        verificationHint: !isMedicationsUnlocked ? 'Patient Year of Birth (YYYY) or Provider login required to view medication details.' : null,
        instructions: isMedicationsUnlocked ? rx.instructions : 'Protected clinical posology. Verification required.',
        overrideJustification: isMedicationsUnlocked ? (rx.override_justification || null) : undefined,
        items: (rx.items || []).map((item, idx) => ({
            id: item.id,
            itemNumber: idx + 1,
            medicationName: isMedicationsUnlocked ? item.medication_name : 'Protected Clinical Medication [Verification Required]',
            dosage: isMedicationsUnlocked ? item.dosage : '***',
            frequency: isMedicationsUnlocked ? item.frequency : '***',
            duration: isMedicationsUnlocked ? item.duration : '***',
            quantityPrescribed: item.quantity_prescribed,
            quantityDispensed: item.quantity_dispensed,
            isFullyDispensed: item.quantity_dispensed >= item.quantity_prescribed
        })),
        fulfillmentSummary: {
            totalItems: (rx.items || []).length,
            fullyFilledItems: (rx.items || []).filter(i => i.quantity_dispensed >= i.quantity_prescribed).length,
            lastDispensationAt: rx.dispenseLogs && rx.dispenseLogs.length > 0 ? rx.dispenseLogs[0].created_at : null
        }
    };

    return res.json(sanitizedPayload);
});

/**
 * Dispense Medication (Pharmacy / Clinic Fulfillment)
 * POST /api/prescriptions/:id/dispense
 */
const dispensePrescription = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { itemDispenses, notes } = req.body;
    const pharmacistId = req.user.id;
    const pharmacyOrgId = req.user.organization_id || req.user.organizationId;

    if (req.user.role === 'patient') {
        throw new AppError('Access Denied: Patients cannot dispense prescriptions.', 403);
    }

    if (!pharmacyOrgId) {
        throw new AppError('Pharmacist or clinic must belong to an active organization to dispense.', 403);
    }

    if (!itemDispenses || !Array.isArray(itemDispenses) || itemDispenses.length === 0) {
        throw new AppError('Item dispensations array is required.', 400);
    }

    const updatedRx = await prescriptionsRepo.dispenseItems({
        prescriptionId: id,
        pharmacyOrgId,
        pharmacistId,
        itemDispenses,
        notes
    });

    return res.json({
        status: 'success',
        message: 'Medication dispensed and logged to audit trail successfully.',
        prescription: updatedRx
    });
});

/**
 * Cancel an active prescription (Doctor / Clinic Admin)
 * POST /api/prescriptions/:id/cancel
 */
const cancelPrescription = catchAsync(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    if (req.user.role === 'patient') {
        throw new AppError('Access Denied: Patients cannot cancel prescriptions.', 403);
    }

    const rx = await prescriptionsRepo.getPrescriptionById(id);

    if (!rx) {
        throw new AppError('Prescription not found.', 404);
    }

    // Only issuing doctor, clinic admin, or super admin can cancel
    if (rx.doctor_id !== req.user.id && 
        rx.organization_id !== (req.user.organization_id || req.user.organizationId) && 
        req.user.role !== 'super_admin') {
        throw new AppError('Unauthorized to cancel this prescription.', 403);
    }

    const cancelledRx = await prescriptionsRepo.cancelPrescription(id, reason, req.user.id);

    return res.json({
        status: 'success',
        message: 'Prescription cancelled.',
        prescription: cancelledRx
    });
});

module.exports = {
    searchDrugs,
    createPrescription,
    listPrescriptions,
    getPrescriptionById,
    verifyPrescriptionByToken,
    dispensePrescription,
    cancelPrescription
};
