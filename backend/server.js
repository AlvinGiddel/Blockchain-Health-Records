const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendResetEmail, sendDoctorApprovalEmail, sendDoctorRejectionEmail } = require('./mailer');
const { Blockchain, generateKeyPair, signRecord } = require('./blockchain');

require('dotenv').config();
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'blockchain_health_secret_key_12345';

// Middleware
app.use(cors());
app.use(express.json());

// AES Field-Level Encryption details for diagnosis & treatment
const ENCRYPTION_KEY = Buffer.from('f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a39281706f5e4d3c2b1a09', 'hex'); // 32 bytes
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

// Initialize Blockchain Engine
let healthBlockchain = new Blockchain();

/**
 * Synchronize the in-memory blockchain state with the database.
 * Loads mined blocks from PostgreSQL, or saves the Genesis block if the DB is empty.
 */
async function syncBlockchainWithDatabase() {
    try {
        const { rows: dbBlocks } = await db.query('SELECT * FROM blocks ORDER BY index ASC');
        
        if (dbBlocks.length === 0) {
            console.log('No blocks found in DB. Storing genesis block...');
            const genesisBlock = healthBlockchain.chain[0];
            
            await db.query(
                'INSERT INTO blocks (index, timestamp, records, previous_hash, nonce, hash) VALUES ($1, $2, $3, $4, $5, $6)',
                [genesisBlock.index, genesisBlock.timestamp, JSON.stringify(genesisBlock.records), genesisBlock.previousHash, genesisBlock.nonce, genesisBlock.hash]
            );
        } else {
            console.log(`Loading ${dbBlocks.length} blocks from PostgreSQL into memory...`);
            healthBlockchain.chain = dbBlocks.map(dbBlock => {
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
        
        // Sync pending records from database (records not yet mined)
        const { rows: pendingDbRecords } = await db.query('SELECT * FROM records WHERE is_mined = false ORDER BY timestamp ASC');
        const medicalPending = [];
        for (const rec of pendingDbRecords) {
            const { rows: users } = await db.query('SELECT name FROM users WHERE id = $1', [rec.patient_id]);
            const patientName = users.length > 0 ? users[0].name : 'Unknown Patient';
            medicalPending.push({
                recordId: rec.id,
                txType: rec.record_type || 'medical',
                patientId: rec.patient_id,
                patientName: patientName,
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
            });
        }

        // Sort by timestamp
        healthBlockchain.pendingRecords = medicalPending.sort(
            (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );

        console.log(`Blockchain active. Chain length: ${healthBlockchain.chain.length}. Pending records: ${healthBlockchain.pendingRecords.length}`);
    } catch (error) {
        console.error('Error synchronizing blockchain with database:', error.message);
    }
}

// Initialize database synchronization
async function initDb() {
    await syncBlockchainWithDatabase();
}
initDb();

// ==================== AUTHENTICATION ROUTES ====================

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, role, profile } = req.body;
        
        if (role === 'admin') {
            return res.status(400).json({ error: 'Registration as Administrator is not allowed.' });
        }
        
        // Check if user exists
        const { rows: existingUsers } = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
        if (existingUsers.length > 0) {
            return res.status(400).json({ error: 'Email already registered.' });
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

        const { rows: insertedUsers } = await db.query(
            `INSERT INTO users (name, email, password, role, public_key, private_key, patient_profile, doctor_profile, is_approved) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [name, email.toLowerCase().trim(), hashedPassword, role, publicKey, privateKey, 
             patientProfile ? JSON.stringify(patientProfile) : null, 
             doctorProfile ? JSON.stringify(doctorProfile) : null, 
             isApprovedVal]
        );
        const user = insertedUsers[0];

        if (role === 'doctor' && !isApprovedVal) {
            // Log doctor registration request event in audit trail
            await db.query(
                `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                ['doctor_request', user.id, user.name, user.id, 'System Admin', `New doctor registration request submitted by Dr. ${user.name} (${user.email}). Pending approval.`]
            );

            return res.status(202).json({
                message: 'Doctor registration submitted! Please wait for approval from a system administrator.',
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isApproved: false
                }
            });
        }
        
        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
        res.status(201).json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                publicKey: user.public_key,
                patientProfile: user.patient_profile,
                doctorProfile: user.doctor_profile,
                isApproved: user.is_approved
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed.' });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const { rows: users } = await db.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase().trim()]);
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

        const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                publicKey: user.public_key,
                patientProfile: user.patient_profile,
                doctorProfile: user.doctor_profile,
                isApproved: user.is_approved
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed.' });
    }
});

// Get Patients
app.get('/api/users/patients', async (req, res) => {
    try {
        const { rows: patients } = await db.query(
            'SELECT id, name, email, role, public_key as "publicKey", patient_profile as "patientProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE role = \'patient\''
        );
        res.json(patients);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Doctors (only approved ones)
app.get('/api/users/doctors', async (req, res) => {
    try {
        const { rows: doctors } = await db.query(
            'SELECT id, name, email, role, public_key as "publicKey", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE role = \'doctor\' AND is_approved = true'
        );
        res.json(doctors);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Pending Doctors (filtering out rejected ones)
app.get('/api/admin/doctors/pending', async (req, res) => {
    try {
        const { rows: pendingDoctors } = await db.query(
            'SELECT id, name, email, role, public_key as "publicKey", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE role = \'doctor\' AND is_approved = false AND is_rejected = false'
        );
        res.json(pendingDoctors);
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

        // Log doctor approval in audit trail
        await db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['doctor_approve', updatedDoctor.id, updatedDoctor.name, updatedDoctor.id, 'System Admin', `Doctor registration request for Dr. ${updatedDoctor.name} (${updatedDoctor.email}) approved.`]
        );

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

        // Log doctor rejection in audit trail
        await db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['doctor_reject', updatedDoctor.id, updatedDoctor.name, updatedDoctor.id, 'System Admin', `Doctor registration request for Dr. ${updatedDoctor.name} (${updatedDoctor.email}) rejected.`]
        );

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
        const { rows: pendingAdmins } = await db.query(
            'SELECT id, name, email, role, public_key as "publicKey", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE role = \'admin\' AND is_approved = false AND is_rejected = false'
        );
        res.json(pendingAdmins);
    } catch (err) {
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

        // Log admin approval in audit trail
        await db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['admin_approve', updatedAdmin.id, updatedAdmin.name, updatedAdmin.id, 'System Admin', `Admin registration request for ${updatedAdmin.name} (${updatedAdmin.email}) approved.`]
        );

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

        // Log admin rejection in audit trail
        await db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['admin_reject', updatedAdmin.id, updatedAdmin.name, updatedAdmin.id, 'System Admin', `Admin registration request for ${updatedAdmin.name} (${updatedAdmin.email}) rejected.`]
        );

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

        // Log the password change in the audit trail
        await db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['password_change', user.id, user.name, user.id, 'System Admin', `User ${user.name} (${user.role}) changed their account password.`]
        );

        res.json({ success: true, message: 'Password updated successfully!' });
    } catch (err) {
        console.error('Password change error:', err);
        res.status(500).json({ error: 'Failed to update password.' });
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
        const frontendOrigin = req.headers.origin || 'http://localhost:3000';
        const resetUrl = `${frontendOrigin}/?resetToken=${token}`;

        // Send email
        const mailResult = await sendResetEmail(user.email, user.name, resetUrl);

        // Log to Audit trail
        await db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['password_reset_request', user.id, user.name, user.id, 'System Admin', `Password reset requested for ${user.name} (${user.email}).`]
        );

        res.json({
            success: true,
            message: 'A password reset link has been generated and dispatched to your email.',
            resetUrl: resetUrl,
            previewUrl: mailResult.previewUrl
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

        // Log completion to audit trail
        await db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['password_reset_complete', user.id, user.name, user.id, 'System Admin', `Password reset successfully completed for ${user.name} (${user.role}).`]
        );

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
        const { userId, name, age, gender, bloodType, allergies, emergencyContact, phone } = req.body;
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
        if (emergencyContact !== undefined) profile.emergencyContact = emergencyContact;
        if (phone !== undefined) profile.phone = phone;

        const updatedName = name || user.name;

        const { rows: updatedUsers } = await db.query(
            'UPDATE users SET name = $1, patient_profile = $2 WHERE id = $3 RETURNING *',
            [updatedName, JSON.stringify(profile), userId]
        );
        const updatedUser = updatedUsers[0];

        // Create Audit Log Entry
        await db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['profile_update', updatedUser.id, updatedUser.name, updatedUser.id, 'Patient Self', `Patient ${updatedUser.name} updated their personal profile & health vitals.`]
        );

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
        
        // Log the change in the audit trail
        await db.query(
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
        );
        
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
        const { doctorId, date, time, reason, patientId } = req.body;
        const { rows: patients } = await db.query('SELECT * FROM users WHERE id = $1', [patientId]);
        const { rows: doctors } = await db.query('SELECT * FROM users WHERE id = $1', [doctorId]);
        if (patients.length === 0 || doctors.length === 0) {
            return res.status(404).json({ error: 'Patient or Doctor not found.' });
        }
        const patient = patients[0];
        const doctor = doctors[0];
        
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
        
        const { rows: appointments } = await db.query(
            `INSERT INTO appointments (patient_id, doctor_id, patient_name, doctor_name, date, time, reason, status) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [patientId, doctorId, patient.name, doctor.name, date, time, reason, 'Pending']
        );
        const appointment = appointments[0];

        // Audit Log Entry
        await db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['appointment_request', patientId, patient.name, doctorId, doctor.name, `Patient ${patient.name} requested an appointment with Dr. ${doctor.name} on ${date} at ${time}.`]
        );

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

        res.status(201).json({ success: true, message: 'Appointment request submitted successfully!', appointment: responseAppointment });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch appointments filtered by user role
app.get('/api/appointments', async (req, res) => {
    try {
        const { requesterId, requesterRole } = req.query;
        let query = 'SELECT id, patient_id as "patientId", doctor_id as "doctorId", patient_name as "patientName", doctor_name as "doctorName", date, time, reason, status, created_at as "createdAt" FROM appointments';
        let params = [];
        
        if (requesterRole === 'patient') {
            query += ' WHERE patient_id = $1';
            params.push(requesterId);
        } else if (requesterRole === 'doctor') {
            query += ' WHERE doctor_id = $1';
            params.push(requesterId);
        } else if (requesterRole !== 'admin') {
            return res.status(403).json({ error: 'Invalid requester role.' });
        }
        
        query += ' ORDER BY created_at DESC';
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

        // Audit Log Entry
        const eventType = status === 'Confirmed' ? 'appointment_confirm' : (status === 'Declined' ? 'appointment_decline' : 'appointment_complete');
        await db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [eventType, appointment.patient_id, appointment.patient_name, appointment.doctor_id, appointment.doctor_name, `Appointment status updated to ${status} for ${appointment.patient_name} with Dr. ${appointment.doctor_name}.`]
        );

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
        
        const { rows: doctors } = await db.query('SELECT * FROM users WHERE id = $1', [appointment.doctor_id]);
        const { rows: patients } = await db.query('SELECT * FROM users WHERE id = $1', [appointment.patient_id]);
        if (doctors.length === 0 || patients.length === 0) {
            return res.status(404).json({ error: 'Doctor or Patient not found.' });
        }
        const doctor = doctors[0];
        const patient = patients[0];

        const prescriptionsArray = prescriptions ? prescriptions.split(',').map(p => p.trim()).filter(p => p !== '') : [];

        // Generate SHA-256 hash of the consultation record details
        const consultationDetails = symptoms + diagnosis + treatment + notes + prescriptionsArray.join(',') + (labRequest || '');
        const consultationHash = crypto.createHash('sha256').update(consultationDetails).digest('hex');

        const timestamp = new Date().toISOString();

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

        // Create Audit Log Entry
        await db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['consultation_complete', appointment.patient_id, patient.name, appointment.doctor_id, doctor.name, `Dr. ${doctor.name} completed consultation for ${patient.name}.`]
        );

        // Update appointment status to Completed
        await db.query("UPDATE appointments SET status = 'Completed' WHERE id = $1", [appointmentId]);

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

        // Mine block immediately
        console.log('[Auto-Miner] Packaging consultation and mining block...');
        const newBlock = healthBlockchain.minePendingRecords();

        // Save block in DB
        await db.query(
            'INSERT INTO blocks (index, timestamp, records, previous_hash, nonce, hash) VALUES ($1, $2, $3, $4, $5, $6)',
            [newBlock.index, newBlock.timestamp, JSON.stringify(newBlock.records), newBlock.previousHash, newBlock.nonce, newBlock.hash]
        );

        const recordIds = newBlock.records.map(r => r.recordId).filter(Boolean);
        if (recordIds.length > 0) {
            await db.query('UPDATE records SET is_mined = true, block_index = $1 WHERE id = ANY($2::uuid[])', [newBlock.index, recordIds]);
            await db.query('UPDATE audit_logs SET is_mined = true, block_index = $1 WHERE patient_id = ANY($2::uuid[])', [newBlock.index, recordIds]);
        }

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
            isMined: true,
            blockIndex: newBlock.index,
            timestamp: newRecord.timestamp
        };

        res.status(201).json({ success: true, message: 'Consultation completed, signed, and mined!', record: responseRecord });
    } catch (err) {
        console.error('Consultation completion error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Admin Dashboard stats consolidation endpoint
app.get('/api/admin/stats', async (req, res) => {
    try {
        const { rows: aCount } = await db.query('SELECT count(*) FROM appointments');
        const { rows: pACount } = await db.query("SELECT count(*) FROM appointments WHERE status = 'Pending'");
        const { rows: cCCount } = await db.query("SELECT count(*) FROM records WHERE record_type = 'consultation'");
        const { rows: bCount } = await db.query('SELECT count(*) FROM blocks');
        const { rows: dCount } = await db.query("SELECT count(*) FROM users WHERE role = 'doctor' AND is_approved = true");
        const { rows: paCount } = await db.query("SELECT count(*) FROM users WHERE role = 'patient'");
        
        res.json({
            totalAppointments: parseInt(aCount[0].count),
            pendingAppointments: parseInt(pACount[0].count),
            completedConsultations: parseInt(cCCount[0].count),
            blocks: parseInt(bCount[0].count),
            mempool: healthBlockchain.pendingRecords.length,
            doctors: parseInt(dCount[0].count),
            patients: parseInt(paCount[0].count),
            isValid: healthBlockchain.isChainValid()
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== MEDICAL RECORD ROUTES ====================

// Add new medical record (requires Doctor)
app.post('/api/records', async (req, res) => {
    try {
        const { patientId, diagnosis, treatment, prescriptions, ipfsHash, doctorId } = req.body;
        
        const { rows: doctors } = await db.query('SELECT * FROM users WHERE id = $1', [doctorId]);
        const { rows: patients } = await db.query('SELECT * FROM users WHERE id = $1', [patientId]);
        if (doctors.length === 0 || doctors[0].role !== 'doctor') {
            return res.status(403).json({ error: 'Only doctors can create medical records.' });
        }
        if (patients.length === 0) {
            return res.status(404).json({ error: 'Patient not found.' });
        }
        const doctor = doctors[0];
        const patient = patients[0];

        // Treating relationship check: Doctor must be treating the patient
        const { rows: isAuthRows } = await db.query(
            "SELECT 1 FROM appointments WHERE patient_id = $1 AND doctor_id = $2 AND status IN ('Confirmed', 'Completed') LIMIT 1",
            [patientId, doctorId]
        );
                             
        if (isAuthRows.length === 0) {
            return res.status(403).json({ error: 'Access Denied: You are not actively treating this patient through any confirmed appointments.' });
        }

        const timestamp = new Date().toISOString();
        
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

        // Create Audit Log Entry
        await db.query(
            `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            ['record_create', patientId, patient.name, doctorId, doctor.name, `Dr. ${doctor.name} added a new diagnosis/treatment record.`]
        );
        
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
        
        // Auto-mine the record immediately to seal it into the blockchain ledger
        console.log('[Auto-Miner] Packaging record and mining block...');
        const newBlock = healthBlockchain.minePendingRecords();
        
        // Save the block in database
        await db.query(
            'INSERT INTO blocks (index, timestamp, records, previous_hash, nonce, hash) VALUES ($1, $2, $3, $4, $5, $6)',
            [newBlock.index, newBlock.timestamp, JSON.stringify(newBlock.records), newBlock.previousHash, newBlock.nonce, newBlock.hash]
        );
        
        // Update all records that were in this block
        const recordIds = newBlock.records.map(r => r.recordId).filter(Boolean);
        if (recordIds.length > 0) {
            await db.query('UPDATE records SET is_mined = true, block_index = $1 WHERE id = ANY($2::uuid[])', [newBlock.index, recordIds]);
            await db.query('UPDATE audit_logs SET is_mined = true, block_index = $1 WHERE patient_id = ANY($2::uuid[])', [newBlock.index, recordIds]);
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
            isMined: true,
            blockIndex: newBlock.index,
            timestamp: newRecord.timestamp
        };
        
        res.status(201).json({ message: 'Record created, signed, and secured on the blockchain ledger!', record: responseRecord });
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
            // Check if doctor is treating this patient
            const { rows: isAuthRows } = await db.query(
                "SELECT 1 FROM appointments WHERE patient_id = $1 AND doctor_id = $2 AND status IN ('Confirmed', 'Completed') LIMIT 1",
                [patientId, requesterId]
            );
                                 
            if (isAuthRows.length === 0) {
                return res.status(403).json({ error: 'Access Denied: You are not actively treating this patient.' });
            }
        } else if (requesterRole !== 'admin') {
            return res.status(403).json({ error: 'Access Denied: Invalid requester role.' });
        }

        // Create Audit Log Entry for record access
        if (requesterRole === 'doctor') {
            const { rows: patients } = await db.query('SELECT name FROM users WHERE id = $1', [patientId]);
            const { rows: doctors } = await db.query('SELECT name FROM users WHERE id = $1', [requesterId]);
            if (patients.length > 0 && doctors.length > 0) {
                await db.query(
                    `INSERT INTO audit_logs (event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    ['record_access', patientId, patients[0].name, requesterId, doctors[0].name, `Dr. ${doctors[0].name} viewed electronic medical records folder.`]
                );
            }
        }

        const { rows: records } = await db.query(
            `SELECT id, patient_id as "patientId", doctor_id as "doctorId", doctor_name as "doctorName", 
                    diagnosis, treatment, prescriptions, record_type as "recordType", symptoms, 
                    notes, lab_request as "labRequest", consultation_hash as "consultationHash", 
                    transaction_hash as "transactionHash", ipfs_hash as "ipfsHash", signature, 
                    doctor_public_key as "doctorPublicKey", is_mined as "isMined", block_index as "blockIndex", 
                    timestamp 
             FROM records WHERE patient_id = $1 ORDER BY timestamp DESC`,
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
        const { patientId } = req.query;
        let query = 'SELECT id, event_type as "eventType", patient_id as "patientId", patient_name as "patientName", doctor_id as "doctorId", doctor_name as "doctorName", details, timestamp, is_mined as "isMined", block_index as "blockIndex", signature FROM audit_logs';
        let params = [];
        
        if (patientId) {
            query += ' WHERE patient_id = $1';
            params.push(patientId);
        }
        
        query += ' ORDER BY timestamp DESC';
        const { rows: logs } = await db.query(query, params);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== BLOCKCHAIN LEDGER ROUTES ====================

// Mine pending records into a block
app.post('/api/blockchain/mine', async (req, res) => {
    try {
        if (healthBlockchain.pendingRecords.length === 0) {
            return res.status(400).json({ error: 'No pending records to mine. Add new records first.' });
        }
        
        console.log('Mining blocks starting Proof of Work...');
        const newBlock = healthBlockchain.minePendingRecords();
        
        // Save the block in database
        await db.query(
            'INSERT INTO blocks (index, timestamp, records, previous_hash, nonce, hash) VALUES ($1, $2, $3, $4, $5, $6)',
            [newBlock.index, newBlock.timestamp, JSON.stringify(newBlock.records), newBlock.previousHash, newBlock.nonce, newBlock.hash]
        );
        
        // Update records and audit logs
        const recordIds = newBlock.records.map(r => r.recordId).filter(Boolean);
        if (recordIds.length > 0) {
            await db.query('UPDATE records SET is_mined = true, block_index = $1 WHERE id = ANY($2::uuid[])', [newBlock.index, recordIds]);
            await db.query('UPDATE audit_logs SET is_mined = true, block_index = $1 WHERE patient_id = ANY($2::uuid[])', [newBlock.index, recordIds]);
        }
        
        res.status(200).json({
            message: 'Block successfully mined and stored on ledger!',
            block: newBlock
        });
    } catch (error) {
        console.error('Mining failed:', error);
        res.status(500).json({ error: 'Mining failed: ' + error.message });
    }
});

// Get all blocks
app.get('/api/blockchain/blocks', async (req, res) => {
    try {
        const { rows: blocks } = await db.query('SELECT id, index, timestamp, records, previous_hash as "previousHash", nonce, hash FROM blocks ORDER BY index ASC');
        res.json(blocks);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Validate chain
app.get('/api/blockchain/validate', async (req, res) => {
    try {
        const isValid = healthBlockchain.isChainValid();
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

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

module.exports = app;

