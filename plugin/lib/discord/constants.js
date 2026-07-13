'use strict';

const { DISCORD_APP_ID, DISCORD_REDIRECT_URL = 'https://music.yandex.ru/' } = require('../../config');

const YANDEX_MUSIC_URL = DISCORD_REDIRECT_URL;
const OPEN_BUTTON_LABEL = 'Открыть в Яндекс Музыка';

function resolveDiscordAppId(legacyAppId = '') {
    const builtIn = String(DISCORD_APP_ID || '').replace(/\D/g, '').slice(0, 20);
    if (/^\d{5,20}$/.test(builtIn)) return builtIn;
    const legacy = String(legacyAppId || '').replace(/\D/g, '').slice(0, 20);
    return /^\d{5,20}$/.test(legacy) ? legacy : '';
}

module.exports = {
    YANDEX_MUSIC_URL,
    OPEN_BUTTON_LABEL,
    resolveDiscordAppId
};
