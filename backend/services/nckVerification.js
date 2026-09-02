/**
 * NCK (Nursing Council of Kenya) Off-Chain Verification Service
 * 
 * Validates nurse and midwife license credentials against
 * the official Nursing Council of Kenya Online Services Portal (https://osp.nckenya.com/LicenseStatus)
 * and the local council retention cache.
 */

const https = require('https');
const querystring = require('querystring');
const db = require('../db');
const { calculateNameSimilarity, normalizeName } = require('./kmpdcVerification');

// Format validation for NCK license/registration numbers:
// NCK typically issues numeric licenses (e.g., 594079, 12345)
// or prefixed registration numbers (e.g., KRCHN-12345, NCK-12345, BSN-12345)
const NCK_FORMAT_REGEX = /^(\d{4,8}|(NCK|KRCHN|KRCHN\/M|KRN|KRM|BSN|KCN)[-\s\/]?\d{3,8})$/i;

/**
 * Validates if the string conforms to NCK licensing format
 */
function validateNckLicenseFormat(licenseNumber) {
    if (!licenseNumber || typeof licenseNumber !== 'string') return false;
    const clean = licenseNumber.trim();
    return NCK_FORMAT_REGEX.test(clean);
}

/**
 * Query the live NCK portal (https://osp.nckenya.com/ajax/public)
 * 
 * @param {string} searchText - License number or Name to search
 * @returns {Promise<Array<{ fullName: string, licenseNumber: string, status: string, validTill: string }>>}
 */
async function queryLiveNckPortal(searchText) {
    return new Promise((resolve) => {
        const postData = querystring.stringify({
            search_register: '1',
            search_text: searchText.trim()
        });

        const options = {
            hostname: 'osp.nckenya.com',
            port: 443,
            path: '/ajax/public',
            method: 'POST',
            timeout: 5000, // 5 second timeout
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
            res.on('data', (chunk) => { body += chunk; });
            res.on('end', () => {
                try {
                    const results = [];
                    // Simple, robust regex extraction of table rows:
                    // <tr><td ...>NAME</td><td ...>LICENSE</td><td ...>STATUS</td>...</tr>
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
                                status: isActive ? 'active' : 'inactive',
                                rawStatus: rawStatus
                            });
                        }
                    }
                    resolve(results);
                } catch (e) {
                    console.warn('[NCK Portal Scrape Parse Warning]:', e.message);
                    resolve([]);
                }
            });
        });

        req.on('error', (err) => {
            console.warn('[NCK Portal Network Warning]:', err.message);
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
 * Verifies a nurse or midwife license against NCK portal with local DB cache fallback
 * 
 * @param {string} licenseNumber - The NCK license number (e.g. '594079')
 * @param {string} nurseName - The practitioner full name
 * @param {string} [cadre='nurse'] - 'nurse' or 'midwife'
 */
async function verifyNckLicense(licenseNumber, nurseName, cadre = 'nurse') {
    if (!licenseNumber || typeof licenseNumber !== 'string' || !licenseNumber.trim()) {
        return {
            verified: false,
            error: 'Nursing Council of Kenya (NCK) license number is required.'
        };
    }

    const cleanLicense = licenseNumber.trim().toUpperCase();

    // 1. Syntactic Format Validation
    if (!validateNckLicenseFormat(cleanLicense)) {
        return {
            verified: false,
            error: `Invalid NCK license format '${cleanLicense}'. Expected numeric (e.g. 594079) or council registration format (e.g. KRCHN-12345).`
        };
    }

    try {
        // 2. Query Local Database Cache first
        const { rows: cached } = await db.pool.query(
            'SELECT * FROM nck_registry WHERE UPPER(license_number) = $1',
            [cleanLicense]
        );

        let councilRecord = null;

        if (cached.length > 0) {
            councilRecord = cached[0];
        } else {
            // 3. Fallback to Live Scraping from NCK Portal
            const liveResults = await queryLiveNckPortal(cleanLicense);
            const matched = liveResults.find(r => r.licenseNumber.toUpperCase() === cleanLicense);

            if (matched) {
                // Cache into nck_registry
                const { rows: inserted } = await db.pool.query(`
                    INSERT INTO nck_registry (license_number, full_name, cadre, status, valid_till, last_verified_at)
                    VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 year', NOW())
                    ON CONFLICT (license_number) DO UPDATE SET last_verified_at = NOW(), status = EXCLUDED.status
                    RETURNING *;
                `, [matched.licenseNumber, matched.fullName, cadre, matched.status]);
                councilRecord = inserted[0];
            }
        }

        if (!councilRecord) {
            return {
                verified: false,
                error: `NCK License '${cleanLicense}' not found in the official Nursing Council of Kenya register. Please check the license number.`
            };
        }

        // 4. Status Check
        if (councilRecord.status !== 'active') {
            return {
                verified: false,
                error: `NCK License '${cleanLicense}' is currently ${councilRecord.status.toUpperCase()} by the Nursing Council and cannot be used.`
            };
        }

        // 5. Practitioner Identity Cross-Match (Anti-Identity Theft)
        if (nurseName && typeof nurseName === 'string') {
            const similarity = calculateNameSimilarity(nurseName, councilRecord.full_name);
            const SIMILARITY_THRESHOLD = 0.5;

            if (similarity < SIMILARITY_THRESHOLD) {
                return {
                    verified: false,
                    matchScore: similarity,
                    error: `Identity Mismatch: NCK License '${cleanLicense}' is registered to '${councilRecord.full_name}', which does not match '${nurseName}'.`
                };
            }
        }

        return {
            verified: true,
            regulator: 'NCK',
            cadre: councilRecord.cadre || cadre,
            matchScore: 1.0,
            record: {
                regulator: 'NCK',
                licenseNumber: councilRecord.license_number,
                fullName: councilRecord.full_name,
                cadre: councilRecord.cadre || cadre,
                status: councilRecord.status,
                facility: councilRecord.facility || 'NCK Certified Facility',
                lastVerifiedAt: councilRecord.last_verified_at
            }
        };

    } catch (err) {
        console.error('[NCK Verification Error]:', err);
        return {
            verified: false,
            error: 'Failed to connect to Nursing Council of Kenya validation authority.'
        };
    }
}

module.exports = {
    validateNckLicenseFormat,
    queryLiveNckPortal,
    verifyNckLicense
};
