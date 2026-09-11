-- Migration 11: Allow NULL for patient_id and doctor_id in audit_logs
-- Needed because system-level and super-admin actions (such as approving organizations or system maintenance)
-- do not correlate with a specific patient or doctor.

ALTER TABLE audit_logs ALTER COLUMN patient_id DROP NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN doctor_id DROP NOT NULL;
