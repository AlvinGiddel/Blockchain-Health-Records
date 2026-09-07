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
                organizationId: councilRecord.organization_id,
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

/**
 * Query the live KMPDC portal (https://osp.kmpdc.go.ke or https://kmpdc.go.ke/registers-practitioners-php/)
 * 
 * @param {string} searchText - License number or practitioner name to search
 * @returns {Promise<Array<{ fullName: string, licenseNumber: string, status: string, facility?: string, specialization?: string }>>}
 */
async function queryLiveKmpdcPortal(searchText) {
    const https = require('https');
    const querystring = require('querystring');

    return new Promise((resolve) => {
        const cleanSearch = (searchText || '').trim();
        if (!cleanSearch) return resolve([]);

        const postData = querystring.stringify({
            search_register: '1',
            search_text: cleanSearch
        });

        const options = {
            hostname: 'osp.kmpdc.go.ke',
            port: 443,
            path: '/ajax/search',
            method: 'POST',
            timeout: 3500, // 3.5s timeout for fast UI feedback
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        };

        const req = https.request(options, (res) => {
            if (res.statusCode !== 200) {
                return resolve([]);
            }
            let body = '';
            res.on('data', chunk => { body += chunk; });
            res.on('end', () => {
                try {
                    const results = [];
                    const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/gi;
                    let match;
                    while ((match = rowRegex.exec(body)) !== null) {
                        const rawName = match[1].replace(/<[^>]+>/g, '').trim();
                        const rawLicense = match[2].replace(/<[^>]+>/g, '').trim();
                        const rawStatus = match[3].replace(/<[^>]+>/g, '').trim();

                        if (rawName && rawLicense && !rawName.toLowerCase().includes('name')) {
                            const isActive = rawStatus.toLowerCase().includes('active') || !rawStatus.toLowerCase().includes('inactive');
                            results.push({
                                fullName: rawName,
                                licenseNumber: rawLicense,
                                status: isActive ? 'active' : 'inactive'
                            });
                        }
                    }
                    resolve(results);
                } catch (e) {
                    resolve([]);
                }
            });
        });

        req.on('error', () => {
            resolve([]);
        });

        req.on('timeout', () => {
            req.destroy();
            resolve([]);
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Pre-flight inspection of a KMPDC license for Super Admin modal
 * 1. Checks local duplicate in kmpdc_registry
 * 2. Checks live portal for registered practitioner
 * 3. Compares candidate doctor name against council records for identity matching
 */
async function inspectKmpdcLicense(licenseNumber, candidateName) {
    if (!licenseNumber || typeof licenseNumber !== 'string' || !licenseNumber.trim()) {
        return {
            formatValid: false,
            error: 'License number is required.'
        };
    }

    const cleanLicense = licenseNumber.trim().toUpperCase();
    const formatValid = validateLicenseFormat(cleanLicense);

    // 1. Check local kmpdc_registry for existing duplicate
    const { rows: localRows } = await db.query(
        `SELECT k.*, o.name as "organizationName"
         FROM kmpdc_registry k
         LEFT JOIN organizations o ON k.organization_id = o.id
         WHERE UPPER(k.license_number) = $1`,
        [cleanLicense]
    );

    const existsLocally = localRows.length > 0;
    const existingRecord = existsLocally ? {
        licenseNumber: localRows[0].license_number,
        fullName: localRows[0].full_name,
        cadre: localRows[0].cadre,
        specialization: localRows[0].specialization,
        facility: localRows[0].facility,
        status: localRows[0].status,
        retentionYear: localRows[0].retention_year,
        organizationId: localRows[0].organization_id,
        organizationName: localRows[0].organizationName
    } : null;

    // 2. Query Live External Portal
    const liveResults = await queryLiveKmpdcPortal(cleanLicense);
    const liveMatch = liveResults.find(r => r.licenseNumber.toUpperCase() === cleanLicense);

    const liveRecord = liveMatch ? {
        licenseNumber: liveMatch.licenseNumber,
        fullName: liveMatch.fullName,
        status: liveMatch.status,
        facility: liveMatch.facility || null,
        specialization: liveMatch.specialization || null
    } : null;

    // 3. Name Similarity / Matching
    let nameMatchScore = null;
    let nameMismatch = false;
    const referenceName = liveRecord ? liveRecord.fullName : (existingRecord ? existingRecord.fullName : null);

    if (candidateName && typeof candidateName === 'string' && candidateName.trim() && referenceName) {
        nameMatchScore = calculateNameSimilarity(candidateName, referenceName);
        if (nameMatchScore < 0.5) {
            nameMismatch = true;
        }
    }

    return {
        licenseNumber: cleanLicense,
        formatValid,
        existsLocally,
        existingRecord,
        liveVerified: !!liveRecord,
        liveRecord,
        referenceName,
        nameMatchScore,
        nameMismatch
    };
}

module.exports = {
    validateLicenseFormat,
    normalizeName,
    calculateNameSimilarity,
    verifyKmpdcLicense,
    queryLiveKmpdcPortal,
    inspectKmpdcLicense
};
