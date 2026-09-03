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
    '/api/organizations/active',
    '/api/license/status',
    '/api/payments',
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
        // Per-organization license status query in PostgreSQL (bypasses RLS to ensure accurate system status checks)
        const { rows } = await db.pool.query(
            'SELECT id, name, status, license_expires_at FROM organizations WHERE id = $1;',
            [targetOrgId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: 'Organization not found.' });
        }

        const org = rows[0];

        // 1. If organization is pending approval
        if (org.status === 'pending_approval') {
            return res.status(403).json({
                error: `Access Denied: ${org.name} registration is pending review by platform administrators.`
            });
        }

        // 2. If specific organization is suspended/disabled by Super Admin
        if (org.status === 'suspended' || org.status === 'disabled') {
            return res.status(403).json({
                error: `Access Denied: ${org.name}'s access has been ${org.status === 'disabled' ? 'disabled' : 'suspended'} by platform administration.`
            });
        }

        // 3. Auto-transition: if trial expiration has passed, update status to 'expired'
        if (org.status === 'trial' && org.license_expires_at && new Date(org.license_expires_at) < new Date()) {
            await db.pool.query("UPDATE organizations SET status = 'expired', updated_at = NOW() WHERE id = $1;", [targetOrgId]);
            await db.pool.query("UPDATE licenses SET status = 'expired', updated_at = NOW() WHERE organization_id = $1;", [targetOrgId]);
            org.status = 'expired';
        }

        // 4. Trial expiry enforcement (read-only grace mode)
        const isExpired = org.status === 'expired' || (org.license_expires_at && new Date(org.license_expires_at) < new Date());
        if (isExpired) {
            // Allow all GET/read requests (viewing existing patients, records, appointments, blockchain ledger, etc.)
            if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
                res.setHeader('X-Clinic-License-Status', 'expired');
                return next();
            }

            // Block all create/write actions (new records, new appointments, new patient registrations, new block mining)
            return res.status(403).json({
                error: 'Your trial has expired. Upgrade to continue adding new records.',
                code: 'TRIAL_EXPIRED_READ_ONLY',
                organizationId: org.id,
                organizationName: org.name
            });
        }

        next();
    } catch (dbErr) {
        console.error('License guard organization check error:', dbErr.message);
        next();
    }
}

module.exports = licenseGuard;
