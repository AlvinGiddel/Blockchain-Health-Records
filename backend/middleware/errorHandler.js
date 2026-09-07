/**
 * Centralized Express Error Handling Middleware
 *
 * Catches all operational AppError instances and unexpected system errors:
 * 1. Preserves explicit HTTP status codes (400, 401, 403, 404, 409, 422, etc.).
 * 2. Logs server-side errors with diagnostic information.
 * 3. Returns a consistent, client-safe JSON shape: { error: message, message: message }.
 * 4. Suppresses internal stack traces and details from leaking to clients in production.
 */

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
    const statusCode = err.statusCode || err.status || 500;
    const isOperational = Boolean(err.isOperational || (statusCode >= 400 && statusCode < 500));

    // Server-side logging
    if (statusCode >= 500) {
        console.error(`[SYS ERROR] Unhandled API Express error [${req.method} ${req.originalUrl || req.url}]:`, err.stack || err);
    } else if (process.env.NODE_ENV !== 'test') {
        console.warn(`[API WARN] ${statusCode} [${req.method} ${req.originalUrl || req.url}]: ${err.message}`);
    }

    // Determine client-safe message
    let safeMessage;
    if (isOperational) {
        safeMessage = err.message || 'Request failed.';
    } else {
        // Unexpected server errors (500+) never leak internal stack details to clients in production
        const isDev = process.env.NODE_ENV === 'development';
        safeMessage = isDev ? (err.message || 'Internal server error occurred.') : 'Internal server error occurred.';
    }

    const payload = {
        error: safeMessage,
        message: safeMessage
    };

    if (err.details && isOperational) {
        payload.details = err.details;
    }

    if (process.env.NODE_ENV === 'development' && statusCode >= 500) {
        payload.stack = err.stack;
    }

    return res.status(statusCode).json(payload);
}

module.exports = errorHandler;
