process.env.VERCEL = '1';
const http = require('http');
const jwt = require('jsonwebtoken');
const db = require('../db');
const app = require('../server');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

async function runAdminOrgTests() {
    console.log('===============================================================');
    console.log('    RUNNING ADMIN & ORGANIZATIONS DOMAIN SECURITY TEST SUITE   ');
    console.log('===============================================================\n');

    let passed = 0;
    let failed = 0;

    function assert(condition, testName, details = '') {
        if (condition) {
            console.log(`✅ [PASS] ${testName}`);
            passed++;
        } else {
            console.error(`❌ [FAIL] ${testName} -> ${details}`);
            failed++;
        }
    }

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    function request(path, options = {}) {
        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port,
                path,
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(options.headers || {})
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    let parsed;
                    try { parsed = JSON.parse(data); } catch (e) { parsed = data; }
                    resolve({ status: res.statusCode, body: parsed });
                });
            });
            req.on('error', reject);
            if (options.body) req.write(JSON.stringify(options.body));
            req.end();
        });
    }

    try {
        // Fetch test entities from DB
        const { rows: superAdmins } = await db.query("SELECT * FROM users WHERE role = 'super_admin' LIMIT 1");
        const superAdmin = superAdmins[0] || { id: '00000000-0000-0000-0000-000000000001', role: 'super_admin', email: 'superadmin@test.com' };

        const { rows: clinicAdmins } = await db.query("SELECT * FROM users WHERE role = 'admin' LIMIT 1");
        const clinicAdmin = clinicAdmins[0] || { id: '00000000-0000-0000-0000-000000000002', role: 'admin', organization_id: 'a3409337-0a6e-4c23-bc11-4ffcbd8fc44d' };

        const { rows: doctors } = await db.query("SELECT * FROM users WHERE role = 'doctor' LIMIT 1");
        const doctor = doctors[0] || { id: '00000000-0000-0000-0000-000000000003', role: 'doctor' };

        const superAdminToken = jwt.sign({ id: superAdmin.id, role: 'super_admin', email: superAdmin.email }, JWT_SECRET, { expiresIn: '1h' });
        const clinicAdminToken = jwt.sign({ id: clinicAdmin.id, role: 'admin', email: clinicAdmin.email, organization_id: clinicAdmin.organization_id }, JWT_SECRET, { expiresIn: '1h' });
        const doctorToken = jwt.sign({ id: doctor.id, role: 'doctor', email: doctor.email }, JWT_SECRET, { expiresIn: '1h' });

        console.log('--- TEST GROUP 1: PUBLIC HEALTHCARE FACILITY LISTING ---');
        const activeOrgsRes = await request('/api/organizations/active');
        assert(activeOrgsRes.status === 200, 'GET /api/organizations/active responds 200 without authentication', `Got status ${activeOrgsRes.status}`);
        assert(Array.isArray(activeOrgsRes.body) && activeOrgsRes.body.length > 0, 'Active organizations list is non-empty array');

        console.log('\n--- TEST GROUP 2: UNAUTHENTICATED REJECTION (401) ON SENSITIVE ENDPOINTS ---');
        
        const unauthProvision = await request('/api/admin/provision-tenant', {
            method: 'POST',
            body: { hospitalName: 'Rogue Hospital', name: 'Rogue Admin', email: 'rogue@test.com', password: 'password123' }
        });
        assert(unauthProvision.status === 401, 'POST /api/admin/provision-tenant rejected with 401 when no token', `Got ${unauthProvision.status}`);

        const unauthAdminApprove = await request('/api/admin/approve/00000000-0000-0000-0000-000000000000', { method: 'POST' });
        assert(unauthAdminApprove.status === 401, 'POST /api/admin/approve/:id rejected with 401 when no token', `Got ${unauthAdminApprove.status}`);

        const unauthAdminReject = await request('/api/admin/reject/00000000-0000-0000-0000-000000000000', { method: 'POST' });
        assert(unauthAdminReject.status === 401, 'POST /api/admin/reject/:id rejected with 401 when no token', `Got ${unauthAdminReject.status}`);

        const unauthAdminAll = await request('/api/admin/all');
        assert(unauthAdminAll.status === 401, 'GET /api/admin/all rejected with 401 when no token', `Got ${unauthAdminAll.status}`);

        const unauthDocApprove = await request('/api/admin/doctors/approve/00000000-0000-0000-0000-000000000000', { method: 'POST' });
        assert(unauthDocApprove.status === 401, 'POST /api/admin/doctors/approve/:id rejected with 401 when no token', `Got ${unauthDocApprove.status}`);

        const unauthDocReject = await request('/api/admin/doctors/reject/00000000-0000-0000-0000-000000000000', { method: 'POST' });
        assert(unauthDocReject.status === 401, 'POST /api/admin/doctors/reject/:id rejected with 401 when no token', `Got ${unauthDocReject.status}`);

        const unauthDeleteUser = await request('/api/users/00000000-0000-0000-0000-000000000000', { method: 'DELETE' });
        assert(unauthDeleteUser.status === 401, 'DELETE /api/users/:id rejected with 401 when no token', `Got ${unauthDeleteUser.status}`);

        const unauthLicenseSim = await request('/api/license/simulate', { method: 'POST', body: { status: 'disabled' } });
        assert(unauthLicenseSim.status === 401, 'POST /api/license/simulate rejected with 401 when no token', `Got ${unauthLicenseSim.status}`);

        const unauthOrgStatus = await request('/api/admin/organizations/00000000-0000-0000-0000-000000000000/status', { method: 'POST', body: { status: 'disabled' } });
        assert(unauthOrgStatus.status === 401, 'POST /api/admin/organizations/:id/status rejected with 401 when no token', `Got ${unauthOrgStatus.status}`);

        console.log('\n--- TEST GROUP 3: ROLE-BASED ACCESS CONTROL (403) FOR NON-SUPER-ADMINS ---');

        const clinicAdminProvision = await request('/api/admin/provision-tenant', {
            method: 'POST',
            headers: { Authorization: `Bearer ${clinicAdminToken}` },
            body: { hospitalName: 'Unauthorized Hospital', name: 'Rogue Admin', email: 'rogue2@test.com', password: 'password123' }
        });
        assert(clinicAdminProvision.status === 403, 'Clinic Admin blocked from POST /api/admin/provision-tenant (403)', `Got ${clinicAdminProvision.status}`);

        const doctorProvision = await request('/api/admin/provision-tenant', {
            method: 'POST',
            headers: { Authorization: `Bearer ${doctorToken}` },
            body: { hospitalName: 'Unauthorized Hospital', name: 'Rogue Admin', email: 'rogue3@test.com', password: 'password123' }
        });
        assert(doctorProvision.status === 403, 'Doctor blocked from POST /api/admin/provision-tenant (403)', `Got ${doctorProvision.status}`);

        const clinicAdminApproveAdmin = await request('/api/admin/approve/00000000-0000-0000-0000-000000000000', {
            method: 'POST',
            headers: { Authorization: `Bearer ${clinicAdminToken}` }
        });
        assert(clinicAdminApproveAdmin.status === 403, 'Clinic Admin blocked from approving another admin (403)', `Got ${clinicAdminApproveAdmin.status}`);

        const clinicAdminKillswitch = await request('/api/admin/organizations/00000000-0000-0000-0000-000000000000/status', {
            method: 'POST',
            headers: { Authorization: `Bearer ${clinicAdminToken}` },
            body: { status: 'disabled' }
        });
        assert(clinicAdminKillswitch.status === 403, 'Clinic Admin blocked from facility kill-switch (403)', `Got ${clinicAdminKillswitch.status}`);

        const clinicAdminSimLicense = await request('/api/license/simulate', {
            method: 'POST',
            headers: { Authorization: `Bearer ${clinicAdminToken}` },
            body: { status: 'disabled' }
        });
        assert(clinicAdminSimLicense.status === 403, 'Clinic Admin blocked from global license simulate (403)', `Got ${clinicAdminSimLicense.status}`);

        console.log('\n--- TEST GROUP 4: SUPER ADMIN PRIVILEGED OPERATIONS ---');

        const superAdminOrgs = await request('/api/admin/organizations', {
            headers: { Authorization: `Bearer ${superAdminToken}` }
        });
        assert(superAdminOrgs.status === 200, 'Super Admin GET /api/admin/organizations succeeds (200)', `Got ${superAdminOrgs.status}`);
        assert(Array.isArray(superAdminOrgs.body.organizations), 'Organizations returned as an array in { success: true, organizations }');

        const superAdminPendingOrgs = await request('/api/admin/organizations/pending', {
            headers: { Authorization: `Bearer ${superAdminToken}` }
        });
        assert(superAdminPendingOrgs.status === 200, 'Super Admin GET /api/admin/organizations/pending succeeds (200)', `Got ${superAdminPendingOrgs.status}`);
        assert(Array.isArray(superAdminPendingOrgs.body.pendingClinics), 'Pending clinics returned as an array');

        const superAdminPendingDocs = await request('/api/admin/doctors/pending', {
            headers: { Authorization: `Bearer ${superAdminToken}` }
        });
        assert(superAdminPendingDocs.status === 200, 'Super Admin GET /api/admin/doctors/pending succeeds (200)', `Got ${superAdminPendingDocs.status}`);

        const superAdminPendingAdmins = await request('/api/admin/pending', {
            headers: { Authorization: `Bearer ${superAdminToken}` }
        });
        assert(superAdminPendingAdmins.status === 200, 'Super Admin GET /api/admin/pending succeeds (200)', `Got ${superAdminPendingAdmins.status}`);

        const superAdminAllAdmins = await request('/api/admin/all', {
            headers: { Authorization: `Bearer ${superAdminToken}` }
        });
        assert(superAdminAllAdmins.status === 200, 'Super Admin GET /api/admin/all succeeds (200)', `Got ${superAdminAllAdmins.status}`);

        const superAdminStats = await request('/api/admin/stats', {
            headers: { Authorization: `Bearer ${superAdminToken}` }
        });
        assert(superAdminStats.status === 200, 'Super Admin GET /api/admin/stats succeeds (200)', `Got ${superAdminStats.status}`);
        assert(typeof superAdminStats.body.blocks === 'number' && typeof superAdminStats.body.totalAppointments === 'number', 'Admin stats contains numeric metric fields');

        console.log('\n--- TEST GROUP 5: END-TO-END CLINIC APPROVAL & KILL-SWITCH LIFECYCLE ---');

        // Create a test organization in pending_approval status
        const testOrgName = `Test Clinic Auto ${Date.now()}`;
        const { rows: insertedOrg } = await db.query(
            "INSERT INTO organizations (name, status) VALUES ($1, 'pending_approval') RETURNING id, name, status",
            [testOrgName]
        );
        const testOrgId = insertedOrg[0].id;

        // 1. Verify it appears in pending list
        const pendingListRes = await request('/api/admin/organizations/pending', {
            headers: { Authorization: `Bearer ${superAdminToken}` }
        });
        const foundInPending = pendingListRes.body.pendingClinics && pendingListRes.body.pendingClinics.some(o => o.id === testOrgId);
        assert(foundInPending, `Newly submitted facility appears in pending queue (id: ${testOrgId})`);

        // 2. Super Admin approves it
        const approveRes = await request(`/api/admin/organizations/${testOrgId}/approve`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${superAdminToken}` }
        });
        assert(approveRes.status === 200 && approveRes.body.success, 'Super Admin approved facility successfully (200)');

        // Verify DB status is now trial (7-day trial activated)
        const { rows: dbOrgAfterApprove } = await db.query('SELECT status FROM organizations WHERE id = $1', [testOrgId]);
        assert(dbOrgAfterApprove[0].status === 'trial', 'Database organization status updated to "trial" (7-day trial activated)');

        // 3. Super Admin tests per-facility kill-switch (status -> disabled)
        const killswitchRes = await request(`/api/admin/organizations/${testOrgId}/status`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${superAdminToken}` },
            body: { status: 'disabled', reason: 'Automated test killswitch check' }
        });
        assert(killswitchRes.status === 200 && killswitchRes.body.success, 'Super Admin disabled facility via killswitch (200)');

        const { rows: dbOrgAfterKill } = await db.query('SELECT status FROM organizations WHERE id = $1', [testOrgId]);
        assert(dbOrgAfterKill[0].status === 'disabled', 'Database organization status updated to "disabled"');

        // Clean up test organization and its genesis block
        await db.query('DELETE FROM blocks WHERE organization_id = $1', [testOrgId]);
        await db.query('DELETE FROM organizations WHERE id = $1', [testOrgId]);
        console.log('Cleaned up test clinic records.');

        console.log('\n--- TEST GROUP 6: AUDIT TRAIL & PUBLIC HEALTH ANALYTICS ---');
        const auditRes = await request('/api/audit/logs', {
            headers: { Authorization: `Bearer ${superAdminToken}` }
        });
        assert(auditRes.status === 200, 'GET /api/audit/logs responds 200', `Got ${auditRes.status}`);

        const analyticsRes = await request('/api/analytics/public-health', {
            headers: { Authorization: `Bearer ${superAdminToken}` }
        });
        assert(analyticsRes.status === 200, 'GET /api/analytics/public-health responds 200', `Got ${analyticsRes.status}`);

    } catch (err) {
        console.error('Fatal error during test run:', err);
        failed++;
    } finally {
        server.close();
        console.log('\n===============================================================');
        console.log(`TEST SUMMARY: ${passed} PASSED | ${failed} FAILED`);
        console.log('===============================================================\n');
        process.exit(failed > 0 ? 1 : 0);
    }
}

runAdminOrgTests();
