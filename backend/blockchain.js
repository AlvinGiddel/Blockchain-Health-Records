const crypto = require('crypto');

/**
 * Represents a Single Block in our Blockchain
 */
class Block {
    constructor(index, timestamp, records, previousHash = '') {
        this.index = index;
        this.timestamp = timestamp;
        this.records = records; // Array of medical records
        this.previousHash = previousHash;
        this.nonce = 0;
        this.hash = this.calculateHash();
    }

    /**
     * Computes the SHA-256 hash of the block contents
     */
    calculateHash() {
        const dataStr = JSON.stringify(this.records);
        return crypto
            .createHash('sha256')
            .update(this.index + this.timestamp + dataStr + this.previousHash + this.nonce)
            .digest('hex');
    }

    /**
     * Proof-of-Work: Find a hash starting with the given difficulty of zeros
     */
    mineBlock(difficulty) {
        const target = Array(difficulty + 1).join("0");
        while (this.hash.substring(0, difficulty) !== target) {
            this.nonce++;
            this.hash = this.calculateHash();
        }
    }
}

/**
 * Handles the Blockchain Ledger Operations
 */
class Blockchain {
    constructor() {
        this.chain = [this.createGenesisBlock()];
        this.difficulty = 2; // Simple difficulty so it mines in milliseconds but demonstrates Proof of Work
        this.pendingRecords = [];
    }

    createGenesisBlock() {
        return new Block(0, new Date().toISOString(), [{
            txType: 'medical',
            message: "Genesis Block: Blockchain Health Records Ledger Initialized",
            doctor: "System Admin"
        }], "0");
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    /**
     * Mines pending records into a new block and adds it to the chain
     */
    minePendingRecords(minerAddress) {
        // In a real health blockchain, we might reward the miner or just record the event
        const block = new Block(
            this.chain.length,
            new Date().toISOString(),
            this.pendingRecords,
            this.getLatestBlock().hash
        );
        
        block.mineBlock(this.difficulty);
        this.chain.push(block);
        
        // Reset pending records
        this.pendingRecords = [];
        return block;
    }

    /**
     * Adds a new record to the pool of pending records after validating its signature
     */
    addRecord(record) {
        if (!record.patientId || !record.doctorId) {
            throw new Error('Record must contain patientId and doctorId');
        }

        if (!this.verifyRecordSignature(record)) {
            throw new Error('Invalid cryptographic signature on medical record!');
        }

        this.pendingRecords.push(record);
    }

    /**
     * Verifies if a record's signature matches the doctor's public key
     */
    verifyRecordSignature(record) {
        if (!record.signature) {
            return false;
        }

        try {
            let recordMessage;
            const verifier = crypto.createVerify('sha256');
            
            if (record.txType === 'consultation') {
                recordMessage = record.patientId + record.consultationHash + record.timestamp;
                verifier.update(recordMessage);
                return verifier.verify(record.doctorPublicKey, record.signature, 'hex');
            } else {
                recordMessage = record.patientId + record.diagnosis + record.treatment + record.timestamp;
                verifier.update(recordMessage);
                return verifier.verify(record.doctorPublicKey, record.signature, 'hex');
            }
        } catch (error) {
            console.error('Signature verification failed:', error);
            return false;
        }
    }

    /**
     * Check if the blockchain is valid and untampered
     */
    isChainValid() {
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            // 1. Recalculate hash of current block
            if (currentBlock.hash !== currentBlock.calculateHash()) {
                console.log(`Invalid hash in Block #${currentBlock.index}`);
                return false;
            }

            // 2. Compare previousHash of current block with hash of previous block
            if (currentBlock.previousHash !== previousBlock.hash) {
                console.log(`Chain broken: Block #${currentBlock.index} previousHash doesn't match Block #${previousBlock.index} hash`);
                return false;
            }
        }
        return true;
    }
}

/**
 * Helper to generate cryptographic key pair for Doctors & Patients
 */
function generateKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });

    return { publicKey, privateKey };
}

/**
 * Helper for Doctor to sign a medical record before submission
 */
function signRecord(privateKey, record) {
    let recordMessage;
    if (record.txType === 'consultation') {
        recordMessage = record.patientId + record.consultationHash + record.timestamp;
    } else {
        recordMessage = record.patientId + record.diagnosis + record.treatment + record.timestamp;
    }
    const signer = crypto.createSign('sha256');
    signer.update(recordMessage);
    return signer.sign(privateKey, 'hex');
}

module.exports = {
    Blockchain,
    Block,
    generateKeyPair,
    signRecord
};
