'use strict';

const spotify = require('./spotify-media');
const yandex = require('./yandex-music');
const spotifyLauncher = require('./spotify-launcher');
const yandexLauncher = require('./yandex-music-launcher');

const PORTS = Object.freeze({ spotify: 9233, yandex: 9222 });

class MusicController {
    constructor() {
        this.app = 'spotify';
        this.onRemoteStateChange = null;
        this.onConnected = null;
        this.onConnectionChange = null;
        this._bindCallbacks(spotify);
        this._bindCallbacks(yandex);
    }

    _bindCallbacks(controller) {
        controller.onRemoteStateChange = state => {
            if (controller === this.target) this.onRemoteStateChange?.(state);
        };
        controller.onConnected = () => {
            if (controller === this.target) return this.onConnected?.();
        };
        controller.onConnectionChange = connected => {
            if (controller === this.target) this.onConnectionChange?.(connected);
        };
    }

    get target() {
        return this.app === 'yandex' ? yandex : spotify;
    }

    get launcher() {
        return this.app === 'yandex' ? yandexLauncher : spotifyLauncher;
    }

    get connected() { return !!this.target.connected; }
    get port() { return this.target.port; }

    async setApp(app) {
        const nextApp = app === 'yandex' ? 'yandex' : 'spotify';
        if (nextApp === this.app) return;
        await this.target.disconnect({ reconnect: false });
        this.app = nextApp;
        await this.target.setPort(PORTS[nextApp]);
    }

    getPort() { return PORTS[this.app]; }
    setWarmingUp(...args) { return this.target.setWarmingUp?.(...args); }
    clearWarmingUp(...args) { return this.target.clearWarmingUp?.(...args); }
    isWarmingUp(...args) { return this.target.isWarmingUp?.(...args) || false; }
    shouldPreserveUiOnDisconnect(...args) { return this.target.shouldPreserveUiOnDisconnect?.(...args) || false; }
    waitForPlayerReady(...args) { return this.target.waitForPlayerReady?.(...args) || Promise.resolve(true); }
    getRemoteState(...args) { return this.target.getRemoteState?.(...args); }
    refreshRemoteState(...args) { return this.target.refreshRemoteState?.(...args); }
    getTrackInfo(...args) { return this.target.getTrackInfo?.(...args); }
    getTrackTime(...args) { return this.target.getTrackTime?.(...args); }
    getPlaybackIsPlaying(...args) { return this.target.getPlaybackIsPlaying?.(...args); }
    getLikeIsLiked(...args) { return this.target.getLikeIsLiked?.(...args); }
    getMuteIsMuted(...args) { return this.target.getMuteIsMuted?.(...args); }
    getShufflePressed(...args) { return this.target.getShufflePressed?.(...args); }
    getRepeatMode(...args) { return this.target.getRepeatMode?.(...args); }
    togglePlayback(...args) { return this.target.togglePlayback?.(...args); }
    nextTrack(...args) { return this.target.nextTrack?.(...args); }
    previousTrack(...args) { return this.target.previousTrack?.(...args); }
    toggleMute(...args) { return this.target.toggleMute?.(...args); }
    changeVolume(...args) { return this.target.changeVolume?.(...args); }
    seekRelative(...args) { return this.target.seekRelative?.(...args); }
    likeTrack(...args) { return this.target.likeTrack?.(...args); }
    dislikeTrack(...args) { return this.target.dislikeTrack?.(...args); }
    toggleShuffle(...args) { return this.target.toggleShuffle?.(...args); }
    toggleRepeat(...args) { return this.target.toggleRepeat?.(...args); }
    checkConnection(...args) { return this.target.checkConnection?.(...args); }
    setPort(port) { return this.target.setPort(port); }
    connect(...args) { return this.target.connect(...args); }
    getClient(...args) { return this.target.getClient(...args); }
    disconnect(...args) { return this.target.disconnect(...args); }
    requestReconnect(...args) { return this.target.requestReconnect?.(...args); }
    reconnect(...args) { return this.target.reconnect?.(...args); }
}

class MusicLauncher {
    constructor(controller) {
        this.controller = controller;
    }

    get target() { return this.controller.launcher; }
    setApp() {}
    setDebugPort(port) { return this.target.setDebugPort(port); }
    detectRunningDebugPort(...args) { return this.target.detectRunningDebugPort?.(...args); }
    ensureYandexMusicRunning(...args) { return this.target.ensureYandexMusicRunning(...args); }
}

const controller = new MusicController();
module.exports = { controller, launcher: new MusicLauncher(controller), PORTS };
