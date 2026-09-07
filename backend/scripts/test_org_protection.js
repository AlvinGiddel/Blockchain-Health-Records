const db = require('../db');

async function testTrigger() {
    try {
        console.log('Testing deletion protection on "Nairobi hospital"...');
        await db.query("DELETE FROM organizations WHERE name = 'Nairobi hospital'");
        console.error('❌ FAILURE: Nairobi hospital was deleted! Protection trigger failed.');
        process.exit(1);
    } catch (err) {
        if (err.message && err.message.includes('DATABASE SAFETY VIOLATION')) {
            console.log('✅ SUCCESS: Protection trigger correctly BLOCKED deletion of real organization:');
            console.log('   --> ' + err.message);
            
            // Verify test fixture deletion still works
            console.log('\nTesting that test fixture deletion still works...');
            const { rows } = await db.query("INSERT INTO organizations (name, slug, status) VALUES ('Test Safety Probe Clinic', 'test-safety-probe', 'active') RETURNING id;");
            const testId = rows[0].id;
            await db.query("DELETE FROM organizations WHERE id = $1;", [testId]);
            console.log('✅ SUCCESS: Test fixture with "Test" prefix was successfully deleted as expected.');

            process.exit(0);
        } else {
            console.error('Unexpected error:', err.message);
            process.exit(1);
        }
    }
}

testTrigger();
