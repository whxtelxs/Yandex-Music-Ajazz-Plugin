'use strict';

const { log } = require('../utils/plugin');
const { deps } = require('./deps');

function registerGlobalSettings(plugin) {
    plugin.didReceiveGlobalSettings = ({ payload: { settings } }) => {
        log.info('didReceiveGlobalSettings', settings);

        if (!settings?.debugPort) return;

        const savedPort = parseInt(settings.debugPort, 10);
        if (Number.isNaN(savedPort) || savedPort < 1 || savedPort > 65535) return;

        log.info(`Загружен сохраненный порт: ${savedPort}`);
        deps.yandexMusic.setPort(savedPort).then(success => {
            log.info(`Результат установки порта ${savedPort}: ${success ? 'успешно' : 'ошибка'}`);
        });
    };
}

module.exports = { registerGlobalSettings };
