'use strict';

const { log } = require('./logger');
const { deps } = require('./deps');
const { buttonContexts } = require('./contexts');
const { appState } = require('./app-state');
const defaultDisplay = require('./display');
const { getCoverDataUrl } = require('./cover');
const { renderCoverProgress, renderTrackProgress } = require('./cover-progress');
const { scrollingWindow } = require('./text-layout');
const { parseTime, formatTime, projectTime } = require('./time-utils');
const { getTrackIdentity, isSameTrack } = require('./track-identity');

const POLL_MS = { playback: 5000, like: 10000, mute: 10000, time: 10000, metadata: 10000, shuffle: 15000, repeat: 15000 };

function createStateEngine({
    getDeps,
    contexts = buttonContexts,
    display = defaultDisplay,
    loadCover = getCoverDataUrl,
    viewState = { lastTrackInfo: null, lastTimeInfo: null, scrollingText: { text: '', position: 0, speed: 1, frameCounter: 0 } },
    now = Date.now
}) {
    const state = {
        running: false, timerId: null, refreshTimer: null, retryTimer: null,
        generation: 0, metadata: null, metadataAt: 0,
        timer: null, playing: false, lastScrollAt: 0, lastTimerText: '',
        buttonStates: new Map(), inFlight: new Map(), due: {},
        coverKey: '', coverData: null, coverPromise: null, coverAttempts: 0,
        progressCoverData: null, progressCoverStep: -1, progressCoverImage: null,
        progressRingKey: '', progressRingImage: null,
        lookupKey: '', lookupAt: 0
    };
    const runtime = () => getDeps();
    const coverProgressContexts = () => contexts.coverProgress || [];
    const trackProgressContexts = () => contexts.trackProgress || [];
    const progressContexts = () => coverProgressContexts().length + trackProgressContexts().length;
    const hasCoverContexts = () => contexts.cover.length || coverProgressContexts().length;

    function setButtonState(keys, value) {
        for (const key of keys) {
            for (const context of contexts[key]) {
                const cacheKey = key + ':' + context;
                if (state.buttonStates.get(cacheKey) === value) continue;
                runtime().plugin.setState(context, value);
                state.buttonStates.set(cacheKey, value);
            }
        }
    }

    function updateTrackText() {
        const text = viewState.scrollingText.text;
        if (!text) return;
        for (const context of contexts.trackInfo) {
            display.setTrackInfoDisplay(context, scrollingWindow(text, viewState.scrollingText.position,
                display.getTrackInfoTextSize(context), display.getTrackInfoFontSize(context)));
        }
        viewState.scrollingText.position++;
        state.lastScrollAt = now();
    }

    function applyTrackInfo(track) {
        if (!track?.title) return;
        const text = track.artist ? track.artist + ' - ' + track.title : track.title;
        if (text !== viewState.scrollingText.text) {
            viewState.scrollingText.text = text;
            viewState.scrollingText.position = 0;
            updateTrackText();
        }
    }

    function acceptMetadata(track) {
        if (!track?.title) return false;
        if (state.metadata && !isSameTrack(state.metadata, track)) {
            state.generation++;
            state.timer = null;
            state.coverKey = '';
            state.coverAttempts = 0;
            clearTimeout(state.retryTimer);
            state.retryTimer = null;
            state.lookupKey = '';
            state.lookupAt = 0;
        }
        const previous = isSameTrack(state.metadata, track) ? state.metadata : null;
        state.metadata = {
            title: String(track.title).trim(),
            artist: String(track.artist || previous?.artist || '').trim(),
            coverUrl: String(track.coverUrl || previous?.coverUrl || '').trim(),
            trackUrl: String(track.trackUrl || previous?.trackUrl || '').trim()
        };
        state.metadataAt = now();
        viewState.lastTrackInfo = state.metadata;
        applyTrackInfo(state.metadata);
        ensureCover(state.metadata);
        return true;
    }

    function syncTimer(time, playing = state.playing) {
        const total = parseTime(time?.totalTime) ?? parseTime(time?.progressMax);
        const raw = parseTime(time?.progressValue);
        const max = parseTime(time?.progressMax);
        const position = raw !== null && max > 0 && total !== null ? raw * total / max : parseTime(time?.currentTime);
        if (position === null || total === null || total < 0) return;
        state.timer = { position: Math.max(0, Math.min(total, position)), total, playing: !!playing, syncedAt: now() };
        renderTimer(true);
    }

    function renderTimer(force = false) {
        if (!runtime().yandexMusic.connected || !state.timer) return;
        updateCoverProgress();
        const current = formatTime(projectTime(state.timer, now()));
        const total = formatTime(state.timer.total);
        const key = current + '|' + total;
        if (!force && key === state.lastTimerText) return;
        state.lastTimerText = key;
        for (const context of contexts.timeTotal) display.setTimeDisplay(context, current, total);
        viewState.lastTimeInfo = { current, total };
    }

    async function read(key, task) {
        if (state.inFlight.has(key)) return state.inFlight.get(key);
        const generation = state.generation;
        const promise = Promise.resolve().then(task).then(value => generation === state.generation ? value : null)
            .finally(() => { if (state.inFlight.get(key) === promise) state.inFlight.delete(key); });
        state.inFlight.set(key, promise);
        return promise;
    }

    async function getMetadata(force = false) {
        if (!force && state.metadata && now() - state.metadataAt < 2000) return state.metadata;
        const value = await read('metadata', () => runtime().yandexMusic.getTrackInfo());
        if (value?.title) acceptMetadata(value);
        return value;
    }

    function deliverCover(data) {
        for (const context of contexts.cover) display.setCoverDisplay(context, data);
        updateCoverProgress();
    }

    function updateCoverProgress() {
        if (!progressContexts()) return;
        const ratio = state.timer?.total > 0 ? Math.max(0, Math.min(1, projectTime(state.timer, now()) / state.timer.total)) : 0;
        const step = Math.floor(ratio * 256);
        if (coverProgressContexts().length && (!state.progressCoverImage || state.progressCoverData !== state.coverData || state.progressCoverStep !== step)) {
            state.progressCoverData = state.coverData;
            state.progressCoverStep = step;
            state.progressCoverImage = renderCoverProgress(state.coverData, step);
        }
        for (const context of coverProgressContexts()) display.setCoverDisplay(context, state.progressCoverImage);
        if (trackProgressContexts().length) {
            const key = step + '|' + Math.min(100, Math.floor(ratio * 100 + 1e-8));
            if (state.progressRingKey !== key || !state.progressRingImage) {
                state.progressRingKey = key;
                state.progressRingImage = renderTrackProgress(ratio);
            }
            for (const context of trackProgressContexts()) display.setCoverDisplay(context, state.progressRingImage);
        }
    }

    function resetCover() {
        state.coverKey = '';
        state.coverData = null;
        deliverCover('static/App-logo.png');
    }

    function scheduleCoverRetry(track) {
        if (state.retryTimer || state.coverAttempts >= 12 || !hasCoverContexts()) return;
        const generation = state.generation;
        const identity = getTrackIdentity(track);
        state.retryTimer = setTimeout(async () => {
            state.retryTimer = null;
            if (generation !== state.generation || !runtime().yandexMusic.connected || !hasCoverContexts()) return;
            state.coverAttempts++;
            try {
                const value = await getMetadata(true);
                if (generation !== state.generation || !isSameTrack(state.metadata, track)) return;
                if (value?.coverUrl && getTrackIdentity(value) === identity) ensureCover(value);
                else scheduleCoverRetry(track);
            } catch (error) {
                log.debug('Cover retry:', error.message);
                if (generation === state.generation) scheduleCoverRetry(track);
            }
        }, Math.min(5000, 500 * 2 ** Math.min(state.coverAttempts, 3)));
    }

    function ensureCover(track) {
        if (!hasCoverContexts() || !track?.title) return;
        if (!track.coverUrl) {
            resetCover();
            scheduleCoverRetry(track);
            return;
        }
        if (state.coverData) deliverCover(state.coverData);
        const key = getTrackIdentity(track) + '|' + track.coverUrl;
        if (state.coverKey === key && state.coverData) return;
        if (state.coverPromise?.key === key) return;
        const generation = state.generation;
        const promise = loadCover(track.coverUrl).then(data => {
            if (generation !== state.generation || !isSameTrack(state.metadata, track) || !runtime().yandexMusic.connected) return;
            if (key !== getTrackIdentity(state.metadata) + '|' + state.metadata.coverUrl) return;
            state.coverKey = key;
            state.coverData = data;
            state.coverAttempts = 0;
            clearTimeout(state.retryTimer);
            state.retryTimer = null;
            deliverCover(data);
        }).catch(error => {
            log.debug('Cover download:', error.message);
            if (generation === state.generation && runtime().yandexMusic.connected
                && key === getTrackIdentity(state.metadata) + '|' + state.metadata?.coverUrl) {
                resetCover();
                scheduleCoverRetry(track);
            }
        }).finally(() => { if (state.coverPromise?.promise === promise) state.coverPromise = null; });
        state.coverPromise = { key, promise };
    }

    function applyYmRemoteState(remote) {
        if (!remote) return;
        const changed = remote.trackTitle && state.metadata && !isSameTrack(state.metadata, remote);
        if (remote.trackTitle) acceptMetadata({ title: remote.trackTitle, artist: remote.trackArtist,
            coverUrl: remote.coverUrl, trackUrl: remote.trackUrl });
        if (changed) requestMediaRefresh(75);
        if (typeof remote.playing === 'boolean') {
            state.playing = remote.playing;
            setButtonState(['playPause'], remote.playing ? 1 : 0);
            if (state.timer) {
                state.timer.position = projectTime(state.timer, now());
                state.timer.syncedAt = now();
                state.timer.playing = remote.playing;
            }
        }
        if (typeof remote.liked === 'boolean') setButtonState(['like'], remote.liked ? 1 : 0);
        if (typeof remote.muted === 'boolean') setButtonState(['mute', 'volumeEncoder'], remote.muted ? 1 : 0);
        if (typeof remote.shuffleOn === 'boolean') setButtonState(['shuffle'], remote.shuffleAvailable === false ? 0 : Number(remote.shuffleOn));
        if (Number.isInteger(remote.repeatMode) && remote.repeatMode >= 0 && remote.repeatMode <= 2) setButtonState(['repeat'], remote.repeatMode);
        if (remote.currentTime != null || remote.progressValue != null) syncTimer(remote, remote.playing);
        updateCoverProgress();
    }

    async function checkPlaybackState() {
        if (!contexts.playPause.length && !contexts.timeTotal.length && !progressContexts()) return;
        const playing = await read('playback', () => runtime().yandexMusic.getPlaybackIsPlaying());
        if (typeof playing === 'boolean') applyYmRemoteState({ playing });
    }

    async function checkBooleanState(key, method, keys) {
        if (!keys.some(name => contexts[name].length)) return;
        const value = await read(key, () => runtime().yandexMusic[method]());
        if (typeof value === 'boolean') setButtonState(keys, Number(value));
    }

    const checkLikeState = () => checkBooleanState('like', 'getLikeIsLiked', ['like']);
    const checkMuteState = () => checkBooleanState('mute', 'getMuteIsMuted', ['mute', 'volumeEncoder']);
    const checkShuffleState = () => checkBooleanState('shuffle', 'getShufflePressed', ['shuffle']);

    async function checkRepeatState() {
        if (!contexts.repeat.length) return;
        const mode = await read('repeat', () => runtime().yandexMusic.getRepeatMode());
        if (Number.isInteger(mode) && mode >= 0 && mode <= 2) setButtonState(['repeat'], mode);
    }

    async function checkTrackInfoState() {
        if (!contexts.trackInfo.length || runtime().yandexMusic.isWarmingUp?.()) return;
        const remote = runtime().yandexMusic.getRemoteState();
        if (remote?.trackTitle) applyYmRemoteState(remote);
        else await getMetadata();
        if (state.metadata) updateTrackText();
        else for (const context of contexts.trackInfo) display.setTrackInfoDisplay(context, 'Нет данных');
    }

    async function checkTimeState() {
        if ((!contexts.timeTotal.length && !progressContexts()) || runtime().yandexMusic.isWarmingUp?.()) return;
        const time = await read('time', () => runtime().yandexMusic.getTrackTime());
        if (time) syncTimer(time);
    }

    async function checkCoverState() {
        if (!hasCoverContexts() || runtime().yandexMusic.isWarmingUp?.()) return;
        const track = state.metadata || await getMetadata();
        if (track) ensureCover(track);
        updateCoverProgress();
    }

    async function refreshMediaState() {
        await getMetadata(true);
        await Promise.all([checkLikeState(), checkTimeState()]);
    }

    function requestMediaRefresh(delayMs = 100) {
        if (state.refreshTimer) return;
        state.refreshTimer = setTimeout(() => {
            state.refreshTimer = null;
            refreshMediaState().catch(error => log.debug('Media refresh:', error.message));
        }, delayMs);
    }

    function schedulerTick() {
        if (!state.running || !runtime().yandexMusic.connected) return;
        try {
            renderTimer();
            if (contexts.trackInfo.length && now() - state.lastScrollAt >= 700) updateTrackText();
            const tasks = [
                ['playback', checkPlaybackState, contexts.playPause.length || contexts.timeTotal.length || progressContexts()],
                ['like', checkLikeState, contexts.like.length],
                ['mute', checkMuteState, contexts.mute.length || contexts.volumeEncoder.length],
                ['time', checkTimeState, contexts.timeTotal.length || progressContexts()],
                ['metadata', () => getMetadata(true), contexts.trackInfo.length || hasCoverContexts()],
                ['shuffle', checkShuffleState, contexts.shuffle.length],
                ['repeat', checkRepeatState, contexts.repeat.length]
            ];
            for (const [key, task, needed] of tasks) {
                if (!needed || now() < (state.due[key] || 0) || state.inFlight.has(key)) continue;
                state.due[key] = now() + POLL_MS[key];
                task().catch(error => log.debug('State poll ' + key + ':', error.message));
            }
        } catch (error) { log.error('Display update:', error); }
    }

    function stopStateChecks() {
        state.running = false;
        clearInterval(state.timerId);
        clearTimeout(state.refreshTimer);
        clearTimeout(state.retryTimer);
        state.timerId = null;
        state.refreshTimer = null;
        state.retryTimer = null;
        state.generation++;
    }

    function resetDisconnectedState() {
        state.generation++;
        clearTimeout(state.refreshTimer);
        clearTimeout(state.retryTimer);
        state.refreshTimer = null;
        state.retryTimer = null;
        state.metadata = null;
        state.timer = null;
        state.playing = false;
        state.coverKey = '';
        state.coverData = null;
        state.coverPromise = null;
        state.coverAttempts = 0;
        state.lastTimerText = '';
        state.buttonStates.clear();
        state.inFlight.clear();
        state.due = {};
        viewState.lastTrackInfo = null;
        viewState.lastTimeInfo = null;
        viewState.scrollingText.text = '';
        viewState.scrollingText.position = 0;
        display.clearAllDisplayCaches();
        for (const key of ['playPause', 'like', 'shuffle', 'repeat', 'mute', 'volumeEncoder']) setButtonState([key], 0);
        for (const context of contexts.trackInfo) display.setTrackInfoDisplay(context, 'Нет связи');
        for (const context of contexts.timeTotal) display.setTimeDisplay(context, '--:--', '--:--');
        deliverCover('static/App-logo.png');
    }

    function getPresenceSnapshot() {
        const remote = runtime().yandexMusic.getRemoteState?.();
        const metadata = state.metadata;
        if (!metadata?.title) return null;
        return { ...metadata, playing: typeof remote?.playing === 'boolean' ? remote.playing : !!state.timer?.playing,
            positionSec: state.timer ? projectTime(state.timer, now()) : null, totalSec: state.timer?.total ?? null };
    }

    async function ensurePresenceTrackUrl() {
        if (!state.metadata?.title || state.metadata.trackUrl) return !!state.metadata?.trackUrl;
        const key = getTrackIdentity(state.metadata);
        if (key === state.lookupKey && now() - state.lookupAt < 15000) return false;
        state.lookupKey = key;
        state.lookupAt = now();
        const generation = state.generation;
        const track = await runtime().yandexMusic.getTrackInfo({ priority: 'background', quiet: true, key: 'presence-url' });
        if (generation !== state.generation || !isSameTrack(track, state.metadata)) return false;
        acceptMetadata(track);
        return !!state.metadata.trackUrl;
    }

    return {
        applyYmRemoteState,
        applyTrackInfoFromRemoteState: applyYmRemoteState,
        checkPlaybackState, checkLikeState, checkMuteState, checkShuffleState, checkRepeatState,
        checkTrackInfoState, checkTimeState, checkCoverState,
        startStateChecks() {
            if (state.running) return;
            state.running = true;
            state.timerId = setInterval(schedulerTick, 250);
        },
        stopStateChecks,
        async resyncAllStates() {
            state.due = {};
            await runtime().yandexMusic.refreshRemoteState();
        },
        resetDisconnectedState,
        requestMediaRefresh,
        setOptimisticState(kind, value) {
            const mapping = { playback: ['playPause'], like: ['like'], mute: ['mute', 'volumeEncoder'], shuffle: ['shuffle'], repeat: ['repeat'] };
            if (kind === 'playback') applyYmRemoteState({ playing: !!value });
            else if (mapping[kind]) setButtonState(mapping[kind], value);
            state.due[kind] = 0;
        },
        getPresenceSnapshot,
        ensurePresenceTrackUrl,
        forgetContext(context) {
            display.clearDisplayCache(context);
            for (const key of state.buttonStates.keys()) if (key.endsWith(':' + context)) state.buttonStates.delete(key);
        }
    };
}

const runtime = createStateEngine({ getDeps: () => deps, viewState: appState });
module.exports = { ...runtime, createStateEngine, parseTime, formatTime };
