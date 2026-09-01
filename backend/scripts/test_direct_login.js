const db = require('../db');
const bcrypt = require('bcryptjs');

async function testDirectLogin() {
    const inputEmail = 'superadmin@bhc.local';
    const inputPassword = 'SuperAdmin#Secure2026!';

    console.log('Testing login for:', inputEmail);
    const { rows: users } = await db.query('SELECT * FROM users WHERE email = $1', [inputEmail.toLowerCase().trim()]);
    if (users.length === 0) {
        console.error('USER NOT FOUND');
        return;
    }
    const user = users[0];
    console.log('Found user:', user.email, 'Role:', user.role);
    const isMatch = await bcrypt.compare(inputPassword, user.password);
    console.log('Password match:', isMatch);

    if (isMatch) {
        console.log('LOGIN SUCCESSFUL!');
    } else {
        console.error('LOGIN FAILED - Password did not match.');
    }
    process.exit(0);
}

testDirectLogin();
