const express = require('express');
const router = express.Router();
const practitionersController = require('../controllers/practitionersController');

/**
 * Practitioner Verification & Registry Routes
 * Mounted at `/api` in server.js to maintain 100% backward compatibility with existing endpoints:
 * - GET  /api/kmpdc/verify
 * - GET  /api/nck/verify
 * - GET  /api/practitioner/verify
 * - GET  /api/kmpdc/practitioners
 * - POST /api/kmpdc/practitioners
 */

// KMPDC Doctor Verification
router.get('/kmpdc/verify', practitionersController.verifyKmpdc);

// NCK Nurse / Midwife Verification
router.get('/nck/verify', practitionersController.verifyNck);

// Unified Practitioner Verification (Doctor, Dentist, Nurse, Clinical Officer)
router.get('/practitioner/verify', practitionersController.verifyPractitionerHandler);

// Master KMPDC Registry Listing & Super Admin Add
router.get('/kmpdc/practitioners', practitionersController.getKmpdcPractitioners);
router.post('/kmpdc/practitioners', practitionersController.addKmpdcPractitioner);

// Normalized aliases under `/api/practitioners/*`
router.get('/practitioners/verify', practitionersController.verifyPractitionerHandler);
router.get('/practitioners/kmpdc/verify', practitionersController.verifyKmpdc);
router.get('/practitioners/nck/verify', practitionersController.verifyNck);
router.get('/practitioners/kmpdc', practitionersController.getKmpdcPractitioners);
router.post('/practitioners/kmpdc', practitionersController.addKmpdcPractitioner);
router.get('/practitioners', practitionersController.getKmpdcPractitioners);

module.exports = router;
