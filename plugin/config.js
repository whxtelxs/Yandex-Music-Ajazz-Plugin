/**
 * Логирование в файл log/YYYY.M.D.log
 * true — для отладки (может быстро разрастись)
 * нужно для обновления плагина под новый UI от яндекса
 */
module.exports.LOG_TO_FILE = process.env.YM_AJAZZ_LOG === 'true';

/** trace | debug | info | warn | error | off */
module.exports.LOG_LEVEL = module.exports.LOG_TO_FILE ? 'info' : 'error';

/** Discord Rich Presence — Application ID из Developer Portal */
module.exports.DISCORD_APP_ID = '1526130962553901066';

module.exports.DISCORD_REDIRECT_URL = 'https://music.yandex.ru/';