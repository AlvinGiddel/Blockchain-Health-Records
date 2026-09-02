const path = require('path');
const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// Set default process timezone to East Africa Time (EAT - Kenya)
process.env.TZ = 'Africa/Nairobi';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.warn('WARNING: DATABASE_URL is not defined in the environment variables. Ensure .env is configured.');
}

const pool = new Pool({
    connectionString,
    max: 20,
    min: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    keepAlive: true,
    // Enable SSL since Supabase requires SSL connections (skip for localhost testing)
    ssl: (connectionString && (connectionString.includes('localhost') || connectionString.includes('127.0.0.1'))) 
        ? false 
        : { rejectUnauthorized: false }
});

// Configure PostgreSQL session timezone to Africa/Nairobi whenever a client connects
pool.on('connect', (client) => {
    client.query("SET timezone = 'Africa/Nairobi'").catch((err) => {
        console.warn('Failed to set PostgreSQL timezone to Africa/Nairobi:', err.message);
    });
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle database client:', err);
});

// Tenant Context AsyncLocalStorage for automatic Row-Level Security (RLS) session variable propagation
const tenantStorage = new AsyncLocalStorage();

module.exports = {
    query: async (text, params) => {
        const store = tenantStorage.getStore();
        if (store && (store.userId || store.orgId || store.role)) {
            const client = await pool.connect();
            try {
                await client.query('BEGIN;');
                
                if (store.role === 'super_admin') {
                    await client.query("SELECT set_config('app.user_role', 'super_admin', true);");
                    await client.query("SELECT set_config('app.current_user_id', $1, true);", [String(store.userId || '')]);
                    await client.query("SELECT set_config('app.current_org_id', $1, true);", [String(store.orgId || '')]);
                } else {
                    await client.query('SET LOCAL ROLE authenticated;');
                    await client.query("SELECT set_config('app.user_role', $1, true);", [String(store.role || '')]);
                    await client.query("SELECT set_config('app.current_user_id', $1, true);", [String(store.userId || '')]);
                    await client.query("SELECT set_config('app.current_org_id', $1, true);", [String(store.orgId || '')]);
                }

                if (process.env.DEBUG === 'true') {
                    const logText = text.replace(/\s+/g, ' ').trim();
                    console.log(`[RLS Scoped Query] [Role: ${store.role}, Org: ${store.orgId}] Executing: ${logText}`);
                }
                const result = await client.query(text, params);
                await client.query('COMMIT;');
                return result;
            } catch (err) {
                await client.query('ROLLBACK;').catch(() => {});
                throw err;
            } finally {
                client.release();
            }
        }

        if (process.env.DEBUG === 'true') {
            const logText = text.replace(/\s+/g, ' ').trim();
            console.log(`[SQL Query] Executing: ${logText}`);
        }
        return pool.query(text, params);
    },
    pool,
    tenantStorage
};
