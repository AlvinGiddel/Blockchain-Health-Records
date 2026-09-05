const express = require('express');
const router = express.Router();
const practitionersController = require('../controllers/practitionersController');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');

/**
 * Practitioner Verification & Registry Routes
 * Mounted at `/api` in server.js to maintain 100% backward compatibility with existing endpoints:
 * - GET  /api/kmpdc/verify
 * - GET  /api/nck/verify
 * - GET  /api/practitioner/verify
 * - GET  /api/kmpdc/practitioners
 * - POST /api/kmpdc/practitioners
 */

// KMPDC Doctor Verification (Public validation)
router.get('/kmpdc/verify', practitionersController.verifyKmpdc);

// NCK Nurse / Midwife Verification (Public validation)
router.get('/nck/verify', practitionersController.verifyNck);

// Unified Practitioner Verification (Public validation)
router.get('/practitioner/verify', practitionersController.verifyPractitionerHandler);

// Master KMPDC Registry Listing (Public Directory) & Super Admin Add
router.get('/kmpdc/practitioners', practitionersController.getKmpdcPractitioners);
router.post('/kmpdc/practitioners', requireAuth, requireSuperAdmin, practitionersController.addKmpdcPractitioner);

// Normalized aliases under `/api/practitioners/*`
router.get('/practitioners/verify', practitionersController.verifyPractitionerHandler);
router.get('/practitioners/kmpdc/verify', practitionersController.verifyKmpdc);
router.get('/practitioners/nck/verify', practitionersController.verifyNck);
router.get('/practitioners/kmpdc', practitionersController.getKmpdcPractitioners);
router.post('/practitioners/kmpdc', requireAuth, requireSuperAdmin, practitionersController.addKmpdcPractitioner);
router.get('/practitioners', practitionersController.getKmpdcPractitioners);

module.exports = router;
