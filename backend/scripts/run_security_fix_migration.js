const db = require('../db');

async function migrate() {
    console.log('--- Applying is_demo_data column to records table ---');
    try {
        await db.query(`
            ALTER TABLE records 
            ADD COLUMN IF NOT EXISTS is_demo_data BOOLEAN NOT NULL DEFAULT false;
        `);
        console.log('Successfully added is_demo_data column to records.');

        await db.query(`
            CREATE INDEX IF NOT EXISTS idx_records_is_demo_data ON records (is_demo_data);
        `);
        console.log('Successfully created index idx_records_is_demo_data.');

        const { rows } = await db.query(`
            SELECT column_name, data_type, column_default, is_nullable
            FROM information_schema.columns 
            WHERE table_name = 'records' AND column_name = 'is_demo_data';
        `);
        console.log('Verified column in database:', rows[0]);
    } catch (err) {
        console.error('Migration error:', err);
    } finally {
        process.exit(0);
    }
}

migrate();
