const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';

/**
 * Authentication Middleware
 * Validates incoming Bearer JWT and attaches the decoded payload to req.user.
 * Normalizes multi-tenant fields (organization_id) for uniform downstream access.
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication token required.' });
    }

    const token = authHeader.substring(7).trim();

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Normalize organization ID across both snake_case and camelCase tokens
        decoded.organization_id = decoded.organization_id || decoded.organizationId || null;
        decoded.organizationId = decoded.organization_id;

        req.user = decoded;
        req.userId = decoded.id;
        req.userRole = decoded.role;

        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired authentication session.' });
    }
}

/**
 * Role-Based Access Control Middleware Factory
 * Ensures req.user has one of the allowed roles.
 * @param  {...string} allowedRoles 
 */
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication token required.' });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                error: `Access restricted. Required role: ${allowedRoles.join(' or ')}.` 
            });
        }

        next();
    };
}

/**
 * Shorthand for Super Admin only routes
 */
const requireSuperAdmin = requireRole('super_admin');

/**
 * Shorthand for Facility/Super Admin routes
 */
const requireAdmin = requireRole('admin', 'super_admin');

/**
 * Shorthand for Doctor or Super Admin routes
 */
const requireDoctor = requireRole('doctor', 'super_admin');

module.exports = {
    requireAuth,
    requireRole,
    requireSuperAdmin,
    requireAdmin,
    requireDoctor
};
