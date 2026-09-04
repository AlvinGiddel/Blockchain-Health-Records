const db = require('../backend/db');

async function check() {
  try {
    const orgs = await db.query('SELECT id, name, slug, status FROM organizations');
    console.log('--- ORGANIZATIONS ---');
    console.table(orgs.rows);

    const docs = await db.query(`
      SELECT u.id, u.name, u.email, u.role, u.organization_id, o.name as org_name, u.is_approved, u.is_rejected, u.doctor_profile
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.role = 'doctor'
    `);
    console.log('--- DOCTORS ---');
    console.table(docs.rows.map(d => ({
      id: d.id,
      name: d.name,
      email: d.email,
      org_id: d.organization_id,
      org_name: d.org_name,
      approved: d.is_approved,
      rejected: d.is_rejected
    })));

    const patients = await db.query(`
      SELECT u.id, u.name, u.email, u.role, u.organization_id, o.name as org_name
      FROM users u
      LEFT JOIN organizations o ON u.organization_id = o.id
      WHERE u.role = 'patient'
    `);
    console.log('--- PATIENTS ---');
    console.table(patients.rows.map(p => ({
      id: p.id,
      name: p.name,
      email: p.email,
      org_id: p.organization_id,
      org_name: p.org_name
    })));

    const memberships = await db.query(`
      SELECT tm.user_id, u.name, tm.organization_id, o.name as org_name, tm.status
      FROM tenant_memberships tm
      LEFT JOIN users u ON tm.user_id = u.id
      LEFT JOIN organizations o ON tm.organization_id = o.id
    `);
    console.log('--- MEMBERSHIPS ---');
    console.table(memberships.rows);

    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

check();
