-- =========================================================================
-- MIGRATION 08: PATIENT CONSENTS & GRANULAR ACCESS DELEGATION
-- Implements Data Protection Act / HIPAA granular consent model with RLS
-- =========================================================================

CREATE TABLE IF NOT EXISTS patient_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    grantee_type VARCHAR(20) NOT NULL CHECK (grantee_type IN ('doctor', 'organization')),
    doctor_id UUID REFERENCES users(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    scope VARCHAR(50) NOT NULL DEFAULT 'full_record' CHECK (scope IN ('full_record', 'diagnoses_only', 'prescriptions_only')),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired')),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- Optional expiration timestamp (NULL = indefinite until revoked)
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,
    purpose TEXT NOT NULL DEFAULT 'Clinical Care & Consultation',
    transaction_hash VARCHAR(66), -- Recorded on ledger for non-repudiation
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast query lookup index
CREATE INDEX IF NOT EXISTS idx_patient_consents_lookup 
ON patient_consents(patient_id, doctor_id, organization_id, status);

CREATE INDEX IF NOT EXISTS idx_patient_consents_grantee 
ON patient_consents(doctor_id, status);

-- Enable RLS
ALTER TABLE patient_consents ENABLE ROW LEVEL SECURITY;

-- Allow read of consents by participating patient, doctor, or organization admin / super admin
DROP POLICY IF EXISTS rls_patient_consents_select ON patient_consents;
CREATE POLICY rls_patient_consents_select ON patient_consents
FOR SELECT USING (
    current_setting('app.user_role', true) = 'super_admin'
    OR patient_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR doctor_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
    OR organization_id = NULLIF(current_setting('app.current_org_id', true), '')::uuid
);

-- Patient can create consent
DROP POLICY IF EXISTS rls_patient_consents_insert ON patient_consents;
CREATE POLICY rls_patient_consents_insert ON patient_consents
FOR INSERT WITH CHECK (
    current_setting('app.user_role', true) = 'super_admin'
    OR patient_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
);

-- Patient can update/revoke their own consent
DROP POLICY IF EXISTS rls_patient_consents_update ON patient_consents;
CREATE POLICY rls_patient_consents_update ON patient_consents
FOR UPDATE USING (
    current_setting('app.user_role', true) = 'super_admin'
    OR patient_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
);
