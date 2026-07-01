const mongoose = require('mongoose');
const crypto = require('crypto');

// Secret key for database field-level encryption. 
// In a real application, this would be an environment variable.
const ENCRYPTION_KEY = Buffer.from('f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a09', 'hex'); // 32 bytes
const IV_LENGTH = 16; // AES IV size

function encrypt(text) {
    if (!text) return text;
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (err) {
        console.error('Encryption failed:', err);
        return text;
    }
}

function decrypt(text) {
    if (!text || !text.includes(':')) return text;
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        console.error('Decryption failed:', err);
        return text;
    }
}

const RecordSchema = new mongoose.Schema({
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    doctorName: {
        type: String,
        required: true
    },
    // Diagnoses and treatments are encrypted at rest in MongoDB
    diagnosis: {
        type: String,
        required: true,
        set: encrypt,
        get: decrypt
    },
    treatment: {
        type: String,
        required: true,
        set: encrypt,
        get: decrypt
    },
    prescriptions: [{
        type: String
    }],
    recordType: {
        type: String,
        enum: ['medical', 'consultation'],
        default: 'medical'
    },
    symptoms: {
        type: String,
        default: ''
    },
    notes: {
        type: String,
        default: ''
    },
    labRequest: {
        type: String,
        default: ''
    },
    consultationHash: {
        type: String,
        default: ''
    },
    transactionHash: {
        type: String,
        default: ''
    },
    ipfsHash: {
        type: String, // Reference for attachment scans stored on IPFS
        default: ''
    },
    // Blockchain Verification details
    signature: {
        type: String,
        required: true
    },
    doctorPublicKey: {
        type: String,
        required: true
    },
    isMined: {
        type: Boolean,
        default: false
    },
    blockIndex: {
        type: Number,
        default: -1
    },
    timestamp: {
        type: String, // Stringified date so it is consistent when hashing
        required: true
    }
}, {
    toJSON: { getters: true }, // Ensure decryption is run when sending JSON to frontend
    toObject: { getters: true }
});

module.exports = mongoose.model('Record', RecordSchema);
