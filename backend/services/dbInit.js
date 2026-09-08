/**
 * Database Initialization & Schema Bootstrap Service
 * 
 * Verifies table schemas, runs incremental column additions (e.g. profile_photo),
 * and bootstraps foundational reference registries (e.g. KMPDC Council Registry).
 */

const db = require('../db');

/**
 * Initialize KMPDC Council Registry Table & Seed verified medical practitioners
 */
async function initKmpdcRegistry() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS kmpdc_registry (
                license_number VARCHAR(50) PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                cadre VARCHAR(100) NOT NULL DEFAULT 'Medical Practitioner',
                specialization VARCHAR(255) DEFAULT 'General Medicine',
                status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired')),
                retention_year INTEGER DEFAULT 2026,
                facility VARCHAR(255) DEFAULT 'National Health Service',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                last_verified_at TIMESTAMPTZ DEFAULT NOW()
            );

            -- Ensure organization_id column exists to tie practitioners to multi-tenant client facilities
            ALTER TABLE kmpdc_registry ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
            CREATE INDEX IF NOT EXISTS idx_kmpdc_org_id ON kmpdc_registry(organization_id);

            -- Backfill organization_id where facility text clearly matches an existing client organization
            UPDATE kmpdc_registry k
            SET organization_id = o.id
            FROM organizations o
            WHERE k.organization_id IS NULL
              AND LOWER(TRIM(k.facility)) = LOWER(TRIM(o.name));

            INSERT INTO kmpdc_registry (license_number, full_name, cadre, specialization, status, retention_year, facility)
            VALUES 
                ('A12345', 'Dr. Alvin Giddel Mutuku', 'Medical Practitioner', 'Cardiology & Internal Medicine', 'active', 2026, 'Kenyatta National Hospital'),
                ('A45892', 'Dr. Jane Wanjiku Kamau', 'Medical Practitioner', 'General Surgery', 'active', 2026, 'Avenue Healthcare Nairobi'),
                ('A56712', 'Dr. David Ochieng Otieno', 'Medical Practitioner', 'Pediatrics & Child Health', 'active', 2026, 'Aga Khan University Hospital'),
                ('A78901', 'Dr. Faith Chebet Rono', 'Medical Practitioner', 'Obstetrics & Gynecology', 'active', 2026, 'Moi Teaching and Referral Hospital'),
                ('A90123', 'Dr. Michael Mwangi Kariuki', 'Medical Practitioner', 'Neurology & Critical Care', 'active', 2026, 'Nairobi Hospital'),
                ('B10234', 'Dr. Sarah Nyambura Ndungu', 'Dentist', 'Orthodontics & Dental Surgery', 'active', 2026, 'Upper Hill Medical Centre'),
                ('B20456', 'Dr. Brian Kiprop Korir', 'Dentist', 'Oral & Maxillofacial Surgery', 'active', 2026, 'Eldoret Dental Clinic'),
                ('A99999', 'Dr. Suspended Practitioner Example', 'Medical Practitioner', 'General Practice', 'suspended', 2025, 'Revoked Practice Node')
            ON CONFLICT (license_number) DO NOTHING;
        `);
        console.log('[KMPDC Service] Practitioner registry initialized.');
    } catch (err) {
        console.warn('[KMPDC Service] Registry init notice:', err.message);
    }
}

/**
 * Ensure profile_photo column exists on users table for universal avatar support
 */
async function initUserSchemaExtensions() {
    try {
        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo TEXT DEFAULT NULL;');
        console.log('[Schema] Users profile_photo column verified.');
    } catch (err) {
        console.warn('[Schema] Users profile_photo notice:', err.message);
    }
}

/**
 * Initialize NCK Council Registry Table & Ensure organization_id linkage
 */
async function initNckRegistry() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS nck_registry (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                license_number VARCHAR(50) UNIQUE NOT NULL,
                full_name VARCHAR(255) NOT NULL,
                cadre VARCHAR(100) NOT NULL DEFAULT 'nurse',
                status VARCHAR(50) NOT NULL DEFAULT 'active',
                valid_till DATE,
                facility VARCHAR(255),
                created_at TIMESTAMPTZ DEFAULT NOW(),
                last_verified_at TIMESTAMPTZ DEFAULT NOW()
            );

            ALTER TABLE nck_registry ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;
            CREATE INDEX IF NOT EXISTS idx_nck_org_id ON nck_registry(organization_id);

            UPDATE nck_registry n
            SET organization_id = o.id
            FROM organizations o
            WHERE n.organization_id IS NULL
              AND n.facility IS NOT NULL
              AND LOWER(TRIM(n.facility)) = LOWER(TRIM(o.name));
        `);
        console.log('[NCK Service] Nurse registry verified and linked.');
    } catch (err) {
        console.warn('[NCK Service] Registry init notice:', err.message);
    }
}

/**
 * Initialize Prescriptions & Dispensing Tables
 */
async function initPrescriptionsSchema() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS prescriptions (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                patient_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
                organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
                status VARCHAR(50) NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'EXPIRED')),
                qr_token VARCHAR(100) UNIQUE NOT NULL,
                instructions TEXT,
                expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS prescription_items (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
                rxnorm_code VARCHAR(100),
                medication_name VARCHAR(255) NOT NULL,
                dosage VARCHAR(100) NOT NULL,
                frequency VARCHAR(100) NOT NULL,
                duration VARCHAR(100) NOT NULL,
                quantity_prescribed INT NOT NULL CHECK (quantity_prescribed > 0),
                quantity_dispensed INT NOT NULL DEFAULT 0 CHECK (quantity_dispensed >= 0),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS dispense_logs (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE RESTRICT,
                pharmacy_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
                pharmacist_id UUID REFERENCES users(id) ON DELETE SET NULL,
                quantity_dispensed INT NOT NULL CHECK (quantity_dispensed > 0),
                notes TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);
        console.log('[Prescriptions Service] Prescriptions schema verified.');
    } catch (err) {
        console.warn('[Prescriptions Service] Schema init notice:', err.message);
    }
}

/**
 * Bootstraps all database extensions and foundational reference tables
 */
async function initDatabaseSchema() {
    await initUserSchemaExtensions();
    await initKmpdcRegistry();
    await initNckRegistry();
    await initPrescriptionsSchema();
}

module.exports = {
    initDatabaseSchema,
    initKmpdcRegistry,
    initNckRegistry,
    initUserSchemaExtensions,
    initPrescriptionsSchema
};

