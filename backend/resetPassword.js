const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: "postgresql://neondb_owner:npg_mN86QzMYHAuU@ep-royal-flower-b5zul9xo-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
    ssl: { rejectUnauthorized: false }
});

async function resetPassword() {
    try {
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash('AdminSecure@2026!', salt);
        
        const res = await pool.query(
            'UPDATE users SET password = $1 WHERE email = $2 RETURNING id',
            [hashedPassword, 'giddelmutinga@gmail.com']
        );
        
        if (res.rowCount > 0) {
            console.log('Successfully reset Super Admin password to AdminSecure@2026!');
        } else {
            console.log('Super Admin user not found.');
        }
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
    }
}

resetPassword();
