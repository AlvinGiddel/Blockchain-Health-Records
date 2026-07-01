const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['patient', 'doctor', 'admin'],
        required: true
    },
    // Cryptographic keys used for Blockchain ledger signing/verification.
    // In production, private keys would reside strictly client-side.
    // For this research demonstration, we store them encrypted/hashed or secure in DB
    // to provide a seamless Web interface experience.
    publicKey: {
        type: String,
        required: true
    },
    privateKey: {
        type: String,
        required: true
    },
    patientProfile: {
        age: Number,
        gender: String,
        bloodType: String,
        allergies: [String],
        emergencyContact: String,
        phone: String
    },
    doctorProfile: {
        specialization: String,
        licenseNumber: String,
        hospital: String,
        yearsOfExperience: Number,
        profilePhoto: String,
        availability: {
            workingDays: {
                type: [String],
                default: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
            },
            workingHoursStart: {
                type: String,
                default: '08:00'
            },
            workingHoursEnd: {
                type: String,
                default: '17:00'
            },
            status: {
                type: String,
                enum: ['available', 'busy', 'on leave'],
                default: 'available'
            }
        }
    },
    isApproved: {
        type: Boolean,
        default: true
    },
    isRejected: {
        type: Boolean,
        default: false
    },
    resetPasswordToken: {
        type: String,
        required: false
    },
    resetPasswordExpires: {
        type: Date,
        required: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Hash password before saving to database
UserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (err) {
        next(err);
    }
});

// Helper method to compare password hash
UserSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);
