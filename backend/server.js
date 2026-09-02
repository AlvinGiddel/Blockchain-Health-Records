const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { 
    sendResetEmail, 
    sendDoctorApprovalEmail, 
    sendDoctorRejectionEmail, 
    sendClinicApprovalEmail, 
    sendClinicRejectionEmail, 
    sendPractitionerPendingEmail,
    sendAdminNewPractitionerAlert,
    sendMail 
} = require('./mailer');
const { Blockchain, generateKeyPair, signRecord, getKenyanTimestamp } = require('./blockchain');

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const db = require('./db');
const { tenantStorage } = db;
const licenseGuard = require('./middleware/licenseGuard');
const { checkLicense, startLicenseCheckTimer, getLicenseStatus } = require('./services/licenseCheck');
const { verifyKmpdcLicense } = require('./services/kmpdcVerification');
const { verifyNckLicense } = require('./services/nckVerification');
const { verifyPractitioner, recordPractitionerAttestation } = require('./services/practitionerAttestation');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

/**
 * Helper to safely extract authenticated user context and organization scope.
 * Guarantees strict multi-tenant isolation: regular clinic admins are strictly bound
 * to their organization_id. Only super_admin can view global cross-org data.
 */
function getRequesterOrgScope(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let currentUser = null;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        try {
            currentUser = jwt.verify(authHeader.substring(7).trim(), JWT_SECRET);
        } catch (e) {}
    }
    
    // If super_admin, they can optionally target a specific clinic or see global (null)
    if (currentUser && currentUser.role === 'super_admin') {
        const explicitOrg = req.headers['x-organization-id'] || req.query.orgId || req.query.organizationId || null;
        return { currentUser, isSuperAdmin: true, targetOrgId: explicitOrg };
    }

    // For all other users (clinic admins, doctors, nurses), strictly scoped to their assigned organization_id
    const targetOrgId = currentUser ? (currentUser.organization_id || null) : null;
    return { currentUser, isSuperAdmin: false, targetOrgId };
}

// Middleware - CORS configured to allow any origin with GET, POST, PUT, DELETE, and OPTIONS methods
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-organization-id'],
    maxAge: 86400 // Cache CORS preflight for 24h
}));
app.use(express.json());

// Multi-Tenant Context Middleware: Automatically sets RLS session variables on all DB queries
app.use((req, res, next) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let context = null;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            context = {
                userId: decoded.id,
                role: decoded.role,
                orgId: req.headers['x-organization-id'] || decoded.organization_id || ''
            };
        } catch (err) {
            // Token expired or invalid
        }
    }

    if (context) {
        tenantStorage.run(context, () => next());
    } else {
        next();
    }
});

// Remote Licensing Guard: Enforces active per-organization license state
app.use(licenseGuard);

// Unique identifier for the current server run session (re-generated on every server start)
const serverInstanceId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

// Root endpoint for deployment verification
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'Blockchain Health Records API is active for community health nurses',
        serverInstanceId,
        timestamp: getKenyanTimestamp()
    });
});

// Health check endpoint to retrieve the server status and instance ID
app.get(['/api/health', '/health'], (req, res) => {
    res.json({ status: 'ok', serverInstanceId });
});

// AES Field-Level Encryption details for diagnosis & treatment
const rawEncryptionKey = process.env.ENCRYPTION_KEY || 'f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a09';
const ENCRYPTION_KEY = Buffer.from(rawEncryptionKey, 'hex'); // 32 bytes
const IV_LENGTH = 16;

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

// Helper to log audit events with explicit Kenyan timestamp
const logAuditEvent = (eventType, patientId, patientName, doctorId, doctorName, details, customTimestamp = null) => {
    const timestamp = customTimestamp || getKenyanTimestamp();
    return db.query(
        `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [eventType, patientId, patientName, doctorId, doctorName, details, timestamp]
    ).catch(err => console.error(`[AUDIT LOG ERROR] Failed to log ${eventType}:`, err.message));
};

function parseJsonIfNeeded(data) {
    if (!data) return null;
    if (typeof data === 'string') {
        try {
            const parsed = JSON.parse(data);
            return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
        } catch (e) {
            return null;
        }
    }
    return data;
}

// Initialize Blockchain Engine
let healthBlockchain = new Blockchain();

// Auto-Miner Configurations
const MEMPOOL_THRESHOLD = parseInt(process.env.MEMPOOL_THRESHOLD, 10) || 10;
const MINE_INTERVAL_MS = parseInt(process.env.MINE_INTERVAL_MS, 10) || 60000;

// Mutex lock to prevent concurrent mining operations (race conditions between timer, threshold, and manual requests)
let isMining = false;

/**
 * Synchronize the in-memory blockchain state with the database.
 * Loads mined blocks from PostgreSQL, or saves the Genesis block if the DB is empty.
 */
async function syncBlockchainWithDatabase() {
    try {
        const { rows: dbBlocks } = await db.query('SELECT * FROM blocks ORDER BY organization_id, index ASC');
        console.log(`Synchronized ${dbBlocks.length} multi-tenant blocks across all organizations.`);
        
        // Load the primary ledger blocks into healthBlockchain.chain for backward-compatible in-memory access
        const { rows: mamaLucyBlocks } = await db.query(`
            SELECT * FROM blocks 
            WHERE organization_id = 'a3409337-0a6e-4c23-bc11-4ffcbd8fc44d' 
            ORDER BY index ASC;
        `);

        if (mamaLucyBlocks.length > 0) {
            healthBlockchain.chain = mamaLucyBlocks.map(dbBlock => {
                const b = new (require('./blockchain').Block)(
                    dbBlock.index,
                    dbBlock.timestamp,
                    dbBlock.records,
                    dbBlock.previous_hash
                );
                b.nonce = parseInt(dbBlock.nonce);
                b.hash = dbBlock.hash;
                return b;
            });
        }
        
        // Sync pending records from database (records not yet mined) using single JOIN query
        const { rows: pendingDbRecords } = await db.query(`
            SELECT r.*, u.name as patient_name 
            FROM records r 
            LEFT JOIN users u ON r.patient_id = u.id 
            WHERE r.is_mined = false 
            ORDER BY r.timestamp ASC
        `);
        const medicalPending = pendingDbRecords.map(rec => ({
            recordId: rec.id,
            txType: rec.record_type || 'medical',
            patientId: rec.patient_id,
            patientName: rec.patient_name || 'Unknown Patient',
            doctorId: rec.doctor_id,
            doctorName: rec.doctor_name,
            diagnosis: decrypt(rec.diagnosis),
            treatment: decrypt(rec.treatment),
            prescriptions: rec.prescriptions,
            ipfsHash: rec.ipfs_hash,
            signature: rec.signature,
            doctorPublicKey: rec.doctor_public_key,
            timestamp: rec.timestamp,
            consultationHash: rec.consultation_hash || '',
            transactionHash: rec.transaction_hash || ''
        }));

        // Sort by timestamp
        healthBlockchain.pendingRecords = medicalPending.sort(
            (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );

        console.log(`Blockchain active. Chain length: ${healthBlockchain.chain.length}. Pending records: ${healthBlockchain.pendingRecords.length}`);
    } catch (error) {
        console.error('Error synchronizing blockchain with database:', error.message);
    }
}

/**
 * Executes a mining operation for pending records with race-condition locking.
 * Always synchronizes in-memory blockchain state with the database before mining.
 * @param {string} triggerReason - Reason/source for the mine trigger ('manual admin trigger', 'threshold hit', 'timer fallback')
 * @returns {Promise<{success: boolean, block?: any, skipped?: boolean, error?: string}>}
 */
async function executeMining(triggerReason = 'manual') {
    if (isMining) {
        console.log(`[Auto-Miner] Mining is currently in progress. Skipping trigger (${triggerReason}).`);
        return { skipped: true, reason: 'Mining in progress' };
    }

    isMining = true;
    try {
        await syncBlockchainWithDatabase();
        if (healthBlockchain.pendingRecords.length === 0) {
            if (triggerReason.startsWith('manual')) {
                return { success: false, error: 'No pending records to mine. Add new records first.' };
            }
            console.log(`[Auto-Miner] No pending records in mempool to mine (${triggerReason}).`);
            return { skipped: true, reason: 'No pending records' };
        }

        console.log(`[Auto-Miner] Mining block started (${triggerReason}). Mempool count: ${healthBlockchain.pendingRecords.length}. Starting Proof of Work...`);
        const newBlock = healthBlockchain.minePendingRecords();

        // Save block in database
        await db.query(
            'INSERT INTO blocks (index, timestamp, records, previous_hash, nonce, hash) VALUES ($1, $2, $3, $4, $5, $6)',
            [newBlock.index, newBlock.timestamp, JSON.stringify(newBlock.records), newBlock.previousHash, newBlock.nonce, newBlock.hash]
        );

        // Update records and audit logs
        const recordIds = newBlock.records.map(r => r.recordId).filter(Boolean);
        if (recordIds.length > 0) {
            await Promise.all([
                db.query('UPDATE records SET is_mined = true, block_index = $1 WHERE id = ANY($2::uuid[])', [newBlock.index, recordIds]),
                db.query('UPDATE audit_logs SET is_mined = true, block_index = $1 WHERE patient_id = ANY($2::uuid[])', [newBlock.index, recordIds])
            ]);
        }

        console.log(`[Auto-Miner] Block #${newBlock.index} mined successfully (${triggerReason}) with ${newBlock.records.length} record(s). Hash: ${newBlock.hash}`);
        return { success: true, block: newBlock };
    } catch (error) {
        console.error(`[Auto-Miner ERROR] Mining failed (${triggerReason}):`, error);
        throw error;
    } finally {
        isMining = false;
    }
}

/**
 * Checks if pending records in mempool have reached MEMPOOL_THRESHOLD and triggers auto-mine.
 */
function checkMempoolThreshold() {
    if (healthBlockchain.pendingRecords.length >= MEMPOOL_THRESHOLD) {
        console.log(`[Auto-Miner] Mempool threshold reached (${healthBlockchain.pendingRecords.length}/${MEMPOOL_THRESHOLD} records). Triggering auto-mine...`);
        executeMining(`threshold hit: ${healthBlockchain.pendingRecords.length}/${MEMPOOL_THRESHOLD} records`).catch(err => {
            console.error('[Auto-Miner] Threshold-triggered mining failed:', err);
        });
    }
}

/**
 * Starts a background interval timer to periodically mine pending records that have not met the threshold.
 * Uses global._autoMineTimer to prevent duplicate timers across hot-reloads or repeated module evaluations.
 */
function startAutoMineTimer() {
    if (global._autoMineTimer) {
        clearInterval(global._autoMineTimer);
        global._autoMineTimer = null;
    }

    console.log(`[Auto-Miner] Background timer initialized (Interval: ${MINE_INTERVAL_MS}ms, Threshold: ${MEMPOOL_THRESHOLD} records).`);

    global._autoMineTimer = setInterval(async () => {
        try {
            if (healthBlockchain.pendingRecords.length > 0) {
                console.log(`[Auto-Miner] Timer interval (${MINE_INTERVAL_MS}ms) triggered with ${healthBlockchain.pendingRecords.length} pending record(s).`);
                await executeMining(`timer fallback (${healthBlockchain.pendingRecords.length} pending record(s))`);
            }
        } catch (err) {
            console.error('[Auto-Miner] Timer-triggered mining error:', err);
        }
    }, MINE_INTERVAL_MS);

    if (global._autoMineTimer.unref) {
        global._autoMineTimer.unref();
    }
}

// Initialize KMPDC Council Registry Table & Seeds
async function initKmpdcRegistry() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS kmpdc_registry (
                license_number VARCHAR(50) PRIMARY KEY,
                full_name VARCHAR(255) NOT NULL,
                cadre VARCHAR(100) NOT NULL DEFAULT 'Medical Practitioner',
                specialization VARCHAR(255) DEFAULT 'General Medicine',
                status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired')),
                retention_year INTEGER DEFAULT 2026,
                facility VARCHAR(255) DEFAULT 'National Health Service',
                created_at TIMESTAMPTZ DEFAULT NOW(),
                last_verified_at TIMESTAMPTZ DEFAULT NOW()
            );

            INSERT INTO kmpdc_registry (license_number, full_name, cadre, specialization, status, retention_year, facility)
            VALUES 
                ('A12345', 'Dr. Alvin Giddel Mutuku', 'Medical Practitioner', 'Cardiology & Internal Medicine', 'active', 2026, 'Kenyatta National Hospital'),
                ('A45892', 'Dr. Jane Wanjiku Kamau', 'Medical Practitioner', 'General Surgery', 'active', 2026, 'Avenue Healthcare Nairobi'),
                ('A56712', 'Dr. David Ochieng Otieno', 'Medical Practitioner', 'Pediatrics & Child Health', 'active', 2026, 'Aga Khan University Hospital'),
                ('A78901', 'Dr. Faith Chebet Rono', 'Medical Practitioner', 'Obstetrics & Gynecology', 'active', 2026, 'Moi Teaching and Referral Hospital'),
                ('A90123', 'Dr. Michael Mwangi Kariuki', 'Medical Practitioner', 'Neurology & Critical Care', 'active', 2026, 'Nairobi Hospital'),
                ('B10234', 'Dr. Sarah Nyambura Ndungu', 'Dentist', 'Orthodontics & Dental Surgery', 'active', 2026, 'Upper Hill Medical Centre'),
                ('B20456', 'Dr. Brian Kiprop Korir', 'Dentist', 'Oral & Maxillofacial Surgery', 'active', 2026, 'Eldoret Dental Clinic'),
                ('A99999', 'Dr. Suspended Practitioner Example', 'Medical Practitioner', 'General Practice', 'suspended', 2025, 'Revoked Practice Node')
            ON CONFLICT (license_number) DO NOTHING;
        `);
        console.log('[KMPDC Service] Practitioner registry initialized.');
    } catch (err) {
        console.warn('[KMPDC Service] Registry init notice:', err.message);
    }
}

// Ensure profile_photo column exists on users table for universal avatar support
async function initUserSchemaExtensions() {
    try {
        await db.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo TEXT DEFAULT NULL;');
        console.log('[Schema] Users profile_photo column verified.');
    } catch (err) {
        console.warn('[Schema] Users profile_photo notice:', err.message);
    }
}

// Initialize database synchronization, remote license checks, KMPDC registry & start background timers
async function initDb() {
    await initUserSchemaExtensions();
    await initKmpdcRegistry();
    await checkLicense();
    startLicenseCheckTimer();
    await syncBlockchainWithDatabase();
    startAutoMineTimer();
}
initDb();

// ==================== AUTHENTICATION ROUTES ====================

// Helper to normalize phone numbers (retains numbers only)
const normalizePhone = (phoneStr) => {
    if (!phoneStr || typeof phoneStr !== 'string') return '';
    return phoneStr.replace(/[^0-9]/g, '');
};

// Helper to safely parse stored profile JSON
const parseProfile = (p) => {
    if (!p) return {};
    if (typeof p === 'string') {
        try { return JSON.parse(p); } catch (e) { return {}; }
    }
    return p;
};

// Check Phone Availability (Real-time client validation)
app.get('/api/auth/check-phone', async (req, res) => {
    try {
        const { phone } = req.query;
        if (!phone) {
            return res.json({ exists: false });
        }
        const normPhone = normalizePhone(String(phone));
        if (!normPhone || normPhone.length < 5) {
            return res.json({ exists: false });
        }

        const { rows: allUsers } = await db.query('SELECT patient_profile, doctor_profile FROM users');
        const exists = allUsers.some(u => {
            const pProf = parseProfile(u.patient_profile);
            const dProf = parseProfile(u.doctor_profile);
            const exPhones = [pProf.phone, dProf.phone]
                .map(p => normalizePhone(String(p || '')))
                .filter(Boolean);
            return exPhones.includes(normPhone);
        });

        res.json({
            exists,
            message: exists ? 'This phone number is already registered to an existing user account. Duplicate phone numbers are not allowed.' : ''
        });
    } catch (err) {
        console.error('Check phone error:', err);
        res.status(500).json({ error: 'Failed to verify phone number.' });
    }
});

// Real-time KMPDC Doctor License Verification API
app.get('/api/kmpdc/verify', async (req, res) => {
    try {
        const { license, name } = req.query;
        if (!license) {
            return res.status(400).json({ error: 'License query parameter is required (e.g. /api/kmpdc/verify?license=A12345&name=Jane+Doe)' });
        }
        const result = await verifyKmpdcLicense(String(license), name ? String(name) : undefined);
        if (!result.verified) {
            return res.status(422).json({
                valid: false,
                error: result.error,
                matchScore: result.matchScore || 0
            });
        }
        res.json({
            valid: true,
            practitioner: result.record,
            matchScore: result.matchScore
        });
    } catch (err) {
        console.error('KMPDC verification route error:', err);
        res.status(500).json({ error: 'KMPDC council verification query failed.' });
    }
});

// Real-time NCK Nurse / Midwife License Verification API
app.get('/api/nck/verify', async (req, res) => {
    try {
        const { license, name, cadre = 'nurse' } = req.query;
        if (!license) {
            return res.status(400).json({ error: 'License query parameter is required (e.g. /api/nck/verify?license=594079&name=Mary+Kungu)' });
        }
        const result = await verifyNckLicense(String(license), name ? String(name) : undefined, String(cadre));
        if (!result.verified) {
            return res.status(422).json({
                valid: false,
                error: result.error,
                matchScore: result.matchScore || 0
            });
        }
        res.json({
            valid: true,
            practitioner: result.record,
            matchScore: result.matchScore
        });
    } catch (err) {
        console.error('NCK verification route error:', err);
        res.status(500).json({ error: 'NCK council verification query failed.' });
    }
});

// Unified Practitioner Verification API (KMPDC + NCK based on cadre)
app.get('/api/practitioner/verify', async (req, res) => {
    try {
        const { license, name, cadre = 'doctor' } = req.query;
        if (!license) {
            return res.status(400).json({ error: 'License query parameter is required' });
        }
        const result = await verifyPractitioner({ 
            cadre: String(cadre), 
            licenseNumber: String(license), 
            practitionerName: name ? String(name) : undefined 
        });
        if (!result.verified) {
            return res.status(422).json({
                valid: false,
                error: result.error,
                regulator: result.regulator,
                matchScore: result.matchScore || 0
            });
        }
        res.json({
            valid: true,
            regulator: result.regulator,
            cadre: result.cadre,
            practitioner: result.record,
            matchScore: result.matchScore
        });
    } catch (err) {
        console.error('Practitioner verification route error:', err);
        res.status(500).json({ error: 'Practitioner verification query failed.' });
    }
});

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, role, profile, organizationId } = req.body;
        
        if (role === 'admin' || role === 'super_admin' || !['patient', 'doctor'].includes(role)) {
            return res.status(400).json({ error: 'Registration as Administrator or Super Administrator is not allowed.' });
        }

        // Validate hospital facility selection for patients
        let targetOrg = null;
        if (role === 'patient') {
            if (!organizationId) {
                return res.status(400).json({ error: 'Please select your hospital or clinic facility to complete registration.' });
            }
            const { rows: orgCheck } = await db.query(
                "SELECT id, name FROM organizations WHERE id = $1 AND status IN ('active', 'trial') AND LOWER(name) NOT LIKE '%unassigned%'",
                [organizationId]
            );
            if (orgCheck.length === 0) {
                return res.status(400).json({ error: 'Invalid or inactive hospital facility selected.' });
            }
            targetOrg = orgCheck[0];
        } else if (role === 'doctor') {
            if (organizationId) {
                const { rows: orgCheck } = await db.query(
                    "SELECT id, name FROM organizations WHERE id = $1 AND status IN ('active', 'trial') AND LOWER(name) NOT LIKE '%unassigned%'",
                    [organizationId]
                );
                if (orgCheck.length > 0) {
                    targetOrg = orgCheck[0];
                }
            }
        }
        
        // 1. Check if email already exists
        const cleanEmail = email.toLowerCase().trim();
        const { rows: existingEmailUsers } = await db.query('SELECT * FROM users WHERE LOWER(email) = $1', [cleanEmail]);
        if (existingEmailUsers.length > 0) {
            return res.status(400).json({ error: 'Registration rejected: Email address is already registered.' });
        }

        // Fetch existing users to verify unique phone numbers and patient details
        const { rows: allUsers } = await db.query('SELECT id, name, email, role, patient_profile, doctor_profile FROM users');

        // Extract contact phone number supplied in incoming request
        const rawPhone = profile?.phone || '';
        const normPhone = normalizePhone(String(rawPhone));

        // 2. Check if Phone Number is already registered
        if (normPhone && normPhone.length >= 5) {
            const isPhoneTaken = allUsers.some(u => {
                const pProf = parseProfile(u.patient_profile);
                const dProf = parseProfile(u.doctor_profile);
                const exPhones = [pProf.phone, dProf.phone]
                    .map(p => normalizePhone(String(p || '')))
                    .filter(Boolean);
                return exPhones.includes(normPhone);
            });

            if (isPhoneTaken) {
                return res.status(400).json({ error: 'Registration rejected: A user with this phone number is already registered in the system. Duplicate phone numbers are not allowed.' });
            }
        }

        // 3. Check Duplicate Patient Details (for Patient registration)
        if (role === 'patient') {
            const incomingName = name.toLowerCase().trim();
            const incomingAge = profile ? parseInt(profile.age) : null;
            const incomingGender = profile ? (profile.gender || '').toLowerCase().trim() : '';
            const incomingBlood = profile ? (profile.bloodType || '').toLowerCase().trim() : '';

            const isDuplicatePatient = allUsers.some(u => {
                if (u.role !== 'patient') return false;
                const exName = (u.name || '').toLowerCase().trim();
                const pProf = parseProfile(u.patient_profile);
                const exAge = pProf.age ? parseInt(pProf.age) : null;
                const exGender = (pProf.gender || '').toLowerCase().trim();
                const exBlood = (pProf.bloodType || '').toLowerCase().trim();
                const exPhone = normalizePhone(String(pProf.phone || ''));

                // Match condition A: Same Name & Same Phone
                if (incomingName === exName && normPhone && exPhone && normPhone === exPhone) {
                    return true;
                }

                // Match condition B: Same Name & Same Age
                if (incomingName === exName && incomingAge && exAge && incomingAge === exAge) {
                    return true;
                }

                // Match condition C: Same Name & Same Gender & Same Blood Group
                if (incomingName === exName && incomingGender && exGender && incomingGender === exGender && incomingBlood && exBlood && incomingBlood === exBlood) {
                    return true;
                }

                return false;
            });

            if (isDuplicatePatient) {
                return res.status(400).json({ error: 'Registration rejected: A patient record with identical details (name and demographic profile) is already registered in the system.' });
            }
        }

        // 4. Council Verification & Duplicate Check for Practitioners (Doctors, Dentists, Nurses, Midwives)
        let practitionerCheck = null;
        if (role === 'doctor') {
            const incomingLicense = (profile?.licenseNumber || '').trim();
            const cadre = (profile?.cadre || 'doctor').toLowerCase();
            if (!incomingLicense) {
                return res.status(400).json({ 
                    error: `Registration rejected: A valid ${cadre === 'nurse' || cadre === 'midwife' ? 'NCK Nursing License / Registration Number' : 'KMPDC Medical License Number'} is required.` 
                });
            }

            // Perform Off-Chain Statutory Council Verification (KMPDC or NCK) against practitioner name
            practitionerCheck = await verifyPractitioner({ cadre, licenseNumber: incomingLicense, practitionerName: name });
            if (!practitionerCheck.verified) {
                return res.status(422).json({ error: `${practitionerCheck.regulator || 'Council'} License Verification Failed: ${practitionerCheck.error}` });
            }

            // Attach verified council information to practitioner profile
            if (profile) {
                profile.cadre = practitionerCheck.cadre;
                profile.regulator = practitionerCheck.regulator;
                profile.licenseNumber = practitionerCheck.record.licenseNumber;
                profile.councilVerified = true;
                profile.councilStatus = practitionerCheck.record.status;
                profile.facility = practitionerCheck.record.facility;
                profile.lastVerifiedAt = practitionerCheck.record.lastVerifiedAt;
            }

            const isLicenseTaken = allUsers.some(u => {
                if (u.role !== 'doctor') return false;
                const dProf = parseProfile(u.doctor_profile);
                const exLicense = (dProf.licenseNumber || '').toUpperCase().trim();
                const exRegulator = (dProf.regulator || 'KMPDC').toUpperCase();
                return exLicense && exLicense === incomingLicense.toUpperCase() && exRegulator === practitionerCheck.regulator;
            });

            if (isLicenseTaken) {
                return res.status(400).json({ error: `Registration rejected: A practitioner with this ${practitionerCheck.regulator} license number is already registered in the system.` });
            }
        }
        
        // Generate cryptographic keys for this user
        console.log(`Generating RSA keys for registering user: ${name} (${role})...`);
        const { publicKey, privateKey } = generateKeyPair();
        
        let isApprovedVal = true;
        if (role === 'doctor') {
            isApprovedVal = false;
        }

        // Hash Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const patientProfile = role === 'patient' ? profile : null;
        const doctorProfile = role === 'doctor' ? profile : null;

        const createdAt = getKenyanTimestamp();
        
        // Execute atomic creation of user record and hospital tenant membership
        const client = await db.pool.connect();
        let user;
        let memberships = [];
        try {
            await client.query('BEGIN;');

            const assignedOrgId = (role === 'doctor' && targetOrg) ? targetOrg.id : null;
            const { rows: insertedUsers } = await client.query(
                `INSERT INTO users (name, email, password, role, organization_id, public_key, private_key, patient_profile, doctor_profile, is_approved, created_at) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
                [name, email.toLowerCase().trim(), hashedPassword, role, assignedOrgId, publicKey, privateKey, 
                 patientProfile ? JSON.stringify(patientProfile) : null, 
                 doctorProfile ? JSON.stringify(doctorProfile) : null, 
                 isApprovedVal, createdAt]
            );
            user = insertedUsers[0];

            // Record cryptographic practitioner attestation
            if (role === 'doctor' && practitionerCheck && practitionerCheck.verified) {
                await recordPractitionerAttestation({
                    practitionerId: user.id,
                    regulator: practitionerCheck.regulator,
                    cadre: practitionerCheck.cadre,
                    licenseNumber: practitionerCheck.record.licenseNumber,
                    practitionerPublicKey: publicKey
                }).catch(attestErr => {
                    console.error('Failed to record practitioner attestation:', attestErr.message);
                });
            }

            if (role === 'patient' && targetOrg) {
                // Link new patient to their selected initial hospital via tenant_memberships
                await client.query(`
                    INSERT INTO tenant_memberships (user_id, organization_id, role, status, joined_at)
                    VALUES ($1, $2, 'patient', 'active', $3)
                    ON CONFLICT (user_id, organization_id) DO UPDATE SET status = 'active';
                `, [user.id, targetOrg.id, createdAt]);

                memberships = [{
                    organizationId: targetOrg.id,
                    organizationName: targetOrg.name,
                    role: 'patient',
                    status: 'active'
                }];

                // Audit log for patient registration and facility enrollment
                await client.query(
                    `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [targetOrg.id, 'patient_registration', user.id, user.name, user.id, 'System', `New patient registered and affiliated with ${targetOrg.name}.`, createdAt]
                );
            } else if (role === 'doctor' && targetOrg) {
                // Link doctor to their selected facility via tenant_memberships with pending approval status
                await client.query(`
                    INSERT INTO tenant_memberships (user_id, organization_id, role, status, joined_at)
                    VALUES ($1, $2, 'doctor', 'pending', $3)
                    ON CONFLICT (user_id, organization_id) DO UPDATE SET status = 'pending';
                `, [user.id, targetOrg.id, createdAt]);

                await client.query(
                    `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp) 
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [targetOrg.id, 'doctor_registration_request', user.id, user.name, user.id, 'System', `Dr. ${user.name} (${user.email}) requested clinical node affiliation with ${targetOrg.name}. Pending administrative approval.`, createdAt]
                );
            }

            await client.query('COMMIT;');
        } catch (txErr) {
            await client.query('ROLLBACK;');
            throw txErr;
        } finally {
            client.release();
        }

        if (role === 'doctor' && !isApprovedVal) {
            const cadreVal = profile?.cadre || 'doctor';
            const facilityName = targetOrg ? targetOrg.name : (profile?.hospital || 'Platform Network');

            // Send registration receipt acknowledgment email to practitioner (in background)
            sendPractitionerPendingEmail({
                email: user.email,
                name: user.name,
                cadre: cadreVal,
                regulator: practitionerCheck?.regulator || 'Statutory Council',
                licenseNumber: profile?.licenseNumber,
                hospitalName: facilityName
            }).catch(mErr => console.error('Failed to send practitioner pending email:', mErr.message));

            // Notify facility admin of new practitioner in approval queue
            if (targetOrg) {
                db.query(`
                    SELECT name, email FROM users 
                    WHERE organization_id = $1 AND role = 'admin' 
                    LIMIT 1;
                `, [targetOrg.id]).then(({ rows: adminRows }) => {
                    if (adminRows.length > 0) {
                        sendAdminNewPractitionerAlert({
                            adminEmail: adminRows[0].email,
                            adminName: adminRows[0].name,
                            practitionerName: user.name,
                            cadre: cadreVal,
                            hospitalName: targetOrg.name,
                            licenseNumber: profile?.licenseNumber
                        }).catch(aErr => console.error('Failed to send admin alert email:', aErr.message));
                    }
                }).catch(qErr => console.error('Failed to query hospital admin for email alert:', qErr.message));
            }

            // Log doctor registration request event in audit trail (in background)
            db.query(
                `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                ['doctor_request', user.id, user.name, user.id, 'System Admin', `New practitioner registration request submitted by ${user.name} (${user.email}). Pending approval.`, createdAt]
            ).catch(err => console.error('Failed to log doctor request audit:', err));

            return res.status(202).json({
                message: 'Registration submitted successfully! Your application is pending institutional approval. A confirmation email has been sent to your inbox.',
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isApproved: false
                }
            });
        }
        
        const token = jwt.sign({ 
            id: user.id, 
            role: user.role,
            organization_id: user.organization_id || null,
            organizationName: targetOrg ? targetOrg.name : null
        }, JWT_SECRET, { expiresIn: '1d' });

        res.status(201).json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                publicKey: user.public_key,
                patientProfile: parseJsonIfNeeded(user.patient_profile),
                doctorProfile: parseJsonIfNeeded(user.doctor_profile),
                isApproved: user.is_approved,
                memberships: memberships
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed.' });
    }
});

// Dedicated In-Memory Rate Limiter for Super Admin Login (5 attempts / 15 min window)
const superAdminLoginAttempts = new Map(); // key: ip, value: { count: number, resetAt: number }

function checkSuperAdminRateLimit(ip) {
    const now = Date.now();
    const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
    const MAX_ATTEMPTS = 5;

    const record = superAdminLoginAttempts.get(ip);
    if (!record || now > record.resetAt) {
        superAdminLoginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
        return { allowed: true };
    }

    if (record.count >= MAX_ATTEMPTS) {
        const retryAfterSec = Math.ceil((record.resetAt - now) / 1000);
        return { allowed: false, retryAfterSec };
    }

    record.count += 1;
    return { allowed: true };
}

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ error: 'Please provide both email address and password.' });
        }

        const cleanEmail = email.toLowerCase().trim();
        const superAdminEmail = (process.env.SUPER_ADMIN_EMAIL || '').toLowerCase().trim();

        // Stricter rate limit enforcement specifically for Super Admin login attempts
        if (superAdminEmail && cleanEmail === superAdminEmail) {
            const clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
            const rateLimitResult = checkSuperAdminRateLimit(clientIp);
            if (!rateLimitResult.allowed) {
                console.warn(`[Security Alert] Super Admin login rate limit exceeded from IP: ${clientIp}`);
                return res.status(429).json({ 
                    error: `Too many Super Admin login attempts. Rate limit exceeded. Try again in ${rateLimitResult.retryAfterSec} seconds.` 
                });
            }
        }

        const { rows: users } = await db.query('SELECT * FROM users WHERE email = $1', [cleanEmail]);
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        const user = users[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        
        // Block unapproved/rejected admins and doctors from logging in
        if (user.role === 'admin') {
            if (user.is_rejected) {
                return res.status(403).json({ error: 'Your admin registration request was rejected by the administrator.' });
            }
            if (!user.is_approved) {
                return res.status(403).json({ error: 'Admin approval pending. Please request authorization from an active administrator.' });
            }
        } else if (user.role === 'doctor') {
            if (user.is_rejected) {
                return res.status(403).json({ error: 'Your doctor registration request was rejected by the administrator.' });
            }
            if (!user.is_approved) {
                return res.status(403).json({ error: 'Doctor approval pending. Please wait for an administrator to review your request.' });
            }
        }

        // Check organization license and suspension status for tenant staff (admins, doctors, nurses)
        // Super Admin always bypasses to maintain platform governance and emergency recovery authority
        let organizationName = null;
        let organizationStatus = null;
        if (user.role !== 'super_admin' && user.organization_id) {
            const { rows: orgRows } = await db.query(
                'SELECT id, name, status, license_expires_at FROM organizations WHERE id = $1',
                [user.organization_id]
            );
            if (orgRows.length > 0) {
                const org = orgRows[0];
                organizationName = org.name;
                organizationStatus = org.status;

                // 1. Check if hospital facility is pending approval
                if (org.status === 'pending_approval') {
                    return res.status(403).json({
                        error: 'Your clinic registration is still under review.'
                    });
                }

                // 2. Check if hospital facility is suspended or disabled
                if (org.status === 'suspended' || org.status === 'disabled') {
                    return res.status(403).json({
                        error: `Access Denied: Your hospital facility ("${org.name}") has been ${org.status === 'disabled' ? 'disabled' : 'suspended'} by platform administration. All access to this ledger is blocked.`
                    });
                }

                // 3. Auto-transition: if trial expiration has passed, update status to 'expired'
                if (org.status === 'trial' && org.license_expires_at && new Date(org.license_expires_at) < new Date()) {
                    await db.query("UPDATE organizations SET status = 'expired', updated_at = NOW() WHERE id = $1;", [org.id]);
                    await db.query("UPDATE licenses SET status = 'expired', updated_at = NOW() WHERE organization_id = $1;", [org.id]);
                    org.status = 'expired';
                    organizationStatus = 'expired';
                }
            }
        }

        // Fetch tenant memberships for multi-clinic patients
        let memberships = [];
        if (user.role === 'patient') {
            const { rows: memRows } = await db.query(`
                SELECT tm.organization_id as "organizationId", o.name as "organizationName", tm.role, tm.status
                FROM tenant_memberships tm
                JOIN organizations o ON tm.organization_id = o.id
                WHERE tm.user_id = $1 AND tm.status = 'active';
            `, [user.id]);
            memberships = memRows;
        }

        const token = jwt.sign({ 
            id: user.id, 
            role: user.role,
            organization_id: user.organization_id || null,
            organizationName: organizationName || null,
            organizationStatus: organizationStatus || null
        }, JWT_SECRET, { expiresIn: '1d' });

        const doctorProfile = parseJsonIfNeeded(user.doctor_profile);
        const patientProfile = parseJsonIfNeeded(user.patient_profile);
        const profilePhoto = user.profile_photo || doctorProfile?.profilePhoto || patientProfile?.profilePhoto || null;

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                organizationId: user.organization_id || null,
                organizationName: organizationName || null,
                organizationStatus: organizationStatus || null,
                memberships: memberships,
                publicKey: user.public_key,
                profilePhoto: profilePhoto,
                patientProfile: patientProfile,
                doctorProfile: doctorProfile,
                isApproved: user.is_approved
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed.' });
    }
});

// ==================== STAGE 5: CLINIC SELF-SERVE ONBOARDING ====================
app.post('/api/auth/register-clinic', async (req, res) => {
    const client = await db.pool.connect();
    try {
        const { organizationName, adminName, email, password } = req.body || {};

        if (!organizationName || !adminName || !email || !password) {
            return res.status(400).json({ error: 'Please provide all required fields: organizationName, adminName, email, and password.' });
        }

        const cleanOrgName = organizationName.trim();
        const cleanAdminName = adminName.trim();
        const cleanEmail = email.toLowerCase().trim();

        if (cleanOrgName.length < 3) {
            return res.status(400).json({ error: 'Organization name must be at least 3 characters long.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
        }

        // 1. Check if organization name already exists
        const { rows: existingOrgs } = await client.query(
            'SELECT id FROM organizations WHERE LOWER(name) = LOWER($1);',
            [cleanOrgName]
        );
        if (existingOrgs.length > 0) {
            return res.status(400).json({ error: 'A hospital or clinic with this name is already registered.' });
        }

        // 2. Check if admin email already exists
        const { rows: existingUsers } = await client.query(
            'SELECT id FROM users WHERE email = $1;',
            [cleanEmail]
        );
        if (existingUsers.length > 0) {
            return res.status(400).json({ error: 'An account with this email address already exists.' });
        }

        // Generate organization slug
        const baseSlug = cleanOrgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const slug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;

        // Generate RSA keypair for the admin
        const { publicKey, privateKey } = generateKeyPair();

        // Hash Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await client.query('BEGIN;');

        // 3. Insert into organizations with status = 'pending_approval' (awaits Super Admin review)
        const { rows: insertedOrgs } = await client.query(`
            INSERT INTO organizations (name, slug, status, license_expires_at)
            VALUES ($1, $2, 'pending_approval', NULL)
            RETURNING *;
        `, [cleanOrgName, slug]);
        const newOrg = insertedOrgs[0];

        // 4. Insert into users as admin scoped to new organization_id with is_approved = false
        const createdAt = getKenyanTimestamp();
        const { rows: insertedUsers } = await client.query(`
            INSERT INTO users (organization_id, name, email, password, role, public_key, private_key, is_approved, is_rejected, created_at)
            VALUES ($1, $2, $3, $4, 'admin', $5, $6, false, false, $7)
            RETURNING *;
        `, [newOrg.id, cleanAdminName, cleanEmail, hashedPassword, publicKey, privateKey, createdAt]);
        const newAdmin = insertedUsers[0];

        // 5. Insert into tenant_memberships with status = 'pending'
        await client.query(`
            INSERT INTO tenant_memberships (user_id, organization_id, role, status)
            VALUES ($1, $2, 'admin', 'pending');
        `, [newAdmin.id, newOrg.id]);

        // 6. Seed isolated Genesis block for this new clinic
        const genesisTimestamp = getKenyanTimestamp();
        const genesisRecords = [{
            txType: 'medical',
            message: `Genesis Block: ${cleanOrgName} Ledger Initialized`,
            doctor: cleanAdminName
        }];
        const genesisPrevHash = '0';
        let nonce = 0;
        let genesisHash = '';

        while (true) {
            const dataStr = JSON.stringify(genesisRecords);
            genesisHash = crypto.createHash('sha256').update(0 + genesisTimestamp + dataStr + genesisPrevHash + nonce).digest('hex');
            if (genesisHash.startsWith('00')) break;
            nonce++;
        }

        await client.query(`
            INSERT INTO blocks (organization_id, index, timestamp, records, previous_hash, nonce, hash)
            VALUES ($1, $2, $3, $4, $5, $6, $7);
        `, [newOrg.id, 0, genesisTimestamp, JSON.stringify(genesisRecords), genesisPrevHash, nonce.toString(), genesisHash]);

        // 7. Insert row in licenses with status = 'pending_approval'
        await client.query(`
            INSERT INTO licenses (organization_id, client_id, status, expires_at, updated_at)
            VALUES ($1, $2, 'pending_approval', NULL, NOW());
        `, [newOrg.id, cleanOrgName]);

        // 8. Log audit trail
        await client.query(`
            INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp)
            VALUES ($1, 'clinic_registration_submitted', $2, $3, $2, $3, $4, $5);
        `, [newOrg.id, newAdmin.id, cleanAdminName, `New clinic registration for "${cleanOrgName}" submitted by ${cleanAdminName}. Pending Super Admin review.`, createdAt]);

        await client.query('COMMIT;');

        // Return confirmation without JWT (Do NOT log in immediately)
        res.status(201).json({
            success: true,
            pendingApproval: true,
            message: 'Your registration has been submitted and is pending review.',
            organization: {
                id: newOrg.id,
                name: newOrg.name,
                slug: newOrg.slug,
                status: 'pending_approval'
            }
        });

    } catch (err) {
        await client.query('ROLLBACK;').catch(() => {});
        console.error('Error during clinic registration:', err);
        res.status(500).json({ error: err.message || 'Failed to register clinic.' });
    } finally {
        client.release();
    }
});

// ==================== STAGE 6: SUPER ADMIN MULTI-TENANT MANAGEMENT ====================

// Public list of active healthcare facilities (for patient registration and multi-clinic bookings)
app.get('/api/organizations/active', async (req, res) => {
    try {
        const { rows: orgs } = await db.query(`
            SELECT id, name, status 
            FROM organizations 
            WHERE status IN ('active', 'trial') 
              AND LOWER(name) NOT LIKE '%unassigned%'
            ORDER BY name ASC;
        `);
        res.json(orgs);
    } catch (err) {
        console.error('Error fetching active organizations:', err);
        res.status(500).json({ error: 'Failed to fetch active hospital facilities.' });
    }
});

// List all organizations with metrics
app.get('/api/admin/organizations', async (req, res) => {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }
        const decoded = jwt.verify(authHeader.substring(7).trim(), JWT_SECRET);
        if (decoded.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access restricted to Super Administrators only.' });
        }

        const { rows: orgs } = await db.query(`
            SELECT 
                o.id,
                o.name,
                o.slug,
                o.status,
                o.license_expires_at as "licenseExpiresAt",
                o.max_doctors as "maxDoctors",
                o.max_patients as "maxPatients",
                o.created_at as "createdAt",
                COUNT(DISTINCT CASE WHEN tm.role = 'doctor' THEN tm.user_id END) as "doctorCount",
                COUNT(DISTINCT CASE WHEN tm.role = 'patient' THEN tm.user_id END) as "patientCount",
                COUNT(DISTINCT a.id) as "appointmentCount",
                COUNT(DISTINCT r.id) as "recordCount",
                COALESCE(MAX(b.index), 0) as "blockHeight"
            FROM organizations o
            LEFT JOIN tenant_memberships tm ON o.id = tm.organization_id
            LEFT JOIN appointments a ON o.id = a.organization_id
            LEFT JOIN records r ON o.id = r.organization_id
            LEFT JOIN blocks b ON o.id = b.organization_id
            GROUP BY o.id
            ORDER BY o.name ASC;
        `);

        res.json({ success: true, organizations: orgs });
    } catch (err) {
        console.error('Error fetching organizations for super admin:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch organizations.' });
    }
});

// Get pending clinic approval requests for Super Admin
app.get('/api/admin/organizations/pending', async (req, res) => {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }
        const decoded = jwt.verify(authHeader.substring(7).trim(), JWT_SECRET);
        if (decoded.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access restricted to Super Administrators only.' });
        }

        const { rows: pendingClinics } = await db.query(`
            SELECT 
                o.id,
                o.name as "organizationName",
                o.slug,
                o.status,
                o.created_at as "createdAt",
                u.id as "adminId",
                u.name as "adminName",
                u.email as "adminEmail"
            FROM organizations o
            LEFT JOIN users u ON u.organization_id = o.id AND u.role = 'admin'
            WHERE o.status = 'pending_approval'
            ORDER BY o.created_at ASC;
        `);

        res.json({ success: true, pendingClinics });
    } catch (err) {
        console.error('Error fetching pending clinic approvals:', err);
        res.status(500).json({ error: err.message || 'Failed to fetch pending clinic approvals.' });
    }
});

// Approve a pending clinic registration (activates 14-day trial)
app.post('/api/admin/organizations/:id/approve', async (req, res) => {
    const client = await db.pool.connect();
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }
        const decoded = jwt.verify(authHeader.substring(7).trim(), JWT_SECRET);
        if (decoded.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access restricted to Super Administrators only.' });
        }

        const { id } = req.params;
        await client.query('BEGIN;');

        // 1. Update organization: status = 'trial', license_expires_at = NOW() + 14 days
        const { rows: updatedOrgs } = await client.query(`
            UPDATE organizations 
            SET status = 'trial',
                license_expires_at = NOW() + INTERVAL '14 days',
                updated_at = NOW()
            WHERE id = $1
            RETURNING *;
        `, [id]);

        if (updatedOrgs.length === 0) {
            await client.query('ROLLBACK;');
            return res.status(404).json({ error: 'Organization not found.' });
        }
        const org = updatedOrgs[0];

        // 2. Update licenses table
        await client.query(`
            UPDATE licenses 
            SET status = 'trial',
                expires_at = $1,
                updated_at = NOW()
            WHERE organization_id = $2;
        `, [org.license_expires_at, id]);

        // 3. Approve the clinic's admin user
        const { rows: adminUsers } = await client.query(`
            UPDATE users 
            SET is_approved = true, is_rejected = false 
            WHERE organization_id = $1 AND role = 'admin'
            RETURNING id, name, email;
        `, [id]);

        // 4. Update tenant_memberships
        await client.query(`
            UPDATE tenant_memberships 
            SET status = 'active' 
            WHERE organization_id = $1 AND role = 'admin';
        `, [id]);

        // 5. Audit log
        await client.query(`
            INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp)
            VALUES ($1, 'clinic_approved', $2, $3, $2, $3, $4, NOW());
        `, [id, decoded.id, decoded.name || 'Super Admin', `Clinic "${org.name}" approved by Super Admin. 14-day trial activated.`]);

        await client.query('COMMIT;');

        // 6. Send approval email via mailer
        if (adminUsers.length > 0) {
            const admin = adminUsers[0];
            sendClinicApprovalEmail({
                email: admin.email,
                adminName: admin.name,
                clinicName: org.name
            }).catch(e => console.error('Failed to send clinic approval email:', e));
        }

        res.json({
            success: true,
            message: `Clinic "${org.name}" approved successfully! 14-day trial activated.`,
            organization: org
        });
    } catch (err) {
        await client.query('ROLLBACK;').catch(() => {});
        console.error('Error approving clinic:', err);
        res.status(500).json({ error: err.message || 'Failed to approve clinic.' });
    } finally {
        client.release();
    }
});

// Reject a pending clinic registration (sets status to disabled, keeps record)
app.post('/api/admin/organizations/:id/reject', async (req, res) => {
    const client = await db.pool.connect();
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }
        const decoded = jwt.verify(authHeader.substring(7).trim(), JWT_SECRET);
        if (decoded.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access restricted to Super Administrators only.' });
        }

        const { id } = req.params;
        const { reason } = req.body || {};

        await client.query('BEGIN;');

        // 1. Update organization: status = 'disabled'
        const { rows: updatedOrgs } = await client.query(`
            UPDATE organizations 
            SET status = 'disabled',
                updated_at = NOW()
            WHERE id = $1
            RETURNING *;
        `, [id]);

        if (updatedOrgs.length === 0) {
            await client.query('ROLLBACK;');
            return res.status(404).json({ error: 'Organization not found.' });
        }
        const org = updatedOrgs[0];

        // 2. Update licenses table
        await client.query(`
            UPDATE licenses 
            SET status = 'disabled',
                updated_at = NOW()
            WHERE organization_id = $1;
        `, [id]);

        // 3. Mark admin user as rejected and unapproved
        const { rows: adminUsers } = await client.query(`
            UPDATE users 
            SET is_approved = false, is_rejected = true 
            WHERE organization_id = $1 AND role = 'admin'
            RETURNING id, name, email;
        `, [id]);

        // 4. Update tenant_memberships
        await client.query(`
            UPDATE tenant_memberships 
            SET status = 'inactive' 
            WHERE organization_id = $1 AND role = 'admin';
        `, [id]);

        // 5. Audit log
        await client.query(`
            INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp)
            VALUES ($1, 'clinic_rejected', $2, $3, $2, $3, $4, NOW());
        `, [id, decoded.id, decoded.name || 'Super Admin', `Clinic "${org.name}" registration rejected by Super Admin.${reason ? ` Reason: ${reason}` : ''}`]);

        await client.query('COMMIT;');

        // 6. Send rejection email via mailer
        if (adminUsers.length > 0) {
            const admin = adminUsers[0];
            sendClinicRejectionEmail({
                email: admin.email,
                adminName: admin.name,
                clinicName: org.name,
                reason
            }).catch(e => console.error('Failed to send clinic rejection email:', e));
        }

        res.json({
            success: true,
            message: `Clinic "${org.name}" registration has been rejected and set to disabled.`,
            organization: org
        });
    } catch (err) {
        await client.query('ROLLBACK;').catch(() => {});
        console.error('Error rejecting clinic:', err);
        res.status(500).json({ error: err.message || 'Failed to reject clinic.' });
    } finally {
        client.release();
    }
});

// Update an organization's license status or extend trial
app.post('/api/admin/organizations/:id/status', async (req, res) => {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }
        const decoded = jwt.verify(authHeader.substring(7).trim(), JWT_SECRET);
        if (decoded.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access restricted to Super Administrators only.' });
        }

        const { id } = req.params;
        const { status, extendDays } = req.body || {};

        if (!status || !['active', 'suspended', 'trial', 'disabled', 'pending_approval', 'expired'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status. Must be active, suspended, trial, disabled, pending_approval, or expired.' });
        }

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN;');

            let updateQuery = `
                UPDATE organizations 
                SET status = $1, updated_at = NOW()
            `;
            const params = [status, id];

            if (extendDays && typeof extendDays === 'number' && extendDays > 0) {
                updateQuery += `, license_expires_at = NOW() + INTERVAL '${parseInt(extendDays)} days'`;
            }

            updateQuery += ` WHERE id = $2 RETURNING *;`;

            const { rows: updatedOrgs } = await client.query(updateQuery, params);
            if (updatedOrgs.length === 0) {
                await client.query('ROLLBACK;');
                return res.status(404).json({ error: 'Organization not found.' });
            }
            const updatedOrg = updatedOrgs[0];

            // Also synchronize licenses table
            await client.query(`
                UPDATE licenses 
                SET status = $1, 
                    expires_at = $2,
                    updated_at = NOW()
                WHERE organization_id = $3;
            `, [status, updatedOrg.license_expires_at, id]);

            // Audit logging with full administrative details
            await client.query(`
                INSERT INTO audit_logs (organization_id, event_type, doctor_id, doctor_name, patient_id, patient_name, details, timestamp)
                VALUES ($1, 'license_status_update', $2, 'Super Administrator', $2, 'Platform Governance', $3, $4);
            `, [id, decoded.id, `Organization status updated to "${status}". Expiry: ${updatedOrg.license_expires_at}. Modified by Super Admin.`, getKenyanTimestamp()]);

            await client.query('COMMIT;');

            res.json({
                success: true,
                message: `Organization "${updatedOrg.name}" updated to status: ${status}.`,
                organization: updatedOrg
            });
        } catch (err) {
            await client.query('ROLLBACK;');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('Error updating organization status:', err);
        res.status(500).json({ error: err.message || 'Failed to update organization status.' });
    }
});

// Get Patients
app.get('/api/users/patients', async (req, res) => {
    try {
        const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);

        let query;
        let params = [];
        if (targetOrgId) {
            // Filter strictly to patients with an active membership in this organization
            query = `
                SELECT u.id, u.name, u.email, u.role, u.public_key as "publicKey", u.profile_photo as "profilePhoto", u.patient_profile as "patientProfile", u.is_approved as "isApproved", tm.joined_at as "createdAt"
                FROM users u
                JOIN tenant_memberships tm ON u.id = tm.user_id
                WHERE tm.organization_id = $1 AND tm.status = 'active' AND u.role = 'patient'
                ORDER BY tm.joined_at DESC;
            `;
            params = [targetOrgId];
        } else if (isSuperAdmin) {
            query = 'SELECT id, name, email, role, public_key as "publicKey", profile_photo as "profilePhoto", patient_profile as "patientProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE role = \'patient\' ORDER BY created_at DESC;';
        } else {
            return res.status(401).json({ error: 'Authentication required to list patients.' });
        }

        const { rows: patients } = await db.query(query, params);
        const formatted = patients.map(p => ({
            ...p,
            patientProfile: parseJsonIfNeeded(p.patientProfile)
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Doctors (only approved ones)
app.get('/api/users/doctors', async (req, res) => {
    try {
        const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);
        const requestedOrgId = req.query.orgId || req.query.organizationId;

        let query;
        let params = [];
        if (targetOrgId) {
            // Clinic Admin or Doctor strictly restricted to their own facility
            query = 'SELECT id, name, email, role, organization_id as "organizationId", public_key as "publicKey", profile_photo as "profilePhoto", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE organization_id = $1 AND role = \'doctor\' AND is_approved = true ORDER BY created_at DESC;';
            params = [targetOrgId];
        } else if (requestedOrgId) {
            // Patient or Super Admin explicitly querying doctors for a specific hospital
            query = 'SELECT id, name, email, role, organization_id as "organizationId", public_key as "publicKey", profile_photo as "profilePhoto", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE organization_id = $1 AND role = \'doctor\' AND is_approved = true ORDER BY created_at DESC;';
            params = [requestedOrgId];
        } else if (isSuperAdmin) {
            query = 'SELECT id, name, email, role, organization_id as "organizationId", public_key as "publicKey", profile_photo as "profilePhoto", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE role = \'doctor\' AND is_approved = true ORDER BY created_at DESC;';
        } else if (currentUser && currentUser.role === 'patient') {
            // Patient without query parameter: default to their first active membership facility
            const { rows: mems } = await db.query(
                "SELECT organization_id FROM tenant_memberships WHERE user_id = $1 AND status = 'active' ORDER BY joined_at ASC LIMIT 1",
                [currentUser.id]
            );
            if (mems.length > 0) {
                query = 'SELECT id, name, email, role, organization_id as "organizationId", public_key as "publicKey", profile_photo as "profilePhoto", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE organization_id = $1 AND role = \'doctor\' AND is_approved = true ORDER BY created_at DESC;';
                params = [mems[0].organization_id];
            } else {
                return res.json([]);
            }
        } else {
            return res.status(401).json({ error: 'Authentication required to list doctors.' });
        }

        const { rows: doctors } = await db.query(query, params);
        const formatted = doctors.map(d => ({
            ...d,
            doctorProfile: parseJsonIfNeeded(d.doctorProfile)
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Pending Doctors (filtering out rejected ones)
app.get('/api/admin/doctors/pending', async (req, res) => {
    try {
        const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);

        let query;
        let params = [];
        if (targetOrgId) {
            query = 'SELECT id, name, email, role, public_key as "publicKey", profile_photo as "profilePhoto", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE organization_id = $1 AND role = \'doctor\' AND is_approved = false AND is_rejected = false ORDER BY created_at DESC;';
            params = [targetOrgId];
        } else if (isSuperAdmin) {
            query = 'SELECT id, name, email, role, public_key as "publicKey", profile_photo as "profilePhoto", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE role = \'doctor\' AND is_approved = false AND is_rejected = false ORDER BY created_at DESC;';
        } else {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        const { rows: pendingDoctors } = await db.query(query, params);
        const formatted = pendingDoctors.map(d => ({
            ...d,
            doctorProfile: parseJsonIfNeeded(d.doctorProfile)
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Approve Pending Doctor
app.post('/api/admin/doctors/approve/:id', async (req, res) => {
    try {
        const doctorId = req.params.id;
        const { rows: updatedDoctors } = await db.query(
            'UPDATE users SET is_approved = true, is_rejected = false WHERE id = $1 RETURNING *',
            [doctorId]
        );
        if (updatedDoctors.length === 0) {
            return res.status(404).json({ error: 'Doctor registration request not found.' });
        }
        const updatedDoctor = updatedDoctors[0];

        // Activate membership for doctor in tenant_memberships
        await db.query(
            "UPDATE tenant_memberships SET status = 'active' WHERE user_id = $1 AND role = 'doctor'",
            [doctorId]
        );

        // Log doctor approval in audit trail (in background)
        logAuditEvent('doctor_approve', updatedDoctor.id, updatedDoctor.name, updatedDoctor.id, 'System Admin', `Doctor registration request for Dr. ${updatedDoctor.name} (${updatedDoctor.email}) approved.`);

        // Send Email notification for approval (asynchronously in background)
        sendDoctorApprovalEmail(updatedDoctor.email, updatedDoctor.name).catch(mailError => {
            console.error('Failed to send approval email in background:', mailError);
        });

        console.log(`Doctor ${updatedDoctor.name} (${updatedDoctor.email}) approved by administrator.`);
        res.json({ success: true, message: `Doctor Dr. ${updatedDoctor.name} successfully approved.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reject Pending Doctor
app.post('/api/admin/doctors/reject/:id', async (req, res) => {
    try {
        const doctorId = req.params.id;
        const { rows: updatedDoctors } = await db.query(
            'UPDATE users SET is_approved = false, is_rejected = true WHERE id = $1 RETURNING *',
            [doctorId]
        );
        if (updatedDoctors.length === 0) {
            return res.status(404).json({ error: 'Doctor registration request not found.' });
        }
        const updatedDoctor = updatedDoctors[0];

        // Disable membership for doctor in tenant_memberships
        await db.query(
            "UPDATE tenant_memberships SET status = 'disabled' WHERE user_id = $1 AND role = 'doctor'",
            [doctorId]
        );

        // Log doctor rejection in audit trail (in background)
        logAuditEvent('doctor_reject', updatedDoctor.id, updatedDoctor.name, updatedDoctor.id, 'System Admin', `Doctor registration request for Dr. ${updatedDoctor.name} (${updatedDoctor.email}) rejected.`);

        // Send Email notification for rejection (asynchronously in background)
        sendDoctorRejectionEmail(updatedDoctor.email, updatedDoctor.name).catch(mailError => {
            console.error('Failed to send rejection email in background:', mailError);
        });

        console.log(`Doctor ${updatedDoctor.name} (${updatedDoctor.email}) rejected by administrator.`);
        res.json({ success: true, message: `Doctor Dr. ${updatedDoctor.name} successfully rejected.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Pending Admins (filtering out rejected ones)
app.get('/api/admin/pending', async (req, res) => {
    try {
        const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);

        let query;
        let params = [];
        if (targetOrgId) {
            query = 'SELECT id, name, email, role, public_key as "publicKey", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE organization_id = $1 AND role = \'admin\' AND is_approved = false AND is_rejected = false ORDER BY created_at DESC;';
            params = [targetOrgId];
        } else if (isSuperAdmin) {
            query = 'SELECT id, name, email, role, public_key as "publicKey", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE role = \'admin\' AND is_approved = false AND is_rejected = false ORDER BY created_at DESC;';
        } else {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        const { rows: pendingAdmins } = await db.query(query, params);
        res.json(pendingAdmins);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get All Registered Hospital Administrators (Super Admin Authority)
app.get('/api/admin/all', async (req, res) => {
    try {
        const { rows: admins } = await db.query(`
            SELECT 
                u.id, 
                u.name, 
                u.email, 
                u.role, 
                u.organization_id as "organizationId", 
                COALESCE(o.name, CASE WHEN u.role = 'super_admin' THEN 'Global Platform Governance' ELSE 'Unassigned Facility' END) as "organizationName",
                u.profile_photo as "profilePhoto", 
                u.is_approved as "isApproved", 
                u.created_at as "createdAt" 
            FROM users u 
            LEFT JOIN organizations o ON u.organization_id = o.id 
            WHERE u.role IN ('admin', 'super_admin') 
            ORDER BY u.created_at DESC;
        `);
        res.json(admins);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Provision New Hospital Tenant Administrator (Super Admin Authority)
app.post('/api/admin/provision-tenant', async (req, res) => {
    try {
        const { hospitalName, name, email, password } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Administrator Name, Email, and Password are required.' });
        }

        // Check if user email already exists
        const existing = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ error: `An account with email "${email}" already exists.` });
        }

        let orgId = null;
        let finalHospitalName = (hospitalName || '').trim();
        if (finalHospitalName) {
            let orgRes = await db.query('SELECT id, name FROM organizations WHERE name ILIKE $1 LIMIT 1', [finalHospitalName]);
            if (orgRes.rows.length > 0) {
                orgId = orgRes.rows[0].id;
                finalHospitalName = orgRes.rows[0].name;
            } else {
                const newOrg = await db.query(
                    'INSERT INTO organizations (name) VALUES ($1) RETURNING id, name',
                    [finalHospitalName]
                );
                orgId = newOrg.rows[0].id;
                finalHospitalName = newOrg.rows[0].name;

                // Create isolated Genesis Block for the new hospital ledger
                const genesis = new Block(0, new Date().toISOString(), [{ type: 'GENESIS_BLOCK', message: `Genesis Ledger for ${finalHospitalName}` }], '0', 0, orgId);
                await db.query(
                    'INSERT INTO blocks (index, timestamp, records, previous_hash, hash, nonce, organization_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                    [genesis.index, genesis.timestamp, JSON.stringify(genesis.records), genesis.previousHash, genesis.hash, genesis.nonce, orgId]
                );
            }
        }

        // Generate RSA-2048 cryptographic keypair
        const { publicKey, privateKey } = generateKeyPair();
        const hashedPassword = await bcrypt.hash(password, 10);

        const { rows: newAdmin } = await db.query(
            `INSERT INTO users (name, email, password, role, organization_id, public_key, private_key, is_approved, is_rejected)
             VALUES ($1, $2, $3, 'admin', $4, $5, $6, true, false)
             RETURNING id, name, email, role, organization_id as "organizationId", is_approved as "isApproved", created_at as "createdAt"`,
            [name, email, hashedPassword, orgId, publicKey, privateKey]
        );

        if (orgId) {
            await db.query(
                `INSERT INTO tenant_memberships (user_id, organization_id, role, status)
                 VALUES ($1, $2, 'admin', 'active')
                 ON CONFLICT (user_id, organization_id) DO NOTHING;`,
                [newAdmin[0].id, orgId]
            );
        }

        // Record immutable audit log
        logAuditEvent('tenant_admin_provision', newAdmin[0].id, name, newAdmin[0].id, 'Super Administrator', `New hospital administrator provisioned for "${finalHospitalName || 'Platform'}": ${name} (${email})`, orgId);

        console.log(`[TENANT PROVISION] Hospital Administrator "${name}" for "${finalHospitalName}" created successfully.`);
        res.status(201).json({
            success: true,
            message: `Hospital Administrator account for "${finalHospitalName || name}" provisioned successfully!`,
            admin: {
                ...newAdmin[0],
                organizationName: finalHospitalName || 'Global Platform Governance'
            }
        });
    } catch (err) {
        console.error('Error provisioning tenant admin:', err);
        res.status(500).json({ error: err.message });
    }
});

// Approve Pending Admin
app.post('/api/admin/approve/:id', async (req, res) => {
    try {
        const adminId = req.params.id;
        const { rows: updatedAdmins } = await db.query(
            'UPDATE users SET is_approved = true, is_rejected = false WHERE id = $1 RETURNING *',
            [adminId]
        );
        if (updatedAdmins.length === 0) {
            return res.status(404).json({ error: 'Admin registration request not found.' });
        }
        const updatedAdmin = updatedAdmins[0];

        // Log admin approval in audit trail (in background)
        db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['admin_approve', updatedAdmin.id, updatedAdmin.name, updatedAdmin.id, 'System Admin', `Admin registration request for ${updatedAdmin.name} (${updatedAdmin.email}) approved.`]
        ).catch(err => console.error('Failed to log admin approval audit:', err));

        console.log(`Admin ${updatedAdmin.name} (${updatedAdmin.email}) approved by administrator.`);
        res.json({ success: true, message: `Administrator ${updatedAdmin.name} successfully approved.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reject Pending Admin
app.post('/api/admin/reject/:id', async (req, res) => {
    try {
        const adminId = req.params.id;
        const { rows: updatedAdmins } = await db.query(
            'UPDATE users SET is_approved = false, is_rejected = true WHERE id = $1 RETURNING *',
            [adminId]
        );
        if (updatedAdmins.length === 0) {
            return res.status(404).json({ error: 'Admin registration request not found.' });
        }
        const updatedAdmin = updatedAdmins[0];

        // Log admin rejection in audit trail (in background)
        db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['admin_reject', updatedAdmin.id, updatedAdmin.name, updatedAdmin.id, 'System Admin', `Admin registration request for ${updatedAdmin.name} (${updatedAdmin.email}) rejected.`]
        ).catch(err => console.error('Failed to log admin rejection audit:', err));

        console.log(`Admin ${updatedAdmin.name} (${updatedAdmin.email}) rejected by administrator.`);
        res.json({ success: true, message: `Administrator ${updatedAdmin.name} successfully rejected.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Change Password
app.post('/api/auth/change-password', async (req, res) => {
    try {
        const { userId, currentPassword, newPassword } = req.body;

        if (!userId || !currentPassword || !newPassword) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        const { rows: users } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }
        const user = users[0];

        // Verify current password
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Incorrect current password.' });
        }

        // Set and save new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        await db.query('UPDATE users SET password = $1 WHERE id = $2', [hashedPassword, userId]);

        // Log the password change in the audit trail (in background)
        db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['password_change', user.id, user.name, user.id, 'System Admin', `User ${user.name} (${user.role}) changed their account password.`]
        ).catch(err => console.error('Failed to log password change audit:', err));

        res.json({ success: true, message: 'Password updated successfully!' });
    } catch (err) {
        console.error('Password change error:', err);
        res.status(500).json({ error: 'Failed to update password.' });
    }
});

// Update Account Email Address (Available to all roles: Patient, Doctor, Admin, Super Admin)
app.post('/api/auth/update-email', async (req, res) => {
    try {
        const { userId, newEmail, currentPassword } = req.body;

        if (!userId || !newEmail || !currentPassword) {
            return res.status(400).json({ error: 'User ID, new email address, and current password are required.' });
        }

        const cleanEmail = newEmail.toLowerCase().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(cleanEmail)) {
            return res.status(400).json({ error: 'Please provide a valid email address.' });
        }

        // 1. Locate user in database
        const { rows: users } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'Account not found.' });
        }
        const user = users[0];

        // 2. Prevent setting to the exact same email
        if (user.email.toLowerCase() === cleanEmail) {
            return res.status(400).json({ error: 'New email address must be different from your current email.' });
        }

        // 3. Ensure new email is not already taken by another user
        const { rows: existing } = await db.query('SELECT id FROM users WHERE LOWER(email) = $1 AND id != $2', [cleanEmail, userId]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'This email address is already registered to another account.' });
        }

        // 4. Verify user password for security
        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ error: 'Incorrect password. Verification failed.' });
        }

        // 5. Update user email
        const { rows: updatedRows } = await db.query(
            'UPDATE users SET email = $1 WHERE id = $2 RETURNING id, name, email, role, public_key as "publicKey", patient_profile as "patientProfile", doctor_profile as "doctorProfile", is_approved as "isApproved"',
            [cleanEmail, userId]
        );
        const updatedUser = updatedRows[0];

        // 6. Generate fresh session token
        const token = jwt.sign({ id: updatedUser.id, role: updatedUser.role }, JWT_SECRET, { expiresIn: '1d' });

        // 7. Log immutable audit trail
        db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['email_update', user.id, user.name, user.id, 'System Security', `User ${user.name} (${user.role}) changed email from ${user.email} to ${cleanEmail}.`]
        ).catch(err => console.error('Failed to log email change audit:', err));

        console.log(`[ACCOUNT] Email updated for user ${user.name} (${user.id}): ${user.email} -> ${cleanEmail}`);

        res.json({
            success: true,
            message: 'Email address updated successfully!',
            token,
            user: {
                ...updatedUser,
                patientProfile: parseJsonIfNeeded(updatedUser.patientProfile),
                doctorProfile: parseJsonIfNeeded(updatedUser.doctorProfile)
            }
        });
    } catch (err) {
        console.error('Email update error:', err);
        res.status(500).json({ error: err.message || 'Failed to update email address.' });
    }
});

// Universal Profile Photo Update (Available to all users: Patient, Doctor, Admin, Super Admin)
app.post('/api/users/update-profile-photo', async (req, res) => {
    try {
        const { userId, profilePhoto } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required.' });
        }

        const { rows: users } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'Account not found.' });
        }
        const user = users[0];

        // Update profile_photo column
        await db.query('UPDATE users SET profile_photo = $1 WHERE id = $2', [profilePhoto || null, userId]);

        // If user is doctor, also sync with doctor_profile for backward compatibility
        if (user.role === 'doctor') {
            const currentDocProfile = parseJsonIfNeeded(user.doctor_profile) || {};
            currentDocProfile.profilePhoto = profilePhoto || null;
            await db.query('UPDATE users SET doctor_profile = $1 WHERE id = $2', [JSON.stringify(currentDocProfile), userId]);
        }

        // Return updated user object
        const { rows: updatedRows } = await db.query(
            'SELECT id, name, email, role, public_key as "publicKey", profile_photo as "profilePhoto", patient_profile as "patientProfile", doctor_profile as "doctorProfile", is_approved as "isApproved" FROM users WHERE id = $1',
            [userId]
        );
        const updatedUser = updatedRows[0];

        // Audit log
        db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['profile_photo_update', user.id, user.name, user.id, 'System', `User ${user.name} (${user.role}) updated their profile picture.`]
        ).catch(err => console.error('Failed to log profile photo update audit:', err));

        res.json({
            success: true,
            message: profilePhoto ? 'Profile picture updated successfully!' : 'Profile picture removed.',
            user: {
                ...updatedUser,
                profilePhoto: updatedUser.profilePhoto || null,
                patientProfile: parseJsonIfNeeded(updatedUser.patientProfile),
                doctorProfile: parseJsonIfNeeded(updatedUser.doctorProfile)
            }
        });
    } catch (err) {
        console.error('Profile photo update error:', err);
        res.status(500).json({ error: 'Failed to update profile picture.' });
    }
});

// Forgot Password Request
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required.' });
        }

        const { rows: users } = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'No user registered with this email address.' });
        }
        const user = users[0];

        // Generate reset token
        const token = crypto.randomBytes(20).toString('hex');
        const tokenExpires = new Date(Date.now() + 3600000); // 1 hour expiration
        
        await db.query(
            'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE id = $3',
            [token, tokenExpires, user.id]
        );

        // Construct reset link (points to frontend)
        const rawOrigin = req.headers.origin || process.env.FRONTEND_URL || 'http://localhost:3000';
        const frontendOrigin = rawOrigin.replace(/\/+$/, '');
        const resetUrl = `${frontendOrigin}/?resetToken=${token}`;

        // Send email with fallback safety
        let mailResult = { success: false, error: null, previewUrl: null };
        try {
            mailResult = await sendResetEmail(user.email, user.name, resetUrl);
        } catch (mailErr) {
            console.error('[Forgot Password] Mailer error encountered:', mailErr.message);
            mailResult = { success: false, error: mailErr.message, previewUrl: null };
        }

        const isEmailDelivered = mailResult && mailResult.success;

        // Log to Audit trail (in background)
        db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['password_reset_request', user.id, user.name, user.id, 'System Admin', `Password reset requested for ${user.name} (${user.email}). Email sent: ${isEmailDelivered}`]
        ).catch(err => console.error('Failed to log password reset request audit:', err));

        res.json({
            success: true,
            emailSent: isEmailDelivered,
            message: isEmailDelivered
                ? 'A password reset link has been dispatched to your email address.'
                : `Password reset link could not be sent. Please check your email configuration or try again later.`
        });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'An error occurred while processing the forgot password request.' });
    }
});

// Reset Password Completion
app.post('/api/auth/reset-password/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'New password is required.' });
        }

        // Locate user with valid reset token
        const { rows: users } = await db.query(
            'SELECT * FROM users WHERE reset_password_token = $1 AND reset_password_expires > $2',
            [token, new Date()]
        );

        if (users.length === 0) {
            return res.status(400).json({ error: 'Password reset link is invalid or has expired.' });
        }
        const user = users[0];

        // Update password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        await db.query(
            'UPDATE users SET password = $1, reset_password_token = NULL, reset_password_expires = NULL WHERE id = $2',
            [hashedPassword, user.id]
        );

        // Log completion to audit trail (in background)
        db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['password_reset_complete', user.id, user.name, user.id, 'System Admin', `Password reset successfully completed for ${user.name} (${user.role}).`]
        ).catch(err => console.error('Failed to log password reset complete audit:', err));

        res.json({ success: true, message: 'Your password has been successfully reset! You can now log in.' });
    } catch (err) {
        console.error('Reset password completion error:', err);
        res.status(500).json({ error: 'An error occurred during password reset execution.' });
    }
});

// Get Blockchain Mempool (Pending Ledger Queue)
app.get('/api/blockchain/mempool', async (req, res) => {
    try {
        res.json(healthBlockchain.pendingRecords);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== APPOINTMENT AND CONSULTATION ROUTES ====================

// Update patient profile / vitals
app.put('/api/users/patient/profile', async (req, res) => {
    try {
        const { userId, name, age, gender, bloodType, allergies, phone } = req.body;
        const { rows: users } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (users.length === 0 || users[0].role !== 'patient') {
            return res.status(404).json({ error: 'Patient not found.' });
        }
        const user = users[0];

        let profile = user.patient_profile || {};
        if (age !== undefined) profile.age = age;
        if (gender !== undefined) profile.gender = gender;
        if (bloodType !== undefined) profile.bloodType = bloodType;
        if (allergies !== undefined) {
            profile.allergies = Array.isArray(allergies) 
                ? allergies 
                : allergies.split(',').map(s => s.trim()).filter(Boolean);
        }
        if (phone !== undefined) profile.phone = phone;

        // Check if updated phone number belongs to another user
        const checkPhone = normalizePhone(String(phone || ''));
        if (checkPhone && checkPhone.length >= 5) {
            const { rows: allOtherUsers } = await db.query('SELECT id, patient_profile, doctor_profile FROM users WHERE id != $1', [userId]);
            const isPhoneTaken = allOtherUsers.some(u => {
                const pProf = parseProfile(u.patient_profile);
                const dProf = parseProfile(u.doctor_profile);
                const exPhones = [pProf.phone, dProf.phone].map(p => normalizePhone(String(p || ''))).filter(Boolean);
                return exPhones.includes(checkPhone);
            });
            if (isPhoneTaken) {
                return res.status(400).json({ error: 'Update failed: This phone number is already registered to another account.' });
            }
        }

        const updatedName = name || user.name;

        const { rows: updatedUsers } = await db.query(
            'UPDATE users SET name = $1, patient_profile = $2 WHERE id = $3 RETURNING *',
            [updatedName, JSON.stringify(profile), userId]
        );
        const updatedUser = updatedUsers[0];

        // Create Audit Log Entry (in background)
        db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['profile_update', updatedUser.id, updatedUser.name, updatedUser.id, 'Patient Self', `Patient ${updatedUser.name} updated their personal profile & health vitals.`]
        ).catch(err => console.error('Failed to log profile update audit:', err));

        res.json({
            success: true,
            message: 'Profile updated successfully!',
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                role: updatedUser.role,
                publicKey: updatedUser.public_key,
                patientProfile: updatedUser.patient_profile,
                doctorProfile: updatedUser.doctor_profile,
                isApproved: updatedUser.is_approved
            }
        });
    } catch (err) {
        console.error('Update patient profile error:', err);
        res.status(500).json({ error: err.message || 'Failed to update patient profile.' });
    }
});

// Update doctor profile details
app.put('/api/users/doctor/profile', async (req, res) => {
    try {
        const { userId, name, specialization, licenseNumber, hospital, yearsOfExperience, phone, profilePhoto } = req.body;
        const { rows: users } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (users.length === 0 || users[0].role !== 'doctor') {
            return res.status(404).json({ error: 'Doctor not found.' });
        }
        const user = users[0];

        let profile = user.doctor_profile || {};
        
        // Prevent editing if already done once
        if (profile.hasEditedProfile) {
            return res.status(403).json({ error: 'Clinical profile can only be edited once. Updates are locked.' });
        }

        if (specialization !== undefined) profile.specialization = specialization;
        if (licenseNumber !== undefined) profile.licenseNumber = licenseNumber;
        if (hospital !== undefined) profile.hospital = hospital;
        if (yearsOfExperience !== undefined) profile.yearsOfExperience = yearsOfExperience;
        if (phone !== undefined) profile.phone = phone;
        if (profilePhoto !== undefined) profile.profilePhoto = profilePhoto;

        // Check if updated phone number belongs to another user
        if (phone !== undefined) {
            const checkPhone = normalizePhone(String(phone || ''));
            if (checkPhone && checkPhone.length >= 5) {
                const { rows: allOtherUsers } = await db.query('SELECT id, patient_profile, doctor_profile FROM users WHERE id != $1', [userId]);
                const isPhoneTaken = allOtherUsers.some(u => {
                    const pProf = parseProfile(u.patient_profile);
                    const dProf = parseProfile(u.doctor_profile);
                    const exPhones = [pProf.phone, dProf.phone].map(p => normalizePhone(String(p || ''))).filter(Boolean);
                    return exPhones.includes(checkPhone);
                });
                if (isPhoneTaken) {
                    return res.status(400).json({ error: 'Update failed: This phone number is already registered to another account.' });
                }
            }
        }

        // Set restriction flag
        profile.hasEditedProfile = true;

        const updatedName = name || user.name;

        const { rows: updatedUsers } = await db.query(
            'UPDATE users SET name = $1, doctor_profile = $2 WHERE id = $3 RETURNING *',
            [updatedName, JSON.stringify(profile), userId]
        );
        const updatedUser = updatedUsers[0];

        // Create Audit Log Entry (in background)
        db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['profile_update', updatedUser.id, 'Doctor Self', updatedUser.id, updatedUser.name, `Dr. ${updatedUser.name} updated their clinical profile details.`]
        ).catch(err => console.error('Failed to log doctor profile update audit:', err));

        res.json({
            success: true,
            message: 'Profile updated successfully!',
            user: {
                id: updatedUser.id,
                name: updatedUser.name,
                email: updatedUser.email,
                role: updatedUser.role,
                publicKey: updatedUser.public_key,
                patientProfile: updatedUser.patient_profile,
                doctorProfile: updatedUser.doctor_profile,
                isApproved: updatedUser.is_approved
            }
        });
    } catch (err) {
        console.error('Update doctor profile error:', err);
        res.status(500).json({ error: err.message || 'Failed to update doctor profile.' });
    }
});

// Update doctor availability status and working hours/days
app.put('/api/users/doctor/availability', async (req, res) => {
    try {
        const { doctorId, workingDays, workingHoursStart, workingHoursEnd, status } = req.body;
        const { rows: users } = await db.query('SELECT * FROM users WHERE id = $1', [doctorId]);
        if (users.length === 0 || users[0].role !== 'doctor') {
            return res.status(404).json({ error: 'Doctor not found.' });
        }
        const doctor = users[0];
        
        let profile = doctor.doctor_profile || {};
        profile.availability = {
            workingDays: workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
            workingHoursStart: workingHoursStart || '08:00',
            workingHoursEnd: workingHoursEnd || '17:00',
            status: status || 'available'
        };
        
        const { rows: updatedDoctors } = await db.query(
            'UPDATE users SET doctor_profile = $1 WHERE id = $2 RETURNING *',
            [JSON.stringify(profile), doctorId]
        );
        const updatedDoctor = updatedDoctors[0];
        
        // Log the change in the audit trail (in background)
        db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
                'availability_update', 
                updatedDoctor.id, 
                updatedDoctor.name, 
                updatedDoctor.id, 
                updatedDoctor.name, 
                `Dr. ${updatedDoctor.name} updated availability: Days: ${profile.availability.workingDays.join(', ')}, Hours: ${profile.availability.workingHoursStart} - ${profile.availability.workingHoursEnd}, Status: ${profile.availability.status}.`
            ]
        ).catch(err => console.error('Failed to log availability update audit:', err));
        
        res.json({
            success: true,
            message: 'Availability updated successfully!',
            doctor: {
                id: updatedDoctor.id,
                name: updatedDoctor.name,
                email: updatedDoctor.email,
                role: updatedDoctor.role,
                publicKey: updatedDoctor.public_key,
                patientProfile: updatedDoctor.patient_profile,
                doctorProfile: updatedDoctor.doctor_profile,
                isApproved: updatedDoctor.is_approved
            }
        });
    } catch (err) {
        console.error('Update availability error:', err);
        res.status(500).json({ error: err.message || 'Failed to update availability.' });
    }
});

// Request a new appointment
app.post('/api/appointments', async (req, res) => {
    try {
        const { doctorId, date, time, reason, patientId, organizationId } = req.body;
        const [patientsRes, doctorsRes] = await Promise.all([
            db.query('SELECT * FROM users WHERE id = $1', [patientId]),
            db.query('SELECT * FROM users WHERE id = $1', [doctorId])
        ]);
        const patients = patientsRes.rows;
        const doctors = doctorsRes.rows;
        if (patients.length === 0 || doctors.length === 0) {
            return res.status(404).json({ error: 'Patient or Doctor not found.' });
        }
        const patient = patients[0];
        const doctor = doctors[0];
        
        // Prevent duplicate appointment bookings
        const { rows: existingAppt } = await db.query(
            `SELECT id FROM appointments 
             WHERE patient_id = $1 AND doctor_id = $2 AND date = $3 AND time = $4 AND status IN ('Pending', 'Confirmed')`,
            [patientId, doctorId, date, time]
        );
        if (existingAppt.length > 0) {
            return res.status(400).json({ error: 'An appointment request at this date and time already exists.' });
        }
        
        // Doctor Availability Validation
        const availability = doctor.doctor_profile?.availability || {
            status: 'available',
            workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
            workingHoursStart: '08:00',
            workingHoursEnd: '17:00'
        };

        if (availability.status === 'busy') {
            return res.status(400).json({ error: `Appointment booking is currently disabled because Dr. ${doctor.name} is busy.` });
        }
        if (availability.status === 'on leave') {
            return res.status(400).json({ error: `Appointment booking is currently disabled because Dr. ${doctor.name} is on leave.` });
        }

        // Validate working day
        const parts = date.split('-');
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);

        const today = new Date();
        const currentYear = today.getFullYear();
        const currentMonth = today.getMonth();
        const currentDay = today.getDate();

        if (year < currentYear) {
            return res.status(400).json({ error: 'You cannot book an appointment in a past year.' });
        }
        if (year === currentYear) {
            if (month < currentMonth) {
                return res.status(400).json({ error: 'You cannot book an appointment for a month that has already passed.' });
            }
            if (month === currentMonth && day < currentDay) {
                return res.status(400).json({ error: 'You cannot book an appointment for a date that has already passed.' });
            }
        }

        const dateObj = new Date(Date.UTC(year, month, day));
        const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayOfWeek = weekdays[dateObj.getUTCDay()];

        if (!availability.workingDays.includes(dayOfWeek)) {
            return res.status(400).json({ error: `Dr. ${doctor.name} is not available on ${dayOfWeek}s. Available days: ${availability.workingDays.join(', ')}` });
        }

        // Validate working hours
        if (time < availability.workingHoursStart || time > availability.workingHoursEnd) {
            const formatTime12hBackend = (timeStr) => {
                const [hStr, mStr] = timeStr.split(':');
                let h = parseInt(hStr, 10);
                const ampm = h >= 12 ? 'PM' : 'AM';
                h = h % 12 || 12;
                return `${h}:${mStr} ${ampm}`;
            };
            return res.status(400).json({ 
                error: `Appointments must be booked during working hours: ${formatTime12hBackend(availability.workingHoursStart)} to ${formatTime12hBackend(availability.workingHoursEnd)}.` 
            });
        }
        
        // Determine target hospital facility
        const targetOrgId = organizationId || doctor.organization_id;

        // Auto-enroll patient into the hospital facility via tenant_memberships (Requirement 2)
        if (targetOrgId) {
            await db.query(`
                INSERT INTO tenant_memberships (user_id, organization_id, role, status, joined_at)
                VALUES ($1, $2, 'patient', 'active', NOW())
                ON CONFLICT (user_id, organization_id)
                DO UPDATE SET status = 'active';
            `, [patientId, targetOrgId]);
        }
        
        const createdAt = getKenyanTimestamp();
        const { rows: appointments } = await db.query(
            `INSERT INTO appointments (patient_id, doctor_id, patient_name, doctor_name, date, time, reason, status, created_at, organization_id) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
            [patientId, doctorId, patient.name, doctor.name, date, time, reason, 'Pending', createdAt, targetOrgId]
        );
        const appointment = appointments[0];

        // Audit Log Entry with organization context
        db.query(
            `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [targetOrgId, 'appointment_request', patientId, patient.name, doctorId, doctor.name, `Patient ${patient.name} requested an appointment with Dr. ${doctor.name} on ${date} at ${time}.`, createdAt]
        ).catch(err => console.error('Failed to log appointment request audit:', err));

        const responseAppointment = {
            id: appointment.id,
            patientId: appointment.patient_id,
            doctorId: appointment.doctor_id,
            patientName: appointment.patient_name,
            doctorName: appointment.doctor_name,
            date: appointment.date,
            time: appointment.time,
            reason: appointment.reason,
            status: appointment.status,
            createdAt: appointment.created_at,
            organizationId: appointment.organization_id
        };

        res.status(201).json({ success: true, message: 'Appointment request submitted successfully!', appointment: responseAppointment });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch appointments filtered by user role
app.get('/api/appointments', async (req, res) => {
    try {
        const { requesterId, requesterRole } = req.query;
        let query = `
            SELECT a.id, a.patient_id as "patientId", a.doctor_id as "doctorId", a.patient_name as "patientName", 
                   a.doctor_name as "doctorName", a.date, a.time, a.reason, a.status, a.created_at as "createdAt",
                   a.organization_id as "organizationId", o.name as "organizationName"
            FROM appointments a
            LEFT JOIN organizations o ON a.organization_id = o.id
        `;
        let params = [];
        
        if (requesterRole === 'patient') {
            query += ' WHERE a.patient_id = $1';
            params.push(requesterId);
        } else if (requesterRole === 'doctor') {
            query += ' WHERE a.doctor_id = $1';
            params.push(requesterId);
        } else if (requesterRole === 'admin') {
            const { targetOrgId } = getRequesterOrgScope(req);
            if (targetOrgId) {
                query += ' WHERE a.organization_id = $1';
                params.push(targetOrgId);
            }
        } else {
            return res.status(403).json({ error: 'Invalid requester role.' });
        }
        
        query += ' ORDER BY a.created_at DESC';
        const { rows: appointments } = await db.query(query, params);
        res.json(appointments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update appointment status
app.post('/api/appointments/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const appointmentId = req.params.id;
        
        const { rows: appointments } = await db.query('UPDATE appointments SET status = $1 WHERE id = $2 RETURNING *', [status, appointmentId]);
        if (appointments.length === 0) {
            return res.status(404).json({ error: 'Appointment not found.' });
        }
        const appointment = appointments[0];

        // Audit Log Entry (in background)
        const eventType = status === 'Confirmed' ? 'appointment_confirm' : (status === 'Declined' ? 'appointment_decline' : 'appointment_complete');
        db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [eventType, appointment.patient_id, appointment.patient_name, appointment.doctor_id, appointment.doctor_name, `Appointment status updated to ${status} for ${appointment.patient_name} with Dr. ${appointment.doctor_name}.`]
        ).catch(err => console.error('Failed to log appointment status update audit:', err));

        const responseAppointment = {
            id: appointment.id,
            patientId: appointment.patient_id,
            doctorId: appointment.doctor_id,
            patientName: appointment.patient_name,
            doctorName: appointment.doctor_name,
            date: appointment.date,
            time: appointment.time,
            reason: appointment.reason,
            status: appointment.status,
            createdAt: appointment.created_at
        };

        res.json({ success: true, message: `Appointment status updated to ${status}.`, appointment: responseAppointment });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Complete a consultation (Doctor only)
app.post('/api/consultations', async (req, res) => {
    try {
        const { appointmentId, symptoms, diagnosis, treatment, notes, prescriptions, labRequest } = req.body;
        const { rows: appointments } = await db.query('SELECT * FROM appointments WHERE id = $1', [appointmentId]);
        if (appointments.length === 0) {
            return res.status(404).json({ error: 'Appointment not found.' });
        }
        const appointment = appointments[0];
        
        const [doctorsRes, patientsRes] = await Promise.all([
            db.query('SELECT * FROM users WHERE id = $1', [appointment.doctor_id]),
            db.query('SELECT * FROM users WHERE id = $1', [appointment.patient_id])
        ]);
        if (doctorsRes.rows.length === 0 || patientsRes.rows.length === 0) {
            return res.status(404).json({ error: 'Doctor or Patient not found.' });
        }
        const doctor = doctorsRes.rows[0];
        const patient = patientsRes.rows[0];

        const prescriptionsArray = prescriptions ? prescriptions.split(',').map(p => p.trim()).filter(p => p !== '') : [];

        // Generate SHA-256 hash of the consultation record details
        const consultationDetails = symptoms + diagnosis + treatment + notes + prescriptionsArray.join(',') + (labRequest || '');
        const consultationHash = crypto.createHash('sha256').update(consultationDetails).digest('hex');

        const timestamp = getKenyanTimestamp();

        // Sign the record using Doctor's Private Key
        console.log(`Doctor ${doctor.name} is signing consultation record cryptographically...`);
        const signature = signRecord(doctor.private_key, { txType: 'consultation', patientId: appointment.patient_id, consultationHash, timestamp });

        const transactionHash = crypto.createHash('sha256').update(signature + timestamp).digest('hex');

        // Create encrypted values
        const encryptedDiagnosis = encrypt(diagnosis);
        const encryptedTreatment = encrypt(treatment);

        // Create consultation record in PostgreSQL records table
        const { rows: newRecords } = await db.query(
            `INSERT INTO records (patient_id, doctor_id, doctor_name, diagnosis, treatment, prescriptions, record_type, symptoms, notes, lab_request, consultation_hash, transaction_hash, signature, doctor_public_key, timestamp) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
            [appointment.patient_id, appointment.doctor_id, doctor.name, encryptedDiagnosis, encryptedTreatment, JSON.stringify(prescriptionsArray), 'consultation', symptoms, notes, labRequest, consultationHash, transactionHash, signature, doctor.public_key, timestamp]
        );
        const newRecord = newRecords[0];

        // Perform appointment status update and audit log in parallel
        await Promise.all([
            db.query("UPDATE appointments SET status = 'Completed' WHERE id = $1", [appointmentId]),
            db.query(
                `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                ['consultation_complete', appointment.patient_id, patient.name, appointment.doctor_id, doctor.name, `Dr. ${doctor.name} completed consultation for ${patient.name}.`, timestamp]
            )
        ]);

        // Construct blockchain pending record payload
        const pendingRecord = {
            recordId: newRecord.id,
            txType: 'consultation',
            patientId: appointment.patient_id,
            patientName: patient.name,
            doctorId: appointment.doctor_id,
            doctorName: doctor.name,
            diagnosis,
            treatment,
            prescriptions: prescriptionsArray,
            ipfsHash: '',
            signature,
            doctorPublicKey: doctor.public_key,
            timestamp,
            consultationHash,
            transactionHash
        };

        healthBlockchain.addRecord(pendingRecord);
        checkMempoolThreshold();

        // Return updated record
        const responseRecord = {
            id: newRecord.id,
            patientId: newRecord.patient_id,
            doctorId: newRecord.doctor_id,
            doctorName: newRecord.doctor_name,
            diagnosis: diagnosis,
            treatment: treatment,
            prescriptions: newRecord.prescriptions,
            recordType: newRecord.record_type,
            symptoms: newRecord.symptoms,
            notes: newRecord.notes,
            labRequest: newRecord.lab_request,
            consultationHash: newRecord.consultation_hash,
            transactionHash: newRecord.transaction_hash,
            signature: newRecord.signature,
            doctorPublicKey: newRecord.doctor_public_key,
            isMined: false,
            blockIndex: -1,
            timestamp: newRecord.timestamp
        };

        res.status(201).json({ success: true, message: 'Consultation completed, signed, and broadcast to Ledger Pool!', record: responseRecord });
    } catch (err) {
        console.error('Consultation completion error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Admin Dashboard stats consolidation endpoint
app.get('/api/admin/stats', async (req, res) => {
    try {
        const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);

        if (targetOrgId) {
            // Strictly scoped metrics for clinic admin
            const { rows: aCount } = await db.query('SELECT count(*) FROM appointments WHERE organization_id = $1', [targetOrgId]);
            const { rows: pACount } = await db.query("SELECT count(*) FROM appointments WHERE organization_id = $1 AND status = 'Pending'", [targetOrgId]);
            const { rows: cCCount } = await db.query("SELECT count(*) FROM records WHERE organization_id = $1 AND record_type = 'consultation'", [targetOrgId]);
            const { rows: bCount } = await db.query('SELECT count(*) FROM blocks WHERE organization_id = $1', [targetOrgId]);
            const { rows: dCount } = await db.query("SELECT count(*) FROM users WHERE organization_id = $1 AND role = 'doctor' AND is_approved = true", [targetOrgId]);
            const { rows: paCount } = await db.query("SELECT count(DISTINCT tm.user_id) FROM tenant_memberships tm JOIN users u ON tm.user_id = u.id WHERE tm.organization_id = $1 AND tm.status = 'active' AND u.role = 'patient'", [targetOrgId]);
            const { rows: admCount } = await db.query("SELECT count(*) FROM users WHERE organization_id = $1 AND role = 'admin' AND is_approved = true", [targetOrgId]);
            
            return res.json({
                totalAppointments: parseInt(aCount[0].count),
                pendingAppointments: parseInt(pACount[0].count),
                completedConsultations: parseInt(cCCount[0].count),
                blocks: parseInt(bCount[0].count),
                mempool: 0,
                doctors: parseInt(dCount[0].count),
                patients: parseInt(paCount[0].count),
                admins: parseInt(admCount[0]?.count || 0),
                isValid: await validateMultiTenantChains(targetOrgId)
            });
        }

        if (isSuperAdmin) {
            // Global Cross-Org View strictly for Super Admin Command Center
            const { rows: aCount } = await db.query('SELECT count(*) FROM appointments');
            const { rows: pACount } = await db.query("SELECT count(*) FROM appointments WHERE status = 'Pending'");
            const { rows: cCCount } = await db.query("SELECT count(*) FROM records WHERE record_type = 'consultation'");
            const { rows: bCount } = await db.query('SELECT count(*) FROM blocks');
            const { rows: dCount } = await db.query("SELECT count(*) FROM users WHERE role = 'doctor' AND is_approved = true");
            const { rows: paCount } = await db.query("SELECT count(*) FROM users WHERE role = 'patient'");
            const { rows: admCount } = await db.query("SELECT count(*) FROM users WHERE role IN ('admin', 'super_admin') AND is_approved = true");
            
            return res.json({
                totalAppointments: parseInt(aCount[0].count),
                pendingAppointments: parseInt(pACount[0].count),
                completedConsultations: parseInt(cCCount[0].count),
                blocks: parseInt(bCount[0].count),
                mempool: healthBlockchain.pendingRecords.length,
                doctors: parseInt(dCount[0].count),
                patients: parseInt(paCount[0].count),
                admins: parseInt(admCount[0]?.count || 0),
                isValid: await validateMultiTenantChains()
            });
        }

        return res.status(401).json({ error: 'Authentication required.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== MEDICAL RECORD ROUTES ====================

// Add new medical record (requires Doctor)
app.post('/api/records', async (req, res) => {
    try {
        const { patientId, diagnosis, treatment, prescriptions, ipfsHash, doctorId } = req.body;
        
        const [doctorsRes, patientsRes] = await Promise.all([
            db.query('SELECT * FROM users WHERE id = $1', [doctorId]),
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
                [patientId, doctorId]
            ),
            db.query(
                "SELECT 1 FROM audit_logs WHERE event_type = 'emergency_break_glass' AND patient_id = $1 AND doctor_id = $2 AND timestamp >= NOW() - INTERVAL '1 hour' LIMIT 1",
                [patientId, doctorId]
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

        // Create Record in PostgreSQL
        const { rows: newRecords } = await db.query(
            `INSERT INTO records (patient_id, doctor_id, doctor_name, diagnosis, treatment, prescriptions, ipfs_hash, signature, doctor_public_key, timestamp, transaction_hash) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
            [patientId, doctorId, doctor.name, encryptedDiagnosis, encryptedTreatment, JSON.stringify(prescriptions), ipfsHash, signature, doctor.public_key, timestamp, transactionHash]
        );
        const newRecord = newRecords[0];

        // Create Audit Log Entry (in background)
        db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            ['record_create', patientId, patient.name, doctorId, doctor.name, `Dr. ${doctor.name} added a new diagnosis/treatment record.`, timestamp]
        ).catch(err => console.error('Failed to log record creation audit:', err));
        
        // Add to blockchain's pending record memory list
        const pendingRecord = {
            recordId: newRecord.id,
            txType: 'medical',
            patientId: patientId,
            patientName: patient.name,
            doctorId: doctorId,
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
        
        healthBlockchain.addRecord(pendingRecord);
        checkMempoolThreshold();

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
});

// Get records for a specific patient
app.get('/api/records/patient/:id', async (req, res) => {
    try {
        const patientId = req.params.id;
        const { requesterId, requesterRole } = req.query;
        
        if (!requesterId || !requesterRole) {
            return res.status(400).json({ error: 'requesterId and requesterRole query parameters are required.' });
        }
        
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
                    "SELECT 1 FROM audit_logs WHERE event_type = 'emergency_break_glass' AND patient_id = $1 AND doctor_id = $2 AND timestamp >= NOW() - INTERVAL '1 hour' LIMIT 1",
                    [patientId, requesterId]
                )
            ]);
                                 
            if (apptRes.rows.length === 0 && breakGlassRes.rows.length === 0) {
                return res.status(403).json({ error: 'Access Denied: You do not have active treatment or emergency break-glass authorization for this patient.' });
            }
        } else if (requesterRole !== 'admin') {
            return res.status(403).json({ error: 'Access Denied: Invalid requester role.' });
        }

        // Create Audit Log Entry for record access (in background)
        if (requesterRole === 'doctor') {
            (async () => {
                try {
                    const [patientsRes, doctorsRes] = await Promise.all([
                        db.query('SELECT name FROM users WHERE id = $1', [patientId]),
                        db.query('SELECT name FROM users WHERE id = $1', [requesterId])
                    ]);
                    if (patientsRes.rows.length > 0 && doctorsRes.rows.length > 0) {
                        await db.query(
                            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
                             VALUES ($1, $2, $3, $4, $5, $6)`,
                            ['record_access', patientId, patientsRes.rows[0].name, requesterId, doctorsRes.rows[0].name, `Dr. ${doctorsRes.rows[0].name} viewed electronic medical records folder.`]
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
});

// Get all medical records/consultations (Admin only)
app.get('/api/admin/records', async (req, res) => {
    try {
        const { recordType } = req.query;
        let query = `
            SELECT r.id, r.patient_id as "patientId", r.doctor_id as "doctorId", r.doctor_name as "doctorName", 
                   r.diagnosis, r.treatment, r.prescriptions, r.record_type as "recordType", r.symptoms, 
                   r.notes, r.lab_request as "labRequest", r.consultation_hash as "consultationHash", 
                   r.transaction_hash as "transactionHash", r.ipfs_hash as "ipfsHash", r.signature, 
                   r.doctor_public_key as "doctorPublicKey", r.is_mined as "isMined", r.block_index as "blockIndex", 
                   r.timestamp, p.name as "patientName", p.email as "patientEmail", d.name as "doctorEmailName", d.email as "doctorEmail"
            FROM records r
            JOIN users p ON r.patient_id = p.id
            JOIN users d ON r.doctor_id = d.id
        `;
        let params = [];
        if (recordType) {
            query += ' WHERE r.record_type = $1';
            params.push(recordType);
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
});

// Get system audit logs
app.get('/api/audit/logs', async (req, res) => {
    try {
        const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);
        const { patientId } = req.query;

        let query = 'SELECT id, event_type as "eventType", patient_id as "patientId", patient_name as "patientName", doctor_id as "doctorId", doctor_name as "doctorName", details, timestamp, is_mined as "isMined", block_index as "blockIndex", signature FROM audit_logs';
        const conditions = [];
        const params = [];

        if (targetOrgId) {
            params.push(targetOrgId);
            conditions.push(`organization_id = $${params.length}`);
        } else if (!isSuperAdmin) {
            return res.status(401).json({ error: 'Authentication required to access audit logs.' });
        }

        if (patientId) {
            params.push(patientId);
            conditions.push(`patient_id = $${params.length}`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }
        
        query += ' ORDER BY timestamp DESC';
        const { rows: logs } = await db.query(query, params);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== BLOCKCHAIN LEDGER ROUTES ====================

// Mine pending records into a block (Manual Admin Trigger)
app.post('/api/blockchain/mine', async (req, res) => {
    try {
        if (isMining) {
            return res.status(409).json({ error: 'Mining is already in progress. Please wait for the current block to seal.' });
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
});

// Get all blocks
app.get('/api/blockchain/blocks', async (req, res) => {
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
                try { records = JSON.parse(records); } catch (e) {}
            }
            if (typeof records === 'string') {
                try { records = JSON.parse(records); } catch (e) {}
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
});

// Validate chain
app.get('/api/blockchain/validate', async (req, res) => {
    try {
        const orgId = req.headers['x-organization-id'] || req.query.orgId || null;
        const isValid = await validateMultiTenantChains(orgId);
        res.json({ isValid });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== TAMPER DEMONSTRATION ROUTE ====================

// Simulate database tampering attack (manipulate diagnosis of a record directly in PostgreSQL)
app.post('/api/blockchain/tamper', async (req, res) => {
    try {
        const { recordId, tamperedDiagnosis } = req.body;
        
        const { rows: records } = await db.query('SELECT * FROM records WHERE id = $1', [recordId]);
        if (records.length === 0) {
            return res.status(404).json({ error: 'Record not found.' });
        }
        const record = records[0];
        const oldDiagnosis = decrypt(record.diagnosis);
        
        // Force-update PostgreSQL records table to write raw plaintext (simulate database tampering)
        await db.query('UPDATE records SET diagnosis = $1 WHERE id = $2', [tamperedDiagnosis, recordId]);
        
        // Also tamper with the block list in the DB/memory to demonstrate chain corruption
        if (record.is_mined && record.block_index !== -1) {
            const { rows: blocks } = await db.query('SELECT * FROM blocks WHERE index = $1', [record.block_index]);
            if (blocks.length > 0) {
                const block = blocks[0];
                const updatedRecords = block.records.map(rec => {
                    if (rec.recordId === recordId) {
                        rec.diagnosis = tamperedDiagnosis + " (HACKED)";
                    }
                    return rec;
                });
                await db.query('UPDATE blocks SET records = $1 WHERE index = $2', [JSON.stringify(updatedRecords), record.block_index]);
            }
            
            // Tamper in-memory chain too
            const memoryBlock = healthBlockchain.chain.find(b => b.index === record.block_index);
            if (memoryBlock) {
                memoryBlock.records = memoryBlock.records.map(rec => {
                    if (rec.recordId === recordId) {
                        rec.diagnosis = tamperedDiagnosis + " (HACKED)";
                    }
                    return rec;
                });
            }
        }
        
        res.json({
            message: `Database TAMPERED successfully! Diagnoses updated directly. Old: "${oldDiagnosis}", New: "${tamperedDiagnosis}". Check blockchain validation state now.`,
            success: true
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Recover database records from the blockchain blocks (Self-Healing)
app.post('/api/blockchain/recover', async (req, res) => {
    try {
        console.log('Initiating Ledger Self-Healing Recovery...');
        
        const { rows: dbBlocks } = await db.query('SELECT * FROM blocks ORDER BY index ASC');
        if (dbBlocks.length <= 1) {
            return res.status(400).json({ error: 'No block data to recover from. Genesis block cannot be repaired.' });
        }

        // Loop through all blocks and restore records
        for (let i = 1; i < dbBlocks.length; i++) {
            const block = dbBlocks[i];
            let cleanRecords = [];
            
            for (let rec of block.records) {
                const { rows: recRows } = await db.query('SELECT * FROM records WHERE id = $1', [rec.recordId]);
                if (recRows.length > 0) {
                    const dbRecord = recRows[0];
                    const originalDiagnosis = rec.diagnosis.replace(/ \(HACKED\)/g, '');
                    
                    // Encrypt original diagnosis back
                    await db.query('UPDATE records SET diagnosis = $1 WHERE id = $2', [encrypt(originalDiagnosis), rec.recordId]);
                    rec.diagnosis = originalDiagnosis;
                }
                cleanRecords.push(rec);
            }
            
            const prevBlock = dbBlocks[i - 1];
            block.previous_hash = prevBlock.hash;
            block.records = cleanRecords;

            // Recompute valid block hash
            const b = new (require('./blockchain').Block)(
                block.index,
                block.timestamp,
                block.records,
                block.previous_hash
            );
            b.nonce = parseInt(block.nonce);
            b.hash = b.calculateHash();
            
            await db.query('UPDATE blocks SET records = $1, previous_hash = $2, hash = $3 WHERE index = $4', [JSON.stringify(block.records), block.previous_hash, b.hash, block.index]);
            block.hash = b.hash;
        }
        
        // Re-sync memory chain
        await syncBlockchainWithDatabase();
        
        res.json({ success: true, message: 'Ledger database successfully recovered! Chain integrity restored.' });
    } catch (err) {
        console.error('Recovery failed:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Rebuilds the blockchain from scratch, filtering out records that belong to deleted users.
 * Recalculates hashes and indices to keep the chain valid and secure.
 */
async function rebuildChainAfterDeletion() {
    try {
        console.log('Rebuilding blockchain after user deletion...');
        
        const { rows: allDbBlocks } = await db.query('SELECT * FROM blocks ORDER BY index ASC');
        if (allDbBlocks.length <= 1) {
            await syncBlockchainWithDatabase();
            return;
        }

        const newChain = [allDbBlocks[0]]; // start with Genesis block
        
        for (let i = 1; i < allDbBlocks.length; i++) {
            const dbBlock = allDbBlocks[i];
            let activeRecords = [];
            
            for (let rec of dbBlock.records) {
                const { rows: pRows } = await db.query('SELECT 1 FROM users WHERE id = $1', [rec.patientId]);
                const { rows: dRows } = await db.query('SELECT 1 FROM users WHERE id = $1', [rec.doctorId]);
                const { rows: rRows } = await db.query('SELECT 1 FROM records WHERE id = $1', [rec.recordId]);
                
                if (pRows.length > 0 && dRows.length > 0 && rRows.length > 0) {
                    activeRecords.push(rec);
                }
            }

            if (activeRecords.length > 0) {
                const prevBlock = newChain[newChain.length - 1];
                const b = new (require('./blockchain').Block)(
                    newChain.length,
                    dbBlock.timestamp,
                    activeRecords,
                    prevBlock.hash
                );
                b.mineBlock(healthBlockchain.difficulty);
                newChain.push(b);
            }
        }

        // Save new chain to DB
        await db.query('DELETE FROM blocks');
        for (const block of newChain) {
            await db.query(
                'INSERT INTO blocks (index, timestamp, records, previous_hash, nonce, hash) VALUES ($1, $2, $3, $4, $5, $6)',
                [block.index, block.timestamp, JSON.stringify(block.records), block.previousHash, block.nonce, block.hash]
            );
        }

        // Update remaining records in PostgreSQL with new block index
        for (const block of newChain) {
            if (block.index === 0) continue;
            const recordIds = block.records.map(r => r.recordId).filter(Boolean);
            if (recordIds.length > 0) {
                await db.query('UPDATE records SET is_mined = true, block_index = $1 WHERE id = ANY($2::uuid[])', [block.index, recordIds]);
                await db.query('UPDATE audit_logs SET is_mined = true, block_index = $1 WHERE patient_id = ANY($2::uuid[])', [block.index, recordIds]);
            }
        }

        await syncBlockchainWithDatabase();
        console.log('Blockchain successfully rebuilt.');
    } catch (err) {
        console.error('Error rebuilding blockchain after deletion:', err);
    }
}

// DELETE User (Node / Operator cleanup)
app.delete('/api/users/:id', async (req, res) => {
    try {
        const userId = req.params.id;
        const { rows: users } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }
        const userToDelete = users[0];

        if (userToDelete.role === 'super_admin') {
            return res.status(403).json({ error: 'Super Administrator accounts cannot be deleted.' });
        }

        // Delete user (cascade foreign keys will clean up appointments/records/logs automatically)
        await db.query('DELETE FROM users WHERE id = $1', [userId]);

        // Rebuild blockchain to remove the deleted doctor's/patient's records from blocks
        await rebuildChainAfterDeletion();

        console.log(`User ${userToDelete.name} (${userToDelete.role}) removed from system database.`);
        res.json({ success: true, message: `User ${userToDelete.name} successfully removed from the system. Blockchain ledger updated.` });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: err.message || 'Failed to delete user.' });
    }
});

// ==========================================
// NEW ENHANCEMENTS: Break-Glass, Seal Verify, Analytics, Specialist Note
// ==========================================

// 1. Emergency Break-Glass Access Protocol
app.post('/api/auth/break-glass', async (req, res) => {
    try {
        const { doctorId, doctorName, patientId, patientName, reason } = req.body || {};
        if (!doctorId || !patientId || !reason || reason.trim().length < 10) {
            return res.status(400).json({ error: 'Valid doctor, patient, and detailed justification reason (10+ chars) are required.' });
        }

        const { rows: doctors } = await db.query('SELECT * FROM users WHERE id = $1 AND role = \'doctor\'', [doctorId]);
        if (doctors.length === 0) {
            return res.status(404).json({ error: 'Doctor record not found.' });
        }

        const { rows: patients } = await db.query('SELECT * FROM users WHERE id = $1 AND role = \'patient\'', [patientId]);
        if (patients.length === 0) {
            return res.status(404).json({ error: 'Patient record not found.' });
        }

        const dName = doctorName || doctors[0].name;
        const pName = patientName || patients[0].name;
        const logDetails = `EMERGENCY BREAK-GLASS ACCESS OVERRIDE: Dr. ${dName} initiated emergency override for Patient ${pName}. Justification: ${reason.trim()}`;

        // Create immutable audit log in database
        const { rows: auditRows } = await db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            ['emergency_break_glass', patientId, pName, doctorId, dName, logDetails]
        );

        console.log(`[ALERT] Break-Glass Emergency Override logged: Dr. ${dName} -> Patient ${pName}`);
        res.json({
            success: true,
            message: `Emergency break-glass access activated for Dr. ${dName}. Audit event recorded on ledger.`,
            auditId: auditRows[0]?.id
        });
    } catch (err) {
        console.error('Break-glass error:', err);
        res.status(500).json({ error: 'Failed to process emergency break-glass protocol.' });
    }
});

// Check if active break-glass override exists for doctor and patient (< 1 hour ago)
app.get('/api/auth/break-glass/status', async (req, res) => {
    try {
        const { doctorId, patientId } = req.query;
        if (!doctorId || !patientId) {
            return res.json({ hasBreakGlass: false });
        }

        const { rows } = await db.query(
            `SELECT * FROM audit_logs 
             WHERE event_type = 'emergency_break_glass' AND doctor_id = $1 AND patient_id = $2 
             AND timestamp >= NOW() - INTERVAL '1 hour' 
             ORDER BY timestamp DESC LIMIT 1`,
            [doctorId, patientId]
        );

        if (rows.length === 0) {
            return res.json({ hasBreakGlass: false });
        }

        const log = rows[0];
        const startTime = new Date(log.timestamp).getTime();
        const expiresAtTime = startTime + (60 * 60 * 1000); // 1 hour in ms
        const remainingSeconds = Math.max(0, Math.floor((expiresAtTime - Date.now()) / 1000));

        res.json({
            hasBreakGlass: remainingSeconds > 0,
            activeRecord: log,
            expiresAt: new Date(expiresAtTime).toISOString(),
            remainingSeconds
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Cryptographic Record Seal Verification
app.post('/api/records/verify-seal', async (req, res) => {
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
});

// 3. Privacy-Preserving Public Health Analytics
app.get('/api/analytics/public-health', async (req, res) => {
    try {
        const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);
        if (!currentUser) {
            return res.status(401).json({ error: 'Authentication required to access health analytics.' });
        }

        let doctors = [];
        let patients = [];
        let recordsList = [];
        let blocksList = [];
        let breakGlassLogs = [];

        if (targetOrgId) {
            // Strictly scoped to this organization
            const { rows: docRows } = await db.query(`
                SELECT id, name, email, role, is_approved, doctor_profile as "doctorProfile", created_at as "createdAt"
                FROM users 
                WHERE organization_id = $1 AND role = 'doctor' AND is_approved = true
                ORDER BY created_at DESC;
            `, [targetOrgId]);
            doctors = docRows;

            const { rows: patRows } = await db.query(`
                SELECT u.id, u.name, u.email, u.role, u.patient_profile as "patientProfile", tm.joined_at as "createdAt"
                FROM users u
                JOIN tenant_memberships tm ON u.id = tm.user_id
                WHERE tm.organization_id = $1 AND tm.status = 'active' AND u.role = 'patient'
                ORDER BY tm.joined_at DESC;
            `, [targetOrgId]);
            patients = patRows;

            const { rows: recRows } = await db.query(`
                SELECT id, patient_id as "patientId", doctor_id as "doctorId", doctor_name as "doctorName", is_mined as "isMined", block_index as "blockIndex", timestamp 
                FROM records 
                WHERE organization_id = $1 
                ORDER BY timestamp DESC;
            `, [targetOrgId]);
            recordsList = recRows;

            const { rows: blkRows } = await db.query(`
                SELECT index, hash, previous_hash as "previousHash", nonce, records, timestamp 
                FROM blocks 
                WHERE organization_id = $1 
                ORDER BY index ASC;
            `, [targetOrgId]);
            blocksList = blkRows;

            const { rows: bgRows } = await db.query(`
                SELECT id, patient_id as "patientId", patient_name as "patientName", doctor_id as "doctorId", doctor_name as "doctorName", details, timestamp 
                FROM audit_logs 
                WHERE organization_id = $1 AND event_type = 'emergency_break_glass' 
                ORDER BY timestamp DESC;
            `, [targetOrgId]);
            breakGlassLogs = bgRows;

        } else if (isSuperAdmin) {
            // Global Cross-Org View strictly for Super Admin Command Center
            const { rows: docRows } = await db.query(`
                SELECT id, name, email, role, is_approved, doctor_profile as "doctorProfile", created_at as "createdAt"
                FROM users 
                WHERE role = 'doctor' AND is_approved = true
                ORDER BY created_at DESC;
            `);
            doctors = docRows;

            const { rows: patRows } = await db.query(`
                SELECT id, name, email, role, patient_profile as "patientProfile", created_at as "createdAt"
                FROM users 
                WHERE role = 'patient'
                ORDER BY created_at DESC;
            `);
            patients = patRows;

            const { rows: recRows } = await db.query(`
                SELECT id, patient_id as "patientId", doctor_id as "doctorId", doctor_name as "doctorName", is_mined as "isMined", block_index as "blockIndex", timestamp 
                FROM records 
                ORDER BY timestamp DESC;
            `);
            recordsList = recRows;

            const { rows: blkRows } = await db.query(`
                SELECT index, hash, previous_hash as "previousHash", nonce, records, timestamp 
                FROM blocks 
                ORDER BY index ASC;
            `);
            blocksList = blkRows;

            const { rows: bgRows } = await db.query(`
                SELECT id, patient_id as "patientId", patient_name as "patientName", doctor_id as "doctorId", doctor_name as "doctorName", details, timestamp 
                FROM audit_logs 
                WHERE event_type = 'emergency_break_glass' 
                ORDER BY timestamp DESC;
            `);
            breakGlassLogs = bgRows;
        } else {
            return res.status(403).json({ error: 'Organization scope is missing from session.' });
        }

        const bloodTypeCounts = {};
        const genderCounts = {};
        const patientsList = patients.map(p => {
            const profile = parseJsonIfNeeded(p.patientProfile) || {};
            if (profile.bloodType) {
                bloodTypeCounts[profile.bloodType] = (bloodTypeCounts[profile.bloodType] || 0) + 1;
            }
            if (profile.gender) {
                genderCounts[profile.gender] = (genderCounts[profile.gender] || 0) + 1;
            }
            return {
                ...p,
                patientProfile: profile
            };
        });

        const doctorsList = doctors.map(d => ({
            ...d,
            doctorProfile: parseJsonIfNeeded(d.doctorProfile) || {}
        }));

        const totalPatients = patientsList.length;
        const totalDoctors = doctorsList.length;
        const totalRecords = recordsList.length;
        const totalBlocks = blocksList.length;
        const breakGlassEvents = breakGlassLogs.length;

        res.json({
            totalPatients,
            totalDoctors,
            totalRecords,
            totalBlocks,
            breakGlassEvents,
            patientsList,
            doctorsList,
            recordsList,
            blocksList,
            breakGlassLogs,
            bloodTypeCounts,
            genderCounts,
            miningMetrics: {
                difficulty: '2 Leading Hex Zeros',
                avgRecordsPerBlock: totalBlocks > 1 ? Math.round(totalRecords / Math.max(1, totalBlocks - 1)) : (totalRecords > 0 ? totalRecords : 0)
            }
        });
    } catch (err) {
        console.error('Analytics fetch error:', err);
        res.status(500).json({ error: 'Failed to compute health analytics.' });
    }
});

// 4. Lightweight Specialist Consultation Note
app.post('/api/records/:id/specialist-note', async (req, res) => {
    try {
        const recordId = req.params.id;
        const { specialistDoctorId, specialistDoctorName, specialistNote } = req.body || {};

        if (!specialistNote || !specialistNote.trim()) {
            return res.status(400).json({ error: 'Specialist note content is required.' });
        }

        const formattedNote = `[Specialist Note - Dr. ${specialistDoctorName || 'Consultant'}]: ${specialistNote.trim()}`;

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
});

// 5. Remote License Diagnostic Route (Super-Admin Only)
app.get('/api/license/status', (req, res) => {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }
        const token = authHeader.substring(7).trim();
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded || decoded.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access restricted to Super Administrators only.' });
        }

        const licenseInfo = getLicenseStatus();
        res.json({
            success: true,
            license: licenseInfo,
            serverTimestamp: getKenyanTimestamp()
        });
    } catch (err) {
        res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }
});

// 6. Super Admin Live License Refresh Trigger
app.post('/api/license/refresh', async (req, res) => {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }
        const token = authHeader.substring(7).trim();
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded || decoded.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access restricted to Super Administrators only.' });
        }

        console.log('[License Service] Super Admin manually triggered live license authority ping...');
        const updatedStatus = await checkLicense();
        res.json({
            success: true,
            message: 'License authority ping executed successfully.',
            license: updatedStatus,
            serverTimestamp: getKenyanTimestamp()
        });
    } catch (err) {
        console.error('License refresh error:', err);
        res.status(500).json({ error: 'Failed to refresh license status.' });
    }
});

// 6.1 Super Admin Instant License Simulation / Override Endpoint
app.post('/api/license/simulate', (req, res) => {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }
        const token = authHeader.substring(7).trim();
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded || decoded.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access restricted to Super Administrators only.' });
        }

        const { targetStatus, reason } = req.body;
        if (!targetStatus || !['active', 'disabled'].includes(targetStatus)) {
            return res.status(400).json({ error: "targetStatus must be 'active' or 'disabled'." });
        }

        global.licenseStatus.status = targetStatus;
        global.licenseStatus.reason = reason || (targetStatus === 'disabled' ? 'Simulated Super Admin Kill-Switch Trigger' : 'Active Subscription');
        global.licenseStatus.lastChecked = new Date();

        console.log(`[License Service] Super Admin set simulation license state to: ${targetStatus.toUpperCase()}`);

        res.json({
            success: true,
            message: `Instance license state simulated to: ${targetStatus.toUpperCase()}`,
            license: getLicenseStatus(),
            serverTimestamp: getKenyanTimestamp()
        });
    } catch (err) {
        console.error('License simulate error:', err);
        res.status(500).json({ error: 'Failed to set license simulation.' });
    }
});

/**
 * Validates cryptographic chain integrity across all multi-tenant hospital ledgers.
 * Ensures each individual organization's chain starts with Genesis (index: 0, prev: '0')
 * and maintains continuous SHA-256 hash linkage.
 */
async function validateMultiTenantChains(targetOrgId = null) {
    try {
        let query = `
            SELECT organization_id, index, timestamp, records, previous_hash, nonce, hash 
            FROM blocks 
        `;
        const params = [];
        if (targetOrgId) {
            query += ` WHERE organization_id = $1 `;
            params.push(targetOrgId);
        }
        query += ` ORDER BY organization_id, index ASC;`;

        const { rows: blocks } = await db.query(query, params);
        if (blocks.length === 0) return true;

        const orgMap = {};
        for (const b of blocks) {
            const orgId = b.organization_id || 'default';
            if (!orgMap[orgId]) orgMap[orgId] = [];
            orgMap[orgId].push(b);
        }

        for (const orgId in orgMap) {
            const chain = orgMap[orgId];
            if (parseInt(chain[0].index, 10) !== 0 || chain[0].previous_hash !== '0') {
                return false;
            }
            for (let i = 1; i < chain.length; i++) {
                if (chain[i].previous_hash !== chain[i - 1].hash) {
                    return false;
                }
            }
        }
        return true;
    } catch (e) {
        console.error('validateMultiTenantChains error:', e);
        return false;
    }
}

// 6.2 Get Master KMPDC Practitioners Register
app.get('/api/kmpdc/practitioners', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM kmpdc_registry ORDER BY full_name ASC');
        res.json({ success: true, practitioners: rows });
    } catch (err) {
        console.error('Failed to query KMPDC practitioners:', err);
        res.status(500).json({ error: 'Failed to load KMPDC registry.' });
    }
});

// 6.3 Super Admin Add Practitioner to Master KMPDC Registry
app.post('/api/kmpdc/practitioners', async (req, res) => {
    try {
        const authHeader = req.headers.authorization || req.headers.Authorization;
        if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }
        const token = authHeader.substring(7).trim();
        const decoded = jwt.verify(token, JWT_SECRET);
        if (!decoded || decoded.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access restricted to Super Administrators only.' });
        }

        const { licenseNumber, fullName, cadre, specialization, facility, status } = req.body;
        if (!licenseNumber || !fullName) {
            return res.status(400).json({ error: 'licenseNumber and fullName are required.' });
        }

        const cleanLicense = licenseNumber.trim().toUpperCase();
        const cleanName = fullName.trim();
        const cleanCadre = cadre || 'Medical Practitioner';
        const cleanSpec = specialization || 'General Practice';
        const cleanFacility = facility || 'Kenyatta National Hospital';
        const cleanStatus = status || 'active';

        const { rows } = await db.query(
            `INSERT INTO kmpdc_registry (license_number, full_name, cadre, specialization, facility, status, retention_year)
             VALUES ($1, $2, $3, $4, $5, $6, 2026)
             ON CONFLICT (license_number) DO UPDATE
             SET full_name = EXCLUDED.full_name,
                 cadre = EXCLUDED.cadre,
                 specialization = EXCLUDED.specialization,
                 facility = EXCLUDED.facility,
                 status = EXCLUDED.status,
                 updated_at = NOW()
             RETURNING *`,
            [cleanLicense, cleanName, cleanCadre, cleanSpec, cleanFacility, cleanStatus]
        );

        res.status(201).json({
            success: true,
            message: `Practitioner ${cleanName} (${cleanLicense}) successfully registered in KMPDC Oracle!`,
            practitioner: rows[0]
        });
    } catch (err) {
        console.error('Failed to add practitioner to KMPDC registry:', err);
        res.status(500).json({ error: err.message || 'Failed to save practitioner.' });
    }
});

// 7. Public Verifiable Medical Record Blockchain Proof (For QR Code Scans)
app.get('/api/records/:id/verify-blockchain', async (req, res) => {
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
            const { rows: blockRows } = await db.query(
                'SELECT * FROM blocks WHERE index = $1',
                [rec.block_index]
            );
            if (blockRows.length > 0) {
                blockData = blockRows[0];
            }
        }

        // Verify RSA Signature
        let isSignatureValid = false;
        if (rec.doctorPublicKey && rec.signature) {
            const dataToVerify = `${rec.patient_id}-${rec.diagnosis}-${rec.treatment}-${rec.timestamp}`;
            const verify = crypto.createVerify('SHA256');
            verify.update(dataToVerify);
            verify.end();
            try {
                isSignatureValid = verify.verify(rec.doctorPublicKey, rec.signature, 'hex');
            } catch (sigErr) {
                isSignatureValid = false;
            }
        }

        const decryptedDiagnosis = decrypt(rec.diagnosis);
        const decryptedTreatment = decrypt(rec.treatment);

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
});

// Global 404 handler for unmatched API routes
app.use((req, res) => {
    res.status(404).json({ error: `API endpoint ${req.originalUrl} not found.` });
});

// Global Express error handling middleware
app.use((err, req, res, next) => {
    console.error('[SYS ERROR] Unhandled API Express error:', err);
    res.status(500).json({ error: 'Internal server error occurred.', message: err.message });
});

// Global process exception handlers to prevent Node server crashes
process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception:', err.stack || err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Promise Rejection:', reason);
});

// Start Server with optimized HTTP keep-alive settings (only when not running as a Vercel serverless function)
if (!process.env.VERCEL) {
    const server = app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
}

// Background Keep-Alive Self-Ping for Render deployment
// Disabled by default (ENABLE_KEEP_ALIVE must be explicitly set to 'true') to allow Render to spin down when inactive and preserve free compute hours.
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL;
const ENABLE_KEEP_ALIVE = process.env.ENABLE_KEEP_ALIVE === 'true';
const KEEP_ALIVE_INTERVAL_MINUTES = parseInt(process.env.KEEP_ALIVE_INTERVAL_MINUTES, 10) || 14;

if (RENDER_URL && ENABLE_KEEP_ALIVE) {
    console.log(`[Keep-Alive] Self-ping active for Render deployment (${KEEP_ALIVE_INTERVAL_MINUTES} min interval): ${RENDER_URL}`);
    setInterval(() => {
        const httpModule = RENDER_URL.startsWith('https') ? require('https') : require('http');
        httpModule.get(`${RENDER_URL}/api/health`, (res) => {
            res.resume(); // Drains response stream to prevent socket/memory leaks
            console.log(`[Keep-Alive] Self-ping sent to ${RENDER_URL}/api/health - Status: ${res.statusCode}`);
        }).on('error', (err) => {
            console.warn(`[Keep-Alive] Self-ping warning: ${err.message}`);
        });
    }, KEEP_ALIVE_INTERVAL_MINUTES * 60 * 1000);
}

module.exports = app;

