'use strict';

const { Actions, log } = require('../utils/plugin');
const { deps } = require('../lib/deps');

async function launchApp(app) {
    await deps.yandexMusic?.setApp(app);
    const result = await deps.launcher?.ensureYandexMusicRunning?.();
    if (!result?.success) return false;
    await deps.yandexMusic?.setPort(result.port);
    deps.yandexMusic?.requestReconnect?.();
    return true;
}

module.exports = function registerLaunchAction(plugin) {
    const createLaunchAction = (app, label) => new Actions({
        default: {},
        async keyUp({ context }) {
            log.info(`Нажата кнопка запуска ${label}`);
            if (!await launchApp(app)) plugin.showAlert(context);
        }
    });

    plugin['ym-launch-spotify'] = createLaunchAction('spotify', 'Spotify');
    plugin['ym-launch-yandex'] = createLaunchAction('yandex', 'Яндекс Музыки');
};
