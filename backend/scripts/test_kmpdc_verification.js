/**
 * Automated Verification Suite for KMPDC Off-Chain Medical License Verification
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../db');
const {
    validateLicenseFormat,
    calculateNameSimilarity,
    verifyKmpdcLicense
} = require('../services/kmpdcVerification');

async function runKmpdcTests() {
    console.log('======================================================');
    console.log('    RUNNING KMPDC MEDICAL LICENSE TEST SUITE          ');
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

    // Ensure test registry records exist in database
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
        VALUES 
            ('A12345', 'Dr. Alvin Giddel Mutuku', 'Medical Practitioner', 'Cardiology & Internal Medicine', 'active', 2026, 'Kenyatta National Hospital'),
            ('A45892', 'Dr. Jane Wanjiku Kamau', 'Medical Practitioner', 'General Surgery', 'active', 2026, 'Avenue Healthcare Nairobi'),
            ('B10234', 'Dr. Sarah Nyambura Ndungu', 'Dentist', 'Orthodontics & Dental Surgery', 'active', 2026, 'Upper Hill Medical Centre'),
            ('A99999', 'Dr. Suspended Practitioner Example', 'Medical Practitioner', 'General Practice', 'suspended', 2025, 'Revoked Practice Node')
        ON CONFLICT (license_number) DO UPDATE
        SET status = EXCLUDED.status;
    `);

    // --- TEST 1: Syntactic Format Regex Validation ---
    console.log('--- TEST 1: Syntactic Format Validation ---');
    assert(validateLicenseFormat('A12345') === true, 'A12345 is valid Medical format');
    assert(validateLicenseFormat('B10234') === true, 'B10234 is valid Dental format');
    assert(validateLicenseFormat('KMPDC-2026-A12') === true, 'KMPDC-2026-A12 is valid Certificate format');
    assert(validateLicenseFormat('12345') === false, 'Plain digits 12345 rejected');
    assert(validateLicenseFormat('DOCTOR_99') === false, 'Bogus string DOCTOR_99 rejected');
    assert(validateLicenseFormat('FAKE1234') === false, 'FAKE1234 rejected');

    // --- TEST 2: Fuzzy Name Similarity Matching ---
    console.log('\n--- TEST 2: Name Similarity Algorithm ---');
    const simExact = calculateNameSimilarity('Dr. Jane Wanjiku Kamau', 'Jane Wanjiku Kamau');
    assert(simExact >= 0.8, `Exact tokens match (Score: ${simExact.toFixed(2)})`);

    const simFuzzy = calculateNameSimilarity('Jane Kamau', 'Dr. Jane Wanjiku Kamau');
    assert(simFuzzy >= 0.6, `Omitted middle name match (Score: ${simFuzzy.toFixed(2)})`);

    const simMismatch = calculateNameSimilarity('Dr. Peter Otieno', 'Dr. Jane Wanjiku Kamau');
    assert(simMismatch < 0.3, `Completely different person (Score: ${simMismatch.toFixed(2)})`);

    // --- TEST 3: Full KMPDC Council Verification - Genuine Match ---
    console.log('\n--- TEST 3: Genuine Doctor Verification ---');
    const check1 = await verifyKmpdcLicense('A45892', 'Dr. Jane Wanjiku Kamau');
    assert(check1.verified === true, 'A45892 verified for Dr. Jane Wanjiku Kamau');
    assert(check1.record?.specialization === 'General Surgery', 'Returns registered specialization');
    assert(check1.record?.facility === 'Avenue Healthcare Nairobi', 'Returns registered hospital facility');

    // --- TEST 4: Genuine Dentist Verification ---
    console.log('\n--- TEST 4: Genuine Dentist Verification ---');
    const checkDentist = await verifyKmpdcLicense('B10234', 'Sarah Ndungu');
    assert(checkDentist.verified === true, 'B10234 verified for Sarah Ndungu');
    assert(checkDentist.record?.cadre === 'Dentist', 'Recognized Dentist cadre');

    // --- TEST 5: Fake / Unregistered License Number ---
    console.log('\n--- TEST 5: Non-Existent License Number ---');
    const checkFake = await verifyKmpdcLicense('A77777', 'Dr. John Doe');
    assert(checkFake.verified === false, 'A77777 rejected because it is not in council register');

    // --- TEST 6: Identity Theft / Mismatched Name Prevention ---
    console.log('\n--- TEST 6: Identity Theft Prevention (License Hijacking) ---');
    const checkHijack = await verifyKmpdcLicense('A45892', 'Dr. Kevin Kiprotich');
    assert(checkHijack.verified === false, 'Rejected Kevin Kiprotich trying to use Jane Kamau license A45892');
    assert(checkHijack.error?.includes('Identity Mismatch'), 'Explicit Identity Mismatch error returned');

    // --- TEST 7: Suspended Practitioner License ---
    console.log('\n--- TEST 7: Suspended Practitioner License ---');
    const checkSuspended = await verifyKmpdcLicense('A99999', 'Dr. Suspended Practitioner Example');
    assert(checkSuspended.verified === false, 'Suspended license A99999 rejected');
    assert(checkSuspended.error?.includes('SUSPENDED'), 'Explicit SUSPENDED status error returned');

    console.log('\n======================================================');
    console.log(`  RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('======================================================');

    process.exit(failed > 0 ? 1 : 0);
}

runKmpdcTests().catch(err => {
    console.error('KMPDC Test suite error:', err);
    process.exit(1);
});
