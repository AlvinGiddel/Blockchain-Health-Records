const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { getKenyanTimestamp } = require('../blockchain');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

/**
 * Normalizes phone numbers by stripping all non-digit characters.
 * @param {string} phoneStr
 * @returns {string}
 */
const normalizePhone = (phoneStr) => {
    if (!phoneStr || typeof phoneStr !== 'string') return '';
    return phoneStr.replace(/[^0-9]/g, '');
};

/**
 * Safely parses JSON string or returns the existing object if already parsed.
 * @param {any} p
 * @returns {object}
 */
const parseProfile = (p) => {
    if (!p) return {};
    if (typeof p === 'string') {
        try { return JSON.parse(p); } catch (e) { return {}; }
    }
    return p;
};

/**
 * Safely parses nested JSON stringified data if needed.
 * @param {any} data
 * @returns {any}
 */
function parseJsonIfNeeded(data) {
    if (!data) return null;
    if (typeof data === 'string') {
        try {
            const parsed = JSON.parse(data);
            return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
        } catch (e) {
            return null;
        }
    }
    return data;
}

/**
 * Helper to log audit events with an explicit Kenyan timestamp.
 * @param {string} eventType
 * @param {string} patientId
 * @param {string} patientName
 * @param {string} doctorId
 * @param {string} doctorName
 * @param {string} details
 * @param {string|null} customTimestamp
 * @param {string|null} organizationId
 * @returns {Promise<any>}
 */
const logAuditEvent = (eventType, patientId, patientName, doctorId, doctorName, details, customTimestamp = null, organizationId = null) => {
    const timestamp = customTimestamp || getKenyanTimestamp();
    return db.query(
        `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [organizationId, eventType, patientId, patientName, doctorId, doctorName, details, timestamp]
    ).catch(err => console.error(`[AUDIT LOG ERROR] Failed to log ${eventType}:`, err.message));
};

// Dedicated In-Memory Rate Limiter for Super Admin Login (5 attempts / 15 min window)
const superAdminLoginAttempts = new Map(); // key: ip, value: { count: number, resetAt: number }

/**
 * Checks and increments rate limit counter for Super Admin login attempts.
 * @param {string} ip
 * @returns {{ allowed: boolean, retryAfterSec?: number }}
 */
function checkSuperAdminRateLimit(ip) {
    const now = Date.now();
    const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
    const MAX_ATTEMPTS = 5;

    const record = superAdminLoginAttempts.get(ip);
    if (!record || now > record.resetAt) {
        superAdminLoginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
        return { allowed: true };
    }

    if (record.count >= MAX_ATTEMPTS) {
        const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
        return { allowed: false, retryAfterSec };
    }

    record.count += 1;
    return { allowed: true };
}

const rawEncryptionKey = process.env.ENCRYPTION_KEY || 'f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a09';
const ENCRYPTION_KEY = Buffer.from(rawEncryptionKey, 'hex'); // 32 bytes
const IV_LENGTH = 16;

/**
 * AES-256 field-level encryption helper
 * @param {string} text
 * @returns {string}
 */
function encrypt(text) {
    if (!text) return text;
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (err) {
        console.error('Encryption failed:', err);
        return text;
    }
}

/**
 * AES-256 field-level decryption helper
 * @param {string} text
 * @returns {string}
 */
function decrypt(text) {
    if (!text || !text.includes(':')) return text;
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        console.error('Decryption failed:', err);
        return text;
    }
}

/**
 * Helper to safely extract authenticated user context and organization scope.
 * Guarantees strict multi-tenant isolation: regular clinic admins are strictly bound
 * to their organization_id. Only super_admin can view global cross-org data.
 * @param {import('express').Request} req
 * @returns {{ currentUser: object|null, isSuperAdmin: boolean, targetOrgId: string|null }}
 */
function getRequesterOrgScope(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let currentUser = null;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        try {
            currentUser = jwt.verify(authHeader.substring(7).trim(), JWT_SECRET);
        } catch (e) { }
    }

    // If super_admin, they can optionally target a specific clinic or see global (null)
    if (currentUser && currentUser.role === 'super_admin') {
        const explicitOrg = req.headers['x-organization-id'] || req.query.orgId || req.query.organizationId || null;
        return { currentUser, isSuperAdmin: true, targetOrgId: explicitOrg };
    }

    // For all other users (clinic admins, doctors, nurses), strictly scoped to their assigned organization_id
    const targetOrgId = currentUser ? (currentUser.organization_id || currentUser.organizationId || null) : null;
    return { currentUser, isSuperAdmin: false, targetOrgId };
}

/**
 * Helper to strictly verify Bearer JWT from Authorization header.
 * Throws an error with statusCode 401 if missing or invalid.
 * @param {import('express').Request} req
 * @returns {object} Decoded JWT payload
 */
function verifyAuthToken(req) {
    if (req.user && req.user.id) {
        return req.user;
    }
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        const error = new Error('Authentication token required.');
        error.statusCode = 401;
        throw error;
    }
    const token = authHeader.substring(7).trim();
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        decoded.organization_id = decoded.organization_id || decoded.organizationId || null;
        decoded.organizationId = decoded.organization_id;
        req.user = decoded;
        return decoded;
    } catch (err) {
        const error = new Error('Invalid or expired authentication session.');
        error.statusCode = 401;
        throw error;
    }
}

module.exports = {
    normalizePhone,
    parseProfile,
    parseJsonIfNeeded,
    logAuditEvent,
    checkSuperAdminRateLimit,
    encrypt,
    decrypt,
    getRequesterOrgScope,
    verifyAuthToken,
    getKenyanTimestamp
};

