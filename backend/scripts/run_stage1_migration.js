const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../db');

async function runStage1Migration() {
  const client = await db.pool.connect();
  try {
    console.log('====================================================');
    console.log('STARTING STAGE 1 MIGRATION & DATA BACKFILL');
    console.log('====================================================\n');

    await client.query('BEGIN');

    // 1. Run DDL migration script
    const sqlPath = path.resolve(__dirname, '../migrations/01_stage1_organizations.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sqlContent);
    console.log('✓ Organizations and tenant_memberships tables created/verified.');

    // 2. Fetch existing licenses data to preserve kilimani hospital 2 license status
    const { rows: existingLicenseRows } = await client.query(`
      SELECT * FROM licenses WHERE client_id = 'kilimani hospital 2' LIMIT 1;
    `);
    const kilimaniLicense = existingLicenseRows[0] || null;

    // 3. Define the initial organizations based on audit decisions
    const initialOrgs = [
      {
        name: 'Nairobi hospital',
        slug: 'nairobi-hospital',
        status: 'active',
        license_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      },
      {
        name: 'Mama Lucy Hospital',
        slug: 'mama-lucy-hospital',
        status: 'active',
        license_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      },
      {
        name: 'scubaa hospital',
        slug: 'scubaa-hospital',
        status: 'active',
        license_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      },
      {
        name: 'Kilimani hospital',
        slug: 'kilimani-hospital',
        status: 'active',
        license_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      },
      {
        name: 'kilimani hospital 2',
        slug: 'kilimani-hospital-2',
        status: kilimaniLicense?.status || 'active',
        license_expires_at: kilimaniLicense?.expires_at || new Date('2026-09-30T07:42:56.000Z')
      },
      {
        name: 'Unassigned / Pending',
        slug: 'unassigned-pending',
        status: 'active',
        license_expires_at: new Date('2099-12-31T23:59:59.000Z')
      }
    ];

    const orgMap = new Map(); // name -> organization row

    for (const org of initialOrgs) {
      const { rows } = await client.query(`
        INSERT INTO organizations (name, slug, status, license_expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (name) DO UPDATE 
          SET slug = EXCLUDED.slug,
              status = EXCLUDED.status,
              license_expires_at = EXCLUDED.license_expires_at,
              updated_at = NOW()
        RETURNING *;
      `, [org.name, org.slug, org.status, org.license_expires_at]);
      orgMap.set(org.name, rows[0]);
      console.log(`✓ Organization initialized: "${org.name}" (ID: ${rows[0].id})`);
    }

    // 4. Backfill Doctors based on doctor_profile.hospital
    const { rows: doctors } = await client.query(`
      SELECT id, name, email, role, doctor_profile 
      FROM users 
      WHERE role = 'doctor';
    `);

    console.log(`\n--- Backfilling Doctors (${doctors.length}) ---`);
    for (const doc of doctors) {
      let hospName = null;
      if (doc.doctor_profile) {
        const dp = typeof doc.doctor_profile === 'string' ? JSON.parse(doc.doctor_profile) : doc.doctor_profile;
        hospName = dp.hospital;
      }

      const org = orgMap.get(hospName);
      if (org) {
        await client.query(`
          INSERT INTO tenant_memberships (user_id, organization_id, role, status)
          VALUES ($1, $2, 'doctor', 'active')
          ON CONFLICT (user_id, organization_id) DO NOTHING;
        `, [doc.id, org.id]);
        console.log(`✓ Doctor: ${doc.name} (${doc.email}) -> Member of: "${org.name}"`);
      } else {
        console.warn(`⚠️ Doctor ${doc.name} has unknown hospital: "${hospName}"`);
      }
    }

    // 5. Backfill Admin (Alvin Giddel -> kilimani hospital 2)
    const { rows: admins } = await client.query(`
      SELECT id, name, email, role 
      FROM users 
      WHERE role = 'admin';
    `);

    console.log(`\n--- Backfilling Admin (${admins.length}) ---`);
    const kilimani2Org = orgMap.get('kilimani hospital 2');
    for (const adm of admins) {
      await client.query(`
        INSERT INTO tenant_memberships (user_id, organization_id, role, status)
        VALUES ($1, $2, 'admin', 'active')
        ON CONFLICT (user_id, organization_id) DO NOTHING;
      `, [adm.id, kilimani2Org.id]);
      console.log(`✓ Admin: ${adm.name} (${adm.email}) -> Member of: "${kilimani2Org.name}"`);
    }

    // 6. Backfill Patients from Appointment Relationships
    const { rows: patients } = await client.query(`
      SELECT id, name, email, role, patient_profile 
      FROM users 
      WHERE role = 'patient';
    `);

    console.log(`\n--- Backfilling Patients (${patients.length}) ---`);
    const unassignedOrg = orgMap.get('Unassigned / Pending');

    for (const pat of patients) {
      // Find all distinct doctor hospitals this patient has appointments with
      const { rows: apptOrgs } = await client.query(`
        SELECT DISTINCT d.doctor_profile
        FROM appointments a
        JOIN users d ON a.doctor_id = d.id
        WHERE a.patient_id = $1;
      `, [pat.id]);

      const linkedHospitalNames = new Set();
      for (const row of apptOrgs) {
        if (row.doctor_profile) {
          const dp = typeof row.doctor_profile === 'string' ? JSON.parse(row.doctor_profile) : row.doctor_profile;
          if (dp.hospital && orgMap.has(dp.hospital)) {
            linkedHospitalNames.add(dp.hospital);
          }
        }
      }

      if (linkedHospitalNames.size > 0) {
        // Patient has active relationship(s)
        for (const hospName of linkedHospitalNames) {
          const org = orgMap.get(hospName);
          await client.query(`
            INSERT INTO tenant_memberships (user_id, organization_id, role, status)
            VALUES ($1, $2, 'patient', 'active')
            ON CONFLICT (user_id, organization_id) DO NOTHING;
          `, [pat.id, org.id]);
          console.log(`✓ Patient: ${pat.name} (${pat.email}) -> Member of: "${org.name}"`);
        }
      } else {
        // Unlinked patient -> Assign to "Unassigned / Pending" and flag profile
        await client.query(`
          INSERT INTO tenant_memberships (user_id, organization_id, role, status)
          VALUES ($1, $2, 'patient', 'active')
          ON CONFLICT (user_id, organization_id) DO NOTHING;
        `, [pat.id, unassignedOrg.id]);

        // Add needsClinicSelection flag
        let prof = {};
        if (pat.patient_profile) {
          prof = typeof pat.patient_profile === 'string' ? JSON.parse(pat.patient_profile) : pat.patient_profile;
        }
        prof.needsClinicSelection = true;
        prof.assignedOrgPlaceholder = 'Unassigned / Pending';

        await client.query(`
          UPDATE users 
          SET patient_profile = $1 
          WHERE id = $2;
        `, [JSON.stringify(prof), pat.id]);

        console.log(`★ Patient: ${pat.name} (${pat.email}) -> Assigned to: "${unassignedOrg.name}" [Flagged for Clinic Selection]`);
      }
    }

    await client.query('COMMIT');
    console.log('\n====================================================');
    console.log('✓ STAGE 1 MIGRATION & BACKFILL COMMITTED SUCCESSFULLY');
    console.log('====================================================');

    // 7. Verify Summary
    const { rows: membershipSummary } = await db.query(`
      SELECT o.name as organization, m.role, COUNT(m.id) as total_members
      FROM tenant_memberships m
      JOIN organizations o ON m.organization_id = o.id
      GROUP BY o.name, m.role
      ORDER BY o.name, m.role;
    `);

    console.log('\n--- Final Membership Distribution by Organization ---');
    console.table(membershipSummary);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed and rolled back:', err);
    throw err;
  } finally {
    client.release();
    process.exit(0);
  }
}

runStage1Migration();
