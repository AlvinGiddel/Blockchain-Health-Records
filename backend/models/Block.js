const mongoose = require('mongoose');

const RecordSubSchema = new mongoose.Schema({
    recordId: String,
    patientId: String,
    patientName: String,
    doctorId: String,
    doctorName: String,
    diagnosis: String, // Plaintext inside block since we verified it
    treatment: String,
    prescriptions: [String],
    ipfsHash: String,
    signature: String,
    doctorPublicKey: String,
    timestamp: String,
    message: String, // Genesis block message
    doctor: String,   // Genesis block author
    txType: { type: String, default: 'medical' }, // 'medical' | 'consent'
    action: String, // 'grant' | 'revoke'
    patientPublicKey: String
}, { _id: false });

const BlockSchema = new mongoose.Schema({
    index: {
        type: Number,
        required: true,
        unique: true
    },
    timestamp: {
        type: String,
        required: true
    },
    records: [RecordSubSchema],
    previousHash: {
        type: String,
        required: true
    },
    nonce: {
        type: Number,
        required: true
    },
    hash: {
        type: String,
        required: true,
        unique: true
    }
});

module.exports = mongoose.model('Block', BlockSchema);
