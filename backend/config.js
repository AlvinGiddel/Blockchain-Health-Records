/**
 * Central Configuration Module — Environment Validation at Startup
 *
 * This module is the single source of truth for all secret/key values.
 * It MUST be required before any module that needs JWT_SECRET or ENCRYPTION_KEY.
 *
 * Security contract:
 *  - If JWT_SECRET is missing or shorter than 32 characters, the process throws
 *    immediately on require(), preventing the server from starting insecurely.
 *  - If ENCRYPTION_KEY is missing or not a valid 64-character hex string (32 bytes),
 *    the process throws immediately.
 *  - There are NO fallback values. A misconfigured environment is always a hard crash,
 *    never a silent downgrade to a known weak secret.
 */

'use strict';

// ── JWT Secret ─────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || typeof JWT_SECRET !== 'string' || JWT_SECRET.trim().length < 32) {
    throw new Error(
        '[FATAL] JWT_SECRET environment variable is missing or too short.\n' +
        'Minimum length is 32 characters. Generate a strong secret with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
        'Server startup aborted to prevent authentication bypass.'
    );
}

// ── AES-256 Field-Level Encryption Key ────────────────────────────────────
const ENCRYPTION_KEY_HEX = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY_HEX || typeof ENCRYPTION_KEY_HEX !== 'string' || ENCRYPTION_KEY_HEX.trim().length !== 64) {
    throw new Error(
        '[FATAL] ENCRYPTION_KEY environment variable is missing or invalid.\n' +
        'Must be a 64-character hex string (representing 32 bytes). Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
        'Server startup aborted to prevent data exposure.'
    );
}

// Validate it is actually valid hex before constructing the Buffer
const ENCRYPTION_KEY = Buffer.from(ENCRYPTION_KEY_HEX.trim(), 'hex');
if (ENCRYPTION_KEY.length !== 32) {
    throw new Error(
        '[FATAL] ENCRYPTION_KEY could not be decoded to 32 bytes. ' +
        'Ensure it is a valid 64-character hex string.'
    );
}

module.exports = {
    JWT_SECRET: JWT_SECRET.trim(),
    ENCRYPTION_KEY,
};
