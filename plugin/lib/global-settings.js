'use strict';

const { log } = require('../utils/plugin');
const { deps } = require('./deps');
const { mergeGlobalSettings, getSettingsSnapshot } = require('./settings');
const { checkTrackInfoState, checkTimeState } = require('./state-sync');
const { syncDebugModeFromSettings } = require('./debug-settings');
const { syncRunningDebugPort } = require('./debug-port-sync');

function registerGlobalSettings(plugin, discordPresence) {
    plugin.didReceiveGlobalSettings = async ({ payload: { settings } }) => {
        const incomingSettings = { ...(settings || {}) };
        if (Number(incomingSettings.debugPort) === 9222) {
            incomingSettings.debugPort = 9233;
            log.info('Перенос старого Spotify CDP порта 9222 на 9233');
        }
        const normalized = mergeGlobalSettings(plugin.constructor.globalSettings || {}, incomingSettings);
        plugin.constructor.globalSettings = normalized;
        log.info('didReceiveGlobalSettings', normalized);

        await deps.yandexMusic.setApp(normalized.musicApp);
        const automaticPort = normalized.musicApp === 'yandex' ? 9222 : 9233;
        if (normalized.debugPort !== automaticPort) {
            normalized.debugPort = automaticPort;
            plugin.constructor.globalSettings = normalized;
        }

        const savedPort = automaticPort;
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
