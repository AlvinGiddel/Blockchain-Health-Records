const express = require('express');
const router = express.Router();
const organizationController = require('../controllers/organizationController');
const { requireAuth, requireSuperAdmin } = require('../middleware/auth');

/**
 * Healthcare Organizations & Hospital Facilities Routes
 * Mounted at `/api` in server.js
 */

// Public listing of active healthcare facilities
router.get('/organizations/active', organizationController.getActiveOrganizations);

// Super Admin Facility Management
router.get('/admin/organizations', requireAuth, requireSuperAdmin, organizationController.getAdminOrganizations);
router.get('/admin/organizations/pending', requireAuth, requireSuperAdmin, organizationController.getPendingOrganizations);
router.get('/admin/organizations/patient-counts', requireAuth, requireSuperAdmin, organizationController.getOrganizationPatientCounts);
router.get('/admin/organizations/prescription-counts', requireAuth, requireSuperAdmin, organizationController.getOrganizationPrescriptionCounts);
router.post('/admin/organizations/:id/approve', requireAuth, requireSuperAdmin, organizationController.approveOrganization);
router.post('/admin/organizations/:id/reject', requireAuth, requireSuperAdmin, organizationController.rejectOrganization);
router.post('/admin/organizations/:id/status', requireAuth, requireSuperAdmin, organizationController.updateOrganizationStatus);
router.post('/admin/organizations/:id/patients', requireAuth, requireSuperAdmin, organizationController.getOrganizationPatientsWithAudit);
router.post('/admin/organizations/:id/prescriptions', requireAuth, requireSuperAdmin, organizationController.getOrganizationPrescriptionsWithAudit);

// Super Admin Hospital Tenant Provisioning
router.post('/admin/provision-tenant', requireAuth, requireSuperAdmin, organizationController.provisionTenant);

// Centralized domain error handler for isolated router testing
const errorHandler = require('../middleware/errorHandler');
router.use(errorHandler);

module.exports = router;
