-- Migration 06: Add is_demo_data safeguard to records table
-- Security safeguard: ensures simulation / tamper endpoints can only touch designated demo records.

ALTER TABLE records 
ADD COLUMN IF NOT EXISTS is_demo_data BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_records_is_demo_data ON records (is_demo_data);
