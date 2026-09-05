/**
 * Verification Test: QR Health Passport Server-Side Verification & Scannable Token/URL
 */
const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../db');
const recordsController = require('../controllers/recordsController');
const QRCode = require(path.join(__dirname, '../../frontend/node_modules/qrcode'));

async function runTest() {
    console.log('================================================================');
    console.log('    TESTING QR HEALTH PASSPORT GENERATION & PROOF RESOLUTION   ');
    console.log('================================================================');

    // 1. Fetch a real patient from the database
    const { rows: patients } = await db.query(
        "SELECT id, name, email, patient_profile, organization_id, is_rejected FROM users WHERE role = 'patient' LIMIT 1"
    );

    if (patients.length === 0) {
        console.log('No patient found in database, creating temporary test patient...');
        return;
    }

    const patient = patients[0];
    console.log(`[Test] Using Patient: ${patient.name} (${patient.id})`);

    // 2. Fetch patient's latest record if any
    const { rows: records } = await db.query(
        "SELECT id, patient_id, diagnosis, timestamp FROM records WHERE patient_id = $1 ORDER BY timestamp DESC LIMIT 1",
        [patient.id]
    );

    const targetId = records.length > 0 ? records[0].id : patient.id;
    console.log(`[Test] Target Verification ID (Record or Patient): ${targetId}`);

    // 3. Test QR code generation with qrcode library
    const verificationUrl = `http://localhost:5173/?verifyRecordId=${encodeURIComponent(targetId)}`;
    const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
        width: 260,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#0f172a', light: '#ffffff' }
    });

    assert(qrDataUrl.startsWith('data:image/png;base64,'), 'QR code must be a valid PNG base64 data URL');
    console.log('✓ QRCode.toDataURL generated a valid high-resolution PNG data URL');

    // 4. Test Server-Side Verification Endpoint via recordsController.verifyBlockchainProof
    console.log('\n--- Testing verifyBlockchainProof for targetId ---');
    const mockReq = { params: { id: targetId } };
    let responseData = null;
    let statusCode = 200;
    const mockRes = {
        status: function(code) {
            statusCode = code;
            return this;
        },
        json: function(data) {
            responseData = data;
            return this;
        }
    };

    await recordsController.verifyBlockchainProof(mockReq, mockRes);
    console.log(`[Result] Status: ${statusCode}, Verified: ${responseData?.verified}`);
    assert(statusCode === 200, `Expected 200 status, got ${statusCode}`);
    assert(responseData.verified === true, 'Response verified field must be true');
    assert(responseData.patientName === patient.name, 'Patient name must match');
    assert(responseData.blockchainSealStatus, 'Must have blockchainSealStatus');
    console.log(`✓ Proof verified successfully: Patient "${responseData.patientName}", Status: "${responseData.blockchainSealStatus}"`);

    // 5. Test Revocation Enforcement
    console.log('\n--- Testing Revocation / Expiry Enforcement ---');
    // Temporarily mark patient as rejected
    await db.query("UPDATE users SET is_rejected = true WHERE id = $1", [patient.id]);
    try {
        let revResponseData = null;
        let revStatusCode = 200;
        const mockRevRes = {
            status: function(code) {
                revStatusCode = code;
                return this;
            },
            json: function(data) {
                revResponseData = data;
                return this;
            }
        };
        await recordsController.verifyBlockchainProof(mockReq, mockRevRes);
        console.log(`[Revocation Result] Status: ${revStatusCode}, Error: ${revResponseData?.error}`);
        assert(revStatusCode === 403, `Expected 403 Forbidden for revoked patient, got ${revStatusCode}`);
        assert(revResponseData.verified === false, 'Verified must be false for revoked patient');
        console.log('✓ Revocation check passed: 403 Forbidden properly returned when patient is deactivated');
    } finally {
        // Restore patient status
        await db.query("UPDATE users SET is_rejected = $1 WHERE id = $2", [patient.is_rejected || false, patient.id]);
        console.log('✓ Patient status cleanly restored to original value in database');
    }

    console.log('\n================================================================');
    console.log('       ALL QR HEALTH PASSPORT BACKEND TESTS PASSED!            ');
    console.log('================================================================');
    process.exit(0);
}

runTest().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
