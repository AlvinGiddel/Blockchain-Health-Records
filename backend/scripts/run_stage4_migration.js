const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../db');

async function runStage4Migration() {
  const client = await db.pool.connect();
  try {
    console.log('====================================================');
    console.log('STARTING STAGE 4 MIGRATION (PAYMENTS & LICENSING)');
    console.log('====================================================\n');

    await client.query('BEGIN');

    const sqlPath = path.resolve(__dirname, '../migrations/04_stage4_payments.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sqlContent);
    console.log('✓ Payments table and indexes created/verified successfully.');

    await client.query('COMMIT');
    console.log('\n====================================================');
    console.log('STAGE 4 MIGRATION COMPLETED SUCCESSFULLY');
    console.log('====================================================');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed, rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await db.pool.end();
  }
}

runStage4Migration();
