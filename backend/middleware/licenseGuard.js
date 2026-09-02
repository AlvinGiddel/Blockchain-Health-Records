/**
 * Per-Organization License Enforcement Middleware (Multi-Tenant Kill-Switch Guard)
 * 
 * Inspects the requesting user's organization_id in PostgreSQL.
 * Allows Super Admin bypass.
 * Blocks suspended or expired clinic organizations individually with HTTP 403,
 * without affecting any other clinic on the platform.
 */

const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

// Whitelisted public, onboarding, & diagnostic path prefixes
const EXEMPT_PATHS = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/register-clinic',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
    '/api/license/status',
    '/api/health',
    '/health',
    '/'
];

async function licenseGuard(req, res, next) {
    const path = req.path;
    if (EXEMPT_PATHS.some(exempt => path === exempt || (exempt !== '/' && path.startsWith(exempt)))) {
        return next();
    }

    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        return next();
    }

    const token = authHeader.substring(7).trim();
    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
    } catch (jwtErr) {
        return res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }

    // 1. Super Admin always bypasses license locks to maintain global administrative authority
    if (decoded.role === 'super_admin') {
        return next();
    }

    // 2. Identify the target organization
    const targetOrgId = req.headers['x-organization-id'] || decoded.organization_id;
    if (!targetOrgId) {
        // Patients browsing their universal health passport without a specific clinic header
        return next();
    }

    try {
        // Per-organization license status query in PostgreSQL
        const { rows } = await db.query(
            'SELECT id, name, status, license_expires_at FROM organizations WHERE id = $1;',
            [targetOrgId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Organization not found.' });
        }

        const org = rows[0];

        // If specific organization is suspended/disabled by Super Admin
        if (org.status === 'suspended' || org.status === 'disabled') {
            return res.status(403).json({
                error: `Access Denied: ${org.name}'s license is suspended by platform administration.`
            });
        }

        // If organization license has expired
        if (org.license_expires_at && new Date(org.license_expires_at) < new Date()) {
            return res.status(403).json({
                error: `Access Denied: ${org.name}'s subscription expired on ${new Date(org.license_expires_at).toLocaleDateString()}. Please renew your organization license.`
            });
        }

        next();
    } catch (dbErr) {
        console.error('License guard organization check error:', dbErr.message);
        next();
    }
}

module.exports = licenseGuard;
