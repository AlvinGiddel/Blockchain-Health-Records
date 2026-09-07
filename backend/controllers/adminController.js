const jwt = require('jsonwebtoken');
const adminRepo = require('../repositories/adminRepository');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
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
const getLicenseStatusHandler = catchAsync(async (req, res) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        throw new AppError('Authentication token required.', 401);
    }
    const token = authHeader.substring(7).trim();
    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
        throw new AppError('Invalid or expired authentication token.', 401);
    }
    if (!decoded || decoded.role !== 'super_admin') {
        throw new AppError('Access restricted to Super Administrators only.', 403);
    }

    const licenseInfo = getLicenseStatus();
    res.json({
        success: true,
        license: licenseInfo,
        serverTimestamp: getKenyanTimestamp()
    });
});

/**
 * 2. Super Admin Live License Refresh Trigger
 * POST /api/license/refresh
 */
const refreshLicenseHandler = catchAsync(async (req, res) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        throw new AppError('Authentication token required.', 401);
    }
    const token = authHeader.substring(7).trim();
    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
        throw new AppError('Invalid or expired authentication token.', 401);
    }
    if (!decoded || decoded.role !== 'super_admin') {
        throw new AppError('Access restricted to Super Administrators only.', 403);
    }

    console.log('[License Service] Super Admin manually triggered live license authority ping...');
    const updatedStatus = await checkLicense();
    res.json({
        success: true,
        message: 'License authority ping executed successfully.',
        license: updatedStatus,
        serverTimestamp: getKenyanTimestamp()
    });
});

/**
 * 3. Super Admin Instant License Simulation / Override Endpoint
 * POST /api/license/simulate
 */
const simulateLicenseHandler = catchAsync(async (req, res) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        throw new AppError('Authentication token required.', 401);
    }
    const token = authHeader.substring(7).trim();
    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
        throw new AppError('Invalid or expired authentication token.', 401);
    }
    if (!decoded || decoded.role !== 'super_admin') {
        throw new AppError('Access restricted to Super Administrators only.', 403);
    }

    const { targetStatus, reason } = req.body;
    if (!targetStatus || !['active', 'disabled'].includes(targetStatus)) {
        throw new AppError("targetStatus must be 'active' or 'disabled'.", 400);
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
});

/**
 * 4. Get system audit logs
 * GET /api/audit/logs, GET /api/audit-logs
 */
const getAuditLogs = catchAsync(async (req, res) => {
    const { isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);
    const { patientId } = req.query;

    if (!targetOrgId && !isSuperAdmin) {
        throw new AppError('Authentication required to access audit logs.', 401);
    }

    const logs = await adminRepo.getAuditLogs({
        orgId: targetOrgId,
        isSuperAdmin,
        patientId
    });

    res.json(logs);
});

/**
 * 5. Privacy-Preserving Public Health Analytics
 * GET /api/analytics/public-health
 */
const getPublicHealthAnalytics = catchAsync(async (req, res) => {
    const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);
    if (!currentUser) {
        throw new AppError('Authentication required to access health analytics.', 401);
    }

    let doctors = [];
    let patients = [];
    let recordsList = [];
    let blocksList = [];
    let breakGlassLogs = [];

    if (targetOrgId || isSuperAdmin) {
        const datasets = await adminRepo.getPublicHealthAnalytics({
            orgId: targetOrgId,
            isSuperAdmin
        });
        doctors = datasets.doctors;
        patients = datasets.patients;
        recordsList = datasets.recordsList;
        blocksList = datasets.blocksList;
        breakGlassLogs = datasets.breakGlassLogs;
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
});

/**
 * 6. Admin Dashboard stats consolidation endpoint
 * GET /api/admin/stats
 */
async function getAdminStats(req, res, dependencies = {}) {
    const { validateMultiTenantChains = null, healthBlockchain = null } = dependencies;
    const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);

    if (targetOrgId) {
        const stats = await adminRepo.getAdminStats({ orgId: targetOrgId });
        const isValid = validateMultiTenantChains ? await validateMultiTenantChains(targetOrgId) : true;
        return res.json({
            ...stats,
            isValid
        });
    }

    if (isSuperAdmin) {
        const stats = await adminRepo.getAdminStats({ isSuperAdmin: true });
        const mempoolCount = healthBlockchain ? healthBlockchain.pendingRecords.length : 0;
        const isValid = validateMultiTenantChains ? await validateMultiTenantChains() : true;
        return res.json({
            ...stats,
            mempool: mempoolCount,
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

    throw new AppError('Authentication required.', 401);
}

/**
 * 7. Get Pending Doctors (filtering out rejected ones)
 * GET /api/admin/doctors/pending
 */
const getPendingDoctors = catchAsync(async (req, res) => {
    const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);

    if (!isSuperAdmin && !targetOrgId && currentUser) {
        return res.json([]);
    }
    if (!currentUser) {
        throw new AppError('Authentication required.', 401);
    }

    const pendingDoctors = await adminRepo.getPendingDoctors(targetOrgId);
    const formatted = pendingDoctors.map(d => ({
        ...d,
        doctorProfile: parseJsonIfNeeded(d.doctorProfile)
    }));
    res.json(formatted);
});

/**
 * 8. Approve Pending Doctor
 * POST /api/admin/doctors/approve/:id
 */
const approveDoctor = catchAsync(async (req, res) => {
    const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);
    if (!currentUser) {
        throw new AppError('Authentication token required.', 401);
    }
    if (!isSuperAdmin && currentUser.role !== 'admin') {
        throw new AppError('Access restricted to Administrators only.', 403);
    }

    const doctorId = req.params.id;
    const docToApprove = await adminRepo.findDoctorById(doctorId);
    if (!docToApprove) {
        throw new AppError('Doctor registration request not found.', 404);
    }

    // Clinic Admin can only approve doctors for their own facility
    if (!isSuperAdmin && docToApprove.organization_id && docToApprove.organization_id !== targetOrgId) {
        throw new AppError('Cannot approve doctors outside your organization.', 403);
    }

    const updatedDoctor = await adminRepo.updateDoctorStatus(doctorId, 'approve');

    // Log doctor approval in audit trail (in background)
    logAuditEvent('doctor_approve', null, null, updatedDoctor.id, updatedDoctor.name, `Doctor registration request for Dr. ${updatedDoctor.name} (${updatedDoctor.email}) approved.`, null, updatedDoctor.organization_id || targetOrgId);

    // Send Email notification for approval (asynchronously in background)
    sendDoctorApprovalEmail(updatedDoctor.email, updatedDoctor.name).catch(mailError => {
        console.error('Failed to send approval email in background:', mailError);
    });

    console.log(`Doctor ${updatedDoctor.name} (${updatedDoctor.email}) approved by administrator (${currentUser.email}).`);
    res.json({ success: true, message: `Doctor Dr. ${updatedDoctor.name} successfully approved.` });
});

/**
 * 9. Reject Pending Doctor
 * POST /api/admin/doctors/reject/:id
 */
const rejectDoctor = catchAsync(async (req, res) => {
    const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);
    if (!currentUser) {
        throw new AppError('Authentication token required.', 401);
    }
    if (!isSuperAdmin && currentUser.role !== 'admin') {
        throw new AppError('Access restricted to Administrators only.', 403);
    }

    const doctorId = req.params.id;
    const docToReject = await adminRepo.findDoctorById(doctorId);
    if (!docToReject) {
        throw new AppError('Doctor registration request not found.', 404);
    }

    // Clinic Admin can only reject doctors for their own facility
    if (!isSuperAdmin && docToReject.organization_id && docToReject.organization_id !== targetOrgId) {
        throw new AppError('Cannot reject doctors outside your organization.', 403);
    }

    const updatedDoctor = await adminRepo.updateDoctorStatus(doctorId, 'reject');

    // Log doctor rejection in audit trail (in background)
    logAuditEvent('doctor_reject', null, null, updatedDoctor.id, updatedDoctor.name, `Doctor registration request for Dr. ${updatedDoctor.name} (${updatedDoctor.email}) rejected.`, null, updatedDoctor.organization_id || targetOrgId);

    // Send Email notification for rejection (asynchronously in background)
    sendDoctorRejectionEmail(updatedDoctor.email, updatedDoctor.name).catch(mailError => {
        console.error('Failed to send rejection email in background:', mailError);
    });

    console.log(`Doctor ${updatedDoctor.name} (${updatedDoctor.email}) rejected by administrator (${currentUser.email}).`);
    res.json({ success: true, message: `Doctor Dr. ${updatedDoctor.name} successfully rejected.` });
});

/**
 * 10. Get Pending Admins (filtering out rejected ones)
 * GET /api/admin/pending
 */
const getPendingAdmins = catchAsync(async (req, res) => {
    const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);

    if (!isSuperAdmin && !targetOrgId && currentUser) {
        return res.json([]);
    }
    if (!currentUser) {
        throw new AppError('Authentication required.', 401);
    }

    const pendingAdmins = await adminRepo.getPendingAdmins(targetOrgId);
    res.json(pendingAdmins);
});

/**
 * 11. Get All Registered Hospital Administrators (Super Admin Authority)
 * GET /api/admin/all
 */
const getAllAdmins = catchAsync(async (req, res) => {
    const { currentUser, isSuperAdmin } = getRequesterOrgScope(req);
    if (!currentUser) {
        throw new AppError('Authentication token required.', 401);
    }
    if (!isSuperAdmin) {
        throw new AppError('Access restricted to Super Administrators only.', 403);
    }

    const admins = await adminRepo.getAllAdmins();
    res.json(admins);
});

/**
 * 12. Approve Pending Admin
 * POST /api/admin/approve/:id
 */
const approveAdmin = catchAsync(async (req, res) => {
    const { currentUser, isSuperAdmin } = getRequesterOrgScope(req);
    if (!currentUser) {
        throw new AppError('Authentication token required.', 401);
    }
    if (!isSuperAdmin) {
        throw new AppError('Access restricted to Super Administrators only.', 403);
    }

    const adminId = req.params.id;
    const updatedAdmin = await adminRepo.updateUserApprovalStatus(adminId, 'approve');
    if (!updatedAdmin) {
        throw new AppError('Admin registration request not found.', 404);
    }

    // Resolve administrator's real name
    let adminActorName = currentUser.name;
    if (!adminActorName && currentUser.id) {
        try {
            const u = await adminRepo.findUserById(currentUser.id);
            if (u && u.name) adminActorName = u.name;
        } catch (e) { }
    }
    if (!adminActorName) adminActorName = 'Super Administrator';

    // Log admin approval in audit trail (in background)
    adminRepo.createAuditLog({
        organizationId: updatedAdmin.organization_id || null,
        eventType: 'admin_approve',
        doctorId: currentUser.id,
        doctorName: adminActorName,
        details: `Admin registration request for ${updatedAdmin.name} (${updatedAdmin.email}) approved by ${adminActorName}.`
    }).catch(err => console.error('Failed to log admin approval audit:', err));

    console.log(`Admin ${updatedAdmin.name} (${updatedAdmin.email}) approved by Super Administrator.`);
    res.json({ success: true, message: `Administrator ${updatedAdmin.name} successfully approved.` });
});

/**
 * 13. Reject Pending Admin
 * POST /api/admin/reject/:id
 */
const rejectAdmin = catchAsync(async (req, res) => {
    const { currentUser, isSuperAdmin } = getRequesterOrgScope(req);
    if (!currentUser) {
        throw new AppError('Authentication token required.', 401);
    }
    if (!isSuperAdmin) {
        throw new AppError('Access restricted to Super Administrators only.', 403);
    }

    const adminId = req.params.id;
    const updatedAdmin = await adminRepo.updateUserApprovalStatus(adminId, 'reject');
    if (!updatedAdmin) {
        throw new AppError('Admin registration request not found.', 404);
    }

    // Resolve administrator's real name
    let adminActorName = currentUser.name;
    if (!adminActorName && currentUser.id) {
        try {
            const u = await adminRepo.findUserById(currentUser.id);
            if (u && u.name) adminActorName = u.name;
        } catch (e) { }
    }
    if (!adminActorName) adminActorName = 'Super Administrator';

    // Log admin rejection in audit trail (in background)
    adminRepo.createAuditLog({
        organizationId: updatedAdmin.organization_id || null,
        eventType: 'admin_reject',
        doctorId: currentUser.id,
        doctorName: adminActorName,
        details: `Admin registration request for ${updatedAdmin.name} (${updatedAdmin.email}) rejected by ${adminActorName}.`
    }).catch(err => console.error('Failed to log admin rejection audit:', err));

    console.log(`Admin ${updatedAdmin.name} (${updatedAdmin.email}) rejected by Super Administrator.`);
    res.json({ success: true, message: `Administrator ${updatedAdmin.name} successfully rejected.` });
});

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

        const allDbBlocks = await adminRepo.getBlocksForOrg(targetOrgId);
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
                const exists = await adminRepo.checkRecordEntitiesExist(rec.patientId, rec.doctorId, rec.recordId);
                if (exists) {
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
        await adminRepo.deleteBlocksForOrg(targetOrgId);
        for (const block of newChain) {
            await adminRepo.insertBlock({
                organizationId: targetOrgId,
                index: block.index,
                timestamp: block.timestamp,
                records: block.records,
                previousHash: block.previousHash || block.previous_hash || '0',
                nonce: block.nonce,
                hash: block.hash
            });
        }

        // Update remaining records in PostgreSQL with new block index for this organization
        for (const block of newChain) {
            if (block.index === 0) continue;
            const recordIds = block.records.map(r => r.recordId).filter(Boolean);
            if (recordIds.length > 0) {
                await adminRepo.updateMinedRecordsForOrg(targetOrgId, block.index, recordIds);
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
 */
async function deleteUser(req, res, dependencies = {}) {
    const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);
    if (!currentUser) {
        throw new AppError('Authentication token required.', 401);
    }
    if (!isSuperAdmin && currentUser.role !== 'admin') {
        throw new AppError('Access restricted to Administrators only.', 403);
    }

    const userId = req.params.id;
    if (currentUser.id === userId) {
        throw new AppError('You cannot delete your own account.', 400);
    }

    const userToDelete = await adminRepo.findUserById(userId);
    if (!userToDelete) {
        throw new AppError('User not found.', 404);
    }

    if (userToDelete.role === 'super_admin') {
        throw new AppError('Super Administrator accounts cannot be deleted.', 403);
    }

    // Clinic admin can only delete users belonging to their hospital
    if (!isSuperAdmin && userToDelete.organization_id && userToDelete.organization_id !== targetOrgId) {
        throw new AppError('Cannot delete users outside your organization.', 403);
    }

    const affectedOrgId = userToDelete.organization_id || targetOrgId || null;

    // Delete user (cascade foreign keys will clean up appointments/records/logs automatically)
    await adminRepo.deleteUser(userId);

    // Rebuild blockchain scoped strictly to the affected organization only
    if (affectedOrgId) {
        await rebuildChainAfterDeletion(affectedOrgId, dependencies);
    }

    console.log(`User ${userToDelete.name} (${userToDelete.role}) removed from system database by ${currentUser.email}.`);
    res.json({ success: true, message: `User ${userToDelete.name} successfully removed from the system. Blockchain ledger updated.` });
}

/**
 * 15. Get Patients
 * GET /api/users/patients
 */
const getPatients = catchAsync(async (req, res) => {
    const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);

    if (!targetOrgId && !isSuperAdmin) {
        throw new AppError('Authentication required to list patients.', 401);
    }

    const patients = await adminRepo.getPatientsByOrg({ orgId: targetOrgId, isSuperAdmin });
    const formatted = patients.map(p => ({
        ...p,
        patientProfile: parseJsonIfNeeded(p.patientProfile)
    }));
    res.json(formatted);
});

/**
 * 16. Get Doctors (only approved ones)
 * GET /api/users/doctors
 */
const getDoctors = catchAsync(async (req, res) => {
    const { currentUser, isSuperAdmin, targetOrgId } = getRequesterOrgScope(req);
    const requestedOrgId = req.query.orgId || req.query.organizationId;

    if (!currentUser && !requestedOrgId && !targetOrgId && !isSuperAdmin) {
        throw new AppError('Authentication required to list doctors.', 401);
    }

    const doctors = await adminRepo.getDoctorsByOrg({
        orgId: targetOrgId,
        isSuperAdmin,
        requestedOrgId,
        isPatient: currentUser?.role === 'patient',
        patientId: currentUser?.id
    });

    const formatted = doctors.map(d => ({
        ...d,
        doctorProfile: parseJsonIfNeeded(d.doctorProfile)
    }));
    res.json(formatted);
});

/**
 * 17. Universal Profile Photo Update
 * POST /api/users/update-profile-photo
 */
const updateProfilePhoto = catchAsync(async (req, res) => {
    const { currentUser, isSuperAdmin } = getRequesterOrgScope(req);
    const { userId, profilePhoto } = req.body;
    if (!userId) {
        throw new AppError('User ID is required.', 400);
    }
    if (!currentUser) {
        throw new AppError('Authentication required.', 401);
    }
    if (currentUser.id !== userId && !isSuperAdmin) {
        throw new AppError('Cannot update profile photo for another user.', 403);
    }

    const user = await adminRepo.findUserById(userId);
    if (!user) {
        throw new AppError('Account not found.', 404);
    }

    let doctorProfile = null;
    if (user.role === 'doctor') {
        doctorProfile = parseJsonIfNeeded(user.doctor_profile) || {};
        doctorProfile.profilePhoto = profilePhoto || null;
    }

    const updatedUser = await adminRepo.updateUserProfilePhoto(userId, profilePhoto, user.role === 'doctor', doctorProfile);

    const isPat = user.role === 'patient';
    adminRepo.createAuditLog({
        organizationId: user.organization_id || null,
        eventType: 'profile_photo_update',
        patientId: isPat ? user.id : null,
        patientName: isPat ? user.name : null,
        doctorId: !isPat ? user.id : null,
        doctorName: !isPat ? user.name : null,
        details: `User ${user.name} (${user.role}) updated their profile picture.`
    }).catch(err => console.error('Failed to log profile photo update audit:', err));

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
});

/**
 * 18. Update patient profile / vitals
 * PUT /api/users/patient/profile
 */
const updatePatientProfile = catchAsync(async (req, res) => {
    const { currentUser, isSuperAdmin } = getRequesterOrgScope(req);
    const { userId, name, age, gender, bloodType, allergies, phone } = req.body;
    if (!userId) {
        throw new AppError('User ID is required.', 400);
    }
    if (!currentUser) {
        throw new AppError('Authentication required.', 401);
    }
    if (currentUser.id !== userId && !isSuperAdmin) {
        throw new AppError('Cannot update profile for another user.', 403);
    }

    const user = await adminRepo.findUserById(userId);
    if (!user || user.role !== 'patient') {
        throw new AppError('Patient not found.', 404);
    }

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
        const allOtherUsers = await adminRepo.getAllOtherUserProfiles(userId);
        const isPhoneTaken = allOtherUsers.some(u => {
            const pProf = parseProfile(u.patient_profile);
            const dProf = parseProfile(u.doctor_profile);
            const exPhones = [pProf.phone, dProf.phone].map(p => normalizePhone(String(p || ''))).filter(Boolean);
            return exPhones.includes(checkPhone);
        });
        if (isPhoneTaken) {
            throw new AppError('Update failed: This phone number is already registered to another account.', 400);
        }
    }

    const updatedName = name || user.name;
    const updatedUser = await adminRepo.updatePatientProfile(userId, updatedName, profile);

    adminRepo.createAuditLog({
        organizationId: updatedUser.organization_id || null,
        eventType: 'profile_update',
        patientId: updatedUser.id,
        patientName: updatedUser.name,
        details: `Patient ${updatedUser.name} updated their personal profile & health vitals.`
    }).catch(err => console.error('Failed to log profile update audit:', err));

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
});

/**
 * 19. Update doctor profile details
 * PUT /api/users/doctor/profile
 */
const updateDoctorProfile = catchAsync(async (req, res) => {
    const { currentUser, isSuperAdmin } = getRequesterOrgScope(req);
    const { userId, name, specialization, licenseNumber, hospital, yearsOfExperience, phone, profilePhoto } = req.body;
    if (!userId) {
        throw new AppError('User ID is required.', 400);
    }
    if (!currentUser) {
        throw new AppError('Authentication required.', 401);
    }
    if (currentUser.id !== userId && !isSuperAdmin) {
        throw new AppError('Cannot update clinical profile for another doctor.', 403);
    }

    const user = await adminRepo.findUserById(userId);
    if (!user || user.role !== 'doctor') {
        throw new AppError('Doctor not found.', 404);
    }

    let profile = user.doctor_profile || {};

    if (profile.hasEditedProfile && !isSuperAdmin) {
        throw new AppError('Clinical profile can only be edited once. Updates are locked.', 403);
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
            const allOtherUsers = await adminRepo.getAllOtherUserProfiles(userId);
            const isPhoneTaken = allOtherUsers.some(u => {
                const pProf = parseProfile(u.patient_profile);
                const dProf = parseProfile(u.doctor_profile);
                const exPhones = [pProf.phone, dProf.phone].map(p => normalizePhone(String(p || ''))).filter(Boolean);
                return exPhones.includes(checkPhone);
            });
            if (isPhoneTaken) {
                throw new AppError('Update failed: This phone number is already registered to another account.', 400);
            }
        }
    }

    profile.hasEditedProfile = true;
    const updatedName = name || user.name;

    const updatedUser = await adminRepo.updateDoctorProfile(userId, updatedName, profile);

    adminRepo.createAuditLog({
        organizationId: user.organization_id || null,
        eventType: 'profile_update',
        doctorId: updatedUser.id,
        doctorName: updatedUser.name,
        details: `Dr. ${updatedUser.name} updated their clinical profile details.`
    }).catch(err => console.error('Failed to log doctor profile update audit:', err));

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
});

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
