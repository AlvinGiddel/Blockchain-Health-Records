const jwt = require('jsonwebtoken');
const db = require('../db');
const { verifyKmpdcLicense, inspectKmpdcLicense } = require('../services/kmpdcVerification');
const { verifyNckLicense, inspectNckLicense, validateNckLicenseFormat } = require('../services/nckVerification');
const { verifyPractitioner } = require('../services/practitionerAttestation');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

/**
 * Real-time KMPDC Doctor License Verification API
 * GET /api/kmpdc/verify?license=A12345&name=Jane+Doe
 */
async function verifyKmpdc(req, res) {
    try {
        const { license, name } = req.query;
        if (!license) {
            return res.status(400).json({ error: 'License query parameter is required (e.g. /api/kmpdc/verify?license=A12345&name=Jane+Doe)' });
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
    } catch (err) {
        console.error('KMPDC verification route error:', err);
        res.status(500).json({ error: 'KMPDC council verification query failed.' });
    }
}

/**
 * Real-time NCK Nurse / Midwife License Verification API
 * GET /api/nck/verify?license=594079&name=Mary+Kungu&cadre=nurse
 */
async function verifyNck(req, res) {
    try {
        const { license, name, cadre = 'nurse' } = req.query;
        if (!license) {
            return res.status(400).json({ error: 'License query parameter is required (e.g. /api/nck/verify?license=594079&name=Mary+Kungu)' });
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
    } catch (err) {
        console.error('NCK verification route error:', err);
        res.status(500).json({ error: 'NCK council verification query failed.' });
    }
}

/**
 * Unified Practitioner Verification API (KMPDC + NCK based on cadre)
 * GET /api/practitioner/verify?license=...&name=...&cadre=doctor
 */
async function verifyPractitionerHandler(req, res) {
    try {
        const { license, name, cadre = 'doctor' } = req.query;
        if (!license) {
            return res.status(400).json({ error: 'License query parameter is required' });
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
    } catch (err) {
        console.error('Practitioner verification route error:', err);
        res.status(500).json({ error: 'Practitioner verification query failed.' });
    }
}

/**
 * Get Master KMPDC Practitioners Register
 * GET /api/kmpdc/practitioners
 */
async function getKmpdcPractitioners(req, res) {
    try {
        const { rows } = await db.query(`
            SELECT k.*, o.name as "organizationName"
            FROM kmpdc_registry k
            LEFT JOIN organizations o ON k.organization_id = o.id
            ORDER BY k.full_name ASC
        `);
        res.json({ success: true, practitioners: rows });
    } catch (err) {
        console.error('Failed to query KMPDC practitioners:', err);
        res.status(500).json({ error: 'Failed to load KMPDC registry.' });
    }
}

/**
 * Super Admin Pre-flight Inspection of KMPDC License
 * GET /api/kmpdc/inspect?license=A12345&name=Dr.+John+Doe
 */
async function inspectKmpdc(req, res) {
    try {
        const { license, name } = req.query;
        if (!license) {
            return res.status(400).json({ error: 'License parameter is required' });
        }

        const result = await inspectKmpdcLicense(String(license), name ? String(name) : undefined);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('KMPDC inspection error:', err);
        res.status(500).json({ error: 'Failed to inspect KMPDC license.' });
    }
}

/**
 * Super Admin Add Practitioner to Master KMPDC Registry
 * POST /api/kmpdc/practitioners
 */
async function addKmpdcPractitioner(req, res) {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }
        const token = authHeader.substring(7).trim();
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded || decoded.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access restricted to Super Administrators only.' });
        }

        const { licenseNumber, fullName, cadre, specialization, facility, organizationId, status, confirmOverwrite } = req.body;
        if (!licenseNumber || !fullName) {
            return res.status(400).json({ error: 'licenseNumber and fullName are required.' });
        }

        const cleanLicense = licenseNumber.trim().toUpperCase();
        const cleanName = fullName.trim();
        const cleanCadre = cadre || 'Medical Practitioner';
        const cleanSpec = specialization || 'General Practice';
        const cleanStatus = status || 'active';

        // 1. Check if practitioner license already exists in registry (Duplicate Safeguard)
        const { rows: existingRows } = await db.query(
            `SELECT k.*, o.name as "organizationName"
             FROM kmpdc_registry k
             LEFT JOIN organizations o ON k.organization_id = o.id
             WHERE UPPER(k.license_number) = $1`,
            [cleanLicense]
        );

        const isDuplicate = existingRows.length > 0;
        if (isDuplicate && !confirmOverwrite) {
            const ex = existingRows[0];
            return res.status(409).json({
                error: `Practitioner license ${cleanLicense} already exists on record for '${ex.full_name}' at '${ex.facility}'. Explicit confirmation is required to overwrite this record.`,
                isDuplicate: true,
                existingRecord: {
                    licenseNumber: ex.license_number,
                    fullName: ex.full_name,
                    facility: ex.facility,
                    cadre: ex.cadre,
                    specialization: ex.specialization,
                    status: ex.status,
                    organizationName: ex.organizationName
                }
            });
        }

        let targetOrgId = null;
        let cleanFacility = facility ? facility.trim() : 'Kenyatta National Hospital';

        if (organizationId && organizationId !== 'other') {
            const { rows: orgRows } = await db.query(
                'SELECT id, name FROM organizations WHERE id = $1',
                [organizationId]
            );
            if (orgRows.length > 0) {
                targetOrgId = orgRows[0].id;
                cleanFacility = orgRows[0].name; // Ensure consistent canonical name
            }
        }

        const { rows } = await db.query(
            `INSERT INTO kmpdc_registry (license_number, full_name, cadre, specialization, facility, organization_id, status, retention_year)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 2026)
             ON CONFLICT (license_number) DO UPDATE
             SET full_name = EXCLUDED.full_name,
                 cadre = EXCLUDED.cadre,
                 specialization = EXCLUDED.specialization,
                 facility = EXCLUDED.facility,
                 organization_id = EXCLUDED.organization_id,
                 status = EXCLUDED.status,
                 updated_at = NOW()
             RETURNING *`,
            [cleanLicense, cleanName, cleanCadre, cleanSpec, cleanFacility, targetOrgId, cleanStatus]
        );

        const actionText = isDuplicate ? 'updated' : 'registered';
        res.status(201).json({
            success: true,
            message: `Practitioner ${cleanName} (${cleanLicense}) successfully ${actionText} in KMPDC Oracle!`,
            isDuplicate,
            practitioner: rows[0]
        });
    } catch (err) {
        console.error('Failed to add practitioner to KMPDC registry:', err);
        res.status(500).json({ error: err.message || 'Failed to save practitioner.' });
    }
}

/**
 * Get Master NCK Nurses & Midwives Register
 * GET /api/nck/practitioners
 */
async function getNckPractitioners(req, res) {
    try {
        const { rows } = await db.pool.query(`
            SELECT n.*, o.name as "organizationName"
            FROM nck_registry n
            LEFT JOIN organizations o ON n.organization_id = o.id
            ORDER BY n.full_name ASC
        `);
        res.json({ success: true, practitioners: rows });
    } catch (err) {
        console.error('Failed to query NCK practitioners:', err);
        res.status(500).json({ error: 'Failed to load NCK registry.' });
    }
}

/**
 * Super Admin Pre-flight Inspection of NCK License
 * GET /api/nck/inspect?license=594079&name=Mary+Kungu
 */
async function inspectNck(req, res) {
    try {
        const { license, name } = req.query;
        if (!license) {
            return res.status(400).json({ error: 'License parameter is required' });
        }

        const result = await inspectNckLicense(String(license), name ? String(name) : undefined);
        res.json({ success: true, ...result });
    } catch (err) {
        console.error('NCK inspection error:', err);
        res.status(500).json({ error: 'Failed to inspect NCK license.' });
    }
}

/**
 * Super Admin Add Nurse/Midwife to Master NCK Registry
 * POST /api/nck/practitioners
 */
async function addNckPractitioner(req, res) {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }

        const token = authHeader.substring(7).trim();
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (jwtErr) {
            return res.status(401).json({ error: 'Invalid or expired authentication token.' });
        }

        if (decoded.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access restricted: Only Super Administrators can manage statutory registries.' });
        }

        const { licenseNumber, fullName, cadre, status, validTill, facility, organizationId, confirmOverwrite } = req.body;

        if (!licenseNumber || !fullName) {
            return res.status(400).json({ error: 'NCK License number and practitioner name are required.' });
        }

        const cleanLicense = String(licenseNumber).trim().toUpperCase();
        const cleanName = String(fullName).trim();
        const cleanCadre = cadre === 'midwife' ? 'midwife' : 'nurse';
        const cleanStatus = ['active', 'suspended', 'inactive'].includes(String(status).toLowerCase()) ? String(status).toLowerCase() : 'active';

        // 1. Syntactic format validation
        if (!validateNckLicenseFormat(cleanLicense)) {
            return res.status(400).json({
                error: `Invalid NCK license format '${cleanLicense}'. Expected numeric (e.g. 594079) or council registration format (e.g. KRCHN-12345).`
            });
        }

        // 2. Safeguard: Duplicate Check in nck_registry
        const { rows: existingRows } = await db.pool.query(
            `SELECT n.*, o.name as "organizationName"
             FROM nck_registry n
             LEFT JOIN organizations o ON n.organization_id = o.id
             WHERE UPPER(n.license_number) = $1`,
            [cleanLicense]
        );

        const isDuplicate = existingRows.length > 0;
        if (isDuplicate && confirmOverwrite !== true) {
            return res.status(409).json({
                error: `Duplicate license: ${cleanLicense} is already registered in NCK Oracle.`,
                isDuplicate: true,
                existingRecord: {
                    licenseNumber: existingRows[0].license_number,
                    fullName: existingRows[0].full_name,
                    cadre: existingRows[0].cadre,
                    facility: existingRows[0].facility,
                    status: existingRows[0].status,
                    organizationName: existingRows[0].organizationName
                }
            });
        }

        // 3. Resolve Organization linkage
        let targetOrgId = null;
        let cleanFacility = facility ? String(facility).trim() : 'National Health Service';

        if (organizationId && typeof organizationId === 'string' && organizationId.trim()) {
            const orgRes = await db.query('SELECT id, name FROM organizations WHERE id = $1', [organizationId.trim()]);
            if (orgRes.rows.length > 0) {
                targetOrgId = orgRes.rows[0].id;
                cleanFacility = orgRes.rows[0].name;
            }
        }

        // 4. Save to nck_registry
        const { rows } = await db.pool.query(
            `INSERT INTO nck_registry (license_number, full_name, cadre, status, valid_till, facility, organization_id, last_verified_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
             ON CONFLICT (license_number) DO UPDATE
             SET full_name = EXCLUDED.full_name,
                 cadre = EXCLUDED.cadre,
                 status = EXCLUDED.status,
                 valid_till = EXCLUDED.valid_till,
                 facility = EXCLUDED.facility,
                 organization_id = EXCLUDED.organization_id,
                 last_verified_at = NOW()
             RETURNING *`,
            [cleanLicense, cleanName, cleanCadre, cleanStatus, validTill || null, cleanFacility, targetOrgId]
        );

        const actionText = isDuplicate ? 'updated' : 'registered';
        res.status(201).json({
            success: true,
            message: `Nurse practitioner ${cleanName} (${cleanLicense}) successfully ${actionText} in NCK Oracle!`,
            isDuplicate,
            practitioner: rows[0]
        });
    } catch (err) {
        console.error('Failed to add practitioner to NCK registry:', err);
        res.status(500).json({ error: err.message || 'Failed to save practitioner.' });
    }
}

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
