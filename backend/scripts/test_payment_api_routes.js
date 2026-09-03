/**
 * Test Suite: Payment API HTTP Endpoints Verification
 */

const path = require('path');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
process.env.VERCEL = '1';
const db = require('../db');
const app = require('../server');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

async function testPaymentRoutes() {
    console.log('================================================================');
    console.log('TESTING PAYMENT API ENDPOINTS VIA IN-PROCESS HTTP DISPATCH');
    console.log('================================================================\n');

    let server = null;
    let testOrgId = null;

    try {
        // Start ephemeral server on random port
        server = app.listen(0);
        const port = server.address().port;
        const baseUrl = `http://127.0.0.1:${port}`;
        console.log(`Ephemeral server listening on ${baseUrl}`);

        // 1. Test /api/payments/plans (Public)
        const plansRes = await fetch(`${baseUrl}/api/payments/plans`);
        const plansData = await plansRes.json();
        console.log('✓ /api/payments/plans response status:', plansRes.status);
        console.log('  Plans returned:', plansData.plans?.map(p => `${p.name} (KES ${p.amountKES})`).join(', '));
        if (!plansData.plans || plansData.plans.length === 0) {
            throw new Error('No plans returned from /api/payments/plans');
        }

        // 2. Create test org and doctor/admin user
        const { rows: orgRows } = await db.pool.query(`
            INSERT INTO organizations (name, slug, status, license_expires_at)
            VALUES ($1, $2, 'active', NOW() + INTERVAL '10 days')
            RETURNING id, name, license_expires_at;
        `, [`API Test Clinic ${Date.now()}`, `api-test-${Date.now()}`]);
        testOrgId = orgRows[0].id;

        const { rows: userRows } = await db.pool.query('SELECT id, email FROM users LIMIT 1');
        const testUser = userRows[0];

        // Generate token for clinic admin
        const adminToken = jwt.sign({
            id: testUser.id,
            email: testUser.email,
            role: 'admin',
            organization_id: testOrgId
        }, JWT_SECRET, { expiresIn: '1h' });

        // 3. Test /api/payments/clinic-license
        const clinicLicRes = await fetch(`${baseUrl}/api/payments/clinic-license`, {
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'x-organization-id': testOrgId
            }
        });
        const clinicLicData = await clinicLicRes.json();
        console.log('✓ /api/payments/clinic-license status:', clinicLicRes.status);
        console.log('  Organization name:', clinicLicData.organization?.name);
        if (clinicLicData.organization?.id !== testOrgId) {
            throw new Error('Clinic license organization ID mismatch');
        }

        // 4. Test /api/payments/initialize
        const initRes = await fetch(`${baseUrl}/api/payments/initialize`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'Content-Type': 'application/json',
                'x-organization-id': testOrgId
            },
            body: JSON.stringify({
                planId: 'plan_1m',
                organizationId: testOrgId
            })
        });
        const initData = await initRes.json();
        console.log('✓ /api/payments/initialize status:', initRes.status);
        console.log('  Reference generated:', initData.reference);
        console.log('  Authorization URL:', initData.authorization_url);
        if (!initData.reference) {
            throw new Error('Initialize did not return reference');
        }

        // 5. Test /api/payments/verify/:reference
        const verifyRes = await fetch(`${baseUrl}/api/payments/verify/${initData.reference}`, {
            headers: {
                'Authorization': `Bearer ${adminToken}`
            }
        });
        const verifyData = await verifyRes.json();
        console.log('✓ /api/payments/verify status:', verifyRes.status);
        console.log('  Verification message:', verifyData.message);
        console.log('  New expiry:', verifyData.organization?.license_expires_at);
        if (!verifyData.success) {
            throw new Error('Verification failed');
        }

        // 6. Test /api/payments/history
        const historyRes = await fetch(`${baseUrl}/api/payments/history`, {
            headers: {
                'Authorization': `Bearer ${adminToken}`,
                'x-organization-id': testOrgId
            }
        });
        const historyData = await historyRes.json();
        console.log('✓ /api/payments/history status:', historyRes.status);
        console.log(`  Found ${historyData.payments?.length} payment history records`);
        if (!historyData.payments || historyData.payments.length === 0) {
            throw new Error('Expected at least 1 payment history item');
        }

        console.log('\n================================================================');
        console.log('ALL API HTTP ROUTE TESTS PASSED SUCCESSFULLY!');
        console.log('================================================================\n');

    } catch (err) {
        console.error('API route test failed:', err);
        process.exit(1);
    } finally {
        if (testOrgId) {
            await db.pool.query('DELETE FROM organizations WHERE id = $1', [testOrgId]).catch(() => {});
        }
        if (server) {
            server.close();
        }
        await db.pool.end();
        process.exit(0);
    }
}

testPaymentRoutes();
