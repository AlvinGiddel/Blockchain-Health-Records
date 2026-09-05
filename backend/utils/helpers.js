const crypto = require('crypto');
const db = require('../db');
const { getKenyanTimestamp } = require('../blockchain');

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

module.exports = {
    normalizePhone,
    parseProfile,
    parseJsonIfNeeded,
    logAuditEvent,
    checkSuperAdminRateLimit
};
