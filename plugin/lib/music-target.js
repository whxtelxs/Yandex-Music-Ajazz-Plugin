'use strict';

function isMusicTarget(target) {
    if (target?.type !== 'page') return false;
    try {
        const url = new URL(target.url);
        if (url.protocol === 'music-application:' && url.hostname === 'desktop' && !url.username && !url.password) return true;
        if (['http:', 'https:'].includes(url.protocol) && /^music\.yandex\.(ru|com|by|kz|uz)$/i.test(url.hostname)) return true;
        return ['file:', 'app:'].includes(url.protocol) && /yandex.?music|яндекс.?музыка/i.test(target.title || '');
    } catch { return false; }
}

module.exports = { isMusicTarget };
