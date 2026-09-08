/**
 * Medical Records & Blockchain Domain Data Repository
 *
 * Encapsulates all PostgreSQL data access for electronic health records,
 * cryptographic verification proofs, specialist clinical notes,
 * multi-tenant blockchain blocks, and demo simulation safeguards.
 * Supports multi-step transactions via the optional `client` parameter.
 */

const db = require('../db');

/**
 * Fetch both doctor and patient user records by ID
 * @param {string} doctorId
 * @param {string} patientId
 * @param {object} [client]
 * @returns {Promise<{ doctor: object|null, patient: object|null }>}
 */
async function findDoctorAndPatient(doctorId, patientId, client = null) {
    const runner = client || db;
    const [doctorsRes, patientsRes] = await Promise.all([
        runner.query('SELECT * FROM users WHERE id = $1', [doctorId]),
        runner.query('SELECT * FROM users WHERE id = $1', [patientId])
    ]);
    return {
        doctor: doctorsRes.rows[0] || null,
        patient: patientsRes.rows[0] || null
    };
}

/**
 * Check if treating relationship exists, active patient consent grant exists, or active emergency break-glass override (< 1 hour)
 * @param {string} doctorId
 * @param {string} patientId
 * @param {object} [client]
 * @returns {Promise<boolean>}
 */
async function checkTreatingRelationship(doctorId, patientId, client = null) {
    const runner = client || db;
    const [apptRes, breakGlassRes, consentRes] = await Promise.all([
        runner.query(
            "SELECT 1 FROM appointments WHERE patient_id = $1 AND doctor_id = $2 AND status IN ('Confirmed', 'Completed') LIMIT 1",
            [patientId, doctorId]
        ),
        runner.query(
            "SELECT 1 FROM audit_logs WHERE event_type IN ('emergency_break_glass', 'break_glass') AND patient_id = $1 AND doctor_id = $2 AND timestamp >= NOW() - INTERVAL '1 hour' LIMIT 1",
            [patientId, doctorId]
        ),
        runner.query(
            `SELECT 1 FROM patient_consents 
             WHERE patient_id = $1 
               AND (doctor_id = $2 OR organization_id IN (SELECT organization_id FROM users WHERE id = $2 AND organization_id IS NOT NULL))
               AND status = 'active' 
               AND (expires_at IS NULL OR expires_at > NOW()) 
             LIMIT 1`,
            [patientId, doctorId]
        )
    ]);
    return apptRes.rows.length > 0 || breakGlassRes.rows.length > 0 || consentRes.rows.length > 0;
}

/**
 * Create a new medical record
 * @param {object} recordData
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function createMedicalRecord({
    organizationId,
    patientId,
    doctorId,
    doctorName,
    diagnosis,
    treatment,
    prescriptions,
    ipfsHash,
    signature,
    doctorPublicKey,
    timestamp,
    transactionHash
}, client = null) {
    const runner = client || db;
    let formattedPrescriptions = null;
    if (prescriptions !== undefined && prescriptions !== null) {
        if (typeof prescriptions === 'string') {
            try {
                JSON.parse(prescriptions);
                formattedPrescriptions = prescriptions;
            } catch {
                formattedPrescriptions = JSON.stringify(prescriptions);
            }
        } else {
            formattedPrescriptions = JSON.stringify(prescriptions);
        }
    }

    const { rows } = await runner.query(
        `INSERT INTO records (organization_id, patient_id, doctor_id, doctor_name, diagnosis, treatment, prescriptions, ipfs_hash, signature, doctor_public_key, timestamp, transaction_hash) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
         RETURNING *;`,
        [
            organizationId,
            patientId,
            doctorId,
            doctorName,
            diagnosis,
            treatment,
            formattedPrescriptions,
            ipfsHash,
            signature,
            doctorPublicKey,
            timestamp,
            transactionHash
        ]
    );
    return rows[0];
}

/**
 * Create immutable audit log entry
 * @param {object} logData
 * @param {object} [client]
 * @returns {Promise<object>}
 */
async function createAuditLog({
    organizationId = null,
    eventType,
    patientId = null,
    patientName = null,
    doctorId = null,
    doctorName = null,
    details,
    timestamp = null
}, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW())) 
         RETURNING *;`,
        [organizationId, eventType, patientId, patientName, doctorId, doctorName, details, timestamp]
    );
    return rows[0];
}

/**
 * Fetch records for a patient
 * @param {object} params
 * @param {string} params.patientId
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function findRecordsByPatient({ patientId }, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
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
    return rows;
}

/**
 * Fetch all records for Admin / Super Admin with organization scoping
 * @param {object} params
 * @param {string} [params.targetOrgId]
 * @param {boolean} [params.isSuperAdmin]
 * @param {string} [params.recordType]
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getAllRecordsAdmin({ targetOrgId, isSuperAdmin, recordType }, client = null) {
    const runner = client || db;
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
    const conditions = [];
    const params = [];

    if (targetOrgId) {
        params.push(targetOrgId);
        conditions.push(`r.organization_id = $${params.length}`);
    } else if (!isSuperAdmin) {
        return [];
    }

    if (recordType) {
        params.push(recordType);
        conditions.push(`r.record_type = $${params.length}`);
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY r.timestamp DESC';

    const { rows } = await runner.query(query, params);
    return rows;
}

/**
 * Find record by ID
 * @param {string} id
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findRecordById(id, client = null) {
    const runner = client || db;
    const { rows } = await runner.query('SELECT * FROM records WHERE id = $1', [id]);
    return rows[0] || null;
}

/**
 * Find record by transaction hash, consultation hash, ipfs hash, or text search
 * @param {string} cleanId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findRecordByHashes(cleanId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        'SELECT * FROM records WHERE transaction_hash = $1 OR consultation_hash = $1 OR ipfs_hash = $1 OR id::text LIKE $2',
        [cleanId, `%${cleanId}%`]
    );
    return rows[0] || null;
}

/**
 * Update specialist notes on a medical record
 * @param {string} id
 * @param {string} formattedNote
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function updateSpecialistNotes(id, formattedNote, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `UPDATE records SET notes = CASE WHEN notes IS NULL OR notes = '' THEN $1 ELSE notes || '\n' || $1 END WHERE id = $2 RETURNING *`,
        [formattedNote, id]
    );
    return rows[0] || null;
}

/**
 * Get record data for public blockchain proof verification
 * @param {string} recordId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function getRecordBlockchainProof(recordId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `SELECT r.*, 
                p.name as "patientName", p.email as "patientEmail", p.patient_profile as "patientProfile", p.is_rejected as "patientIsRejected",
                d.name as "docName", d.email as "docEmail", d.doctor_profile as "docProfile", d.public_key as "doctorPublicKey",
                o.name as "orgName"
         FROM records r 
         LEFT JOIN users p ON r.patient_id = p.id 
         LEFT JOIN users d ON r.doctor_id = d.id 
         LEFT JOIN organizations o ON r.organization_id = o.id
         WHERE r.id = $1`,
        [recordId]
    );
    return rows[0] || null;
}

/**
 * Get patient passport node data for QR verification
 * @param {string} patientId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function getPatientPassportData(patientId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `SELECT u.id, u.name, u.email, u.role, u.public_key, u.patient_profile, u.is_approved, u.is_rejected, u.organization_id, o.name as "orgName"
         FROM users u
         LEFT JOIN organizations o ON u.organization_id = o.id
         WHERE u.id = $1 AND u.role = 'patient'`,
        [patientId]
    );
    return rows[0] || null;
}

/**
 * Get latest record for a patient
 * @param {string} patientId
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function getLatestPatientRecord(patientId, client = null) {
    const runner = client || db;
    const { rows } = await runner.query(
        `SELECT r.*, d.name as "docName", d.email as "docEmail", d.doctor_profile as "docProfile", d.public_key as "doctorPublicKey", o.name as "orgName"
         FROM records r
         LEFT JOIN users d ON r.doctor_id = d.id
         LEFT JOIN organizations o ON r.organization_id = o.id
         WHERE r.patient_id = $1
         ORDER BY r.timestamp DESC
         LIMIT 1`,
        [patientId]
    );
    return rows[0] || null;
}

/**
 * Get block by index and optional organization
 * @param {number} index
 * @param {string} [orgId]
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function getBlockByIndex(index, orgId = null, client = null) {
    const runner = client || db;
    let query = 'SELECT * FROM blocks WHERE index = $1';
    const params = [index];
    if (orgId) {
        query += ' AND (organization_id = $2 OR organization_id IS NULL)';
        params.push(orgId);
    }
    const { rows } = await runner.query(query, params);
    return rows[0] || null;
}

/**
 * Get blocks list optionally scoped to an organization
 * @param {object} params
 * @param {string} [params.orgId]
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getBlocks({ orgId = null }, client = null) {
    const runner = client || db;
    let query = 'SELECT b.id, b.organization_id as "organizationId", o.name as "organizationName", b.index, b.timestamp, b.records, b.previous_hash as "previousHash", b.nonce, b.hash FROM blocks b LEFT JOIN organizations o ON b.organization_id = o.id ';
    const params = [];
    if (orgId) {
        query += 'WHERE b.organization_id = $1 ';
        params.push(orgId);
    }
    query += 'ORDER BY b.organization_id, b.index ASC';

    const { rows } = await runner.query(query, params);
    return rows;
}

/**
 * Get all blocks ordered by index
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getAllBlocksOrdered(client = null) {
    const runner = client || db;
    const { rows } = await runner.query('SELECT * FROM blocks ORDER BY index ASC');
    return rows;
}

/**
 * Tamper record diagnosis directly in DB (simulation restricted to is_demo_data = true)
 * @param {string} recordId
 * @param {string} tamperedDiagnosis
 * @param {object} [client]
 */
async function tamperRecordDiagnosis(recordId, tamperedDiagnosis, client = null) {
    const runner = client || db;
    await runner.query('UPDATE records SET diagnosis = $1 WHERE id = $2', [tamperedDiagnosis, recordId]);
}

/**
 * Update block records field for tampering simulation
 * @param {string} blockId
 * @param {string} recordsJson
 * @param {object} [client]
 */
async function tamperBlockRecords(blockId, recordsJson, client = null) {
    const runner = client || db;
    await runner.query('UPDATE blocks SET records = $1 WHERE id = $2', [recordsJson, blockId]);
}

/**
 * Recover record diagnosis back to original ciphertext
 * @param {string} recordId
 * @param {string} encryptedDiagnosis
 * @param {object} [client]
 */
async function recoverRecordDiagnosis(recordId, encryptedDiagnosis, client = null) {
    const runner = client || db;
    await runner.query('UPDATE records SET diagnosis = $1 WHERE id = $2', [encryptedDiagnosis, recordId]);
}

/**
 * Update recovered block
 * @param {string} blockId
 * @param {string} recordsJson
 * @param {string} previousHash
 * @param {string} nonce
 * @param {string} hash
 * @param {object} [client]
 */
async function updateRecoveredBlock(blockId, recordsJson, previousHash, nonce, hash, client = null) {
    const runner = client || db;
    await runner.query(
        'UPDATE blocks SET records = $1, previous_hash = $2, nonce = $3, hash = $4 WHERE id = $5',
        [recordsJson, previousHash, nonce, hash, blockId]
    );
}

/**
 * Get all blocks for recovery
 * @param {string} [orgId]
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getBlocksForRecovery(orgId = null, client = null) {
    const runner = client || db;
    let query = 'SELECT * FROM blocks';
    const params = [];
    if (orgId) {
        query += ' WHERE organization_id = $1';
        params.push(orgId);
    }
    query += ' ORDER BY organization_id, index ASC';
    const { rows } = await runner.query(query, params);
    return rows;
}

/**
 * Get simulation demo records
 * @param {object} [client]
 * @returns {Promise<Array>}
 */
async function getDemoRecords(client = null) {
    const runner = client || db;
    const { rows } = await runner.query(`
        SELECT r.id, r.patient_id, r.diagnosis, r.treatment, r.is_mined, r.block_index, r.timestamp, r.is_demo_data,
               u.name as "patientName"
        FROM records r
        LEFT JOIN users u ON r.patient_id = u.id
        WHERE r.is_demo_data = true
        ORDER BY r.timestamp DESC
    `);
    return rows;
}

/**
 * Find user by ID
 * @param {string} id
 * @param {object} [client]
 * @returns {Promise<object|null>}
 */
async function findUserById(id, client = null) {
    const runner = client || db;
    const { rows } = await runner.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0] || null;
}

module.exports = {
    findDoctorAndPatient,
    checkTreatingRelationship,
    createMedicalRecord,
    createAuditLog,
    findRecordsByPatient,
    getAllRecordsAdmin,
    findRecordById,
    findRecordByHashes,
    updateSpecialistNotes,
    getRecordBlockchainProof,
    getPatientPassportData,
    getLatestPatientRecord,
    getBlockByIndex,
    getBlocks,
    getAllBlocksOrdered,
    tamperRecordDiagnosis,
    tamperBlockRecords,
    recoverRecordDiagnosis,
    updateRecoveredBlock,
    getBlocksForRecovery,
    getDemoRecords,
    findUserById
};
