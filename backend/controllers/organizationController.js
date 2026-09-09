const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');
const orgRepo = require('../repositories/organizationsRepository');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const { Block, generateKeyPair } = require('../blockchain');
const {
    getKenyanTimestamp,
    logAuditEvent
} = require('../utils/helpers');
const {
    sendClinicApprovalEmail,
    sendClinicRejectionEmail
} = require('../mailer');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

/**
 * Helper to verify caller is super_admin
 */
function verifySuperAdminToken(req) {
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
    return decoded;
}

/**
 * Resolves the authenticated administrator's real name from token or database
 */
async function resolveAdminName(userId, tokenName, queryRunner = null) {
    if (tokenName && typeof tokenName === 'string' && tokenName.trim()) {
        return tokenName.trim();
    }
    if (userId) {
        try {
            const user = await orgRepo.findUserById(userId, queryRunner);
            if (user && user.name && user.name.trim()) {
                return user.name.trim();
            }
        } catch (e) {
            // fallback if lookup fails
        }
    }
    return 'Super Administrator';
}

/**
 * 1. Public list of active healthcare facilities (for registration and booking dropdowns)
 * GET /api/organizations/active
 */
const getActiveOrganizations = catchAsync(async (req, res) => {
    const orgs = await orgRepo.getActiveOrganizations();
    res.json(orgs);
});

/**
 * 2. List all organizations with metrics (Super Admin only)
 * GET /api/admin/organizations
 */
const getAdminOrganizations = catchAsync(async (req, res) => {
    verifySuperAdminToken(req);
    const orgs = await orgRepo.getAdminOrganizations();
    res.json({ success: true, organizations: orgs });
});

/**
 * 3. Get pending clinic approval requests (Super Admin only)
 * GET /api/admin/organizations/pending
 */
const getPendingOrganizations = catchAsync(async (req, res) => {
    verifySuperAdminToken(req);
    const pendingClinics = await orgRepo.getPendingOrganizations();
    res.json({ success: true, pendingClinics });
});

/**
 * 4. Approve a pending clinic registration (activates 7-day trial, Super Admin only)
 * POST /api/admin/organizations/:id/approve
 */
const approveOrganization = catchAsync(async (req, res) => {
    const decoded = verifySuperAdminToken(req);
    const { id } = req.params;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN;');

        // 1. Update organization: status = 'trial', license_expires_at = NOW() + 7 days
        const org = await orgRepo.updateOrganizationApproval(id, { status: 'trial' }, client);
        if (!org) {
            await client.query('ROLLBACK;');
            throw new AppError('Organization not found.', 404);
        }

        // 2. Update licenses table
        await orgRepo.updateLicenseStatus(id, {
            status: 'trial',
            expiresAt: org.license_expires_at
        }, client);

        // 3. Approve the clinic's admin user
        const adminUsers = await orgRepo.approveClinicAdmin(id, client);

        // 4. Update tenant_memberships
        const membershipRole = org.org_type === 'pharmacy' ? 'pharmacist' : 'admin';
        await orgRepo.updateTenantMembershipStatus(id, membershipRole, 'active', client);

        // 5. Audit log
        const adminActorName = await resolveAdminName(decoded.id, decoded.name, client);
        await orgRepo.createAuditLog({
            organizationId: id,
            eventType: org.org_type === 'pharmacy' ? 'pharmacy_approved' : 'clinic_approved',
            doctorId: decoded.id,
            doctorName: adminActorName,
            details: `${org.org_type === 'pharmacy' ? 'Pharmacy' : 'Clinic'} "${org.name}" approved by ${adminActorName}. Trial activated.`,
            timestamp: getKenyanTimestamp()
        }, client);

        await client.query('COMMIT;');

        // 6. Send approval email via mailer
        if (adminUsers.length > 0) {
            const admin = adminUsers[0];
            sendClinicApprovalEmail({
                email: admin.email,
                adminName: admin.name,
                clinicName: org.name
            }).catch(e => console.error('Failed to send facility approval email:', e));
        }

        res.json({
            success: true,
            message: `${org.org_type === 'pharmacy' ? 'Pharmacy' : 'Clinic'} "${org.name}" approved successfully! Trial activated.`,
            organization: org
        });
    } catch (err) {
        await client.query('ROLLBACK;').catch(() => { });
        throw err;
    } finally {
        client.release();
    }
});

/**
 * 5. Reject a pending clinic or pharmacy registration (sets status to disabled, Super Admin only)
 * POST /api/admin/organizations/:id/reject
 */
const rejectOrganization = catchAsync(async (req, res) => {
    const decoded = verifySuperAdminToken(req);
    const { id } = req.params;
    const { reason } = req.body || {};

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN;');

        // 1. Update organization: status = 'disabled'
        const org = await orgRepo.updateOrganizationStatus(id, { status: 'disabled' }, client);
        if (!org) {
            await client.query('ROLLBACK;');
            throw new AppError('Organization not found.', 404);
        }

        // 2. Update licenses table
        await orgRepo.updateLicenseStatus(id, { status: 'disabled' }, client);

        // 3. Mark admin user as rejected and unapproved
        const adminUsers = await orgRepo.rejectClinicAdmin(id, client);

        // 4. Update tenant_memberships
        const rejectMembershipRole = org.org_type === 'pharmacy' ? 'pharmacist' : 'admin';
        await orgRepo.updateTenantMembershipStatus(id, rejectMembershipRole, 'inactive', client);

        // 5. Audit log
        const adminActorName = await resolveAdminName(decoded.id, decoded.name, client);
        await orgRepo.createAuditLog({
            organizationId: id,
            eventType: 'clinic_rejected',
            doctorId: decoded.id,
            doctorName: adminActorName,
            details: `Clinic "${org.name}" registration rejected by ${adminActorName}.${reason ? ` Reason: ${reason}` : ''}`,
            timestamp: getKenyanTimestamp()
        }, client);

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
        await client.query('ROLLBACK;').catch(() => { });
        throw err;
    } finally {
        client.release();
    }
});

/**
 * 6. Update an organization's license status or extend trial (Per-facility kill switch, Super Admin only)
 * POST /api/admin/organizations/:id/status
 */
const updateOrganizationStatus = catchAsync(async (req, res) => {
    const decoded = verifySuperAdminToken(req);
    const { id } = req.params;
    const { status, extendDays } = req.body || {};

    if (!status || !['active', 'suspended', 'trial', 'disabled', 'pending_approval', 'expired'].includes(status)) {
        throw new AppError('Invalid status. Must be active, suspended, trial, disabled, pending_approval, or expired.', 400);
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN;');

        const updatedOrg = await orgRepo.updateOrganizationStatus(id, { status, extendDays }, client);
        if (!updatedOrg) {
            await client.query('ROLLBACK;');
            throw new AppError('Organization not found.', 404);
        }

        // Also synchronize licenses table
        await orgRepo.updateLicenseStatus(id, {
            status,
            expiresAt: updatedOrg.license_expires_at
        }, client);

        // Audit logging with full administrative details
        const adminActorName = await resolveAdminName(decoded.id, decoded.name, client);
        await orgRepo.createAuditLog({
            organizationId: id,
            eventType: 'license_status_update',
            doctorId: decoded.id,
            doctorName: adminActorName,
            details: `Organization status updated to "${status}". Expiry: ${updatedOrg.license_expires_at}. Modified by ${adminActorName}.`,
            timestamp: getKenyanTimestamp()
        }, client);

        await client.query('COMMIT;');

        res.json({
            success: true,
            message: `Organization "${updatedOrg.name}" updated to status: ${status}.`,
            organization: updatedOrg
        });
    } catch (err) {
        await client.query('ROLLBACK;').catch(() => { });
        throw err;
    } finally {
        client.release();
    }
});

/**
 * 7. Provision New Hospital Tenant Administrator (Super Admin Authority)
 * POST /api/admin/provision-tenant
 */
const provisionTenant = catchAsync(async (req, res) => {
    const decoded = verifySuperAdminToken(req);

    const { hospitalName, name, email, password } = req.body;
    if (!name || !email || !password) {
        throw new AppError('Administrator Name, Email, and Password are required.', 400);
    }

    // Check if user email already exists
    const existing = await orgRepo.findUserByEmail(email);
    if (existing) {
        throw new AppError(`An account with email "${email}" already exists.`, 400);
    }

    let orgId = null;
    let finalHospitalName = (hospitalName || '').trim();
    if (finalHospitalName) {
        const orgRes = await orgRepo.findOrganizationByNameIlike(finalHospitalName);
        if (orgRes) {
            orgId = orgRes.id;
            finalHospitalName = orgRes.name;
        } else {
            const newOrg = await orgRepo.createOrganization(finalHospitalName);
            orgId = newOrg.id;
            finalHospitalName = newOrg.name;

            // Create isolated Genesis Block for the new hospital ledger
            const genesis = new Block(0, new Date().toISOString(), [{ type: 'GENESIS_BLOCK', message: `Genesis Ledger for ${finalHospitalName}` }], '0', 0, orgId);
            await orgRepo.insertBlock({
                index: genesis.index,
                timestamp: genesis.timestamp,
                records: genesis.records,
                previousHash: genesis.previousHash,
                hash: genesis.hash,
                nonce: genesis.nonce,
                organizationId: orgId
            });
        }
    }

    // Generate RSA-2048 cryptographic keypair
    const { publicKey, privateKey } = generateKeyPair();
    const hashedPassword = await bcrypt.hash(password, 10);

    const newAdmin = await orgRepo.createTenantAdminUser({
        name,
        email,
        password: hashedPassword,
        organizationId: orgId,
        publicKey,
        privateKey
    });

    if (orgId) {
        await orgRepo.createTenantMembership({
            userId: newAdmin.id,
            organizationId: orgId,
            role: 'admin',
            status: 'active'
        });
    }

    // Record immutable audit log
    const adminActorName = await resolveAdminName(decoded?.id, decoded?.name);
    logAuditEvent('tenant_admin_provision', null, null, decoded?.id || null, adminActorName, `New hospital administrator provisioned for "${finalHospitalName || 'Platform'}": ${name} (${email}) by ${adminActorName}`, null, orgId);

    console.log(`[TENANT PROVISION] Hospital Administrator "${name}" for "${finalHospitalName}" created successfully.`);
    res.status(201).json({
        success: true,
        message: `Hospital Administrator account for "${finalHospitalName || name}" provisioned successfully!`,
        admin: {
            ...newAdmin,
            organizationName: finalHospitalName || 'Global Platform Governance'
        }
    });
});

/**
 * 8. Aggregated Patient Counts by Organization (Super Admin Privacy-by-Design default view)
 * GET /api/admin/organizations/patient-counts
 */
const getOrganizationPatientCounts = catchAsync(async (req, res) => {
    verifySuperAdminToken(req);
    const orgs = await orgRepo.getPatientCountsByOrg();
    res.json({
        success: true,
        organizations: orgs
    });
});

/**
 * 9. Organization Patient List Drill-Down with Mandatory Audit Justification
 * POST /api/admin/organizations/:id/patients
 */
const getOrganizationPatientsWithAudit = catchAsync(async (req, res) => {
    const adminUser = verifySuperAdminToken(req);
    const { id: orgId } = req.params;
    const { reason } = req.body || {};

    // Privacy-by-design guardrail: mandatory non-blank justification reason (min 5 chars)
    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmedReason || trimmedReason.length < 5) {
        throw new AppError('A justified operational access reason is required (minimum 5 characters).', 400);
    }

    // Verify target organization exists
    const org = await orgRepo.findOrganizationById(orgId);
    if (!org) {
        throw new AppError('Healthcare organization facility not found.', 404);
    }

    const kenyanTimestamp = getKenyanTimestamp();
    const logDetails = `Super Admin viewed patient directory for ${org.name}. Access Reason: "${trimmedReason}" (Admin: ${adminUser.email || adminUser.name || adminUser.id})`;

    // 1. Immutable Break-Glass Audit Log
    let effectiveAdminId = null;
    let effectiveAdminName = adminUser.name;
    if (adminUser.id) {
        try {
            const uCheck = await orgRepo.findUserById(adminUser.id);
            if (uCheck) {
                effectiveAdminId = uCheck.id;
                if (!effectiveAdminName && uCheck.name) {
                    effectiveAdminName = uCheck.name;
                }
            }
        } catch (uErr) {
            // fallback to null
        }
    }
    if (!effectiveAdminName) effectiveAdminName = 'Super Administrator';

    await logAuditEvent(
        'admin_patient_list_view',
        null,
        null,
        effectiveAdminId,
        effectiveAdminName,
        logDetails,
        kenyanTimestamp,
        org.id
    );

    console.log(`[AUDIT] admin_patient_list_view recorded by Super Admin (${adminUser.email}) for "${org.name}". Reason: "${trimmedReason}"`);

    // 2. Query demographic & account info strictly (EXCLUDING ALL CLINICAL DATA)
    const patients = await orgRepo.getOrganizationPatients(org.id);

    res.json({
        success: true,
        organization: {
            id: org.id,
            name: org.name,
            status: org.status
        },
        auditLogged: true,
        eventType: 'admin_patient_list_view',
        timestamp: kenyanTimestamp,
        patientCount: patients.length,
        patients
    });
});

/**
 * 10. Organization Prescription Counts (Statistical oversight, Zero PII)
 * GET /api/admin/organizations/prescription-counts
 */
const getOrganizationPrescriptionCounts = catchAsync(async (req, res) => {
    verifySuperAdminToken(req);
    const orgs = await orgRepo.getPrescriptionCountsByOrg();
    res.json({
        success: true,
        organizations: orgs
    });
});

/**
 * 11. Organization Prescription List Drill-Down with Mandatory Audit Justification
 * POST /api/admin/organizations/:id/prescriptions
 */
const getOrganizationPrescriptionsWithAudit = catchAsync(async (req, res) => {
    const adminUser = verifySuperAdminToken(req);
    const { id: orgId } = req.params;
    const { reason } = req.body || {};

    // Privacy-by-design guardrail: mandatory non-blank justification reason (min 10 chars)
    const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmedReason || trimmedReason.length < 10) {
        throw new AppError('A justified operational access reason is required (minimum 10 characters).', 400);
    }

    // Verify target organization exists
    const org = await orgRepo.findOrganizationById(orgId);
    if (!org) {
        throw new AppError('Healthcare organization facility not found.', 404);
    }

    const kenyanTimestamp = getKenyanTimestamp();
    const logDetails = `Super Admin viewed prescription directory for ${org.name}. Access Reason: "${trimmedReason}" (Admin: ${adminUser.email || adminUser.name || adminUser.id})`;

    // 1. Immutable Break-Glass Audit Log
    let effectiveAdminId = null;
    let effectiveAdminName = adminUser.name;
    if (adminUser.id) {
        try {
            const uCheck = await orgRepo.findUserById(adminUser.id);
            if (uCheck) {
                effectiveAdminId = uCheck.id;
                if (!effectiveAdminName && uCheck.name) {
                    effectiveAdminName = uCheck.name;
                }
            }
        } catch (uErr) {
            // fallback
        }
    }
    if (!effectiveAdminName) effectiveAdminName = 'Super Administrator';

    await logAuditEvent(
        'admin_prescription_view',
        null,
        null,
        effectiveAdminId,
        effectiveAdminName,
        logDetails,
        kenyanTimestamp,
        org.id
    );

    console.log(`[AUDIT] admin_prescription_view recorded by Super Admin (${adminUser.email}) for "${org.name}". Reason: "${trimmedReason}"`);

    // 2. Query prescriptions for this organization
    const prescriptions = await orgRepo.getOrganizationPrescriptions(org.id);

    res.json({
        success: true,
        organization: {
            id: org.id,
            name: org.name,
            status: org.status
        },
        auditLogged: true,
        eventType: 'admin_prescription_view',
        timestamp: kenyanTimestamp,
        prescriptionCount: prescriptions.length,
        prescriptions
    });
});

module.exports = {
    getActiveOrganizations,
    getAdminOrganizations,
    getPendingOrganizations,
    approveOrganization,
    rejectOrganization,
    updateOrganizationStatus,
    provisionTenant,
    getOrganizationPatientCounts,
    getOrganizationPatientsWithAudit,
    getOrganizationPrescriptionCounts,
    getOrganizationPrescriptionsWithAudit
};
