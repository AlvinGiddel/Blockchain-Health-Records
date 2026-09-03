/**
 * Test Suite: Paystack Payment Idempotency & Fair Expiration Calculation
 * 
 * Tests:
 * 1. Idempotent execution: Only the first execution extends the license;
 *    the second execution (e.g. late webhook or duplicate verify) is a safe no-op.
 * 2. Fair expiration calculation: GREATEST(license_expires_at, NOW()) ensures
 *    early renewals add onto remaining time rather than losing remaining days.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../db');
const { processSuccessfulPayment } = require('../services/paymentHandler');

async function runIdempotencyAndExtensionTests() {
    console.log('================================================================');
    console.log('STARTING PAYMENT IDEMPOTENCY & FAIR EXTENSION TEST SUITE');
    console.log('================================================================\n');

    let testOrgId = null;
    let testUserId = null;
    const testReference = `test_bhc_${Date.now()}`;

    try {
        // 1. Fetch or create a test organization with an existing license expiring in 15 days
        const initialFutureExpiry = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days ahead

        const { rows: orgRows } = await db.pool.query(`
            INSERT INTO organizations (name, slug, status, license_expires_at)
            VALUES ($1, $2, 'active', $3)
            RETURNING id, name, license_expires_at;
        `, [`Test Hospital ${Date.now()}`, `test-hospital-${Date.now()}`, initialFutureExpiry]);

        const testOrg = orgRows[0];
        testOrgId = testOrg.id;
        console.log(`✓ Created test organization: "${testOrg.name}" with expiry in +15 days: ${testOrg.license_expires_at}`);

        // 2. Fetch any valid user ID for the payment FK
        const { rows: userRows } = await db.pool.query('SELECT id, email FROM users LIMIT 1');
        if (userRows.length === 0) {
            throw new Error('No user found in database to attach payment to.');
        }
        testUserId = userRows[0].id;

        // 3. Create a pending payment row for 30-day renewal
        await db.pool.query(`
            INSERT INTO payments (
                organization_id,
                user_id,
                reference,
                amount,
                amount_subunits,
                currency,
                purpose,
                plan_days,
                plan_name,
                status,
                customer_email
            ) VALUES ($1, $2, $3, 2500.00, 250000, 'KES', 'license_renewal', 30, 'Standard Monthly Renewal', 'pending', $4);
        `, [testOrgId, testUserId, testReference, userRows[0].email]);

        console.log(`✓ Created pending payment record with reference: ${testReference}`);

        // Mock blockchain ledger
        const mockBlockchain = {
            addPendingRecord: (payload) => {
                console.log('  [Blockchain Audit] Sealed payment audit payload:', payload.recordType, payload.paymentReference);
                return { hash: `0000test_tx_${Date.now()}` };
            },
            minePendingRecords: async () => true
        };

        // 4. FIRST CALL: Simulate user-initiated /api/payments/verify/:reference
        console.log('\n--- Test Step 1: First Execution (Client Verification) ---');
        const firstResult = await processSuccessfulPayment({
            reference: testReference,
            channel: 'mpesa',
            paystackResponse: { simulated: true, step: 'verify' },
            blockchainInstance: mockBlockchain
        });

        console.log('  First Result message:', firstResult.message);
        console.log('  First Result idempotentNoOp:', firstResult.idempotentNoOp);
        console.log('  New License Expiration:', firstResult.organization.license_expires_at);

        if (firstResult.idempotentNoOp !== false) {
            throw new Error('Expected first execution to be a live settlement, not a no-op!');
        }

        // Verify fair extension:
        // Expiry was +15 days from now; after adding 30 days, it should be approximately +45 days from now!
        const newExpiryMs = new Date(firstResult.organization.license_expires_at).getTime();
        const expectedMinExpiryMs = Date.now() + 43 * 24 * 60 * 60 * 1000;
        const expectedMaxExpiryMs = Date.now() + 46 * 24 * 60 * 60 * 1000;

        if (newExpiryMs < expectedMinExpiryMs || newExpiryMs > expectedMaxExpiryMs) {
            throw new Error(`Fair extension failed: Expiration ${firstResult.organization.license_expires_at} did not preserve remaining days!`);
        }
        console.log('✓ Fair extension verified: Expiration successfully advanced from +15 days to ~45 days (no remaining days lost).');

        // 5. SECOND CALL: Simulate asynchronous Paystack Webhook arriving afterwards
        console.log('\n--- Test Step 2: Second Execution (Duplicate / Late Webhook) ---');
        const secondResult = await processSuccessfulPayment({
            reference: testReference,
            channel: 'mpesa',
            paystackResponse: { simulated: true, step: 'webhook_replay' },
            blockchainInstance: mockBlockchain
        });

        console.log('  Second Result message:', secondResult.message);
        console.log('  Second Result idempotentNoOp:', secondResult.idempotentNoOp);
        console.log('  Second Expiration:', secondResult.organization.license_expires_at);

        if (secondResult.idempotentNoOp !== true) {
            throw new Error('Expected second execution to be recognized as an idempotent safe no-op!');
        }

        const secondExpiryMs = new Date(secondResult.organization.license_expires_at).getTime();
        if (secondExpiryMs !== newExpiryMs) {
            throw new Error('Double extension detected! Expiration date changed on the second call.');
        }
        console.log('✓ Idempotency verified: Duplicate webhook was a safe no-op. License was NOT double-extended.');

        // 6. Verify payments table state in DB
        const { rows: finalPaymentRows } = await db.pool.query(
            'SELECT status, channel, blockchain_tx_hash FROM payments WHERE reference = $1',
            [testReference]
        );
        console.log('\n--- Final Database Status ---');
        console.log('  Payment Status:', finalPaymentRows[0].status);
        console.log('  Payment Channel:', finalPaymentRows[0].channel);
        console.log('  Blockchain Tx Hash:', finalPaymentRows[0].blockchain_tx_hash);

        if (finalPaymentRows[0].status !== 'success') {
            throw new Error('Payment status in DB is not "success"!');
        }

        console.log('\n================================================================');
        console.log('ALL IDEMPOTENCY & EXTENSION TESTS PASSED PERFECTLY!');
        console.log('================================================================\n');

    } catch (err) {
        console.error('\n❌ Test failed with error:', err);
        process.exit(1);
    } finally {
        // Cleanup test data
        if (testOrgId) {
            await db.pool.query('DELETE FROM organizations WHERE id = $1', [testOrgId]).catch(() => {});
        }
        await db.pool.end();
    }
}

runIdempotencyAndExtensionTests();
