const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../db');
const { getKenyanTimestamp, Blockchain, Block } = require('../blockchain');

function calculateBlockHash(index, timestamp, records, previousHash, nonce) {
  const dataStr = typeof records === 'string' ? records : JSON.stringify(records);
  return crypto
    .createHash('sha256')
    .update(index + timestamp + dataStr + previousHash + nonce)
    .digest('hex');
}

async function runStage2Migration() {
  const client = await db.pool.connect();
  try {
    console.log('====================================================');
    console.log('STARTING STAGE 2 MIGRATION & ISOLATED CHAIN MIGRATION');
    console.log('====================================================\n');

    await client.query('BEGIN');

    // 1. Run DDL migration script to add organization_id across tables
    const sqlPath = path.resolve(__dirname, '../migrations/02_stage2_schema_organization_id.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sqlContent);
    console.log('✓ Added organization_id foreign key columns and indexes.');

    // 2. Backfill users.organization_id for doctors and admins from tenant_memberships
    const userBackfillRes = await client.query(`
      UPDATE users u
      SET organization_id = tm.organization_id
      FROM tenant_memberships tm
      WHERE u.id = tm.user_id 
        AND tm.role IN ('doctor', 'admin')
        AND u.organization_id IS NULL;
    `);
    console.log(`✓ Backfilled organization_id for ${userBackfillRes.rowCount} doctor/admin users.`);

    // 3. Backfill appointments.organization_id from the assigned doctor's organization
    const apptBackfillRes = await client.query(`
      UPDATE appointments a
      SET organization_id = u.organization_id
      FROM users u
      WHERE a.doctor_id = u.id
        AND a.organization_id IS NULL;
    `);
    console.log(`✓ Backfilled organization_id for ${apptBackfillRes.rowCount} appointments.`);

    // Set NOT NULL on appointments.organization_id
    await client.query(`
      ALTER TABLE appointments 
      ALTER COLUMN organization_id SET NOT NULL;
    `);
    console.log('✓ Enforced NOT NULL constraint on appointments.organization_id.');

    // 4. Backfill records.organization_id from the authoring doctor's organization
    const recordsBackfillRes = await client.query(`
      UPDATE records r
      SET organization_id = u.organization_id
      FROM users u
      WHERE r.doctor_id = u.id
        AND r.organization_id IS NULL;
    `);
    console.log(`✓ Backfilled organization_id for ${recordsBackfillRes.rowCount} medical records.`);

    // Set NOT NULL on records.organization_id
    await client.query(`
      ALTER TABLE records 
      ALTER COLUMN organization_id SET NOT NULL;
    `);
    console.log('✓ Enforced NOT NULL constraint on records.organization_id.');

    // 5. Backfill audit_logs.organization_id
    const auditDoctorRes = await client.query(`
      UPDATE audit_logs a
      SET organization_id = u.organization_id
      FROM users u
      WHERE a.doctor_id = u.id
        AND u.organization_id IS NOT NULL
        AND a.organization_id IS NULL;
    `);
    console.log(`✓ Backfilled audit_logs organization_id via doctor matches: ${auditDoctorRes.rowCount}`);

    const auditPatientRes = await client.query(`
      UPDATE audit_logs a
      SET organization_id = tm.organization_id
      FROM tenant_memberships tm
      WHERE a.patient_id = tm.user_id
        AND a.organization_id IS NULL;
    `);
    console.log(`✓ Backfilled audit_logs organization_id via patient memberships: ${auditPatientRes.rowCount}`);

    // 6. Backfill licenses.organization_id
    const licenseRes = await client.query(`
      UPDATE licenses l
      SET organization_id = o.id
      FROM organizations o
      WHERE o.name = l.client_id
        AND l.organization_id IS NULL;
    `);
    console.log(`✓ Linked licenses to organization: ${licenseRes.rowCount} row(s).`);

    // 7. Blockchain Migration: Preserve Existing Blocks #0 & #1
    // Fetch Mama Lucy Hospital UUID
    const { rows: mamaLucyRows } = await client.query(`
      SELECT id, name FROM organizations WHERE name = 'Mama Lucy Hospital' LIMIT 1;
    `);
    const mamaLucyOrg = mamaLucyRows[0];
    if (!mamaLucyOrg) throw new Error('Mama Lucy Hospital organization not found.');

    // Assign existing blocks to Mama Lucy Hospital
    await client.query(`
      UPDATE blocks 
      SET organization_id = $1 
      WHERE index IN (0, 1) AND organization_id IS NULL;
    `, [mamaLucyOrg.id]);
    console.log(`✓ Existing Block #0 and Block #1 assigned to: "${mamaLucyOrg.name}" (${mamaLucyOrg.id})`);

    // Fetch and verify Block #0 and Block #1 hashes
    const { rows: existingBlocks } = await client.query(`
      SELECT index, timestamp, records, previous_hash, nonce, hash 
      FROM blocks 
      WHERE organization_id = $1 
      ORDER BY index;
    `, [mamaLucyOrg.id]);

    console.log('\n--- VERIFYING PRE-EXISTING BLOCKS #0 & #1 INTEGRITY ---');
    // Block #0 Original Payload Check
    const genesisDataStr = JSON.stringify([{ txType: 'medical', message: 'Genesis Block: Blockchain Health Records Ledger Initialized', doctor: 'System Admin' }]);
    const block0Computed = crypto.createHash('sha256').update(0 + existingBlocks[0].timestamp + genesisDataStr + '0' + existingBlocks[0].nonce).digest('hex');
    const block0Pass = block0Computed === existingBlocks[0].hash;
    console.log(`Block #0 (Genesis):`);
    console.log(`  Stored Hash:   ${existingBlocks[0].hash}`);
    console.log(`  Computed Hash: ${block0Computed}`);
    console.log(`  Integrity:     ${block0Pass ? 'PASSED (100% UNCHANGED MATCH)' : 'FAILED'}`);

    // Block #1 Payload Check
    const block1Computed = calculateBlockHash(existingBlocks[1].index, existingBlocks[1].timestamp, existingBlocks[1].records, existingBlocks[1].previous_hash, existingBlocks[1].nonce);
    const block1Pass = block1Computed === existingBlocks[1].hash;
    console.log(`Block #1 (Consultation Transaction):`);
    console.log(`  Stored Hash:   ${existingBlocks[1].hash}`);
    console.log(`  Computed Hash: ${block1Computed}`);
    console.log(`  Integrity:     ${block1Pass ? 'PASSED (100% UNCHANGED MATCH)' : 'FAILED'}`);

    // Verify linkage between Block 1 and Block 0
    const linkagePass = existingBlocks[1].previous_hash === existingBlocks[0].hash;
    console.log(`  Chain Linkage: ${linkagePass ? 'VALID (Block #1 previous_hash matches Block #0 hash)' : 'BROKEN'}`);

    if (!block0Pass || !block1Pass || !linkagePass) {
      throw new Error('Pre-existing block integrity check failed!');
    }

    // 8. Drop legacy global single-tenant index uniqueness so each organization has its own Genesis Block (index: 0)
    await client.query(`
      ALTER TABLE blocks DROP CONSTRAINT IF EXISTS blocks_index_key;
    `);

    // Seed Isolated Genesis Blocks for other organizations
    const { rows: otherOrgs } = await client.query(`
      SELECT id, name FROM organizations WHERE id != $1;
    `, [mamaLucyOrg.id]);

    console.log(`\n--- Seeding Genesis Blocks for Other Organizations (${otherOrgs.length}) ---`);
    for (const org of otherOrgs) {
      // Check if genesis already exists
      const { rows: checkGen } = await client.query(`
        SELECT id FROM blocks WHERE organization_id = $1 AND index = 0;
      `, [org.id]);

      if (checkGen.length === 0) {
        const genesisTimestamp = getKenyanTimestamp();
        const genesisRecords = [{
          txType: 'medical',
          message: `Genesis Block: ${org.name} Ledger Initialized`,
          doctor: 'System Admin'
        }];
        const genesisPrevHash = '0';
        let nonce = 0;
        let genesisHash = '';

        // Simple POW difficulty 2 mining
        while (true) {
          genesisHash = calculateBlockHash(0, genesisTimestamp, genesisRecords, genesisPrevHash, nonce);
          if (genesisHash.startsWith('00')) break;
          nonce++;
        }

        await client.query(`
          INSERT INTO blocks (index, timestamp, records, previous_hash, nonce, hash, organization_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7);
        `, [0, genesisTimestamp, JSON.stringify(genesisRecords), genesisPrevHash, nonce.toString(), genesisHash, org.id]);

        console.log(`✓ Genesis Block created for "${org.name}": Hash: ${genesisHash} (nonce: ${nonce})`);
      }
    }

    // Remove old single-tenant UNIQUE constraint on index if it exists
    await client.query(`
      ALTER TABLE blocks DROP CONSTRAINT IF EXISTS blocks_index_key;
    `);

    // Enforce NOT NULL and composite uniqueness on (organization_id, index)
    await client.query(`
      ALTER TABLE blocks ALTER COLUMN organization_id SET NOT NULL;
    `);
    
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_blocks_org_index'
        ) THEN
          ALTER TABLE blocks ADD CONSTRAINT uq_blocks_org_index UNIQUE (organization_id, index);
        END IF;
      END $$;
    `);
    console.log('✓ Enforced composite unique constraint (organization_id, index) on blocks.');

    await client.query('COMMIT');
    console.log('\n====================================================');
    console.log('✓ STAGE 2 MIGRATION COMMITTED SUCCESSFULLY');
    console.log('====================================================\n');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Stage 2 Migration Failed and Rolled Back:', err);
    throw err;
  } finally {
    client.release();
  }

  // Verification Report across all organizations
  await printVerificationReport();
  process.exit(0);
}

async function printVerificationReport() {
  console.log('====================================================');
  console.log('STAGE 2 POST-MIGRATION VERIFICATION REPORT');
  console.log('====================================================');

  const { rows: blockCounts } = await db.query(`
    SELECT o.name as organization, COUNT(b.id) as block_height, MAX(b.index) as max_index
    FROM organizations o
    LEFT JOIN blocks b ON o.id = b.organization_id
    GROUP BY o.name
    ORDER BY block_height DESC, o.name;
  `);
  console.log('\n--- Blockchain Ledger Height Per Organization ---');
  console.table(blockCounts);

  const { rows: apptCounts } = await db.query(`
    SELECT o.name as organization, COUNT(a.id) as total_appointments
    FROM organizations o
    LEFT JOIN appointments a ON o.id = a.organization_id
    GROUP BY o.name
    ORDER BY total_appointments DESC;
  `);
  console.log('\n--- Appointments Distribution Per Organization ---');
  console.table(apptCounts);

  const { rows: recCounts } = await db.query(`
    SELECT o.name as organization, COUNT(r.id) as total_records
    FROM organizations o
    LEFT JOIN records r ON o.id = r.organization_id
    GROUP BY o.name
    ORDER BY total_records DESC;
  `);
  console.log('\n--- Medical Records Distribution Per Organization ---');
  console.table(recCounts);

  // Deep cryptographic verification of Mama Lucy Hospital's pre-existing chain
  const { rows: mamaLucyBlocks } = await db.query(`
    SELECT b.index, b.timestamp, b.records, b.previous_hash, b.nonce, b.hash, o.name as organization
    FROM blocks b
    JOIN organizations o ON b.organization_id = o.id
    WHERE o.name = 'Mama Lucy Hospital'
    ORDER BY b.index;
  `);

  console.log('\n--- Pre-Existing Blocks SHA-256 Verification Report ---');
  for (const b of mamaLucyBlocks) {
    console.log(`[${b.organization}] Block #${b.index}:`);
    console.log(`   Hash:          ${b.hash}`);
    console.log(`   Previous Hash: ${b.previous_hash}`);
    console.log(`   Nonce:         ${b.nonce}`);
    console.log(`   Records Count: ${Array.isArray(b.records) ? b.records.length : 1}`);
  }

  // Built-in isChainValid() check
  const bc = new Blockchain();
  bc.chain = mamaLucyBlocks.map(b => {
    const blk = new Block(b.index, b.timestamp, b.records, b.previous_hash);
    blk.nonce = parseInt(b.nonce);
    blk.hash = b.hash;
    return blk;
  });
  console.log(`\nMama Lucy Hospital isChainValid(): ${bc.isChainValid() ? '✅ VALID (Chain Untampered)' : '❌ INVALID'}\n`);
}

runStage2Migration();
