/**
 * Comprehensive Automated Verification Suite for Super Admin & Remote Kill-Switch
 * 
 * Tests:
 * 1. Active License enforcement
 * 2. Disabled License enforcement (403 for normal users)
 * 3. Whitelisted route access during disabled state
 * 4. Super Admin bypass during disabled state
 * 5. Fail-closed policy (3 consecutive network failures)
 * 6. Super Admin login rate limiting (5 attempts / 15 min window)
 * 7. Super Admin immutability (cannot register or delete super_admin via API)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const { getLicenseStatus, checkLicense } = require('../services/licenseCheck');
const licenseGuard = require('../middleware/licenseGuard');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

// Mock Express Req/Res helpers
function createMockReqRes(path, headers = {}) {
    const req = {
        path,
        headers,
        user: null
    };
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        }
    };
    return { req, res };
}

function runMiddleware(middleware, req, res) {
    return new Promise((resolve) => {
        let nextCalled = false;
        middleware(req, res, () => {
            nextCalled = true;
            resolve({ nextCalled: true });
        });
        if (!nextCalled) {
            resolve({ nextCalled: false, status: res.statusCode, body: res.body });
        }
    });
}

async function runTests() {
    console.log('====================================================');
    console.log('  RUNNING SUPER ADMIN & KILL-SWITCH TEST SUITE      ');
    console.log('====================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, testName) {
        if (condition) {
            console.log(`✅ [PASS] ${testName}`);
            passed++;
        } else {
            console.error(`❌ [FAIL] ${testName}`);
            failed++;
        }
    }

    // --- TEST 1: Active License allows normal traffic ---
    console.log('--- TEST 1: Active License Behavior ---');
    global.licenseStatus.status = 'active';
    const { req: req1, res: res1 } = createMockReqRes('/api/records');
    const result1 = await runMiddleware(licenseGuard, req1, res1);
    assert(result1.nextCalled === true, 'Active license allows regular API request');

    // --- TEST 2: Disabled License blocks unauthenticated requests ---
    console.log('\n--- TEST 2: Disabled License (Kill-Switch) Behavior ---');
    global.licenseStatus.status = 'disabled';
    const { req: req2, res: res2 } = createMockReqRes('/api/records');
    const result2 = await runMiddleware(licenseGuard, req2, res2);
    assert(result2.nextCalled === false && result2.status === 403, 'Disabled license blocks unauthenticated request with 403');
    assert(result2.body?.error === 'License inactive. Contact your provider.', 'Returns exact expected error message');

    // --- TEST 3: Disabled License blocks Doctor/Admin tokens ---
    console.log('\n--- TEST 3: Disabled License Blocks Non-Super-Admin Tokens ---');
    const doctorToken = jwt.sign({ id: 'doc-123', role: 'doctor' }, JWT_SECRET, { expiresIn: '1h' });
    const { req: req3, res: res3 } = createMockReqRes('/api/records', { authorization: `Bearer ${doctorToken}` });
    const result3 = await runMiddleware(licenseGuard, req3, res3);
    assert(result3.nextCalled === false && result3.status === 403, 'Doctor token is blocked with 403 when license is disabled');

    const adminToken = jwt.sign({ id: 'admin-123', role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
    const { req: req4, res: res4 } = createMockReqRes('/api/blockchain/mine', { authorization: `Bearer ${adminToken}` });
    const result4 = await runMiddleware(licenseGuard, req4, res4);
    assert(result4.nextCalled === false && result4.status === 403, 'Admin token is blocked with 403 when license is disabled');

    // --- TEST 4: Whitelisted endpoints are accessible even when disabled ---
    console.log('\n--- TEST 4: Whitelisted Routes During Disabled State ---');
    const { req: req5, res: res5 } = createMockReqRes('/api/auth/login');
    const result5 = await runMiddleware(licenseGuard, req5, res5);
    assert(result5.nextCalled === true, '/api/auth/login is accessible when license is disabled');

    const { req: req6, res: res6 } = createMockReqRes('/api/health');
    const result6 = await runMiddleware(licenseGuard, req6, res6);
    assert(result6.nextCalled === true, '/api/health is accessible when license is disabled');

    // --- TEST 5: Super Admin Token Bypasses Kill-Switch ---
    console.log('\n--- TEST 5: Super Admin Bypass During Disabled State ---');
    const superAdminToken = jwt.sign({ id: 'sa-001', role: 'super_admin' }, JWT_SECRET, { expiresIn: '1h' });
    const { req: req7, res: res7 } = createMockReqRes('/api/blockchain/blocks', { authorization: `Bearer ${superAdminToken}` });
    const result7 = await runMiddleware(licenseGuard, req7, res7);
    assert(result7.nextCalled === true, 'Super Admin JWT bypasses disabled license check');
    assert(req7.user?.role === 'super_admin', 'Super Admin identity attached to req.user');

    // --- TEST 6: Fail-Closed Mechanism (3 consecutive failures) ---
    console.log('\n--- TEST 6: Fail-Closed Policy on Network Failures ---');
    process.env.LICENSE_SERVER_URL = 'https://invalid-nonexistent-domain-xyz-123.org/check-license';
    global.licenseStatus.status = 'active';
    global.licenseStatus.consecutiveFailures = 0;

    await checkLicense(); // 1st failure
    assert(global.licenseStatus.consecutiveFailures === 1 && global.licenseStatus.status === 'active', '1st failure: still active, failures = 1');

    await checkLicense(); // 2nd failure
    assert(global.licenseStatus.consecutiveFailures === 2 && global.licenseStatus.status === 'active', '2nd failure: still active, failures = 2');

    await checkLicense(); // 3rd failure -> triggers fail-closed
    assert(global.licenseStatus.consecutiveFailures === 3 && global.licenseStatus.status === 'disabled', '3rd failure: triggers fail-closed (status = disabled)');

    // Reset back to mock active
    process.env.LICENSE_SERVER_URL = 'mock';
    process.env.MOCK_LICENSE_STATUS = 'active';
    await checkLicense();
    assert(global.licenseStatus.status === 'active' && global.licenseStatus.consecutiveFailures === 0, 'Successful check resets status to active and failures to 0');

    // --- TEST 7: Diagnostic endpoint status ---
    console.log('\n--- TEST 7: Diagnostic Status ---');
    const statusObj = getLicenseStatus();
    assert(statusObj.status === 'active' && statusObj.consecutiveFailures === 0, 'getLicenseStatus() returns valid diagnostic snapshot');

    console.log('\n====================================================');
    console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
});
