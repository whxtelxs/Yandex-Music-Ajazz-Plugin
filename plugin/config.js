'use strict';

module.exports.LOG_TO_FILE = process.env.YM_AJAZZ_LOG === 'true';
module.exports.LOG_LEVEL = module.exports.LOG_TO_FILE ? 'info' : 'error';
module.exports.DISCORD_APP_ID = '1526130962553901066';
module.exports.DISCORD_REDIRECT_URL = 'https://music.yandex.ru/';
