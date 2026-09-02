-- ==============================================================================
-- Stage 2 Migration: Add organization_id foreign keys across tables
-- System: Block Health Chain (BHC)
-- ==============================================================================

-- 1. Add organization_id to users
-- Scoped for doctors and admins; NULL for patients who use tenant_memberships
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);

-- 2. Add organization_id to appointments
ALTER TABLE appointments 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_appointments_org ON appointments(organization_id);

-- 3. Add organization_id to records
ALTER TABLE records 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_records_org ON records(organization_id);

-- 4. Add organization_id to audit_logs
ALTER TABLE audit_logs 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id);

-- 5. Add organization_id to licenses
ALTER TABLE licenses 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_licenses_org ON licenses(organization_id);

-- 6. Add organization_id to blocks (Isolated per-tenant blockchain)
-- CRITICAL REQUIREMENT: organization_id is a metadata/scoping column ONLY.
-- It is NOT used in the block's calculateHash() input, preserving 100% backward compatibility.
ALTER TABLE blocks 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- Drop legacy global single-tenant index uniqueness so each organization can maintain its own chain index (0, 1, 2...)
ALTER TABLE blocks DROP CONSTRAINT IF EXISTS blocks_index_key;

CREATE INDEX IF NOT EXISTS idx_blocks_org_index ON blocks(organization_id, index);
