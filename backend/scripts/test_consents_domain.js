/**
 * Test Suite: Patient Consent & Granular Access Delegation + Emergency Break-Glass Independence
 * 
 * Verifies:
 * 1. Consent Grant creation with SHA-256 cryptographic non-repudiation hash.
 * 2. Treating Relationship authorization via 3rd pillar (Active Patient Consent).
 * 3. Consent Revocation and access revocation.
 * 4. User-Mandated Test Case: Break-Glass independence — Doctor maintains emergency access within
 *    the 1-hour window even if the patient explicitly revokes consent.
 * 5. Expired consent auto-invalidation.
 * 6. Scoped Doctor Search (limited to tenant_memberships of the patient).
 * 7. Clinical SMS formatting and non-blocking dispatcher fallback.
 */

const crypto = require('crypto');
const db = require('../db');
const consentRepo = require('../repositories/consentRepository');
const recordsRepo = require('../repositories/recordsRepository');
const adminRepo = require('../repositories/adminRepository');
const { sanitizeKenyanPhone, sendSms } = require('../services/smsService');

async function runConsentTests() {
    console.log('================================================================');
    console.log('   RUNNING PATIENT CONSENT & ACCESS DELEGATION TEST SUITE       ');
    console.log('================================================================\n');

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

    const orgAId = crypto.randomUUID();
    const orgBId = crypto.randomUUID();
    const patientId = crypto.randomUUID();
    const docAId = crypto.randomUUID();
    const docBId = crypto.randomUUID();

    try {
        // Setup Organizations
        const nameA = 'Test Org A ' + orgAId.slice(0, 8);
        const nameB = 'Test Org B ' + orgBId.slice(0, 8);
        await db.query(`
            INSERT INTO organizations (id, name, slug, status)
            VALUES 
                ($1, $2, $3, 'active'),
                ($4, $5, $6, 'active')
            ON CONFLICT (id) DO NOTHING;
        `, [orgAId, nameA, 'slug-a-' + orgAId.slice(0, 6), orgBId, nameB, 'slug-b-' + orgBId.slice(0, 6)]);

        // Setup Users
        const emailP = `alice_${patientId.slice(0, 6)}@consenttest.com`;
        const emailD1 = `alpha_${docAId.slice(0, 6)}@consenttest.com`;
        const emailD2 = `beta_${docBId.slice(0, 6)}@consenttest.com`;
        await db.query(`
            INSERT INTO users (id, name, email, password, role, organization_id, is_approved, public_key, private_key, patient_profile, doctor_profile)
            VALUES 
                ($1, 'Alice Patient', $6, 'hashed', 'patient', $2, true, 'pub_p', 'priv_p', '{"phone":"+254712345678"}', null),
                ($3, 'Dr. Alpha (Org A)', $7, 'hashed', 'doctor', $2, true, 'pub_d1', 'priv_d1', null, '{"phone":"+254722111222","specialization":"Cardiology"}'),
                ($4, 'Dr. Beta (Org B)', $8, 'hashed', 'doctor', $5, true, 'pub_d2', 'priv_d2', null, '{"phone":"+254733444555","specialization":"Neurology"}')
            ON CONFLICT (id) DO NOTHING;
        `, [patientId, orgAId, docAId, docBId, orgBId, emailP, emailD1, emailD2]);

        // Patient tenant membership in Org A only
        await db.query(`
            INSERT INTO tenant_memberships (user_id, organization_id, role, status)
            VALUES ($1, $2, 'patient', 'active')
            ON CONFLICT (user_id, organization_id) DO NOTHING;
        `, [patientId, orgAId]);

        // -------------------------------------------------------------
        // TEST 1: Scoped Doctor Search
        // -------------------------------------------------------------
        console.log('\n--- 1. Testing Scoped Doctor Search ---');
        const doctorsVisibleToPatient = await adminRepo.getDoctorsByOrg({
            isPatient: true,
            patientId
        });

        const seesDocA = doctorsVisibleToPatient.some(d => d.id === docAId);
        const seesDocB = doctorsVisibleToPatient.some(d => d.id === docBId);

        assert(seesDocA, 'Patient sees Dr. Alpha from their affiliated Clinic A');
        assert(!seesDocB, 'Patient CANNOT see Dr. Beta from unrelated Clinic B (proper tenant isolation)');

        // -------------------------------------------------------------
        // TEST 2: Initial State - No treating relationship
        // -------------------------------------------------------------
        console.log('\n--- 2. Testing Initial Relationship (No Consent, No Appt) ---');
        const initialRelation = await recordsRepo.checkTreatingRelationship(docAId, patientId);
        assert(!initialRelation, 'Doctor has NO treating relationship prior to consent or appointment');

        // -------------------------------------------------------------
        // TEST 3: Patient Grants Granular Consent
        // -------------------------------------------------------------
        console.log('\n--- 3. Testing Patient Consent Grant ---');
        const txHash = crypto.createHash('sha256').update(`${patientId}:${docAId}:full_record:${Date.now()}`).digest('hex');
        const expiresFuture = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

        const consent = await consentRepo.createConsent({
            patientId,
            granteeType: 'doctor',
            doctorId: docAId,
            organizationId: orgAId,
            scope: 'full_record',
            expiresAt: expiresFuture,
            purpose: 'Specialist Cardiology Review',
            transactionHash: txHash
        });

        assert(consent && consent.id, 'Consent grant record successfully created in database');
        assert(consent.status === 'active', 'Consent status is active');
        assert(consent.scope === 'full_record', 'Consent scope is full_record');

        // Verify active consent check
        const hasActiveConsent = await consentRepo.hasActiveConsent(patientId, docAId);
        assert(hasActiveConsent, 'consentRepo.hasActiveConsent returns true for active grant');

        // Verify 3rd Pillar authorization in recordsRepo
        const relationWithConsent = await recordsRepo.checkTreatingRelationship(docAId, patientId);
        assert(relationWithConsent, 'recordsRepo.checkTreatingRelationship passes via 3rd pillar (Active Consent Grant)');

        // -------------------------------------------------------------
        // TEST 4: Patient Revokes Consent
        // -------------------------------------------------------------
        console.log('\n--- 4. Testing Patient Consent Revocation ---');
        const revoked = await consentRepo.revokeConsent(consent.id, patientId, 'Consultation concluded by patient');
        assert(revoked && revoked.status === 'revoked', 'Consent record updated to revoked status');
        assert(revoked.revocation_reason === 'Consultation concluded by patient', 'Revocation reason captured in audit');

        const hasActiveAfterRevoke = await consentRepo.hasActiveConsent(patientId, docAId);
        assert(!hasActiveAfterRevoke, 'consentRepo.hasActiveConsent returns false after revocation');

        const relationAfterRevoke = await recordsRepo.checkTreatingRelationship(docAId, patientId);
        assert(!relationAfterRevoke, 'Doctor treating relationship revoked after patient revokes consent');

        // -------------------------------------------------------------
        // TEST 5: Break-Glass Independence During Revocation (User Requirement)
        // -------------------------------------------------------------
        console.log('\n--- 5. Testing Break-Glass Independence During Consent Revocation ---');
        // Simulate emergency break-glass event executed 15 minutes ago
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        await db.query(`
            INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp)
            VALUES ($1, 'break_glass', $2, 'Alice Patient', $3, 'Dr. Alpha', 'Emergency trauma override: Acute respiratory distress', $4);
        `, [orgAId, patientId, docAId, fifteenMinutesAgo]);

        // Verify that even with revoked consent, active break-glass within 1 hour permits access
        const relationUnderBreakGlass = await recordsRepo.checkTreatingRelationship(docAId, patientId);
        assert(
            relationUnderBreakGlass,
            'CRITICAL: Emergency break-glass access continues to function despite revoked consent (independent emergency pillar)'
        );

        // -------------------------------------------------------------
        // TEST 6: Expired Consent Auto-Invalidation
        // -------------------------------------------------------------
        console.log('\n--- 6. Testing Expired Consent Auto-Invalidation ---');
        const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
        const expiredTxHash = crypto.createHash('sha256').update(`expired:${patientId}:${docBId}`).digest('hex');

        const expiredConsent = await consentRepo.createConsent({
            patientId,
            granteeType: 'doctor',
            doctorId: docBId,
            organizationId: orgBId,
            scope: 'diagnoses_only',
            expiresAt: pastDate,
            purpose: 'Historical lab review',
            transactionHash: expiredTxHash
        });

        const hasActiveExpired = await consentRepo.hasActiveConsent(patientId, docBId);
        assert(!hasActiveExpired, 'hasActiveConsent returns false for past expires_at timestamp');

        // -------------------------------------------------------------
        // TEST 7: SMS Service Formatting & Non-Blocking Fallback
        // -------------------------------------------------------------
        console.log('\n--- 7. Testing SMS Service E.164 Formatting & Fallback ---');
        assert(sanitizeKenyanPhone('0712345678') === '+254712345678', 'E.164 formats 0712345678 -> +254712345678');
        assert(sanitizeKenyanPhone('254722000111') === '+254722000111', 'E.164 formats 254722000111 -> +254722000111');
        assert(sanitizeKenyanPhone('+254799888777') === '+254799888777', 'E.164 preserves +254799888777');

        const smsResult = await sendSms({
            to: '0712345678',
            message: 'BlockHealth verification SMS test',
            type: 'verification'
        });
        assert(smsResult && smsResult.success, 'sendSms resolves successfully in fallback/mock mode without blocking');

        console.log('\n================================================================');
        console.log(`CONSENT DOMAIN TEST RESULTS: ${passed} PASSED | ${failed} FAILED`);
        console.log('================================================================\n');

        if (failed > 0) {
            process.exit(1);
        } else {
            process.exit(0);
        }

    } catch (err) {
        console.error('Test suite runtime exception:', err);
        process.exit(1);
    }
}

runConsentTests();
