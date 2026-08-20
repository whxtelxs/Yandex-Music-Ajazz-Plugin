'use strict';

const CDP = require('chrome-remote-interface');
const { log } = require('../utils/plugin');

const SPOTIFY_DOM = `
function spotifyButton(labels, testIds) {
    var buttons = Array.from(document.querySelectorAll('button'));
    var byTestId = buttons.find(function(button) {
        return (testIds || []).indexOf(button.getAttribute('data-testid')) !== -1;
    });
    if (byTestId) return byTestId;
    return buttons.find(function(button) {
        var label = (button.getAttribute('aria-label') || '').toLowerCase();
        return labels.some(function(expected) { return label.indexOf(expected) !== -1; });
    }) || null;
}

function spotifyClick(labels, testIds) {
    var button = spotifyButton(labels, testIds);
    if (!button) return { success: false, message: 'Кнопка Spotify не найдена' };
    button.click();
    return { success: true };
}

function spotifyNowPlayingButton(labels, testIds) {
    var root = document.querySelector('[data-testid="now-playing-widget"]');
    if (!root) return null;
    var buttons = Array.from(root.querySelectorAll('button'));
    var byTestId = buttons.find(function(button) {
        return (testIds || []).indexOf(button.getAttribute('data-testid')) !== -1;
    });
    if (byTestId) return byTestId;
    return buttons.find(function(button) {
        var label = (button.getAttribute('aria-label') || '').toLowerCase();
        return labels.some(function(expected) { return label.indexOf(expected) !== -1; });
    }) || null;
}

function spotifyClickNowPlaying(labels, testIds) {
    var button = spotifyNowPlayingButton(labels, testIds);
    if (!button) return { success: false, message: 'Кнопка текущего трека Spotify не найдена' };
    button.click();
    return { success: true };
}

function spotifyRange(kind) {
    var ranges = Array.from(document.querySelectorAll('input[type="range"]'));
    if (kind === 'progress') {
        return document.querySelector('[data-testid="playback-progressbar"] input[type="range"]')
            || ranges.find(function(item) { return Number(item.max) > 1000; })
            || null;
    }
    return ranges.find(function(item) {
        var text = String((item.parentElement?.parentElement?.innerText || '') + ' ' + (item.parentElement?.parentElement?.parentElement?.innerText || '')).toLowerCase();
        return Number(item.max) <= 1 && (text.indexOf('громк') !== -1 || text.indexOf('volume') !== -1);
    }) || ranges.find(function(item) { return Number(item.max) <= 1; }) || null;
}

function spotifySetRange(range, value) {
    if (!range) return false;
    var min = Number(range.min || 0);
    var max = Number(range.max || 1);
    var next = Math.max(min, Math.min(max, value));
    var setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(range, String(next));
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}

function spotifyPressed(labels) {
    var button = spotifyButton(labels);
    if (!button) return null;
    return button.getAttribute('aria-pressed') === 'true' || button.classList.contains('spoticon-repeat-one');
}

function spotifyTrackInfo() {
    var links = Array.from(document.querySelectorAll('a[href*="/track/"]'));
    var trackLink = links.find(function(link) { return link.textContent.trim(); });
    var title = document.querySelector('[data-testid="context-item-link"]')
        || document.querySelector('[data-testid="now-playing-widget"] a[href*="/track/"]')
        || trackLink;
    var artist = document.querySelector('[data-testid="context-item-info-artist"]')
        || document.querySelector('[data-testid="now-playing-widget"] a[href*="/artist/"]');
    var image = document.querySelector('[data-testid="now-playing-widget"] img')
        || document.querySelector('img[alt*="Cover"]');
    if (!title || !title.textContent.trim()) return null;
    return {
        success: true,
        title: title.textContent.trim(),
        artist: artist ? artist.textContent.trim() : '',
        coverUrl: image ? (image.currentSrc || image.src || '') : '',
        trackUrl: trackLink ? (trackLink.href || '') : ''
    };
}

function spotifyTime() {
    var values = Array.from(document.querySelectorAll('[data-testid="playback-duration"], [data-testid="playback-position"]'));
    var parseTime = function(value) {
        var parts = value.trim().split(':').map(Number);
        if (parts.some(isNaN)) return null;
        return parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 3600 + parts[1] * 60 + parts[2];
    };
    if (values.length < 2) return null;
    var currentTime = parseTime(values.find(function(item) { return item.getAttribute('data-testid') === 'playback-position'; }).textContent);
    var totalTime = parseTime(values.find(function(item) { return item.getAttribute('data-testid') === 'playback-duration'; }).textContent);
    if (currentTime === null || totalTime === null) return null;
    return { success: true, currentTime: currentTime, totalTime: totalTime, progressPercent: totalTime ? currentTime / totalTime * 100 : 0 };
}

function spotifyState() {
    var playButton = spotifyButton(['pause', 'play', 'слушать'], ['control-button-playpause']);
    var label = playButton ? (playButton.getAttribute('aria-label') || '').toLowerCase() : '';
    var repeat = spotifyButton(['repeat', 'повторять'], ['control-button-repeat']);
    var track = spotifyTrackInfo();
    var time = spotifyTime();
    return {
        playing: label.indexOf('pause') !== -1 || label.indexOf('пауза') !== -1 ? true : ((label.indexOf('play') !== -1 || label.indexOf('слушать') !== -1) ? false : null),
        liked: spotifyPressed(['remove from your liked songs', 'unlike']),
        muted: spotifyButton(['unmute', 'включить звук'], ['volume-bar-toggle-mute-button']) !== null
            && (spotifyButton(['unmute', 'включить звук'], ['volume-bar-toggle-mute-button']).getAttribute('aria-label') || '').toLowerCase().indexOf('включить') !== -1,
        shuffleOn: spotifyPressed(['disable shuffle', 'shuffle on', 'выключить случайный', 'случайный порядок']),
        repeatMode: repeat && (repeat.className.indexOf('repeat-one') !== -1 || (repeat.getAttribute('aria-label') || '').toLowerCase().indexOf('one') !== -1 || (repeat.getAttribute('aria-label') || '').toLowerCase().indexOf('один') !== -1) ? 2 : (spotifyPressed(['disable repeat', 'repeat on', 'повторять']) ? 1 : 0),
        trackTitle: track && track.title,
        trackArtist: track && track.artist,
        coverUrl: track && track.coverUrl,
        trackUrl: track && track.trackUrl,
        currentTime: time && time.currentTime,
        totalTime: time && time.totalTime,
        progressValue: time && time.currentTime,
        progressMax: time && time.totalTime
    };
}
`;

class SpotifyMediaController {
    constructor() {
        this.port = 9233;
        this.connected = false;
        this.client = null;
        this.connectionPromise = null;
        this._clientGeneration = 0;
        this._reconnectTimer = null;
        this._manualDisconnect = false;
        this.remoteState = null;
        this.onRemoteStateChange = null;
        this.onConnectionChange = null;
    }

    async checkConnection() {
        return !!(await this.getClient());
    }

    async setPort(newPort) {
        if (newPort === this.port && this.client) return true;
        await this.disconnect({ reconnect: false });
        this.port = newPort;
        try { await this.connect(); return true; } catch (_) { return false; }
    }

    requestReconnect() { this._manualDisconnect = false; this.reconnect(); }
    reconnect() {
        if (this._reconnectTimer || this.connected || this._manualDisconnect) return;
        this._reconnectTimer = setTimeout(() => { this._reconnectTimer = null; this.connect().catch(() => this.reconnect()); }, 1500);
    }

    async connect() {
        if (this.client && this.connected) return this.client;
        if (this.connectionPromise) return this.connectionPromise;
        const generation = ++this._clientGeneration;
        this._manualDisconnect = false;
        this.connectionPromise = (async () => {
            const targets = await CDP.List({ port: this.port });
            const target = targets.find(item => item.type === 'page' && /spotify/i.test(`${item.title} ${item.url}`))
                || targets.find(item => item.type === 'page');
            if (!target) throw new Error('Окно Spotify не найдено в CDP');
            const client = await CDP({ port: this.port, target: target.id });
            if (generation !== this._clientGeneration) { await client.close(); throw new Error('Устаревшее подключение'); }
            await Promise.all([client.Page.enable(), client.Runtime.enable()]);
            this.client = client;
            this.connected = true;
            this.onConnectionChange?.(true);
            if (typeof this.onConnected === 'function') {
                Promise.resolve(this.onConnected()).catch(error => log.error('Ошибка полной синхронизации Spotify:', error));
            }
            client.on('disconnect', () => {
                if (generation !== this._clientGeneration || this._manualDisconnect) return;
                this.client = null;
                this.connected = false;
                this.remoteState = null;
                this.onConnectionChange?.(false);
                this.reconnect();
            });
            return client;
        })().finally(() => { this.connectionPromise = null; });
        return this.connectionPromise;
    }

    async getClient() {
        try { return await this.connect(); } catch (_) { return null; }
    }

    async disconnect({ reconnect = false } = {}) {
        this._manualDisconnect = !reconnect;
        this._clientGeneration++;
        if (this._reconnectTimer) clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
        const client = this.client;
        this.client = null;
        this.connected = false;
        this.remoteState = null;
        if (client) await client.close().catch(() => {});
        this.onConnectionChange?.(false);
    }

    isWarmingUp() { return false; }
    setWarmingUp() {}
    clearWarmingUp() {}
    waitForPlayerReady() { return Promise.resolve(true); }
    shouldPreserveUiOnDisconnect() { return false; }

    async evaluate(expression) {
        const client = await this.getClient();
        if (!client) return null;
        const result = await client.Runtime.evaluate({ expression, returnByValue: true });
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Spotify DOM evaluation failed');
        return result.result?.value ?? null;
    }

    getRemoteState() { return this.remoteState; }
    async refreshRemoteState() {
        const state = await this.evaluate(`(function() { ${SPOTIFY_DOM} return spotifyState(); })()`);
        if (state) { this.remoteState = state; this.onRemoteStateChange?.(state); }
        return state;
    }
    async getTrackInfo() { const value = await this.evaluate(`(function() { ${SPOTIFY_DOM} return spotifyTrackInfo(); })()`); return value?.success ? value : null; }
    async getTrackTime() { const value = await this.evaluate(`(function() { ${SPOTIFY_DOM} return spotifyTime(); })()`); return value?.success ? value : null; }
    async getPlaybackIsPlaying() { return (await this.refreshRemoteState())?.playing ?? null; }
    async getLikeIsLiked() { return (await this.refreshRemoteState())?.liked ?? null; }
    async getMuteIsMuted() { return (await this.refreshRemoteState())?.muted ?? null; }
    async getShufflePressed() { return (await this.refreshRemoteState())?.shuffleOn ?? null; }
    async getRepeatMode() { return (await this.refreshRemoteState())?.repeatMode ?? null; }

    async click(labels, testIds = []) { return (await this.evaluate(`(function() { ${SPOTIFY_DOM} return spotifyClick(${JSON.stringify(labels)}, ${JSON.stringify(testIds)}); })()`))?.success || false; }
    togglePlayback() { return this.click(['play', 'pause', 'слушать'], ['control-button-playpause']); }
    nextTrack() { return this.click(['next', 'далее'], ['control-button-skip-forward']); }
    previousTrack() { return this.click(['previous', 'назад'], ['control-button-skip-back']); }
    toggleMute() { return this.click(['mute', 'unmute', 'включить звук', 'выключить звук'], ['volume-bar-toggle-mute-button']).then(success => success ? { success, muted: null } : false); }

    changeVolume(delta) {
        return this.evaluate(`(function() {
            ${SPOTIFY_DOM}
            var slider = spotifyRange('volume');
            return spotifySetRange(slider, Number(slider?.value || 0) + (${Number(delta) || 0} / 100));
        })()`);
    }

    seekRelative(deltaTicks) { return this.evaluate(`(function() { ${SPOTIFY_DOM} var slider = spotifyRange('progress'); if (!slider) return false; return spotifySetRange(slider, Number(slider.value) + ${Number(deltaTicks) * 5000 || 0}); })()`); }
    likeTrack() { return this.evaluate(`(function() { ${SPOTIFY_DOM} return spotifyClickNowPlaying(['like', 'liked songs', 'нравится', 'добавить в медиатеку', 'добавить в любимые треки'], []); })()`).then(value => value?.success || false); }
    dislikeTrack() { return this.evaluate(`(function() { ${SPOTIFY_DOM} return spotifyClickNowPlaying(['hide this song', 'dislike', 'не нравится', 'скрыть в плейлисте'], []); })()`).then(value => value?.success || false); }
    toggleShuffle() { return this.click(['shuffle', 'случайный порядок', 'перемешать']); }
    toggleRepeat() { return this.click(['repeat', 'повторять']); }
}

module.exports = new SpotifyMediaController();
