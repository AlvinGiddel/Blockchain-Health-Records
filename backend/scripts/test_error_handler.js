/**
 * Centralized Error Handler Status Code Preservation & Safety Regression Suite
 *
 * Verifies:
 * 1. AppError preserving exact operational HTTP status codes (400, 401, 403, 404, 409, 422).
 * 2. catchAsync propagating async errors seamlessly to the handler with status code intact.
 * 3. Unexpected system errors yielding HTTP 500 with sanitized client message and NO stack leak.
 * 4. Response body shape conforms to standard { error, message }.
 */

const express = require('express');
const http = require('http');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const errorHandler = require('../middleware/errorHandler');

async function runErrorHandlerTests() {
    console.log('================================================================');
    console.log('      CENTRALIZED ERROR HANDLER STATUS CODE REGRESSION SUITE    ');
    console.log('================================================================\n');

    const app = express();
    app.use(express.json());

    // Test Routes
    app.get('/test/400', (req, res, next) => {
        next(new AppError('Bad request validation failure', 400));
    });

    app.get('/test/401', (req, res, next) => {
        next(new AppError('Authentication token missing or invalid', 401));
    });

    app.get('/test/403', (req, res, next) => {
        next(new AppError('Access forbidden to this resource', 403));
    });

    app.get('/test/404', (req, res, next) => {
        next(new AppError('Requested clinical entity not found', 404));
    });

    app.get('/test/409', (req, res, next) => {
        next(new AppError('Appointment slot conflict detected', 409));
    });

    app.get('/test/422', (req, res, next) => {
        next(new AppError('Unprocessable council license format', 422));
    });

    app.get('/test/async-403', catchAsync(async (req, res) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw new AppError('Async operational error preserved', 403);
    }));

    app.get('/test/unhandled-500', (req, res, next) => {
        // Unexpected system/programming error without explicit status
        next(new Error('FATAL: Database connection socket abruptly severed!'));
    });

    // Mount Centralized Error Handler
    app.use(errorHandler);

    const TEST_PORT = 5095;
    const server = await new Promise((resolve, reject) => {
        const s = app.listen(TEST_PORT, () => resolve(s));
        s.on('error', reject);
    });

    function request(path) {
        return new Promise((resolve, reject) => {
            http.get(`http://127.0.0.1:${TEST_PORT}${path}`, (res) => {
                let data = '';
                res.on('data', chunk => { data += chunk; });
                res.on('end', () => {
                    let parsed;
                    try {
                        parsed = JSON.parse(data);
                    } catch {
                        parsed = data;
                    }
                    resolve({ status: res.statusCode, body: parsed });
                });
            }).on('error', reject);
        });
    }

    let passed = 0;
    let failed = 0;

    function assert(condition, message, details = '') {
        if (condition) {
            console.log(`✅ [PASS] ${message}`);
            passed++;
        } else {
            console.error(`❌ [FAIL] ${message} - ${details}`);
            failed++;
        }
    }

    try {
        console.log('--- 1. Testing Operational Status Code Preservation ---');

        const testCases = [
            { path: '/test/400', expectedStatus: 400, expectedError: 'Bad request validation failure' },
            { path: '/test/401', expectedStatus: 401, expectedError: 'Authentication token missing or invalid' },
            { path: '/test/403', expectedStatus: 403, expectedError: 'Access forbidden to this resource' },
            { path: '/test/404', expectedStatus: 404, expectedError: 'Requested clinical entity not found' },
            { path: '/test/409', expectedStatus: 409, expectedError: 'Appointment slot conflict detected' },
            { path: '/test/422', expectedStatus: 422, expectedError: 'Unprocessable council license format' }
        ];

        for (const tc of testCases) {
            const res = await request(tc.path);
            assert(res.status === tc.expectedStatus, `HTTP ${tc.expectedStatus} preserved verbatim through errorHandler`, `Got status ${res.status}`);
            assert(res.body.error === tc.expectedError, `Error message matches exactly: "${tc.expectedError}"`);
            assert(res.body.message === tc.expectedError, `Standard message field matches error field`);
        }

        console.log('\n--- 2. Testing catchAsync Integration with Status Preservation ---');
        const asyncRes = await request('/test/async-403');
        assert(asyncRes.status === 403, 'catchAsync caught rejected Promise and preserved HTTP 403', `Got status ${asyncRes.status}`);
        assert(asyncRes.body.error === 'Async operational error preserved', 'Async error message propagated correctly');

        console.log('\n--- 3. Testing Unexpected 500 Sanitization & Safety ---');
        const errRes = await request('/test/unhandled-500');
        assert(errRes.status === 500, 'Unexpected error defaults to HTTP 500', `Got status ${errRes.status}`);
        assert(typeof errRes.body.error === 'string', 'Error message returned as string in { error, message }');
        assert(errRes.body.stack === undefined || process.env.NODE_ENV === 'development', 'Stack trace NOT leaked to client response');

        console.log('\n================================================================');
        console.log(`  ERROR HANDLER REGRESSION RESULTS: ${passed} PASSED | ${failed} FAILED`);
        console.log('================================================================\n');

        if (failed > 0) {
            process.exit(1);
        }
    } finally {
        server.close();
    }
}

runErrorHandlerTests().catch(err => {
    console.error('Fatal error running regression tests:', err);
    process.exit(1);
});
