/**
 * PPB (Pharmacy and Poisons Board Kenya) Premises Verification Service
 *
 * Validates pharmacy premises license credentials against:
 *   1. Official PPB format rules (PPB/PREM/YYYY/NNNN)
 *   2. Internal curated ppb_premises registry table (seeded from Kenya Gazette)
 *
 * Modelled after kmpdcVerification.js to maintain consistent verification UX.
 * Soft-warning approach: registry miss does NOT hard-block — it flags for Admin review,
 * since our seed data will never be 100% exhaustive.
 */

const db = require('../db');

// Official PPB Kenya Premises License Number format:
// PPB/PREM/<4-digit year>/<3-to-5-digit sequential number>
// Examples: PPB/PREM/2024/0001  PPB/PREM/2026/0842  PPB/PREM/2023/10421
const PPB_FORMAT_REGEX = /^PPB\/PREM\/\d{4}\/\d{3,5}$/i;

/**
 * Validates whether the given string conforms to the official PPB premises license format.
 * @param {string} licenseNumber
 * @returns {boolean}
 */
function validateLicenseFormat(licenseNumber) {
    if (!licenseNumber || typeof licenseNumber !== 'string') return false;
    return PPB_FORMAT_REGEX.test(licenseNumber.trim().toUpperCase());
}

/**
 * Normalizes pharmacy premises names for fuzzy comparison:
 * - Lowercases
 * - Strips common legal suffixes (Ltd, Limited, PLC, Kenya)
 * - Removes punctuation and extra whitespace
 * @param {string} name
 * @returns {string}
 */
function normalizePremisesName(name) {
    if (!name || typeof name !== 'string') return '';
    return name
        .toLowerCase()
        .replace(/\b(ltd|limited|plc|llp|kenya|chemists|pharmacy|pharmaceuticals|drugs|medical)\b/gi, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Computes token-based name similarity between submitted pharmacy name
 * and the PPB registry record (0.0 to 1.0).
 * A score >= 0.6 is treated as a sufficient match.
 * @param {string} inputName - What the applicant typed
 * @param {string} registryName - What is in the PPB registry
 * @returns {number}
 */
function calculateNameSimilarity(inputName, registryName) {
    const normInput = normalizePremisesName(inputName);
    const normReg = normalizePremisesName(registryName);

    if (!normInput || !normReg) return 0;
    if (normInput === normReg) return 1.0;

    const inputTokens = normInput.split(' ').filter(Boolean);
    const regTokens   = normReg.split(' ').filter(Boolean);

    let matches = 0;
    for (const inTok of inputTokens) {
        const found = regTokens.some(regTok => {
            if (inTok === regTok) return true;
            // Allow prefix-matching for shortened names (e.g., 'Westlands' matches 'Westlands Mall')
            if (inTok.length >= 4 && regTok.startsWith(inTok)) return true;
            if (regTok.length >= 4 && inTok.startsWith(regTok)) return true;
            return false;
        });
        if (found) matches++;
    }

    const maxTokens = Math.max(inputTokens.length, regTokens.length);
    const score = maxTokens === 0 ? 0 : matches / maxTokens;

    // Substring containment bonus (handles "Apex" matching "Nairobi Apex Chemists Ltd")
    if (normReg.includes(normInput) || normInput.includes(normReg)) {
        return Math.max(score, 0.80);
    }

    return score;
}

/**
 * Main PPB premises verification function.
 *
 * Returns a structured result object used by the API route:
 * {
 *   formatValid: boolean,
 *   inRegistry: boolean,         — true if found in ppb_premises table
 *   active: boolean,             — true if status === 'active'
 *   nameMatchScore: number|null, — 0.0-1.0 similarity between submitted & registry name
 *   nameWarning: boolean,        — true if score < 0.6 (mismatch, flag for admin)
 *   record: object|null,         — the ppb_premises row if found
 *   error: string|null,          — format error message (hard block)
 *   warning: string|null         — soft warning message (not blocking)
 * }
 *
 * @param {string} licenseNumber - Submitted PPB license number
 * @param {string} [submittedName] - Pharmacy name as typed by applicant
 * @returns {Promise<object>}
 */
async function verifyPpbPremises(licenseNumber, submittedName) {
    // --- 1. Null / empty guard ---
    if (!licenseNumber || typeof licenseNumber !== 'string' || !licenseNumber.trim()) {
        return {
            formatValid: false,
            inRegistry: false,
            active: false,
            nameMatchScore: null,
            nameWarning: false,
            record: null,
            error: 'PPB Premises License Number is required.',
            warning: null
        };
    }

    const cleanLicense = licenseNumber.trim().toUpperCase();

    // --- 2. Format validation ---
    if (!validateLicenseFormat(cleanLicense)) {
        return {
            formatValid: false,
            inRegistry: false,
            active: false,
            nameMatchScore: null,
            nameWarning: false,
            record: null,
            error: `Invalid PPB license format. Expected PPB/PREM/YYYY/NNNN (e.g. PPB/PREM/2024/0001). Got: '${cleanLicense}'.`,
            warning: null
        };
    }

    // --- 3. Registry lookup ---
    try {
        const { rows } = await db.pool.query(
            `SELECT id, license_number, premises_name, physical_address, county, status, issued_date, expiry_date
             FROM ppb_premises
             WHERE UPPER(license_number) = $1
             LIMIT 1`,
            [cleanLicense]
        );

        // Registry miss — soft warning, not a hard block
        if (rows.length === 0) {
            return {
                formatValid: true,
                inRegistry: false,
                active: false,
                nameMatchScore: null,
                nameWarning: false,
                record: null,
                error: null,
                warning: 'License format is valid but not yet in our registry. Platform Administrators will cross-reference against the PPB register before approving.'
            };
        }

        const ppbRecord = rows[0];

        // --- 4. Status check ---
        if (ppbRecord.status !== 'active') {
            return {
                formatValid: true,
                inRegistry: true,
                active: false,
                nameMatchScore: null,
                nameWarning: false,
                record: {
                    licenseNumber: ppbRecord.license_number,
                    premisesName:  ppbRecord.premises_name,
                    address:       ppbRecord.physical_address,
                    county:        ppbRecord.county,
                    status:        ppbRecord.status
                },
                error: null,
                warning: `PPB License '${cleanLicense}' is currently ${ppbRecord.status.toUpperCase()} in the PPB register. Platform Administrators will review before activation.`
            };
        }

        // --- 5. Name similarity check (only if name was provided) ---
        let nameMatchScore = null;
        let nameWarning    = false;
        let nameWarningMsg = null;

        if (submittedName && typeof submittedName === 'string' && submittedName.trim()) {
            nameMatchScore = calculateNameSimilarity(submittedName, ppbRecord.premises_name);
            if (nameMatchScore < 0.6) {
                nameWarning    = true;
                nameWarningMsg = `Name differs from PPB record: registered as "${ppbRecord.premises_name}". Admin will review — this may be a trading name.`;
            }
        }

        // --- 6. Verified ---
        return {
            formatValid:    true,
            inRegistry:     true,
            active:         true,
            nameMatchScore,
            nameWarning,
            record: {
                licenseNumber: ppbRecord.license_number,
                premisesName:  ppbRecord.premises_name,
                address:       ppbRecord.physical_address,
                county:        ppbRecord.county,
                status:        ppbRecord.status,
                issuedDate:    ppbRecord.issued_date,
                expiryDate:    ppbRecord.expiry_date
            },
            error:   null,
            warning: nameWarningMsg
        };

    } catch (dbErr) {
        console.error('[PPB Verification Error]:', dbErr.message);
        // On DB error, return format-valid-only so form still works
        return {
            formatValid: validateLicenseFormat(cleanLicense),
            inRegistry:  false,
            active:      false,
            nameMatchScore: null,
            nameWarning: false,
            record: null,
            error: null,
            warning: 'Registry check temporarily unavailable. License format is valid. Admin will verify before approval.'
        };
    }
}

module.exports = {
    validateLicenseFormat,
    normalizePremisesName,
    calculateNameSimilarity,
    verifyPpbPremises
};
