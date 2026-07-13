'use strict';

const { YANDEX_MUSIC_URL, OPEN_BUTTON_LABEL } = require('./constants');
const { normalizeYandexMusicUrl } = require('../yandex-music-url');

const MAX_TEXT_LEN = 128;
const LARGE_TEXT = 'Открыть в Яндекс Музыке';

function discordText(value) {
    let out = String(value || '').trim();
    if (!out) return '';
    const chars = [...out];
    if (chars.length > MAX_TEXT_LEN) {
        out = chars.slice(0, MAX_TEXT_LEN).join('');
    }
    if ([...out].length === 1) out += ' ';
    return out;
}

function normalizeCover(url) {
    const raw = String(url || '').trim();
    if (!raw) return null;
    let normalized = raw.includes('%%') ? raw.replace(/%%/g, '400x400') : raw;
    if (!/^https?:\/\//i.test(normalized)) {
        normalized = `https://${normalized}`;
    }
    try {
        const parsed = new URL(normalized);
        if (!['http:', 'https:'].includes(parsed.protocol)) return null;
        return parsed.toString();
    } catch {
        return null;
    }
}

function buildArtistState(artist) {
    const normalizedArtist = discordText(artist);
    if (normalizedArtist && normalizedArtist !== 'Неизвестный исполнитель') {
        return normalizedArtist;
    }
    return '';
}

function normalizeTrackUrl(url, fallback = YANDEX_MUSIC_URL, coverUrl = '') {
    return normalizeYandexMusicUrl(url, { requireTrack: false, fallback, coverUrl });
}

function buildPresenceModel(snapshot) {
    if (!snapshot?.title?.trim()) return null;

    const artist = discordText(snapshot.artist) || 'Неизвестный исполнитель';
    const details = discordText(snapshot.title) || 'Неизвестный трек';
    const playing = !!snapshot.playing;
    const trackUrl = normalizeTrackUrl(snapshot?.trackUrl, YANDEX_MUSIC_URL, snapshot?.coverUrl);

    return {
        details,
        state: buildArtistState(artist),
        playing,
        trackUrl,
        largeImageKey: normalizeCover(snapshot.coverUrl),
        largeImageText: LARGE_TEXT,
        detailsUrl: trackUrl,
        stateUrl: trackUrl,
        largeImageUrl: trackUrl,
        buttons: [{
            label: OPEN_BUTTON_LABEL,
            url: trackUrl
        }]
    };
}

function presenceContentKey(model) {
    return JSON.stringify({
        details: model.details,
        state: model.state,
        largeImageKey: model.largeImageKey,
        largeImageText: model.largeImageText,
        buttons: model.buttons
    });
}

function worthSending(next, previous, { force = false } = {}) {
    if (!previous) return true;
    if (force) return true;
    return presenceContentKey(next) !== presenceContentKey(previous);
}

module.exports = {
    THROTTLE_MS: 1000,
    HEARTBEAT_MS: 15000,
    AFK_CLEAR_MS: 15 * 60 * 1000,
    LARGE_TEXT,
    discordText,
    normalizeCover,
    normalizeTrackUrl,
    buildArtistState,
    buildPresenceModel,
    worthSending
};
