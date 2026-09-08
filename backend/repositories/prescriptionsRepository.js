/**
 * Prescriptions Repository
 * 
 * Handles database operations for Prescriptions, Prescription Items,
 * and Dispense Logs with strict multi-tenancy and audit compliance.
 */

const db = require('../db');
const AppError = require('../utils/AppError');

/**
 * Helper to fetch items and dispense logs for a prescription
 */
async function attachDetailsToPrescriptions(prescriptionsList) {
    if (!prescriptionsList || prescriptionsList.length === 0) return [];
    const prescriptionIds = prescriptionsList.map(p => p.id);

    // Fetch items
    const { rows: items } = await db.query(`
        SELECT id, prescription_id, rxnorm_code, medication_name, dosage, 
               frequency, duration, quantity_prescribed, quantity_dispensed, created_at
        FROM prescription_items
        WHERE prescription_id = ANY($1::uuid[])
        ORDER BY created_at ASC;
    `, [prescriptionIds]);

    // Fetch dispense logs
    const { rows: logs } = await db.query(`
        SELECT dl.id, dl.prescription_id, dl.pharmacy_org_id, dl.pharmacist_id,
               dl.quantity_dispensed, dl.notes, dl.created_at,
               u.name as pharmacist_name, o.name as pharmacy_name
        FROM dispense_logs dl
        LEFT JOIN users u ON dl.pharmacist_id = u.id
        LEFT JOIN organizations o ON dl.pharmacy_org_id = o.id
        WHERE dl.prescription_id = ANY($1::uuid[])
        ORDER BY dl.created_at DESC;
    `, [prescriptionIds]);

    const itemMap = new Map();
    for (const item of items) {
        if (!itemMap.has(item.prescription_id)) itemMap.set(item.prescription_id, []);
        itemMap.get(item.prescription_id).push(item);
    }

    const logMap = new Map();
    for (const log of logs) {
        if (!logMap.has(log.prescription_id)) logMap.set(log.prescription_id, []);
        logMap.get(log.prescription_id).push(log);
    }

    return prescriptionsList.map(p => ({
        ...p,
        items: itemMap.get(p.id) || [],
        dispenseLogs: logMap.get(p.id) || []
    }));
}

/**
 * Create a new Prescription with medication items in an atomic transaction
 */
async function createPrescription({ patientId, doctorId, organizationId, instructions, expiresAt, qrToken, items }) {
    if (!items || !Array.isArray(items) || items.length === 0) {
        throw new AppError('At least one medication item is required.', 400);
    }

    const { rows: rxRows } = await db.query(`
        INSERT INTO prescriptions (
            patient_id, doctor_id, organization_id, status, qr_token, instructions, expires_at
        ) VALUES (
            $1, $2, $3, 'ISSUED', $4, $5, COALESCE($6, NOW() + INTERVAL '30 days')
        )
        RETURNING *;
    `, [patientId, doctorId, organizationId, qrToken, instructions || '', expiresAt || null]);

    const prescription = rxRows[0];
    const insertedItems = [];

    for (const item of items) {
        if (!item.medicationName || !item.dosage || !item.quantityPrescribed) {
            throw new AppError('Each item must have a medicationName, dosage, and quantityPrescribed.', 400);
        }

        const qty = parseInt(item.quantityPrescribed, 10);
        if (isNaN(qty) || qty <= 0) {
            throw new AppError(`Invalid prescribed quantity for ${item.medicationName}. Must be a positive number.`, 400);
        }

        const { rows: itemRows } = await db.query(`
            INSERT INTO prescription_items (
                prescription_id, rxnorm_code, medication_name, dosage, frequency, duration, quantity_prescribed, quantity_dispensed
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, 0
            )
            RETURNING *;
        `, [
            prescription.id,
            item.rxnormCode || null,
            item.medicationName.trim(),
            item.dosage.trim(),
            (item.frequency || 'Once daily').trim(),
            (item.duration || '7 days').trim(),
            qty
        ]);

        insertedItems.push(itemRows[0]);
    }

    return {
        ...prescription,
        items: insertedItems,
        dispenseLogs: []
    };
}

/**
 * Get prescriptions scoped to an organization (Doctor / Clinic Admin)
 */
async function getPrescriptionsByOrganization(organizationId, { status = null, search = '' } = {}) {
    let query = `
        SELECT p.*, 
               pat.name as patient_name, pat.email as patient_email, pat.patient_profile,
               doc.name as doctor_name, doc.doctor_profile,
               org.name as organization_name
        FROM prescriptions p
        JOIN users pat ON p.patient_id = pat.id
        JOIN users doc ON p.doctor_id = doc.id
        JOIN organizations org ON p.organization_id = org.id
        WHERE p.organization_id = $1
    `;
    const params = [organizationId];

    if (status) {
        params.push(status);
        query += ` AND p.status = $${params.length}`;
    }

    if (search && search.trim()) {
        params.push(`%${search.trim().toLowerCase()}%`);
        query += ` AND (LOWER(pat.name) LIKE $${params.length} OR LOWER(p.qr_token) LIKE $${params.length})`;
    }

    query += ` ORDER BY p.created_at DESC;`;

    const { rows } = await db.query(query, params);
    return attachDetailsToPrescriptions(rows);
}

/**
 * Get prescriptions for a specific patient
 */
async function getPrescriptionsByPatient(patientId) {
    const query = `
        SELECT p.*, 
               pat.name as patient_name, pat.email as patient_email,
               doc.name as doctor_name, doc.doctor_profile,
               org.name as organization_name
        FROM prescriptions p
        JOIN users pat ON p.patient_id = pat.id
        JOIN users doc ON p.doctor_id = doc.id
        JOIN organizations org ON p.organization_id = org.id
        WHERE p.patient_id = $1
        ORDER BY p.created_at DESC;
    `;
    const { rows } = await db.query(query, [patientId]);
    return attachDetailsToPrescriptions(rows);
}

/**
 * Get prescriptions issued by a specific doctor
 */
async function getPrescriptionsByDoctor(doctorId) {
    const query = `
        SELECT p.*, 
               pat.name as patient_name, pat.email as patient_email, pat.patient_profile,
               doc.name as doctor_name, doc.doctor_profile,
               org.name as organization_name
        FROM prescriptions p
        JOIN users pat ON p.patient_id = pat.id
        JOIN users doc ON p.doctor_id = doc.id
        JOIN organizations org ON p.organization_id = org.id
        WHERE p.doctor_id = $1
        ORDER BY p.created_at DESC;
    `;
    const { rows } = await db.query(query, [doctorId]);
    return attachDetailsToPrescriptions(rows);
}

/**
 * Get prescription by ID
 */
async function getPrescriptionById(id) {
    const query = `
        SELECT p.*, 
               pat.name as patient_name, pat.email as patient_email, pat.patient_profile,
               doc.name as doctor_name, doc.doctor_profile,
               org.name as organization_name
        FROM prescriptions p
        JOIN users pat ON p.patient_id = pat.id
        JOIN users doc ON p.doctor_id = doc.id
        JOIN organizations org ON p.organization_id = org.id
        WHERE p.id = $1;
    `;
    const { rows } = await db.query(query, [id]);
    if (rows.length === 0) return null;
    const attached = await attachDetailsToPrescriptions(rows);
    return attached[0];
}

/**
 * Get prescription by public QR Token
 */
async function getPrescriptionByQrToken(qrToken) {
    const query = `
        SELECT p.*, 
               pat.name as patient_name, pat.patient_profile,
               doc.name as doctor_name, doc.doctor_profile,
               org.name as organization_name
        FROM prescriptions p
        JOIN users pat ON p.patient_id = pat.id
        JOIN users doc ON p.doctor_id = doc.id
        JOIN organizations org ON p.organization_id = org.id
        WHERE p.qr_token = $1;
    `;
    const { rows } = await db.query(query, [qrToken]);
    if (rows.length === 0) return null;
    const attached = await attachDetailsToPrescriptions(rows);
    return attached[0];
}

/**
 * Dispense medication items with strict quota validations and audit logging
 */
async function dispenseItems({ prescriptionId, pharmacyOrgId, pharmacistId, itemDispenses, notes }) {
    // 1. Fetch prescription
    const prescription = await getPrescriptionById(prescriptionId);
    if (!prescription) {
        throw new AppError('Prescription not found.', 404);
    }

    if (prescription.status === 'CANCELLED') {
        throw new AppError('Cannot dispense: Prescription has been cancelled.', 400);
    }
    if (prescription.status === 'FILLED') {
        throw new AppError('Cannot dispense: Prescription is already fully filled.', 400);
    }

    // Check expiration
    if (new Date(prescription.expires_at) < new Date()) {
        await db.query(`UPDATE prescriptions SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`, [prescriptionId]);
        throw new AppError('Cannot dispense: Prescription has expired.', 400);
    }

    if (!itemDispenses || !Array.isArray(itemDispenses) || itemDispenses.length === 0) {
        throw new AppError('Dispense items list cannot be empty.', 400);
    }

    let totalDispensedInThisBatch = 0;

    // 2. Validate and apply dispensations per item
    for (const disp of itemDispenses) {
        const item = prescription.items.find(i => i.id === disp.itemId);
        if (!item) {
            throw new AppError(`Item with ID ${disp.itemId} does not belong to this prescription.`, 400);
        }

        const qtyToDispense = parseInt(disp.quantityDispensed, 10);
        if (isNaN(qtyToDispense) || qtyToDispense <= 0) {
            continue; // Skip 0 or invalid amounts
        }

        const remaining = item.quantity_prescribed - item.quantity_dispensed;
        if (qtyToDispense > remaining) {
            throw new AppError(
                `Cannot dispense ${qtyToDispense} of ${item.medication_name}. Only ${remaining} remaining prescribed.`,
                400
            );
        }

        await db.query(`
            UPDATE prescription_items
            SET quantity_dispensed = quantity_dispensed + $1
            WHERE id = $2;
        `, [qtyToDispense, item.id]);

        totalDispensedInThisBatch += qtyToDispense;
    }

    if (totalDispensedInThisBatch === 0) {
        throw new AppError('No valid items were dispensed (quantity must be greater than 0).', 400);
    }

    // 3. Insert into dispense_logs
    await db.query(`
        INSERT INTO dispense_logs (
            prescription_id, pharmacy_org_id, pharmacist_id, quantity_dispensed, notes
        ) VALUES (
            $1, $2, $3, $4, $5
        );
    `, [prescriptionId, pharmacyOrgId || null, pharmacistId || null, totalDispensedInThisBatch, notes || null]);

    // 4. Re-evaluate overall status
    const { rows: updatedItems } = await db.query(`
        SELECT quantity_prescribed, quantity_dispensed
        FROM prescription_items
        WHERE prescription_id = $1;
    `, [prescriptionId]);

    const allFilled = updatedItems.every(i => i.quantity_dispensed >= i.quantity_prescribed);
    const anyDispensed = updatedItems.some(i => i.quantity_dispensed > 0);

    const newStatus = allFilled ? 'FILLED' : (anyDispensed ? 'PARTIALLY_FILLED' : 'ISSUED');

    await db.query(`
        UPDATE prescriptions
        SET status = $1, updated_at = NOW()
        WHERE id = $2;
    `, [newStatus, prescriptionId]);

    return getPrescriptionById(prescriptionId);
}

/**
 * Cancel an active prescription
 */
async function cancelPrescription(id, reason = '') {
    const rx = await getPrescriptionById(id);
    if (!rx) throw new AppError('Prescription not found.', 404);
    if (rx.status === 'FILLED') {
        throw new AppError('Cannot cancel a fully filled prescription.', 400);
    }

    const cancelNote = reason ? `\n[Cancelled: ${reason.trim()}]` : '\n[Prescription Cancelled by Prescriber]';

    const { rows } = await db.query(`
        UPDATE prescriptions
        SET status = 'CANCELLED',
            instructions = COALESCE(instructions, '') || $1,
            updated_at = NOW()
        WHERE id = $2
        RETURNING *;
    `, [cancelNote, id]);

    return rows[0];
}

/**
 * Fetch patient allergies from profile
 */
async function getPatientAllergies(patientId) {
    const { rows } = await db.query(`
        SELECT patient_profile
        FROM users
        WHERE id = $1 AND role = 'patient';
    `, [patientId]);

    if (rows.length === 0 || !rows[0].patient_profile) return [];
    const profile = rows[0].patient_profile;
    const allergies = profile.allergies;
    if (Array.isArray(allergies)) return allergies;
    if (typeof allergies === 'string') return allergies.split(',').map(s => s.trim()).filter(Boolean);
    return [];
}

module.exports = {
    createPrescription,
    getPrescriptionsByOrganization,
    getPrescriptionsByPatient,
    getPrescriptionsByDoctor,
    getPrescriptionById,
    getPrescriptionByQrToken,
    dispenseItems,
    cancelPrescription,
    getPatientAllergies
};
