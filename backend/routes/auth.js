const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { requireAuth, requireDoctor } = require('../middleware/auth');

/**
 * Authentication and Authorization Routes
 * Mounted at /api/auth
 */

// Phone availability check (real-time client-side validation)
router.get('/check-phone', authController.checkPhone);

// User registration (patient or doctor/practitioner)
router.post('/register', authController.register);

// User login (all roles)
router.post('/login', authController.login);

// Clinic / Hospital facility self-serve onboarding
router.post('/register-clinic', authController.registerClinic);

// Password & Email management
router.post('/change-password', requireAuth, authController.changePassword);
router.post('/update-email', requireAuth, authController.updateEmail);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password/:token', authController.resetPassword);

// Emergency Break-Glass Access Protocol (Authorization Override)
router.post('/break-glass', requireAuth, requireDoctor, authController.breakGlass);
router.get('/break-glass/status', requireAuth, authController.getBreakGlassStatus);

module.exports = router;
