/**
 * ==============================================================================
 * Supabase to PostgreSQL Runtime Data Migration Script
 * ==============================================================================
 * Automatically synchronizes all application data from a remote Supabase
 * database into the local PostgreSQL instance (Docker container).
 * 
 * Features:
 * - Runs automatically on container startup when MIGRATE_FROM_SUPABASE_ON_START=true
 * - Fault-tolerant: If offline or Supabase is unreachable, logs a clean warning
 *   and allows the local database to proceed without container crashes.
 * - Dynamic column resolution & JSONB serialization support.
 * - Disables foreign-key replication triggers during sync for deadlock-free import.
 * ==============================================================================
 */

const path = require('path');
const { Client } = require('pg');

// Load environment variables from local .env if available
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const SUPABASE_URL = process.env.SUPABASE_DATABASE_URL || process.env.REMOTE_DATABASE_URL;
const LOCAL_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@postgres:5432/healthchain?sslmode=disable';
const SHOULD_MIGRATE = (process.env.MIGRATE_FROM_SUPABASE_ON_START || 'false').toLowerCase() === 'true';
const IS_STRICT = process.argv.includes('--strict');

// Operational tables in logical dependency order
const SYNC_TABLES = [
    'organizations',
    'users',
    'tenant_memberships',
    'appointments',
    'records',
    'blocks',
    'audit_logs',
    'payments',
    'prescriptions',
    'prescription_items',
    'patient_consents',
    'licenses',
    'kmpdc_registry',
    'nck_registry',
    'dispense_logs'
];

async function migrate() {
    console.log('\n=============================================================');
    console.log(' [Supabase Migration] Initializing Data Synchronization...');
    console.log('=============================================================');

    if (!SHOULD_MIGRATE) {
        console.log('[Supabase Migration] MIGRATE_FROM_SUPABASE_ON_START is set to false. Skipping migration.\n');
        return;
    }

    if (!SUPABASE_URL) {
        console.log('[Supabase Migration] SUPABASE_DATABASE_URL is not defined in environment variables. Skipping migration.\n');
        return;
    }

    const startTime = Date.now();
    console.log(`[Supabase Migration] Source: Remote Supabase Database`);
    console.log(`[Supabase Migration] Target: Local PostgreSQL Database`);

    const supaClient = new Client({
        connectionString: SUPABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000
    });

    const localClient = new Client({
        connectionString: LOCAL_URL,
        connectionTimeoutMillis: 10000
    });

    try {
        // Connect with timeout guard
        await Promise.all([
            supaClient.connect().catch(err => {
                throw new Error(`Failed to connect to Supabase: ${err.message}`);
            }),
            localClient.connect().catch(err => {
                throw new Error(`Failed to connect to Local Postgres: ${err.message}`);
            })
        ]);

        console.log('[Supabase Migration] Database connections established.');

        // Begin local transaction and disable foreign key / trigger constraints
        await localClient.query('BEGIN');
        await localClient.query("SET session_replication_role = 'replica'");

        let totalRowsCopied = 0;

        for (const table of SYNC_TABLES) {
            // Check table exists in Supabase
            const supaTableCheck = await supaClient.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = $1
            `, [table]);

            if (supaTableCheck.rows.length === 0) {
                continue;
            }

            // Check table exists in Local
            const localTableCheck = await localClient.query(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' AND table_name = $1
            `, [table]);

            if (localTableCheck.rows.length === 0) {
                console.warn(`[Supabase Migration] Notice: Table "${table}" does not exist locally. Skipping.`);
                continue;
            }

            // Inspect column schema and data types
            const supaColsRes = await supaClient.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = $1 AND table_schema = 'public'
            `, [table]);

            const localColsRes = await localClient.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = $1 AND table_schema = 'public'
            `, [table]);

            const supaCols = supaColsRes.rows.map(r => r.column_name);
            const localColsMap = {};
            for (const r of localColsRes.rows) {
                localColsMap[r.column_name] = r.data_type;
            }

            // Determine common columns between source and target
            const commonCols = supaCols.filter(c => localColsMap.hasOwnProperty(c));
            if (commonCols.length === 0) continue;

            const colList = commonCols.map(c => `"${c}"`).join(', ');

            // Truncate local table cleanly
            await localClient.query(`TRUNCATE TABLE "${table}" CASCADE`);

            // Fetch data from Supabase
            const dataRes = await supaClient.query(`SELECT ${colList} FROM "${table}"`);
            const rowCount = dataRes.rows.length;

            if (rowCount > 0) {
                for (const row of dataRes.rows) {
                    const values = commonCols.map(c => {
                        const val = row[c];
                        if (val === null || val === undefined) return null;
                        const dataType = localColsMap[c];
                        if (dataType === 'json' || dataType === 'jsonb') {
                            return typeof val === 'object' ? JSON.stringify(val) : val;
                        }
                        return val;
                    });

                    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
                    await localClient.query(
                        `INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`,
                        values
                    );
                }
                totalRowsCopied += rowCount;
                console.log(`[Supabase Migration] Synced ${rowCount.toString().padStart(4)} rows -> "${table}"`);
            } else {
                console.log(`[Supabase Migration] Synced    0 rows -> "${table}" (empty)`);
            }
        }

        // Restore normal constraint and trigger verification
        await localClient.query("SET session_replication_role = 'origin'");
        await localClient.query('COMMIT');

        const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log('-------------------------------------------------------------');
        console.log(`[Supabase Migration] Complete: Successfully synchronized ${totalRowsCopied} rows across ${SYNC_TABLES.length} tables in ${elapsedSeconds}s.`);
        console.log('=============================================================\n');

    } catch (err) {
        try {
            await localClient.query('ROLLBACK');
            await localClient.query("SET session_replication_role = 'origin'");
        } catch (_) {}

        console.error('\n[Supabase Migration Warning] Migration encountered an error:');
        console.error(` -> ${err.message}`);
        
        if (IS_STRICT) {
            console.error('[Supabase Migration] Exiting with error (--strict flag passed).\n');
            process.exit(1);
        } else {
            console.warn('[Supabase Migration] Non-strict mode: Local PostgreSQL service will proceed with existing database data.\n');
        }
    } finally {
        await supaClient.end().catch(() => {});
        await localClient.end().catch(() => {});
    }
}

// Execute migration
migrate().then(() => {
    process.exit(0);
}).catch((fatalErr) => {
    console.error('[Supabase Migration Fatal Error]:', fatalErr.message);
    process.exit(IS_STRICT ? 1 : 0);
});
