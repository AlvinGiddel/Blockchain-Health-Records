const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
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
async function checkPhone(req, res) {
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
}

/**
 * Register a new Patient or Practitioner (Doctor/Dentist/Nurse/Midwife)
 */
async function register(req, res) {
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

            // Notify facility admin (or Super Admin) of new practitioner in approval queue
            (async () => {
                try {
                    if (targetOrg) {
                        const { rows: adminRows } = await db.pool.query(`
                            SELECT DISTINCT u.name, u.email 
                            FROM users u
                            LEFT JOIN tenant_memberships tm ON tm.user_id = u.id
                            WHERE (u.organization_id = $1 OR tm.organization_id = $1)
                              AND (u.role = 'admin' OR tm.role = 'admin')
                              AND u.email IS NOT NULL;
                        `, [targetOrg.id]);

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
                            const { rows: superRows } = await db.pool.query("SELECT name, email FROM users WHERE role = 'super_admin' LIMIT 1;");
                            const sEmail = superRows.length > 0 ? superRows[0].email : process.env.SUPER_ADMIN_EMAIL;
                            if (sEmail) {
                                sendAdminNewPractitionerAlert({
                                    adminEmail: sEmail,
                                    adminName: superRows[0]?.name || 'Platform Super Administrator',
                                    practitionerName: user.name,
                                    cadre: cadreVal,
                                    hospitalName: targetOrg.name,
                                    licenseNumber: profile?.licenseNumber
                                }).catch(sErr => console.error('Failed to send super admin alert:', sErr.message));
                            }
                        }
                    } else {
                        // Practitioner applied with unlisted / external facility -> notify Super Admin
                        const { rows: superRows } = await db.pool.query("SELECT name, email FROM users WHERE role = 'super_admin' LIMIT 1;");
                        const sEmail = superRows.length > 0 ? superRows[0].email : process.env.SUPER_ADMIN_EMAIL;
                        if (sEmail) {
                            sendAdminNewPractitionerAlert({
                                adminEmail: sEmail,
                                adminName: superRows[0]?.name || 'Platform Super Administrator',
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
            db.query(
                `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp) 
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [user.organization_id || null, 'doctor_request', user.id, user.name, user.id, 'System Admin', `New practitioner registration request submitted by ${user.name} (${user.email}). Pending approval.`, createdAt]
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
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed.' });
    }
}

/**
 * User login (Patient, Doctor, Admin, Super Admin)
 */
async function login(req, res) {
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

        // Backfill organization_id from tenant_memberships if missing for non-super_admin accounts
        if (user.role !== 'super_admin' && !user.organization_id) {
            const { rows: memRows } = await db.query(
                "SELECT organization_id FROM tenant_memberships WHERE user_id = $1 AND status = 'active' ORDER BY joined_at ASC LIMIT 1;",
                [user.id]
            );
            if (memRows.length > 0 && memRows[0].organization_id) {
                user.organization_id = memRows[0].organization_id;
                await db.query("UPDATE users SET organization_id = $1 WHERE id = $2;", [user.organization_id, user.id]);
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
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed.' });
    }
}

/**
 * Self-serve clinic registration and organization onboarding
 */
async function registerClinic(req, res) {
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
        await client.query('ROLLBACK;').catch(() => { });
        console.error('Error during clinic registration:', err);
        res.status(500).json({ error: err.message || 'Failed to register clinic.' });
    } finally {
        client.release();
    }
}

/**
 * Change Account Password
 */
async function changePassword(req, res) {
    try {
        const authUser = verifyAuthToken(req);
        const { userId, currentPassword, newPassword } = req.body;

        if (!userId || !currentPassword || !newPassword) {
            return res.status(400).json({ error: 'All fields are required.' });
        }

        if (authUser.id !== userId && authUser.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied: You cannot change the password for another account.' });
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
            `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [user.organization_id || null, 'password_change', user.id, user.name, user.id, 'System Admin', `User ${user.name} (${user.role}) changed their account password.`]
        ).catch(err => console.error('Failed to log password change audit:', err));

        res.json({ success: true, message: 'Password updated successfully!' });
    } catch (err) {
        console.error('Password change error:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to update password.' });
    }
}

/**
 * Update Account Email Address
 */
async function updateEmail(req, res) {
    try {
        const authUser = verifyAuthToken(req);
        const { userId, newEmail, currentPassword } = req.body;

        if (!userId || !newEmail || !currentPassword) {
            return res.status(400).json({ error: 'User ID, new email address, and current password are required.' });
        }

        if (authUser.id !== userId && authUser.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied: You cannot change the email address for another account.' });
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
            `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [user.organization_id || null, 'email_update', user.id, user.name, user.id, 'System Security', `User ${user.name} (${user.role}) changed email from ${user.email} to ${cleanEmail}.`]
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
        res.status(err.statusCode || err.status || 500).json({ error: err.message || 'Failed to update email address.' });
    }
}

/**
 * Request Password Reset Email Link
 */
async function forgotPassword(req, res) {
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
            `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [user.organization_id || null, 'password_reset_request', user.id, user.name, user.id, 'System Admin', `Password reset requested for ${user.name} (${user.email}). Email sent: ${isEmailDelivered}`]
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
}

/**
 * Reset Password Completion with Token
 */
async function resetPassword(req, res) {
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
            `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [user.organization_id || null, 'password_reset_complete', user.id, user.name, user.id, 'System Admin', `Password reset successfully completed for ${user.name} (${user.role}).`]
        ).catch(err => console.error('Failed to log password reset complete audit:', err));

        res.json({ success: true, message: 'Your password has been successfully reset! You can now log in.' });
    } catch (err) {
        console.error('Reset password completion error:', err);
        res.status(500).json({ error: 'An error occurred during password reset execution.' });
    }
}

// =========================================================================
// EMERGENCY ACCESS / BREAK-GLASS PROTOCOL (Authorization Override Domain)
// =========================================================================

/**
 * Emergency Break-Glass Access Protocol
 */
async function breakGlass(req, res) {
    try {
        const authUser = verifyAuthToken(req);
        if (authUser.role !== 'doctor') {
            return res.status(403).json({ error: 'Access denied: Only clinical doctors can invoke the emergency break-glass protocol.' });
        }

        const { doctorId, doctorName, patientId, patientName, reason } = req.body || {};
        if (doctorId && doctorId !== authUser.id) {
            return res.status(403).json({ error: 'Access denied: You cannot initiate emergency access on behalf of another doctor.' });
        }
        const effectiveDoctorId = authUser.id;

        if (!patientId || !reason || reason.trim().length < 10) {
            return res.status(400).json({ error: 'Valid patient ID and detailed justification reason (10+ chars) are required.' });
        }

        const { rows: doctors } = await db.query('SELECT * FROM users WHERE id = $1 AND role = \'doctor\'', [effectiveDoctorId]);
        if (doctors.length === 0) {
            return res.status(404).json({ error: 'Doctor record not found.' });
        }

        const { rows: patients } = await db.query('SELECT * FROM users WHERE id = $1 AND role = \'patient\'', [patientId]);
        if (patients.length === 0) {
            return res.status(404).json({ error: 'Patient record not found.' });
        }

        // Strict identity binding: names pulled directly from verified DB records, never unauthenticated req.body
        const dName = doctors[0].name;
        const pName = patients[0].name;
        const logDetails = `EMERGENCY BREAK-GLASS ACCESS OVERRIDE: Dr. ${dName} initiated emergency override for Patient ${pName}. Justification: ${reason.trim()}`;

        const doctorOrgId = doctors[0].organization_id || authUser.organization_id || null;

        // Create immutable audit log in database
        const { rows: auditRows } = await db.query(
            `INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [doctorOrgId, 'emergency_break_glass', patientId, pName, effectiveDoctorId, dName, logDetails]
        );

        console.log(`[ALERT] Break-Glass Emergency Override logged: Dr. ${dName} -> Patient ${pName}`);
        res.json({
            success: true,
            message: `Emergency break-glass access activated for Dr. ${dName}. Audit event recorded on ledger.`,
            auditId: auditRows[0]?.id
        });
    } catch (err) {
        console.error('Break-glass error:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to process emergency break-glass protocol.' });
    }
}

/**
 * Check if active break-glass override exists for doctor and patient (< 1 hour ago)
 */
async function getBreakGlassStatus(req, res) {
    try {
        const authUser = verifyAuthToken(req);
        const { doctorId, patientId } = req.query;
        if (!doctorId || !patientId) {
            return res.json({ hasBreakGlass: false });
        }

        if (authUser.role === 'doctor' && authUser.id !== doctorId) {
            return res.status(403).json({ error: 'Access denied.' });
        }
        if (authUser.role === 'patient' && authUser.id !== patientId) {
            return res.status(403).json({ error: 'Access denied.' });
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
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to query emergency override status.' });
    }
}

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
