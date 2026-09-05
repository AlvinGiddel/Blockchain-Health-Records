const db = require('../db');
const crypto = require('crypto');
const { encrypt } = require('../utils/helpers');

async function seed() {
  const patientId = 'dbf48abb-d0b8-4ace-9b4a-649bf191bbfb';
  const doctorId = 'd97e5dc3-8ee3-4683-85e6-1623ac70c7ab';
  const orgId = '94ec940f-5231-4af4-919f-58ca3d3c873b'; // Penda Health
  
  const { rows: docs } = await db.query('SELECT name, public_key, private_key FROM users WHERE id = $1', [doctorId]);
  const doc = docs[0];

  const diagnosis = 'Acute Pharyngitis & Seasonal Allergies';
  const treatment = 'Amoxicillin 500mg TDS x 7 days; Cetirizine 10mg OD x 5 days';
  const timestamp = new Date().toISOString();
  
  const payload = patientId + diagnosis + treatment + timestamp;
  const signer = crypto.createSign('SHA256');
  signer.update(payload);
  signer.end();
  const signature = signer.sign(doc.private_key, 'hex');

  const txHash = crypto.createHash('sha256').update(signature + timestamp).digest('hex');

  const insertRes = await db.query(
    `INSERT INTO records (
      patient_id, doctor_id, doctor_name, diagnosis, treatment, prescriptions, record_type,
      symptoms, notes, consultation_hash, transaction_hash, signature, doctor_public_key,
      is_mined, block_index, timestamp, organization_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING id`,
    [
      patientId, doctorId, doc.name, encrypt(diagnosis), encrypt(treatment),
      JSON.stringify(['Amoxicillin 500mg', 'Cetirizine 10mg']), 'consultation',
      'Sore throat, mild fever, sneezing', 'Follow up in 7 days if symptoms persist',
      txHash, txHash, signature, doc.public_key, true, 1, timestamp, orgId
    ]
  );

  console.log('Record inserted with ID:', insertRes.rows[0].id);

  // Ensure Block #1 exists for Penda Health with this record
  const { rows: existingBlocks } = await db.query(
    'SELECT * FROM blocks WHERE organization_id = $1 AND index = 1',
    [orgId]
  );

  if (existingBlocks.length === 0) {
    const prevHashRes = await db.query('SELECT hash FROM blocks WHERE organization_id = $1 AND index = 0', [orgId]);
    const prevHash = prevHashRes.rows[0]?.hash || '0000000000000000000000000000000000000000000000000000000000000000';
    const blockHash = '00' + crypto.randomBytes(31).toString('hex');

    await db.query(
      `INSERT INTO blocks (index, timestamp, records, previous_hash, nonce, hash, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        1,
        timestamp,
        JSON.stringify([{
          id: insertRes.rows[0].id,
          patientId,
          doctorId,
          doctorName: doc.name,
          diagnosis,
          treatment,
          timestamp,
          signature,
          organizationId: orgId
        }]),
        prevHash,
        48291,
        blockHash,
        orgId
      ]
    );
    console.log('Block #1 created for Penda Health with hash:', blockHash);
  }

  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
