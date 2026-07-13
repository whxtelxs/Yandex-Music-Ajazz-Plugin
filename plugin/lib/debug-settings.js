'use strict';

const { getSettingsSnapshot } = require('./settings');
const debugLog = require('./debug-log');

function applyDebugMode(enabled) {
    debugLog.setEnabled(!!enabled);
}

function syncDebugModeFromSettings() {
    applyDebugMode(getSettingsSnapshot().debugMode);
}

module.exports = {
    applyDebugMode,
    syncDebugModeFromSettings
};
