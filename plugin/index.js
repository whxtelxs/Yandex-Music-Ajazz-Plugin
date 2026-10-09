'use strict';

const path = require('path');
const { Plugins, log } = require('./utils/plugin');
const yandexMusic = require('./utils/yandex-music');
const launcher = require('./utils/yandex-music-launcher');
const { initDeps, setSettingsServer } = require('./lib/deps');
const { syncRunningDebugPort } = require('./lib/debug-port-sync');
const { registerGlobalSettings } = require('./lib/global-settings');
const { registerPropertyInspector } = require('./lib/property-inspector');
const {
    applyYmRemoteState,
    startStateChecks,
    stopStateChecks,
    resyncAllStates,
    resetDisconnectedState,
    checkTrackInfoState,
    checkTimeState,
    getPresenceSnapshot,
    ensurePresenceTrackUrl
} = require('./lib/state-sync');
const { SettingsServer } = require('./lib/settings-server');
const { createPluginLifecycle } = require('./lib/plugin-lifecycle');
const { registerActions } = require('./actions');
const debugLog = require('./lib/debug-log');
const { syncDebugModeFromSettings } = require('./lib/debug-settings');
const { getDiscordConfig } = require('./lib/settings');
const { createDiscordPresenceService } = require('./lib/discord');

const plugin = new Plugins();
initDeps(plugin, yandexMusic, launcher);
launcher.setDebugPort(9222);

let settingsServer;
let lifecycle;
const { getTrackIdentity } = require('./lib/track-identity');
let lastDiscordTrackKey = null;

const discordPresence = createDiscordPresenceService({
    log,
    getSnapshot: getPresenceSnapshot,
    getConfig: getDiscordConfig,
    ensureTrackUrl: ensurePresenceTrackUrl,
    onStatusChange: payload => settingsServer?.broadcast({ type: 'discordStatus', ...payload })
});

settingsServer = new SettingsServer({
    plugin,
    yandexMusic,
    launcher,
    rootDir: path.resolve(__dirname, '..', 'propertyInspector'),
    getDiscordStatus: () => discordPresence.getStatus(),
    getNowPlayingState: getPresenceSnapshot,
    onSettingsChanged: patch => Promise.all([
        checkTrackInfoState(),
        checkTimeState(),
        Object.prototype.hasOwnProperty.call(patch, 'discordRpcEnabled') ? discordPresence.applyConfig() : Promise.resolve()
    ]),
    logger: log
});
setSettingsServer(settingsServer);
lifecycle = createPluginLifecycle({
    log,
    plugin,
    settingsServer,
    discordPresence,
    yandexMusic,
    stopStateChecks
});
lifecycle.registerProcessHooks();
debugLog.setBroadcast(payload => settingsServer.broadcast(payload));
syncDebugModeFromSettings();

yandexMusic.onRemoteStateChange = remote => {
    applyYmRemoteState(remote);
    settingsServer.publishNowPlaying();
    const nextKey = getTrackIdentity(remote);
    const force = !!nextKey && nextKey !== lastDiscordTrackKey;
    if (nextKey) lastDiscordTrackKey = nextKey;
    discordPresence.refresh({ force }).catch(error => log.error('Discord refresh error:', error));
};
yandexMusic.onConnected = async () => {
    discordPresence.setMusicConnected(true);
    await syncRunningDebugPort({ broadcast: true });
    if (yandexMusic.isWarmingUp?.()) {
        return;
    }
    await resyncAllStates();
    settingsServer.broadcast({ type: 'connectionStatus', ...yandexMusic.getConnectionInfo() });
    await discordPresence.refresh({ force: true });
};
yandexMusic.onConnectionChange = connected => {
    settingsServer.publishNowPlaying();
    discordPresence.setMusicConnected(connected);
    if (!connected && !yandexMusic.shouldPreserveUiOnDisconnect?.()) {
        resetDisconnectedState();
    }
    settingsServer.broadcast({ type: 'connectionStatus', ...yandexMusic.getConnectionInfo(), connected });
};
plugin.onClose = () => lifecycle.shutdown('plugin-close');

registerGlobalSettings(plugin, discordPresence);
registerActions(plugin);
registerPropertyInspector(plugin);
const { registerUpdateService } = require('./lib/update-service');
registerUpdateService();
startStateChecks();
discordPresence.setMusicConnected(!!yandexMusic.connected);
discordPresence.start();
lifecycle.startHostWatchdog();
settingsServer.start().catch(error => {
    log.error('Не удалось запустить панель настроек:', error);
});
