process.env.VERCEL = '1';
const http = require('http');
const app = require('../server');

async function runTests() {
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(5099, resolve));
    console.log('Test server listening on port 5099');

    const request = (path, method = 'GET', body = null) => {
        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: 'localhost',
                port: 5099,
                path,
                method,
                headers: {
                    'Content-Type': 'application/json'
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve({ status: res.statusCode, body: JSON.parse(data) });
                    } catch (e) {
                        resolve({ status: res.statusCode, body: data });
                    }
                });
            });
            req.on('error', reject);
            if (body) req.write(JSON.stringify(body));
            req.end();
        });
    };

    try {
        console.log('\n--- 1. Testing GET /api/auth/check-phone ---');
        const res1 = await request('/api/auth/check-phone?phone=0799999999');
        console.log('Status:', res1.status, 'Body:', res1.body);
        if (res1.status !== 200 || typeof res1.body.exists !== 'boolean') {
            throw new Error('Check phone test failed');
        }
        console.log('✅ Check phone endpoint verified!');

        console.log('\n--- 2. Testing POST /api/auth/login with empty body ---');
        const res2 = await request('/api/auth/login', 'POST', {});
        console.log('Status:', res2.status, 'Body:', res2.body);
        if (res2.status !== 400) {
            throw new Error('Login empty body validation failed');
        }
        console.log('✅ Login empty body validation verified!');

        console.log('\n--- 3. Testing POST /api/auth/login with invalid credentials ---');
        const res3 = await request('/api/auth/login', 'POST', { email: 'nonexistent_test_user@example.com', password: 'wrongpassword' });
        console.log('Status:', res3.status, 'Body:', res3.body);
        if (res3.status !== 401 || res3.body.error !== 'Invalid credentials.') {
            throw new Error('Login invalid credentials test failed');
        }
        console.log('✅ Login invalid credentials response verified!');

        console.log('\n--- 4. Testing POST /api/auth/register with illegal role ---');
        const res4 = await request('/api/auth/register', 'POST', { name: 'Test', email: 'test@test.com', password: 'password', role: 'admin' });
        console.log('Status:', res4.status, 'Body:', res4.body);
        if (res4.status !== 400) {
            throw new Error('Register illegal role test failed');
        }
        console.log('✅ Register role restriction verified!');

        console.log('\n--- 5. Testing GET /api/auth/break-glass/status (Requires Auth) ---');
        const res5 = await request('/api/auth/break-glass/status');
        console.log('Status:', res5.status, 'Body:', res5.body);
        if (res5.status !== 401) {
            throw new Error('Break glass status unauthenticated test failed');
        }
        console.log('✅ Break glass status auth guard verified (401)!');

        console.log('\n🎉 ALL 5 AUTH ROUTE INTEGRATION TESTS PASSED CLEANLY!\n');
    } finally {
        server.close();
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error('Test suite failure:', err);
    process.exit(1);
});
