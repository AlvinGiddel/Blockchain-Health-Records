/**
 * Background Jobs & Workers Domain Index
 */

const autoMinerJob = require('./autoMinerJob');
const licenseCheckJob = require('./licenseCheckJob');

module.exports = {
    autoMinerJob,
    licenseCheckJob
};
