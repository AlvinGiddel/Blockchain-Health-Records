const db = require('../db');

async function checkHistoricalDamage() {
    try {
        console.log('====================================================');
        console.log('FORENSIC LEDGER & AUDIT INTEGRITY CHECK (FINDING #4)');
        console.log('====================================================\n');

        // 1. Check audit logs for any past 'user_deleted' or 'delete' events
        const deleteLogs = await db.query(`
            SELECT * FROM audit_logs 
            WHERE event_type ILIKE '%delete%' 
               OR details ILIKE '%removed from database%' 
               OR details ILIKE '%removed from system%'
            ORDER BY timestamp ASC;
        `);
        console.log(`[1] Audit logs referencing user deletion: ${deleteLogs.rows.length}`);
        if (deleteLogs.rows.length > 0) {
            console.table(deleteLogs.rows);
        } else {
            console.log('    ✓ No user deletion events found in audit_logs.');
        }

        // 2. Fetch all organizations
        const orgsRes = await db.query('SELECT id, name, slug, status FROM organizations ORDER BY name ASC;');
        console.log(`\n[2] Total organizations in database: ${orgsRes.rows.length}`);
        console.table(orgsRes.rows);

        // 3. Fetch all blocks in database
        const blocksRes = await db.query(`
            SELECT id, organization_id, index, previous_hash, hash, nonce, timestamp 
            FROM blocks 
            ORDER BY organization_id, index ASC;
        `);
        console.log(`\n[3] Total blocks across entire database: ${blocksRes.rows.length}`);

        // Check for blocks with NULL organization_id
        const nullOrgBlocks = blocksRes.rows.filter(b => !b.organization_id);
        console.log(`    Blocks with NULL organization_id: ${nullOrgBlocks.length}`);
        if (nullOrgBlocks.length > 0) {
            console.log('    ⚠️ WARNING: Found blocks without organization_id:');
            console.table(nullOrgBlocks);
        } else {
            console.log('    ✓ All blocks in database have an organization_id assigned.');
        }

        // 4. Per-Organization Blockchain Integrity Check
        console.log('\n[4] Per-Organization Chain Verification:');
        const orgBlocks = {};
        for (const b of blocksRes.rows) {
            const oid = b.organization_id || 'NULL_ORG';
            if (!orgBlocks[oid]) orgBlocks[oid] = [];
            orgBlocks[oid].push(b);
        }

        let anyDamage = false;

        for (const org of orgsRes.rows) {
            const chain = orgBlocks[org.id] || [];
            console.log(`\n  --- Organization: "${org.name}" (${org.id}) ---`);
            console.log(`      Block Count: ${chain.length}`);

            if (chain.length === 0) {
                console.log('      ⚠️ Notice: No blocks recorded for this organization.');
                continue;
            }

            // Check genesis block
            const genesis = chain[0];
            if (parseInt(genesis.index, 10) !== 0) {
                console.log(`      ❌ CRITICAL: Genesis block index is ${genesis.index}, expected 0!`);
                anyDamage = true;
            } else if (genesis.previous_hash !== '0') {
                console.log(`      ❌ CRITICAL: Genesis block previous_hash is ${genesis.previous_hash}, expected '0'!`);
                anyDamage = true;
            } else {
                console.log(`      ✓ Genesis Block #0 valid (previous_hash='0', hash=${genesis.hash.substring(0, 16)}...)`);
            }

            // Check chain continuity, indices, and hash linkage
            for (let i = 1; i < chain.length; i++) {
                const prev = chain[i - 1];
                const curr = chain[i];

                if (parseInt(curr.index, 10) !== i) {
                    console.log(`      ❌ Index discontinuity: Block at position ${i} has index ${curr.index}`);
                    anyDamage = true;
                }
                if (curr.previous_hash !== prev.hash) {
                    console.log(`      ❌ Broken hash linkage at Block #${curr.index}:`);
                    console.log(`         Expected previous_hash: ${prev.hash}`);
                    console.log(`         Actual previous_hash:   ${curr.previous_hash}`);
                    anyDamage = true;
                } else {
                    console.log(`      ✓ Block #${curr.index} linked correctly to Block #${prev.index}`);
                }
            }
        }

        console.log('\n====================================================');
        if (!anyDamage && nullOrgBlocks.length === 0 && deleteLogs.rows.length === 0) {
            console.log('STATUS: ZERO HISTORICAL DAMAGE DETECTED.');
            console.log('- No user deletions were ever executed on this database.');
            console.log('- All existing tenant blockchains have unbroken cryptographic hash continuity.');
            console.log('- No blocks have missing organization_id.');
        } else {
            console.log('STATUS: ISSUES DETECTED. See above details.');
        }
        console.log('====================================================\n');

    } catch (err) {
        console.error('Forensic check error:', err);
    } finally {
        await db.pool.end();
    }
}

checkHistoricalDamage();
