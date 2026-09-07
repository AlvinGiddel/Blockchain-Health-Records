const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('../db');
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
        const error = new Error('Authentication token required.');
        error.statusCode = 401;
        throw error;
    }
    const token = authHeader.substring(7).trim();
    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
        const error = new Error('Invalid or expired authentication token.');
        error.statusCode = 401;
        throw error;
    }
    if (!decoded || decoded.role !== 'super_admin') {
        const error = new Error('Access restricted to Super Administrators only.');
        error.statusCode = 403;
        throw error;
    }
    return decoded;
}

/**
 * Resolves the authenticated administrator's real name from token or database
 */
async function resolveAdminName(userId, tokenName, queryRunner = db) {
    if (tokenName && typeof tokenName === 'string' && tokenName.trim()) {
        return tokenName.trim();
    }
    if (userId) {
        try {
            const { rows } = await queryRunner.query('SELECT name FROM users WHERE id = $1', [userId]);
            if (rows.length > 0 && rows[0].name && rows[0].name.trim()) {
                return rows[0].name.trim();
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
async function getActiveOrganizations(req, res) {
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
}

/**
 * 2. List all organizations with metrics (Super Admin only)
 * GET /api/admin/organizations
 */
async function getAdminOrganizations(req, res) {
    try {
        verifySuperAdminToken(req);

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
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to fetch organizations.' });
    }
}

/**
 * 3. Get pending clinic approval requests (Super Admin only)
 * GET /api/admin/organizations/pending
 */
async function getPendingOrganizations(req, res) {
    try {
        verifySuperAdminToken(req);

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
            WHERE o.status IN ('pending_approval', 'pending')
            ORDER BY o.created_at ASC;
        `);

        res.json({ success: true, pendingClinics });
    } catch (err) {
        console.error('Error fetching pending clinic approvals:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to fetch pending clinic approvals.' });
    }
}

/**
 * 4. Approve a pending clinic registration (activates 7-day trial, Super Admin only)
 * POST /api/admin/organizations/:id/approve
 */
async function approveOrganization(req, res) {
    let decoded;
    try {
        decoded = verifySuperAdminToken(req);
    } catch (authErr) {
        return res.status(authErr.statusCode || 401).json({ error: authErr.message });
    }

    const client = await db.pool.connect();
    try {
        const { id } = req.params;
        await client.query('BEGIN;');

        // 1. Update organization: status = 'trial', license_expires_at = NOW() + 7 days
        const { rows: updatedOrgs } = await client.query(`
            UPDATE organizations 
            SET status = 'trial',
                license_expires_at = NOW() + INTERVAL '7 days',
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
        const adminActorName = await resolveAdminName(decoded.id, decoded.name, client);
        await client.query(`
            INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp)
            VALUES ($1, 'clinic_approved', null, null, $2, $3, $4, NOW());
        `, [id, decoded.id, adminActorName, `Clinic "${org.name}" approved by ${adminActorName}. 7-day trial activated.`]);

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
            message: `Clinic "${org.name}" approved successfully! 7-day trial activated.`,
            organization: org
        });
    } catch (err) {
        await client.query('ROLLBACK;').catch(() => { });
        console.error('Error approving clinic:', err);
        res.status(500).json({ error: err.message || 'Failed to approve clinic.' });
    } finally {
        client.release();
    }
}

/**
 * 5. Reject a pending clinic registration (sets status to disabled, Super Admin only)
 * POST /api/admin/organizations/:id/reject
 */
async function rejectOrganization(req, res) {
    let decoded;
    try {
        decoded = verifySuperAdminToken(req);
    } catch (authErr) {
        return res.status(authErr.statusCode || 401).json({ error: authErr.message });
    }

    const client = await db.pool.connect();
    try {
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
        const adminActorName = await resolveAdminName(decoded.id, decoded.name, client);
        await client.query(`
            INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp)
            VALUES ($1, 'clinic_rejected', null, null, $2, $3, $4, NOW());
        `, [id, decoded.id, adminActorName, `Clinic "${org.name}" registration rejected by ${adminActorName}.${reason ? ` Reason: ${reason}` : ''}`]);

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
        console.error('Error rejecting clinic:', err);
        res.status(500).json({ error: err.message || 'Failed to reject clinic.' });
    } finally {
        client.release();
    }
}

/**
 * 6. Update an organization's license status or extend trial (Per-facility kill switch, Super Admin only)
 * POST /api/admin/organizations/:id/status
 */
async function updateOrganizationStatus(req, res) {
    let decoded;
    try {
        decoded = verifySuperAdminToken(req);
    } catch (authErr) {
        return res.status(authErr.statusCode || 401).json({ error: authErr.message });
    }

    try {
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
            const adminActorName = await resolveAdminName(decoded.id, decoded.name, client);
            await client.query(`
                INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp)
                VALUES ($1, 'license_status_update', null, null, $2, $3, $4, $5);
            `, [id, decoded.id, adminActorName, `Organization status updated to "${status}". Expiry: ${updatedOrg.license_expires_at}. Modified by ${adminActorName}.`, getKenyanTimestamp()]);

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
}

/**
 * 7. Provision New Hospital Tenant Administrator (Super Admin Authority)
 * POST /api/admin/provision-tenant
 *
 * CRITICAL SECURITY FIX APPLIED:
 * Enforces Super Admin authentication. Unauthenticated requests are rejected with 401,
 * non-super_admin requests are rejected with 403.
 */
async function provisionTenant(req, res) {
    try {
        const decoded = verifySuperAdminToken(req);

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
        const adminActorName = await resolveAdminName(decoded?.id, decoded?.name, db);
        logAuditEvent('tenant_admin_provision', null, null, decoded?.id || null, adminActorName, `New hospital administrator provisioned for "${finalHospitalName || 'Platform'}": ${name} (${email}) by ${adminActorName}`, null, orgId);

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
        res.status(err.statusCode || 500).json({ error: err.message });
    }
}

/**
 * 7. Aggregated Patient Counts by Organization (Super Admin Privacy-by-Design default view)
 * GET /api/admin/organizations/patient-counts
 * 
 * Returns aggregate metrics ONLY: organization name, status, doctor count, patient count.
 * Explicitly exposes ZERO patient names, emails, phones, or PII.
 */
async function getOrganizationPatientCounts(req, res) {
    try {
        verifySuperAdminToken(req);

        const { rows: orgs } = await db.query(`
            SELECT 
                o.id,
                o.name,
                o.slug,
                o.status,
                o.license_expires_at as "licenseExpiresAt",
                COUNT(DISTINCT CASE WHEN tm.role IN ('doctor', 'nurse') THEN tm.user_id END) as "doctorCount",
                COUNT(DISTINCT p.user_id) as "patientCount"
            FROM organizations o
            LEFT JOIN tenant_memberships tm ON o.id = tm.organization_id
            LEFT JOIN (
                SELECT organization_id, user_id FROM tenant_memberships WHERE role = 'patient'
                UNION
                SELECT organization_id, id as user_id FROM users WHERE organization_id IS NOT NULL AND role = 'patient'
                UNION
                SELECT organization_id, patient_id as user_id FROM records WHERE organization_id IS NOT NULL
                UNION
                SELECT organization_id, patient_id as user_id FROM appointments WHERE organization_id IS NOT NULL
            ) p ON o.id = p.organization_id
            WHERE LOWER(o.name) NOT LIKE '%unassigned%'
            GROUP BY o.id
            ORDER BY o.name ASC;
        `);

        res.json({
            success: true,
            organizations: orgs
        });
    } catch (err) {
        console.error('Error fetching organization patient counts:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to fetch patient counts.' });
    }
}

/**
 * 8. Organization Patient List Drill-Down with Mandatory Audit Justification
 * POST /api/admin/organizations/:id/patients
 * 
 * Requires free-text justification reason (minimum 5 characters).
 * Writes immutable audit log with event_type = 'admin_patient_list_view'.
 * Returns demographic & account metadata ONLY — strictly excludes all clinical records,
 * diagnoses, treatments, allergies, and encrypted medical data.
 */
async function getOrganizationPatientsWithAudit(req, res) {
    try {
        const adminUser = verifySuperAdminToken(req);
        const { id: orgId } = req.params;
        const { reason } = req.body || {};

        // Privacy-by-design guardrail: mandatory non-blank justification reason (min 5 chars)
        const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
        if (!trimmedReason || trimmedReason.length < 5) {
            return res.status(400).json({
                error: 'A justified operational access reason is required (minimum 5 characters).'
            });
        }

        // Verify target organization exists
        const { rows: orgRows } = await db.query(
            'SELECT id, name, status FROM organizations WHERE id = $1',
            [orgId]
        );

        if (orgRows.length === 0) {
            return res.status(404).json({ error: 'Healthcare organization facility not found.' });
        }

        const org = orgRows[0];
        const kenyanTimestamp = getKenyanTimestamp();
        const logDetails = `Super Admin viewed patient directory for ${org.name}. Access Reason: "${trimmedReason}" (Admin: ${adminUser.email || adminUser.name || adminUser.id})`;

        // 1. Immutable Break-Glass Audit Log
        let effectiveAdminId = null;
        let effectiveAdminName = adminUser.name;
        if (adminUser.id) {
            try {
                const { rows: uCheck } = await db.query('SELECT id, name FROM users WHERE id = $1', [adminUser.id]);
                if (uCheck.length > 0) {
                    effectiveAdminId = uCheck[0].id;
                    if (!effectiveAdminName && uCheck[0].name) {
                        effectiveAdminName = uCheck[0].name;
                    }
                }
            } catch (uErr) {
                // In case token ID is not UUID or not in database, fallback to null
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
        const { rows: patients } = await db.query(`
            SELECT DISTINCT
                u.id,
                u.name,
                u.email,
                u.created_at as "registeredAt",
                u.is_approved as "isApproved",
                COALESCE(tm.status, 'active') as "membershipStatus",
                COALESCE(tm.joined_at, u.created_at) as "joinedAt",
                u.patient_profile->>'phone' as "phone"
            FROM users u
            LEFT JOIN tenant_memberships tm ON u.id = tm.user_id AND tm.organization_id = $1
            LEFT JOIN records r ON u.id = r.patient_id AND r.organization_id = $1
            LEFT JOIN appointments a ON u.id = a.patient_id AND a.organization_id = $1
            WHERE (
                tm.organization_id = $1 OR 
                u.organization_id = $1 OR 
                r.organization_id = $1 OR 
                a.organization_id = $1
            ) AND u.role = 'patient'
            ORDER BY u.name ASC;
        `, [org.id]);

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
    } catch (err) {
        console.error('Error fetching organization patients with audit:', err);
        res.status(err.statusCode || 500).json({ error: err.message || 'Failed to retrieve patient directory.' });
    }
}

module.exports = {
    getActiveOrganizations,
    getAdminOrganizations,
    getPendingOrganizations,
    approveOrganization,
    rejectOrganization,
    updateOrganizationStatus,
    provisionTenant,
    getOrganizationPatientCounts,
    getOrganizationPatientsWithAudit
};
