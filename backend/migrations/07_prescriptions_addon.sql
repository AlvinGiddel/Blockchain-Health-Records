-- ==============================================================================
-- Migration 07: Prescription Addon Module Schema & Row-Level Security
-- System: Block Health Chain (BHC) Multi-Tenant Architecture
-- ==============================================================================

BEGIN;

-- 1. Create Prescriptions Table
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

CREATE INDEX IF NOT EXISTS idx_prescriptions_org_id ON prescriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON prescriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor_id ON prescriptions(doctor_id);
CREATE INDEX IF NOT EXISTS idx_prescriptions_qr_token ON prescriptions(qr_token);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status ON prescriptions(status);

-- 2. Create Prescription Items Table
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

CREATE INDEX IF NOT EXISTS idx_prescription_items_rx_id ON prescription_items(prescription_id);

-- 3. Create Dispense Logs Table (Immutable Audit Trail)
CREATE TABLE IF NOT EXISTS dispense_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescription_id UUID NOT NULL REFERENCES prescriptions(id) ON DELETE RESTRICT,
    pharmacy_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    pharmacist_id UUID REFERENCES users(id) ON DELETE SET NULL,
    quantity_dispensed INT NOT NULL CHECK (quantity_dispensed > 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispense_logs_rx_id ON dispense_logs(prescription_id);
CREATE INDEX IF NOT EXISTS idx_dispense_logs_org_id ON dispense_logs(pharmacy_org_id);

-- 4. Enable Row-Level Security (RLS)
ALTER TABLE prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispense_logs ENABLE ROW LEVEL SECURITY;

-- Ensure authenticated role has permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;

-- Policies for prescriptions:
-- A) Super admins have universal access
DROP POLICY IF EXISTS p_prescriptions_super_admin ON prescriptions;
CREATE POLICY p_prescriptions_super_admin ON prescriptions
    FOR ALL
    USING (is_super_admin());

-- B) Patients can view their own prescriptions
DROP POLICY IF EXISTS p_prescriptions_patient_select ON prescriptions;
CREATE POLICY p_prescriptions_patient_select ON prescriptions
    FOR SELECT
    USING (patient_id = get_current_user_id());

-- C) Organization staff (doctors, clinic admins) can view & manage their org's prescriptions
DROP POLICY IF EXISTS p_prescriptions_org_staff ON prescriptions;
CREATE POLICY p_prescriptions_org_staff ON prescriptions
    FOR ALL
    USING (organization_id = get_current_org_id());

-- Policies for prescription_items:
DROP POLICY IF EXISTS p_prescription_items_super_admin ON prescription_items;
CREATE POLICY p_prescription_items_super_admin ON prescription_items
    FOR ALL
    USING (is_super_admin());

DROP POLICY IF EXISTS p_prescription_items_scoped ON prescription_items;
CREATE POLICY p_prescription_items_scoped ON prescription_items
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM prescriptions p
            WHERE p.id = prescription_items.prescription_id
              AND (
                p.organization_id = get_current_org_id()
                OR p.patient_id = get_current_user_id()
              )
        )
    );

-- Policies for dispense_logs:
DROP POLICY IF EXISTS p_dispense_logs_super_admin ON dispense_logs;
CREATE POLICY p_dispense_logs_super_admin ON dispense_logs
    FOR ALL
    USING (is_super_admin());

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

COMMIT;
