/**
 * Express Async Controller Function Wrapper
 *
 * Catches rejected Promises in async route handlers and automatically passes
 * them to next(err) so they are handled centrally by the Express error middleware,
 * eliminating repetitive boilerplate try/catch blocks in controllers.
 */
const catchAsync = (fn) => {
    return (req, res, next) => {
        return fn(req, res, next).catch(next || ((err) => { throw err; }));
    };
};

module.exports = catchAsync;
