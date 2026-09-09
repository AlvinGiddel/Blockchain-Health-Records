/**
 * Phase 2 Pharmacy Portal & Dispensing Workflow - End-to-End Verification Test
 * 
 * Verifies all 8 items in the verification plan:
 * 1. Pharmacy self-serve registration & PPB license capture
 * 2. Super Admin review & 14-day trial activation
 * 3. Pharmacist login & provider-tier posology disclosure on QR verification
 * 4. Dispensation execution with batch number and expiration date tracking
 * 5. Duplicate / rival dispensation prevention (HTTP 409 Conflict) & doctor role exclusion (HTTP 403)
 * 6. Multi-tenant isolation (scoped dispensations, history, metrics & exclusion from hospital dropdowns)
 * 7. License expiry gating (read-only grace mode on expired trial)
 * 8. Centralized audit logging with real pharmacist identity
 */

process.env.VERCEL = '1';
const http = require('http');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const jwt = require('jsonwebtoken');
const db = require('../db');
const app = require('../server');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

async function runPharmacyTests() {
    console.log('========================================================================');
    console.log('     PHASE 2: PHARMACY PORTAL & DISPENSING WORKFLOW VERIFICATION       ');
    console.log('========================================================================\n');

    let passed = 0;
    let failed = 0;
    const testResults = [];

    function recordAssertion(itemNumber, testName, condition, details = '') {
        if (condition) {
            console.log(`✅ [PASS] [Item ${itemNumber}] ${testName}`);
            passed++;
            testResults.push({ item: itemNumber, test: testName, status: 'PASSED', details });
        } else {
            console.error(`❌ [FAIL] [Item ${itemNumber}] ${testName} -> ${details}`);
            failed++;
            testResults.push({ item: itemNumber, test: testName, status: 'FAILED', details });
        }
    }

    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    function request(reqPath, options = {}) {
        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port,
                path: reqPath,
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(options.headers || {})
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    let parsed = null;
                    try {
                        parsed = JSON.parse(data);
                    } catch (e) {
                        parsed = data;
                    }
                    resolve({ status: res.statusCode, headers: res.headers, body: parsed });
                });
            });

            req.on('error', reject);
            if (options.body) {
                req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
            }
            req.end();
        });
    }

    try {
        // Find existing Super Admin or create one
        let superAdminId;
        const { rows: superAdminRows } = await db.query("SELECT id, name, email FROM users WHERE role = 'super_admin' LIMIT 1;");
        if (superAdminRows.length > 0) {
            superAdminId = superAdminRows[0].id;
        } else {
            const { rows: newSa } = await db.query(`
                INSERT INTO users (name, email, password_hash, role)
                VALUES ('Global Administrator', 'superadmin.pharmacytest@blockhealth.co.ke', '$2b$10$abcdefghijklmnopqrstuu', 'super_admin')
                RETURNING id;
            `);
            superAdminId = newSa[0].id;
        }

        const superAdminToken = jwt.sign({
            id: superAdminId,
            name: 'Global Administrator',
            email: 'superadmin.pharmacytest@blockhealth.co.ke',
            role: 'super_admin'
        }, JWT_SECRET, { expiresIn: '2h' });

        // Clean up previous test runs if present
        const testEmailPharmacyA = 'wanjiku.kimani@apexchemists.co.ke';
        const testEmailPharmacyB = 'rival.pharmacy@rivalchemists.co.ke';
        await db.query("UPDATE organizations SET name = 'Test Nairobi Apex Chemists Ltd' WHERE name = 'Nairobi Apex Chemists Ltd';");
        await db.query("DELETE FROM organizations WHERE name IN ('Test Nairobi Apex Chemists Ltd', 'Test Rival City Pharmacy Ltd');");
        await db.query("DELETE FROM users WHERE email IN ($1, $2);", [testEmailPharmacyA, testEmailPharmacyB]);

        // =====================================================================
        // ITEM 1: PHARMACY SELF-SERVE REGISTRATION & PPB LICENSE CAPTURE
        // =====================================================================
        console.log('\n--- ITEM 1: Pharmacy Self-Serve Registration & PPB Capture ---');
        const regPharmacyRes = await request('/api/auth/register-pharmacy', {
            method: 'POST',
            body: {
                pharmacyName: 'Test Nairobi Apex Chemists Ltd',
                adminName: 'Pharm. Wanjiku Kimani',
                email: testEmailPharmacyA,
                password: 'SecurePassword123!',
                ppbLicenseNumber: 'PPB/PREM/2026/0842',
                phone: '+254711223344',
                physicalAddress: 'Kimathi Street, Nairobi CBD'
            }
        });

        recordAssertion(
            1,
            'Pharmacy registration HTTP 201 response with pending approval state',
            regPharmacyRes.status === 201 && regPharmacyRes.body.pendingApproval === true,
            `Status: ${regPharmacyRes.status}, pendingApproval: ${regPharmacyRes.body?.pendingApproval}`
        );

        const pharmacyOrgIdA = regPharmacyRes.body.organization?.id;
        const { rows: uRowsA } = await db.query('SELECT id FROM users WHERE email = $1;', [testEmailPharmacyA]);
        const pharmacistUserIdA = uRowsA[0]?.id;

        // Verify database persistence
        const { rows: orgRowsA } = await db.query('SELECT * FROM organizations WHERE id = $1;', [pharmacyOrgIdA]);
        recordAssertion(
            1,
            'Organizations table stores org_type="pharmacy" and ppb_license_number',
            orgRowsA.length > 0 &&
            orgRowsA[0].org_type === 'pharmacy' &&
            orgRowsA[0].ppb_license_number === 'PPB/PREM/2026/0842' &&
            orgRowsA[0].status === 'pending_approval' &&
            orgRowsA[0].contact_phone === '+254711223344',
            `org_type: ${orgRowsA[0]?.org_type}, ppb_license_number: ${orgRowsA[0]?.ppb_license_number}`
        );

        const { rows: userRowsA } = await db.query('SELECT role, is_approved FROM users WHERE id = $1;', [pharmacistUserIdA]);
        const { rows: memberRowsA } = await db.query('SELECT status FROM tenant_memberships WHERE user_id = $1 AND organization_id = $2;', [pharmacistUserIdA, pharmacyOrgIdA]);
        recordAssertion(
            1,
            'Users table provisions superintendent user with role="pharmacist"',
            userRowsA.length > 0 &&
            userRowsA[0].role === 'pharmacist' &&
            userRowsA[0].is_approved === false &&
            memberRowsA[0]?.status === 'pending',
            `role: ${userRowsA[0]?.role}, is_approved: ${userRowsA[0]?.is_approved}, memberStatus: ${memberRowsA[0]?.status}`
        );

        // =====================================================================
        // ITEM 2: SUPER ADMIN REVIEW & 14-DAY TRIAL ACTIVATION
        // =====================================================================
        console.log('\n--- ITEM 2: Super Admin Review & 14-Day Trial Activation ---');
        
        // Super Admin lists pending organizations
        const pendingOrgsRes = await request('/api/admin/organizations/pending', {
            method: 'GET',
            headers: { Authorization: `Bearer ${superAdminToken}` }
        });

        const pendingPharmacy = (pendingOrgsRes.body?.pendingClinics || pendingOrgsRes.body?.pendingOrganizations || []).find(o => o.id === pharmacyOrgIdA);
        recordAssertion(
            2,
            'Super Admin pending list displays pharmacy with orgType and ppbLicenseNumber',
            pendingPharmacy &&
            pendingPharmacy.orgType === 'pharmacy' &&
            pendingPharmacy.ppbLicenseNumber === 'PPB/PREM/2026/0842',
            `Found pending pharmacy: ${pendingPharmacy?.name}, ppb: ${pendingPharmacy?.ppbLicenseNumber}`
        );

        // Super Admin approves the pharmacy
        const approveRes = await request(`/api/admin/organizations/${pharmacyOrgIdA}/approve`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${superAdminToken}` }
        });

        recordAssertion(
            2,
            'Super Admin approve endpoint returns HTTP 200 success',
            approveRes.status === 200 && approveRes.body.organization?.status === 'trial',
            `Status: ${approveRes.status}, org status: ${approveRes.body?.organization?.status}`
        );

        // Verify 14-day trial length
        const { rows: approvedOrgRows } = await db.query('SELECT status, license_expires_at FROM organizations WHERE id = $1;', [pharmacyOrgIdA]);
        const expiryDate = new Date(approvedOrgRows[0].license_expires_at);
        const daysDiff = (expiryDate - new Date()) / (1000 * 60 * 60 * 24);
        recordAssertion(
            2,
            'Approved pharmacy receives intentional 14-day trial period (distinct from clinic 7-day trial)',
            approvedOrgRows[0].status === 'trial' && daysDiff >= 13.5 && daysDiff <= 14.5,
            `Trial duration: ${daysDiff.toFixed(2)} days until expiry`
        );

        // Verify pharmacist user activation
        const { rows: activeUserRows } = await db.query('SELECT is_approved FROM users WHERE id = $1;', [pharmacistUserIdA]);
        const { rows: activeMemberRows } = await db.query('SELECT status FROM tenant_memberships WHERE user_id = $1 AND organization_id = $2;', [pharmacistUserIdA, pharmacyOrgIdA]);
        recordAssertion(
            2,
            'Pharmacist user status transitioned to "active"',
            activeUserRows[0].is_approved === true && activeMemberRows[0]?.status === 'active',
            `User is_approved: ${activeUserRows[0].is_approved}, memberStatus: ${activeMemberRows[0]?.status}`
        );

        // =====================================================================
        // ITEM 3: PHARMACIST LOGIN & PROVIDER-TIER POSOLOGY DISCLOSURE
        // =====================================================================
        console.log('\n--- ITEM 3: Pharmacist Login & Provider-Tier Posology Disclosure ---');
        
        const loginRes = await request('/api/auth/login', {
            method: 'POST',
            body: {
                email: testEmailPharmacyA,
                password: 'SecurePassword123!'
            }
        });

        recordAssertion(
            3,
            'Pharmacist logs in successfully and receives JWT with role="pharmacist"',
            loginRes.status === 200 && loginRes.body.user?.role === 'pharmacist' && Boolean(loginRes.body.token),
            `Status: ${loginRes.status}, role: ${loginRes.body?.user?.role}`
        );

        const pharmacistTokenA = loginRes.body.token;

        // Create a test prescription issued by an existing doctor
        const { rows: docRows } = await db.query("SELECT id, organization_id FROM users WHERE role = 'doctor' LIMIT 1;");
        const { rows: patRows } = await db.query("SELECT id, name FROM users WHERE role = 'patient' LIMIT 1;");
        if (docRows.length === 0 || patRows.length === 0) {
            throw new Error('Database prerequisite missing: Doctor and Patient required.');
        }

        const testDoc = docRows[0];
        const testPat = patRows[0];
        const testQrToken = `rx_test_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        const { rows: rxRows } = await db.query(`
            INSERT INTO prescriptions (
                patient_id, doctor_id, organization_id, status, qr_token, instructions, override_justification, expires_at
            ) VALUES (
                $1, $2, $3, 'ISSUED', $4, 'Take 1 tablet after meals with water', 'Clinical justification: Low dose required for secondary prophylaxis', NOW() + INTERVAL '30 days'
            ) RETURNING *;
        `, [testPat.id, testDoc.id, testDoc.organization_id, testQrToken]);

        const prescriptionId = rxRows[0].id;

        // Insert prescription items
        const { rows: itemRows } = await db.query(`
            INSERT INTO prescription_items (
                prescription_id, medication_name, dosage, frequency, duration, quantity_prescribed, quantity_dispensed
            ) VALUES 
            ($1, 'Amoxicillin Trihydrate 500mg', '500mg', 'TDS (Three times daily)', '7 days', 21, 0),
            ($1, 'Paracetamol 500mg', '1000mg', 'PRN (As needed)', '5 days', 10, 0)
            RETURNING *;
        `, [prescriptionId]);

        const item1 = itemRows[0];
        const item2 = itemRows[1];

        // 3a. Unauthenticated anonymous QR scan check
        const anonVerifyRes = await request(`/api/prescriptions/verify/${testQrToken}`, { method: 'GET' });
        recordAssertion(
            3,
            'Anonymous QR scan redacts medication posology (Zero-Knowledge Tiered Privacy)',
            anonVerifyRes.status === 200 &&
            anonVerifyRes.body.medicationsRestricted === true &&
            anonVerifyRes.body.items[0].medicationName.includes('Protected Clinical Medication'),
            `medicationsRestricted: ${anonVerifyRes.body?.medicationsRestricted}`
        );

        // 3b. Pharmacist verified Bearer token QR scan check (Full unmasked posology disclosure)
        const pharmVerifyRes = await request(`/api/prescriptions/verify/${testQrToken}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${pharmacistTokenA}` }
        });

        if (pharmVerifyRes.status !== 200 || !pharmVerifyRes.body.items) {
            console.log('DEBUG pharmVerifyRes failed:', pharmVerifyRes.status, pharmVerifyRes.body);
        }

        recordAssertion(
            3,
            'Authenticated Pharmacist JWT unlocks full unmasked posology without patient DOB challenge',
            pharmVerifyRes.status === 200 &&
            pharmVerifyRes.body.medicationsRestricted === false &&
            pharmVerifyRes.body.items &&
            pharmVerifyRes.body.items[0]?.medicationName === 'Amoxicillin Trihydrate 500mg' &&
            pharmVerifyRes.body.items[0]?.dosage === '500mg' &&
            pharmVerifyRes.body.instructions === 'Take 1 tablet after meals with water' &&
            pharmVerifyRes.body.overrideJustification?.includes('Clinical justification'),
            `status: ${pharmVerifyRes.status}, medicationsRestricted: ${pharmVerifyRes.body?.medicationsRestricted}, item: ${pharmVerifyRes.body?.items?.[0]?.medicationName}`
        );

        // =====================================================================
        // ITEM 4: DISPENSATION EXECUTION WITH BATCH & EXPIRY TRACKING
        // =====================================================================
        console.log('\n--- ITEM 4: Dispensation Execution with Batch & Expiry Tracking ---');

        const dispenseRes = await request(`/api/prescriptions/${prescriptionId}/dispense`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${pharmacistTokenA}` },
            body: {
                itemDispenses: [
                    {
                        itemId: item1.id,
                        quantityDispensed: 10,
                        batchNumber: 'BATCH-2026-X01',
                        expiryDate: '2027-11-30'
                    },
                    {
                        itemId: item2.id,
                        quantityDispensed: 5,
                        batchNumber: 'BATCH-PARA-99',
                        expiryDate: '2028-05-15'
                    }
                ],
                notes: 'Patient advised on completing full antibiotic course.'
            }
        });

        recordAssertion(
            4,
            'Dispense endpoint returns HTTP 200 and transitions status to PARTIALLY_FILLED',
            dispenseRes.status === 200 && dispenseRes.body.prescription?.status === 'PARTIALLY_FILLED',
            `Status: ${dispenseRes.status}, rx status: ${dispenseRes.body?.prescription?.status}`
        );

        // Verify prescription_items table batch & audit columns
        const { rows: updatedItemRows } = await db.query('SELECT * FROM prescription_items WHERE id = $1;', [item1.id]);
        recordAssertion(
            4,
            'Prescription_items stores batch_number, expiry_date, dispensed_by_org_id, and dispensed_at',
            updatedItemRows[0].quantity_dispensed === 10 &&
            updatedItemRows[0].batch_number === 'BATCH-2026-X01' &&
            Boolean(updatedItemRows[0].expiry_date) &&
            updatedItemRows[0].dispensed_by_org_id === pharmacyOrgIdA &&
            updatedItemRows[0].dispensed_by_user_id === pharmacistUserIdA &&
            Boolean(updatedItemRows[0].dispensed_at),
            `batch: ${updatedItemRows[0]?.batch_number}, expiry: ${updatedItemRows[0]?.expiry_date}, org: ${updatedItemRows[0]?.dispensed_by_org_id}`
        );

        // Verify dispense_logs table
        const { rows: dLogs } = await db.query('SELECT * FROM dispense_logs WHERE prescription_id = $1 ORDER BY created_at DESC;', [prescriptionId]);
        recordAssertion(
            4,
            'Dispense_logs records item_id, batch_number, item_expiry_date, and pharmacist identity',
            dLogs.length >= 2 &&
            dLogs.some(l => l.batch_number === 'BATCH-2026-X01' && l.quantity_dispensed === 10 && l.pharmacy_org_id === pharmacyOrgIdA),
            `Logs count: ${dLogs.length}, sample batch: ${dLogs[0]?.batch_number}`
        );

        // =====================================================================
        // ITEM 5: DUPLICATE / RIVAL DISPENSATION PREVENTION & ROLE REJECTION
        // =====================================================================
        console.log('\n--- ITEM 5: Rival Dispensation Prevention & Role Enforcement ---');

        // Dispense remaining units of item 1
        await request(`/api/prescriptions/${prescriptionId}/dispense`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${pharmacistTokenA}` },
            body: {
                itemDispenses: [{ itemId: item1.id, quantityDispensed: 11, batchNumber: 'BATCH-2026-X01' }]
            }
        });

        // Setup Rival Pharmacy B
        const regPharmacyB = await request('/api/auth/register-pharmacy', {
            method: 'POST',
            body: {
                pharmacyName: 'Test Rival City Pharmacy Ltd',
                adminName: 'Pharm. John Rival',
                email: testEmailPharmacyB,
                password: 'SecurePassword123!',
                ppbLicenseNumber: 'PPB/PREM/2026/0999'
            }
        });
        const pharmacyOrgIdB = regPharmacyB.body.organization?.id;
        const { rows: uRowsB } = await db.query('SELECT id FROM users WHERE email = $1;', [testEmailPharmacyB]);
        const pharmacistUserIdB = uRowsB[0]?.id;

        // Approve Pharmacy B
        await request(`/api/admin/organizations/${pharmacyOrgIdB}/approve`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${superAdminToken}` }
        });

        // Login Pharmacist B
        const loginB = await request('/api/auth/login', {
            method: 'POST',
            body: { email: testEmailPharmacyB, password: 'SecurePassword123!' }
        });
        const pharmacistTokenB = loginB.body.token;

        // Rival Pharmacy B attempts to re-dispense the already fully filled item 1
        const rivalDispenseRes = await request(`/api/prescriptions/${prescriptionId}/dispense`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${pharmacistTokenB}` },
            body: {
                itemDispenses: [{ itemId: item1.id, quantityDispensed: 5, batchNumber: 'RIVAL-BATCH-1' }]
            }
        });

        recordAssertion(
            5,
            'Rival pharmacy attempt to dispense already filled item is rejected with HTTP 409 Conflict',
            rivalDispenseRes.status === 409 && (rivalDispenseRes.body.error || '').includes('already been completely dispensed'),
            `Status: ${rivalDispenseRes.status}, error: ${rivalDispenseRes.body?.error}`
        );

        // Attempt to dispense more than remaining quantity on item 2 (remaining: 5, attempt: 10)
        const overDispenseRes = await request(`/api/prescriptions/${prescriptionId}/dispense`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${pharmacistTokenA}` },
            body: {
                itemDispenses: [{ itemId: item2.id, quantityDispensed: 10, batchNumber: 'BATCH-OVER' }]
            }
        });

        recordAssertion(
            5,
            'Attempt to exceed remaining prescribed quota is rejected with HTTP 409 Conflict',
            overDispenseRes.status === 409 && (overDispenseRes.body.error || '').includes('Conflict'),
            `Status: ${overDispenseRes.status}, error: ${overDispenseRes.body?.error}`
        );

        // Doctor role rejection check on dispense endpoint
        const doctorToken = jwt.sign({
            id: testDoc.id,
            role: 'doctor',
            organization_id: testDoc.organization_id
        }, JWT_SECRET, { expiresIn: '1h' });

        const doctorDispenseRes = await request(`/api/prescriptions/${prescriptionId}/dispense`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${doctorToken}` },
            body: {
                itemDispenses: [{ itemId: item2.id, quantityDispensed: 1 }]
            }
        });

        recordAssertion(
            5,
            'Doctor role is strictly forbidden from dispensing retail prescriptions (HTTP 403)',
            doctorDispenseRes.status === 403,
            `Status: ${doctorDispenseRes.status}, error: ${doctorDispenseRes.body?.error}`
        );

        // =====================================================================
        // ITEM 6: MULTI-TENANT ISOLATION
        // =====================================================================
        console.log('\n--- ITEM 6: Multi-Tenant Isolation & Directory Protection ---');

        // Pharmacy A requests their dispensations history
        const histResA = await request('/api/pharmacy/dispensations', {
            method: 'GET',
            headers: { Authorization: `Bearer ${pharmacistTokenA}` }
        });

        // Pharmacy B requests their dispensations history
        const histResB = await request('/api/pharmacy/dispensations', {
            method: 'GET',
            headers: { Authorization: `Bearer ${pharmacistTokenB}` }
        });

        const pharmALogs = histResA.body?.dispensations || [];
        const pharmBLogs = histResB.body?.dispensations || [];

        recordAssertion(
            6,
            'Pharmacy A sees only Pharmacy A dispensations; Pharmacy B sees 0 (Tenant Isolation)',
            pharmALogs.length >= 2 &&
            pharmALogs.every(l => l.pharmacy_org_id === pharmacyOrgIdA) &&
            pharmBLogs.length === 0,
            `Pharm A count: ${pharmALogs.length}, Pharm B count: ${pharmBLogs.length}`
        );

        // Metrics endpoint check
        const metricsResA = await request('/api/pharmacy/metrics', {
            method: 'GET',
            headers: { Authorization: `Bearer ${pharmacistTokenA}` }
        });

        recordAssertion(
            6,
            'Pharmacy metrics endpoint calculates tenant-scoped fulfillments',
            metricsResA.status === 200 &&
            metricsResA.body.metrics?.total_units_dispensed >= 21 &&
            metricsResA.body.organization?.id === pharmacyOrgIdA,
            `Units dispensed: ${metricsResA.body?.metrics?.total_units_dispensed}, Org: ${metricsResA.body?.organization?.name}`
        );

        // Verify active organizations directory excludes pharmacies
        const activeOrgsRes = await request('/api/organizations/active', { method: 'GET' });
        const activeOrgs = activeOrgsRes.body || [];
        const containsPharmacy = activeOrgs.some(o => o.org_type === 'pharmacy' || o.id === pharmacyOrgIdA || o.id === pharmacyOrgIdB);

        recordAssertion(
            6,
            'Public active organizations endpoint excludes pharmacies (prevents appointment pollution)',
            activeOrgsRes.status === 200 && !containsPharmacy,
            `Active facilities count: ${activeOrgs.length}, contains pharmacy: ${containsPharmacy}`
        );

        // =====================================================================
        // ITEM 7: LICENSE EXPIRY GATING (READ-ONLY GRACE MODE)
        // =====================================================================
        console.log('\n--- ITEM 7: License Expiry Gating (Read-Only Grace Mode) ---');

        // Expire Pharmacy A's trial
        await db.query(`
            UPDATE organizations 
            SET status = 'expired', license_expires_at = NOW() - INTERVAL '2 days'
            WHERE id = $1;
        `, [pharmacyOrgIdA]);

        // 7a. GET requests in grace mode should succeed (history, metrics)
        const graceHistoryRes = await request('/api/pharmacy/dispensations', {
            method: 'GET',
            headers: { Authorization: `Bearer ${pharmacistTokenA}` }
        });

        recordAssertion(
            7,
            'Expired pharmacy in Read-Only Grace Mode can still read historical dispensations (HTTP 200)',
            graceHistoryRes.status === 200 && Array.isArray(graceHistoryRes.body?.dispensations),
            `Status: ${graceHistoryRes.status}`
        );

        // 7b. Write requests (dispensing) must be blocked with TRIAL_EXPIRED_READ_ONLY
        const blockedDispenseRes = await request(`/api/prescriptions/${prescriptionId}/dispense`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${pharmacistTokenA}` },
            body: {
                itemDispenses: [{ itemId: item2.id, quantityDispensed: 1, batchNumber: 'EXPIRED-ATTEMPT' }]
            }
        });

        recordAssertion(
            7,
            'Expired pharmacy blocked from dispensing with HTTP 403 TRIAL_EXPIRED_READ_ONLY',
            blockedDispenseRes.status === 403 && blockedDispenseRes.body.code === 'TRIAL_EXPIRED_READ_ONLY',
            `Status: ${blockedDispenseRes.status}, code: ${blockedDispenseRes.body?.code}`
        );

        // Restore Pharmacy A to active trial for audit checks
        await db.query(`
            UPDATE organizations 
            SET status = 'trial', license_expires_at = NOW() + INTERVAL '14 days'
            WHERE id = $1;
        `, [pharmacyOrgIdA]);

        // =====================================================================
        // ITEM 8: FULL AUDIT TRAIL INTEGRITY
        // =====================================================================
        console.log('\n--- ITEM 8: Full Audit Trail Integrity ---');

        const { rows: auditEntries } = await db.query(`
            SELECT * FROM audit_logs 
            WHERE organization_id = $1 
            ORDER BY timestamp ASC;
        `, [pharmacyOrgIdA]);

        const regLog = auditEntries.find(l => l.event_type === 'pharmacy_registration_submitted');
        const dispenseLog = auditEntries.find(l => l.event_type === 'prescription_dispensed');

        recordAssertion(
            8,
            'Audit trail logs pharmacy_registration_submitted event with PPB license',
            Boolean(regLog) && regLog.details.includes('PPB/PREM/2026/0842'),
            `Event: ${regLog?.event_type}, details: ${regLog?.details}`
        );

        recordAssertion(
            8,
            'Audit trail logs prescription_dispensed with real superintendent pharmacist name',
            Boolean(dispenseLog) &&
            dispenseLog.doctor_name === 'Pharm. Wanjiku Kimani' &&
            dispenseLog.doctor_id === pharmacistUserIdA,
            `Pharmacist name in audit: ${dispenseLog?.doctor_name}, ID: ${dispenseLog?.doctor_id}`
        );

        // Clean up test organizations
        await db.query('DELETE FROM dispense_logs WHERE prescription_id = $1;', [prescriptionId]);
        await db.query('DELETE FROM prescription_items WHERE prescription_id = $1;', [prescriptionId]);
        await db.query('DELETE FROM prescriptions WHERE id = $1;', [prescriptionId]);
        await db.query('DELETE FROM organizations WHERE id IN ($1, $2);', [pharmacyOrgIdA, pharmacyOrgIdB]);
        await db.query('DELETE FROM users WHERE id IN ($1, $2);', [pharmacistUserIdA, pharmacistUserIdB]);

    } catch (err) {
        console.error('Fatal error during pharmacy domain test runner:', err);
        failed++;
    } finally {
        server.close();
    }

    console.log('\n========================================================================');
    console.log('                 PHARMACY DOMAIN VERIFICATION SUMMARY                   ');
    console.log('========================================================================');
    console.log(`Total Assertions Evaluated: ${passed + failed}`);
    console.log(`Passed:                     ${passed}`);
    console.log(`Failed:                     ${failed}`);
    console.log('========================================================================\n');

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runPharmacyTests();
