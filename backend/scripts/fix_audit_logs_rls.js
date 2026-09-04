const db = require('../db');

async function fixAuditLogsRLS() {
  const client = await db.pool.connect();
  try {
    console.log('Starting Audit Logs & Records RLS Policy Refinement...');

    await client.query('BEGIN;');

    // 1. Audit Logs: Drop old policies
    await client.query(`DROP POLICY IF EXISTS p_audit_logs_super_admin ON audit_logs;`);
    await client.query(`DROP POLICY IF EXISTS p_audit_logs_clinic_access ON audit_logs;`);
    await client.query(`DROP POLICY IF EXISTS p_audit_logs_patient_access ON audit_logs;`);
    await client.query(`DROP POLICY IF EXISTS p_audit_logs_insert ON audit_logs;`);

    // Super Admin: Full access
    await client.query(`
      CREATE POLICY p_audit_logs_super_admin ON audit_logs
        FOR ALL
        USING (is_super_admin());
    `);

    // Clinic Access: SELECT scoped to clinic organization
    await client.query(`
      CREATE POLICY p_audit_logs_clinic_access ON audit_logs
        FOR SELECT
        USING (organization_id = get_current_org_id());
    `);

    // Patient Access: SELECT scoped to patient
    await client.query(`
      CREATE POLICY p_audit_logs_patient_access ON audit_logs
        FOR SELECT
        USING (patient_id = get_current_user_id());
    `);

    // Append-only Insert: Allow authenticated users and system to append audit events
    await client.query(`
      CREATE POLICY p_audit_logs_insert ON audit_logs
        FOR INSERT
        WITH CHECK (true);
    `);

    // Allow update for mining status (marking is_mined and block_index)
    await client.query(`DROP POLICY IF EXISTS p_audit_logs_update ON audit_logs;`);
    await client.query(`
      CREATE POLICY p_audit_logs_update ON audit_logs
        FOR UPDATE
        USING (is_super_admin() OR organization_id = get_current_org_id() OR organization_id IS NULL)
        WITH CHECK (is_super_admin() OR organization_id = get_current_org_id() OR organization_id IS NULL);
    `);

    // Clean up any test events
    await client.query("DELETE FROM audit_logs WHERE event_type = 'test_event';");

    await client.query('COMMIT;');
    console.log('✓ Successfully updated audit_logs RLS policies and cleaned test data!');

  } catch (err) {
    await client.query('ROLLBACK;').catch(() => {});
    console.error('Failed to update audit_logs RLS:', err);
    process.exit(1);
  } finally {
    client.release();
    process.exit(0);
  }
}

fixAuditLogsRLS();
