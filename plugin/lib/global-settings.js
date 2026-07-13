'use strict';

const { log } = require('../utils/plugin');
const { deps } = require('./deps');
const { mergeGlobalSettings, getSettingsSnapshot } = require('./settings');
const { checkTrackInfoState, checkTimeState } = require('./state-sync');
const { syncDebugModeFromSettings } = require('./debug-settings');
const { syncRunningDebugPort } = require('./debug-port-sync');

function registerGlobalSettings(plugin, discordPresence) {
    plugin.didReceiveGlobalSettings = async ({ payload: { settings } }) => {
        const normalized = mergeGlobalSettings(plugin.constructor.globalSettings || {}, settings || {});
        plugin.constructor.globalSettings = normalized;
        log.info('didReceiveGlobalSettings', normalized);

        const savedPort = getSettingsSnapshot().debugPort;
        if (Number.isNaN(savedPort) || savedPort < 1 || savedPort > 65535) {
            log.error('Некорректный сохранённый CDP порт:', normalized?.debugPort);
            return;
        }

        log.info(`Загружен сохраненный порт: ${savedPort}`);
        deps.launcher?.setDebugPort(savedPort);

        const runningSync = await syncRunningDebugPort({ broadcast: false });
        const effectivePort = runningSync?.port || savedPort;

        try {
            const success = await deps.yandexMusic.setPort(effectivePort);
            log.info(`Результат установки порта ${effectivePort}: ${success ? 'успешно' : 'ошибка'}`);
        } catch (error) {
            log.error(`Ошибка подключения к CDP порту ${effectivePort}:`, error);
            deps.yandexMusic.reconnect();
        }

        await Promise.all([
            checkTrackInfoState(),
            checkTimeState(),
            discordPresence?.applyConfig?.()
        ]);
        syncDebugModeFromSettings();
        deps.settingsServer?.handleGlobalSettings(normalized);
    };
}

module.exports = { registerGlobalSettings };
