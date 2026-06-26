/**
 * Логирование в файл log/YYYY.M.D.log
 * true — для отладки (может быстро разрастись)
 * нужно для обновления плагина под новый UI от яндекса
 */
module.exports.LOG_TO_FILE = process.env.YM_AJAZZ_LOG === '1';

/** trace | debug | info | warn | error | off */
module.exports.LOG_LEVEL = module.exports.LOG_TO_FILE ? 'info' : 'error';
