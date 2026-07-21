const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.warn('WARNING: DATABASE_URL is not defined in the environment variables. Ensure .env is configured.');
}

const pool = new Pool({
    connectionString,
    // Enable SSL since Supabase requires SSL connections (skip for localhost testing)
    ssl: (connectionString && (connectionString.includes('localhost') || connectionString.includes('127.0.0.1'))) 
        ? false 
        : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle database client:', err);
});

module.exports = {
    query: (text, params) => {
        // Safe logging of queries
        const logText = text.replace(/\s+/g, ' ').trim();
        console.log(`[SQL Query] Executing: ${logText}`);
        return pool.query(text, params);
    },
    pool
};
