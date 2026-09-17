const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config();

const connectionString = process.env.lIVE_DATABASE_URL || process.env.LIVE_DATABASE_URL;

if (!connectionString) {
    console.error("No LIVE_DATABASE_URL found in .env");
    process.exit(1);
}

const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        await client.connect();
        console.log("Connected to Neon DB successfully.");

        const migrationsDir = path.join(__dirname, 'migrations');
        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

        for (const file of files) {
            console.log(`Executing migration: ${file}`);
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
            try {
                await client.query(sql);
                console.log(`✅ Passed: ${file}`);
            } catch (err) {
                console.error(`❌ Failed: ${file}`);
                console.error(err.message);
                throw err;
            }
        }
        
        console.log("All migrations completed successfully!");
        process.exit(0);
    } catch (e) {
        console.error("Migration error:", e);
        process.exit(1);
    }
}

run();
