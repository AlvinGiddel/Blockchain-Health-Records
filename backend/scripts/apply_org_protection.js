const path = require('path');
const fs = require('fs');
const db = require('../db');

async function applyProtection() {
    try {
        console.log('--- Applying Database-Level Protection on Organizations ---');
        const sqlPath = path.resolve(__dirname, '../migrations/03_protect_organizations.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        await db.query(sql);
        console.log('✅ Trigger trg_protect_production_organizations successfully applied to organizations table.');
        process.exit(0);
    } catch (err) {
        console.error('Failed to apply protection trigger:', err);
        process.exit(1);
    }
}

applyProtection();
