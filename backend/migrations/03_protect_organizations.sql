
-- Database-Level Safety Shield: Protect Production & Seeded Organizations from Deletion
-- Ensures that no test script, automated runner, or accidental query can ever DELETE a non-test organization.

CREATE OR REPLACE FUNCTION protect_production_organizations()
RETURNS TRIGGER AS $$
BEGIN
    -- Permit deletion only if the organization is explicitly named as a test fixture
    IF OLD.name NOT ILIKE '%test%' 
       AND OLD.name NOT ILIKE '%audit%' 
       AND OLD.name NOT ILIKE '%exptrial%' THEN
        RAISE EXCEPTION 'DATABASE SAFETY VIOLATION: Attempted to DELETE production organization "%" (ID: %). Deletion of real organizations is strictly prohibited.', OLD.name, OLD.id;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_production_organizations ON organizations;
CREATE TRIGGER trg_protect_production_organizations
BEFORE DELETE ON organizations
FOR EACH ROW
EXECUTE FUNCTION protect_production_organizations();
