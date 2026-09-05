const db = require('../db');

async function runAudit() {
    console.log('=== 1. AUDIT OF BREAK-GLASS OVERRIDES ===');
    const { rows: breakGlassEvents } = await db.query(
        "SELECT id, timestamp, organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details FROM audit_logs WHERE event_type = 'break_glass' OR event_type ILIKE '%break%glass%' ORDER BY timestamp DESC"
    );
    console.log('Total break-glass events found:', breakGlassEvents.length);
    if (breakGlassEvents.length > 0) {
        console.log(JSON.stringify(breakGlassEvents, null, 2));
    } else {
        console.log('Zero break-glass override events have ever occurred in the database.');
    }

    console.log('\n=== 2. AUDIT OF RECORDS & CONSULTATIONS ===');
    const { rows: recordStats } = await db.query(
        "SELECT record_type, count(*)::int as count, min(timestamp) as earliest, max(timestamp) as latest FROM records GROUP BY record_type"
    );
    console.log('Record counts by type:', recordStats);

    const { rows: allRecords } = await db.query(
        "SELECT id, organization_id, patient_id, doctor_id, doctor_name, record_type, timestamp, notes FROM records ORDER BY timestamp DESC LIMIT 20"
    );
    console.log('\nRecent 20 records:');
    allRecords.forEach(r => {
        console.log(`[${r.timestamp}] ID: ${r.id} | Type: ${r.record_type} | Doctor: ${r.doctor_name} (${r.doctor_id}) | Patient: ${r.patient_id} | HasNotes: ${Boolean(r.notes)}`);
    });

    const { rows: notesRecords } = await db.query(
        "SELECT id, doctor_name, notes FROM records WHERE notes IS NOT NULL AND notes != ''"
    );
    console.log('\nRecords with specialist notes attached:', notesRecords.length);
    console.log(JSON.stringify(notesRecords, null, 2));

    console.log('\n=== 3. AUDIT OF APPOINTMENTS ===');
    const { rows: apptStats } = await db.query(
        "SELECT status, count(*)::int as count, min(created_at) as earliest, max(created_at) as latest FROM appointments GROUP BY status"
    );
    console.log('Appointment counts by status:', apptStats);

    const { rows: appts } = await db.query(
        "SELECT id, patient_name, doctor_name, date, time, status, created_at, organization_id FROM appointments ORDER BY created_at DESC LIMIT 25"
    );
    console.log('\nRecent 25 appointments:');
    appts.forEach(a => {
        console.log(`[${a.created_at}] ID: ${a.id} | Status: ${a.status} | Patient: ${a.patient_name} -> Doctor: ${a.doctor_name} on ${a.date} ${a.time} | Org: ${a.organization_id}`);
    });

    process.exit(0);
}

runAudit().catch(err => {
    console.error('Audit query error:', err);
    process.exit(1);
});
