const db = require('../db');
const crypto = require('crypto');
const { encrypt } = require('../utils/helpers');
const { Block, generateKeyPair, getKenyanTimestamp } = require('../blockchain');

async function seedDemoSimulationRecords() {
    console.log('=== SEEDING DEDICATED DEMO SIMULATION RECORDS ===');
    try {
        // 1. Get an organization
        const { rows: orgs } = await db.query("SELECT id, name FROM organizations ORDER BY created_at ASC LIMIT 1");
        if (orgs.length === 0) {
            console.error('No organization found. Please run organization seeds first.');
            process.exit(1);
        }
        const org = orgs[0];
        console.log(`Using Organization: ${org.name} (${org.id})`);

        // 2. Find or create demo patient
        let patientId;
        const { rows: existingPatients } = await db.query(
            "SELECT id FROM users WHERE email = 'demo.patient@simulation.test' LIMIT 1"
        );
        if (existingPatients.length > 0) {
            patientId = existingPatients[0].id;
            console.log(`Found existing demo patient: ${patientId}`);
        } else {
            const { publicKey: patPub, privateKey: patPriv } = generateKeyPair();
            const { rows: newPat } = await db.query(`
                INSERT INTO users (name, email, password, role, organization_id, is_approved, public_key, private_key)
                VALUES ('Jane Doe (Simulation Demo Patient)', 'demo.patient@simulation.test', 'demo_hash_not_for_login', 'patient', $1, true, $2, $3)
                RETURNING id
            `, [org.id, patPub, patPriv]);
            patientId = newPat[0].id;
            console.log(`Created demo patient: ${patientId}`);
        }

        // 3. Find or create demo doctor
        let doctorId;
        let doctorKeypair;
        const { rows: existingDoctors } = await db.query(
            "SELECT id, public_key FROM users WHERE role = 'doctor' LIMIT 1"
        );
        let docPub, docPriv;
        if (existingDoctors.length > 0 && existingDoctors[0].public_key) {
            doctorId = existingDoctors[0].id;
            docPub = existingDoctors[0].public_key;
            // Generate temporary pair for signature if private key isn't stored in DB
            const tempPair = generateKeyPair();
            docPriv = tempPair.privateKey;
            docPub = tempPair.publicKey;
            console.log(`Using doctor ID: ${doctorId}`);
        } else {
            const newPair = generateKeyPair();
            docPub = newPair.publicKey;
            docPriv = newPair.privateKey;
            const { rows: newDoc } = await db.query(`
                INSERT INTO users (name, email, password, role, organization_id, is_approved, public_key, private_key)
                VALUES ('Dr. Simulation Specialist', 'demo.doctor@simulation.test', 'demo_hash_not_for_login', 'doctor', $1, true, $2, $3)
                RETURNING id
            `, [org.id, docPub, docPriv]);
            doctorId = newDoc[0].id;
            console.log(`Created demo doctor: ${doctorId}`);
        }

        // Helper to sign record message
        function createSignature(message, privateKey) {
            const signer = crypto.createSign('sha256');
            signer.update(message);
            signer.end();
            return signer.sign(privateKey, 'hex');
        }

        // 4. Check if demo records already exist
        const { rows: existingDemoRecs } = await db.query(
            "SELECT id FROM records WHERE is_demo_data = true"
        );
        if (existingDemoRecs.length >= 2) {
            console.log(`Demo simulation records already seeded (${existingDemoRecs.length} records exist).`);
            process.exit(0);
        }

        console.log('Seeding 2 new demo records with is_demo_data = true...');
        const timestamp1 = getKenyanTimestamp();
        const plainDiag1 = 'Simulated Stage 1 Hypertension (Demo Patient)';
        const plainTreat1 = 'Amlodipine 5mg daily, Low Sodium Diet (Simulation Plan)';
        const encDiag1 = encrypt(plainDiag1);
        const encTreat1 = encrypt(plainTreat1);
        const msg1 = patientId + plainDiag1 + plainTreat1 + timestamp1;
        const sig1 = createSignature(msg1, docPriv);

        const { rows: rec1Rows } = await db.query(`
            INSERT INTO records (
                organization_id, patient_id, doctor_id, doctor_name,
                diagnosis, treatment, prescriptions, record_type,
                symptoms, notes, signature, doctor_public_key,
                is_mined, block_index, timestamp, is_demo_data
            ) VALUES (
                $1, $2, $3, 'Dr. Simulation Specialist',
                $4, $5, '["Amlodipine 5mg"]'::jsonb, 'medical',
                'Mild headaches, blood pressure 142/92', 'Demonstration record for tamper attack simulation',
                $6, $7, false, -1, $8, true
            ) RETURNING *
        `, [org.id, patientId, doctorId, encDiag1, encTreat1, sig1, docPub, timestamp1]);
        const record1 = rec1Rows[0];
        console.log(`Inserted Demo Record 1: ${record1.id}`);

        const timestamp2 = getKenyanTimestamp();
        const plainDiag2 = 'Simulated Type 2 Diabetes Routine Check (Demo Patient)';
        const plainTreat2 = 'Metformin 500mg BD, Blood Glucose Monitoring';
        const encDiag2 = encrypt(plainDiag2);
        const encTreat2 = encrypt(plainTreat2);
        const msg2 = patientId + plainDiag2 + plainTreat2 + timestamp2;
        const sig2 = createSignature(msg2, docPriv);

        const { rows: rec2Rows } = await db.query(`
            INSERT INTO records (
                organization_id, patient_id, doctor_id, doctor_name,
                diagnosis, treatment, prescriptions, record_type,
                symptoms, notes, signature, doctor_public_key,
                is_mined, block_index, timestamp, is_demo_data
            ) VALUES (
                $1, $2, $3, 'Dr. Simulation Specialist',
                $4, $5, '["Metformin 500mg"]'::jsonb, 'medical',
                'Routine screening, fasting glucose 6.8 mmol/L', 'Demonstration record for tamper attack simulation',
                $6, $7, false, -1, $8, true
            ) RETURNING *
        `, [org.id, patientId, doctorId, encDiag2, encTreat2, sig2, docPub, timestamp2]);
        const record2 = rec2Rows[0];
        console.log(`Inserted Demo Record 2: ${record2.id}`);

        // 5. Mine Block #1 containing Record 1 so that the simulation attack has an active mined block
        // Find latest block for this organization
        const { rows: lastBlocks } = await db.query(
            "SELECT * FROM blocks WHERE organization_id = $1 ORDER BY index DESC LIMIT 1",
            [org.id]
        );
        let prevHash = "0";
        let nextIndex = 1;
        if (lastBlocks.length > 0) {
            prevHash = lastBlocks[0].hash;
            nextIndex = lastBlocks[0].index + 1;
        } else {
            // Create genesis block for this org
            const genesisBlock = new Block(0, getKenyanTimestamp(), [{
                txType: 'medical',
                message: `Genesis Block for ${org.name}`,
                doctor: 'System Admin'
            }], "0");
            genesisBlock.mineBlock(2);
            await db.query(`
                INSERT INTO blocks (organization_id, index, timestamp, records, previous_hash, nonce, hash)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [org.id, 0, genesisBlock.timestamp, JSON.stringify(genesisBlock.records), genesisBlock.previousHash, genesisBlock.nonce, genesisBlock.hash]);
            prevHash = genesisBlock.hash;
        }

        const blockPayload = [{
            recordId: record1.id,
            patientId: record1.patient_id,
            patientName: 'Jane Doe (Simulation Demo Patient)',
            doctorId: record1.doctor_id,
            doctorName: 'Dr. Simulation Specialist',
            diagnosis: plainDiag1,
            treatment: plainTreat1,
            timestamp: record1.timestamp,
            signature: record1.signature,
            doctorPublicKey: record1.doctor_public_key,
            is_demo_data: true
        }];

        const block1 = new Block(nextIndex, getKenyanTimestamp(), blockPayload, prevHash);
        block1.mineBlock(2);

        await db.query(`
            INSERT INTO blocks (organization_id, index, timestamp, records, previous_hash, nonce, hash)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [org.id, nextIndex, block1.timestamp, JSON.stringify(block1.records), block1.previousHash, block1.nonce, block1.hash]);

        // Update record 1 to is_mined = true, block_index = nextIndex
        await db.query(
            "UPDATE records SET is_mined = true, block_index = $1 WHERE id = $2",
            [nextIndex, record1.id]
        );

        console.log(`Mined Block #${nextIndex} successfully for Demo Record 1 (Hash: ${block1.hash})`);
        console.log('Demo simulation records seeded and prepared successfully!');

    } catch (err) {
        console.error('Seeding error:', err);
    } finally {
        process.exit(0);
    }
}

seedDemoSimulationRecords();
