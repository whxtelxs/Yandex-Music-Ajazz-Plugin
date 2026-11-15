'use strict';

const { normalizeYandexMusicUrl } = require('./yandex-music-url');
const { isSameTrack } = require('./track-identity');

function trackLink(track) {
    return normalizeYandexMusicUrl(track?.trackUrl, { requireTrack: true, fallback: '' });
}

function albumLink(track) {
    if (!track) return '';
    // The Vibe screen often exposes an album URL or album ID in the cover URL,
    // but does not expose a link to the individual track.
    return normalizeYandexMusicUrl(track.albumUrl || track.trackUrl, {
        fallback: '', coverUrl: track.coverUrl || ''
    });
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
    let link = trackLink(current?.trackTitle ? current : null) || trackLink(track);
    if (!link && typeof music.lookupCurrentTrackLink === 'function') {
        let lookup = null;
        try {
            lookup = await music.lookupCurrentTrackLink();
        } catch {
            // A failed track-only lookup must not prevent an available album fallback.
        }
        if (!music.connected) throw new Error('Соединение с Яндекс Музыкой прервано');
        const latest = music.getRemoteState?.();
        if (lookup?.reason === 'track-changed' || (latest?.trackTitle && !isSameTrack(latest, track))) {
            throw new Error('Трек сменился. Повторите копирование');
        }
        if (lookup?.success && isSameTrack(track, lookup)) link = trackLink(lookup);
    }
    // Keep the exact track URL whenever possible. If only its album is known,
    // copy that instead of showing an error or copying an unrelated track.
    if (!link) link = albumLink(track) || albumLink(current);
    if (!link) throw new Error('Ссылка на текущий трек и альбом недоступна');
    return link;
}

module.exports = { getCurrentTrackLink };
