/**
 * License Enforcement Middleware (Kill-Switch Guard)
 * 
 * Intercepts incoming API traffic. If license status is 'disabled',
 * blocks all requests with HTTP 403 unless authenticated as Super Admin.
 */

const jwt = require('jsonwebtoken');
const { getLicenseStatus } = require('../services/licenseCheck');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

// Whitelisted public & diagnostic path prefixes
const EXEMPT_PATHS = [
    '/api/auth/login',
    '/api/license/status',
    '/api/health',
    '/health',
    '/'
];

function licenseGuard(req, res, next) {
    // 1. Always allow explicitly exempted endpoints
    const path = req.path;
    if (EXEMPT_PATHS.some(exempt => path === exempt || (exempt !== '/' && path.startsWith(exempt)))) {
        return next();
    }

    const { status } = getLicenseStatus();

    // 2. If license is active, allow all normal traffic
    if (status === 'active') {
        return next();
    }

    // 3. If license is disabled, check if request is authenticated as Super Admin
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded && decoded.role === 'super_admin') {
                // Super Admin bypass: allow diagnostic and recovery actions
                req.user = decoded;
                return next();
            }
        } catch (jwtErr) {
            // Token is invalid/expired
        }
    }

    // 4. Block all non-super-admin requests with generic 403
    return res.status(403).json({
        error: 'License inactive. Contact your provider.'
    });
}

module.exports = licenseGuard;
