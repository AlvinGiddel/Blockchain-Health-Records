const express = require('express');
const appointmentsController = require('../controllers/appointmentsController');
const { requireAuth, requireDoctor } = require('../middleware/auth');

/**
 * Factory function creating the Appointments & Consultations Express Router
 * @param {Object} [dependencies]
 * @param {Object} [dependencies.healthBlockchain]
 * @param {Function} [dependencies.checkMempoolThreshold]
 * @returns {express.Router}
 */
function createAppointmentsRouter(dependencies = {}) {
    const router = express.Router();

    // 1. Request a new appointment (Patients or authenticated users)
    router.post('/appointments', requireAuth, appointmentsController.bookAppointment);

    // 2. Fetch appointments filtered by user role
    router.get('/appointments', requireAuth, appointmentsController.getAppointments);

    // 3. Update appointment status (Confirmed / Declined / Completed)
    router.post('/appointments/:id/status', requireAuth, appointmentsController.updateAppointmentStatus);

    // 4. Update doctor availability status and working hours/days
    router.put('/users/doctor/availability', requireAuth, requireDoctor, appointmentsController.updateDoctorAvailability);
    router.put('/appointments/doctor/availability', requireAuth, requireDoctor, appointmentsController.updateDoctorAvailability);

    // 5. Complete a consultation (Doctor only)
    router.post('/consultations', requireAuth, requireDoctor, (req, res) => {
        appointmentsController.completeConsultation(req, res, dependencies);
    });
    router.post('/appointments/consultations', requireAuth, requireDoctor, (req, res) => {
        appointmentsController.completeConsultation(req, res, dependencies);
    });

    // Flexible fallback routes if router is mounted directly at `/api/appointments`
    router.post('/', requireAuth, appointmentsController.bookAppointment);
    router.get('/', requireAuth, appointmentsController.getAppointments);
    router.post('/:id/status', requireAuth, appointmentsController.updateAppointmentStatus);

    return router;
}

module.exports = createAppointmentsRouter;
