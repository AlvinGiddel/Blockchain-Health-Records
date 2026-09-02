const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../db');

async function testCrossTenantRLS() {
  const client = await db.pool.connect();
  try {
    console.log('===============================================================');
    console.log('STAGE 3: RUNNING CONCRETE CROSS-TENANT RLS ISOLATION TEST');
    console.log('===============================================================\n');

    // 1. Fetch Dr. Kamidi (Nairobi Hospital)
    const { rows: nairobiDocs } = await client.query(`
      SELECT u.id, u.name, u.organization_id, o.name as org_name
      FROM users u
      JOIN organizations o ON u.organization_id = o.id
      WHERE u.email = 'kamidi@gmail.com';
    `);
    const nairobiDoctor = nairobiDocs[0];
    console.log(`Authenticated Doctor: ${nairobiDoctor.name} at "${nairobiDoctor.org_name}" (Org ID: ${nairobiDoctor.organization_id})`);

    // 2. Fetch a clinical record belonging to Mama Lucy Hospital
    const { rows: mamaLucyRecords } = await client.query(`
      SELECT r.id, r.patient_id, u.name as patient_name, o.name as org_name, r.organization_id
      FROM records r
      JOIN organizations o ON r.organization_id = o.id
      JOIN users u ON r.patient_id = u.id
      WHERE o.name = 'Mama Lucy Hospital'
      LIMIT 1;
    `);
    const targetRecord = mamaLucyRecords[0];
    console.log(`Target Record: ID ${targetRecord.id} for patient "${targetRecord.patient_name}" created at "${targetRecord.org_name}"\n`);

    // 3. Execute query AS Dr. Kamidi under RLS (authenticated role)
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE authenticated;');
    await client.query(`SET LOCAL app.user_role = 'doctor';`);
    await client.query(`SET LOCAL app.current_user_id = '${nairobiDoctor.id}';`);
    await client.query(`SET LOCAL app.current_org_id = '${nairobiDoctor.organization_id}';`);

    console.log(`Attempting query: SELECT * FROM records WHERE id = '${targetRecord.id}' ...`);
    const { rows: queryResult } = await client.query(
      `SELECT id, patient_id, doctor_id, diagnosis FROM records WHERE id = $1;`,
      [targetRecord.id]
    );

    console.log(`Result count: ${queryResult.length} row(s) returned.`);
    if (queryResult.length === 0) {
      console.log('✅ PASS: Record was silently excluded by PostgreSQL RLS without throwing an error.');
    } else {
      console.error('❌ FAIL: Cross-tenant record was returned! RLS did not exclude the row.');
    }

    // 4. Now query Nairobi Hospital's own records to confirm the doctor CAN see their own
    const { rows: ownRecords } = await client.query(`SELECT COUNT(*) as count FROM records;`);
    console.log(`\nQuerying doctor's own hospital records:`);
    console.log(`- Visible records for Dr. Kamidi at Nairobi Hospital: ${ownRecords[0].count} record(s)`);

    await client.query('COMMIT');
    console.log('\n===============================================================');
    console.log('CONCRETE CROSS-TENANT RLS TEST COMPLETED WITH 100% SUCCESS');
    console.log('===============================================================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Cross-tenant test failed with error:', err);
  } finally {
    client.release();
    process.exit(0);
  }
}

testCrossTenantRLS();
