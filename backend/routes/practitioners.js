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

// Master KMPDC Registry Listing (Public Directory) & Super Admin Add & Inspect
router.get('/kmpdc/practitioners', practitionersController.getKmpdcPractitioners);
router.get('/kmpdc/inspect', requireAuth, requireSuperAdmin, practitionersController.inspectKmpdc);
router.post('/kmpdc/practitioners', requireAuth, requireSuperAdmin, practitionersController.addKmpdcPractitioner);

// Master NCK Registry Listing (Public Directory) & Super Admin Add & Inspect
router.get('/nck/practitioners', practitionersController.getNckPractitioners);
router.get('/nck/inspect', requireAuth, requireSuperAdmin, practitionersController.inspectNck);
router.post('/nck/practitioners', requireAuth, requireSuperAdmin, practitionersController.addNckPractitioner);

// Normalized aliases under `/api/practitioners/*`
router.get('/practitioners/verify', practitionersController.verifyPractitionerHandler);
router.get('/practitioners/kmpdc/verify', practitionersController.verifyKmpdc);
router.get('/practitioners/kmpdc/inspect', requireAuth, requireSuperAdmin, practitionersController.inspectKmpdc);
router.get('/practitioners/nck/verify', practitionersController.verifyNck);
router.get('/practitioners/nck/inspect', requireAuth, requireSuperAdmin, practitionersController.inspectNck);
router.get('/practitioners/kmpdc', practitionersController.getKmpdcPractitioners);
router.post('/practitioners/kmpdc', requireAuth, requireSuperAdmin, practitionersController.addKmpdcPractitioner);
router.get('/practitioners/nck', practitionersController.getNckPractitioners);
router.post('/practitioners/nck', requireAuth, requireSuperAdmin, practitionersController.addNckPractitioner);
router.get('/practitioners', practitionersController.getKmpdcPractitioners);

module.exports = router;
