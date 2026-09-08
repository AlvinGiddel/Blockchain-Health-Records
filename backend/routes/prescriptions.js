const express = require('express');
const prescriptionsController = require('../controllers/prescriptionsController');
const { requireAuth, requireDoctor, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 1. Drug Search Autocomplete (Authenticated clinical users)
router.get('/prescriptions/drugs/search', requireAuth, prescriptionsController.searchDrugs);

// 2. Public Verification Tool (Scannable QR Passport) - Unauthenticated Allowlisted Endpoint
router.get('/prescriptions/verify/:qr_token', prescriptionsController.verifyPrescriptionByToken);

// 3. Issue New Prescription (Doctor only)
router.post('/prescriptions', requireAuth, requireDoctor, prescriptionsController.createPrescription);

// 4. List Prescriptions (Role-aware: Patient, Doctor, Clinic Admin, Super Admin)
router.get('/prescriptions', requireAuth, prescriptionsController.listPrescriptions);

// 5. Get Prescription Details by ID
router.get('/prescriptions/:id', requireAuth, prescriptionsController.getPrescriptionById);

// 6. Pharmacy Dispensing / Fulfillment (Clinic staff / Pharmacist / Admin / Doctor)
router.post('/prescriptions/:id/dispense', requireAuth, prescriptionsController.dispensePrescription);

// 7. Cancel Prescription (Prescribing Doctor / Clinic Admin)
router.post('/prescriptions/:id/cancel', requireAuth, prescriptionsController.cancelPrescription);

module.exports = router;
