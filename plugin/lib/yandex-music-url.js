'use strict';

const DEFAULT_ORIGIN = 'https://music.yandex.ru';

function isYandexMusicHost(hostname) {
    return /^music\.yandex\.(ru|com|by|kz|uz)$/i.test(hostname)
        || /\.yandex\.(ru|com|by|kz|uz)$/i.test(hostname);
}

function extractAlbumIdFromCoverUrl(coverUrl) {
    const match = String(coverUrl || '').match(/\.a\.(\d+)(?:-\d+)?(?:\/|$)/);
    return match ? match[1] : '';
}

function albumUrlFromCoverUrl(coverUrl, origin = DEFAULT_ORIGIN) {
    const albumId = extractAlbumIdFromCoverUrl(coverUrl);
    return albumId ? `${origin}/album/${albumId}` : '';
}

function normalizeYandexMusicUrl(href, { requireTrack = false, fallback = DEFAULT_ORIGIN, coverUrl = '' } = {}) {
    const raw = String(href || '').trim();
    if (!raw) {
        if (!requireTrack) {
            const fromCover = albumUrlFromCoverUrl(coverUrl, DEFAULT_ORIGIN);
            if (fromCover) return fromCover;
        }
        return fallback;
    }

    let normalized = raw;
    if (normalized.startsWith('//')) normalized = `https:${normalized}`;
    if (normalized.startsWith('/')) normalized = `${DEFAULT_ORIGIN}${normalized}`;
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;

    try {
        const parsed = new URL(normalized);
        if (!['http:', 'https:'].includes(parsed.protocol) || !isYandexMusicHost(parsed.hostname)) {
            return fallback;
        }

        const albumId = parsed.searchParams.get('albumId');
        const trackId = parsed.searchParams.get('trackId');
        if (albumId && trackId) {
            return `${parsed.origin}/album/${albumId}/track/${trackId}`;
        }
        if (albumId && !requireTrack) {
            return `${parsed.origin}/album/${albumId}`;
        }

        const path = parsed.pathname.replace(/\/+$/, '') || '';
        const trackMatch = path.match(/\/album\/(\d+)\/track\/(\d+)$/i);
        if (trackMatch) {
            return `${parsed.origin}/album/${trackMatch[1]}/track/${trackMatch[2]}`;
        }
        const albumMatch = path.match(/\/album\/(\d+)$/i);
        if (albumMatch) {
            if (requireTrack) return fallback;
            return `${parsed.origin}/album/${albumMatch[1]}`;
        }
    } catch {
        if (!requireTrack) {
            const fromCover = albumUrlFromCoverUrl(coverUrl, DEFAULT_ORIGIN);
            if (fromCover) return fromCover;
        }
        return fallback;
    }

    if (!requireTrack) {
        const fromCover = albumUrlFromCoverUrl(coverUrl, DEFAULT_ORIGIN);
        if (fromCover) return fromCover;
    }

    return fallback;
}

module.exports = {
    DEFAULT_ORIGIN,
    extractAlbumIdFromCoverUrl,
    albumUrlFromCoverUrl,
    normalizeYandexMusicUrl
};
