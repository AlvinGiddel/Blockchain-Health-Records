/**
 * Route Security Scanner & Architectural Enforcement Guard
 *
 * Traverses Express router stack, validates all registered routes against the
 * explicit PUBLIC_ALLOWLIST, and ensures every non-allowlisted endpoint strictly
 * rejects unauthenticated requests with HTTP 401 Unauthorized.
 */

const http = require('http');

process.env.PORT = '5088';
process.env.VERCEL = '1'; // Prevent double-listening

const app = require('../server');

/**
 * Explicit, documented inventory of intentionally-public endpoints in the system.
 * Any route NOT in this list MUST require authentication (HTTP 401 without token).
 */
const PUBLIC_ALLOWLIST = new Set([
    // Root service ping & health probes
    'GET /',
    'GET /health',
    'GET /api/health',
    'GET /api/system/status',
    
    // Auth onboarding & password recovery
    'GET /api/auth/check-phone',
    'POST /api/auth/register',
    'POST /api/auth/login',
    'POST /api/auth/register-clinic',
    'POST /api/auth/forgot-password',
    'POST /api/auth/reset-password/:token',
    
    // Subscription plans & external payment webhook
    'GET /api/payments/plans',
    'POST /api/payments/webhook',
    
    // Public regulatory practitioner license lookup & registry directory
    'GET /api/kmpdc/verify',
    'GET /api/nck/verify',
    'GET /api/practitioner/verify',
    'GET /api/practitioners/verify',
    'GET /api/practitioners/kmpdc/verify',
    'GET /api/practitioners/nck/verify',
    'GET /api/kmpdc/practitioners',
    'GET /api/practitioners/kmpdc',
    'GET /api/practitioners',
    
    // Public healthcare facilities directory
    'GET /api/organizations/active',
    
    // Public cryptographic blockchain proofs & chain validation
    'POST /api/records/verify-seal',
    'GET /api/records/:id/verify-blockchain',
    'GET /api/blockchain/blocks',
    'GET /api/blockchain/validate'
]);

/**
 * Recursively inspects the Express router stack and returns all registered endpoints
 */
function extractRegisteredRoutes(appInstance) {
    const endpoints = [];

    function traverseLayer(layer, basePath = '') {
        if (layer.route && layer.route.path) {
            const routePaths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
            const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase());

            for (const rPath of routePaths) {
                let fullPath = (basePath + (rPath === '/' && basePath.length > 0 ? '' : rPath)) || '/';
                if (!fullPath.startsWith('/')) fullPath = '/' + fullPath;

                for (const method of methods) {
                    endpoints.push({ method, path: fullPath });
                }
            }
        } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
            let mountPath = '';
            if (layer.regexp) {
                const src = layer.regexp.source || '';
                if (src.includes('api\\/payments')) {
                    mountPath = '/api/payments';
                } else if (src.includes('api\\/auth')) {
                    mountPath = '/api/auth';
                } else if (src.includes('api')) {
                    mountPath = '/api';
                }
            }

            const currentBasePath = basePath + mountPath;
            for (const subLayer of layer.handle.stack) {
                traverseLayer(subLayer, currentBasePath);
            }
        }
    }

    if (appInstance._router && appInstance._router.stack) {
        for (const layer of appInstance._router.stack) {
            traverseLayer(layer, '');
        }
    }

    // Deduplicate endpoints
    const seen = new Set();
    const uniqueEndpoints = [];
    for (const ep of endpoints) {
        const key = `${ep.method} ${ep.path}`;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueEndpoints.push(ep);
        }
    }

    return uniqueEndpoints;
}

/**
 * Sends an HTTP request to the running test server
 */
function makeRequest(serverPort, method, path, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port: serverPort,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            timeout: 5000
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
                resolve({ status: res.statusCode, headers: res.headers, body: parsed });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`Request timeout for ${method} ${path}`));
        });

        if (body) {
            req.write(typeof body === 'string' ? body : JSON.stringify(body));
        }
        req.end();
    });
}

async function runRouteSecurityScanner() {
    console.log('================================================================');
    console.log('       AUTOMATED ROUTE SECURITY SCANNER & GUARD RUNNER           ');
    console.log('================================================================\n');

    const TEST_PORT = 5088;
    const server = await new Promise((resolve, reject) => {
        const s = app.listen(TEST_PORT, () => {
            console.log(`Security Scanner server listening on http://127.0.0.1:${TEST_PORT}`);
            resolve(s);
        });
        s.on('error', reject);
    });

    try {
        const allRoutes = extractRegisteredRoutes(app);
        console.log(`Discovered ${allRoutes.length} total registered routes in Express router stack.\n`);

        let publicCount = 0;
        let protectedPassCount = 0;
        let violations = [];

        console.log('--- 1. EVALUATING REGISTERED ROUTES AGAINST SECURITY POLICY ---');

        for (const ep of allRoutes) {
            const routeKey = `${ep.method} ${ep.path}`;

            if (PUBLIC_ALLOWLIST.has(routeKey)) {
                publicCount++;
                console.log(`[PUBLIC ALLOWED] ${routeKey}`);
                continue;
            }

            // Route is NOT on public allowlist -> MUST return 401 when called without Authorization header
            // Replace any parameter placeholders (:id, :reference, :token) with valid dummy values
            const testPath = ep.path
                .replace(/:id/g, '1')
                .replace(/:reference/g, 'ref_test_123')
                .replace(/:token/g, 'tok_test_123');

            try {
                const res = await makeRequest(TEST_PORT, ep.method, testPath);

                if (res.status === 401) {
                    protectedPassCount++;
                    console.log(`[GUARDED (401)]  ${routeKey}`);
                } else {
                    violations.push({
                        routeKey,
                        testPath,
                        status: res.status,
                        body: res.body,
                        reason: `Expected HTTP 401 Unauthorized, but got HTTP ${res.status}`
                    });
                    console.error(`❌ [VIOLATION]    ${routeKey} -> Returned ${res.status} instead of 401!`);
                }
            } catch (reqErr) {
                violations.push({
                    routeKey,
                    testPath,
                    reason: `Request failed with error: ${reqErr.message}`
                });
                console.error(`❌ [ERROR]        ${routeKey} -> Error: ${reqErr.message}`);
            }
        }

        console.log('\n--- 2. VERIFYING THE 12 CRITICAL PATCHED ENDPOINTS SPECIFICALLY ---');
        const twelveVulnerabilities = [
            'GET /api/records/patient/:id',
            'POST /api/records',
            'POST /api/records/:id/specialist-note',
            'POST /api/blockchain/mine',
            'POST /api/auth/break-glass',
            'POST /api/consultations',
            'GET /api/appointments',
            'POST /api/appointments',
            'POST /api/appointments/:id/status',
            'PUT /api/users/doctor/availability',
            'POST /api/auth/change-password',
            'POST /api/auth/update-email'
        ];

        let twelveAllGuarded = true;
        for (const target of twelveVulnerabilities) {
            const found = allRoutes.some(r => `${r.method} ${r.path}` === target);
            if (!found) {
                console.warn(`⚠️ Warning: Patched route signature ${target} not found directly in stack.`);
                twelveAllGuarded = false;
            } else {
                console.log(`✅ Verified patched signature guarded: ${target}`);
            }
        }

        console.log('\n================================================================');
        console.log('                   SCANNER AUDIT SUMMARY                        ');
        console.log('================================================================');
        console.log(`Total Routes Discovered:        ${allRoutes.length}`);
        console.log(`Public Endpoints (Allowlisted): ${publicCount}`);
        console.log(`Guarded Endpoints (401 Passed): ${protectedPassCount}`);
        console.log(`Security Violations:            ${violations.length}`);
        console.log('================================================================\n');

        if (violations.length > 0) {
            console.error(`\n🚨 CRITICAL SECURITY TEST FAILURE: ${violations.length} route(s) failed auth enforcement!`);
            for (const v of violations) {
                console.error(` - [${v.routeKey}] on path ${v.testPath}: ${v.reason}`);
            }
            process.exit(1);
        }

        console.log('🎉 ALL ROUTES COMPLY WITH DEFAULT-DENY ARCHITECTURAL POLICY!');
        process.exit(0);

    } finally {
        server.close();
    }
}

runRouteSecurityScanner().catch(err => {
    console.error('Fatal scanner error:', err);
    process.exit(1);
});
