const jwt = require('jsonwebtoken');
const db = require('../db');
const { Block } = require('../blockchain');
const {
    getRequesterOrgScope,
    parseJsonIfNeeded,
    logAuditEvent,
    getKenyanTimestamp,
    normalizePhone,
    parseProfile
} = require('../utils/helpers');
const {
    sendDoctorApprovalEmail,
    sendDoctorRejectionEmail
} = require('../mailer');
const {
    getLicenseStatus,
    checkLicense
} = require('../services/licenseCheck');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

/**
 * 1. Remote License Diagnostic Route (Super-Admin Only)
 * GET /api/license/status
 */
function getLicenseStatusHandler(req, res) {
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
}

/**
 * 2. Super Admin Live License Refresh Trigger
 * POST /api/license/refresh
 */
async function refreshLicenseHandler(req, res) {
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
}

/**
 * 3. Super Admin Instant License Simulation / Override Endpoint
 * POST /api/license/simulate
 */
function simulateLicenseHandler(req, res) {
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

        if (!global.licenseStatus) {
            global.licenseStatus = {};
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
        res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }
}

/**
 * 4. Get system audit logs
 * GET /api/audit/logs, GET /api/audit-logs
 */
async function getAuditLogs(req, res) {
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
}

/**
 * 5. Privacy-Preserving Public Health Analytics
 * GET /api/analytics/public-health
 */
async function getPublicHealthAnalytics(req, res) {
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
            return res.json({
                totalPatients: 0,
                totalDoctors: 0,
                totalRecords: 0,
                totalBlocks: 0,
                unminedMempool: 0,
                breakGlassEvents: 0,
                patientDemographics: { bloodTypes: {}, genders: {} },
                recentPatients: [],
                activeDoctors: [],
                unassignedScope: true,
                message: 'No healthcare facility currently affiliated with this administrator account. Please register your clinic or contact platform governance.'
            });
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
}

/**
 * 6. Admin Dashboard stats consolidation endpoint
 * GET /api/admin/stats
 */
async function getAdminStats(req, res, dependencies = {}) {
    const { validateMultiTenantChains = null, healthBlockchain = null } = dependencies;
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

            const isValid = validateMultiTenantChains ? await validateMultiTenantChains(targetOrgId) : true;

            return res.json({
                totalAppointments: parseInt(aCount[0].count),
                pendingAppointments: parseInt(pACount[0].count),
                completedConsultations: parseInt(cCCount[0].count),
                blocks: parseInt(bCount[0].count),
                mempool: 0,
                doctors: parseInt(dCount[0].count),
                patients: parseInt(paCount[0].count),
                admins: parseInt(admCount[0]?.count || 0),
                isValid
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

            const mempoolCount = healthBlockchain ? healthBlockchain.pendingRecords.length : 0;
            const isValid = validateMultiTenantChains ? await validateMultiTenantChains() : true;

            return res.json({
                totalAppointments: parseInt(aCount[0].count),
                pendingAppointments: parseInt(pACount[0].count),
                completedConsultations: parseInt(cCCount[0].count),
                blocks: parseInt(bCount[0].count),
                mempool: mempoolCount,
                doctors: parseInt(dCount[0].count),
                patients: parseInt(paCount[0].count),
                admins: parseInt(admCount[0]?.count || 0),
                isValid
            });
        }

        if (currentUser) {
            return res.json({
                totalAppointments: 0,
                pendingAppointments: 0,
                completedConsultations: 0,
                blocks: 0,
                mempool: 0,
                doctors: 0,
                patients: 0,
                admins: 1,
                isValid: true
            });
        }

        return res.status(401).json({ error: 'Authentication required.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

/**
 * 7. Get Pending Doctors (filtering out rejected ones)
 * GET /api/admin/doctors/pending
 */
async function getPendingDoctors(req, res) {
    try {
        const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);

        let query;
        let params = [];
        if (targetOrgId) {
            query = 'SELECT id, name, email, role, public_key as "publicKey", profile_photo as "profilePhoto", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE organization_id = $1 AND role = \'doctor\' AND is_approved = false AND is_rejected = false ORDER BY created_at DESC;';
            params = [targetOrgId];
        } else if (isSuperAdmin) {
            query = 'SELECT id, name, email, role, public_key as "publicKey", profile_photo as "profilePhoto", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE role = \'doctor\' AND is_approved = false AND is_rejected = false ORDER BY created_at DESC;';
        } else if (currentUser) {
            return res.json([]);
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
}

/**
 * 8. Approve Pending Doctor
 * POST /api/admin/doctors/approve/:id
 *
 * CRITICAL SECURITY FIX: Enforces authentication (Super Admin or Clinic Admin for their clinic)
 */
async function approveDoctor(req, res) {
    try {
        const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);
        if (!currentUser) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }
        if (!isSuperAdmin && currentUser.role !== 'admin') {
            return res.status(403).json({ error: 'Access restricted to Administrators only.' });
        }

        const doctorId = req.params.id;
        const { rows: existingDocs } = await db.query('SELECT * FROM users WHERE id = $1 AND role = \'doctor\'', [doctorId]);
        if (existingDocs.length === 0) {
            return res.status(404).json({ error: 'Doctor registration request not found.' });
        }
        const docToApprove = existingDocs[0];

        // Clinic Admin can only approve doctors for their own facility
        if (!isSuperAdmin && docToApprove.organization_id && docToApprove.organization_id !== targetOrgId) {
            return res.status(403).json({ error: 'Cannot approve doctors outside your organization.' });
        }

        const { rows: updatedDoctors } = await db.query(
            'UPDATE users SET is_approved = true, is_rejected = false WHERE id = $1 RETURNING *',
            [doctorId]
        );
        const updatedDoctor = updatedDoctors[0];

        // Activate membership for doctor in tenant_memberships
        await db.query(
            "UPDATE tenant_memberships SET status = 'active' WHERE user_id = $1 AND role = 'doctor'",
            [doctorId]
        );

        // Log doctor approval in audit trail (in background)
        logAuditEvent('doctor_approve', null, null, updatedDoctor.id, updatedDoctor.name, `Doctor registration request for Dr. ${updatedDoctor.name} (${updatedDoctor.email}) approved.`, null, updatedDoctor.organization_id || targetOrgId);

        // Send Email notification for approval (asynchronously in background)
        sendDoctorApprovalEmail(updatedDoctor.email, updatedDoctor.name).catch(mailError => {
            console.error('Failed to send approval email in background:', mailError);
        });

        console.log(`Doctor ${updatedDoctor.name} (${updatedDoctor.email}) approved by administrator (${currentUser.email}).`);
        res.json({ success: true, message: `Doctor Dr. ${updatedDoctor.name} successfully approved.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

/**
 * 9. Reject Pending Doctor
 * POST /api/admin/doctors/reject/:id
 *
 * CRITICAL SECURITY FIX: Enforces authentication (Super Admin or Clinic Admin for their clinic)
 */
async function rejectDoctor(req, res) {
    try {
        const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);
        if (!currentUser) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }
        if (!isSuperAdmin && currentUser.role !== 'admin') {
            return res.status(403).json({ error: 'Access restricted to Administrators only.' });
        }

        const doctorId = req.params.id;
        const { rows: existingDocs } = await db.query('SELECT * FROM users WHERE id = $1 AND role = \'doctor\'', [doctorId]);
        if (existingDocs.length === 0) {
            return res.status(404).json({ error: 'Doctor registration request not found.' });
        }
        const docToReject = existingDocs[0];

        // Clinic Admin can only reject doctors for their own facility
        if (!isSuperAdmin && docToReject.organization_id && docToReject.organization_id !== targetOrgId) {
            return res.status(403).json({ error: 'Cannot reject doctors outside your organization.' });
        }

        const { rows: updatedDoctors } = await db.query(
            'UPDATE users SET is_approved = false, is_rejected = true WHERE id = $1 RETURNING *',
            [doctorId]
        );
        const updatedDoctor = updatedDoctors[0];

        // Disable membership for doctor in tenant_memberships
        await db.query(
            "UPDATE tenant_memberships SET status = 'disabled' WHERE user_id = $1 AND role = 'doctor'",
            [doctorId]
        );

        // Log doctor rejection in audit trail (in background)
        logAuditEvent('doctor_reject', null, null, updatedDoctor.id, updatedDoctor.name, `Doctor registration request for Dr. ${updatedDoctor.name} (${updatedDoctor.email}) rejected.`, null, updatedDoctor.organization_id || targetOrgId);

        // Send Email notification for rejection (asynchronously in background)
        sendDoctorRejectionEmail(updatedDoctor.email, updatedDoctor.name).catch(mailError => {
            console.error('Failed to send rejection email in background:', mailError);
        });

        console.log(`Doctor ${updatedDoctor.name} (${updatedDoctor.email}) rejected by administrator (${currentUser.email}).`);
        res.json({ success: true, message: `Doctor Dr. ${updatedDoctor.name} successfully rejected.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

/**
 * 10. Get Pending Admins (filtering out rejected ones)
 * GET /api/admin/pending
 */
async function getPendingAdmins(req, res) {
    try {
        const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);

        let query;
        let params = [];
        if (targetOrgId) {
            query = 'SELECT id, name, email, role, public_key as "publicKey", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE organization_id = $1 AND role = \'admin\' AND is_approved = false AND is_rejected = false ORDER BY created_at DESC;';
            params = [targetOrgId];
        } else if (isSuperAdmin) {
            query = 'SELECT id, name, email, role, public_key as "publicKey", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE role = \'admin\' AND is_approved = false AND is_rejected = false ORDER BY created_at DESC;';
        } else if (currentUser) {
            return res.json([]);
        } else {
            return res.status(401).json({ error: 'Authentication required.' });
        }

        const { rows: pendingAdmins } = await db.query(query, params);
        res.json(pendingAdmins);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

/**
 * 11. Get All Registered Hospital Administrators (Super Admin Authority)
 * GET /api/admin/all
 *
 * CRITICAL SECURITY FIX: Enforces Super Admin authentication
 */
async function getAllAdmins(req, res) {
    try {
        const { currentUser, isSuperAdmin } = getRequesterOrgScope(req);
        if (!currentUser) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }
        if (!isSuperAdmin) {
            return res.status(403).json({ error: 'Access restricted to Super Administrators only.' });
        }

        const { rows: admins } = await db.query(`
            SELECT 
                u.id, 
                u.name, 
                u.email, 
                u.role, 
                u.organization_id as "organizationId", 
                COALESCE(o.name, CASE WHEN u.role = 'super_admin' THEN 'Global Platform Governance' ELSE 'Unassigned Facility' END) as "organizationName",
                o.status as "organizationStatus",
                o.license_expires_at as "licenseExpiresAt",
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
}

/**
 * 12. Approve Pending Admin
 * POST /api/admin/approve/:id
 *
 * CRITICAL SECURITY FIX: Enforces Super Admin authentication
 */
async function approveAdmin(req, res) {
    try {
        const { currentUser, isSuperAdmin } = getRequesterOrgScope(req);
        if (!currentUser) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }
        if (!isSuperAdmin) {
            return res.status(403).json({ error: 'Access restricted to Super Administrators only.' });
        }

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
            `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [updatedAdmin.organization_id || null, 'admin_approve', null, null, currentUser.id, currentUser.name || 'Super Admin', `Admin registration request for ${updatedAdmin.name} (${updatedAdmin.email}) approved by Super Admin.`]
        ).catch(err => console.error('Failed to log admin approval audit:', err));

        console.log(`Admin ${updatedAdmin.name} (${updatedAdmin.email}) approved by Super Administrator.`);
        res.json({ success: true, message: `Administrator ${updatedAdmin.name} successfully approved.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

/**
 * 13. Reject Pending Admin
 * POST /api/admin/reject/:id
 *
 * CRITICAL SECURITY FIX: Enforces Super Admin authentication
 */
async function rejectAdmin(req, res) {
    try {
        const { currentUser, isSuperAdmin } = getRequesterOrgScope(req);
        if (!currentUser) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }
        if (!isSuperAdmin) {
            return res.status(403).json({ error: 'Access restricted to Super Administrators only.' });
        }

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
            `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [updatedAdmin.organization_id || null, 'admin_reject', null, null, currentUser.id, currentUser.name || 'Super Admin', `Admin registration request for ${updatedAdmin.name} (${updatedAdmin.email}) rejected by Super Admin.`]
        ).catch(err => console.error('Failed to log admin rejection audit:', err));

        console.log(`Admin ${updatedAdmin.name} (${updatedAdmin.email}) rejected by Super Administrator.`);
        res.json({ success: true, message: `Administrator ${updatedAdmin.name} successfully rejected.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

/**
 * Rebuilds the blockchain from scratch, filtering out records that belong to deleted users.
 * Recalculates hashes and indices to keep the chain valid and secure.
 */
async function rebuildChainAfterDeletion(targetOrgId, dependencies = {}) {
    const { syncBlockchainWithDatabase = null, healthBlockchain = null } = dependencies;
    try {
        console.log(`Rebuilding blockchain after user deletion for organization: ${targetOrgId || 'unassigned'}...`);

        // If user has no organization scope, skip blockchain rebuilding to avoid touching other tenant chains
        if (!targetOrgId) {
            if (syncBlockchainWithDatabase) await syncBlockchainWithDatabase();
            return;
        }

        const { rows: allDbBlocks } = await db.query(
            'SELECT * FROM blocks WHERE organization_id = $1 ORDER BY index ASC',
            [targetOrgId]
        );
        if (allDbBlocks.length <= 1) {
            if (syncBlockchainWithDatabase) await syncBlockchainWithDatabase();
            return;
        }

        const newChain = [allDbBlocks[0]]; // start with this tenant's Genesis block

        for (let i = 1; i < allDbBlocks.length; i++) {
            const dbBlock = allDbBlocks[i];
            let activeRecords = [];

            const parsedBlockRecs = parseJsonIfNeeded(dbBlock.records) || [];
            for (let rec of parsedBlockRecs) {
                const { rows: pRows } = await db.query('SELECT 1 FROM users WHERE id = $1', [rec.patientId]);
                const { rows: dRows } = await db.query('SELECT 1 FROM users WHERE id = $1', [rec.doctorId]);
                const { rows: rRows } = await db.query('SELECT 1 FROM records WHERE id = $1', [rec.recordId]);

                if (pRows.length > 0 && dRows.length > 0 && rRows.length > 0) {
                    activeRecords.push(rec);
                }
            }

            if (activeRecords.length > 0) {
                const prevBlock = newChain[newChain.length - 1];
                const b = new Block(
                    newChain.length,
                    dbBlock.timestamp,
                    activeRecords,
                    prevBlock.hash
                );
                const diff = healthBlockchain ? healthBlockchain.difficulty : 2;
                b.mineBlock(diff);
                newChain.push(b);
            }
        }

        // Save new chain to DB strictly scoped to this organization
        await db.query('DELETE FROM blocks WHERE organization_id = $1', [targetOrgId]);
        for (const block of newChain) {
            await db.query(
                'INSERT INTO blocks (organization_id, index, timestamp, records, previous_hash, nonce, hash) VALUES ($1, $2, $3, $4, $5, $6, $7)',
                [targetOrgId, block.index, block.timestamp, JSON.stringify(block.records), block.previousHash || block.previous_hash || '0', block.nonce, block.hash]
            );
        }

        // Update remaining records in PostgreSQL with new block index for this organization
        for (const block of newChain) {
            if (block.index === 0) continue;
            const recordIds = block.records.map(r => r.recordId).filter(Boolean);
            if (recordIds.length > 0) {
                await db.query('UPDATE records SET is_mined = true, block_index = $1 WHERE id = ANY($2::uuid[]) AND organization_id = $3', [block.index, recordIds, targetOrgId]);
                await db.query('UPDATE audit_logs SET is_mined = true, block_index = $1 WHERE patient_id = ANY($2::uuid[]) AND organization_id = $3', [block.index, recordIds, targetOrgId]);
            }
        }

        if (syncBlockchainWithDatabase) await syncBlockchainWithDatabase();
        console.log(`Blockchain successfully rebuilt for organization ${targetOrgId}.`);
    } catch (err) {
        console.error('Error rebuilding blockchain after deletion:', err);
    }
}

/**
 * 14. DELETE User (Node / Operator cleanup)
 * DELETE /api/users/:id
 *
 * CRITICAL SECURITY FIX:
 * Enforces authentication. Only Super Admin or Clinic Admin (for their own clinic's users) can delete.
 * Cannot delete yourself. Cannot delete super_admin accounts.
 */
async function deleteUser(req, res, dependencies = {}) {
    try {
        const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);
        if (!currentUser) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }
        if (!isSuperAdmin && currentUser.role !== 'admin') {
            return res.status(403).json({ error: 'Access restricted to Administrators only.' });
        }

        const userId = req.params.id;
        if (currentUser.id === userId) {
            return res.status(400).json({ error: 'You cannot delete your own account.' });
        }

        const { rows: users } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }
        const userToDelete = users[0];

        if (userToDelete.role === 'super_admin') {
            return res.status(403).json({ error: 'Super Administrator accounts cannot be deleted.' });
        }

        // Clinic admin can only delete users belonging to their hospital
        if (!isSuperAdmin && userToDelete.organization_id && userToDelete.organization_id !== targetOrgId) {
            return res.status(403).json({ error: 'Cannot delete users outside your organization.' });
        }

        const affectedOrgId = userToDelete.organization_id || targetOrgId || null;

        // Delete user (cascade foreign keys will clean up appointments/records/logs automatically)
        await db.query('DELETE FROM users WHERE id = $1', [userId]);

        // Rebuild blockchain scoped strictly to the affected organization only
        if (affectedOrgId) {
            await rebuildChainAfterDeletion(affectedOrgId, dependencies);
        }

        console.log(`User ${userToDelete.name} (${userToDelete.role}) removed from system database by ${currentUser.email}.`);
        res.json({ success: true, message: `User ${userToDelete.name} successfully removed from the system. Blockchain ledger updated.` });
    } catch (err) {
        console.error('Delete user error:', err);
        res.status(500).json({ error: err.message || 'Failed to delete user.' });
    }
}

/**
 * 15. Get Patients
 * GET /api/users/patients
 */
async function getPatients(req, res) {
    try {
        const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);

        let query;
        let params = [];
        if (targetOrgId) {
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
}

/**
 * 16. Get Doctors (only approved ones)
 * GET /api/users/doctors
 */
async function getDoctors(req, res) {
    try {
        const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);
        const requestedOrgId = req.query.orgId || req.query.organizationId;

        let query;
        let params = [];
        if (targetOrgId && (!currentUser || currentUser.role !== 'patient' || !requestedOrgId)) {
            query = 'SELECT id, name, email, role, organization_id as "organizationId", public_key as "publicKey", profile_photo as "profilePhoto", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE organization_id = $1 AND role = \'doctor\' AND is_approved = true ORDER BY created_at DESC;';
            params = [targetOrgId];
        } else if (requestedOrgId) {
            query = 'SELECT id, name, email, role, organization_id as "organizationId", public_key as "publicKey", profile_photo as "profilePhoto", doctor_profile as "doctorProfile", is_approved as "isApproved", created_at as "createdAt" FROM users WHERE organization_id = $1 AND role = \'doctor\' AND is_approved = true ORDER BY created_at DESC;';
            params = [requestedOrgId];
        } else if (isSuperAdmin) {
            query = 'SELECT u.id, u.name, u.email, u.role, u.organization_id as "organizationId", o.name as "organizationName", o.status as "organizationStatus", u.public_key as "publicKey", u.profile_photo as "profilePhoto", u.doctor_profile as "doctorProfile", u.is_approved as "isApproved", u.created_at as "createdAt" FROM users u LEFT JOIN organizations o ON u.organization_id = o.id WHERE u.role = \'doctor\' AND u.is_approved = true ORDER BY u.created_at DESC;';
        } else if (currentUser && currentUser.role === 'patient') {
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
}

/**
 * 17. Universal Profile Photo Update
 * POST /api/users/update-profile-photo
 *
 * SECURITY FIX: Caller must be modifying their own profile or be Super Admin
 */
async function updateProfilePhoto(req, res) {
    try {
        const { currentUser, isSuperAdmin } = getRequesterOrgScope(req);
        const { userId, profilePhoto } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required.' });
        }
        if (!currentUser) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        if (currentUser.id !== userId && !isSuperAdmin) {
            return res.status(403).json({ error: 'Cannot update profile photo for another user.' });
        }

        const { rows: users } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'Account not found.' });
        }
        const user = users[0];

        await db.query('UPDATE users SET profile_photo = $1 WHERE id = $2', [profilePhoto || null, userId]);

        if (user.role === 'doctor') {
            const currentDocProfile = parseJsonIfNeeded(user.doctor_profile) || {};
            currentDocProfile.profilePhoto = profilePhoto || null;
            await db.query('UPDATE users SET doctor_profile = $1 WHERE id = $2', [JSON.stringify(currentDocProfile), userId]);
        }

        const { rows: updatedRows } = await db.query(
            'SELECT id, name, email, role, public_key as "publicKey", profile_photo as "profilePhoto", patient_profile as "patientProfile", doctor_profile as "doctorProfile", is_approved as "isApproved" FROM users WHERE id = $1',
            [userId]
        );
        const updatedUser = updatedRows[0];

        db.query(
            `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [user.organization_id || null, 'profile_photo_update', user.id, user.name, user.id, 'System', `User ${user.name} (${user.role}) updated their profile picture.`]
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
}

/**
 * 18. Update patient profile / vitals
 * PUT /api/users/patient/profile
 *
 * SECURITY FIX: Caller must be modifying their own profile or be Super Admin
 */
async function updatePatientProfile(req, res) {
    try {
        const { currentUser, isSuperAdmin } = getRequesterOrgScope(req);
        const { userId, name, age, gender, bloodType, allergies, phone } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required.' });
        }
        if (!currentUser) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        if (currentUser.id !== userId && !isSuperAdmin) {
            return res.status(403).json({ error: 'Cannot update profile for another user.' });
        }

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

        db.query(
            `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [updatedUser.organization_id || null, 'profile_update', updatedUser.id, updatedUser.name, updatedUser.id, 'Patient Self', `Patient ${updatedUser.name} updated their personal profile & health vitals.`]
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
}

/**
 * 19. Update doctor profile details
 * PUT /api/users/doctor/profile
 *
 * SECURITY FIX: Caller must be modifying their own profile or be Super Admin
 */
async function updateDoctorProfile(req, res) {
    try {
        const { currentUser, isSuperAdmin } = getRequesterOrgScope(req);
        const { userId, name, specialization, licenseNumber, hospital, yearsOfExperience, phone, profilePhoto } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'User ID is required.' });
        }
        if (!currentUser) {
            return res.status(401).json({ error: 'Authentication required.' });
        }
        if (currentUser.id !== userId && !isSuperAdmin) {
            return res.status(403).json({ error: 'Cannot update clinical profile for another doctor.' });
        }

        const { rows: users } = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
        if (users.length === 0 || users[0].role !== 'doctor') {
            return res.status(404).json({ error: 'Doctor not found.' });
        }
        const user = users[0];

        let profile = user.doctor_profile || {};

        if (profile.hasEditedProfile && !isSuperAdmin) {
            return res.status(403).json({ error: 'Clinical profile can only be edited once. Updates are locked.' });
        }

        if (specialization !== undefined) profile.specialization = specialization;
        if (licenseNumber !== undefined) profile.licenseNumber = licenseNumber;
        if (hospital !== undefined) profile.hospital = hospital;
        if (yearsOfExperience !== undefined) profile.yearsOfExperience = yearsOfExperience;
        if (phone !== undefined) profile.phone = phone;
        if (profilePhoto !== undefined) profile.profilePhoto = profilePhoto;

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

        profile.hasEditedProfile = true;
        const updatedName = name || user.name;

        const { rows: updatedUsers } = await db.query(
            'UPDATE users SET name = $1, doctor_profile = $2 WHERE id = $3 RETURNING *',
            [updatedName, JSON.stringify(profile), userId]
        );
        const updatedUser = updatedUsers[0];

        db.query(
            `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [user.organization_id || null, 'profile_update', updatedUser.id, 'Doctor Self', updatedUser.id, updatedUser.name, `Dr. ${updatedUser.name} updated their clinical profile details.`]
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
}

module.exports = {
    getLicenseStatusHandler,
    refreshLicenseHandler,
    simulateLicenseHandler,
    getAuditLogs,
    getPublicHealthAnalytics,
    getAdminStats,
    getPendingDoctors,
    approveDoctor,
    rejectDoctor,
    getPendingAdmins,
    getAllAdmins,
    approveAdmin,
    rejectAdmin,
    deleteUser,
    getPatients,
    getDoctors,
    updateProfilePhoto,
    updatePatientProfile,
    updateDoctorProfile
};
