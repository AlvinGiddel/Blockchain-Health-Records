/**
 * Prescriptions Domain Comprehensive Integration Test Suite
 * 
 * Validates:
 * 1. Drug Autocomplete search (RxNav + Curated cache)
 * 2. Treating-relationship rejection (HTTP 403 when no appointment/break-glass)
 * 3. Allergy contraindication hard block (HTTP 400 without override)
 * 4. Allergy contraindication success with clinical override justification (HTTP 201)
 * 5. Tiered QR disclosure:
 *    - Anonymous scan: Redacted medication posology (medicationsRestricted: true)
 *    - Patient challenge / Provider unlock: Full posology revealed (medicationsRestricted: false)
 * 6. Patient role rejection on dispense (HTTP 403)
 * 7. Patient role rejection on cancel (HTTP 403)
 * 8. Partial dispensation & status transition to PARTIALLY_FILLED
 * 9. Over-dispense prevention (HTTP 400)
 * 10. Full dispensation & status transition to FILLED
 * 11. Centralized audit logging verification in audit_logs table
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

    // Ensure clean state: remove existing appointments between this doctor & patient to test treating relationship check
    await db.query(
        "DELETE FROM appointments WHERE doctor_id = $1 AND patient_id = $2",
        [doctor.id, patient.id]
    );
    await db.query(
        "DELETE FROM audit_logs WHERE patient_id = $1 AND doctor_id = $2 AND event_type IN ('emergency_break_glass', 'break_glass')",
        [patient.id, doctor.id]
    );

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

    // TEST 2: Treating-Relationship Enforcement (Rejection)
    console.log('\n--- TEST 2: Treating Relationship Enforcement (Rejection without Appointment/Break-Glass) ---');
    const prescriptionPayload = {
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
    };

    const mockUnlinkedReq = {
        user: { id: doctor.id, role: 'doctor', organization_id: orgId },
        body: prescriptionPayload
    };

    let treatingRelError = null;
    const mockResCapture = {
        status: () => mockResCapture,
        json: () => mockResCapture
    };

    await prescriptionsController.createPrescription(mockUnlinkedReq, mockResCapture, (err) => {
        treatingRelError = err;
    });

    assert(treatingRelError, 'Must reject doctor without treating relationship');
    assert(treatingRelError.statusCode === 403, `Expected HTTP 403, got ${treatingRelError.statusCode}`);
    console.log(`✓ Non-treating doctor successfully rejected with HTTP 403: "${treatingRelError.message}"`);

    // Now establish confirmed appointment between doctor and patient to satisfy treating relationship
    console.log('\n[Setup] Establishing confirmed clinical appointment between doctor and patient...');
    await db.query(`
        INSERT INTO appointments (
            patient_id, doctor_id, patient_name, doctor_name, organization_id, date, time, status, reason
        ) VALUES (
            $1, $2, $3, $4, $5, CURRENT_DATE, '10:00:00', 'Confirmed', 'Clinical consultation'
        )
    `, [patient.id, doctor.id, patient.name, doctor.name, orgId]);
    console.log('✓ Confirmed appointment created.');

    // Ensure patient profile has Penicillin allergy and a known DOB (e.g. 1992-04-15)
    await db.query(`
        UPDATE users 
        SET patient_profile = jsonb_set(
            jsonb_set(COALESCE(patient_profile, '{}'::jsonb), '{allergies}', '["Penicillin", "Dust"]'),
            '{dob}', '"1992-04-15"'
        )
        WHERE id = $1;
    `, [patient.id]);

    // TEST 3: Allergy Contraindication Hard Block (Rejection without Override Justification)
    console.log('\n--- TEST 3: Allergy Contraindication Hard Block (Rejection without Override) ---');
    let allergyBlockRes = null;
    let allergyBlockStatus = null;
    const mockAllergyBlockRes = {
        status: (code) => { allergyBlockStatus = code; return mockAllergyBlockRes; },
        json: (data) => { allergyBlockRes = data; return mockAllergyBlockRes; }
    };

    await prescriptionsController.createPrescription(mockUnlinkedReq, mockAllergyBlockRes, (err) => {
        if (err) throw err;
    });

    assert(allergyBlockStatus === 400, `Expected HTTP 400, got ${allergyBlockStatus}`);
    assert(allergyBlockRes && allergyBlockRes.requiresOverride === true, 'Response must indicate requiresOverride: true');
    assert(allergyBlockRes.allergyWarnings.length > 0, 'Must include allergy warnings');
    console.log(`✓ Allergy hard block successfully triggered with HTTP 400`);
    console.log(`✓ Alert message: "${allergyBlockRes.message}"`);
    console.log(`✓ Warnings flagged: "${allergyBlockRes.allergyWarnings[0].allergyAlert}"`);

    // TEST 4: Allergy Contraindication Success with Clinical Override Justification
    console.log('\n--- TEST 4: Issue Prescription with Clinical Allergy Override Justification ---');
    const mockOverrideReq = {
        user: { id: doctor.id, role: 'doctor', organization_id: orgId },
        body: {
            ...prescriptionPayload,
            overrideJustification: 'Desensitization protocol completed; antihistamine premedication administered; no alternative antibiotic.'
        }
    };

    let createResponse = null;
    let createStatusCode = null;
    const mockCreateRes = {
        status: (code) => { createStatusCode = code; return mockCreateRes; },
        json: (data) => { createResponse = data; return mockCreateRes; }
    };

    await prescriptionsController.createPrescription(mockOverrideReq, mockCreateRes, (err) => {
        if (err) throw err;
    });

    assert(createStatusCode === 201, `Expected HTTP 201, got ${createStatusCode}`);
    assert(createResponse && createResponse.prescription, 'Response must include created prescription');
    const createdRx = createResponse.prescription;
    assert(createdRx.status === 'ISSUED', `Status must be ISSUED, got ${createdRx.status}`);
    assert(createdRx.qr_token && createdRx.qr_token.startsWith('rx_'), 'QR token must start with rx_');
    assert(createdRx.items.length === 2, `Expected 2 items, got ${createdRx.items.length}`);
    console.log(`✓ Prescription issued with ID: ${createdRx.id}`);
    console.log(`✓ QR Token generated: ${createdRx.qr_token}`);
    console.log(`✓ Override justification recorded: "${mockOverrideReq.body.overrideJustification.slice(0, 50)}..."`);

    // TEST 5: Tiered QR Token Verification (Redacted vs Unlocked)
    console.log('\n--- TEST 5A: Public QR Verification - Anonymous Redacted Tier ---');
    const mockAnonVerifyReq = {
        params: { qr_token: createdRx.qr_token },
        query: {},
        headers: {}
    };

    let anonVerifyRes = null;
    const mockAnonVerifyResObj = {
        status: () => mockAnonVerifyResObj,
        json: (data) => { anonVerifyRes = data; return mockAnonVerifyResObj; }
    };

    await prescriptionsController.verifyPrescriptionByToken(mockAnonVerifyReq, mockAnonVerifyResObj, (err) => {
        if (err) throw err;
    });

    assert(anonVerifyRes.verified === true, 'Verification status must be true');
    assert(anonVerifyRes.medicationsRestricted === true, 'medicationsRestricted must be true for anonymous scan');
    assert(anonVerifyRes.requiresVerificationToViewMedications === true, 'requiresVerificationToViewMedications must be true');
    assert(anonVerifyRes.items[0].medicationName.includes('Protected Clinical Medication'), 'Medication name must be masked in anonymous tier');
    assert(anonVerifyRes.items[0].dosage === '***', 'Dosage must be masked');
    assert(anonVerifyRes.instructions.includes('Protected clinical posology'), 'Instructions must be masked');
    console.log(`✓ Anonymous tier correctly protects sensitive medications: "${anonVerifyRes.items[0].medicationName}"`);
    console.log(`✓ Posology instructions protected: "${anonVerifyRes.instructions}"`);

    console.log('\n--- TEST 5B: Public QR Verification - Unlocked Tier (Patient Birth Year Challenge) ---');
    const mockUnlockedVerifyReq = {
        params: { qr_token: createdRx.qr_token },
        query: { dobYear: '1992' },
        headers: {}
    };

    let unlockedVerifyRes = null;
    const mockUnlockedVerifyResObj = {
        status: () => mockUnlockedVerifyResObj,
        json: (data) => { unlockedVerifyRes = data; return mockUnlockedVerifyResObj; }
    };

    await prescriptionsController.verifyPrescriptionByToken(mockUnlockedVerifyReq, mockUnlockedVerifyResObj, (err) => {
        if (err) throw err;
    });

    assert(unlockedVerifyRes.medicationsRestricted === false, 'medicationsRestricted must be false after valid challenge');
    assert(unlockedVerifyRes.items[0].medicationName.includes('Amoxicillin'), 'Real medication name must be visible after unlock');
    assert(unlockedVerifyRes.items[0].dosage === '500mg', 'Real dosage must be visible after unlock');
    assert(unlockedVerifyRes.instructions.includes('Take medications with food'), 'Real instructions must be visible after unlock');
    assert(unlockedVerifyRes.overrideJustification, 'Clinical override justification must be visible after unlock');
    console.log(`✓ Unlocked tier successfully discloses medication: "${unlockedVerifyRes.items[0].medicationName}" (${unlockedVerifyRes.items[0].dosage})`);
    console.log(`✓ Override rationale disclosed: "${unlockedVerifyRes.overrideJustification}"`);

    // TEST 6: Patient Role Rejection on Dispense
    console.log('\n--- TEST 6: Patient Role Rejection on Dispense (HTTP 403) ---');
    const amoxItem = createdRx.items.find(i => i.medication_name.includes('Amoxicillin'));
    const mockPatientDispenseReq = {
        params: { id: createdRx.id },
        user: { id: patient.id, role: 'patient', organization_id: orgId },
        body: {
            itemDispenses: [{ itemId: amoxItem.id, quantityDispensed: 5 }]
        }
    };

    let patientDispenseError = null;
    await prescriptionsController.dispensePrescription(mockPatientDispenseReq, mockResCapture, (err) => {
        patientDispenseError = err;
    });

    assert(patientDispenseError, 'Patient must be rejected from dispensing');
    assert(patientDispenseError.statusCode === 403, `Expected HTTP 403, got ${patientDispenseError.statusCode}`);
    console.log(`✓ Patient role rejected from dispensing with HTTP 403: "${patientDispenseError.message}"`);

    // TEST 7: Patient Role Rejection on Cancel
    console.log('\n--- TEST 7: Patient Role Rejection on Cancel (HTTP 403) ---');
    const mockPatientCancelReq = {
        params: { id: createdRx.id },
        user: { id: patient.id, role: 'patient', organization_id: orgId },
        body: { reason: 'I feel better' }
    };

    let patientCancelError = null;
    await prescriptionsController.cancelPrescription(mockPatientCancelReq, mockResCapture, (err) => {
        patientCancelError = err;
    });

    assert(patientCancelError, 'Patient must be rejected from cancelling prescription');
    assert(patientCancelError.statusCode === 403, `Expected HTTP 403, got ${patientCancelError.statusCode}`);
    console.log(`✓ Patient role rejected from cancelling with HTTP 403: "${patientCancelError.message}"`);

    // TEST 8: Partial Dispensation (Authorized Clinic Doctor/Staff)
    console.log('\n--- TEST 8: Partial Dispensation by Authorized Provider (10 of 21 Amox) ---');
    const mockAuthorizedDispenseReq = {
        params: { id: createdRx.id },
        user: { id: doctor.id, role: 'doctor', organization_id: orgId },
        body: {
            itemDispenses: [{ itemId: amoxItem.id, quantityDispensed: 10 }],
            notes: 'Batch 1 dispensation. Patient instructed on hydration.'
        }
    };

    let dispenseResponse = null;
    const mockDispenseRes = {
        json: (data) => { dispenseResponse = data; return mockDispenseRes; }
    };

    await prescriptionsController.dispensePrescription(mockAuthorizedDispenseReq, mockDispenseRes, (err) => {
        if (err) throw err;
    });

    const partiallyFilledRx = dispenseResponse.prescription;
    assert(partiallyFilledRx.status === 'PARTIALLY_FILLED', `Expected PARTIALLY_FILLED, got ${partiallyFilledRx.status}`);
    const updatedAmox = partiallyFilledRx.items.find(i => i.id === amoxItem.id);
    assert(updatedAmox.quantity_dispensed === 10, `Expected 10 dispensed, got ${updatedAmox.quantity_dispensed}`);
    console.log(`✓ Status transitioned to: ${partiallyFilledRx.status}`);
    console.log(`✓ Quantity dispensed: ${updatedAmox.quantity_dispensed} / ${updatedAmox.quantity_prescribed}`);

    // TEST 9: Over-dispense Prevention
    console.log('\n--- TEST 9: Over-dispense Prevention (Remaining is 11, trying to dispense 15) ---');
    const mockOverDispenseReq = {
        params: { id: createdRx.id },
        user: { id: doctor.id, role: 'doctor', organization_id: orgId },
        body: {
            itemDispenses: [{ itemId: amoxItem.id, quantityDispensed: 15 }]
        }
    };

    let overDispenseError = null;
    await prescriptionsController.dispensePrescription(mockOverDispenseReq, mockDispenseRes, (err) => {
        overDispenseError = err;
    });

    assert(overDispenseError, 'Over-dispense must throw an error');
    assert(overDispenseError.statusCode === 400, `Expected 400 Bad Request, got ${overDispenseError.statusCode}`);
    console.log(`✓ Over-dispense cleanly rejected: "${overDispenseError.message}"`);

    // TEST 10: Complete Full Dispensation
    console.log('\n--- TEST 10: Complete Full Dispensation (Remaining 11 Amox + 6 Paracetamol) ---');
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
    console.log(`✓ Status transitioned to: ${fullyFilledRx.status}`);
    console.log(`✓ All items completely fulfilled across ${fullyFilledRx.dispenseLogs.length} dispensation logs`);

    // TEST 11: Audit Logs Compliance Verification
    console.log('\n--- TEST 11: Centralized Audit Trail Verification in audit_logs ---');
    const { rows: auditEvents } = await db.query(`
        SELECT event_type, details, doctor_name, patient_name, timestamp
        FROM audit_logs
        WHERE (details LIKE '%' || $1 || '%' OR event_type IN ('prescription_issued', 'prescription_dispensed', 'prescription_allergy_override'))
          AND patient_id = $2
        ORDER BY timestamp DESC
        LIMIT 5;
    `, [createdRx.qr_token, patient.id]);

    assert(auditEvents.length > 0, 'Must find prescription audit events in audit_logs');
    const eventTypes = auditEvents.map(e => e.event_type);
    console.log(`✓ Total matched audit events in audit_logs: ${auditEvents.length}`);
    console.log(`✓ Audit event types found: ${eventTypes.join(', ')}`);
    assert(eventTypes.includes('prescription_issued') || eventTypes.includes('prescription_allergy_override'), 'Must record prescription_issued or override');
    assert(eventTypes.includes('prescription_dispensed'), 'Must record prescription_dispensed in audit_logs');
    console.log(`✓ Verified tamper-evident audit trail entry: "${auditEvents[0].event_type}" - ${auditEvents[0].details.slice(0, 70)}...`);

    // Clean up test records
    console.log('\n--- Cleaning up test records ---');
    await db.query("DELETE FROM dispense_logs WHERE prescription_id = $1", [createdRx.id]);
    await db.query("DELETE FROM prescription_items WHERE prescription_id = $1", [createdRx.id]);
    await db.query("DELETE FROM prescriptions WHERE id = $1", [createdRx.id]);
    await db.query("DELETE FROM appointments WHERE doctor_id = $1 AND patient_id = $2", [doctor.id, patient.id]);
    console.log('✓ Test prescription and temporary appointment cleanly purged.');

    console.log('\n================================================================');
    console.log('   🎉 ALL 11 PRESCRIPTION INTEGRATION TESTS PASSED WITH 100%   ');
    console.log('================================================================');
    process.exit(0);
}

runTests().catch(err => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
});
