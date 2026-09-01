/**
 * License Check Service (Remote Kill-Switch Authority)
 * 
 * Periodically queries the remote license server (Supabase Edge Function or mock)
 * and maintains the in-memory license status with fail-closed security.
 */

const https = require('https');
const http = require('http');

// Global in-memory license status (never stored in local PostgreSQL database)
if (!global.licenseStatus) {
    global.licenseStatus = {
        status: 'active', // 'active' | 'disabled'
        lastChecked: null,
        consecutiveFailures: 0,
        reason: null
    };
}

const DEFAULT_INTERVAL_MS = 21600000; // 6 hours
const MAX_FAILURES_BEFORE_KILL = 3; // Fail-closed threshold

/**
 * Returns current in-memory license status object
 */
function getLicenseStatus() {
    return {
        status: global.licenseStatus.status,
        lastChecked: global.licenseStatus.lastChecked,
        consecutiveFailures: global.licenseStatus.consecutiveFailures,
        reason: global.licenseStatus.reason
    };
}

/**
 * Helper to perform HTTP/HTTPS GET request with timeout
 */
function httpGetJson(urlStr, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
        try {
            const parsedUrl = new URL(urlStr);
            const lib = parsedUrl.protocol === 'https:' ? https : http;

            const req = lib.get(urlStr, { timeout: timeoutMs }, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 400) {
                        return reject(new Error(`License server returned HTTP status ${res.statusCode}: ${data}`));
                    }
                    try {
                        const parsed = JSON.parse(data);
                        resolve(parsed);
                    } catch (e) {
                        reject(new Error(`Failed to parse license server JSON response: ${data}`));
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error(`License server request timed out after ${timeoutMs}ms`));
            });

            req.on('error', (err) => {
                reject(err);
            });
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Executes a single remote license verification check.
 * Updates in-memory global.licenseStatus.
 */
async function checkLicense() {
    const clientId = process.env.CLIENT_ID || 'bhc-client-001';
    const licenseServerUrl = process.env.LICENSE_SERVER_URL || 'mock';

    console.log(`[License Service] Initiating license verification check (Client: ${clientId})...`);

    // 1. Local Mock Testing Support
    if (licenseServerUrl.toLowerCase() === 'mock') {
        const mockStatus = (process.env.MOCK_LICENSE_STATUS || 'active').toLowerCase() === 'disabled' ? 'disabled' : 'active';
        global.licenseStatus.status = mockStatus;
        global.licenseStatus.lastChecked = new Date().toISOString();
        global.licenseStatus.consecutiveFailures = 0;
        global.licenseStatus.reason = mockStatus === 'disabled' ? 'mock_disabled' : null;

        console.log(`[License Service] [MOCK MODE] License verified as: ${mockStatus.toUpperCase()}`);
        return getLicenseStatus();
    }

    // 2. Real Remote Verification (Supabase Edge Function)
    const targetEndpoint = `${licenseServerUrl.replace(/\/+$/, '')}/${encodeURIComponent(clientId)}`;

    try {
        const response = await httpGetJson(targetEndpoint, 8000);
        const remoteStatus = response?.status === 'disabled' ? 'disabled' : (response?.status === 'active' ? 'active' : 'disabled');
        const reason = response?.reason || null;

        global.licenseStatus.status = remoteStatus;
        global.licenseStatus.lastChecked = new Date().toISOString();
        global.licenseStatus.consecutiveFailures = 0;
        global.licenseStatus.reason = reason;

        if (remoteStatus === 'active') {
            console.log(`[License Service] License check SUCCESS: Status is ACTIVE.`);
        } else {
            console.warn(`[License Service] 🚨 License check RETURNED DISABLED! (Reason: ${reason || 'unspecified'}). Service is now RESTRICTED.`);
        }

        return getLicenseStatus();
    } catch (error) {
        global.licenseStatus.consecutiveFailures += 1;
        global.licenseStatus.lastChecked = new Date().toISOString();
        const failures = global.licenseStatus.consecutiveFailures;

        console.error(`[License Service] License check request FAILED (${failures}/${MAX_FAILURES_BEFORE_KILL}):`, error.message);

        // Fail-Closed Security Policy: after 3 consecutive network failures, revoke active status
        if (failures >= MAX_FAILURES_BEFORE_KILL) {
            global.licenseStatus.status = 'disabled';
            global.licenseStatus.reason = 'unreachable_fail_closed';
            console.error(`[License Service] 🚨 FAIL-CLOSED TRIGGERED: Reached ${failures} consecutive failed checks. Application access is now DISABLED.`);
        }

        return getLicenseStatus();
    }
}

/**
 * Initializes recurring interval timer for license checking.
 * Guarded by global._licenseCheckTimer to prevent duplicate timers on hot-reload.
 */
function startLicenseCheckTimer() {
    if (global._licenseCheckTimer) {
        clearInterval(global._licenseCheckTimer);
        global._licenseCheckTimer = null;
    }

    const intervalMs = parseInt(process.env.LICENSE_CHECK_INTERVAL_MS, 10) || DEFAULT_INTERVAL_MS;
    console.log(`[License Service] Background verification timer started (Interval: ${intervalMs}ms).`);

    global._licenseCheckTimer = setInterval(async () => {
        try {
            await checkLicense();
        } catch (err) {
            console.error('[License Service] Unexpected error in timer check:', err);
        }
    }, intervalMs);

    if (global._licenseCheckTimer.unref) {
        global._licenseCheckTimer.unref();
    }
}

module.exports = {
    getLicenseStatus,
    checkLicense,
    startLicenseCheckTimer
};
