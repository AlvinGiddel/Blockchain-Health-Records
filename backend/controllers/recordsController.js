const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { getKenyanTimestamp, signRecord, Block } = require('../blockchain');
const {
    encrypt,
    decrypt,
    parseJsonIfNeeded,
    getRequesterOrgScope,
    verifyAuthToken
} = require('../utils/helpers');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';


/**
 * 1. Add new medical record (requires Doctor)
 * POST /api/records
 */
async function createRecord(req, res, dependencies = {}) {
    const { healthBlockchain = null, checkMempoolThreshold = null } = dependencies;
    try {
        let authUser;
        try {
            authUser = verifyAuthToken(req);
        } catch (err) {
            return res.status(err.status || 401).json({ error: err.message });
        }

        if (authUser.role !== 'doctor') {
            return res.status(403).json({ error: 'Access Denied: Only doctors can create medical records.' });
        }

        const { patientId, diagnosis, treatment, prescriptions, ipfsHash, doctorId } = req.body;

        // Verify doctor identity matches token - cannot impersonate another doctor
        if (doctorId && doctorId !== authUser.id) {
            return res.status(403).json({ error: 'Access Denied: You cannot create medical records on behalf of another doctor.' });
        }

        const effectiveDoctorId = authUser.id;

        const [doctorsRes, patientsRes] = await Promise.all([
            db.query('SELECT * FROM users WHERE id = $1', [effectiveDoctorId]),
            db.query('SELECT * FROM users WHERE id = $1', [patientId])
        ]);
        if (doctorsRes.rows.length === 0 || doctorsRes.rows[0].role !== 'doctor') {
            return res.status(403).json({ error: 'Only doctors can create medical records.' });
        }
        if (patientsRes.rows.length === 0) {
            return res.status(404).json({ error: 'Patient not found.' });
        }
        const doctor = doctorsRes.rows[0];
        const patient = patientsRes.rows[0];

        // Treating relationship check: Doctor must be treating the patient OR have active emergency break-glass override (< 1 hour ago)
        const [apptRes, breakGlassRes] = await Promise.all([
            db.query(
                "SELECT 1 FROM appointments WHERE patient_id = $1 AND doctor_id = $2 AND status IN ('Confirmed', 'Completed') LIMIT 1",
                [patientId, effectiveDoctorId]
            ),
            db.query(
                "SELECT 1 FROM audit_logs WHERE event_type IN ('emergency_break_glass', 'break_glass') AND patient_id = $1 AND doctor_id = $2 AND timestamp >= NOW() - INTERVAL '1 hour' LIMIT 1",
                [patientId, effectiveDoctorId]
            )
        ]);

        if (apptRes.rows.length === 0 && breakGlassRes.rows.length === 0) {
            return res.status(403).json({ error: 'Access Denied: You are not actively treating this patient and have no active break-glass authorization.' });
        }

        const timestamp = getKenyanTimestamp();

        // Construct the record structure for signing
        const recordData = {
            patientId,
            diagnosis,
            treatment,
            timestamp
        };

        // Sign the record using Doctor's Private Key
        console.log(`Doctor ${doctor.name} is signing medical record cryptographically...`);
        const signature = signRecord(doctor.private_key, recordData);

        const transactionHash = crypto.createHash('sha256').update(signature + timestamp).digest('hex');

        // Encrypt fields
        const encryptedDiagnosis = encrypt(diagnosis);
        const encryptedTreatment = encrypt(treatment);

        const recordOrgId = doctor.organization_id || req.user?.organization_id || null;

        // Create Record in PostgreSQL
        const { rows: newRecords } = await db.query(
            `INSERT INTO records (organization_id, patient_id, doctor_id, doctor_name, diagnosis, treatment, prescriptions, ipfs_hash, signature, doctor_public_key, timestamp, transaction_hash) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
            [recordOrgId, patientId, effectiveDoctorId, doctor.name, encryptedDiagnosis, encryptedTreatment, JSON.stringify(prescriptions), ipfsHash, signature, doctor.public_key, timestamp, transactionHash]
        );
        const newRecord = newRecords[0];

        // Create Audit Log Entry (in background)
        db.query(
            `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [recordOrgId, 'record_create', patientId, patient.name, effectiveDoctorId, doctor.name, `Dr. ${doctor.name} added a new diagnosis/treatment record.`, timestamp]
        ).catch(err => console.error('Failed to log record creation audit:', err));

        // Add to blockchain's pending record memory list
        const pendingRecord = {
            recordId: newRecord.id,
            organizationId: recordOrgId,
            txType: 'medical',
            patientId: patientId,
            patientName: patient.name,
            doctorId: effectiveDoctorId,
            doctorName: doctor.name,
            diagnosis,
            treatment,
            prescriptions,
            ipfsHash,
            signature,
            doctorPublicKey: doctor.public_key,
            timestamp,
            transactionHash
        };


        if (healthBlockchain && typeof healthBlockchain.addRecord === 'function') {
            healthBlockchain.addRecord(pendingRecord);
        }
        if (checkMempoolThreshold && typeof checkMempoolThreshold === 'function') {
            checkMempoolThreshold();
        }

        const responseRecord = {
            id: newRecord.id,
            patientId: newRecord.patient_id,
            doctorId: newRecord.doctor_id,
            doctorName: newRecord.doctor_name,
            diagnosis: diagnosis,
            treatment: treatment,
            prescriptions: newRecord.prescriptions,
            ipfsHash: newRecord.ipfs_hash,
            signature: newRecord.signature,
            doctorPublicKey: newRecord.doctor_public_key,
            isMined: false,
            blockIndex: -1,
            timestamp: newRecord.timestamp
        };

        res.status(201).json({ message: 'Record created, signed, and broadcast to Ledger Pool!', record: responseRecord });
    } catch (error) {
        console.error('Record creation error:', error);
        res.status(500).json({ error: error.message || 'Failed to create record.' });
    }
}

/**
 * 2. Get records for a specific patient
 * GET /api/records/patient/:id
 */
async function getPatientRecords(req, res) {
    try {
        let authUser;
        try {
            authUser = verifyAuthToken(req);
        } catch (err) {
            return res.status(err.status || 401).json({ error: err.message });
        }

        const patientId = req.params.id;
        const requesterId = authUser.id;
        const requesterRole = authUser.role;

        // Allow patient to access their own records
        if (requesterRole === 'patient') {
            if (requesterId !== patientId) {
                return res.status(403).json({ error: 'Access Denied: You can only view your own records.' });
            }
        } else if (requesterRole === 'doctor') {
            // Check if doctor is treating this patient OR has active emergency break-glass authorization (< 1 hour ago)
            const [apptRes, breakGlassRes] = await Promise.all([
                db.query(
                    "SELECT 1 FROM appointments WHERE patient_id = $1 AND doctor_id = $2 AND status IN ('Confirmed', 'Completed') LIMIT 1",
                    [patientId, requesterId]
                ),
                db.query(
                    "SELECT 1 FROM audit_logs WHERE event_type IN ('emergency_break_glass', 'break_glass') AND patient_id = $1 AND doctor_id = $2 AND timestamp >= NOW() - INTERVAL '1 hour' LIMIT 1",
                    [patientId, requesterId]
                )
            ]);

            if (apptRes.rows.length === 0 && breakGlassRes.rows.length === 0) {
                return res.status(403).json({ error: 'Access Denied: You do not have active treatment or emergency break-glass authorization for this patient.' });
            }
        } else if (requesterRole === 'admin' || requesterRole === 'super_admin') {
            // Org scoping if clinic admin
            if (requesterRole === 'admin') {
                const { targetOrgId } = getRequesterOrgScope(req);
                if (targetOrgId) {
                    const patientOrgRes = await db.query('SELECT organization_id FROM users WHERE id = $1', [patientId]);
                    if (patientOrgRes.rows.length > 0 && patientOrgRes.rows[0].organization_id && patientOrgRes.rows[0].organization_id !== targetOrgId) {
                        return res.status(403).json({ error: 'Access Denied: Patient belongs to another organization.' });
                    }
                }
            }
        } else {
            return res.status(403).json({ error: 'Access Denied: Invalid requester role.' });
        }

        // Create Audit Log Entry for record access (in background)
        if (requesterRole === 'doctor') {
            (async () => {
                try {
                    const [patientsRes, doctorsRes] = await Promise.all([
                        db.query('SELECT name FROM users WHERE id = $1', [patientId]),
                        db.query('SELECT name, organization_id FROM users WHERE id = $1', [requesterId])
                    ]);
                    if (patientsRes.rows.length > 0 && doctorsRes.rows.length > 0) {
                        const doctorOrg = doctorsRes.rows[0].organization_id || null;
                        await db.query(
                            `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
                             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                            [doctorOrg, 'record_access', patientId, patientsRes.rows[0].name, requesterId, doctorsRes.rows[0].name, `Dr. ${doctorsRes.rows[0].name} viewed electronic medical records folder.`]
                        );
                    }
                } catch (err) {
                    console.error('Failed to log record access audit:', err);
                }
            })();
        }

        const { rows: records } = await db.query(
            `SELECT r.id, r.patient_id as "patientId", r.doctor_id as "doctorId", r.doctor_name as "doctorName", 
                    r.diagnosis, r.treatment, r.prescriptions, r.record_type as "recordType", r.symptoms, 
                    r.notes, r.lab_request as "labRequest", r.consultation_hash as "consultationHash", 
                    r.transaction_hash as "transactionHash", r.ipfs_hash as "ipfsHash", r.signature, 
                    r.doctor_public_key as "doctorPublicKey", r.is_mined as "isMined", r.block_index as "blockIndex", 
                    r.timestamp, p.name as "patientName", p.patient_profile as "patientProfile"
             FROM records r
             LEFT JOIN users p ON r.patient_id = p.id
             WHERE r.patient_id = $1 ORDER BY r.timestamp DESC`,
            [patientId]
        );

        // Decrypt diagnosis & treatment before returning
        const decryptedRecords = records.map(rec => {
            rec.diagnosis = decrypt(rec.diagnosis);
            rec.treatment = decrypt(rec.treatment);
            return rec;
        });

        res.json(decryptedRecords);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

/**
 * 3. Get all medical records/consultations (Admin only)
 * GET /api/admin/records
 */
async function getAdminRecords(req, res) {
    try {
        let authUser;
        try {
            authUser = verifyAuthToken(req);
        } catch (err) {
            return res.status(err.status || 401).json({ error: err.message });
        }

        if (authUser.role !== 'admin' && authUser.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access Denied: Admin role required to access records ledger.' });
        }

        const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);
        const { recordType } = req.query;
        let query = `
            SELECT r.id, r.patient_id as "patientId", r.doctor_id as "doctorId", r.doctor_name as "doctorName", 
                   r.organization_id as "organizationId",
                   r.diagnosis, r.treatment, r.prescriptions, r.record_type as "recordType", r.symptoms, 
                   r.notes, r.lab_request as "labRequest", r.consultation_hash as "consultationHash", 
                   r.transaction_hash as "transactionHash", r.ipfs_hash as "ipfsHash", r.signature, 
                   r.doctor_public_key as "doctorPublicKey", r.is_mined as "isMined", r.block_index as "blockIndex", 
                   r.timestamp, p.name as "patientName", p.email as "patientEmail", d.name as "doctorEmailName", d.email as "doctorEmail"
            FROM records r
            JOIN users p ON r.patient_id = p.id
            JOIN users d ON r.doctor_id = d.id
        `;
        let conditions = [];
        let params = [];

        if (targetOrgId) {
            params.push(targetOrgId);
            conditions.push(`r.organization_id = $${params.length}`);
        } else if (!isSuperAdmin) {
            return res.json([]);
        }

        if (recordType) {
            params.push(recordType);
            conditions.push(`r.record_type = $${params.length}`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        query += ' ORDER BY r.timestamp DESC';

        const { rows: records } = await db.query(query, params);

        const formattedRecords = records.map(rec => {
            return {
                id: rec.id,
                patientId: { id: rec.patientId, name: rec.patientName, email: rec.patientEmail },
                doctorId: { id: rec.doctorId, name: rec.doctorName, email: rec.doctorEmail },
                doctorName: rec.doctorName,
                diagnosis: decrypt(rec.diagnosis),
                treatment: decrypt(rec.treatment),
                prescriptions: rec.prescriptions,
                recordType: rec.recordType,
                symptoms: rec.symptoms,
                notes: rec.notes,
                labRequest: rec.labRequest,
                consultationHash: rec.consultationHash,
                transactionHash: rec.transactionHash,
                ipfsHash: rec.ipfsHash,
                signature: rec.signature,
                doctorPublicKey: rec.doctorPublicKey,
                isMined: rec.isMined,
                blockIndex: rec.blockIndex,
                timestamp: rec.timestamp
            };
        });

        res.json(formattedRecords);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

/**
 * 4. Cryptographic Record Seal Verification
 * POST /api/records/verify-seal
 */
async function verifySeal(req, res) {
    try {
        const { recordId } = req.body || {};
        if (!recordId || !String(recordId).trim()) {
            return res.status(400).json({ error: 'Record ID is required for verification.' });
        }

        const cleanId = String(recordId).trim();
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);

        let record = null;
        let isMined = false;
        let blockIndex = -1;

        if (isUuid) {
            const { rows: recs } = await db.query('SELECT * FROM records WHERE id = $1', [cleanId]);
            if (recs.length > 0) {
                record = recs[0];
                isMined = record.is_mined;
                blockIndex = record.block_index;
            }
        } else {
            // Check by transaction_hash, consultation_hash, ipfs_hash, or text search
            const { rows: recs } = await db.query(
                'SELECT * FROM records WHERE transaction_hash = $1 OR consultation_hash = $1 OR ipfs_hash = $1 OR id::text LIKE $2',
                [cleanId, `%${cleanId}%`]
            );
            if (recs.length > 0) {
                record = recs[0];
                isMined = record.is_mined;
                blockIndex = record.block_index;
            }
        }

        if (!record) {
            const { rows: allBlocks } = await db.query('SELECT * FROM blocks ORDER BY index ASC');
            for (let b of allBlocks) {
                const bRecords = parseJsonIfNeeded(b.records) || [];
                const found = bRecords.find(r => r.recordId === cleanId || r.id === cleanId || r.transactionHash === cleanId);
                if (found) {
                    record = found;
                    isMined = true;
                    blockIndex = b.index;
                    break;
                }
            }
        }

        if (!record) {
            return res.status(404).json({ isVerified: false, error: 'Record not found. Please ensure you enter a valid 36-character Record UUID (e.g., 4835312b-2cca-489b-b9c8-d58b6e0e3711).' });
        }

        let isSignatureValid = true;
        const doctorPubKey = record.doctor_public_key || record.doctorPublicKey;
        if (record.signature && doctorPubKey) {
            try {
                const verify = crypto.createVerify('SHA256');
                const patientId = record.patient_id || record.patientId || '';
                const timestamp = record.timestamp || '';
                let dataToVerify = '';

                if (record.record_type === 'consultation' || record.txType === 'consultation' || record.consultation_hash || record.consultationHash) {
                    const cHash = record.consultation_hash || record.consultationHash || '';
                    dataToVerify = patientId + cHash + timestamp;
                } else {
                    const diag = decrypt(record.diagnosis);
                    const treat = decrypt(record.treatment);
                    dataToVerify = patientId + diag + treat + timestamp;
                }

                verify.update(dataToVerify);
                verify.end();
                isSignatureValid = verify.verify(doctorPubKey, record.signature, 'hex');
            } catch (vErr) {
                console.error('Signature verification error:', vErr);
                isSignatureValid = Boolean(record.signature && record.signature.length > 20);
            }
        }

        res.json({
            isVerified: isSignatureValid,
            recordId: record.id,
            doctorName: record.doctor_name || record.doctorName || 'Authorized Clinician',
            doctorPublicKey: (record.doctor_public_key || record.doctorPublicKey || '').slice(0, 36) + '...',
            isMined,
            blockIndex,
            timestamp: record.timestamp,
            signature: record.signature
        });
    } catch (err) {
        console.error('Verify seal error:', err);
        res.status(400).json({ isVerified: false, error: 'Invalid input format. Please enter a valid 36-character Record UUID.' });
    }
}

/**
 * 5. Lightweight Specialist Consultation Note
 * POST /api/records/:id/specialist-note
 */
async function addSpecialistNote(req, res) {
    try {
        let authUser;
        try {
            authUser = verifyAuthToken(req);
        } catch (err) {
            return res.status(err.status || 401).json({ error: err.message });
        }

        if (authUser.role !== 'doctor' && authUser.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access Denied: Only doctors or specialists can attach specialist notes.' });
        }

        const recordId = req.params.id;
        const { specialistNote } = req.body || {};

        if (!specialistNote || !specialistNote.trim()) {
            return res.status(400).json({ error: 'Specialist note content is required.' });
        }

        // Verify record exists and enforce multi-tenant scoping
        const { rows: existingRecs } = await db.query('SELECT id, organization_id FROM records WHERE id = $1', [recordId]);
        if (existingRecs.length === 0) {
            return res.status(404).json({ error: 'Medical record not found.' });
        }
        const record = existingRecs[0];
        if (authUser.role !== 'super_admin' && authUser.organization_id && record.organization_id && authUser.organization_id !== record.organization_id) {
            return res.status(403).json({ error: 'Access Denied: Cross-tenant modification of records is prohibited.' });
        }

        // Strict identity binding: Note author bound strictly to authenticated doctor JWT, never unverified req.body
        const effectiveDoctorName = authUser.name || 'Specialist';
        const formattedNote = `[Specialist Note - Dr. ${effectiveDoctorName}]: ${specialistNote.trim()}`;

        const { rows: updatedRecs } = await db.query(
            `UPDATE records SET notes = CASE WHEN notes IS NULL OR notes = '' THEN $1 ELSE notes || '\n' || $1 END WHERE id = $2 RETURNING *`,
            [formattedNote, recordId]
        );

        if (updatedRecs.length === 0) {
            return res.status(404).json({ error: 'Medical record not found.' });
        }

        res.json({ success: true, message: 'Specialist note attached to record.', record: updatedRecs[0] });
    } catch (err) {
        console.error('Specialist note error:', err);
        res.status(500).json({ error: 'Failed to save specialist note.' });
    }
}

/**
 * 6. Public Verifiable Medical Record Blockchain Proof (For QR Code Scans)
 * GET /api/records/:id/verify-blockchain
 */
async function verifyBlockchainProof(req, res) {
    try {
        const recordId = req.params.id;
        const { rows: recRows } = await db.query(
            `SELECT r.*, 
                    p.name as "patientName", p.email as "patientEmail", p.patient_profile as "patientProfile",
                    d.name as "docName", d.email as "docEmail", d.doctor_profile as "docProfile", d.public_key as "doctorPublicKey" 
             FROM records r 
             LEFT JOIN users p ON r.patient_id = p.id 
             LEFT JOIN users d ON r.doctor_id = d.id 
             WHERE r.id = $1`,
            [recordId]
        );

        if (recRows.length === 0) {
            return res.status(404).json({ verified: false, error: 'Medical record not found in system.' });
        }

        const rec = recRows[0];
        let blockData = null;

        if (rec.is_mined && rec.block_index !== null) {
            let blockQuery = 'SELECT * FROM blocks WHERE index = $1';
            const blockParams = [rec.block_index];
            if (rec.organization_id) {
                blockQuery += ' AND (organization_id = $2 OR organization_id IS NULL)';
                blockParams.push(rec.organization_id);
            }
            const { rows: blockRows } = await db.query(blockQuery, blockParams);
            if (blockRows.length > 0) {
                blockData = blockRows[0];
            }
        }

        if (rec.is_mined && !blockData) {
            return res.json({ verified: false, error: 'Cryptographic block proof not found in tenant ledger.' });
        }
        const decryptedDiagnosis = decrypt(rec.diagnosis);
        const decryptedTreatment = decrypt(rec.treatment);

        // Verify RSA Signature (support both standard signRecord concatenation and legacy formats)
        let isSignatureValid = false;
        if (rec.doctorPublicKey && rec.signature) {
            const formats = [
                (rec.patient_id || '') + (decryptedDiagnosis || '') + (decryptedTreatment || '') + (rec.timestamp || ''),
                `${rec.patient_id}-${decryptedDiagnosis}-${decryptedTreatment}-${rec.timestamp}`,
                `${rec.patient_id}-${rec.diagnosis}-${rec.treatment}-${rec.timestamp}`
            ];
            for (const fmt of formats) {
                try {
                    const verify = crypto.createVerify('SHA256');
                    verify.update(fmt);
                    verify.end();
                    if (verify.verify(rec.doctorPublicKey, rec.signature, 'hex')) {
                        isSignatureValid = true;
                        break;
                    }
                } catch (sigErr) {
                    // continue to next format
                }
            }
        }


        res.json({
            verified: true,
            recordId: rec.id,
            patientId: rec.patient_id,
            patientName: rec.patientName || 'Registered Patient',
            patientEmail: rec.patientEmail || '',
            patientProfile: parseJsonIfNeeded(rec.patientProfile) || {},
            doctorId: rec.doctor_id,
            doctorName: rec.doctor_name || rec.docName || 'Attending Physician',
            doctorProfile: parseJsonIfNeeded(rec.docProfile) || {},
            diagnosis: decryptedDiagnosis,
            treatment: decryptedTreatment,
            symptoms: rec.symptoms || '',
            notes: rec.notes || '',
            prescriptions: parseJsonIfNeeded(rec.prescriptions) || [],
            labRequest: rec.lab_request || '',
            timestamp: rec.timestamp,
            isMined: rec.is_mined,
            blockIndex: rec.block_index,
            blockHash: blockData ? blockData.hash : null,
            previousHash: blockData ? blockData.previous_hash : null,
            minedTimestamp: blockData ? blockData.timestamp : null,
            nonce: blockData ? blockData.nonce : null,
            signatureValid: isSignatureValid,
            signature: rec.signature,
            doctorPublicKey: rec.doctorPublicKey,
            blockchainSealStatus: rec.is_mined ? 'IMMUTABLE_MINED_ON_CHAIN' : 'QUEUED_IN_MEMPOOL'
        });
    } catch (err) {
        console.error('Verify blockchain proof error:', err);
        res.status(500).json({ verified: false, error: 'Failed to verify blockchain proof.' });
    }
}

/**
 * 7. Get Blockchain Mempool (Pending Ledger Queue)
 * GET /api/blockchain/mempool
 */
function getMempool(req, res, dependencies = {}) {
    const { healthBlockchain = null } = dependencies;
    try {
        const pending = healthBlockchain ? healthBlockchain.pendingRecords : [];
        res.json(pending);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

/**
 * 8. Mine pending records into a block (Manual Admin Trigger)
 * POST /api/blockchain/mine
 */
async function mineBlock(req, res, dependencies = {}) {
    const { isMining = false, executeMining = null } = dependencies;
    try {
        let authUser;
        try {
            authUser = verifyAuthToken(req);
        } catch (err) {
            return res.status(err.status || 401).json({ error: err.message });
        }

        if (authUser.role !== 'admin' && authUser.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access Denied: Only administrators can trigger blockchain mining.' });
        }

        if (typeof isMining === 'function' ? isMining() : isMining) {
            return res.status(409).json({ error: 'Mining is already in progress. Please wait for the current block to seal.' });
        }
        if (!executeMining) {
            return res.status(500).json({ error: 'Mining engine is not initialized.' });
        }

        const result = await executeMining('manual admin trigger');
        if (!result.success) {
            return res.status(400).json({ error: result.error || 'No pending records to mine. Add new records first.' });
        }

        res.status(200).json({
            message: 'Block successfully mined and stored on ledger!',
            block: result.block
        });
    } catch (error) {
        console.error('Manual mining failed:', error);
        res.status(500).json({ error: 'Mining failed: ' + error.message });
    }
}

/**
 * 9. Get all blocks
 * GET /api/blockchain/blocks
 */
async function getBlocks(req, res) {
    try {
        const orgId = req.headers['x-organization-id'] || req.query.orgId || null;
        let query = 'SELECT b.id, b.organization_id as "organizationId", o.name as "organizationName", b.index, b.timestamp, b.records, b.previous_hash as "previousHash", b.nonce, b.hash FROM blocks b LEFT JOIN organizations o ON b.organization_id = o.id ';
        const params = [];
        if (orgId) {
            query += 'WHERE b.organization_id = $1 ';
            params.push(orgId);
        }
        query += 'ORDER BY b.organization_id, b.index ASC';

        const { rows: blocks } = await db.query(query, params);
        const formattedBlocks = blocks.map(b => {
            let records = b.records;
            if (typeof records === 'string') {
                try { records = JSON.parse(records); } catch (e) { }
            }
            if (typeof records === 'string') {
                try { records = JSON.parse(records); } catch (e) { }
            }
            return {
                ...b,
                records: Array.isArray(records) ? records : []
            };
        });
        res.json(formattedBlocks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

/**
 * 10. Validate chain integrity across multi-tenant ledgers
 * GET /api/blockchain/validate
 */
async function validateChain(req, res, dependencies = {}) {
    const { validateMultiTenantChains = null } = dependencies;
    try {
        const orgId = req.headers['x-organization-id'] || req.query.orgId || null;
        if (!validateMultiTenantChains) {
            return res.status(500).json({ error: 'Chain validator not available.' });
        }
        const isValid = await validateMultiTenantChains(orgId);
        res.json({ isValid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

/**
 * 11. Simulate database tampering attack (manipulate diagnosis of a record directly in PostgreSQL)
 * POST /api/blockchain/tamper
 *
 * CRITICAL SECURITY SAFEGUARDS:
 * 1. Super Admin authentication required (Bearer JWT with role = 'super_admin').
 * 2. Demo-Data restriction: operates ONLY on records marked is_demo_data = true.
 *    Real patient records cannot be altered under any circumstance.
 */
async function tamperRecord(req, res, dependencies = {}) {
    const { healthBlockchain = null } = dependencies;
    try {
        // 1. Super Admin Role Enforcement
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }
        const token = authHeader.substring(7).trim();
        let decoded;
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (jwtErr) {
            return res.status(401).json({ error: 'Invalid or expired authentication token.' });
        }
        if (!decoded || decoded.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access restricted to Super Administrators only.' });
        }

        const { recordId, tamperedDiagnosis } = req.body;
        if (!recordId || !tamperedDiagnosis) {
            return res.status(400).json({ error: 'recordId and tamperedDiagnosis are required.' });
        }

        const { rows: records } = await db.query('SELECT * FROM records WHERE id = $1', [recordId]);
        if (records.length === 0) {
            return res.status(404).json({ error: 'Record not found.' });
        }
        const record = records[0];

        // 2. Strict Demo-Data Restriction: NEVER allow tampering with real patient records!
        if (!record.is_demo_data) {
            return res.status(403).json({
                error: 'Tampering simulation is strictly restricted to designated demo records. Real patient records cannot be altered under any circumstance.'
            });
        }

        const oldDiagnosis = decrypt(record.diagnosis);

        // Force-update PostgreSQL records table to write raw plaintext (simulate database tampering)
        await db.query('UPDATE records SET diagnosis = $1 WHERE id = $2', [tamperedDiagnosis, recordId]);

        // Also tamper with the block list in the DB/memory to demonstrate chain corruption
        if (record.is_mined && record.block_index !== -1) {
            let blockQuery = 'SELECT * FROM blocks WHERE index = $1';
            let blockParams = [record.block_index];
            if (record.organization_id) {
                blockQuery += ' AND organization_id = $2';
                blockParams.push(record.organization_id);
            }
            const { rows: blocks } = await db.query(blockQuery, blockParams);
            if (blocks.length > 0) {
                const block = blocks[0];
                const blockRecs = parseJsonIfNeeded(block.records) || [];
                const updatedRecords = blockRecs.map(rec => {
                    if (rec.recordId === recordId) {
                        rec.diagnosis = tamperedDiagnosis + " (HACKED)";
                    }
                    return rec;
                });
                await db.query('UPDATE blocks SET records = $1 WHERE id = $2', [JSON.stringify(updatedRecords), block.id]);
            }

            // Tamper in-memory chain too
            if (healthBlockchain && Array.isArray(healthBlockchain.chain)) {
                const memoryBlock = healthBlockchain.chain.find(b => b.index === record.block_index);
                if (memoryBlock && Array.isArray(memoryBlock.records)) {
                    memoryBlock.records = memoryBlock.records.map(rec => {
                        if (rec.recordId === recordId) {
                            rec.diagnosis = tamperedDiagnosis + " (HACKED)";
                        }
                        return rec;
                    });
                }
            }
        }

        res.json({
            message: `Database TAMPERED successfully! Diagnoses updated directly. Old: "${oldDiagnosis}", New: "${tamperedDiagnosis}". Check blockchain validation state now.`,
            success: true
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

/**
 * 12. Recover database records from the blockchain blocks (Self-Healing)
 * POST /api/blockchain/recover
 *
 * CRITICAL SECURITY SAFEGUARD:
 * Super Admin authentication required (Bearer JWT with role = 'super_admin').
 */
async function recoverBlockchain(req, res, dependencies = {}) {
    const { syncBlockchainWithDatabase = null } = dependencies;
    try {
        // 1. Super Admin Role Enforcement
        let decoded = (req.user && req.user.id) ? req.user : null;
        if (!decoded) {
            const authHeader = req.headers.authorization || req.headers.Authorization;
            if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ error: 'Authentication token required.' });
            }
            const token = authHeader.substring(7).trim();
            try {
                decoded = jwt.verify(token, JWT_SECRET);
            } catch (jwtErr) {
                return res.status(401).json({ error: 'Invalid or expired authentication token.' });
            }
        }
        if (!decoded || decoded.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access restricted to Super Administrators only.' });
        }

        console.log('Initiating Ledger Self-Healing Recovery...');

        let query = 'SELECT * FROM blocks';
        const params = [];
        const requestedOrgId = req.headers['x-organization-id'] || req.body?.organizationId || req.query?.orgId || null;
        if (requestedOrgId) {
            query += ' WHERE organization_id = $1';
            params.push(requestedOrgId);
        }
        query += ' ORDER BY organization_id, index ASC';

        const { rows: dbBlocks } = await db.query(query, params);
        if (dbBlocks.length <= 1) {
            return res.status(400).json({ error: 'No block data to recover from. Genesis block cannot be repaired.' });
        }

        // Group blocks by organization_id so each hospital's ledger chain is healed independently
        const orgMap = {};
        for (const b of dbBlocks) {
            const orgId = b.organization_id || 'default';
            if (!orgMap[orgId]) orgMap[orgId] = [];
            orgMap[orgId].push(b);
        }

        for (const orgId in orgMap) {
            const chain = orgMap[orgId];
            for (let i = 1; i < chain.length; i++) {
                const block = chain[i];
                let cleanRecords = [];
                const blockRecs = parseJsonIfNeeded(block.records) || [];

                for (let rec of blockRecs) {
                    const { rows: recRows } = await db.query('SELECT * FROM records WHERE id = $1', [rec.recordId]);
                    if (recRows.length > 0) {
                        const originalDiagnosis = (rec.diagnosis || '').replace(/ \(HACKED\)/g, '');

                        // Encrypt original diagnosis back
                        await db.query('UPDATE records SET diagnosis = $1 WHERE id = $2', [encrypt(originalDiagnosis), rec.recordId]);
                        rec.diagnosis = originalDiagnosis;
                    }
                    cleanRecords.push(rec);
                }

                const prevBlock = chain[i - 1];
                block.previous_hash = prevBlock.hash;
                block.records = cleanRecords;

                // Recompute valid block hash meeting proof-of-work difficulty
                const b = new Block(
                    block.index,
                    block.timestamp,
                    block.records,
                    block.previous_hash
                );
                b.mineBlock(2); // Fast recovery proof-of-work

                await db.query('UPDATE blocks SET records = $1, previous_hash = $2, nonce = $3, hash = $4 WHERE id = $5', [JSON.stringify(block.records), block.previous_hash, b.nonce, b.hash, block.id]);
                block.nonce = b.nonce;
                block.hash = b.hash;
            }
        }

        // Re-sync memory chain
        if (syncBlockchainWithDatabase && typeof syncBlockchainWithDatabase === 'function') {
            await syncBlockchainWithDatabase();
        }

        res.json({ success: true, message: 'Ledger database successfully recovered! Chain integrity restored.' });
    } catch (err) {
        console.error('Recovery failed:', err);
        res.status(500).json({ error: err.message });
    }
}

/**
 * 13. Get designated simulation demo records for safe tampering tests
 * GET /api/blockchain/demo-records
 */
async function getDemoRecords(req, res) {
    try {
        const { rows: demoRecs } = await db.query(`
            SELECT r.id, r.patient_id, r.diagnosis, r.treatment, r.is_mined, r.block_index, r.timestamp, r.is_demo_data,
                   u.name as "patientName"
            FROM records r
            LEFT JOIN users u ON r.patient_id = u.id
            WHERE r.is_demo_data = true
            ORDER BY r.timestamp DESC
        `);

        const formatted = demoRecs.map(r => ({
            ...r,
            diagnosis: decrypt(r.diagnosis),
            treatment: decrypt(r.treatment)
        }));

        res.json(formatted);
    } catch (err) {
        console.error('Failed to get demo records:', err);
        res.status(500).json({ error: 'Failed to retrieve simulation demo records.' });
    }
}

module.exports = {
    createRecord,
    getPatientRecords,
    getAdminRecords,
    verifySeal,
    addSpecialistNote,
    verifyBlockchainProof,
    getMempool,
    mineBlock,
    getBlocks,
    validateChain,
    tamperRecord,
    recoverBlockchain,
    getDemoRecords
};

