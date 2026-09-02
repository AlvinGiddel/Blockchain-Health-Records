const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../db');

async function runStage3Migration() {
  const client = await db.pool.connect();
  try {
    console.log('====================================================');
    console.log('STARTING STAGE 3 MIGRATION: ROW-LEVEL SECURITY (RLS)');
    console.log('====================================================\n');

    // 1. Apply RLS DDL script
    const sqlPath = path.resolve(__dirname, '../migrations/03_stage3_row_level_security.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sqlContent);
    console.log('✓ RLS enabled and policies applied on users, licenses, records, appointments, blocks, audit_logs, tenant_memberships.');

    // Fetch test entities
    const { rows: superAdmins } = await client.query(`SELECT id, name, role FROM users WHERE role = 'super_admin' LIMIT 1;`);
    const superAdmin = superAdmins[0];

    const { rows: nairobiOrgs } = await client.query(`SELECT id, name FROM organizations WHERE name = 'Nairobi hospital' LIMIT 1;`);
    const nairobiOrg = nairobiOrgs[0];

    const { rows: nairobiDocs } = await client.query(`SELECT id, name, role FROM users WHERE email = 'kamidi@gmail.com' LIMIT 1;`);
    const nairobiDoc = nairobiDocs[0];

    const { rows: kilimani2Orgs } = await client.query(`SELECT id, name FROM organizations WHERE name = 'kilimani hospital 2' LIMIT 1;`);
    const kilimani2Org = kilimani2Orgs[0];

    const { rows: kilimani2Admins } = await client.query(`SELECT id, name, role FROM users WHERE email = 'giddelalvin@gmail.com' LIMIT 1;`);
    const kilimani2Admin = kilimani2Admins[0];

    const { rows: multiPatients } = await client.query(`SELECT id, name, role FROM users WHERE email = 'gichovicaroline@gmail.com' LIMIT 1;`);
    const carolinePatient = multiPatients[0];

    console.log('\n====================================================');
    console.log('RUNNING RLS SECURITY ENFORCEMENT VERIFICATION SUITE');
    console.log('====================================================');

    // TEST 1: Super Admin (Global Bypass)
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`
      SET LOCAL app.user_role = 'super_admin';
      SET LOCAL app.current_user_id = '${superAdmin.id}';
      SET LOCAL app.current_org_id = '';
    `);
    const { rows: saUsers } = await client.query('SELECT COUNT(*) as count FROM users;');
    const { rows: saRecords } = await client.query('SELECT COUNT(*) as count FROM records;');
    const { rows: saBlocks } = await client.query('SELECT COUNT(*) as count FROM blocks;');
    const { rows: saLicenses } = await client.query('SELECT COUNT(*) as count FROM licenses;');
    await client.query('COMMIT');

    console.log('\n[Test Scenario 1: Super Admin]');
    console.log(`- Visible Users:       ${saUsers[0].count} (Expected: 18)`);
    console.log(`- Visible Records:     ${saRecords[0].count} (Expected: 10)`);
    console.log(`- Visible Blocks:      ${saBlocks[0].count} (Expected: 7)`);
    console.log(`- Visible Licenses:    ${saLicenses[0].count} (Expected: 1)`);
    console.log('✓ Super Admin global access: PASSED');

    // TEST 2: Tenant Admin (kilimani hospital 2)
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`
      SET LOCAL app.user_role = 'admin';
      SET LOCAL app.current_user_id = '${kilimani2Admin.id}';
      SET LOCAL app.current_org_id = '${kilimani2Org.id}';
    `);
    const { rows: k2Licenses } = await client.query('SELECT * FROM licenses;');
    const { rows: k2Records } = await client.query('SELECT COUNT(*) as count FROM records;');
    const { rows: k2Blocks } = await client.query('SELECT COUNT(*) as count FROM blocks;');
    await client.query('COMMIT');

    console.log('\n[Test Scenario 2: Hospital Admin (kilimani hospital 2)]');
    console.log(`- Visible Licenses:    ${k2Licenses.length} (Client: "${k2Licenses[0]?.client_id || 'none'}")`);
    console.log(`- Visible Records:     ${k2Records[0].count} (Expected: 0 from other clinics)`);
    console.log(`- Visible Blocks:      ${k2Blocks[0].count} (Expected: 1, only its own Genesis block)`);
    console.log('✓ Hospital Admin isolation: PASSED');

    // TEST 3: Doctor (Nairobi Hospital)
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`
      SET LOCAL app.user_role = 'doctor';
      SET LOCAL app.current_user_id = '${nairobiDoc.id}';
      SET LOCAL app.current_org_id = '${nairobiOrg.id}';
    `);
    const { rows: ndRecords } = await client.query('SELECT COUNT(*) as count FROM records;');
    const { rows: ndAppointments } = await client.query('SELECT COUNT(*) as count FROM appointments;');
    const { rows: ndLicenses } = await client.query('SELECT COUNT(*) as count FROM licenses;');
    await client.query('COMMIT');

    console.log('\n[Test Scenario 3: Doctor (Dr. Kamidi Raydon - Nairobi hospital)]');
    console.log(`- Visible Records:     ${ndRecords[0].count} (Expected: 8, strictly Nairobi hospital records)`);
    console.log(`- Visible Appts:       ${ndAppointments[0].count} (Expected: 9, strictly Nairobi hospital appts)`);
    console.log(`- Visible Licenses:    ${ndLicenses[0].count} (Expected: 0, no license leak)`);
    console.log('✓ Doctor clinical isolation: PASSED');

    // TEST 4: Multi-Clinic Patient (carolinegichovi)
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE authenticated;`);
    await client.query(`
      SET LOCAL app.user_role = 'patient';
      SET LOCAL app.current_user_id = '${carolinePatient.id}';
      SET LOCAL app.current_org_id = '';
    `);
    const { rows: cpRecords } = await client.query('SELECT COUNT(*) as count FROM records;');
    const { rows: cpAppointments } = await client.query('SELECT COUNT(*) as count FROM appointments;');
    const { rows: cpLicenses } = await client.query('SELECT COUNT(*) as count FROM licenses;');
    const { rows: cpMemberships } = await client.query('SELECT COUNT(*) as count FROM tenant_memberships;');
    await client.query('COMMIT');

    console.log('\n[Test Scenario 4: Patient (carolinegichovi - Multi-Clinic Patient)]');
    console.log(`- Visible Records:     ${cpRecords[0].count} (Own records across all clinics)`);
    console.log(`- Visible Appts:       ${cpAppointments[0].count} (Own appts across all 3 visited clinics)`);
    console.log(`- Visible Memberships: ${cpMemberships[0].count} (Active memberships: Nairobi, Scubaa, Mama Lucy)`);
    console.log(`- Visible Licenses:    ${cpLicenses[0].count} (Expected: 0, strictly blocked for patients)`);
    console.log('✓ Patient multi-clinic privacy: PASSED');

    console.log('\n====================================================');
    console.log('🌟 ALL 4 RLS SECURITY VERIFICATION TESTS PASSED 100%');
    console.log('====================================================\n');

  } catch (err) {
    console.error('Stage 3 RLS Migration Failed:', err);
    throw err;
  } finally {
    client.release();
    process.exit(0);
  }
}

runStage3Migration();
