/**
 * License Check & Trial Expiry Worker (Jobs Domain)
 * 
 * Periodically verifies remote license authority status (fail-closed after 3 failures)
 * and scans database for expired multi-tenant organization trials, auto-transitioning
 * them to 'expired' (read-only grace mode).
 */

const db = require('../db');
const { logAuditEvent } = require('../utils/helpers');
const { checkLicense, getLicenseStatus } = require('../services/licenseCheck');

// Default check interval: 6 hours (overrideable via env var)
const DEFAULT_INTERVAL_MS = parseInt(process.env.LICENSE_CHECK_INTERVAL_MS, 10) || 6 * 60 * 60 * 1000;

/**
 * Checks all organizations currently in 'trial' status whose expiration date has passed.
 * Automatically transitions them to 'expired' and updates the licenses table.
 * 
 * @returns {Promise<{transitionedCount: number, expiredOrganizations: Array<{id: string, name: string, expiredAt: string}>}>}
 */
async function checkAllOrganizationTrials() {
    try {
        const query = `
            SELECT id, name, status, license_expires_at 
            FROM organizations 
            WHERE status = 'trial' 
              AND license_expires_at IS NOT NULL 
              AND license_expires_at < NOW();
        `;
        const { rows: expiredOrgs } = await db.query(query);

        if (expiredOrgs.length === 0) {
            return { transitionedCount: 0, expiredOrganizations: [] };
        }

        console.log(`[License Job] Found ${expiredOrgs.length} organization(s) with expired trial period. Transitioning to 'expired'...`);

        const transitioned = [];
        for (const org of expiredOrgs) {
            await db.query("UPDATE organizations SET status = 'expired', updated_at = NOW() WHERE id = $1;", [org.id]);
            await db.query("UPDATE licenses SET status = 'expired', updated_at = NOW() WHERE organization_id = $1;", [org.id]);

            await logAuditEvent(
                'TRIAL_EXPIRED',
                null,
                null,
                null,
                'System License Worker',
                `Clinic "${org.name}" trial expired on ${org.license_expires_at}. Transitioned to read-only grace mode.`,
                null,
                org.id
            );

            console.log(`[License Job] Organization "${org.name}" (${org.id}) transitioned: trial -> expired.`);
            transitioned.push({
                id: org.id,
                name: org.name,
                expiredAt: org.license_expires_at
            });
        }

        return {
            transitionedCount: transitioned.length,
            expiredOrganizations: transitioned
        };
    } catch (err) {
        console.error('[License Job] Error checking organization trial expiries:', err.message);
        return {
            transitionedCount: 0,
            expiredOrganizations: [],
            error: err.message
        };
    }
}

/**
 * Runs a complete license verification cycle:
 * 1. Checks remote license authority (fail-closed, 3-consecutive-failure threshold).
 * 2. Scans local database for expired clinic trials and auto-transitions them.
 * 
 * @returns {Promise<{remoteStatus: object, trialResult: object}>}
 */
async function runLicenseVerificationCycle() {
    console.log('[License Job] Running license verification cycle...');
    const remoteStatus = await checkLicense();
    const trialResult = await checkAllOrganizationTrials();
    return {
        remoteStatus,
        trialResult
    };
}

/**
 * Starts recurring background timer for license and trial expiry verification.
 * Uses global._licenseCheckJobTimer to avoid duplicate timers during hot-reloads or tests.
 * 
 * @param {number} [intervalMs] - Check interval in milliseconds
 */
function startLicenseCheckJob(intervalMs = DEFAULT_INTERVAL_MS) {
    if (global._licenseCheckJobTimer) {
        clearInterval(global._licenseCheckJobTimer);
        global._licenseCheckJobTimer = null;
    }

    console.log(`[License Job] Background license & trial check worker started (Interval: ${intervalMs}ms).`);

    global._licenseCheckJobTimer = setInterval(async () => {
        try {
            await runLicenseVerificationCycle();
        } catch (err) {
            console.error('[License Job] Unexpected error in verification cycle:', err);
        }
    }, intervalMs);

    if (global._licenseCheckJobTimer.unref) {
        global._licenseCheckJobTimer.unref();
    }
}

/**
 * Stops the recurring license check timer.
 */
function stopLicenseCheckJob() {
    if (global._licenseCheckJobTimer) {
        clearInterval(global._licenseCheckJobTimer);
        global._licenseCheckJobTimer = null;
        console.log('[License Job] Background timer stopped.');
    }
}

/**
 * Returns overall license job status including remote authority state and failure counts.
 */
function getLicenseJobStatus() {
    const remote = getLicenseStatus();
    return {
        remoteStatus: remote.status,
        lastChecked: remote.lastChecked,
        consecutiveFailures: remote.consecutiveFailures,
        killSwitchReason: remote.reason,
        isTimerRunning: !!global._licenseCheckJobTimer
    };
}

/**
 * Initializes the license check worker and optionally starts the background timer.
 * 
 * @param {object} [options] - Options: { startTimer?: boolean, intervalMs?: number }
 */
async function initLicenseCheckJob(options = {}) {
    const initialCycle = await runLicenseVerificationCycle();
    if (options.startTimer !== false) {
        startLicenseCheckJob(options.intervalMs || DEFAULT_INTERVAL_MS);
    }
    return {
        initialCycle,
        getLicenseJobStatus,
        runLicenseVerificationCycle,
        checkAllOrganizationTrials,
        startLicenseCheckJob,
        stopLicenseCheckJob
    };
}

module.exports = {
    checkAllOrganizationTrials,
    runLicenseVerificationCycle,
    startLicenseCheckJob,
    stopLicenseCheckJob,
    getLicenseJobStatus,
    initLicenseCheckJob,
    DEFAULT_INTERVAL_MS
};
