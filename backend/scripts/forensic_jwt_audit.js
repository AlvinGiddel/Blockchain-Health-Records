const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../db');

async function runForensicAudit() {
    console.log('========================================================================');
    console.log('        FORENSIC SECURITY AUDIT: JWT_SECRET EXPLOITATION CHECK        ');
    console.log('========================================================================\n');

    // 1. Inspect all audit_logs
    console.log('--- 1. AUDIT LOGS INSPECTION ---');
    const { rows: allAuditLogs } = await db.query(
        `SELECT id, organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp, is_mined, block_index 
         FROM audit_logs 
         ORDER BY timestamp ASC`
    );
    console.log(`Total Audit Log entries recorded: ${allAuditLogs.length}`);

    // Group by event_type
    const eventCounts = {};
    for (const log of allAuditLogs) {
        eventCounts[log.event_type] = (eventCounts[log.event_type] || 0) + 1;
    }
    console.log('Event types breakdown:', JSON.stringify(eventCounts, null, 2));

    // 2. Check for Orphan or Unregistered User IDs in audit_logs
    console.log('\n--- 2. CROSS-REFERENCING AUDIT ACTORS WITH REGISTERED USERS ---');
    const { rows: users } = await db.query('SELECT id, name, email, role, created_at FROM users');
    const userMap = new Map();
    users.forEach(u => userMap.set(u.id, u));
    console.log(`Total Registered Users in database: ${users.length}`);

    const suspiciousAuditLogs = [];
    for (const log of allAuditLogs) {
        let isSuspicious = false;
        let reasons = [];

        // Check if doctor_id exists in users (if present)
        if (log.doctor_id) {
            if (!userMap.has(log.doctor_id)) {
                isSuspicious = true;
                reasons.push(`doctor_id (${log.doctor_id}) does not exist in users table`);
            } else {
                const userObj = userMap.get(log.doctor_id);
                // Check if role is consistent or name mismatch
                if (userObj.role !== 'doctor' && userObj.role !== 'admin' && userObj.role !== 'super_admin') {
                    isSuspicious = true;
                    reasons.push(`doctor_id role in users is '${userObj.role}' (unexpected for doctor_id field)`);
                }
            }
        }

        // Check if patient_id exists in users (if present and not null)
        if (log.patient_id) {
            if (!userMap.has(log.patient_id)) {
                isSuspicious = true;
                reasons.push(`patient_id (${log.patient_id}) does not exist in users table`);
            }
        }

        if (isSuspicious) {
            suspiciousAuditLogs.push({ log, reasons });
        }
    }

    if (suspiciousAuditLogs.length === 0) {
        console.log('✓ Zero orphan or unregistered user IDs found in audit_logs.');
    } else {
        console.log(`⚠️ FOUND ${suspiciousAuditLogs.length} SUSPICIOUS AUDIT ENTRIES:`);
        console.log(JSON.stringify(suspiciousAuditLogs, null, 2));
    }

    // 3. Inspect Break-Glass events specifically (prime target for forged tokens)
    console.log('\n--- 3. EMERGENCY BREAK-GLASS EVENTS INSPECTION ---');
    const breakGlassLogs = allAuditLogs.filter(l => l.event_type.includes('break_glass'));
    console.log(`Total Break-Glass events found: ${breakGlassLogs.length}`);
    for (const bg of breakGlassLogs) {
        const doc = userMap.get(bg.doctor_id);
        const pat = userMap.get(bg.patient_id);
        console.log(` - Timestamp: ${bg.timestamp}`);
        console.log(`   Doctor: ${bg.doctor_name} (ID: ${bg.doctor_id}) -> Found in DB: ${Boolean(doc)} [${doc?.email}]`);
        console.log(`   Patient: ${bg.patient_name} (ID: ${bg.patient_id}) -> Found in DB: ${Boolean(pat)} [${pat?.email}]`);
        console.log(`   Details: ${bg.details}`);
    }

    // 4. Check for anomalous records in medical records table
    console.log('\n--- 4. CLINICAL RECORDS AUTHORSHIP & INTEGRITY ---');
    const { rows: records } = await db.query(
        `SELECT id, patient_id, doctor_id, doctor_name, record_type, timestamp, organization_id, is_mined, block_index 
         FROM records 
         ORDER BY timestamp ASC`
    );
    console.log(`Total Records recorded: ${records.length}`);

    const orphanRecords = [];
    for (const r of records) {
        const hasPatient = userMap.has(r.patient_id);
        const hasDoctor = userMap.has(r.doctor_id);
        if (!hasPatient || !hasDoctor) {
            orphanRecords.push({
                recordId: r.id,
                patientId: r.patient_id,
                hasPatient,
                doctorId: r.doctor_id,
                hasDoctor,
                doctorName: r.doctor_name,
                timestamp: r.timestamp
            });
        }
    }

    if (orphanRecords.length === 0) {
        console.log('✓ All clinical records are strictly authored by known, valid practitioners and attached to registered patients.');
    } else {
        console.log(`⚠️ FOUND ${orphanRecords.length} ORPHAN RECORDS:`);
        console.log(JSON.stringify(orphanRecords, null, 2));
    }

    // 5. Inspect Users Table for Unauthorized Super Admin or Privileged Accounts
    console.log('\n--- 5. PRIVILEGED ACCOUNTS & REGISTRATION AUDIT ---');
    const { rows: privilegedUsers } = await db.query(
        `SELECT id, name, email, role, organization_id, is_approved, is_rejected, created_at 
         FROM users 
         WHERE role IN ('admin', 'super_admin') 
         ORDER BY created_at ASC`
    );
    console.log(`Total Admins & Super Admins: ${privilegedUsers.length}`);
    for (const pu of privilegedUsers) {
        console.log(` - [${pu.role.toUpperCase()}] ${pu.name} <${pu.email}> (Org: ${pu.organization_id || 'Global'}, Approved: ${pu.is_approved}, Created: ${pu.created_at})`);
    }

    // 6. Check Current Environment Config for JWT_SECRET
    console.log('\n--- 6. CURRENT JWT CONFIGURATION CHECK ---');
    const currentSecret = process.env.JWT_SECRET;
    console.log(`process.env.JWT_SECRET defined: ${Boolean(currentSecret)}`);
    console.log(`Secret length: ${currentSecret ? currentSecret.length : 0} characters`);
    const isTrivial = !currentSecret || currentSecret === '12345' || currentSecret === 'blockchain_health_secret_key_12345' || currentSecret.length < 32;
    console.log(`Is trivially guessable/default: ${isTrivial}`);

    console.log('\n========================================================================');
    console.log('                         AUDIT COMPLETE                                 ');
    console.log('========================================================================');

    process.exit(0);
}

runForensicAudit().catch(err => {
    console.error('Audit failure:', err);
    process.exit(1);
});
