const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const db = require('./db');
const { tenantStorage } = db;
const licenseGuard = require('./middleware/licenseGuard');
const { Blockchain, getKenyanTimestamp } = require('./blockchain');

// Domain Routers (Phases 1-6)
const createPaymentRouter = require('./routes/payments');
const authRoutes = require('./routes/auth');
const practitionerRoutes = require('./routes/practitioners');
const createAppointmentsRouter = require('./routes/appointments');
const createRecordsRouter = require('./routes/records');
const organizationRoutes = require('./routes/organizations');
const createAdminRouter = require('./routes/admin');

// Background Jobs & Workers (Phase 7)
const { autoMinerJob, licenseCheckJob } = require('./jobs');
const { initDatabaseSchema } = require('./services/dbInit');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'blockchain_health_secret_key_12345';
const jwt = require('jsonwebtoken');

// ==================== CORE MIDDLEWARE ====================

// CORS configured to allow web clients with standard REST headers
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-organization-id'],
    maxAge: 86400 // Cache CORS preflight for 24h
}));

// Body parser with raw body buffer preservation for webhook signature verification
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// Multi-Tenant Context Middleware: Automatically sets RLS session variables on all DB queries
app.use((req, res, next) => {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let context = null;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7).trim();
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
            context = {
                userId: decoded.id,
                role: decoded.role,
                orgId: req.headers['x-organization-id'] || decoded.organization_id || decoded.organizationId || ''
            };
        } catch (err) {
            // Token expired or invalid
        }
    }

    if (context) {
        tenantStorage.run(context, () => next());
    } else {
        next();
    }
});

// Remote Licensing Guard: Enforces active per-organization license state & trial restrictions
app.use(licenseGuard);

// Unique identifier for the current server run session (re-generated on every server start)
const serverInstanceId = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

// ==================== BASE HEALTH CHECK ROUTES ====================

// Root endpoint for deployment verification
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'Blockchain Health Records API is active for community health nurses',
        serverInstanceId,
        timestamp: getKenyanTimestamp()
    });
});

// Health check endpoint to retrieve the server status and instance ID
app.get(['/api/health', '/health'], (req, res) => {
    res.json({ status: 'ok', serverInstanceId });
});

// ==================== DOMAIN ROUTERS SETUP ====================

// Initialize primary Blockchain Engine instance
const healthBlockchain = new Blockchain();

// Paystack Payments & License Subscriptions Router
app.use('/api/payments', createPaymentRouter(healthBlockchain));

// Authentication & Authorization Router
app.use('/api/auth', authRoutes);

// Practitioners Domain (KMPDC / NCK Verification & Registry) Router
app.use('/api', practitionerRoutes);

// Appointments & Consultations Domain Router
app.use('/api', createAppointmentsRouter({
    healthBlockchain,
    checkMempoolThreshold: () => autoMinerJob.checkMempoolThreshold(healthBlockchain)
}));

// Medical Records & Blockchain Domain Router
app.use('/api', createRecordsRouter({
    healthBlockchain,
    checkMempoolThreshold: () => autoMinerJob.checkMempoolThreshold(healthBlockchain),
    executeMining: (reason) => autoMinerJob.executeMining(reason, healthBlockchain),
    isMining: () => autoMinerJob.isMiningActive(),
    syncBlockchainWithDatabase: () => autoMinerJob.syncBlockchainWithDatabase(healthBlockchain),
    validateMultiTenantChains: (orgId) => autoMinerJob.validateMultiTenantChains(orgId)
}));

// Healthcare Organizations & Facilities Domain Router
app.use('/api', organizationRoutes);

// Super Admin & User Management Domain Router
app.use('/api', createAdminRouter({
    validateMultiTenantChains: (orgId) => autoMinerJob.validateMultiTenantChains(orgId),
    healthBlockchain,
    syncBlockchainWithDatabase: () => autoMinerJob.syncBlockchainWithDatabase(healthBlockchain)
}));

// ==================== BACKGROUND JOBS & SCHEMA BOOTSTRAP ====================

async function bootstrapServices() {
    try {
        await initDatabaseSchema();
        await autoMinerJob.initAutoMiner(healthBlockchain);
        await licenseCheckJob.initLicenseCheckJob();
    } catch (err) {
        console.error('[Server Bootstrap] Background service initialization error:', err.message);
    }
}
bootstrapServices();

// ==================== ERROR HANDLING ====================

// Global 404 handler for unmatched API routes
app.use((req, res) => {
    res.status(404).json({ error: `API endpoint ${req.originalUrl} not found.` });
});

// Global Express error handling middleware
app.use((err, req, res, next) => {
    const statusCode = err.status || err.statusCode || 500;
    if (statusCode >= 500) {
        console.error('[SYS ERROR] Unhandled API Express error:', err);
    }
    res.status(statusCode).json({ 
        error: err.expose || statusCode < 500 ? (err.message || 'Request failed.') : 'Internal server error occurred.', 
        message: err.message 
    });
});

// Global process exception handlers to prevent Node server crashes
process.on('uncaughtException', (err) => {
    console.error('[CRITICAL] Uncaught Exception:', err.stack || err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[CRITICAL] Unhandled Promise Rejection:', reason);
});

// ==================== LISTENER & KEEP-ALIVE ====================

// Start Server with optimized HTTP keep-alive settings (only when not running as a Vercel serverless function)
if (!process.env.VERCEL) {
    const server = app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
}

// Background Keep-Alive Self-Ping for Render deployment
const RENDER_URL = process.env.RENDER_EXTERNAL_URL || process.env.BACKEND_URL;
const ENABLE_KEEP_ALIVE = process.env.ENABLE_KEEP_ALIVE === 'true';
const KEEP_ALIVE_INTERVAL_MINUTES = parseInt(process.env.KEEP_ALIVE_INTERVAL_MINUTES, 10) || 14;

if (RENDER_URL && ENABLE_KEEP_ALIVE) {
    console.log(`[Keep-Alive] Self-ping active for Render deployment (${KEEP_ALIVE_INTERVAL_MINUTES} min interval): ${RENDER_URL}`);
    setInterval(() => {
        const httpModule = RENDER_URL.startsWith('https') ? require('https') : require('http');
        httpModule.get(`${RENDER_URL}/api/health`, (res) => {
            res.resume();
            console.log(`[Keep-Alive] Self-ping sent to ${RENDER_URL}/api/health - Status: ${res.statusCode}`);
        }).on('error', (err) => {
            console.warn(`[Keep-Alive] Self-ping warning: ${err.message}`);
        });
    }, KEEP_ALIVE_INTERVAL_MINUTES * 60 * 1000);
}

module.exports = app;
