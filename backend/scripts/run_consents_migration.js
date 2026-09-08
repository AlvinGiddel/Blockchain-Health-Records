/**
 * Runner Script: Patient Consents Migration 08
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../db');

async function runMigration() {
    console.log('================================================================');
    console.log('  RUNNING MIGRATION 08: PATIENT CONSENTS & ACCESS DELEGATION   ');
    console.log('================================================================');

    const sqlPath = path.join(__dirname, '../migrations/08_patient_consents.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    try {
        console.log('[Migration] Executing SQL migration script...');
        await db.query(sql);
        console.log('✓ Migration executed successfully!');

        const { rows } = await db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_name = 'patient_consents';
        `);

        if (rows.length > 0) {
            console.log('✓ patient_consents table verified successfully in database!');
        } else {
            console.warn('[Warning] patient_consents table was not found in schema.');
        }
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

runMigration();
