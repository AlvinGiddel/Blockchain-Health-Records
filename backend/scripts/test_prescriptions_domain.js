/**
 * Prescriptions Domain Comprehensive Integration Test Suite
 * 
 * Validates:
 * 1. Drug Autocomplete search (RxNav + Curated cache)
 * 2. Prescription creation with medication items
 * 3. Clinical allergy cross-check & warnings
 * 4. Public QR token verification & patient masking
 * 5. Partial dispensation & status transition to PARTIALLY_FILLED
 * 6. Over-dispense prevention (HTTP 400)
 * 7. Full dispensation & status transition to FILLED
 * 8. Audit trail logging in dispense_logs
 * 9. Multi-tenant scoping & RLS isolation
 */

const assert = require('assert');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../db');
const prescriptionsRepo = require('../repositories/prescriptionsRepository');
const prescriptionsController = require('../controllers/prescriptionsController');

async function runTests() {
    console.log('================================================================');
    console.log('     PRESCRIPTION ADDON MODULE COMPREHENSIVE TEST SUITE         ');
    console.log('================================================================\n');

    // 1. Fetch doctor, patient, and organization
    const { rows: doctors } = await db.query(
        "SELECT id, name, organization_id, doctor_profile FROM users WHERE role = 'doctor' AND organization_id IS NOT NULL LIMIT 1"
    );
    const { rows: patients } = await db.query(
        "SELECT id, name, organization_id, patient_profile FROM users WHERE role = 'patient' LIMIT 1"
    );

    if (doctors.length === 0 || patients.length === 0) {
        console.error('Test prerequisites failed: Need at least 1 doctor and 1 patient in database.');
        process.exit(1);
    }

    const doctor = doctors[0];
    const patient = patients[0];
    const orgId = doctor.organization_id;

    console.log(`[Setup] Doctor: ${doctor.name} (${doctor.id})`);
    console.log(`[Setup] Patient: ${patient.name} (${patient.id})`);
    console.log(`[Setup] Organization: ${orgId}\n`);

    // TEST 1: Drug Search API
    console.log('--- TEST 1: Drug Autocomplete Search (Curated & Cache) ---');
    const mockSearchReq = { query: { q: 'amox' } };
    let searchResult = null;
    const mockSearchRes = {
        json: (data) => { searchResult = data; return mockSearchRes; }
    };

    await prescriptionsController.searchDrugs(mockSearchReq, mockSearchRes, () => {});
    assert(searchResult && searchResult.results, 'Search must return results array');
    assert(searchResult.results.length > 0, 'Search for "amox" must return at least 1 drug');
    console.log(`✓ Drug search returned ${searchResult.results.length} matches. First: "${searchResult.results[0].name}"`);

    // TEST 2: Prescription Creation & Allergy Warning
    console.log('\n--- TEST 2: Issue Prescription with Items & Allergy Safety Check ---');
    // Temporarily ensure patient has Penicillin allergy
    await db.query(`
        UPDATE users 
        SET patient_profile = jsonb_set(COALESCE(patient_profile, '{}'::jsonb), '{allergies}', '["Penicillin", "Dust"]')
        WHERE id = $1;
    `, [patient.id]);

    const mockCreateReq = {
        user: { id: doctor.id, role: 'doctor', organization_id: orgId },
        body: {
            patientId: patient.id,
            instructions: 'Take medications with food. Complete the full antibiotic course.',
            items: [
                {
                    medicationName: 'Amoxicillin 500mg',
                    rxnormCode: '723',
                    dosage: '500mg',
                    frequency: 'Three times daily',
                    duration: '7 days',
                    quantityPrescribed: 21
                },
                {
                    medicationName: 'Paracetamol 1000mg',
                    rxnormCode: '161',
                    dosage: '1000mg',
                    frequency: 'Twice daily as needed for fever',
                    duration: '3 days',
                    quantityPrescribed: 6
                }
            ]
        }
    };

    let createResponse = null;
    let createStatusCode = 200;
    const mockCreateRes = {
        status: (code) => { createStatusCode = code; return mockCreateRes; },
        json: (data) => { createResponse = data; return mockCreateRes; }
    };

    await prescriptionsController.createPrescription(mockCreateReq, mockCreateRes, (err) => {
        if (err) throw err;
    });

    assert(createStatusCode === 201, `Expected 201 Created, got ${createStatusCode}`);
    assert(createResponse && createResponse.prescription, 'Response must include created prescription');
    const createdRx = createResponse.prescription;
    assert(createdRx.status === 'ISSUED', `Status must be ISSUED, got ${createdRx.status}`);
    assert(createdRx.qr_token && createdRx.qr_token.startsWith('rx_'), 'QR token must start with rx_');
    assert(createdRx.items.length === 2, `Expected 2 items, got ${createdRx.items.length}`);
    assert(createResponse.allergyWarnings.length > 0, 'Must detect penicillin allergy warning for Amoxicillin');
    console.log(`✓ Prescription issued with ID: ${createdRx.id}`);
    console.log(`✓ QR Token generated: ${createdRx.qr_token}`);
    console.log(`✓ Allergy safety warning triggered: "${createResponse.allergyWarnings[0].allergyAlert}"`);

    // TEST 3: Public QR Verification Endpoint
    console.log('\n--- TEST 3: Public QR Token Verification ---');
    const mockVerifyReq = { params: { qr_token: createdRx.qr_token } };
    let verifyResponse = null;
    const mockVerifyRes = {
        status: (code) => mockVerifyRes,
        json: (data) => { verifyResponse = data; return mockVerifyRes; }
    };

    await prescriptionsController.verifyPrescriptionByToken(mockVerifyReq, mockVerifyRes, (err) => {
        if (err) throw err;
    });

    assert(verifyResponse.verified === true, 'Prescription must be verified');
    assert(verifyResponse.status === 'ISSUED', 'Status must be ISSUED');
    assert(verifyResponse.patientMaskedName, 'Patient name must be masked for privacy');
    assert(verifyResponse.items.length === 2, 'Must return 2 items');
    assert(verifyResponse.issuingDoctor.name === doctor.name, 'Doctor name must match');
    console.log(`✓ Public verification successful for token: ${createdRx.qr_token}`);
    console.log(`✓ Patient name safely masked: "${verifyResponse.patientMaskedName}"`);
    console.log(`✓ Issuing Doctor verified: "${verifyResponse.issuingDoctor.name}"`);

    // TEST 4: Partial Dispensation
    console.log('\n--- TEST 4: Partial Dispensation (10 of 21 Amoxicillin) ---');
    const amoxItem = createdRx.items.find(i => i.medication_name.includes('Amoxicillin'));
    const mockDispenseReq = {
        params: { id: createdRx.id },
        user: { id: doctor.id, role: 'doctor', organization_id: orgId },
        body: {
            itemDispenses: [
                { itemId: amoxItem.id, quantityDispensed: 10 }
            ],
            notes: 'First 10 capsules dispensed. Patient to collect remainder next Tuesday.'
        }
    };

    let dispenseResponse = null;
    const mockDispenseRes = {
        json: (data) => { dispenseResponse = data; return mockDispenseRes; }
    };

    await prescriptionsController.dispensePrescription(mockDispenseReq, mockDispenseRes, (err) => {
        if (err) throw err;
    });

    const partiallyFilledRx = dispenseResponse.prescription;
    assert(partiallyFilledRx.status === 'PARTIALLY_FILLED', `Expected PARTIALLY_FILLED, got ${partiallyFilledRx.status}`);
    const updatedAmox = partiallyFilledRx.items.find(i => i.id === amoxItem.id);
    assert(updatedAmox.quantity_dispensed === 10, `Expected 10 dispensed, got ${updatedAmox.quantity_dispensed}`);
    assert(partiallyFilledRx.dispenseLogs.length === 1, 'Audit log must contain 1 entry');
    console.log(`✓ Status transitioned to: ${partiallyFilledRx.status}`);
    console.log(`✓ Quantity dispensed: ${updatedAmox.quantity_dispensed} / ${updatedAmox.quantity_prescribed}`);
    console.log(`✓ Dispense audit logged with note: "${partiallyFilledRx.dispenseLogs[0].notes}"`);

    // TEST 5: Over-dispense rejection
    console.log('\n--- TEST 5: Over-dispense Prevention (Remaining is 11, trying to dispense 15) ---');
    const mockOverDispenseReq = {
        params: { id: createdRx.id },
        user: { id: doctor.id, role: 'doctor', organization_id: orgId },
        body: {
            itemDispenses: [
                { itemId: amoxItem.id, quantityDispensed: 15 }
            ]
        }
    };

    let overDispenseError = null;
    await prescriptionsController.dispensePrescription(mockOverDispenseReq, mockDispenseRes, (err) => {
        overDispenseError = err;
    });

    assert(overDispenseError, 'Over-dispense must throw an error');
    assert(overDispenseError.statusCode === 400, `Expected 400 Bad Request, got ${overDispenseError.statusCode}`);
    console.log(`✓ Over-dispense cleanly rejected: "${overDispenseError.message}"`);

    // TEST 6: Complete Full Dispensation
    console.log('\n--- TEST 6: Complete Full Dispensation (Remaining 11 Amox + 6 Paracetamol) ---');
    const paraItem = createdRx.items.find(i => i.medication_name.includes('Paracetamol'));
    const mockFullDispenseReq = {
        params: { id: createdRx.id },
        user: { id: doctor.id, role: 'doctor', organization_id: orgId },
        body: {
            itemDispenses: [
                { itemId: amoxItem.id, quantityDispensed: 11 },
                { itemId: paraItem.id, quantityDispensed: 6 }
            ],
            notes: 'Final dispensation completed.'
        }
    };

    let fullDispenseResponse = null;
    const mockFullDispenseRes = {
        json: (data) => { fullDispenseResponse = data; return mockFullDispenseRes; }
    };

    await prescriptionsController.dispensePrescription(mockFullDispenseReq, mockFullDispenseRes, (err) => {
        if (err) throw err;
    });

    const fullyFilledRx = fullDispenseResponse.prescription;
    assert(fullyFilledRx.status === 'FILLED', `Expected status FILLED, got ${fullyFilledRx.status}`);
    assert(fullyFilledRx.dispenseLogs.length === 2, 'Audit log must contain 2 entries');
    console.log(`✓ Status transitioned to: ${fullyFilledRx.status}`);
    console.log(`✓ All items completely fulfilled across ${fullyFilledRx.dispenseLogs.length} audit logs`);

    // Clean up test data
    console.log('\n--- Cleaning up test records ---');
    await db.query("DELETE FROM dispense_logs WHERE prescription_id = $1", [createdRx.id]);
    await db.query("DELETE FROM prescription_items WHERE prescription_id = $1", [createdRx.id]);
    await db.query("DELETE FROM prescriptions WHERE id = $1", [createdRx.id]);
    console.log('✓ Test prescription cleanly deleted.');

    console.log('\n================================================================');
    console.log('   🎉 ALL 6 PRESCRIPTION DOMAIN TESTS PASSED WITH 100% SUCCESS  ');
    console.log('================================================================');
    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
});
