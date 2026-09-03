-- ==============================================================================
-- Stage 5 Migration: Performance & Cryptographic Lookups Indexing
-- System: Block Health Chain (BHC)
-- ==============================================================================

-- 1. Blockchain Mempool Fast-Mining Partial Indexes
-- Partial indexes take almost 0 KB of RAM because they only index unmined records!
CREATE INDEX IF NOT EXISTS idx_records_unmined 
ON records (organization_id, is_mined) 
WHERE is_mined = false;

CREATE INDEX IF NOT EXISTS idx_audit_logs_unmined 
ON audit_logs (organization_id, is_mined) 
WHERE is_mined = false;

-- 2. Cryptographic Attestation & QR Passport Verification
-- Makes QR code verification instant O(1) lookups
CREATE INDEX IF NOT EXISTS idx_records_tx_hash 
ON records (transaction_hash) 
WHERE transaction_hash IS NOT NULL AND transaction_hash != '';

CREATE INDEX IF NOT EXISTS idx_records_ipfs_hash 
ON records (ipfs_hash) 
WHERE ipfs_hash IS NOT NULL AND ipfs_hash != '';

-- 3. Audit Trail & Compliance Time-Series Ordering
-- Instant rendering of newest events without in-memory sorting
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_timestamp 
ON audit_logs (organization_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type 
ON audit_logs (event_type);

-- 4. Appointment Booking & Doctor Conflict Detection
CREATE INDEX IF NOT EXISTS idx_appointments_doc_date_status 
ON appointments (doctor_id, date, status);

CREATE INDEX IF NOT EXISTS idx_appointments_org_date 
ON appointments (organization_id, date);

-- 5. User Security & Registration Speedups
-- Functional JSONB indexes for instant phone uniqueness verification
CREATE INDEX IF NOT EXISTS idx_users_patient_phone 
ON users ((patient_profile->>'phone')) 
WHERE patient_profile IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_doctor_phone 
ON users ((doctor_profile->>'phone')) 
WHERE doctor_profile IS NOT NULL;

-- Fast password reset token lookup
CREATE INDEX IF NOT EXISTS idx_users_reset_token 
ON users (reset_password_token) 
WHERE reset_password_token IS NOT NULL;

-- 6. Statutory Oracle Licensing (KMPDC / NCK Registers)
CREATE INDEX IF NOT EXISTS idx_kmpdc_license_num 
ON kmpdc_registry (license_number);

-- 7. Payment Customer History & User Lookups
CREATE INDEX IF NOT EXISTS idx_payments_customer_email 
ON payments (customer_email);

CREATE INDEX IF NOT EXISTS idx_payments_user_id 
ON payments (user_id);
