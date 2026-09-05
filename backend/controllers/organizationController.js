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
            WHERE o.status = 'pending_approval'
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
        await client.query(`
            INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp)
            VALUES ($1, 'clinic_approved', $2, $3, $2, $3, $4, NOW());
        `, [id, decoded.id, decoded.name || 'Super Admin', `Clinic "${org.name}" approved by Super Admin. 7-day trial activated.`]);

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
        await client.query(`
            INSERT INTO audit_logs (organization_id, event_type, patient_id, patient_name, doctor_id, doctor_name, details, timestamp)
            VALUES ($1, 'clinic_rejected', $2, $3, $2, $3, $4, NOW());
        `, [id, decoded.id, decoded.name || 'Super Admin', `Clinic "${org.name}" registration rejected by Super Admin.${reason ? ` Reason: ${reason}` : ''}`]);

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
            await client.query(`
                INSERT INTO audit_logs (organization_id, event_type, doctor_id, doctor_name, patient_id, patient_name, details, timestamp)
                VALUES ($1, 'license_status_update', $2, 'Super Administrator', $2, 'Platform Governance', $3, $4);
            `, [id, decoded.id, `Organization status updated to "${status}". Expiry: ${updatedOrg.license_expires_at}. Modified by Super Admin.`, getKenyanTimestamp()]);

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
        verifySuperAdminToken(req);

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
        logAuditEvent('tenant_admin_provision', newAdmin[0].id, name, newAdmin[0].id, 'Super Administrator', `New hospital administrator provisioned for "${finalHospitalName || 'Platform'}": ${name} (${email})`, orgId);

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

module.exports = {
    getActiveOrganizations,
    getAdminOrganizations,
    getPendingOrganizations,
    approveOrganization,
    rejectOrganization,
    updateOrganizationStatus,
    provisionTenant
};
