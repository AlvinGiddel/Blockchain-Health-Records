/**
 * Runner Script: Prescriptions Addon Module Database Migration
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('../db');

async function runMigration() {
    console.log('================================================================');
    console.log('  RUNNING MIGRATION 07: PRESCRIPTION ADDON MODULE SCHEMA & RLS  ');
    console.log('================================================================');

    const sqlPath = path.join(__dirname, '../migrations/07_prescriptions_addon.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    const client = await db.pool ? await db.pool.connect() : null;
    // In case db.js exports pool or custom query
    try {
        console.log('[Migration] Executing SQL migration script...');
        await db.query(sql);
        console.log('✓ Migration executed successfully!');

        // Verify tables exist
        const { rows } = await db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_name IN ('prescriptions', 'prescription_items', 'dispense_logs')
            ORDER BY table_name;
        `);

        console.log('[Verification] Created tables:', rows.map(r => r.table_name).join(', '));
        if (rows.length === 3) {
            console.log('✓ All 3 prescription tables verified successfully!');
        } else {
            console.warn(`[Warning] Expected 3 tables, found ${rows.length}`);
        }
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    } finally {
        if (client) client.release();
        process.exit(0);
    }
}

runMigration();
