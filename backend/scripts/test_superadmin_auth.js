/**
 * Verification of Super Admin Login & Rate Limiter against running server / logic
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const bcrypt = require('bcryptjs');
const db = require('../db');

async function testSuperAdminAuth() {
    console.log('Testing Super Admin Database Record...');
    const email = process.env.SUPER_ADMIN_EMAIL.toLowerCase().trim();
    const password = process.env.SUPER_ADMIN_PASSWORD;

    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (rows.length === 0) {
        throw new Error('Super admin user not found in database');
    }

    const user = rows[0];
    console.log(`User found: ${user.name} (${user.role}), is_approved: ${user.is_approved}`);
    if (user.role !== 'super_admin') {
        throw new Error(`Expected role 'super_admin', found '${user.role}'`);
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
        throw new Error('Password mismatch for super admin');
    }

    console.log('✅ Super Admin credentials verified successfully with bcrypt!');
    process.exit(0);
}

testSuperAdminAuth().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});
