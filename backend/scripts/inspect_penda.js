const db = require('../db');

async function inspect() {
    try {
        const u = await db.query("SELECT id, name, email, role, organization_id, patient_profile, doctor_profile FROM users WHERE id IN ('fcdb47b0-c7fa-452b-807f-372a89f5277b', '0f724392-f0e4-41ac-9278-d6aacd3f7284');");
        console.log('Admins:');
        console.log(u.rows);

        const anyPenda = await db.query("SELECT * FROM organizations WHERE name ILIKE '%penda%' OR slug ILIKE '%penda%';");
        console.log('Penda in organizations:', anyPenda.rows);

        const anyUserPenda = await db.query("SELECT id, name, email, role, organization_id FROM users WHERE name ILIKE '%penda%' OR email ILIKE '%penda%';");
        console.log('Penda in users:', anyUserPenda.rows);
    } catch (e) {
        console.error(e);
    } finally {
        await db.pool.end();
    }
}
inspect();
