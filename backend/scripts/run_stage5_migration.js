const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const db = require('../db');

async function runStage5Migration() {
  const client = await db.pool.connect();
  try {
    console.log('====================================================');
    console.log('STARTING STAGE 5 MIGRATION (PERFORMANCE INDEXING)');
    console.log('====================================================\n');

    await client.query('BEGIN');

    const sqlPath = path.resolve(__dirname, '../migrations/05_stage5_performance_indexes.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sqlContent);
    console.log('✓ Performance, mempool, and cryptographic indexes created successfully.');

    await client.query('COMMIT');
    console.log('\n====================================================');
    console.log('STAGE 5 MIGRATION COMPLETED SUCCESSFULLY');
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

runStage5Migration();
