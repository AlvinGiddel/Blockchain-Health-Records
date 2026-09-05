const bcrypt = require('bcryptjs');
const db = require('../db');

async function setPw() {
  const hash = await bcrypt.hash('Patient@123', 10);
  await db.query('UPDATE users SET password = $1 WHERE email = $2', [hash, 'gichovicaroline@gmail.com']);
  console.log('Password set successfully for gichovicaroline@gmail.com');
  process.exit(0);
}

setPw().catch(err => {
  console.error(err);
  process.exit(1);
});
