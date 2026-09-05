const http = require('http');
const express = require('express');
const practitionerRoutes = require('../routes/practitioners');
const db = require('../db');

async function runPractitionerRouteTests() {
    console.log('======================================================');
    console.log('   RUNNING PRACTITIONER DOMAIN ROUTE TEST SUITE       ');
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

    // Ensure sample practitioner exists in kmpdc_registry
    await db.query(`
        CREATE TABLE IF NOT EXISTS kmpdc_registry (
            license_number VARCHAR(50) PRIMARY KEY,
            full_name VARCHAR(255) NOT NULL,
            cadre VARCHAR(100) NOT NULL DEFAULT 'Medical Practitioner',
            specialization VARCHAR(255) DEFAULT 'General Medicine',
            status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired')),
            retention_year INTEGER DEFAULT 2026,
            facility VARCHAR(255) DEFAULT 'National Health Service',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            last_verified_at TIMESTAMPTZ DEFAULT NOW()
        );
        INSERT INTO kmpdc_registry (license_number, full_name, cadre, specialization, status, retention_year, facility)
        VALUES ('A12345', 'Dr. Alvin Giddel Mutuku', 'Medical Practitioner', 'Cardiology & Internal Medicine', 'active', 2026, 'Kenyatta National Hospital')
        ON CONFLICT (license_number) DO UPDATE
        SET full_name = EXCLUDED.full_name, status = 'active';
    `);

    // Set up test server
    const app = express();
    app.use(express.json());
    app.use('/api', practitionerRoutes);

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
        // Test 1: Missing license query parameter
        console.log('--- 1. Testing GET /api/kmpdc/verify without license ---');
        const res1 = await request('/api/kmpdc/verify');
        assert(res1.status === 400, 'Returns 400 Bad Request');
        assert(res1.body.error && res1.body.error.includes('License query parameter is required'), 'Error message prompts for license');

        // Test 2: Valid KMPDC Doctor verification
        console.log('\n--- 2. Testing GET /api/kmpdc/verify with valid license ---');
        const res2 = await request('/api/kmpdc/verify?license=A12345&name=Dr.+Alvin+Giddel+Mutuku');
        assert(res2.status === 200, 'Returns 200 OK');
        assert(res2.body.valid === true, 'Returns valid: true');
        assert(res2.body.practitioner && res2.body.practitioner.fullName.includes('Alvin'), 'Returns registered practitioner record');

        // Test 3: Invalid license format rejection
        console.log('\n--- 3. Testing GET /api/kmpdc/verify with bogus license ---');
        const res3 = await request('/api/kmpdc/verify?license=INVALID999');
        assert(res3.status === 422, 'Returns 422 Unprocessable Entity');
        assert(res3.body.valid === false, 'Returns valid: false');

        // Test 4: Unified Practitioner verification endpoint
        console.log('\n--- 4. Testing GET /api/practitioner/verify ---');
        const res4 = await request('/api/practitioner/verify?license=A12345&name=Dr.+Alvin+Giddel+Mutuku&cadre=doctor');
        assert(res4.status === 200, 'Returns 200 OK');
        assert(res4.body.valid === true, 'Returns valid: true');
        assert(res4.body.regulator === 'KMPDC', 'Identified regulator as KMPDC');

        // Test 5: Master KMPDC Practitioners Register listing
        console.log('\n--- 5. Testing GET /api/kmpdc/practitioners ---');
        const res5 = await request('/api/kmpdc/practitioners');
        assert(res5.status === 200, 'Returns 200 OK');
        assert(res5.body.success === true, 'Returns success: true');
        assert(Array.isArray(res5.body.practitioners), 'Returns practitioners array');

        // Test 6: Super Admin POST without auth token
        console.log('\n--- 6. Testing POST /api/kmpdc/practitioners unauthorized ---');
        const res6 = await request('/api/kmpdc/practitioners', {
            method: 'POST',
            body: { licenseNumber: 'A99000', fullName: 'Dr. Test' }
        });
        assert(res6.status === 401, 'Returns 401 Unauthorized without token');

        // Test 7: Unified namespace alias
        console.log('\n--- 7. Testing Alias GET /api/practitioners ---');
        const res7 = await request('/api/practitioners');
        assert(res7.status === 200, 'Alias /api/practitioners returns 200 OK');
        assert(res7.body.success === true, 'Returns success: true');

    } finally {
        server.close();
        if (db.pool && db.pool.end) {
            await db.pool.end();
        }
    }

    console.log('\n======================================================');
    console.log(`  PRACTITIONER TEST SUITE FINISHED: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================\n');
    process.exit(failed > 0 ? 1 : 0);
}

runPractitionerRouteTests().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
