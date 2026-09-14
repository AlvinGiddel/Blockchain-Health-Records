-- ==============================================================================
-- Migration 12: Production Schema Hardening, Attestations, & Structural Privilege Fix
-- System: Block Health Chain (BHC) Multi-Tenant Architecture
--
-- This migration resolves:
-- 1. Widens organizations_status_check to include 'pending_approval' and 'expired'
-- 2. Widens licenses_status_check to include 'expired', 'trial', 'suspended'
-- 3. Idempotently creates nck_registry and practitioner_attestations with full RLS
-- 4. Grants table access to authenticated role on all public tables
-- 5. Applies ALTER DEFAULT PRIVILEGES so any future tables automatically grant access
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. WIDEN CONSTRAINTS (NON-DESTRUCTIVE: EXPANDS VALID ENUM SET)
-- ==============================================================================

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_status_check;
ALTER TABLE organizations ADD CONSTRAINT organizations_status_check 
    CHECK (status IN ('active', 'suspended', 'trial', 'disabled', 'pending_approval', 'expired'));

ALTER TABLE licenses DROP CONSTRAINT IF EXISTS licenses_status_check;
ALTER TABLE licenses ADD CONSTRAINT licenses_status_check 
    CHECK (status IN ('active', 'disabled', 'expired', 'trial', 'suspended', 'pending_approval'));


-- ==============================================================================
-- 2. NCK REGISTRY (IDEMPOTENT TABLE CREATION & RLS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS nck_registry (
    license_number VARCHAR(50) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    cadre VARCHAR(100) NOT NULL DEFAULT 'Registered Nurse',
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired', 'deceased')),
    valid_till TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 year'),
    facility VARCHAR(255) DEFAULT 'National Health Service',
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nck_org_id ON nck_registry(organization_id);

ALTER TABLE nck_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_nck_registry_read ON nck_registry;
CREATE POLICY p_nck_registry_read ON nck_registry 
    FOR SELECT USING (true);

DROP POLICY IF EXISTS p_nck_registry_write ON nck_registry;
CREATE POLICY p_nck_registry_write ON nck_registry 
    FOR ALL USING (
        current_setting('app.user_role', true) = 'super_admin'
    );


-- ==============================================================================
-- 3. PPB PREMISES RLS POLICIES
-- ==============================================================================

ALTER TABLE ppb_premises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ppb_premises_read ON ppb_premises;
CREATE POLICY p_ppb_premises_read ON ppb_premises 
    FOR SELECT USING (true);

DROP POLICY IF EXISTS p_ppb_premises_write ON ppb_premises;
CREATE POLICY p_ppb_premises_write ON ppb_premises 
    FOR ALL USING (
        current_setting('app.user_role', true) = 'super_admin'
    );


-- ==============================================================================
-- 4. PRACTITIONER ATTESTATIONS (NEW TABLE WITH MULTI-TENANT RLS)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS practitioner_attestations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    practitioner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    regulator VARCHAR(50) NOT NULL,
    cadre VARCHAR(50) NOT NULL,
    license_number VARCHAR(100) NOT NULL,
    license_hash VARCHAR(64) NOT NULL,
    practitioner_public_key TEXT NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiry_date TIMESTAMPTZ,
    attestation_hash VARCHAR(64) NOT NULL,
    is_valid BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_practitioner_attestations_practitioner ON practitioner_attestations(practitioner_id);
CREATE INDEX IF NOT EXISTS idx_practitioner_attestations_hash ON practitioner_attestations(license_hash);
CREATE INDEX IF NOT EXISTS idx_practitioner_attestations_org ON practitioner_attestations(organization_id);

ALTER TABLE practitioner_attestations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_practitioner_attestations_select ON practitioner_attestations;
CREATE POLICY p_practitioner_attestations_select ON practitioner_attestations
    FOR SELECT USING (
        current_setting('app.user_role', true) = 'super_admin'
        OR practitioner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        OR organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
        OR is_valid = true
    );

DROP POLICY IF EXISTS p_practitioner_attestations_insert ON practitioner_attestations;
CREATE POLICY p_practitioner_attestations_insert ON practitioner_attestations
    FOR INSERT WITH CHECK (
        current_setting('app.user_role', true) = 'super_admin'
        OR practitioner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    );

DROP POLICY IF EXISTS p_practitioner_attestations_update ON practitioner_attestations;
CREATE POLICY p_practitioner_attestations_update ON practitioner_attestations
    FOR UPDATE USING (
        current_setting('app.user_role', true) = 'super_admin'
        OR practitioner_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    );


-- ==============================================================================
-- 5. STRUCTURAL PERMISSIONS & DEFAULT PRIVILEGES FOR ROLE "authenticated"
-- ==============================================================================

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

-- Structural defense: Any future table created in public automatically grants access to authenticated
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO authenticated;

COMMIT;
