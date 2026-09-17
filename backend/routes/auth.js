const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { requireAuth, requireDoctor } = require('../middleware/auth');

/**
 * Authentication and Authorization Routes
 * Mounted at /api/auth
 *
 * Rate Limiting:
 *  - loginLimiter:        5 requests per 15 minutes per IP  (brute-force / credential stuffing)
 *  - registrationLimiter: 10 requests per hour per IP        (account creation spam)
 *  - passwordLimiter:     5 requests per hour per IP         (email enumeration / reset abuse)
 *  - breakGlassLimiter:   10 requests per 15 minutes per IP  (emergency access abuse)
 */

// ── Rate Limiters ────────────────────────────────────────────────────────────

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,    // 15 minutes
    max: 5,                       // 5 attempts per window
    standardHeaders: true,        // Return rate limit info in RateLimit-* headers
    legacyHeaders: false,
    message: {
        error: 'Too many login attempts from this IP address. Please try again after 15 minutes.'
    }
});

const registrationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,    // 1 hour
    max: 10,                      // 10 registrations per hour (covers legitimate multi-user clinic onboarding)
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many registration requests from this IP address. Please try again after 1 hour.'
    }
});

const passwordLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,    // 1 hour
    max: 5,                       // 5 reset requests per hour (prevents email enumeration)
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many password reset requests from this IP address. Please try again after 1 hour.'
    }
});

const breakGlassLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 10,                     // 10 per window per IP (emergency access, higher limit)
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: 'Too many emergency access requests from this IP address. Please try again after 15 minutes.'
    }
});

// ── Routes ────────────────────────────────────────────────────────────────────

// Phone availability check (real-time client-side validation)
router.get('/check-phone', authController.checkPhone);

// User registration (patient or doctor/practitioner)
router.post('/register', registrationLimiter, authController.register);

// User login (all roles)
router.post('/login', loginLimiter, authController.login);

// Clinic / Hospital facility self-serve onboarding
router.post('/register-clinic', registrationLimiter, authController.registerClinic);

// Pharmacy facility self-serve onboarding
router.post('/register-pharmacy', registrationLimiter, authController.registerPharmacy);

// Password & Email management
router.post('/change-password', requireAuth, authController.changePassword);
router.post('/update-email', requireAuth, authController.updateEmail);
router.post('/forgot-password', passwordLimiter, authController.forgotPassword);
router.post('/reset-password/:token', loginLimiter, authController.resetPassword);

// Emergency Break-Glass Access Protocol (Authorization Override)
router.post('/break-glass', breakGlassLimiter, requireAuth, requireDoctor, authController.breakGlass);
router.get('/break-glass/status', requireAuth, authController.getBreakGlassStatus);

// Centralized domain error handler for isolated router testing
const errorHandler = require('../middleware/errorHandler');
router.use(errorHandler);

module.exports = router;

