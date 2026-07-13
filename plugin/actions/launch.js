'use strict';

const { Actions, log } = require('../utils/plugin');
const { launchYandexMusicApp } = require('../lib/post-launch-sync');

module.exports = function registerLaunchAction(plugin) {
    plugin['ym-launch'] = new Actions({
        default: {},
        keyUp() {
            log.info('Нажата кнопка запуска Яндекс Музыки');
            launchYandexMusicApp({ source: 'launch-button' }).catch(error => {
                log.error('Ошибка фонового запуска Яндекс Музыки:', error);
            });
        }
    });
};
