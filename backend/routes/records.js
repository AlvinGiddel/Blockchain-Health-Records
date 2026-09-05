const express = require('express');
const recordsController = require('../controllers/recordsController');
const { requireAuth, requireDoctor, requireAdmin, requireSuperAdmin } = require('../middleware/auth');

/**
 * Factory function creating Medical Records & Blockchain Express Router
 * @param {Object} [dependencies]
 * @param {Object} [dependencies.healthBlockchain]
 * @param {Function} [dependencies.checkMempoolThreshold]
 * @param {Function} [dependencies.executeMining]
 * @param {boolean|Function} [dependencies.isMining]
 * @param {Function} [dependencies.syncBlockchainWithDatabase]
 * @param {Function} [dependencies.validateMultiTenantChains]
 * @returns {express.Router}
 */
function createRecordsRouter(dependencies = {}) {
    const router = express.Router();

    // 1. Add new medical record (requires Doctor)
    router.post('/records', requireAuth, requireDoctor, (req, res) => {
        recordsController.createRecord(req, res, dependencies);
    });

    // 2. Get records for a specific patient (Authenticated patient, treating doctor, or org admin)
    router.get('/records/patient/:id', requireAuth, recordsController.getPatientRecords);

    // 3. Get all medical records/consultations (Admin only)
    router.get('/admin/records', requireAuth, requireAdmin, recordsController.getAdminRecords);
    router.get('/records/admin', requireAuth, requireAdmin, recordsController.getAdminRecords);

    // 4. Cryptographic Record Seal Verification (Public verification tool)
    router.post('/records/verify-seal', recordsController.verifySeal);

    // 5. Lightweight Specialist Consultation Note (Doctor or Super Admin)
    router.post('/records/:id/specialist-note', requireAuth, requireDoctor, recordsController.addSpecialistNote);

    // 6. Public Verifiable Medical Record Blockchain Proof (For QR Code Scans)
    router.get('/records/:id/verify-blockchain', recordsController.verifyBlockchainProof);

    // 7. Blockchain Mempool (Pending Ledger Queue - Admin only)
    router.get('/blockchain/mempool', requireAuth, requireAdmin, (req, res) => {
        recordsController.getMempool(req, res, dependencies);
    });

    // 8. Mine pending records into a block (Manual Admin Trigger)
    router.post('/blockchain/mine', requireAuth, requireAdmin, (req, res) => {
        recordsController.mineBlock(req, res, dependencies);
    });

    // 9. Get all blocks (Public ledger)
    router.get('/blockchain/blocks', recordsController.getBlocks);

    // 10. Validate chain integrity (Public verification)
    router.get('/blockchain/validate', (req, res) => {
        recordsController.validateChain(req, res, dependencies);
    });

    // 11. Tamper simulation (Super Admin only, demo records only)
    router.post('/blockchain/tamper', requireAuth, requireSuperAdmin, (req, res) => {
        recordsController.tamperRecord(req, res, dependencies);
    });

    // 12. Self-Healing recovery from blocks (Super Admin only)
    router.post('/blockchain/recover', requireAuth, requireSuperAdmin, (req, res) => {
        recordsController.recoverBlockchain(req, res, dependencies);
    });

    // 13. Designated simulation demo records (Super Admin only)
    router.get('/blockchain/demo-records', requireAuth, requireSuperAdmin, recordsController.getDemoRecords);

    return router;
}

module.exports = createRecordsRouter;
