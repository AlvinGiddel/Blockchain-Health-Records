const http = require('http');
const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { parseJsonIfNeeded, getRequesterOrgScope } = require('../utils/helpers');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

async function runDoctorOrgFilterTests() {
    console.log('======================================================');
    console.log('   RUNNING DOCTOR ORG FILTERING TEST SUITE            ');
    console.log('======================================================\n');

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

    const org1Id = crypto.randomUUID();
    const org2Id = crypto.randomUUID();
    const doc1Id = crypto.randomUUID();
    const doc2Id = crypto.randomUUID();
    const patientId = crypto.randomUUID();

    const name1 = 'Org Hospital One ' + org1Id.substring(0, 8);
    const name2 = 'Org Hospital Two ' + org2Id.substring(0, 8);

    await db.query(`
        INSERT INTO organizations (id, name, slug, status)
        VALUES 
            ($1, $2, $2, 'active'),
            ($3, $4, $4, 'active')
        ON CONFLICT (id) DO NOTHING;
    `, [org1Id, name1, org2Id, name2]);

    await db.query(`
        INSERT INTO users (id, name, email, password, role, organization_id, is_approved, is_rejected, public_key, private_key, doctor_profile)
        VALUES 
            ($1, 'Dr. One', 'doc1@filtertest.com', 'hashed', 'doctor', $2, true, false, 'pub1', 'priv1', '{"specialization":"Surgeon"}'),
            ($3, 'Dr. Two', 'doc2@filtertest.com', 'hashed', 'doctor', $4, true, false, 'pub2', 'priv2', '{"specialization":"Cardiologist"}')
        ON CONFLICT (id) DO NOTHING;
    `, [doc1Id, org1Id, doc2Id, org2Id]);

    await db.query(`
        INSERT INTO users (id, name, email, password, role, organization_id, is_approved, public_key, private_key)
        VALUES ($1, 'Patient Filter Test', 'patient@filtertest.com', 'hashed', 'patient', $2, true, 'pubp', 'privp')
        ON CONFLICT (id) DO NOTHING;
    `, [patientId, org1Id]);

    await db.query(`
        INSERT INTO tenant_memberships (user_id, organization_id, role, status)
        VALUES ($1, $2, 'patient', 'active')
        ON CONFLICT (user_id, organization_id) DO NOTHING;
    `, [patientId, org1Id]);

    // Setup app using the exact logic from server.js lines 780-822
    const app = express();
    app.use(express.json());

    app.get('/api/users/doctors', async (req, res) => {
        try {
            const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);
            const requestedOrgId = req.query.orgId || req.query.organizationId;

            let query;
            let params = [];
            if (targetOrgId && (!currentUser || currentUser.role !== 'patient' || !requestedOrgId)) {
                query = 'SELECT id, name, email, role, organization_id as "organizationId", public_key as "publicKey", profile_photo as "profilePhoto", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE organization_id = $1 AND role = \'doctor\' AND is_approved = true ORDER BY created_at DESC;';
                params = [targetOrgId];
            } else if (requestedOrgId) {
                query = 'SELECT id, name, email, role, organization_id as "organizationId", public_key as "publicKey", profile_photo as "profilePhoto", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE organization_id = $1 AND role = \'doctor\' AND is_approved = true ORDER BY created_at DESC;';
                params = [requestedOrgId];
            } else if (isSuperAdmin) {
                query = 'SELECT u.id, u.name, u.email, u.role, u.organization_id as "organizationId", o.name as "organizationName", o.status as "organizationStatus", u.public_key as "publicKey", u.profile_photo as "profilePhoto", u.doctor_profile as "doctorProfile", u.is_approved as "isApproved", u.created_at as "createdAt" FROM users u LEFT JOIN organizations o ON u.organization_id = o.id WHERE u.role = \'doctor\' AND u.is_approved = true ORDER BY u.created_at DESC;';
            } else if (currentUser && currentUser.role === 'patient') {
                const { rows: mems } = await db.query(
                    "SELECT organization_id FROM tenant_memberships WHERE user_id = $1 AND status = 'active' ORDER BY joined_at ASC LIMIT 1",
                    [currentUser.id]
                );
                if (mems.length > 0) {
                    query = 'SELECT id, name, email, role, organization_id as "organizationId", public_key as "publicKey", profile_photo as "profilePhoto", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE organization_id = $1 AND role = \'doctor\' AND is_approved = true ORDER BY created_at DESC;';
                    params = [mems[0].organization_id];
                } else {
                    return res.json([]);
                }
            } else {
                return res.status(401).json({ error: 'Authentication required to list doctors.' });
            }

            const { rows: doctors } = await db.query(query, params);
            const formatted = doctors.map(d => ({
                ...d,
                doctorProfile: parseJsonIfNeeded(d.doctorProfile)
            }));
            res.json(formatted);
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    const patientToken = jwt.sign({ id: patientId, role: 'patient', organization_id: org1Id }, JWT_SECRET);

    function request(path, headers = {}) {
        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port,
                path,
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
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
            req.end();
        });
    }

    try {
        // Test 1: Patient querying without explicit orgId -> defaults to patient's own clinic (Org 1)
        console.log('--- 1. Testing Patient Listing Doctors (Default Org Membership) ---');
        const res1 = await request('/api/users/doctors', {
            'Authorization': `Bearer ${patientToken}`
        });
        assert(res1.status === 200, 'Returns 200 OK');
        assert(Array.isArray(res1.body), 'Returns array of doctors');
        assert(res1.body.some(d => d.id === doc1Id), 'Contains Dr. One from patient facility (Org 1)');
        assert(!res1.body.some(d => d.id === doc2Id), 'Does NOT contain Dr. Two from other facility (Org 2)');

        // Test 2: Patient selecting specific hospital (e.g. Org 2 during multi-clinic booking)
        console.log('\n--- 2. Testing Patient Filtering Doctors by Selected Hospital OrgId ---');
        const res2 = await request(`/api/users/doctors?orgId=${org2Id}`, {
            'Authorization': `Bearer ${patientToken}`
        });
        assert(res2.status === 200, 'Returns 200 OK');
        assert(Array.isArray(res2.body), 'Returns array of doctors');
        assert(res2.body.some(d => d.id === doc2Id), 'Contains Dr. Two from selected facility (Org 2)');
        assert(!res2.body.some(d => d.id === doc1Id), 'Does NOT contain Dr. One from facility Org 1');

        // Test 3: Unauthenticated query rejected
        console.log('\n--- 3. Testing Unauthenticated Request without orgId ---');
        const res3 = await request('/api/users/doctors');
        assert(res3.status === 401, 'Unauthenticated query rejected with 401 Unauthorized');

    } finally {
        server.close();
        await db.query('DELETE FROM tenant_memberships WHERE organization_id IN ($1, $2)', [org1Id, org2Id]);
        await db.query('DELETE FROM users WHERE id IN ($1, $2, $3)', [doc1Id, doc2Id, patientId]);
        await db.query('DELETE FROM organizations WHERE id IN ($1, $2)', [org1Id, org2Id]);
        if (db.pool && db.pool.end) await db.pool.end();
    }

    console.log('\n======================================================');
    console.log(`  DOCTOR ORG FILTERING FINISHED: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');
    process.exit(failed > 0 ? 1 : 0);
}

runDoctorOrgFilterTests().catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
});
