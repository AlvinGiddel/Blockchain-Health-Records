/**
 * Runner Script: Migration 09 Pharmacy Portal Module Database Migration
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../db');

async function runMigration() {
    console.log('================================================================');
    console.log('  RUNNING MIGRATION 09: PHARMACY PORTAL ROLE & DISPENSING SCHEMA ');
    console.log('================================================================');

    const sqlPath = path.join(__dirname, '../migrations/09_pharmacy_portal.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    const client = db.pool ? await db.pool.connect() : null;
    try {
        console.log('[Migration] Executing SQL migration script...');
        await (client || db).query(sql);
        console.log('✓ Migration executed successfully!');

        // Verify columns in organizations
        const { rows: orgCols } = await (client || db).query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'organizations' 
              AND column_name IN ('org_type', 'ppb_license_number', 'contact_phone', 'physical_address');
        `);
        console.log('[Verification] Organizations columns added:', orgCols.map(c => c.column_name).join(', '));

        // Verify columns in prescription_items
        const { rows: rxCols } = await (client || db).query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'prescription_items' 
              AND column_name IN ('batch_number', 'expiry_date', 'dispensed_by_org_id', 'dispensed_by_user_id', 'dispensed_at');
        `);
        console.log('[Verification] Prescription_items columns added:', rxCols.map(c => c.column_name).join(', '));

        // Verify columns in dispense_logs
        const { rows: logCols } = await (client || db).query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'dispense_logs' 
              AND column_name IN ('item_id', 'batch_number', 'item_expiry_date');
        `);
        console.log('[Verification] Dispense_logs columns added:', logCols.map(c => c.column_name).join(', '));

    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        if (client) client.release();
        process.exit(0);
    }
}

runMigration();
