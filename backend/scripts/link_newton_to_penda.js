const db = require('../db');

async function linkNewtonToPenda() {
    try {
        console.log('--- Linking Newton Nyaga to Penda Health ---');
        
        // 1. Fetch Penda Health
        const pendaRes = await db.query("SELECT id, name FROM organizations WHERE name ILIKE '%penda%' LIMIT 1");
        if (pendaRes.rows.length === 0) {
            throw new Error('Penda Health organization not found in database.');
        }
        const penda = pendaRes.rows[0];
        console.log(`Found organization: ${penda.name} (${penda.id})`);

        // 2. Fetch Newton
        const newtonRes = await db.query("SELECT id, name, email, doctor_profile FROM users WHERE name ILIKE '%newton%' AND role = 'doctor' LIMIT 1");
        if (newtonRes.rows.length === 0) {
            throw new Error('Doctor Newton Nyaga not found in database.');
        }
        const newton = newtonRes.rows[0];
        console.log(`Found doctor: ${newton.name} (${newton.id})`);

        // 3. Update doctor_profile JSON with 'Penda Health'
        const currentProfile = typeof newton.doctor_profile === 'string' 
            ? JSON.parse(newton.doctor_profile) 
            : (newton.doctor_profile || {});
        currentProfile.hospital = penda.name;

        // 4. Update users table
        await db.query(
            "UPDATE users SET organization_id = $1, is_approved = true, doctor_profile = $2 WHERE id = $3",
            [penda.id, JSON.stringify(currentProfile), newton.id]
        );
        console.log(`✓ Updated user ${newton.name}: set organization_id to ${penda.id} and hospital to ${penda.name}`);

        // 5. Insert/Update tenant_memberships
        await db.query(`
            INSERT INTO tenant_memberships (user_id, organization_id, role, status)
            VALUES ($1, $2, 'doctor', 'active')
            ON CONFLICT (user_id, organization_id) DO UPDATE SET status = 'active', role = 'doctor';
        `, [newton.id, penda.id]);
        console.log(`✓ Added/updated tenant membership for doctor ${newton.name} under ${penda.name}`);

        // 6. Verify with getDoctors query scoped to Penda Health
        const verifyRes = await db.query(
            "SELECT id, name, email, role, organization_id, doctor_profile, is_approved FROM users WHERE organization_id = $1 AND role = 'doctor' AND is_approved = true",
            [penda.id]
        );
        console.log('\n--- Verified Doctors under Penda Health ---');
        console.log(JSON.stringify(verifyRes.rows, null, 2));

    } catch (err) {
        console.error('Error linking Newton to Penda:', err);
    } finally {
        await db.pool.end();
    }
}

linkNewtonToPenda();
