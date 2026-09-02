const crypto = require('crypto');
const db = require('../db');
const { verifyKmpdcLicense } = require('./kmpdcVerification');
const { verifyNckLicense } = require('./nckVerification');

/**
 * Unified Practitioner Attestation Service
 * 
 * Oracles credentials from statutory Kenyan regulators:
 * - KMPDC (Kenya Medical Practitioners and Dentists Council) for Doctors & Dentists
 * - NCK (Nursing Council of Kenya) for Nurses & Midwives
 */

/**
 * Verify practitioner credentials against their statutory regulator
 * 
 * @param {object} params
 * @param {string} params.cadre - 'doctor' | 'dentist' | 'nurse' | 'midwife'
 * @param {string} params.licenseNumber - License or registration number
 * @param {string} params.practitionerName - Full name of the applicant
 */
async function verifyPractitioner({ cadre = 'doctor', licenseNumber, practitionerName }) {
    const cleanCadre = (cadre || 'doctor').toLowerCase().trim();

    if (cleanCadre === 'doctor' || cleanCadre === 'dentist') {
        const result = await verifyKmpdcLicense(licenseNumber, practitionerName);
        return {
            ...result,
            regulator: 'KMPDC',
            cadre: cleanCadre
        };
    } else if (cleanCadre === 'nurse' || cleanCadre === 'midwife') {
        const result = await verifyNckLicense(licenseNumber, practitionerName, cleanCadre);
        return {
            ...result,
            regulator: 'NCK',
            cadre: cleanCadre
        };
    } else {
        return {
            verified: false,
            error: `Unsupported practitioner cadre '${cadre}'. Expected 'doctor', 'dentist', 'nurse', or 'midwife'.`
        };
    }
}

/**
 * Creates an on-chain / ledger attestation record for a verified practitioner
 */
async function recordPractitionerAttestation({
    practitionerId,
    regulator,
    cadre,
    licenseNumber,
    practitionerPublicKey,
    expiryDate = null
}) {
    const cleanLicense = licenseNumber.trim().toUpperCase();
    const licenseHash = crypto.createHash('sha256').update(`${regulator}:${cleanLicense}`).digest('hex');
    
    // Attestation fingerprint
    const attestationPayload = `${regulator}:${cadre}:${licenseHash}:${practitionerId}:${Date.now()}`;
    const attestationHash = crypto.createHash('sha256').update(attestationPayload).digest('hex');

    const { rows } = await db.pool.query(`
        INSERT INTO practitioner_attestations (
            practitioner_id,
            regulator,
            cadre,
            license_number,
            license_hash,
            practitioner_public_key,
            verified_at,
            expiry_date,
            attestation_hash,
            is_valid
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, true)
        RETURNING *;
    `, [
        practitionerId,
        regulator,
        cadre,
        cleanLicense,
        licenseHash,
        practitionerPublicKey,
        expiryDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Default 1 year validity
        attestationHash
    ]);

    return rows[0];
}

module.exports = {
    verifyPractitioner,
    recordPractitionerAttestation
};
