const express = require('express');
const adminController = require('../controllers/adminController');
const { requireAuth, requireAdmin, requireSuperAdmin } = require('../middleware/auth');

/**
 * Factory function creating Admin & User Management Express Router
 * Mounted at `/api` in server.js
 * @param {Object} [dependencies]
 * @param {Function} [dependencies.validateMultiTenantChains]
 * @param {Object} [dependencies.healthBlockchain]
 * @param {Function} [dependencies.syncBlockchainWithDatabase]
 * @returns {express.Router}
 */
function createAdminRouter(dependencies = {}) {
    const router = express.Router();

    // 1. License & Kill-Switch Controls (Super Admin Only)
    router.get('/license/status', requireAuth, requireSuperAdmin, adminController.getLicenseStatusHandler);
    router.post('/license/refresh', requireAuth, requireSuperAdmin, adminController.refreshLicenseHandler);
    router.post('/license/simulate', requireAuth, requireSuperAdmin, adminController.simulateLicenseHandler);

    // 2. Audit Trail (Clinic Admin or Super Admin)
    router.get(['/audit/logs', '/audit-logs'], requireAuth, requireAdmin, adminController.getAuditLogs);

    // 3. Privacy-Preserving Public Health Analytics (Clinic Admin or Super Admin)
    router.get('/analytics/public-health', requireAuth, requireAdmin, adminController.getPublicHealthAnalytics);

    // 4. Admin Dashboard Metrics (Clinic Admin or Super Admin)
    router.get('/admin/stats', requireAuth, requireAdmin, (req, res) => {
        adminController.getAdminStats(req, res, dependencies);
    });

    // 5. Doctor Approval Queue (Super Admin Only)
    router.get('/admin/doctors/pending', requireAuth, requireSuperAdmin, adminController.getPendingDoctors);
    router.post('/admin/doctors/approve/:id', requireAuth, requireSuperAdmin, adminController.approveDoctor);
    router.post('/admin/doctors/reject/:id', requireAuth, requireSuperAdmin, adminController.rejectDoctor);

    // 6. Administrator Approval Queue & Directory (Super Admin Only)
    router.get('/admin/pending', requireAuth, requireSuperAdmin, adminController.getPendingAdmins);
    router.get('/admin/all', requireAuth, requireSuperAdmin, adminController.getAllAdmins);
    router.post('/admin/approve/:id', requireAuth, requireSuperAdmin, adminController.approveAdmin);
    router.post('/admin/reject/:id', requireAuth, requireSuperAdmin, adminController.rejectAdmin);

    // 7. User Deletion & Blockchain Rebuild (Super Admin Only)
    router.delete('/users/:id', requireAuth, requireSuperAdmin, (req, res) => {
        adminController.deleteUser(req, res, dependencies);
    });

    // 8. User Directories & Profiles (Authenticated users)
    router.get('/users/patients', requireAuth, adminController.getPatients);
    router.get('/users/doctors', requireAuth, adminController.getDoctors);
    router.post('/users/update-profile-photo', requireAuth, adminController.updateProfilePhoto);
    router.put('/users/patient/profile', requireAuth, adminController.updatePatientProfile);
    router.put('/users/doctor/profile', requireAuth, adminController.updateDoctorProfile);

    return router;
}

module.exports = createAdminRouter;
