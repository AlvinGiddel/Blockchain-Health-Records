const db = require('../db');
const crypto = require('crypto');

async function provisionPendaAdmin() {
    try {
        console.log('--- Provisioning Penda Health & Admin ---');

        const cols = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'organizations'");
        console.log('Available columns in organizations:', cols.rows.map(r => r.column_name));

        // 1. Find or create Penda Health
        let pendaRes = await db.query('SELECT * FROM organizations WHERE name ILIKE $1', ['%Penda Health%']);
        let penda;
        if (pendaRes.rows.length === 0) {
            console.log('Creating Penda Health organization...');
            const insRes = await db.query(`
                INSERT INTO organizations (name, status, license_expires_at)
                VALUES ('Penda Health', 'active', NOW() + INTERVAL '30 days')
                RETURNING *
            `);
            penda = insRes.rows[0];
            console.log('Created Penda Health:', penda.id);
        } else {
            penda = pendaRes.rows[0];
            console.log('Found Penda Health:', penda.id);
            await db.query(`
                UPDATE organizations 
                SET status = 'active', license_expires_at = GREATEST(license_expires_at, NOW() + INTERVAL '30 days')
                WHERE id = $1
            `, [penda.id]);
        }

        // 2. Ensure Genesis Block exists for Penda Health
        const genCheck = await db.query('SELECT * FROM blocks WHERE organization_id = $1 AND index = 0', [penda.id]);
        if (genCheck.rows.length === 0) {
            console.log('Inserting Genesis Block for Penda Health...');
            const genHash = crypto.createHash('sha256').update(penda.id + '-0-0-genesis').digest('hex');
            await db.query(`
                INSERT INTO blocks (organization_id, index, timestamp, records, previous_hash, nonce, hash)
                VALUES ($1, 0, $2, $3, $4, 0, $5)
            `, [penda.id, Date.now(), JSON.stringify([{ message: 'Genesis Block - Penda Health' }]), '0', genHash]);
            console.log('Genesis Block created.');
        } else {
            console.log('Genesis Block already exists for Penda Health.');
        }

        // 3. Link mutukualvin357@gmail.com
        const userRes = await db.query('SELECT * FROM users WHERE email = $1', ['mutukualvin357@gmail.com']);
        if (userRes.rows.length > 0) {
            const u = userRes.rows[0];
            await db.query('UPDATE users SET organization_id = $1, is_approved = true WHERE id = $2', [penda.id, u.id]);
            console.log('Updated user mutukualvin357@gmail.com with organization_id:', penda.id);

            // Check if tenant_memberships exists
            const tmCheck = await db.query("SELECT to_regclass('public.tenant_memberships') as tbl");
            if (tmCheck.rows[0].tbl) {
                await db.query(`
                    INSERT INTO tenant_memberships (user_id, organization_id, role, status)
                    VALUES ($1, $2, 'admin', 'active')
                    ON CONFLICT DO NOTHING
                `, [u.id, penda.id]);
                console.log('Tenant membership recorded.');
            }
        } else {
            console.log('User mutukualvin357@gmail.com not found in database.');
        }

        console.log('--- Provisioning Complete ---');
        process.exit(0);
    } catch (err) {
        console.error('Error during provisioning:', err);
        process.exit(1);
    }
}

provisionPendaAdmin();
