'use strict';

const { log } = require('./logger');
const { deps } = require('./deps');
const { getSettingsSnapshot } = require('./settings');
const { checkTrackInfoState, checkTimeState } = require('./state-sync');
const { syncDebugModeFromSettings } = require('./debug-settings');

function registerGlobalSettings(plugin, discordPresence) {
    let previous = null;
    plugin.didReceiveGlobalSettings = async () => {
        const settings = getSettingsSnapshot();
        const old = previous;
        previous = settings;
        deps.launcher?.setDebugPort(settings.debugPort);
        syncDebugModeFromSettings();
        const jobs = [];
        if (!old || settings.debugPort !== old.debugPort) jobs.push(deps.yandexMusic.setPort(settings.debugPort));
        if (!old || settings.trackInfoTextSize !== old.trackInfoTextSize || settings.trackInfoFontSize !== old.trackInfoFontSize) jobs.push(checkTrackInfoState());
        if (!old || settings.timeTotalFontSize !== old.timeTotalFontSize) jobs.push(checkTimeState());
        if (!old || settings.discordRpcEnabled !== old.discordRpcEnabled) jobs.push(discordPresence?.applyConfig?.());
        const results = await Promise.allSettled(jobs);
        for (const result of results) if (result.status === 'rejected') log.error('Применение настроек:', result.reason);
        deps.settingsServer?.handleGlobalSettings();
    };
}

module.exports = { registerGlobalSettings };
