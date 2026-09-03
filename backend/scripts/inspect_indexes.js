const db = require('../db');

async function inspect() {
    try {
        const query = `
            SELECT
                tablename,
                indexname,
                indexdef
            FROM pg_indexes
            WHERE schemaname = 'public'
            ORDER BY tablename, indexname;
        `;
        const res = await db.query(query);
        console.log(`Found ${res.rows.length} indexes in public schema:`);
        for (const row of res.rows) {
            console.log(`- [${row.tablename}] ${row.indexname}`);
        }
        process.exit(0);
    } catch (err) {
        console.error('Error inspecting indexes:', err);
        process.exit(1);
    }
}

inspect();
