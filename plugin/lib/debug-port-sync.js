'use strict';

const { log } = require('../utils/plugin');
const { deps } = require('./deps');
const { getSettingsSnapshot } = require('./settings');

async function applyActiveDebugPort(port, { source = 'sync', broadcast = true } = {}) {
    if (!port || port < 1 || port > 65535) return { changed: false, port: null };

    const configuredPort = getSettingsSnapshot().debugPort;
    deps.launcher?.setDebugPort(port);

    if (port === configuredPort) {
        if (broadcast) {
            deps.settingsServer?.broadcast({
                type: 'activePort',
                configuredPort,
                activePort: port,
                adjusted: false,
                source
            });
        }
        return { changed: false, port };
    }

    log.info(`Синхронизация порта отладки (${source}): ${configuredPort} → ${port}`);
    deps.plugin.setGlobalSettings({ debugPort: port });
    await deps.yandexMusic.setPort(port);

    if (broadcast) {
        deps.settingsServer?.broadcast({
            type: 'activePort',
            configuredPort,
            activePort: port,
            adjusted: true,
            source
        });
        deps.settingsServer?.handleGlobalSettings();
    }

    return { changed: true, port, previousPort: configuredPort };
}

async function syncRunningDebugPort(options = {}) {
    if (!deps.launcher) return null;
    const detected = await deps.launcher.detectRunningDebugPort();
    if (!detected) return null;
    return applyActiveDebugPort(detected, { source: 'running-process', ...options });
}

module.exports = {
    applyActiveDebugPort,
    syncRunningDebugPort
};
