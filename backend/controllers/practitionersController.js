const jwt = require('jsonwebtoken');
const db = require('../db');
const { verifyKmpdcLicense } = require('../services/kmpdcVerification');
const { verifyNckLicense } = require('../services/nckVerification');
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
        const { rows } = await db.query('SELECT * FROM kmpdc_registry ORDER BY full_name ASC');
        res.json({ success: true, practitioners: rows });
    } catch (err) {
        console.error('Failed to query KMPDC practitioners:', err);
        res.status(500).json({ error: 'Failed to load KMPDC registry.' });
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

        const { licenseNumber, fullName, cadre, specialization, facility, status } = req.body;
        if (!licenseNumber || !fullName) {
            return res.status(400).json({ error: 'licenseNumber and fullName are required.' });
        }

        const cleanLicense = licenseNumber.trim().toUpperCase();
        const cleanName = fullName.trim();
        const cleanCadre = cadre || 'Medical Practitioner';
        const cleanSpec = specialization || 'General Practice';
        const cleanFacility = facility || 'Kenyatta National Hospital';
        const cleanStatus = status || 'active';

        const { rows } = await db.query(
            `INSERT INTO kmpdc_registry (license_number, full_name, cadre, specialization, facility, status, retention_year)
             VALUES ($1, $2, $3, $4, $5, $6, 2026)
             ON CONFLICT (license_number) DO UPDATE
             SET full_name = EXCLUDED.full_name,
                 cadre = EXCLUDED.cadre,
                 specialization = EXCLUDED.specialization,
                 facility = EXCLUDED.facility,
                 status = EXCLUDED.status,
                 updated_at = NOW()
             RETURNING *`,
            [cleanLicense, cleanName, cleanCadre, cleanSpec, cleanFacility, cleanStatus]
        );

        res.status(201).json({
            success: true,
            message: `Practitioner ${cleanName} (${cleanLicense}) successfully registered in KMPDC Oracle!`,
            practitioner: rows[0]
        });
    } catch (err) {
        console.error('Failed to add practitioner to KMPDC registry:', err);
        res.status(500).json({ error: err.message || 'Failed to save practitioner.' });
    }
}

module.exports = {
    verifyKmpdc,
    verifyNck,
    verifyPractitionerHandler,
    getKmpdcPractitioners,
    addKmpdcPractitioner
};
