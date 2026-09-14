/**
 * Patient Consents Express Router
 * Mounts consent granting, listing, and revocation endpoints under default-deny policy.
 */

const express = require('express');
const router = express.Router();
const consentController = require('../controllers/consentController');
const { requireAuth } = require('../middleware/auth');

// All consent endpoints are authenticated
router.get('/consents', requireAuth, consentController.getConsents);
router.post('/consents', requireAuth, consentController.grantConsent);
router.post('/consents/:id/revoke', requireAuth, consentController.revokeConsent);

module.exports = router;

