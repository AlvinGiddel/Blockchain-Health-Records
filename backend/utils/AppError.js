/**
 * Custom Operational Application Error Class
 *
 * Distinguishes expected operational errors (e.g. invalid input, unauthorized,
 * forbidden, not found, conflict) from unexpected programming or system bugs.
 */
class AppError extends Error {
    constructor(message, statusCode = 500, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
        this.isOperational = true;
        if (details) {
            this.details = details;
        }
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports = AppError;
