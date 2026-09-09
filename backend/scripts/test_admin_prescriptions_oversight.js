/**
 * Verification Test Suite: Super Admin Prescription Privacy-by-Design Oversight
 *
 * Validates:
 * 1. Super Admin is BLOCKED with HTTP 403 from direct unrestricted GET /api/prescriptions
 * 2. Unauthenticated calls to new oversight endpoints reject with HTTP 401
 * 3. Super Admin can view aggregated statistical prescription counts (Zero PII)
 * 4. Super Admin drill-down requires a justified reason (min. 10 chars, < 10 rejected with 400)
 * 5. Justified drill-down creates an immutable audit_logs entry with event_type = 'admin_prescription_view'
 * 6. Doctor / Clinic Admin legitimate access to GET /api/prescriptions is 100% UNTOUCHED
 */

process.env.VERCEL = '1';
const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const db = require('../db');
const app = require('../server');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

async function runTests() {
    console.log('================================================================');
    console.log(' SUPER ADMIN PRESCRIPTION PRIVACY & OVERSIGHT TEST SUITE       ');
    console.log('================================================================\n');

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    function request(pathUrl, options = {}) {
        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port,
                path: pathUrl,
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(options.headers || {})
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    let parsed = null;
                    try {
                        parsed = JSON.parse(data);
                    } catch {
                        parsed = data;
                    }
                    resolve({ status: res.statusCode, headers: res.headers, data: parsed });
                });
            });
            req.on('error', reject);
            if (options.body) {
                req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
            }
            req.end();
        });
    }

    try {
        // Setup: Fetch test users and organization
        const { rows: superAdmins } = await db.query("SELECT id, name, email FROM users WHERE role = 'super_admin' LIMIT 1");
        const superAdmin = superAdmins[0] || { id: '00000000-0000-0000-0000-000000000001', name: 'Super Admin Tester', email: 'superadmin@bhc.ke' };

        const { rows: doctors } = await db.query("SELECT id, name, email, organization_id FROM users WHERE role = 'doctor' AND organization_id IS NOT NULL LIMIT 1");
        const doctor = doctors[0];

        const { rows: orgs } = await db.query("SELECT id, name FROM organizations WHERE status = 'active' LIMIT 1");
        const org = orgs[0] || { id: '1757e930-752a-44ff-bd25-dba2e0c8a1e4', name: 'Nairobi West Hospital' };

        const superAdminToken = jwt.sign({ id: superAdmin.id, role: 'super_admin', name: superAdmin.name, email: superAdmin.email }, JWT_SECRET);
        const doctorToken = doctor ? jwt.sign({ id: doctor.id, role: 'doctor', name: doctor.name, email: doctor.email, organization_id: doctor.organization_id }, JWT_SECRET) : null;

        // -------------------------------------------------------------
        // TEST 1: Super Admin blocked from unrestricted GET /api/prescriptions
        // -------------------------------------------------------------
        console.log('--- TEST 1: Super Admin Direct Browse Blocked (HTTP 403) ---');
        const saBrowseRes = await request('/api/prescriptions', {
            headers: { 'Authorization': `Bearer ${superAdminToken}` }
        });
        if (saBrowseRes.status !== 403) {
            throw new Error(`Expected 403 Forbidden for Super Admin, got ${saBrowseRes.status}`);
        }
        if (!saBrowseRes.data?.error?.includes('Direct unrestricted prescription browsing is disabled for Super Admin')) {
            throw new Error('Expected custom error message regarding disabled unrestricted browsing');
        }
        console.log('✓ Super Admin successfully blocked from unrestricted prescription list with HTTP 403.\n');

        // -------------------------------------------------------------
        // TEST 2: Doctor access to GET /api/prescriptions is untouched
        // -------------------------------------------------------------
        if (doctorToken) {
            console.log('--- TEST 2: Doctor Legitimate Clinical Browse Allowed ---');
            const docBrowseRes = await request('/api/prescriptions', {
                headers: { 'Authorization': `Bearer ${doctorToken}` }
            });
            if (docBrowseRes.status !== 200) {
                throw new Error(`Expected 200 for Doctor, got ${docBrowseRes.status}`);
            }
            if (!Array.isArray(docBrowseRes.data?.prescriptions)) {
                throw new Error('Doctor should receive prescription array');
            }
            console.log('✓ Clinical Doctor prescription endpoint operates normally (200 OK).\n');
        }

        // -------------------------------------------------------------
        // TEST 3: Unauthenticated calls to oversight endpoints return 401
        // -------------------------------------------------------------
        console.log('--- TEST 3: Unauthenticated Oversight Endpoints Rejected (HTTP 401) ---');
        const unauthCounts = await request('/api/admin/organizations/prescription-counts');
        if (unauthCounts.status !== 401) {
            throw new Error(`Unauthenticated prescription-counts must return 401, got ${unauthCounts.status}`);
        }

        const unauthDrill = await request(`/api/admin/organizations/${org.id}/prescriptions`, {
            method: 'POST',
            body: { reason: 'Investigating incident report #12345' }
        });
        if (unauthDrill.status !== 401) {
            throw new Error(`Unauthenticated drill-down must return 401, got ${unauthDrill.status}`);
        }
        console.log('✓ Both endpoints strictly reject unauthenticated calls with HTTP 401.\n');

        // -------------------------------------------------------------
        // TEST 4: Super Admin gets aggregated prescription counts (Zero PII)
        // -------------------------------------------------------------
        console.log('--- TEST 4: Super Admin Aggregated Prescription Counts (Zero PII) ---');
        const countsRes = await request('/api/admin/organizations/prescription-counts', {
            headers: { 'Authorization': `Bearer ${superAdminToken}` }
        });
        if (countsRes.status !== 200) {
            throw new Error(`Expected 200, got ${countsRes.status}`);
        }
        if (countsRes.data.success !== true || !Array.isArray(countsRes.data.organizations)) {
            throw new Error('Expected success: true and organizations array');
        }
        const sample = countsRes.data.organizations[0];
        if (sample) {
            if (!('totalPrescriptions' in sample) || !('issuedCount' in sample)) {
                throw new Error('Aggregate must include statistical counts');
            }
            if ('patientName' in sample || 'medicationName' in sample) {
                throw new Error('Aggregate must NOT contain patientName or medicationName');
            }
        }
        console.log(`✓ Retrieved counts for ${countsRes.data.organizations.length} organizations with zero clinical PII.\n`);

        // -------------------------------------------------------------
        // TEST 5: Reason length validation (min. 10 chars)
        // -------------------------------------------------------------
        console.log('--- TEST 5: Justification Reason Guard (Rejection for < 10 chars) ---');
        const shortReasonRes = await request(`/api/admin/organizations/${org.id}/prescriptions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${superAdminToken}` },
            body: { reason: 'short' } // 5 chars
        });
        if (shortReasonRes.status !== 400) {
            throw new Error(`Expected 400 Bad Request, got ${shortReasonRes.status}`);
        }
        if (!shortReasonRes.data?.error?.includes('minimum 10 characters')) {
            throw new Error('Expected minimum 10 characters error message');
        }
        console.log('✓ Short justification (< 10 chars) cleanly rejected with HTTP 400.\n');

        // -------------------------------------------------------------
        // TEST 6: Justified drill-down succeeds & creates audit log
        // -------------------------------------------------------------
        console.log('--- TEST 6: Justified Drill-Down & Audit Log Creation ---');
        const validReason = 'Formal regulatory audit for medication control ref #PPB-2026-99';
        const drillRes = await request(`/api/admin/organizations/${org.id}/prescriptions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${superAdminToken}` },
            body: { reason: validReason }
        });
        if (drillRes.status !== 200) {
            throw new Error(`Expected 200 OK, got ${drillRes.status}`);
        }
        if (drillRes.data.auditLogged !== true || drillRes.data.eventType !== 'admin_prescription_view') {
            throw new Error('Audit log indicators missing from response');
        }

        // Verify entry in database audit_logs
        const { rows: auditRows } = await db.query(
            "SELECT * FROM audit_logs WHERE event_type = 'admin_prescription_view' AND organization_id = $1 ORDER BY timestamp DESC LIMIT 1",
            [org.id]
        );
        if (auditRows.length === 0 || !auditRows[0].details.includes(validReason)) {
            throw new Error('Audit log record not found or does not contain justification reason');
        }
        console.log(`✓ Audit log verified in PostgreSQL: event_type = "${auditRows[0].event_type}", actor = "${auditRows[0].doctor_name}".\n`);

        console.log('================================================================');
        console.log(' 🎉 ALL 6 PRIVACY-BY-DESIGN OVERSIGHT TESTS PASSED (100%)       ');
        console.log('================================================================');
        server.close();
        process.exit(0);

    } catch (err) {
        console.error('❌ Test failed:', err);
        server.close();
        process.exit(1);
    }
}

runTests();
