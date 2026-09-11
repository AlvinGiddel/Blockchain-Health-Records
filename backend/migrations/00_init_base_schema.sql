-- ==============================================================================
-- 00_init_base_schema.sql: Foundational Base Schema & Local Dev Bootstrapper
-- System: Block Health Chain (BHC)
--
-- This script runs FIRST in the migration sequence (00 -> 10).
-- When initializing a fresh PostgreSQL container in Docker (/docker-entrypoint-initdb.d),
-- this creates the required extensions, the 'authenticated' role, and the base tables
-- so that subsequent migrations (01 through 10) can reference and alter them cleanly.
-- Every statement is strictly idempotent (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- ==============================================================================

-- 1. Enable Cryptographic & UUID Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Idempotently Create 'authenticated' Role for RLS Grants
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
    END IF;
END
$$;

-- 3. Base Organizations Table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    slug VARCHAR(100) UNIQUE,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'trial', 'disabled')),
    license_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
    max_doctors INTEGER DEFAULT 25,
    max_patients INTEGER DEFAULT 1000,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations(status);

-- 4. Base Users Table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('patient', 'doctor', 'admin', 'super_admin', 'pharmacist')),
    public_key TEXT NOT NULL,
    private_key TEXT NOT NULL,
    profile_photo TEXT DEFAULT NULL,
    patient_profile JSONB DEFAULT NULL,
    doctor_profile JSONB DEFAULT NULL,
    is_approved BOOLEAN DEFAULT true,
    is_rejected BOOLEAN DEFAULT false,
    reset_password_token VARCHAR(255) DEFAULT NULL,
    reset_password_expires TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 5. Base Licenses Table (Remote Kill-Switch / Subscription Authority)
CREATE TABLE IF NOT EXISTS licenses (
    client_id TEXT PRIMARY KEY,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_licenses_client_id ON licenses(client_id);

-- 6. Base Appointments Table
CREATE TABLE IF NOT EXISTS appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_name VARCHAR(255) NOT NULL,
    doctor_name VARCHAR(255) NOT NULL,
    date VARCHAR(100) NOT NULL,
    time VARCHAR(100) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Confirmed', 'Declined', 'Completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Base Records Table
CREATE TABLE IF NOT EXISTS records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_name VARCHAR(255) NOT NULL,
    diagnosis TEXT NOT NULL,
    treatment TEXT NOT NULL,
    prescriptions JSONB DEFAULT '[]'::jsonb,
    record_type VARCHAR(50) DEFAULT 'medical' CHECK (record_type IN ('medical', 'consultation')),
    symptoms TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    lab_request TEXT DEFAULT '',
    consultation_hash VARCHAR(255) DEFAULT '',
    transaction_hash VARCHAR(255) DEFAULT '',
    ipfs_hash VARCHAR(255) DEFAULT '',
    signature TEXT NOT NULL,
    doctor_public_key TEXT NOT NULL,
    is_mined BOOLEAN DEFAULT false,
    block_index INTEGER DEFAULT -1,
    timestamp VARCHAR(100) NOT NULL
);

-- 8. Base Blocks Table (Multi-Tenant Isolated Ledgers)
CREATE TABLE IF NOT EXISTS blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    index INTEGER NOT NULL,
    timestamp VARCHAR(100) NOT NULL,
    records JSONB DEFAULT '[]'::jsonb,
    previous_hash VARCHAR(255) NOT NULL,
    nonce BIGINT NOT NULL,
    hash VARCHAR(255) NOT NULL
);

-- 9. Base Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_name VARCHAR(255),
    doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_name VARCHAR(255),
    details TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_mined BOOLEAN DEFAULT false,
    block_index INTEGER DEFAULT -1,
    signature TEXT DEFAULT NULL
);

-- 10. Base KMPDC Council Registry Table
CREATE TABLE IF NOT EXISTS kmpdc_registry (
    license_number VARCHAR(50) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    cadre VARCHAR(100) NOT NULL DEFAULT 'Medical Practitioner',
    specialization VARCHAR(255) DEFAULT 'General Medicine',
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired')),
    retention_year INTEGER DEFAULT 2026,
    facility VARCHAR(255) DEFAULT 'National Health Service',
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- Default Seeds for Fresh Local Development
-- (All statements use ON CONFLICT DO NOTHING to guarantee safe replay)
-- ==============================================================================

-- Seed Default Facilities
INSERT INTO organizations (name, slug, status, license_expires_at)
VALUES 
    ('Nairobi Hospital', 'nairobi-hospital', 'active', NOW() + INTERVAL '365 days'),
    ('Mama Lucy Hospital', 'mama-lucy-hospital', 'active', NOW() + INTERVAL '365 days'),
    ('Kilimani Hospital', 'kilimani-hospital', 'active', NOW() + INTERVAL '365 days'),
    ('Unassigned / Pending', 'unassigned-pending', 'active', '2099-12-31 23:59:59Z')
ON CONFLICT (name) DO NOTHING;

-- Seed Default Active Client License
INSERT INTO licenses (client_id, status, expires_at)
VALUES ('bhc-client-001', 'active', NOW() + INTERVAL '365 days')
ON CONFLICT (client_id) DO NOTHING;

-- Seed Super Administrator (Email: superadmin@bhc.local | Password: SuperAdmin#Secure2026!)
INSERT INTO users (
    name,
    email,
    password,
    role,
    public_key,
    private_key,
    is_approved,
    is_rejected,
    created_at
)
VALUES (
    'Super Administrator',
    'superadmin@bhc.local',
    '$2a$10$TJjeA9dVmNeziyRFW5gHpu/nlU9qLC.5scXiFltaPeWzyXeIqfKX.',
    'super_admin',
    '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEdevPublicKeyPlaceholderBHC2026\n-----END PUBLIC KEY-----',
    '-----BEGIN PRIVATE KEY-----\nMEECAQAwEwYHKoZIzj0CAQYIKoZIzj0DAQcEJzAlAgEBBCAdevPrivateKeyBHC2026\n-----END PRIVATE KEY-----',
    true,
    false,
    NOW()
)
ON CONFLICT (email) DO NOTHING;
