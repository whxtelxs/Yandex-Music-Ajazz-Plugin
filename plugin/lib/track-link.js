'use strict';

const { normalizeYandexMusicUrl } = require('./yandex-music-url');
const { isSameTrack } = require('./track-identity');

function trackLink(track) {
    return normalizeYandexMusicUrl(track?.trackUrl, { requireTrack: true, fallback: '' });
}

async function getCurrentTrackLink(music) {
    if (!music.connected) throw new Error('Яндекс Музыка не подключена');
    const remote = music.getRemoteState?.();
    const cached = remote?.trackTitle ? trackLink(remote) : '';
    if (cached) return cached;
    const track = await music.getTrackInfo({ priority: 'user', quiet: true, key: 'copy-track-link' });
    if (!music.connected) throw new Error('Соединение с Яндекс Музыкой прервано');
    const current = music.getRemoteState?.();
    if (current?.trackTitle && !isSameTrack(current, track)) throw new Error('Трек сменился. Повторите копирование');
    const link = trackLink(current?.trackTitle ? current : null) || trackLink(track);
    if (!link) throw new Error('Ссылка на текущий трек недоступна');
    return link;
}

module.exports = { getCurrentTrackLink };
