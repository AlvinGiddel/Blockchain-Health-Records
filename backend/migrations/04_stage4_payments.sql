-- ==============================================================================
-- Stage 4 Migration: Paystack Payments & Organization License Subscriptions
-- System: Block Health Chain (BHC)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reference VARCHAR(120) NOT NULL UNIQUE,
    amount NUMERIC(12, 2) NOT NULL,
    amount_subunits INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'KES',
    purpose VARCHAR(50) NOT NULL DEFAULT 'license_renewal',
    plan_days INTEGER NOT NULL DEFAULT 30,
    plan_name VARCHAR(100) DEFAULT 'Standard Monthly Renewal',
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'cancelled')),
    channel VARCHAR(50) DEFAULT NULL,
    customer_email VARCHAR(255) NOT NULL,
    paystack_response JSONB DEFAULT NULL,
    blockchain_tx_hash VARCHAR(255) DEFAULT NULL,
    paid_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payments_reference ON payments(reference);
CREATE INDEX IF NOT EXISTS idx_payments_org ON payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

-- Ensure permissions for authenticated role
GRANT ALL ON TABLE payments TO authenticated;

-- Row Level Security (RLS) policies for multi-tenant isolation
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_payments_super_admin ON payments;
CREATE POLICY p_payments_super_admin ON payments
    FOR ALL
    USING (is_super_admin());

DROP POLICY IF EXISTS p_payments_tenant_access ON payments;
CREATE POLICY p_payments_tenant_access ON payments
    FOR ALL
    USING (
        organization_id = get_current_org_id() 
        OR user_id = get_current_user_id()
    )
    WITH CHECK (
        organization_id = get_current_org_id()
        OR user_id = get_current_user_id()
        OR is_super_admin()
    );
