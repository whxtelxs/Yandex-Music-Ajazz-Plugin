'use strict';

const { Actions, log } = require('../utils/plugin');
const { deps } = require('../lib/deps');
const { appState } = require('../lib/app-state');
const { createSvg } = require('../lib/helpers');
const { checkYandexMusicConnection } = require('../lib/connection');

module.exports = function registerDemoAction(plugin) {
    plugin.demo = new Actions({
        default: {},
        async _willAppear({ context }) {
            let n = 0;
            appState.timers[context] = setInterval(() => {
                const svg = createSvg(++n);
                plugin.setImage(context, `data:image/svg+xml;charset=utf8,${svg}`);
            }, 1000);

            const isConnected = await checkYandexMusicConnection();
            if (isConnected) {
                log.info('Соединение с Яндекс Музыкой установлено успешно');
            } else {
                log.error('Не удалось установить соединение с Яндекс Музыкой');
            }
        },
        _willDisappear({ context }) {
            if (appState.timers[context]) {
                clearInterval(appState.timers[context]);
            }
        },
        _propertyInspectorDidAppear() {},
        keyUp({ context }) {
            checkYandexMusicConnection().then(isConnected => {
                if (isConnected) {
                    log.info('Соединение с Яндекс Музыкой установлено');
                    deps.yandexMusic.togglePlayback().then(result => {
                        if (!result) plugin.showAlert(context);
                    });
                } else {
                    log.error('Нет соединения с Яндекс Музыкой');
                    plugin.showAlert(context);
                }
            });
        },
        dialDown() {},
        dialRotate() {}
    });
};
