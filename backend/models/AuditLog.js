const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    eventType: {
        type: String,
        enum: [
            'consent_grant', 'consent_revoke', 'record_access', 'record_create', 
            'admin_request', 'admin_approve', 'admin_reject', 
            'doctor_request', 'doctor_approve', 'doctor_reject',
            'password_change', 'password_reset_request', 'password_reset_complete',
            'appointment_request', 'appointment_confirm', 'appointment_decline', 'appointment_complete',
            'consultation_complete', 'availability_update', 'profile_update'
        ],
        required: true
    },
    patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    patientName: String,
    doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    doctorName: String,
    details: String,
    timestamp: {
        type: Date,
        default: Date.now
    },
    isMined: {
        type: Boolean,
        default: false
    },
    blockIndex: {
        type: Number,
        default: -1
    },
    signature: String
});

module.exports = mongoose.model('AuditLog', AuditLogSchema);
