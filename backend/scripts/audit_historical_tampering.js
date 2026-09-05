const db = require('../db');

async function checkHistoricalTampering() {
    console.log('------------------------------------------------------');
    console.log('   AUDITING HISTORICAL DATABASE TAMPERING STATUS      ');
    console.log('------------------------------------------------------');

    try {
        // 1. Check for any records containing '%HACKED%'
        const { rows: hackedRecs } = await db.query(
            "SELECT id, patient_id, diagnosis, organization_id, timestamp FROM records WHERE diagnosis ILIKE '%HACKED%'"
        );
        console.log(`\n1. Records containing 'HACKED': ${hackedRecs.length} found.`);
        if (hackedRecs.length > 0) {
            console.log(JSON.stringify(hackedRecs, null, 2));
        }

        // 2. Check for any records containing 'MALICIOUS' or 'CORRUPTED' or 'TAMPER'
        const { rows: simRecs } = await db.query(
            "SELECT id, patient_id, diagnosis, organization_id, timestamp FROM records WHERE diagnosis ILIKE '%MALICIOUS%' OR diagnosis ILIKE '%CORRUPTED%' OR diagnosis ILIKE '%TAMPER%'"
        );
        console.log(`\n2. Records containing simulation markers: ${simRecs.length} found.`);
        if (simRecs.length > 0) {
            console.log(JSON.stringify(simRecs, null, 2));
        }

        // 3. Check for any unencrypted records (AES-256 encrypted values always contain IV and ciphertext delimited by ':')
        // Exclude consultation record types which might store structured text if legacy
        const { rows: unencryptedRecs } = await db.query(
            "SELECT id, patient_id, diagnosis, record_type, organization_id, timestamp FROM records WHERE diagnosis NOT LIKE '%:%' AND (record_type IS NULL OR record_type != 'consultation')"
        );
        console.log(`\n3. Non-consultation records with unencrypted (plaintext) diagnosis: ${unencryptedRecs.length} found.`);
        if (unencryptedRecs.length > 0) {
            console.log(JSON.stringify(unencryptedRecs, null, 2));
        }

        // 4. Check blocks table for any occurrence of 'HACKED'
        const { rows: hackedBlocks } = await db.query(
            "SELECT id, index, organization_id, timestamp FROM blocks WHERE records::text ILIKE '%HACKED%'"
        );
        console.log(`\n4. Blockchain blocks containing 'HACKED' marker: ${hackedBlocks.length} found.`);
        if (hackedBlocks.length > 0) {
            console.log(JSON.stringify(hackedBlocks, null, 2));
        }

        // 5. Total counts
        const { rows: totalRecs } = await db.query("SELECT COUNT(*) as count FROM records");
        const { rows: totalBlocks } = await db.query("SELECT COUNT(*) as count FROM blocks");
        console.log(`\nTotal records in database: ${totalRecs[0].count}`);
        console.log(`Total blocks in ledger: ${totalBlocks[0].count}`);

    } catch (err) {
        console.error('Audit query error:', err);
    } finally {
        process.exit(0);
    }
}

checkHistoricalTampering();
