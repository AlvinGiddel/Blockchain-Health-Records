const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const crypto = require('crypto');
const { sendResetEmail, sendDoctorApprovalEmail, sendDoctorRejectionEmail } = require('./mailer');

const { Blockchain, generateKeyPair, signRecord } = require('./blockchain');
const User = require('./models/User');
const Record = require('./models/Record');
const BlockModel = require('./models/Block');
const AuditLog = require('./models/AuditLog');
const Appointment = require('./models/Appointment');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'blockchain_health_secret_key_12345';

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Blockchain Engine
let healthBlockchain = new Blockchain();

// Connect to MongoDB
const mongoURI = 'mongodb://127.0.0.1:27017/blockchain_health';
mongoose.connect(mongoURI)
    .then(async () => {
        console.log('Connected to MongoDB.');
        await syncBlockchainWithDatabase();
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
    });

/**
 * Synchronize the in-memory blockchain state with the database.
 * Loads mined blocks from MongoDB, or saves the Genesis block if the DB is empty.
 */
async function syncBlockchainWithDatabase() {
    try {
        const dbBlocks = await BlockModel.find().sort({ index: 1 });
        
        if (dbBlocks.length === 0) {
            console.log('No blocks found in DB. Storing genesis block...');
            const genesisBlock = healthBlockchain.chain[0];
            
            const newDbBlock = new BlockModel({
                index: genesisBlock.index,
                timestamp: genesisBlock.timestamp,
                records: genesisBlock.records,
                previousHash: genesisBlock.previousHash,
                nonce: genesisBlock.nonce,
                hash: genesisBlock.hash
            });
            await newDbBlock.save();
        } else {
            console.log(`Loading ${dbBlocks.length} blocks from MongoDB into memory...`);
            healthBlockchain.chain = dbBlocks.map(dbBlock => {
                const b = new (require('./blockchain').Block)(
                    dbBlock.index,
                    dbBlock.timestamp,
                    dbBlock.records,
                    dbBlock.previousHash
                );
                b.nonce = dbBlock.nonce;
                b.hash = dbBlock.hash;
                return b;
            });
        }
        
        // Sync pending records from database (records not yet mined)
        const pendingDbRecords = await Record.find({ isMined: false }).sort({ timestamp: 1 });
        const medicalPending = [];
        for (const rec of pendingDbRecords) {
            const patient = await User.findById(rec.patientId);
            medicalPending.push({
                recordId: rec._id.toString(),
                txType: rec.recordType || 'medical',
                patientId: rec.patientId.toString(),
                patientName: patient ? patient.name : 'Unknown Patient',
                doctorId: rec.doctorId.toString(),
                doctorName: rec.doctorName,
                diagnosis: rec.diagnosis, // Mongoose will automatically decrypt when loaded
                treatment: rec.treatment,
                prescriptions: rec.prescriptions,
                ipfsHash: rec.ipfsHash,
                signature: rec.signature,
                doctorPublicKey: rec.doctorPublicKey,
                timestamp: rec.timestamp,
                consultationHash: rec.consultationHash || ''
            });
        }

        // Sort by timestamp
        healthBlockchain.pendingRecords = medicalPending.sort(
            (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
        );

        console.log(`Blockchain active. Chain length: ${healthBlockchain.chain.length}. Pending records: ${healthBlockchain.pendingRecords.length}`);
    } catch (error) {
        console.error('Error synchronizing blockchain with database:', error);
    }
}

// ==================== AUTHENTICATION ROUTES ====================

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, role, profile } = req.body;

        if (role === 'admin') {
            return res.status(400).json({ error: 'Registration as Administrator is not allowed.' });
        }
        
        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered.' });
        }
        
        // Generate cryptographic keys for this user
        console.log(`Generating RSA keys for registering user: ${name} (${role})...`);
        const { publicKey, privateKey } = generateKeyPair();
        
        let isApprovedVal = true;
        if (role === 'admin') {
            const approvedAdminCount = await User.countDocuments({ role: 'admin', isApproved: true });
            if (approvedAdminCount > 0) {
                isApprovedVal = false;
            }
        } else if (role === 'doctor') {
            isApprovedVal = false;
        }

        const user = new User({
            name,
            email,
            password,
            role,
            publicKey,
            privateKey,
            patientProfile: role === 'patient' ? profile : undefined,
            doctorProfile: role === 'doctor' ? profile : undefined,
            isApproved: isApprovedVal
        });
        
        await user.save();
        
        if (role === 'admin' && !isApprovedVal) {
            // Log admin registration request event in audit trail
            const audit = new AuditLog({
                eventType: 'admin_request',
                patientId: user._id,
                patientName: user.name,
                doctorId: user._id,
                doctorName: 'System Admin',
                details: `New admin registration request submitted by ${user.name} (${user.email}). Pending approval.`
            });
            await audit.save();

            return res.status(202).json({
                message: 'Admin registration submitted! Please wait for approval from a current administrator.',
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isApproved: false
                }
            });
        }

        if (role === 'doctor' && !isApprovedVal) {
            // Log doctor registration request event in audit trail
            const audit = new AuditLog({
                eventType: 'doctor_request',
                patientId: user._id,
                patientName: user.name,
                doctorId: user._id,
                doctorName: 'System Admin',
                details: `New doctor registration request submitted by Dr. ${user.name} (${user.email}). Pending approval.`
            });
            await audit.save();

            return res.status(202).json({
                message: 'Doctor registration submitted! Please wait for approval from a system administrator.',
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isApproved: false
                }
            });
        }
        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
        res.status(201).json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                publicKey: user.publicKey,
                patientProfile: user.patientProfile,
                doctorProfile: user.doctorProfile,
                isApproved: user.isApproved
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
        const user = await User.findOne({ email });
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }
        
        // Block unapproved/rejected admins and doctors from logging in
        if (user.role === 'admin') {
            if (user.isRejected) {
                return res.status(403).json({ error: 'Your admin registration request was rejected by the administrator.' });
            }
            if (!user.isApproved) {
                return res.status(403).json({ error: 'Admin approval pending. Please request authorization from an active administrator.' });
            }
        } else if (user.role === 'doctor') {
            if (user.isRejected) {
                return res.status(403).json({ error: 'Your doctor registration request was rejected by the administrator.' });
            }
            if (!user.isApproved) {
                return res.status(403).json({ error: 'Doctor approval pending. Please wait for an administrator to review your request.' });
            }
        }

        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
        res.json({
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                publicKey: user.publicKey,
                patientProfile: user.patientProfile,
                doctorProfile: user.doctorProfile,
                isApproved: user.isApproved
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed.' });
    }
});

// Get Patients or Doctors
app.get('/api/users/patients', async (req, res) => {
    try {
        const patients = await User.find({ role: 'patient' }).select('-password -privateKey');
        res.json(patients);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Doctors (only approved ones)
app.get('/api/users/doctors', async (req, res) => {
    try {
        const doctors = await User.find({ role: 'doctor', isApproved: true }).select('-password -privateKey');
        res.json(doctors);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Pending Doctors (filtering out rejected ones)
app.get('/api/admin/doctors/pending', async (req, res) => {
    try {
        const pendingDoctors = await User.find({ role: 'doctor', isApproved: false, isRejected: false }).select('-password -privateKey');
        res.json(pendingDoctors);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Approve Pending Doctor
app.post('/api/admin/doctors/approve/:id', async (req, res) => {
    try {
        const doctorId = req.params.id;
        const updatedDoctor = await User.findByIdAndUpdate(doctorId, { isApproved: true, isRejected: false }, { new: true });
        if (!updatedDoctor) {
            return res.status(404).json({ error: 'Doctor registration request not found.' });
        }

        // Log doctor approval in audit trail
        const audit = new AuditLog({
            eventType: 'doctor_approve',
            patientId: updatedDoctor._id,
            patientName: updatedDoctor.name,
            doctorId: updatedDoctor._id,
            doctorName: 'System Admin',
            details: `Doctor registration request for Dr. ${updatedDoctor.name} (${updatedDoctor.email}) approved.`
        });
        await audit.save();

        // Send Email notification for approval
        try {
            await sendDoctorApprovalEmail(updatedDoctor.email, updatedDoctor.name);
        } catch (mailError) {
            console.error('Failed to send approval email:', mailError);
        }

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
        const updatedDoctor = await User.findByIdAndUpdate(doctorId, { isApproved: false, isRejected: true }, { new: true });
        if (!updatedDoctor) {
            return res.status(404).json({ error: 'Doctor registration request not found.' });
        }

        // Log doctor rejection in audit trail
        const audit = new AuditLog({
            eventType: 'doctor_reject',
            patientId: updatedDoctor._id,
            patientName: updatedDoctor.name,
            doctorId: updatedDoctor._id,
            doctorName: 'System Admin',
            details: `Doctor registration request for Dr. ${updatedDoctor.name} (${updatedDoctor.email}) rejected.`
        });
        await audit.save();

        // Send Email notification for rejection
        try {
            await sendDoctorRejectionEmail(updatedDoctor.email, updatedDoctor.name);
        } catch (mailError) {
            console.error('Failed to send rejection email:', mailError);
        }

        console.log(`Doctor ${updatedDoctor.name} (${updatedDoctor.email}) rejected by administrator.`);
        res.json({ success: true, message: `Doctor Dr. ${updatedDoctor.name} successfully rejected.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get Pending Admins (filtering out rejected ones)
app.get('/api/admin/pending', async (req, res) => {
    try {
        const pendingAdmins = await User.find({ role: 'admin', isApproved: false, isRejected: false }).select('-password -privateKey');
        res.json(pendingAdmins);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Approve Pending Admin
app.post('/api/admin/approve/:id', async (req, res) => {
    try {
        const adminId = req.params.id;
        const updatedAdmin = await User.findByIdAndUpdate(adminId, { isApproved: true, isRejected: false }, { new: true });
        if (!updatedAdmin) {
            return res.status(404).json({ error: 'Admin registration request not found.' });
        }

        // Log admin approval in audit trail
        const audit = new AuditLog({
            eventType: 'admin_approve',
            patientId: updatedAdmin._id,
            patientName: updatedAdmin.name,
            doctorId: updatedAdmin._id,
            doctorName: 'System Admin',
            details: `Admin registration request for ${updatedAdmin.name} (${updatedAdmin.email}) approved.`
        });
        await audit.save();

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
        const updatedAdmin = await User.findByIdAndUpdate(adminId, { isApproved: false, isRejected: true }, { new: true });
        if (!updatedAdmin) {
            return res.status(404).json({ error: 'Admin registration request not found.' });
        }

        // Log admin rejection in audit trail
        const audit = new AuditLog({
            eventType: 'admin_reject',
            patientId: updatedAdmin._id,
            patientName: updatedAdmin.name,
            doctorId: updatedAdmin._id,
            doctorName: 'System Admin',
            details: `Admin registration request for ${updatedAdmin.name} (${updatedAdmin.email}) rejected.`
        });
        await audit.save();

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

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Verify current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(400).json({ error: 'Incorrect current password.' });
        }

        // Set and save new password (Mongoose pre-save hook handles hashing)
        user.password = newPassword;
        await user.save();

        // Log the password change in the audit trail
        const audit = new AuditLog({
            eventType: 'password_change',
            patientId: user._id,
            patientName: user.name,
            doctorId: user._id,
            doctorName: 'System Admin',
            details: `User ${user.name} (${user.role}) changed their account password.`
        });
        await audit.save();

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

        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(404).json({ error: 'No user registered with this email address.' });
        }

        // Generate reset token
        const token = crypto.randomBytes(20).toString('hex');
        
        // Save token and expiration to user record
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour expiration
        await user.save();

        // Construct reset link (points to frontend)
        const frontendOrigin = req.headers.origin || 'http://localhost:3000';
        const resetUrl = `${frontendOrigin}/?resetToken=${token}`;

        // Send email (via Ethereal sandbox or Console output)
        const mailResult = await sendResetEmail(user.email, user.name, resetUrl);

        // Log to Audit trail
        const audit = new AuditLog({
            eventType: 'password_reset_request',
            patientId: user._id,
            patientName: user.name,
            doctorId: user._id,
            doctorName: 'System Admin',
            details: `Password reset requested for ${user.name} (${user.email}).`
        });
        await audit.save();

        res.json({
            success: true,
            message: 'A password reset link has been generated and dispatched to your email.',
            resetUrl: resetUrl, // Expose resetUrl for easy developer local testing
            previewUrl: mailResult.previewUrl // Ethereal sandbox URL to view the styled HTML mail
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

        // Locate user with valid (unexpired) reset token
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ error: 'Password reset link is invalid or has expired.' });
        }

        // Update password (pre-save hook will hash it automatically)
        user.password = password;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        // Log completion to audit trail
        const audit = new AuditLog({
            eventType: 'password_reset_complete',
            patientId: user._id,
            patientName: user.name,
            doctorId: user._id,
            doctorName: 'System Admin',
            details: `Password reset successfully completed for ${user.name} (${user.role}).`
        });
        await audit.save();

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
        const user = await User.findById(userId);
        if (!user || user.role !== 'patient') {
            return res.status(404).json({ error: 'Patient not found.' });
        }

        if (name) user.name = name;
        
        if (!user.patientProfile) {
            user.patientProfile = {};
        }

        if (age !== undefined) user.patientProfile.age = age;
        if (gender !== undefined) user.patientProfile.gender = gender;
        if (bloodType !== undefined) user.patientProfile.bloodType = bloodType;
        if (allergies !== undefined) {
            user.patientProfile.allergies = Array.isArray(allergies) 
                ? allergies 
                : allergies.split(',').map(s => s.trim()).filter(Boolean);
        }
        if (emergencyContact !== undefined) user.patientProfile.emergencyContact = emergencyContact;
        if (phone !== undefined) user.patientProfile.phone = phone;

        user.markModified('patientProfile');
        await user.save();

        // Create Audit Log Entry
        const audit = new AuditLog({
            eventType: 'profile_update',
            patientId: user._id,
            patientName: user.name,
            doctorId: user._id,
            doctorName: 'Patient Self',
            details: `Patient ${user.name} updated their personal profile & health vitals.`
        });
        await audit.save();

        res.json({
            success: true,
            message: 'Profile updated successfully!',
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                publicKey: user.publicKey,
                patientProfile: user.patientProfile,
                doctorProfile: user.doctorProfile,
                isApproved: user.isApproved
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
        const doctor = await User.findById(doctorId);
        if (!doctor || doctor.role !== 'doctor') {
            return res.status(404).json({ error: 'Doctor not found.' });
        }
        
        if (!doctor.doctorProfile) {
            doctor.doctorProfile = {};
        }
        
        doctor.doctorProfile.availability = {
            workingDays: workingDays || ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
            workingHoursStart: workingHoursStart || '08:00',
            workingHoursEnd: workingHoursEnd || '17:00',
            status: status || 'available'
        };
        
        doctor.markModified('doctorProfile');
        await doctor.save();
        
        // Log the change in the audit trail
        const audit = new AuditLog({
            eventType: 'availability_update',
            patientId: doctor._id,
            patientName: doctor.name,
            doctorId: doctor._id,
            doctorName: doctor.name,
            details: `Dr. ${doctor.name} updated availability: Days: ${doctor.doctorProfile.availability.workingDays.join(', ')}, Hours: ${doctor.doctorProfile.availability.workingHoursStart} - ${doctor.doctorProfile.availability.workingHoursEnd}, Status: ${doctor.doctorProfile.availability.status}.`
        });
        await audit.save();
        
        res.json({
            success: true,
            message: 'Availability updated successfully!',
            doctor: {
                id: doctor._id,
                name: doctor.name,
                email: doctor.email,
                role: doctor.role,
                publicKey: doctor.publicKey,
                patientProfile: doctor.patientProfile,
                doctorProfile: doctor.doctorProfile,
                isApproved: doctor.isApproved
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
        const patient = await User.findById(patientId);
        const doctor = await User.findById(doctorId);
        if (!patient || !doctor) {
            return res.status(404).json({ error: 'Patient or Doctor not found.' });
        }
        
        // Doctor Availability Validation
        const availability = doctor.doctorProfile?.availability || {
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
        
        const appointment = new Appointment({
            patientId,
            doctorId,
            patientName: patient.name,
            doctorName: doctor.name,
            date,
            time,
            reason,
            status: 'Pending'
        });
        await appointment.save();

        // Audit Log Entry
        const audit = new AuditLog({
            eventType: 'appointment_request',
            patientId,
            patientName: patient.name,
            doctorId,
            doctorName: doctor.name,
            details: `Patient ${patient.name} requested an appointment with Dr. ${doctor.name} on ${date} at ${time}.`
        });
        await audit.save();

        res.status(201).json({ success: true, message: 'Appointment request submitted successfully!', appointment });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Fetch appointments filtered by user role
app.get('/api/appointments', async (req, res) => {
    try {
        const { requesterId, requesterRole } = req.query;
        let query = {};
        if (requesterRole === 'patient') {
            query.patientId = requesterId;
        } else if (requesterRole === 'doctor') {
            query.doctorId = requesterId;
        } else if (requesterRole !== 'admin') {
            return res.status(403).json({ error: 'Invalid requester role.' });
        }
        const appointments = await Appointment.find(query).sort({ createdAt: -1 });
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
        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) {
            return res.status(404).json({ error: 'Appointment not found.' });
        }
        appointment.status = status;
        await appointment.save();

        // Audit Log Entry
        const eventType = status === 'Confirmed' ? 'appointment_confirm' : (status === 'Declined' ? 'appointment_decline' : 'appointment_complete');
        const audit = new AuditLog({
            eventType,
            patientId: appointment.patientId,
            patientName: appointment.patientName,
            doctorId: appointment.doctorId,
            doctorName: appointment.doctorName,
            details: `Appointment status updated to ${status} for ${appointment.patientName} with Dr. ${appointment.doctorName}.`
        });
        await audit.save();

        res.json({ success: true, message: `Appointment status updated to ${status}.`, appointment });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Complete a consultation (Doctor only)
app.post('/api/consultations', async (req, res) => {
    try {
        const { appointmentId, symptoms, diagnosis, treatment, notes, prescriptions, labRequest } = req.body;
        const appointment = await Appointment.findById(appointmentId);
        if (!appointment) {
            return res.status(404).json({ error: 'Appointment not found.' });
        }
        
        const doctor = await User.findById(appointment.doctorId);
        const patient = await User.findById(appointment.patientId);
        if (!doctor || !patient) {
            return res.status(404).json({ error: 'Doctor or Patient not found.' });
        }

        const prescriptionsArray = prescriptions ? prescriptions.split(',').map(p => p.trim()).filter(p => p !== '') : [];

        // Generate SHA-256 hash of the consultation record details
        const consultationDetails = symptoms + diagnosis + treatment + notes + prescriptionsArray.join(',') + (labRequest || '');
        const consultationHash = crypto.createHash('sha256').update(consultationDetails).digest('hex');

        const timestamp = new Date().toISOString();

        // Construct record data for signing
        const recordData = {
            patientId: appointment.patientId.toString(),
            consultationHash,
            timestamp
        };

        // Sign the record using Doctor's Private Key
        console.log(`Doctor ${doctor.name} is signing consultation record cryptographically...`);
        const signature = signRecord(doctor.privateKey, { txType: 'consultation', patientId: recordData.patientId, consultationHash, timestamp });

        const transactionHash = crypto.createHash('sha256').update(signature + timestamp).digest('hex');

        // Create consultation record in MongoDB Record collection
        const newRecord = new Record({
            patientId: appointment.patientId,
            doctorId: appointment.doctorId,
            doctorName: doctor.name,
            diagnosis,
            treatment,
            prescriptions: prescriptionsArray,
            ipfsHash: '',
            signature,
            doctorPublicKey: doctor.publicKey,
            timestamp,
            recordType: 'consultation',
            symptoms,
            notes,
            labRequest,
            consultationHash,
            transactionHash
        });

        await newRecord.save();

        // Create Audit Log Entry
        const audit = new AuditLog({
            eventType: 'consultation_complete',
            patientId: appointment.patientId,
            patientName: patient.name,
            doctorId: appointment.doctorId,
            doctorName: doctor.name,
            details: `Dr. ${doctor.name} completed consultation for ${patient.name}.`
        });
        await audit.save();

        // Update appointment status to Completed
        appointment.status = 'Completed';
        await appointment.save();

        // Construct blockchain pending record payload
        const pendingRecord = {
            recordId: newRecord._id.toString(),
            txType: 'consultation',
            patientId: appointment.patientId.toString(),
            patientName: patient.name,
            doctorId: appointment.doctorId.toString(),
            doctorName: doctor.name,
            diagnosis,
            treatment,
            prescriptions: prescriptionsArray,
            ipfsHash: '',
            signature,
            doctorPublicKey: doctor.publicKey,
            timestamp,
            consultationHash,
            transactionHash
        };

        healthBlockchain.addRecord(pendingRecord);

        // Mine block immediately
        console.log('[Auto-Miner] Packaging consultation and mining block...');
        const newBlock = healthBlockchain.minePendingRecords();

        // Save block in DB
        const dbBlock = new BlockModel({
            index: newBlock.index,
            timestamp: newBlock.timestamp,
            records: newBlock.records,
            previousHash: newBlock.previousHash,
            nonce: newBlock.nonce,
            hash: newBlock.hash
        });
        await dbBlock.save();

        const recordIds = newBlock.records.map(r => r.recordId).filter(id => id !== undefined);
        await Record.updateMany(
            { _id: { $in: recordIds } },
            { $set: { isMined: true, blockIndex: newBlock.index } }
        );
        await AuditLog.updateMany(
            { _id: { $in: recordIds } },
            { $set: { isMined: true, blockIndex: newBlock.index } }
        );

        // Return updated record with block status
        const updatedRecord = await Record.findById(newRecord._id);

        res.status(201).json({ success: true, message: 'Consultation completed, signed, and mined!', record: updatedRecord });
    } catch (err) {
        console.error('Consultation completion error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Admin Dashboard stats consolidation endpoint
app.get('/api/admin/stats', async (req, res) => {
    try {
        const totalAppointments = await Appointment.countDocuments();
        const pendingAppointments = await Appointment.countDocuments({ status: 'Pending' });
        const completedConsultations = await Record.countDocuments({ recordType: 'consultation' });
        const blocksCount = await BlockModel.countDocuments();
        const mempoolCount = healthBlockchain.pendingRecords.length;
        const doctorsCount = await User.countDocuments({ role: 'doctor', isApproved: true });
        const patientsCount = await User.countDocuments({ role: 'patient' });
        const isValid = healthBlockchain.isChainValid();
        
        res.json({
            totalAppointments,
            pendingAppointments,
            completedConsultations,
            blocks: blocksCount,
            mempool: mempoolCount,
            doctors: doctorsCount,
            patients: patientsCount,
            isValid
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
        
        const doctor = await User.findById(doctorId);
        const patient = await User.findById(patientId);
        if (!doctor || doctor.role !== 'doctor') {
            return res.status(403).json({ error: 'Only doctors can create medical records.' });
        }
        if (!patient) {
            return res.status(404).json({ error: 'Patient not found.' });
        }

        // Treating relationship check: Doctor must be treating the patient
        const isAuthorized = await Appointment.exists({
            patientId,
            doctorId,
            status: { $in: ['Confirmed', 'Completed'] }
        });
                             
        if (!isAuthorized) {
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
        const signature = signRecord(doctor.privateKey, recordData);
        
        const transactionHash = crypto.createHash('sha256').update(signature + timestamp).digest('hex');

        // Create Record in MongoDB
        const newRecord = new Record({
            patientId,
            doctorId,
            doctorName: doctor.name,
            diagnosis,
            treatment,
            prescriptions,
            ipfsHash,
            signature,
            doctorPublicKey: doctor.publicKey,
            timestamp,
            transactionHash
        });
        
        await newRecord.save();

        // Create Audit Log Entry
        const audit = new AuditLog({
            eventType: 'record_create',
            patientId,
            patientName: patient.name,
            doctorId,
            doctorName: doctor.name,
            details: `Dr. ${doctor.name} added a new diagnosis/treatment record.`
        });
        await audit.save();
        
        // Add to blockchain's pending record memory list
        const pendingRecord = {
            recordId: newRecord._id.toString(),
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
            doctorPublicKey: doctor.publicKey,
            timestamp,
            transactionHash
        };
        
        healthBlockchain.addRecord(pendingRecord);
        
        // Auto-mine the record immediately to seal it into the blockchain ledger
        console.log('[Auto-Miner] Packaging record and mining block...');
        const newBlock = healthBlockchain.minePendingRecords();
        
        // Save the block in database
        const dbBlock = new BlockModel({
            index: newBlock.index,
            timestamp: newBlock.timestamp,
            records: newBlock.records,
            previousHash: newBlock.previousHash,
            nonce: newBlock.nonce,
            hash: newBlock.hash
        });
        await dbBlock.save();
        
        // Update all records that were in this block in MongoDB to isMined: true
        const recordIds = newBlock.records.map(r => r.recordId).filter(id => id !== undefined);
        await Record.updateMany(
            { _id: { $in: recordIds } },
            { $set: { isMined: true, blockIndex: newBlock.index } }
        );
        
        // Update all consent logs that were in this block
        await AuditLog.updateMany(
            { _id: { $in: recordIds } },
            { $set: { isMined: true, blockIndex: newBlock.index } }
        );

        // Fetch the updated record document to return in response
        const updatedRecord = await Record.findById(newRecord._id);
        
        res.status(201).json({ message: 'Record created, signed, and secured on the blockchain ledger!', record: updatedRecord });
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
            const isAuthorized = await Appointment.exists({
                patientId,
                doctorId: requesterId,
                status: { $in: ['Confirmed', 'Completed'] }
            });
                                 
            if (!isAuthorized) {
                return res.status(403).json({ error: 'Access Denied: You are not actively treating this patient.' });
            }
        } else if (requesterRole !== 'admin') {
            return res.status(403).json({ error: 'Access Denied: Invalid requester role.' });
        }

        // Create Audit Log Entry for record access
        if (requesterRole === 'doctor') {
            const patient = await User.findById(patientId);
            const doctor = await User.findById(requesterId);
            if (patient && doctor) {
                const audit = new AuditLog({
                    eventType: 'record_access',
                    patientId,
                    patientName: patient.name,
                    doctorId: requesterId,
                    doctorName: doctor.name,
                    details: `Dr. ${doctor.name} viewed electronic medical records folder.`
                });
                await audit.save();
            }
        }

        const records = await Record.find({ patientId }).sort({ timestamp: -1 });
        res.json(records);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all medical records/consultations (Admin only)
app.get('/api/admin/records', async (req, res) => {
    try {
        const { recordType } = req.query;
        let query = {};
        if (recordType) {
            query.recordType = recordType;
        }
        const records = await Record.find(query)
            .populate('patientId', 'name email')
            .populate('doctorId', 'name email')
            .sort({ timestamp: -1 });
        res.json(records);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Get system audit logs
app.get('/api/audit/logs', async (req, res) => {
    try {
        const { patientId } = req.query;
        let query = {};
        
        if (patientId) {
            query.patientId = patientId;
        }
        
        const logs = await AuditLog.find(query).sort({ timestamp: -1 });
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
        const dbBlock = new BlockModel({
            index: newBlock.index,
            timestamp: newBlock.timestamp,
            records: newBlock.records,
            previousHash: newBlock.previousHash,
            nonce: newBlock.nonce,
            hash: newBlock.hash
        });
        await dbBlock.save();
        
        // Update all records that were in this block in MongoDB
        const recordIds = newBlock.records.map(r => r.recordId).filter(id => id !== undefined);
        await Record.updateMany(
            { _id: { $in: recordIds } },
            { $set: { isMined: true, blockIndex: newBlock.index } }
        );
        
        // Update all consent logs that were in this block
        await AuditLog.updateMany(
            { _id: { $in: recordIds } },
            { $set: { isMined: true, blockIndex: newBlock.index } }
        );
        
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
        const blocks = await BlockModel.find().sort({ index: 1 });
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

// Simulate database tampering attack (manipulate diagnosis of a record directly in MongoDB)
app.post('/api/blockchain/tamper', async (req, res) => {
    try {
        const { recordId, tamperedDiagnosis } = req.body;
        
        // Find record in DB
        const record = await Record.findById(recordId);
        if (!record) {
            return res.status(404).json({ error: 'Record not found.' });
        }
        
        const oldDiagnosis = record.diagnosis;
        
        // Force-update MongoDB bypassing standard validation (to simulate direct hacker injection in database)
        // Since diagnoses are AES-encrypted, a direct DB rewrite changes the ciphertext
        await Record.collection.updateOne(
            { _id: new mongoose.Types.ObjectId(recordId) },
            { $set: { diagnosis: tamperedDiagnosis } } // Writes raw plaintext or raw corrupted text bypass setters
        );
        
        // Also tamper with the block list in the DB/memory to demonstrate chain corruption
        if (record.isMined && record.blockIndex !== -1) {
            // Find the block in database
            const block = await BlockModel.findOne({ index: record.blockIndex });
            if (block) {
                // Find record inside block and modify it
                block.records = block.records.map(rec => {
                    if (rec.recordId === recordId) {
                        rec.diagnosis = tamperedDiagnosis + " (HACKED)";
                    }
                    return rec;
                });
                await block.save();
            }
            
            // Tamper in-memory chain too
            const memoryBlock = healthBlockchain.chain.find(b => b.index === record.blockIndex);
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
        
        // 1. Fetch blocks from database
        const dbBlocks = await BlockModel.find().sort({ index: 1 });
        if (dbBlocks.length <= 1) {
            return res.status(400).json({ error: 'No block data to recover from. Genesis block cannot be repaired.' });
        }

        // 2. Loop through all blocks and restore MongoDB records
        for (let i = 1; i < dbBlocks.length; i++) {
            const block = dbBlocks[i];
            let cleanRecords = [];
            
            for (let rec of block.records) {
                const dbRecord = await Record.findById(rec.recordId);
                if (dbRecord) {
                    // Remove " (HACKED)" tag and restore original diagnosis
                    const originalDiagnosis = rec.diagnosis.replace(/ \(HACKED\)/g, '');
                    dbRecord.diagnosis = originalDiagnosis;
                    await dbRecord.save();
                    
                    rec.diagnosis = originalDiagnosis;
                }
                cleanRecords.push(rec);
            }
            
            block.records = cleanRecords;
            // Update previousHash to match actual previous block hash in the database
            block.previousHash = dbBlocks[i - 1].hash;

            // Recompute valid block hash
            const b = new (require('./blockchain').Block)(
                block.index,
                block.timestamp,
                block.records,
                block.previousHash
            );
            b.nonce = block.nonce;
            b.hash = b.calculateHash();
            
            block.hash = b.hash;
            await block.save();
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
        
        const allDbBlocks = await BlockModel.find().sort({ index: 1 });
        if (allDbBlocks.length <= 1) {
            await syncBlockchainWithDatabase();
            return;
        }

        const newChain = [allDbBlocks[0]]; // start with Genesis block
        
        for (let i = 1; i < allDbBlocks.length; i++) {
            const dbBlock = allDbBlocks[i];
            let activeRecords = [];
            
            for (let rec of dbBlock.records) {
                const patientExists = await User.exists({ _id: rec.patientId });
                const doctorExists = await User.exists({ _id: rec.doctorId });
                const recordExists = await Record.exists({ _id: rec.recordId });
                if (patientExists && doctorExists && recordExists) {
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
        await BlockModel.deleteMany({});
        for (const block of newChain) {
            const dbBlock = new BlockModel({
                index: block.index,
                timestamp: block.timestamp,
                records: block.records,
                previousHash: block.previousHash,
                nonce: block.nonce,
                hash: block.hash
            });
            await dbBlock.save();
        }

        // Update remaining records in MongoDB with new block index
        for (const block of newChain) {
            if (block.index === 0) continue;
            const recordIds = block.records.map(r => r.recordId).filter(id => id !== undefined);
            
            await Record.updateMany(
                { _id: { $in: recordIds } },
                { $set: { isMined: true, blockIndex: block.index } }
            );
            
            await AuditLog.updateMany(
                { _id: { $in: recordIds } },
                { $set: { isMined: true, blockIndex: block.index } }
            );
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
        const userToDelete = await User.findById(userId);
        if (!userToDelete) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Delete user
        await User.findByIdAndDelete(userId);

        // Clean up records/logs if they are a patient or doctor
        if (userToDelete.role === 'patient') {
            await Record.deleteMany({ patientId: userId });
            await AuditLog.deleteMany({ patientId: userId });
        } else if (userToDelete.role === 'doctor') {
            await Record.deleteMany({ doctorId: userId });
            await AuditLog.deleteMany({ doctorId: userId });
        }

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

