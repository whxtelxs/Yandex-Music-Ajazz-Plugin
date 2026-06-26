'use strict';

const { log } = require('../utils/plugin');
const { deps } = require('./deps');

async function checkYandexMusicConnection() {
    const isConnected = await deps.yandexMusic.checkConnection();
    log.info('Проверка соединения с Яндекс Музыкой:', isConnected ? 'Успешно' : 'Ошибка');
    return isConnected;
}

module.exports = { checkYandexMusicConnection };
