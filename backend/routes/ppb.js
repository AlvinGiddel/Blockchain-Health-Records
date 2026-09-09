const express = require('express');
const router = express.Router();
const { verifyPpbPremises } = require('../services/ppbVerification');

/**
 * PPB (Pharmacy and Poisons Board) Premises Registry Routes
 * Mounted at /api/ppb
 *
 * Public endpoint — no authentication required (mirrors /api/kmpdc/verify and /api/nck/verify).
 * Used by the pharmacy registration form for real-time PPB license validation.
 */

/**
 * GET /api/ppb/verify
 * Query params:
 *   ?license=PPB/PREM/2024/0001   (required)
 *   ?name=Nairobi+Apex+Chemists   (optional — triggers name-match check)
 *
 * Returns:
 *   200 { valid: true,  ...verificationResult }
 *   200 { valid: false, ...verificationResult }  — soft warnings use HTTP 200 (not errors)
 *   400 { error: "..." }                         — only on missing/malformed query param
 */
router.get('/ppb/verify', async (req, res) => {
    const { license, name } = req.query;

    if (!license || typeof license !== 'string' || !license.trim()) {
        return res.status(400).json({
            error: 'Missing required query parameter: license (e.g. ?license=PPB/PREM/2024/0001)'
        });
    }

    try {
        const result = await verifyPpbPremises(license.trim(), name ? name.trim() : null);

        return res.status(200).json({
            valid:          result.formatValid && result.inRegistry && result.active && !result.nameWarning,
            formatValid:    result.formatValid,
            inRegistry:     result.inRegistry,
            active:         result.active,
            nameMatchScore: result.nameMatchScore,
            nameWarning:    result.nameWarning,
            record:         result.record,
            error:          result.error   || null,
            warning:        result.warning || null
        });
    } catch (err) {
        console.error('[PPB Verify Route Error]:', err.message);
        return res.status(500).json({ error: 'Internal error during PPB license verification.' });
    }
});

const errorHandler = require('../middleware/errorHandler');
router.use(errorHandler);

module.exports = router;
