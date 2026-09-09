/**
 * PPB Premises Registry Migration Runner
 * Applies migration 10_ppb_premises_registry.sql to the active database.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const db = require('../db');

async function runMigration() {
    console.log('='.repeat(60));
    console.log('  Running Migration: 10_ppb_premises_registry.sql');
    console.log('='.repeat(60));

    const sqlPath = path.resolve(__dirname, '../migrations/10_ppb_premises_registry.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    try {
        await db.pool.query(sql);
        console.log('\n✅ Migration applied successfully.\n');

        // Verify the table and count rows
        const { rows: countRows } = await db.pool.query('SELECT COUNT(*) as total FROM ppb_premises;');
        const { rows: activeRows } = await db.pool.query("SELECT COUNT(*) as active FROM ppb_premises WHERE status = 'active';");
        const { rows: suspRows }   = await db.pool.query("SELECT COUNT(*) as suspended FROM ppb_premises WHERE status = 'suspended';");

        console.log('📋 ppb_premises table summary:');
        console.log(`   Total records : ${countRows[0].total}`);
        console.log(`   Active        : ${activeRows[0].active}`);
        console.log(`   Suspended     : ${suspRows[0].suspended}`);

        // Show sample records
        const { rows: samples } = await db.pool.query(
            'SELECT license_number, premises_name, county, status FROM ppb_premises ORDER BY license_number LIMIT 5;'
        );
        console.log('\n📌 Sample records:');
        samples.forEach(r => {
            console.log(`   ${r.license_number.padEnd(22)} | ${r.premises_name.padEnd(40)} | ${r.county.padEnd(12)} | ${r.status}`);
        });

        console.log('\n' + '='.repeat(60));
        console.log('  Migration complete.');
        console.log('='.repeat(60));
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        await db.pool.end();
    }
}

runMigration();
