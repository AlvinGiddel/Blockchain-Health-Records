-- ==============================================================================
-- Migration 13: Organizations and KMPDC Registry RLS Policies
-- System: Block Health Chain (BHC) Multi-Tenant Architecture
-- ==============================================================================

BEGIN;

-- ==============================================================================
-- 1. ORGANIZATIONS RLS POLICIES
-- ==============================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_organizations_read ON organizations;
CREATE POLICY p_organizations_read ON organizations 
    FOR SELECT USING (true);

DROP POLICY IF EXISTS p_organizations_write ON organizations;
CREATE POLICY p_organizations_write ON organizations 
    FOR ALL USING (
        current_setting('app.user_role', true) = 'super_admin'
    );

-- ==============================================================================
-- 2. KMPDC REGISTRY RLS POLICIES
-- ==============================================================================

ALTER TABLE kmpdc_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_kmpdc_registry_read ON kmpdc_registry;
CREATE POLICY p_kmpdc_registry_read ON kmpdc_registry 
    FOR SELECT USING (true);

DROP POLICY IF EXISTS p_kmpdc_registry_write ON kmpdc_registry;
CREATE POLICY p_kmpdc_registry_write ON kmpdc_registry 
    FOR ALL USING (
        current_setting('app.user_role', true) = 'super_admin'
    );

COMMIT;
