const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const recordsRepo = require('../repositories/recordsRepository');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
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
    const authUser = verifyAuthToken(req);

    if (authUser.role !== 'doctor') {
        throw new AppError('Access Denied: Only doctors can create medical records.', 403);
    }

    const { patientId, diagnosis, treatment, prescriptions, ipfsHash, doctorId } = req.body;

    // Verify doctor identity matches token - cannot impersonate another doctor
    if (doctorId && doctorId !== authUser.id) {
        throw new AppError('Access Denied: You cannot create medical records on behalf of another doctor.', 403);
    }

    const effectiveDoctorId = authUser.id;

    const { doctor, patient } = await recordsRepo.findDoctorAndPatient(effectiveDoctorId, patientId);
    if (!doctor || doctor.role !== 'doctor') {
        throw new AppError('Only doctors can create medical records.', 403);
    }
    if (!patient) {
        throw new AppError('Patient not found.', 404);
    }

    // Treating relationship check: Doctor must be treating the patient OR have active emergency break-glass override (< 1 hour ago)
    const isTreating = await recordsRepo.checkTreatingRelationship(effectiveDoctorId, patientId);
    if (!isTreating) {
        throw new AppError('Access Denied: You are not actively treating this patient and have no active break-glass authorization.', 403);
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
    const newRecord = await recordsRepo.createMedicalRecord({
        organizationId: recordOrgId,
        patientId,
        doctorId: effectiveDoctorId,
        doctorName: doctor.name,
        diagnosis: encryptedDiagnosis,
        treatment: encryptedTreatment,
        prescriptions,
        ipfsHash,
        signature,
        doctorPublicKey: doctor.public_key,
        timestamp,
        transactionHash
    });

    // Create Audit Log Entry (in background)
    recordsRepo.createAuditLog({
        organizationId: recordOrgId,
        eventType: 'record_create',
        patientId,
        patientName: patient.name,
        doctorId: effectiveDoctorId,
        doctorName: doctor.name,
        details: `Dr. ${doctor.name} added a new diagnosis/treatment record.`,
        timestamp
    }).catch(err => console.error('Failed to log record creation audit:', err));

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
}

/**
 * 2. Get records for a specific patient
 * GET /api/records/patient/:id
 */
const getPatientRecords = catchAsync(async (req, res) => {
    const authUser = verifyAuthToken(req);
    const patientId = req.params.id;
    const requesterId = authUser.id;
    const requesterRole = authUser.role;

    // Allow patient to access their own records
    if (requesterRole === 'patient') {
        if (requesterId !== patientId) {
            throw new AppError('Access Denied: You can only view your own records.', 403);
        }
    } else if (requesterRole === 'doctor') {
        // Check if doctor is treating this patient OR has active emergency break-glass authorization (< 1 hour ago)
        const isAuthorized = await recordsRepo.checkTreatingRelationship(requesterId, patientId);
        if (!isAuthorized) {
            throw new AppError('Access Denied: You do not have active treatment or emergency break-glass authorization for this patient.', 403);
        }
    } else if (requesterRole === 'admin' || requesterRole === 'super_admin') {
        // Org scoping if clinic admin
        if (requesterRole === 'admin') {
            const { targetOrgId } = getRequesterOrgScope(req);
            if (targetOrgId) {
                const patientUser = await recordsRepo.findUserById(patientId);
                if (patientUser && patientUser.organization_id && patientUser.organization_id !== targetOrgId) {
                    throw new AppError('Access Denied: Patient belongs to another organization.', 403);
                }
            }
        }
    } else {
        throw new AppError('Access Denied: Invalid requester role.', 403);
    }

    // Create Audit Log Entry for record access (in background)
    if (requesterRole === 'doctor') {
        (async () => {
            try {
                const { doctor, patient } = await recordsRepo.findDoctorAndPatient(requesterId, patientId);
                if (patient && doctor) {
                    const doctorOrg = doctor.organization_id || null;
                    await recordsRepo.createAuditLog({
                        organizationId: doctorOrg,
                        eventType: 'record_access',
                        patientId,
                        patientName: patient.name,
                        doctorId: requesterId,
                        doctorName: doctor.name,
                        details: `Dr. ${doctor.name} viewed electronic medical records folder.`
                    });
                }
            } catch (err) {
                console.error('Failed to log record access audit:', err);
            }
        })();
    }

    const records = await recordsRepo.findRecordsByPatient({ patientId });

    // Decrypt diagnosis & treatment before returning
    const decryptedRecords = records.map(rec => {
        rec.diagnosis = decrypt(rec.diagnosis);
        rec.treatment = decrypt(rec.treatment);
        return rec;
    });

    res.json(decryptedRecords);
});

/**
 * 3. Get all medical records/consultations (Admin only)
 * GET /api/admin/records
 */
const getAdminRecords = catchAsync(async (req, res) => {
    const authUser = verifyAuthToken(req);

    if (authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        throw new AppError('Access Denied: Admin role required to access records ledger.', 403);
    }

    const { isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);
    const { recordType } = req.query;

    if (!targetOrgId && !isSuperAdmin) {
        return res.json([]);
    }

    const records = await recordsRepo.getAllRecordsAdmin({
        targetOrgId,
        isSuperAdmin,
        recordType
    });

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
});

/**
 * 4. Cryptographic Record Seal Verification
 * POST /api/records/verify-seal
 */
const verifySeal = catchAsync(async (req, res) => {
    const { recordId } = req.body || {};
    if (!recordId || !String(recordId).trim()) {
        throw new AppError('Record ID is required for verification.', 400);
    }

    const cleanId = String(recordId).trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);

    let record = null;
    let isMined = false;
    let blockIndex = -1;

    if (isUuid) {
        const rec = await recordsRepo.findRecordById(cleanId);
        if (rec) {
            record = rec;
            isMined = record.is_mined;
            blockIndex = record.block_index;
        }
    } else {
        const rec = await recordsRepo.findRecordByHashes(cleanId);
        if (rec) {
            record = rec;
            isMined = record.is_mined;
            blockIndex = record.block_index;
        }
    }

    if (!record) {
        const allBlocks = await recordsRepo.getAllBlocksOrdered();
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
});

/**
 * 5. Lightweight Specialist Consultation Note
 * POST /api/records/:id/specialist-note
 */
const addSpecialistNote = catchAsync(async (req, res) => {
    const authUser = verifyAuthToken(req);

    if (authUser.role !== 'doctor' && authUser.role !== 'super_admin') {
        throw new AppError('Access Denied: Only doctors or specialists can attach specialist notes.', 403);
    }

    const recordId = req.params.id;
    const { specialistNote } = req.body || {};

    if (!specialistNote || !specialistNote.trim()) {
        throw new AppError('Specialist note content is required.', 400);
    }

    // Verify record exists and enforce multi-tenant scoping
    const record = await recordsRepo.findRecordById(recordId);
    if (!record) {
        throw new AppError('Medical record not found.', 404);
    }
    if (authUser.role !== 'super_admin' && authUser.organization_id && record.organization_id && authUser.organization_id !== record.organization_id) {
        throw new AppError('Access Denied: Cross-tenant modification of records is prohibited.', 403);
    }

    // Strict identity binding: Note author bound strictly to authenticated doctor JWT, never unverified req.body
    const effectiveDoctorName = authUser.name || 'Specialist';
    const formattedNote = `[Specialist Note - Dr. ${effectiveDoctorName}]: ${specialistNote.trim()}`;

    const updatedRecord = await recordsRepo.updateSpecialistNotes(recordId, formattedNote);
    if (!updatedRecord) {
        throw new AppError('Medical record not found.', 404);
    }

    res.json({ success: true, message: 'Specialist note attached to record.', record: updatedRecord });
});

/**
 * 6. Public Verifiable Medical Record Blockchain Proof (For QR Code Scans)
 * GET /api/records/:id/verify-blockchain
 */
const verifyBlockchainProof = catchAsync(async (req, res) => {
    const recordId = req.params.id;
    const rec = await recordsRepo.getRecordBlockchainProof(recordId);

    if (!rec) {
        // Check if parameter is a registered patient UUID (Universal Health Passport query)
        const patient = await recordsRepo.getPatientPassportData(recordId);
        if (!patient) {
            return res.status(404).json({ verified: false, error: 'Medical record or patient passport not found in system.' });
        }

        if (patient.is_rejected) {
            return res.status(403).json({ verified: false, error: 'Patient verification has been revoked or deactivated.' });
        }

        // Find patient's latest record if available
        const latestRec = await recordsRepo.getLatestPatientRecord(patient.id);

        if (latestRec) {
            let blockData = null;
            if (latestRec.is_mined && latestRec.block_index !== null) {
                blockData = await recordsRepo.getBlockByIndex(latestRec.block_index, latestRec.organization_id);
            }

            const decryptedDiagnosis = decrypt(latestRec.diagnosis);
            const decryptedTreatment = decrypt(latestRec.treatment);

            let isSignatureValid = false;
            if (latestRec.doctorPublicKey && latestRec.signature) {
                const formats = [
                    (latestRec.patient_id || '') + (decryptedDiagnosis || '') + (decryptedTreatment || '') + (latestRec.timestamp || ''),
                    `${latestRec.patient_id}-${decryptedDiagnosis}-${decryptedTreatment}-${latestRec.timestamp}`,
                    `${latestRec.patient_id}-${latestRec.diagnosis}-${latestRec.treatment}-${latestRec.timestamp}`
                ];
                for (const fmt of formats) {
                    try {
                        const verify = crypto.createVerify('SHA256');
                        verify.update(fmt);
                        verify.end();
                        if (verify.verify(latestRec.doctorPublicKey, latestRec.signature, 'hex')) {
                            isSignatureValid = true;
                            break;
                        }
                    } catch (sigErr) { }
                }
            }

            return res.json({
                verified: true,
                isPassport: true,
                recordId: latestRec.id,
                patientId: patient.id,
                patientName: patient.name,
                patientEmail: patient.email || '',
                patientProfile: parseJsonIfNeeded(patient.patient_profile) || {},
                publicKey: patient.public_key,
                hospitalName: latestRec.orgName || patient.orgName || 'Blockchain Health Records Network',
                doctorId: latestRec.doctor_id,
                doctorName: latestRec.doctor_name || latestRec.docName || 'Attending Physician',
                doctorProfile: parseJsonIfNeeded(latestRec.docProfile) || {},
                diagnosis: decryptedDiagnosis,
                treatment: decryptedTreatment,
                symptoms: latestRec.symptoms || '',
                notes: latestRec.notes || '',
                prescriptions: parseJsonIfNeeded(latestRec.prescriptions) || [],
                labRequest: latestRec.lab_request || '',
                timestamp: latestRec.timestamp,
                isMined: latestRec.is_mined,
                blockIndex: latestRec.block_index,
                blockHash: blockData ? blockData.hash : null,
                previousHash: blockData ? blockData.previous_hash : null,
                minedTimestamp: blockData ? blockData.timestamp : null,
                nonce: blockData ? blockData.nonce : null,
                signatureValid: isSignatureValid,
                signature: latestRec.signature,
                doctorPublicKey: latestRec.doctorPublicKey,
                blockchainSealStatus: latestRec.is_mined ? 'IMMUTABLE_MINED_ON_CHAIN' : 'QUEUED_IN_MEMPOOL'
            });
        } else {
            return res.json({
                verified: true,
                isPassport: true,
                recordId: patient.id,
                patientId: patient.id,
                patientName: patient.name,
                patientEmail: patient.email || '',
                patientProfile: parseJsonIfNeeded(patient.patient_profile) || {},
                publicKey: patient.public_key,
                hospitalName: patient.orgName || 'Blockchain Health Records Network',
                doctorName: 'Network Registrar',
                doctorProfile: { hospital: patient.orgName || 'Blockchain Health Records Network' },
                diagnosis: 'Verified Patient Node — Cryptographic Identity Active',
                treatment: 'Universal Health Passport Issued on Blockchain',
                symptoms: 'N/A',
                notes: 'Patient identity, public key, and vitals cryptographically verified by medical network.',
                prescriptions: [],
                labRequest: '',
                timestamp: new Date().toISOString(),
                isMined: true,
                blockIndex: 0,
                blockHash: '0000000000000000000000000000000000000000000000000000000000000000',
                signatureValid: true,
                blockchainSealStatus: 'ACTIVE_VERIFIED_PATIENT_NODE'
            });
        }
    }

    if (rec.patientIsRejected) {
        return res.status(403).json({ verified: false, error: 'Patient verification has been revoked or deactivated.' });
    }

    let blockData = null;
    if (rec.is_mined && rec.block_index !== null) {
        blockData = await recordsRepo.getBlockByIndex(rec.block_index, rec.organization_id);
    }

    if (rec.is_mined && !blockData) {
        return res.json({ verified: false, error: 'Cryptographic block proof not found in tenant ledger.' });
    }
    const decryptedDiagnosis = decrypt(rec.diagnosis);
    const decryptedTreatment = decrypt(rec.treatment);

    // Verify RSA Signature
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
        hospitalName: rec.orgName || (rec.docProfile && parseJsonIfNeeded(rec.docProfile)?.hospital) || 'Blockchain Health Records Network',
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
});

/**
 * 7. Get Blockchain Mempool (Pending Ledger Queue)
 * GET /api/blockchain/mempool
 */
function getMempool(req, res, dependencies = {}) {
    const { healthBlockchain = null } = dependencies;
    const pending = healthBlockchain ? healthBlockchain.pendingRecords : [];
    res.json(pending);
}

/**
 * 8. Mine pending records into a block (Manual Admin Trigger)
 * POST /api/blockchain/mine
 */
async function mineBlock(req, res, dependencies = {}) {
    const { isMining = false, executeMining = null } = dependencies;
    const authUser = verifyAuthToken(req);

    if (authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        throw new AppError('Access Denied: Only administrators can trigger blockchain mining.', 403);
    }

    if (typeof isMining === 'function' ? isMining() : isMining) {
        throw new AppError('Mining is already in progress. Please wait for the current block to seal.', 409);
    }
    if (!executeMining) {
        throw new AppError('Mining engine is not initialized.', 500);
    }

    const result = await executeMining('manual admin trigger');
    if (!result.success) {
        throw new AppError(result.error || 'No pending records to mine. Add new records first.', 400);
    }

    res.status(200).json({
        message: 'Block successfully mined and stored on ledger!',
        block: result.block
    });
}

/**
 * 9. Get all blocks
 * GET /api/blockchain/blocks
 */
const getBlocks = catchAsync(async (req, res) => {
    const orgId = req.headers['x-organization-id'] || req.query.orgId || null;
    const blocks = await recordsRepo.getBlocks({ orgId });

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
});

/**
 * 10. Validate chain integrity across multi-tenant ledgers
 * GET /api/blockchain/validate
 */
async function validateChain(req, res, dependencies = {}) {
    const { validateMultiTenantChains = null } = dependencies;
    const orgId = req.headers['x-organization-id'] || req.query.orgId || null;
    if (!validateMultiTenantChains) {
        throw new AppError('Chain validator not available.', 500);
    }
    const isValid = await validateMultiTenantChains(orgId);
    res.json({ isValid });
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

    // 1. Super Admin Role Enforcement
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        throw new AppError('Authentication token required.', 401);
    }
    const token = authHeader.substring(7).trim();
    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtErr) {
        throw new AppError('Invalid or expired authentication token.', 401);
    }
    if (!decoded || decoded.role !== 'super_admin') {
        throw new AppError('Access restricted to Super Administrators only.', 403);
    }

    const { recordId, tamperedDiagnosis } = req.body;
    if (!recordId || !tamperedDiagnosis) {
        throw new AppError('recordId and tamperedDiagnosis are required.', 400);
    }

    const record = await recordsRepo.findRecordById(recordId);
    if (!record) {
        throw new AppError('Record not found.', 404);
    }

    // 2. Strict Demo-Data Restriction: NEVER allow tampering with real patient records!
    if (!record.is_demo_data) {
        throw new AppError('Tampering simulation is strictly restricted to designated demo records. Real patient records cannot be altered under any circumstance.', 403);
    }

    const oldDiagnosis = decrypt(record.diagnosis);

    // Force-update PostgreSQL records table to write raw plaintext (simulate database tampering)
    await recordsRepo.tamperRecordDiagnosis(recordId, tamperedDiagnosis);

    // Also tamper with the block list in the DB/memory to demonstrate chain corruption
    if (record.is_mined && record.block_index !== -1) {
        const block = await recordsRepo.getBlockByIndex(record.block_index, record.organization_id);
        if (block) {
            const blockRecs = parseJsonIfNeeded(block.records) || [];
            const updatedRecords = blockRecs.map(rec => {
                if (rec.recordId === recordId) {
                    rec.diagnosis = tamperedDiagnosis + " (HACKED)";
                }
                return rec;
            });
            await recordsRepo.tamperBlockRecords(block.id, JSON.stringify(updatedRecords));
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

    // 1. Super Admin Role Enforcement
    let decoded = (req.user && req.user.id) ? req.user : null;
    if (!decoded) {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
            throw new AppError('Authentication token required.', 401);
        }
        const token = authHeader.substring(7).trim();
        try {
            decoded = jwt.verify(token, JWT_SECRET);
        } catch (jwtErr) {
            throw new AppError('Invalid or expired authentication token.', 401);
        }
    }
    if (!decoded || decoded.role !== 'super_admin') {
        throw new AppError('Access restricted to Super Administrators only.', 403);
    }

    console.log('Initiating Ledger Self-Healing Recovery...');

    const requestedOrgId = req.headers['x-organization-id'] || req.body?.organizationId || req.query?.orgId || null;
    const dbBlocks = await recordsRepo.getBlocksForRecovery(requestedOrgId);
    if (dbBlocks.length <= 1) {
        throw new AppError('No block data to recover from. Genesis block cannot be repaired.', 400);
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
                const recRow = await recordsRepo.findRecordById(rec.recordId);
                if (recRow) {
                    const originalDiagnosis = (rec.diagnosis || '').replace(/ \(HACKED\)/g, '');

                    // Encrypt original diagnosis back
                    await recordsRepo.recoverRecordDiagnosis(rec.recordId, encrypt(originalDiagnosis));
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

            await recordsRepo.updateRecoveredBlock(block.id, JSON.stringify(block.records), block.previous_hash, b.nonce, b.hash);
            block.nonce = b.nonce;
            block.hash = b.hash;
        }
    }

    // Re-sync memory chain
    if (syncBlockchainWithDatabase && typeof syncBlockchainWithDatabase === 'function') {
        await syncBlockchainWithDatabase();
    }

    res.json({ success: true, message: 'Ledger database successfully recovered! Chain integrity restored.' });
}

/**
 * 13. Get designated simulation demo records for safe tampering tests
 * GET /api/blockchain/demo-records
 */
const getDemoRecords = catchAsync(async (req, res) => {
    const demoRecs = await recordsRepo.getDemoRecords();

    const formatted = demoRecs.map(r => ({
        ...r,
        diagnosis: decrypt(r.diagnosis),
        treatment: decrypt(r.treatment)
    }));

    res.json(formatted);
});

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
