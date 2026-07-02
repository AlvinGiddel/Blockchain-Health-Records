-- Supabase Schema for Blockchain Health Records System

-- Enable UUID extension if not enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing tables if they exist to start fresh (in order of dependencies)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS records CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS blocks CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 1. Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('patient', 'doctor', 'admin')),
    public_key TEXT NOT NULL,
    private_key TEXT NOT NULL,
    patient_profile JSONB DEFAULT NULL,
    doctor_profile JSONB DEFAULT NULL,
    is_approved BOOLEAN DEFAULT true,
    is_rejected BOOLEAN DEFAULT false,
    reset_password_token VARCHAR(255) DEFAULT NULL,
    reset_password_expires TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Appointments Table
CREATE TABLE appointments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_name VARCHAR(255) NOT NULL,
    doctor_name VARCHAR(255) NOT NULL,
    date VARCHAR(100) NOT NULL,
    time VARCHAR(100) NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Confirmed', 'Declined', 'Completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Records Table
CREATE TABLE records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_name VARCHAR(255) NOT NULL,
    diagnosis TEXT NOT NULL,       -- Encrypted AES ciphertext
    treatment TEXT NOT NULL,       -- Encrypted AES ciphertext
    prescriptions JSONB DEFAULT '[]'::jsonb,
    record_type VARCHAR(50) DEFAULT 'medical' CHECK (record_type IN ('medical', 'consultation')),
    symptoms TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    lab_request TEXT DEFAULT '',
    consultation_hash VARCHAR(255) DEFAULT '',
    transaction_hash VARCHAR(255) DEFAULT '',
    ipfs_hash VARCHAR(255) DEFAULT '',
    signature TEXT NOT NULL,
    doctor_public_key TEXT NOT NULL,
    is_mined BOOLEAN DEFAULT false,
    block_index INTEGER DEFAULT -1,
    timestamp VARCHAR(100) NOT NULL
);

-- 4. Blocks Table
CREATE TABLE blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    index INTEGER UNIQUE NOT NULL,
    timestamp VARCHAR(100) NOT NULL,
    records JSONB DEFAULT '[]'::jsonb,
    previous_hash VARCHAR(255) NOT NULL,
    nonce BIGINT NOT NULL,
    hash VARCHAR(255) UNIQUE NOT NULL
);

-- 5. Audit Logs Table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    patient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    patient_name VARCHAR(255),
    doctor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    doctor_name VARCHAR(255),
    details TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_mined BOOLEAN DEFAULT false,
    block_index INTEGER DEFAULT -1,
    signature TEXT DEFAULT NULL
);

-- Create index on columns that are frequently used in queries
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_appointments_patient ON appointments(patient_id);
CREATE INDEX idx_appointments_doctor ON appointments(doctor_id);
CREATE INDEX idx_records_patient ON records(patient_id);
CREATE INDEX idx_records_doctor ON records(doctor_id);
CREATE INDEX idx_audit_logs_patient ON audit_logs(patient_id);
CREATE INDEX idx_blocks_index ON blocks(index);
