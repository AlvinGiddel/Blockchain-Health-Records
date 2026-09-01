/**
 * One-time / Idempotent Super Admin Seeding Script
 * 
 * Usage:
 *   node backend/scripts/seedSuperAdmin.js
 * 
 * Reads SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD from .env.
 * Hashes password using bcrypt (10 rounds) and generates RSA-2048 keypair.
 * Upserts super_admin user into PostgreSQL database.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateKeyPair, getKenyanTimestamp } = require('../blockchain');

async function seedSuperAdmin() {
    console.log('==============================================');
    console.log('       BHC SUPER ADMIN SEEDING SCRIPT         ');
    console.log('==============================================');

    const email = process.env.SUPER_ADMIN_EMAIL;
    const password = process.env.SUPER_ADMIN_PASSWORD;

    if (!email || !password) {
        console.error('[ERROR] SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD must be defined in .env');
        process.exit(1);
    }

    const cleanEmail = email.toLowerCase().trim();

    try {
        console.log(`[1/4] Ensuring PostgreSQL role constraint supports 'super_admin'...`);
        // Idempotently update role CHECK constraint on users table if it exists
        try {
            await db.query(`
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check'
                    ) THEN
                        ALTER TABLE users DROP CONSTRAINT users_role_check;
                        ALTER TABLE users ADD CONSTRAINT users_role_check 
                            CHECK (role IN ('patient', 'doctor', 'admin', 'super_admin'));
                    END IF;
                END $$;
            `);
            console.log('      Constraint validated successfully.');
        } catch (constraintErr) {
            console.warn('      Constraint check note:', constraintErr.message);
        }

        console.log(`[2/4] Checking existing user for email: ${cleanEmail}...`);
        const { rows: existingUsers } = await db.query(
            'SELECT id, name, email, role, is_approved FROM users WHERE email = $1',
            [cleanEmail]
        );

        console.log(`[3/4] Hashing password with bcrypt (10 rounds)...`);
        const hashedPassword = await bcrypt.hash(password, 10);

        if (existingUsers.length > 0) {
            const existing = existingUsers[0];
            console.log(`      Found existing user (${existing.id}) with role: '${existing.role}'.`);
            console.log(`[4/4] Updating to Super Administrator credentials & role...`);

            await db.query(
                `UPDATE users 
                 SET password = $1, 
                     role = 'super_admin', 
                     is_approved = true, 
                     is_rejected = false, 
                     name = 'Super Administrator' 
                 WHERE id = $2`,
                [hashedPassword, existing.id]
            );

            console.log(`\n✅ Super Administrator updated successfully!`);
            console.log(`   User ID: ${existing.id}`);
            console.log(`   Email:   ${cleanEmail}`);
            console.log(`   Role:    super_admin`);
        } else {
            console.log(`      Generating RSA-2048 keypair for cryptographic identity...`);
            const { publicKey, privateKey } = generateKeyPair();

            console.log(`[4/4] Inserting new Super Administrator record...`);
            const timestamp = getKenyanTimestamp();

            const { rows: inserted } = await db.query(
                `INSERT INTO users (name, email, password, role, public_key, private_key, is_approved, is_rejected, created_at)
                 VALUES ($1, $2, $3, 'super_admin', $4, $5, true, false, $6)
                 RETURNING id, name, email, role`,
                ['Super Administrator', cleanEmail, hashedPassword, publicKey, privateKey, timestamp]
            );

            const newUser = inserted[0];
            console.log(`\n✅ Super Administrator created successfully!`);
            console.log(`   User ID: ${newUser.id}`);
            console.log(`   Email:   ${newUser.email}`);
            console.log(`   Role:    super_admin`);
        }

        console.log('==============================================');
        process.exit(0);
    } catch (err) {
        console.error('[CRITICAL SEEDING ERROR]:', err);
        process.exit(1);
    }
}

seedSuperAdmin();
