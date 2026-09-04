-- ==============================================================================
-- Stage 3 Migration: Row-Level Security (RLS) Policies
-- System: Block Health Chain (BHC) Multi-Tenant Architecture
-- ==============================================================================

-- Helper function: Check if current caller is super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN COALESCE(current_setting('app.user_role', true), '') = 'super_admin';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Helper function: Get current tenant organization_id as UUID
CREATE OR REPLACE FUNCTION get_current_org_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_org_id', true), '')::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Helper function: Get current authenticated user_id as UUID
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.current_user_id', true), '')::uuid;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Ensure authenticated role has standard execution and table access
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

-- ==============================================================================
-- 1. USERS TABLE RLS (PII & Tenant Isolation)
-- ==============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_users_super_admin ON users;
CREATE POLICY p_users_super_admin ON users
    FOR ALL
    USING (is_super_admin());

DROP POLICY IF EXISTS p_users_self ON users;
CREATE POLICY p_users_self ON users
    FOR ALL
    USING (id = get_current_user_id());

DROP POLICY IF EXISTS p_users_clinic_staff ON users;
CREATE POLICY p_users_clinic_staff ON users
    FOR SELECT
    USING (
        -- Staff can see other staff in their clinic
        (organization_id IS NOT NULL AND organization_id = get_current_org_id())
        OR
        -- Staff can see patients with an active membership in their clinic
        (id IN (
            SELECT user_id 
            FROM tenant_memberships 
            WHERE organization_id = get_current_org_id() 
              AND status = 'active'
        ))
    );

DROP POLICY IF EXISTS p_users_view_approved_doctors ON users;
CREATE POLICY p_users_view_approved_doctors ON users
    FOR SELECT
    USING (
        role = 'doctor' AND is_approved = true
    );

-- ==============================================================================
-- 2. LICENSES TABLE RLS (Per-Organization License Isolation)
-- ==============================================================================
ALTER TABLE licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE licenses FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_licenses_super_admin ON licenses;
CREATE POLICY p_licenses_super_admin ON licenses
    FOR ALL
    USING (is_super_admin());

DROP POLICY IF EXISTS p_licenses_tenant_admin ON licenses;
CREATE POLICY p_licenses_tenant_admin ON licenses
    FOR SELECT
    USING (organization_id = get_current_org_id());

-- ==============================================================================
-- 3. RECORDS TABLE RLS (Medical Records Privacy)
-- ==============================================================================
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_records_super_admin ON records;
CREATE POLICY p_records_super_admin ON records
    FOR ALL
    USING (is_super_admin());

DROP POLICY IF EXISTS p_records_clinic_access ON records;
CREATE POLICY p_records_clinic_access ON records
    FOR ALL
    USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS p_records_patient_access ON records;
CREATE POLICY p_records_patient_access ON records
    FOR SELECT
    USING (patient_id = get_current_user_id());

-- ==============================================================================
-- 4. APPOINTMENTS TABLE RLS
-- ==============================================================================
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_appointments_super_admin ON appointments;
CREATE POLICY p_appointments_super_admin ON appointments
    FOR ALL
    USING (is_super_admin());

DROP POLICY IF EXISTS p_appointments_clinic_access ON appointments;
CREATE POLICY p_appointments_clinic_access ON appointments
    FOR ALL
    USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS p_appointments_patient_access ON appointments;
CREATE POLICY p_appointments_patient_access ON appointments
    FOR ALL
    USING (patient_id = get_current_user_id());

-- ==============================================================================
-- 5. BLOCKS TABLE RLS (Isolated Blockchain Ledgers)
-- ==============================================================================
ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_blocks_super_admin ON blocks;
CREATE POLICY p_blocks_super_admin ON blocks
    FOR ALL
    USING (is_super_admin());

DROP POLICY IF EXISTS p_blocks_clinic_access ON blocks;
CREATE POLICY p_blocks_clinic_access ON blocks
    FOR ALL
    USING (organization_id = get_current_org_id());

-- ==============================================================================
-- 6. AUDIT LOGS TABLE RLS
-- ==============================================================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_audit_logs_super_admin ON audit_logs;
CREATE POLICY p_audit_logs_super_admin ON audit_logs
    FOR ALL
    USING (is_super_admin());

DROP POLICY IF EXISTS p_audit_logs_clinic_access ON audit_logs;
CREATE POLICY p_audit_logs_clinic_access ON audit_logs
    FOR SELECT
    USING (organization_id = get_current_org_id());

DROP POLICY IF EXISTS p_audit_logs_patient_access ON audit_logs;
CREATE POLICY p_audit_logs_patient_access ON audit_logs
    FOR SELECT
    USING (patient_id = get_current_user_id());

DROP POLICY IF EXISTS p_audit_logs_insert ON audit_logs;
CREATE POLICY p_audit_logs_insert ON audit_logs
    FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS p_audit_logs_update ON audit_logs;
CREATE POLICY p_audit_logs_update ON audit_logs
    FOR UPDATE
    USING (is_super_admin() OR organization_id = get_current_org_id() OR organization_id IS NULL)
    WITH CHECK (is_super_admin() OR organization_id = get_current_org_id() OR organization_id IS NULL);

-- ==============================================================================
-- 7. TENANT MEMBERSHIPS TABLE RLS
-- ==============================================================================
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_memberships_super_admin ON tenant_memberships;
CREATE POLICY p_memberships_super_admin ON tenant_memberships
    FOR ALL
    USING (is_super_admin());

DROP POLICY IF EXISTS p_memberships_self ON tenant_memberships;
CREATE POLICY p_memberships_self ON tenant_memberships
    FOR ALL
    USING (user_id = get_current_user_id())
    WITH CHECK (user_id = get_current_user_id());

DROP POLICY IF EXISTS p_memberships_clinic_access ON tenant_memberships;
CREATE POLICY p_memberships_clinic_access ON tenant_memberships
    FOR ALL
    USING (organization_id = get_current_org_id());
