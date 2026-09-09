-- ==============================================================================
-- Migration 09: Pharmacy Portal Role, Tenant Model & Dispensing Schema
-- System: Block Health Chain (BHC) Multi-Tenant Architecture
-- ==============================================================================

BEGIN;

-- 1. Extend Organizations table with tenant type and regulatory metadata
ALTER TABLE organizations 
    ADD COLUMN IF NOT EXISTS org_type VARCHAR(20) NOT NULL DEFAULT 'clinic' 
        CHECK (org_type IN ('clinic', 'pharmacy')),
    ADD COLUMN IF NOT EXISTS ppb_license_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50),
    ADD COLUMN IF NOT EXISTS physical_address TEXT;

CREATE INDEX IF NOT EXISTS idx_organizations_org_type ON organizations(org_type);

-- 2. Update role constraints in users and tenant_memberships
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check 
    CHECK (role IN ('patient', 'doctor', 'admin', 'super_admin', 'pharmacist'));

ALTER TABLE tenant_memberships DROP CONSTRAINT IF EXISTS tenant_memberships_role_check;
ALTER TABLE tenant_memberships ADD CONSTRAINT tenant_memberships_role_check 
    CHECK (role IN ('patient', 'doctor', 'admin', 'super_admin', 'pharmacist'));

-- 3. Extend prescription_items for fulfillment tracking
ALTER TABLE prescription_items
    ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS expiry_date DATE,
    ADD COLUMN IF NOT EXISTS dispensed_by_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS dispensed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS dispensed_at TIMESTAMPTZ;

-- 4. Extend dispense_logs with item identification, batch details, and expiration date
ALTER TABLE dispense_logs
    ADD COLUMN IF NOT EXISTS item_id UUID REFERENCES prescription_items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS batch_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS item_expiry_date DATE;

CREATE INDEX IF NOT EXISTS idx_dispense_logs_item_id ON dispense_logs(item_id);

-- 5. Ensure RLS policies for pharmacy isolation on dispense_logs
-- Pharmacists can only read dispense logs belonging to their own pharmacy organization
DROP POLICY IF EXISTS p_dispense_logs_scoped ON dispense_logs;
CREATE POLICY p_dispense_logs_scoped ON dispense_logs
    FOR ALL
    USING (
        pharmacy_org_id = get_current_org_id()
        OR EXISTS (
            SELECT 1 FROM prescriptions p
            WHERE p.id = dispense_logs.prescription_id
              AND (
                p.organization_id = get_current_org_id()
                OR p.patient_id = get_current_user_id()
              )
        )
    );

-- 6. Helper function for RLS: Check if current caller is a pharmacist
CREATE OR REPLACE FUNCTION is_pharmacist()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN COALESCE(current_setting('app.user_role', true), '') = 'pharmacist';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Cross-Tenant Dispensing RLS: Pharmacists can verify and dispense prescriptions across clinics
DROP POLICY IF EXISTS p_prescriptions_pharmacist ON prescriptions;
CREATE POLICY p_prescriptions_pharmacist ON prescriptions
    FOR ALL
    USING (is_pharmacist());

DROP POLICY IF EXISTS p_prescription_items_pharmacist ON prescription_items;
CREATE POLICY p_prescription_items_pharmacist ON prescription_items
    FOR ALL
    USING (is_pharmacist());

-- 7. Patient Profile Access for Dispensing: Pharmacists can view patient names on prescriptions without recursive users queries
DROP POLICY IF EXISTS p_users_pharmacist_patient_access ON users;
CREATE POLICY p_users_pharmacist_patient_access ON users
    FOR SELECT
    USING (
        is_pharmacist() AND id IN (SELECT patient_id FROM prescriptions)
    );

COMMIT;
