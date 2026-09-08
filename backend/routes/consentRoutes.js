/**
 * Patient Consents Express Router
 * Mounts consent granting, listing, and revocation endpoints under default-deny policy.
 */

const express = require('express');
const router = express.Router();
const consentController = require('../controllers/consentController');

// All consent endpoints are authenticated
router.get('/consents', consentController.getConsents);
router.post('/consents', consentController.grantConsent);
router.post('/consents/:id/revoke', consentController.revokeConsent);

module.exports = router;
