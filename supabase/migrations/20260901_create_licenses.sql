-- Supabase Migration: Create licenses table for Remote Kill-Switch
-- Run this in your Supabase SQL Editor or via Supabase CLI migrations

CREATE TABLE IF NOT EXISTS licenses (
    client_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for rapid status querying
CREATE INDEX IF NOT EXISTS idx_licenses_client_id ON licenses(client_id);

-- Optional trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_licenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_licenses_updated_at ON licenses;
CREATE TRIGGER trg_update_licenses_updated_at
    BEFORE UPDATE ON licenses
    FOR EACH ROW
    EXECUTE FUNCTION update_licenses_updated_at();

-- Sample seed (for testing)
INSERT INTO licenses (client_id, status, expires_at)
VALUES 
    ('bhc-client-001', 'active', NOW() + INTERVAL '365 days')
ON CONFLICT (client_id) DO NOTHING;
