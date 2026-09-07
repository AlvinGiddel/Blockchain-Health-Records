const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const authRepo = require('../repositories/authRepository');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const {
    sendResetEmail,
    sendPractitionerPendingEmail,
    sendAdminNewPractitionerAlert
} = require('../mailer');
const { generateKeyPair, getKenyanTimestamp } = require('../blockchain');
const { verifyPractitioner, recordPractitionerAttestation } = require('../services/practitionerAttestation');
const {
    normalizePhone,
    parseProfile,
    parseJsonIfNeeded,
    checkSuperAdminRateLimit,
    verifyAuthToken
} = require('../utils/helpers');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

/**
 * Real-time phone number availability check
 */
const checkPhone = catchAsync(async (req, res) => {
    const { phone } = req.query;
    if (!phone) {
        return res.json({ exists: false });
    }
    const normPhone = normalizePhone(String(phone));
    if (!normPhone || normPhone.length < 5) {
        return res.json({ exists: false });
    }

    const allUsers = await authRepo.getAllUserProfilesForPhoneCheck();
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
});

/**
 * Register a new Patient or Practitioner (Doctor/Dentist/Nurse/Midwife)
 */
const register = catchAsync(async (req, res) => {
    const { name, email, password, role, profile, organizationId } = req.body;

    if (role === 'admin' || role === 'super_admin' || !['patient', 'doctor'].includes(role)) {
        throw new AppError('Registration as Administrator or Super Administrator is not allowed.', 400);
    }

    // Validate hospital facility selection for patients
    let targetOrg = null;
    if (role === 'patient') {
        if (!organizationId) {
            throw new AppError('Please select your hospital or clinic facility to complete registration.', 400);
        }
        const activeOrg = await authRepo.findActiveOrganizationById(organizationId);
        if (!activeOrg) {
            throw new AppError('Invalid or inactive hospital facility selected.', 400);
        }
        targetOrg = activeOrg;
    } else if (role === 'doctor') {
        if (organizationId) {
            const activeOrg = await authRepo.findActiveOrganizationById(organizationId);
            if (activeOrg) {
                targetOrg = activeOrg;
            }
        }
    }

    // 1. Check if email already exists
    const cleanEmail = email.toLowerCase().trim();
    const existingEmailUser = await authRepo.findUserByEmail(cleanEmail);
    if (existingEmailUser) {
        throw new AppError('Registration rejected: Email address is already registered.', 400);
    }

    // Fetch existing users to verify unique phone numbers and patient details
    const allUsers = await authRepo.getAllUsersForDuplicateCheck();

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
            throw new AppError('Registration rejected: A user with this phone number is already registered in the system. Duplicate phone numbers are not allowed.', 400);
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
            throw new AppError('Registration rejected: A patient record with identical details (name and demographic profile) is already registered in the system.', 400);
        }
    }

    // 4. Council Verification & Duplicate Check for Practitioners (Doctors, Dentists, Nurses, Midwives)
    let practitionerCheck = null;
    if (role === 'doctor') {
        const incomingLicense = (profile?.licenseNumber || '').trim();
        const cadre = (profile?.cadre || 'doctor').toLowerCase();
        if (!incomingLicense) {
            throw new AppError(
                `Registration rejected: A valid ${cadre === 'nurse' || cadre === 'midwife' ? 'NCK Nursing License / Registration Number' : 'KMPDC Medical License Number'} is required.`,
                400
            );
        }

        // Perform Off-Chain Statutory Council Verification (KMPDC or NCK) against practitioner name
        practitionerCheck = await verifyPractitioner({ cadre, licenseNumber: incomingLicense, practitionerName: name });
        if (!practitionerCheck.verified) {
            throw new AppError(`${practitionerCheck.regulator || 'Council'} License Verification Failed: ${practitionerCheck.error}`, 422);
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
            throw new AppError(`Registration rejected: A practitioner with this ${practitionerCheck.regulator} license number is already registered in the system.`, 400);
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
        user = await authRepo.createUser({
            name,
            email,
            password: hashedPassword,
            role,
            publicKey,
            privateKey,
            isApproved: isApprovedVal,
            organizationId: assignedOrgId,
            patientProfile,
            doctorProfile,
            createdAt
        }, client);

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
            await authRepo.createTenantMembership({
                userId: user.id,
                organizationId: targetOrg.id,
                role: 'patient',
                status: 'active'
            }, client);

            memberships = [{
                organizationId: targetOrg.id,
                organizationName: targetOrg.name,
                role: 'patient',
                status: 'active'
            }];

            // Audit log for patient registration and facility enrollment
            await authRepo.createAuditLog({
                organizationId: targetOrg.id,
                eventType: 'patient_registration',
                patientId: user.id,
                patientName: user.name,
                details: `New patient registered and affiliated with ${targetOrg.name}.`,
                timestamp: createdAt
            }, client);
        } else if (role === 'doctor' && targetOrg) {
            // Link doctor to their selected facility via tenant_memberships with pending approval status
            await authRepo.createTenantMembership({
                userId: user.id,
                organizationId: targetOrg.id,
                role: 'doctor',
                status: 'pending'
            }, client);

            await authRepo.createAuditLog({
                organizationId: targetOrg.id,
                eventType: 'doctor_registration_request',
                doctorId: user.id,
                doctorName: user.name,
                details: `Dr. ${user.name} (${user.email}) requested clinical node affiliation with ${targetOrg.name}. Pending administrative approval.`,
                timestamp: createdAt
            }, client);
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

        // Notify facility admin (or Super Admin) of new practitioner in approval queue
        (async () => {
            try {
                if (targetOrg) {
                    const adminRows = await authRepo.getFacilityAdmins(targetOrg.id);

                    if (adminRows.length > 0) {
                        for (const admin of adminRows) {
                            sendAdminNewPractitionerAlert({
                                adminEmail: admin.email,
                                adminName: admin.name,
                                practitionerName: user.name,
                                cadre: cadreVal,
                                hospitalName: targetOrg.name,
                                licenseNumber: profile?.licenseNumber
                            }).catch(aErr => console.error(`Failed to send admin alert email to ${admin.email}:`, aErr.message));
                        }
                    } else {
                        // Fallback to Super Admin if facility admin has not yet completed setup
                        const superAdmin = await authRepo.getSuperAdmin();
                        const sEmail = superAdmin ? superAdmin.email : process.env.SUPER_ADMIN_EMAIL;
                        if (sEmail) {
                            sendAdminNewPractitionerAlert({
                                adminEmail: sEmail,
                                adminName: superAdmin?.name || 'Platform Super Administrator',
                                practitionerName: user.name,
                                cadre: cadreVal,
                                hospitalName: targetOrg.name,
                                licenseNumber: profile?.licenseNumber
                            }).catch(sErr => console.error('Failed to send super admin alert:', sErr.message));
                        }
                    }
                } else {
                    // Practitioner applied with unlisted / external facility -> notify Super Admin
                    const superAdmin = await authRepo.getSuperAdmin();
                    const sEmail = superAdmin ? superAdmin.email : process.env.SUPER_ADMIN_EMAIL;
                    if (sEmail) {
                        sendAdminNewPractitionerAlert({
                            adminEmail: sEmail,
                            adminName: superAdmin?.name || 'Platform Super Administrator',
                            practitionerName: user.name,
                            cadre: cadreVal,
                            hospitalName: profile?.hospital || 'Unlisted Healthcare Facility',
                            licenseNumber: profile?.licenseNumber
                        }).catch(sErr => console.error('Failed to send super admin alert:', sErr.message));
                    }
                }
            } catch (notifyErr) {
                console.error('[Practitioner Notification Error]:', notifyErr.message);
            }
        })();

        // Log doctor registration request event in audit trail (in background)
        authRepo.createAuditLog({
            organizationId: user.organization_id || null,
            eventType: 'doctor_request',
            doctorId: user.id,
            doctorName: user.name,
            details: `New practitioner registration request submitted by ${user.name} (${user.email}). Pending approval.`,
            timestamp: createdAt
        }).catch(err => console.error('Failed to log doctor request audit:', err));

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
        name: user.name,
        email: user.email,
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
});

/**
 * User login (Patient, Doctor, Admin, Super Admin)
 */
const login = catchAsync(async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
        throw new AppError('Please provide both email address and password.', 400);
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

    const user = await authRepo.findUserByEmail(cleanEmail);
    if (!user) {
        throw new AppError('Invalid credentials.', 401);
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        throw new AppError('Invalid credentials.', 401);
    }

    // Block unapproved/rejected admins and doctors from logging in
    if (user.role === 'admin') {
        if (user.is_rejected) {
            throw new AppError('Your admin registration request was rejected by the administrator.', 403);
        }
        if (!user.is_approved) {
            throw new AppError('Admin approval pending. Please request authorization from an active administrator.', 403);
        }
    } else if (user.role === 'doctor') {
        if (user.is_rejected) {
            throw new AppError('Your doctor registration request was rejected by the administrator.', 403);
        }
        if (!user.is_approved) {
            throw new AppError('Doctor approval pending. Please wait for an administrator to review your request.', 403);
        }
    }

    // Backfill organization_id from tenant_memberships if missing for non-super_admin accounts
    if (user.role !== 'super_admin' && !user.organization_id) {
        const firstMem = await authRepo.getFirstActiveMembership(user.id);
        if (firstMem && firstMem.organization_id) {
            user.organization_id = firstMem.organization_id;
            await authRepo.updateUserOrganizationId(user.id, user.organization_id);
        }
    }

    // Check organization license and suspension status for tenant staff (admins, doctors, nurses)
    // Super Admin always bypasses to maintain platform governance and emergency recovery authority
    let organizationName = null;
    let organizationStatus = null;
    if (user.role !== 'super_admin' && user.organization_id) {
        const org = await authRepo.findOrganizationById(user.organization_id);
        if (org) {
            organizationName = org.name;
            organizationStatus = org.status;

            // 1. Check if hospital facility is pending approval
            if (org.status === 'pending_approval') {
                throw new AppError('Your clinic registration is still under review.', 403);
            }

            // 2. Check if hospital facility is suspended or disabled
            if (org.status === 'suspended' || org.status === 'disabled') {
                throw new AppError(`Access Denied: Your hospital facility ("${org.name}") has been ${org.status === 'disabled' ? 'disabled' : 'suspended'} by platform administration. All access to this ledger is blocked.`, 403);
            }

            // 3. Auto-transition: if trial expiration has passed, update status to 'expired'
            if (org.status === 'trial' && org.license_expires_at && new Date(org.license_expires_at) < new Date()) {
                await authRepo.expireOrganizationTrial(org.id);
                org.status = 'expired';
                organizationStatus = 'expired';
            }
        }
    }

    // Fetch tenant memberships for multi-clinic patients
    let memberships = [];
    if (user.role === 'patient') {
        memberships = await authRepo.getUserMemberships(user.id);
    }

    const token = jwt.sign({
        id: user.id,
        name: user.name,
        email: user.email,
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
});

/**
 * Self-serve clinic registration and organization onboarding
 */
const registerClinic = catchAsync(async (req, res) => {
    const client = await db.pool.connect();
    try {
        const { organizationName, adminName, email, password } = req.body || {};

        if (!organizationName || !adminName || !email || !password) {
            throw new AppError('Please provide all required fields: organizationName, adminName, email, and password.', 400);
        }

        const cleanOrgName = organizationName.trim();
        const cleanAdminName = adminName.trim();
        const cleanEmail = email.toLowerCase().trim();

        if (cleanOrgName.length < 3) {
            throw new AppError('Organization name must be at least 3 characters long.', 400);
        }

        if (password.length < 6) {
            throw new AppError('Password must be at least 6 characters long.', 400);
        }

        // 1. Check if organization name already exists
        const existingOrg = await authRepo.findOrganizationByName(cleanOrgName, client);
        if (existingOrg) {
            throw new AppError('A hospital or clinic with this name is already registered.', 400);
        }

        // 2. Check if admin email already exists
        const existingUser = await authRepo.findUserByEmail(cleanEmail, client);
        if (existingUser) {
            throw new AppError('An account with this email address already exists.', 400);
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
        const newOrg = await authRepo.createOrganization({
            name: cleanOrgName,
            slug,
            status: 'pending_approval',
            licenseExpiresAt: null
        }, client);

        // 4. Insert into users as admin scoped to new organization_id with is_approved = false
        const createdAt = getKenyanTimestamp();
        const newAdmin = await authRepo.createUser({
            name: cleanAdminName,
            email: cleanEmail,
            password: hashedPassword,
            role: 'admin',
            publicKey,
            privateKey,
            isApproved: false,
            isRejected: false,
            organizationId: newOrg.id,
            createdAt
        }, client);

        // 5. Insert into tenant_memberships with status = 'pending'
        await authRepo.createTenantMembership({
            userId: newAdmin.id,
            organizationId: newOrg.id,
            role: 'admin',
            status: 'pending'
        }, client);

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

        await authRepo.createGenesisBlock({
            organizationId: newOrg.id,
            timestamp: genesisTimestamp,
            records: genesisRecords,
            previousHash: genesisPrevHash,
            nonce,
            hash: genesisHash
        }, client);

        // 7. Insert row in licenses with status = 'pending_approval'
        await authRepo.createLicense({
            organizationId: newOrg.id,
            clientId: cleanOrgName,
            status: 'pending_approval',
            expiresAt: null
        }, client);

        // 8. Log audit trail
        await authRepo.createAuditLog({
            organizationId: newOrg.id,
            eventType: 'clinic_registration_submitted',
            doctorId: newAdmin.id,
            doctorName: cleanAdminName,
            details: `New clinic registration for "${cleanOrgName}" submitted by ${cleanAdminName}. Pending Super Admin review.`,
            timestamp: createdAt
        }, client);

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
        await client.query('ROLLBACK;').catch(() => { });
        throw err;
    } finally {
        client.release();
    }
});

/**
 * Change Account Password
 */
const changePassword = catchAsync(async (req, res) => {
    const authUser = verifyAuthToken(req);
    const { userId, currentPassword, newPassword } = req.body;

    if (!userId || !currentPassword || !newPassword) {
        throw new AppError('All fields are required.', 400);
    }

    if (authUser.id !== userId && authUser.role !== 'super_admin') {
        throw new AppError('Access denied: You cannot change the password for another account.', 403);
    }

    const user = await authRepo.findUserById(userId);
    if (!user) {
        throw new AppError('User not found.', 404);
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
        throw new AppError('Incorrect current password.', 400);
    }

    // Set and save new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    await authRepo.updateUserPassword(userId, hashedPassword);

    // Log the password change in the audit trail (in background)
    const isPatPwd = user.role === 'patient';
    authRepo.createAuditLog({
        organizationId: user.organization_id || null,
        eventType: 'password_change',
        patientId: isPatPwd ? user.id : null,
        patientName: isPatPwd ? user.name : null,
        doctorId: !isPatPwd ? user.id : null,
        doctorName: !isPatPwd ? user.name : null,
        details: `User ${user.name} (${user.role}) changed their account password.`
    }).catch(err => console.error('Failed to log password change audit:', err));

    res.json({ success: true, message: 'Password updated successfully!' });
});

/**
 * Update Account Email Address
 */
const updateEmail = catchAsync(async (req, res) => {
    const authUser = verifyAuthToken(req);
    const { userId, newEmail, currentPassword } = req.body;

    if (!userId || !newEmail || !currentPassword) {
        throw new AppError('User ID, new email address, and current password are required.', 400);
    }

    if (authUser.id !== userId && authUser.role !== 'super_admin') {
        throw new AppError('Access denied: You cannot change the email address for another account.', 403);
    }

    const cleanEmail = newEmail.toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
        throw new AppError('Please provide a valid email address.', 400);
    }

    // 1. Locate user in database
    const user = await authRepo.findUserById(userId);
    if (!user) {
        throw new AppError('Account not found.', 404);
    }

    // 2. Prevent setting to the exact same email
    if (user.email.toLowerCase() === cleanEmail) {
        throw new AppError('New email address must be different from your current email.', 400);
    }

    // 3. Ensure new email is not already taken by another user
    const existing = await authRepo.findOtherUserByEmail(cleanEmail, userId);
    if (existing) {
        throw new AppError('This email address is already registered to another account.', 400);
    }

    // 4. Verify user password for security
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
        throw new AppError('Incorrect password. Verification failed.', 400);
    }

    // 5. Update user email
    const updatedUser = await authRepo.updateUserEmail(userId, cleanEmail);

    // 6. Generate fresh session token
    const token = jwt.sign({ id: updatedUser.id, name: updatedUser.name, role: updatedUser.role }, JWT_SECRET, { expiresIn: '1d' });

    // 7. Log immutable audit trail
    const isPatEmail = user.role === 'patient';
    authRepo.createAuditLog({
        organizationId: user.organization_id || null,
        eventType: 'email_update',
        patientId: isPatEmail ? user.id : null,
        patientName: isPatEmail ? user.name : null,
        doctorId: !isPatEmail ? user.id : null,
        doctorName: !isPatEmail ? user.name : null,
        details: `User ${user.name} (${user.role}) changed email from ${user.email} to ${cleanEmail}.`
    }).catch(err => console.error('Failed to log email change audit:', err));

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
});

/**
 * Request Password Reset Email Link
 */
const forgotPassword = catchAsync(async (req, res) => {
    const { email } = req.body;
    if (!email) {
        throw new AppError('Email is required.', 400);
    }

    const cleanEmail = email.toLowerCase().trim();
    const user = await authRepo.findUserByEmail(cleanEmail);
    if (!user) {
        throw new AppError('No user registered with this email address.', 404);
    }

    // Generate reset token
    const token = crypto.randomBytes(20).toString('hex');
    const tokenExpires = new Date(Date.now() + 3600000); // 1 hour expiration

    await authRepo.setResetToken(user.id, token, tokenExpires);

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
    const isPatReset = user.role === 'patient';
    authRepo.createAuditLog({
        organizationId: user.organization_id || null,
        eventType: 'password_reset_request',
        patientId: isPatReset ? user.id : null,
        patientName: isPatReset ? user.name : null,
        doctorId: !isPatReset ? user.id : null,
        doctorName: !isPatReset ? user.name : null,
        details: `Password reset requested for ${user.name} (${user.email}). Email sent: ${isEmailDelivered}`
    }).catch(err => console.error('Failed to log password reset request audit:', err));

    res.json({
        success: true,
        emailSent: isEmailDelivered,
        message: isEmailDelivered
            ? 'A password reset link has been dispatched to your email address.'
            : 'Password reset link could not be sent. Please check your email configuration or try again later.'
    });
});

/**
 * Reset Password Completion with Token
 */
const resetPassword = catchAsync(async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    if (!password) {
        throw new AppError('New password is required.', 400);
    }

    // Locate user with valid reset token
    const user = await authRepo.findUserByResetToken(token);
    if (!user) {
        throw new AppError('Password reset link is invalid or has expired.', 400);
    }

    // Update password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await authRepo.completePasswordReset(user.id, hashedPassword);

    // Log completion to audit trail (in background)
    const isPatComplete = user.role === 'patient';
    authRepo.createAuditLog({
        organizationId: user.organization_id || null,
        eventType: 'password_reset_complete',
        patientId: isPatComplete ? user.id : null,
        patientName: isPatComplete ? user.name : null,
        doctorId: !isPatComplete ? user.id : null,
        doctorName: !isPatComplete ? user.name : null,
        details: `Password reset successfully completed for ${user.name} (${user.role}).`
    }).catch(err => console.error('Failed to log password reset complete audit:', err));

    res.json({ success: true, message: 'Your password has been successfully reset! You can now log in.' });
});

// =========================================================================
// EMERGENCY ACCESS / BREAK-GLASS PROTOCOL (Authorization Override Domain)
// =========================================================================

/**
 * Emergency Break-Glass Access Protocol
 */
const breakGlass = catchAsync(async (req, res) => {
    const authUser = verifyAuthToken(req);
    if (authUser.role !== 'doctor') {
        throw new AppError('Access denied: Only clinical doctors can invoke the emergency break-glass protocol.', 403);
    }

    const { doctorId, doctorName, patientId, patientName, reason } = req.body || {};
    if (doctorId && doctorId !== authUser.id) {
        throw new AppError('Access denied: You cannot initiate emergency access on behalf of another doctor.', 403);
    }
    const effectiveDoctorId = authUser.id;

    if (!patientId || !reason || reason.trim().length < 10) {
        throw new AppError('Valid patient ID and detailed justification reason (10+ chars) are required.', 400);
    }

    const doctor = await authRepo.findUserByIdAndRole(effectiveDoctorId, 'doctor');
    if (!doctor) {
        throw new AppError('Doctor record not found.', 404);
    }

    const patient = await authRepo.findUserByIdAndRole(patientId, 'patient');
    if (!patient) {
        throw new AppError('Patient record not found.', 404);
    }

    // Strict identity binding: names pulled directly from verified DB records, never unauthenticated req.body
    const dName = doctor.name;
    const pName = patient.name;
    const logDetails = `EMERGENCY BREAK-GLASS ACCESS OVERRIDE: Dr. ${dName} initiated emergency override for Patient ${pName}. Justification: ${reason.trim()}`;

    const doctorOrgId = doctor.organization_id || authUser.organization_id || null;

    // Create immutable audit log in database
    const auditRecord = await authRepo.createAuditLog({
        organizationId: doctorOrgId,
        eventType: 'emergency_break_glass',
        patientId,
        patientName: pName,
        doctorId: effectiveDoctorId,
        doctorName: dName,
        details: logDetails
    });

    console.log(`[ALERT] Break-Glass Emergency Override logged: Dr. ${dName} -> Patient ${pName}`);
    res.json({
        success: true,
        message: `Emergency break-glass access activated for Dr. ${dName}. Audit event recorded on ledger.`,
        auditId: auditRecord?.id
    });
});

/**
 * Check if active break-glass override exists for doctor and patient (< 1 hour ago)
 */
const getBreakGlassStatus = catchAsync(async (req, res) => {
    const authUser = verifyAuthToken(req);
    const { doctorId, patientId } = req.query;
    if (!doctorId || !patientId) {
        return res.json({ hasBreakGlass: false });
    }

    if (authUser.role === 'doctor' && authUser.id !== doctorId) {
        throw new AppError('Access denied.', 403);
    }
    if (authUser.role === 'patient' && authUser.id !== patientId) {
        throw new AppError('Access denied.', 403);
    }

    const log = await authRepo.getBreakGlassStatus(doctorId, patientId);

    if (!log) {
        return res.json({ hasBreakGlass: false });
    }

    const startTime = new Date(log.timestamp).getTime();
    const expiresAtTime = startTime + (60 * 60 * 1000); // 1 hour in ms
    const remainingSeconds = Math.max(0, Math.floor((expiresAtTime - Date.now()) / 1000));

    res.json({
        hasBreakGlass: remainingSeconds > 0,
        activeRecord: log,
        expiresAt: new Date(expiresAtTime).toISOString(),
        remainingSeconds
    });
});

module.exports = {
    checkPhone,
    register,
    login,
    registerClinic,
    changePassword,
    updateEmail,
    forgotPassword,
    resetPassword,
    breakGlass,
    getBreakGlassStatus
};
