/**
 * KMPDC (Kenya Medical Practitioners and Dentists Council) Off-Chain Verification Service
 * 
 * Validates medical practitioner and dentist license credentials against
 * standardized Kenyan council formats and the council retention registry.
 */

const db = require('../db');

// Kenyan KMPDC License Format Regex Patterns:
// - 'A' series: Medical Practitioners (e.g., A12345, A45892)
// - 'B' series: Dentists (e.g., B10234, B20456)
// - 'C'/'T' series: Temporary / Foreign Specialists (e.g., C1234, T5678)
// - 'KMPDC-' series: Council retention certificate numbers (e.g., KMPDC-2026-A12345)
const KMPDC_FORMAT_REGEX = /^(A|B|C|T)\d{4,6}$|^KMPDC-[A-Z0-9-]{4,15}$/i;

/**
 * Validates if the given string adheres to official KMPDC format rules
 */
function validateLicenseFormat(licenseNumber) {
    if (!licenseNumber || typeof licenseNumber !== 'string') return false;
    const clean = licenseNumber.trim().toUpperCase();
    return KMPDC_FORMAT_REGEX.test(clean);
}

/**
 * Normalizes practitioner names by stripping honorifics, punctuation and extra whitespace
 */
function normalizeName(name) {
    if (!name || typeof name !== 'string') return '';
    return name
        .toLowerCase()
        .replace(/^(dr\.?|doctor|prof\.?|professor|physician|surgeon|consultant)\s+/gi, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Computes token-based and character-based similarity between two names (0.0 to 1.0)
 * Handles initials, middle names, and different name orderings.
 */
function calculateNameSimilarity(inputName, registryName) {
    const normInput = normalizeName(inputName);
    const normReg = normalizeName(registryName);

    if (!normInput || !normReg) return 0;
    if (normInput === normReg) return 1.0;

    const inputTokens = normInput.split(' ').filter(Boolean);
    const regTokens = normReg.split(' ').filter(Boolean);

    // Count matching tokens (including single letter initial matches)
    let matches = 0;
    for (const inTok of inputTokens) {
        const found = regTokens.some(regTok => {
            if (inTok === regTok) return true;
            // Match initial (e.g., 'W' matches 'Wanjiku')
            if (inTok.length === 1 && regTok.startsWith(inTok)) return true;
            if (regTok.length === 1 && inTok.startsWith(regTok)) return true;
            return false;
        });
        if (found) matches++;
    }

    const maxTokens = Math.max(inputTokens.length, regTokens.length);
    const score = matches / maxTokens;

    // Substring containment bonus
    if (normReg.includes(normInput) || normInput.includes(normReg)) {
        return Math.max(score, 0.85);
    }

    return score;
}

/**
 * Verifies a doctor's license number and full name against the KMPDC council registry.
 * 
 * @param {string} licenseNumber - The KMPDC license number (e.g., 'A12345')
 * @param {string} doctorName - The applicant doctor's full name (e.g., 'Dr. Jane Wanjiku Kamau')
 * @returns {Promise<{ verified: boolean, error?: string, record?: object, matchScore?: number }>}
 */
async function verifyKmpdcLicense(licenseNumber, doctorName) {
    if (!licenseNumber || typeof licenseNumber !== 'string' || !licenseNumber.trim()) {
        return {
            verified: false,
            error: 'KMPDC medical license number is required for doctor registration.'
        };
    }

    const cleanLicense = licenseNumber.trim().toUpperCase();

    // 1. Syntactic / Format Check
    if (!validateLicenseFormat(cleanLicense)) {
        return {
            verified: false,
            error: `Invalid KMPDC license format '${cleanLicense}'. Expected Kenyan council format (e.g., A12345 for Doctors, B12345 for Dentists).`
        };
    }

    try {
        // 2. Query Local Council Registry Cache
        const { rows } = await db.query(
            'SELECT * FROM kmpdc_registry WHERE UPPER(license_number) = $1',
            [cleanLicense]
        );

        if (rows.length === 0) {
            return {
                verified: false,
                error: `KMPDC License '${cleanLicense}' not found in the official council register. Please verify your practitioner license number.`
            };
        }

        const councilRecord = rows[0];

        // 3. Status Verification (Active vs Suspended / Expired)
        if (councilRecord.status !== 'active') {
            return {
                verified: false,
                error: `KMPDC License '${cleanLicense}' is currently ${councilRecord.status.toUpperCase()} by the Medical Council and cannot be used for practice.`
            };
        }

        // 4. Practitioner Identity Cross-Match (Anti-Identity Theft)
        if (doctorName && typeof doctorName === 'string') {
            const similarity = calculateNameSimilarity(doctorName, councilRecord.full_name);
            const SIMILARITY_THRESHOLD = 0.5; // Minimum 50% name token overlap

            if (similarity < SIMILARITY_THRESHOLD) {
                console.warn(`[KMPDC Security] Name mismatch for license ${cleanLicense}. Input: '${doctorName}' vs Registered: '${councilRecord.full_name}' (Score: ${similarity.toFixed(2)})`);
                return {
                    verified: false,
                    matchScore: similarity,
                    error: `Identity Mismatch: License '${cleanLicense}' is registered to '${councilRecord.full_name}', which does not match '${doctorName}'.`
                };
            }
        }

        // 5. Verification Successful
        return {
            verified: true,
            matchScore: 1.0,
            record: {
                licenseNumber: councilRecord.license_number,
                fullName: councilRecord.full_name,
                cadre: councilRecord.cadre,
                specialization: councilRecord.specialization,
                status: councilRecord.status,
                retentionYear: councilRecord.retention_year,
                facility: councilRecord.facility,
                lastVerifiedAt: councilRecord.last_verified_at
            }
        };
    } catch (err) {
        console.error('[KMPDC Verification Error]:', err);
        return {
            verified: false,
            error: 'Failed to connect to KMPDC validation authority database.'
        };
    }
}

module.exports = {
    validateLicenseFormat,
    normalizeName,
    calculateNameSimilarity,
    verifyKmpdcLicense
};
