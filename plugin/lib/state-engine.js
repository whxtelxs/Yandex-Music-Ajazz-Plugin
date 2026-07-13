'use strict';

const { log } = require('../utils/plugin');
const { deps } = require('./deps');
const { buttonContexts } = require('./contexts');
const { appState } = require('./app-state');
const { getScrollingText } = require('./helpers');
const { getTrackInfoTextSize, setTrackInfoDisplay, setTimeDisplay, clearAllDisplayCaches } = require('./display');
const { getCoverDataUrl } = require('./cover');
const { parseTime, formatTime, projectTime } = require('./time-utils');

const DEFAULT_COVER_IMAGE = 'static/App-logo.png';
const DISCONNECTED_TRACK_TEXT = 'Нет соединения';

const POLL_MS = {
    playback: 5000,
    like: 10000,
    mute: 10000,
    time: 10000,
    metadata: 10000,
    shuffle: 15000,
    repeat: 15000
};

const state = {
    timerId: null,
    running: false,
    due: Object.create(null),
    inFlight: new Map(),
    metadata: null,
    metadataAt: 0,
    metadataPromise: null,
    mediaGeneration: 0,
    mediaRefreshTimer: null,
    mediaRefreshAttempts: 0,
    refreshPreviousTitle: null,
    coverGeneration: 0,
    timer: null,
    lastTimerText: '',
    lastScrollAt: 0,
    presenceUrlLookup: {
        title: '',
        checkedAt: 0,
        failed: false
    },
    coverRetry: {
        title: '',
        timer: null,
        attempts: 0,
        maxAttempts: 40,
        intervalMs: 500
    }
};

function hasAnyContext() {
    return Object.values(buttonContexts).some(contexts => contexts.length > 0);
}

function setButtonState(keys, value) {
    for (const key of keys) {
        buttonContexts[key].forEach(context => deps.plugin.setState(context, value));
    }
}

function updateTrackInfoTitles() {
    if (!appState.scrollingText.text) return;
    buttonContexts.trackInfo.forEach(context => {
        setTrackInfoDisplay(context, getScrollingText(
            appState.scrollingText.text,
            Math.floor(appState.scrollingText.position),
            getTrackInfoTextSize(context)
        ));
    });
    appState.scrollingText.position += appState.scrollingText.speed;
    appState.scrollingText.frameCounter++;
}

function applyTrackInfo(trackInfo, force = false) {
    if (!trackInfo?.title) return;
    const fullText = trackInfo.artist ? `${trackInfo.artist} - ${trackInfo.title}` : trackInfo.title;
    let changed = false;
    if (appState.scrollingText.text !== fullText) {
        appState.scrollingText.text = fullText;
        appState.scrollingText.position = 0;
        appState.scrollingText.frameCounter = 0;
        changed = true;
    }
    if (force || changed || Date.now() - state.lastScrollAt >= 700) {
        state.lastScrollAt = Date.now();
        updateTrackInfoTitles();
    }
}

function syncTimer(timeInfo, playing = state.timer?.playing) {
    const position = parseTime(timeInfo?.progressValue) ?? parseTime(timeInfo?.currentTime);
    const total = parseTime(timeInfo?.progressMax) ?? parseTime(timeInfo?.totalTime);
    if (position === null || total === null) return;
    state.timer = {
        position,
        total,
        playing: !!playing,
        syncedAt: Date.now()
    };
    renderTimer(true);
}

function renderTimer(force = false) {
    if (!deps.yandexMusic.connected || !state.timer || buttonContexts.timeTotal.length === 0) return;
    const position = projectTime(state.timer);
    const current = formatTime(position);
    const total = formatTime(state.timer.total);
    const fingerprint = `${current}|${total}`;
    if (!force && fingerprint === state.lastTimerText) return;
    state.lastTimerText = fingerprint;
    buttonContexts.timeTotal.forEach(context => setTimeDisplay(context, current, total));
    appState.lastTimeInfo = { current, total };
}

function applyTrackInfoFromRemoteState(remote) {
    if (!remote?.trackTitle) return;
    syncPresenceMetadata(remote);
    const cachedArtist = state.metadata?.title === remote.trackTitle ? state.metadata.artist : '';
    const trackInfo = {
        title: remote.trackTitle,
        artist: remote.trackArtist || cachedArtist || '',
        coverUrl: remote.coverUrl || state.metadata?.coverUrl,
        trackUrl: remote.trackUrl || state.metadata?.trackUrl || ''
    };
    applyTrackInfo(trackInfo);
    ensureCoverForTrack(trackInfo);
}

function syncPresenceMetadata(remote) {
    if (!remote?.trackTitle) return;
    const title = String(remote.trackTitle).trim();
    if (!title) return;
    const previous = state.metadata && state.metadata.title === title ? state.metadata : null;
    const trackUrl = String(remote.trackUrl || previous?.trackUrl || '').trim();
    state.metadata = {
        title,
        artist: String(remote.trackArtist || previous?.artist || '').trim(),
        coverUrl: String(remote.coverUrl || previous?.coverUrl || '').trim(),
        trackUrl
    };
    if (trackUrl) state.metadataAt = Date.now();
}

async function ensurePresenceTrackUrl() {
    const remote = deps.yandexMusic.getRemoteState?.() || null;
    if (remote?.trackTitle) syncPresenceMetadata(remote);
    const title = String(state.metadata?.title || remote?.trackTitle || '').trim();
    if (!title) return false;
    if (String(state.metadata?.trackUrl || remote?.trackUrl || '').trim()) return true;

    const lookup = state.presenceUrlLookup;
    const now = Date.now();
    if (lookup.title !== title) {
        lookup.title = title;
        lookup.checkedAt = 0;
        lookup.failed = false;
    }
    if (lookup.failed && now - lookup.checkedAt < 60000) return false;
    if (now - lookup.checkedAt < 15000) return false;

    lookup.checkedAt = now;
    const trackInfo = await singleFlight('presence-track-url', () =>
        deps.yandexMusic.getTrackInfo({ priority: 'background', quiet: true, key: 'presence-track-url' })
    );
    const trackUrl = String(trackInfo?.trackUrl || '').trim();
    if (trackInfo?.title && trackInfo.title === title && trackUrl) {
        state.metadata = {
            title: trackInfo.title || state.metadata?.title || title,
            artist: String(trackInfo.artist || state.metadata?.artist || '').trim(),
            coverUrl: String(trackInfo.coverUrl || state.metadata?.coverUrl || '').trim(),
            trackUrl
        };
        state.metadataAt = Date.now();
        appState.lastTrackInfo = trackInfo;
        lookup.failed = false;
        return true;
    }
    lookup.failed = true;
    return false;
}

function applyYmRemoteState(remote) {
    if (!remote) return;
    if (remote.trackTitle) syncPresenceMetadata(remote);
    if (remote.trackTitle && state.metadata?.title && remote.trackTitle !== state.metadata.title) {
        state.metadataAt = 0;
        state.presenceUrlLookup.title = '';
        state.presenceUrlLookup.checkedAt = 0;
        state.presenceUrlLookup.failed = false;
        clearCoverRetry();
        requestMediaRefresh(75);
    }
    if (remote.playing !== null && remote.playing !== undefined) {
        setButtonState(['playPause'], remote.playing ? 1 : 0);
        if (state.timer) {
            state.timer.position = projectTime(state.timer);
            state.timer.syncedAt = Date.now();
            state.timer.playing = !!remote.playing;
        }
    }
    if (remote.liked !== null && remote.liked !== undefined) setButtonState(['like'], remote.liked ? 1 : 0);
    if (remote.muted !== null && remote.muted !== undefined) setButtonState(['mute', 'volumeEncoder'], remote.muted ? 1 : 0);
    if (remote.shuffleOn !== null && remote.shuffleOn !== undefined) {
        setButtonState(['shuffle'], remote.shuffleAvailable === false ? 0 : (remote.shuffleOn ? 1 : 0));
    }
    if (remote.repeatMode !== null && remote.repeatMode !== undefined) setButtonState(['repeat'], remote.repeatMode);
    if (remote.trackTitle) applyTrackInfoFromRemoteState(remote);
    if (remote.progressValue !== null && remote.progressValue !== undefined) syncTimer(remote, remote.playing);
}

async function singleFlight(key, fn) {
    if (state.inFlight.has(key)) return state.inFlight.get(key);
    const promise = Promise.resolve().then(fn).finally(() => state.inFlight.delete(key));
    state.inFlight.set(key, promise);
    return promise;
}

async function checkPlaybackState() {
    if (buttonContexts.playPause.length === 0 && buttonContexts.timeTotal.length === 0) return;
    const playing = await singleFlight('playback', () => deps.yandexMusic.getPlaybackIsPlaying());
    if (playing === null) return;
    setButtonState(['playPause'], playing ? 1 : 0);
    if (state.timer) {
        state.timer.position = projectTime(state.timer);
        state.timer.syncedAt = Date.now();
        state.timer.playing = playing;
    }
}

async function checkLikeState() {
    if (buttonContexts.like.length === 0) return;
    const liked = await singleFlight('like', () => deps.yandexMusic.getLikeIsLiked());
    if (liked !== null) setButtonState(['like'], liked ? 1 : 0);
}

async function checkMuteState() {
    if (buttonContexts.mute.length === 0 && buttonContexts.volumeEncoder.length === 0) return;
    const muted = await singleFlight('mute', () => deps.yandexMusic.getMuteIsMuted());
    if (muted !== null) setButtonState(['mute', 'volumeEncoder'], muted ? 1 : 0);
}

async function checkShuffleState() {
    if (buttonContexts.shuffle.length === 0) return;
    const pressed = await singleFlight('shuffle', () => deps.yandexMusic.getShufflePressed());
    if (pressed !== null) setButtonState(['shuffle'], pressed ? 1 : 0);
}

async function checkRepeatState() {
    if (buttonContexts.repeat.length === 0) return;
    const mode = await singleFlight('repeat', () => deps.yandexMusic.getRepeatMode());
    if (mode !== null) setButtonState(['repeat'], mode);
}

async function getMetadata(force = false) {
    if (!force && state.metadata && Date.now() - state.metadataAt < 2000) return state.metadata;
    if (state.metadataPromise) return state.metadataPromise;
    const generation = state.mediaGeneration;
    state.metadataPromise = deps.yandexMusic.getTrackInfo()
        .then(value => {
            if (value?.title && generation === state.mediaGeneration) {
                state.metadata = value;
                state.metadataAt = Date.now();
                appState.lastTrackInfo = value;
            }
            return value;
        })
        .finally(() => {
            state.metadataPromise = null;
        });
    return state.metadataPromise;
}

async function checkTrackInfoState() {
    if (buttonContexts.trackInfo.length === 0) return;
    if (deps.yandexMusic.isWarmingUp?.()) return;
    const remote = deps.yandexMusic.getRemoteState();
    if (remote?.trackTitle) {
        applyTrackInfoFromRemoteState(remote);
        return;
    }
    const trackInfo = await getMetadata();
    if (trackInfo?.title) applyTrackInfo(trackInfo, true);
    else if (appState.scrollingText.text) updateTrackInfoTitles();
    else buttonContexts.trackInfo.forEach(context => setTrackInfoDisplay(context, 'Нет данных'));
}

async function checkTimeState() {
    if (buttonContexts.timeTotal.length === 0) return;
    if (deps.yandexMusic.isWarmingUp?.()) return;
    const timeInfo = await singleFlight('time', () => deps.yandexMusic.getTrackTime());
    if (timeInfo) syncTimer(timeInfo);
}

async function applyCover(trackInfo) {
    if (!trackInfo?.coverUrl || buttonContexts.cover.length === 0) return false;
    const generation = ++state.coverGeneration;
    const expectedCoverUrl = trackInfo.coverUrl;
    const dataUrl = await getCoverDataUrl(expectedCoverUrl);
    if (generation !== state.coverGeneration) return false;
    buttonContexts.cover.forEach(context => deps.plugin.setImage(context, dataUrl));
    clearCoverRetry();
    return true;
}

function clearCoverRetry() {
    if (state.coverRetry.timer) clearTimeout(state.coverRetry.timer);
    state.coverRetry.timer = null;
    state.coverRetry.attempts = 0;
    state.coverRetry.title = '';
}

function scheduleCoverRetry(expectedTitle) {
    if (!expectedTitle || buttonContexts.cover.length === 0 || !deps.yandexMusic.connected) return;
    if (state.coverRetry.title !== expectedTitle) {
        clearCoverRetry();
        state.coverRetry.title = expectedTitle;
    }
    if (state.coverRetry.timer) return;

    const attempt = async () => {
        if (!deps.yandexMusic.connected || buttonContexts.cover.length === 0) {
            clearCoverRetry();
            return;
        }

        const currentTitle = state.coverRetry.title;
        if (!currentTitle) return;

        const remote = deps.yandexMusic.getRemoteState?.() || null;
        const remoteCover = String(remote?.coverUrl || '').trim();
        if (remoteCover && remote?.trackTitle === currentTitle) {
            const trackInfo = {
                title: currentTitle,
                artist: String(state.metadata?.artist || remote.trackArtist || '').trim(),
                coverUrl: remoteCover,
                trackUrl: String(state.metadata?.trackUrl || remote.trackUrl || '').trim()
            };
            state.metadata = { ...(state.metadata || {}), ...trackInfo };
            state.metadataAt = Date.now();
            appState.lastTrackInfo = trackInfo;
            if (await applyCover(trackInfo)) return;
        }

        const trackInfo = await deps.yandexMusic.getTrackInfo({
            priority: 'background',
            quiet: true,
            key: 'cover-retry'
        });
        if (trackInfo?.coverUrl && trackInfo.title === currentTitle) {
            state.metadata = { ...(state.metadata || {}), ...trackInfo };
            state.metadataAt = Date.now();
            appState.lastTrackInfo = trackInfo;
            if (await applyCover(trackInfo)) return;
        }

        state.coverRetry.attempts++;
        if (state.coverRetry.attempts >= state.coverRetry.maxAttempts) {
            log.warn(`Обложка для «${currentTitle}» не появилась за отведённое время`);
            clearCoverRetry();
            return;
        }

        state.coverRetry.timer = setTimeout(() => {
            state.coverRetry.timer = null;
            attempt().catch(error => log.error('Ошибка ожидания обложки:', error));
        }, state.coverRetry.intervalMs);
    };

    state.coverRetry.timer = setTimeout(() => {
        state.coverRetry.timer = null;
        attempt().catch(error => log.error('Ошибка ожидания обложки:', error));
    }, state.coverRetry.intervalMs);
}

function ensureCoverForTrack(trackInfo) {
    if (!trackInfo?.title || buttonContexts.cover.length === 0) return;
    if (trackInfo.coverUrl) {
        state.metadata = { ...(state.metadata || {}), ...trackInfo };
        state.metadataAt = Date.now();
        appState.lastTrackInfo = trackInfo;
        applyCover(trackInfo).catch(error => log.error('Ошибка применения обложки:', error));
        return;
    }
    scheduleCoverRetry(trackInfo.title);
}

async function checkCoverState() {
    if (buttonContexts.cover.length === 0) return;
    if (deps.yandexMusic.isWarmingUp?.()) return;
    const trackInfo = await getMetadata();
    ensureCoverForTrack(trackInfo);
}

async function checkMetadataState() {
    if (buttonContexts.trackInfo.length === 0 && buttonContexts.cover.length === 0) return;
    if (deps.yandexMusic.isWarmingUp?.()) return;
    const previousUrl = state.metadata?.coverUrl;
    const trackInfo = await getMetadata(true);
    if (!trackInfo) return;
    if (buttonContexts.trackInfo.length) applyTrackInfo(trackInfo);
    if (buttonContexts.cover.length) {
        if (trackInfo.coverUrl) {
            await applyCover(trackInfo);
        } else {
            scheduleCoverRetry(trackInfo.title);
        }
    }
}

async function refreshMediaState() {
    const generation = ++state.mediaGeneration;
    state.metadata = null;
    state.metadataAt = 0;
    state.metadataPromise = null;
    state.coverGeneration++;

    const trackInfo = await deps.yandexMusic.getTrackInfo({ priority: 'sync' });
    if (generation !== state.mediaGeneration) return;
    if (trackInfo?.title && trackInfo.title === state.refreshPreviousTitle && state.mediaRefreshAttempts < 3) {
        const retryDelay = 150 * (2 ** state.mediaRefreshAttempts++);
        state.mediaRefreshTimer = setTimeout(() => {
            state.mediaRefreshTimer = null;
            refreshMediaState().catch(error => log.error('Ошибка повторной синхронизации трека:', error));
        }, retryDelay);
        return;
    }
    let coverPromise = Promise.resolve();
    if (trackInfo?.title) {
        state.metadata = trackInfo;
        state.metadataAt = Date.now();
        appState.lastTrackInfo = trackInfo;
        if (buttonContexts.trackInfo.length) applyTrackInfo(trackInfo, true);
        if (buttonContexts.cover.length) {
            coverPromise = trackInfo.coverUrl
                ? applyCover(trackInfo).catch(error => log.error('Ошибка быстрой загрузки обложки:', error))
                : Promise.resolve(scheduleCoverRetry(trackInfo.title));
        }
    }
    state.refreshPreviousTitle = null;
    state.mediaRefreshAttempts = 0;

    if (buttonContexts.like.length) {
        const liked = await deps.yandexMusic.getLikeIsLiked({ priority: 'sync' });
        if (generation === state.mediaGeneration && liked !== null) {
            setButtonState(['like'], liked ? 1 : 0);
        }
    }

    const timeInfo = await deps.yandexMusic.getTrackTime({ priority: 'sync' });
    if (generation === state.mediaGeneration && timeInfo) syncTimer(timeInfo);
    await coverPromise;
}

function requestMediaRefresh(delayMs = 100) {
    if (!state.mediaRefreshTimer) {
        state.refreshPreviousTitle = state.metadata?.title || appState.lastTrackInfo?.title || null;
        state.mediaRefreshAttempts = 0;
    }
    clearTimeout(state.mediaRefreshTimer);
    state.mediaRefreshTimer = setTimeout(() => {
        state.mediaRefreshTimer = null;
        refreshMediaState().catch(error => log.error('Ошибка быстрой синхронизации трека:', error));
    }, delayMs);
}

function markDue(key) {
    state.due[key] = 0;
}

async function runDueTask(key, interval, fn, needed) {
    if (!needed || Date.now() < (state.due[key] || 0)) return;
    state.due[key] = Date.now() + interval;
    try {
        await fn();
    } catch (error) {
        log.error(`Ошибка синхронизации ${key}:`, error);
    }
}

async function schedulerTick() {
    if (!state.running) return;
    if (hasAnyContext()) {
        const now = Date.now();
        renderTimer();
        if (buttonContexts.trackInfo.length && deps.yandexMusic.connected && now - state.lastScrollAt >= 700) {
            state.lastScrollAt = now;
            updateTrackInfoTitles();
        }
        await runDueTask('playback', POLL_MS.playback, checkPlaybackState,
            buttonContexts.playPause.length > 0 || buttonContexts.timeTotal.length > 0);
        await runDueTask('like', POLL_MS.like, checkLikeState, buttonContexts.like.length > 0);
        await runDueTask('mute', POLL_MS.mute, checkMuteState,
            buttonContexts.mute.length > 0 || buttonContexts.volumeEncoder.length > 0);
        await runDueTask('time', POLL_MS.time, checkTimeState, buttonContexts.timeTotal.length > 0);
        await runDueTask('metadata', POLL_MS.metadata, checkMetadataState,
            buttonContexts.trackInfo.length > 0 || buttonContexts.cover.length > 0);
        await runDueTask('shuffle', POLL_MS.shuffle, checkShuffleState, buttonContexts.shuffle.length > 0);
        await runDueTask('repeat', POLL_MS.repeat, checkRepeatState, buttonContexts.repeat.length > 0);
    }
    state.timerId = setTimeout(schedulerTick, 250);
}

function startStateChecks() {
    if (state.running) return;
    state.running = true;
    state.timerId = setTimeout(schedulerTick, 0);
}

function stopStateChecks() {
    state.running = false;
    if (state.timerId) clearTimeout(state.timerId);
    if (state.mediaRefreshTimer) clearTimeout(state.mediaRefreshTimer);
    clearCoverRetry();
    state.timerId = null;
    state.mediaRefreshTimer = null;
}

async function resyncAllStates() {
    Object.keys(POLL_MS).forEach(markDue);
    await deps.yandexMusic.refreshRemoteState().catch(() => null);
}

function resetDisconnectedState() {
    if (state.mediaRefreshTimer) {
        clearTimeout(state.mediaRefreshTimer);
        state.mediaRefreshTimer = null;
    }
    clearCoverRetry();

    state.mediaGeneration++;
    state.coverGeneration++;
    state.metadata = null;
    state.metadataAt = 0;
    state.metadataPromise = null;
    state.timer = null;
    state.lastTimerText = '';
    state.lastScrollAt = 0;
    state.refreshPreviousTitle = null;
    state.mediaRefreshAttempts = 0;
    state.presenceUrlLookup.title = '';
    state.presenceUrlLookup.checkedAt = 0;
    state.presenceUrlLookup.failed = false;
    state.inFlight.clear();

    appState.lastTrackInfo = null;
    appState.lastTimeInfo = null;
    appState.scrollingText.text = '';
    appState.scrollingText.position = 0;
    appState.scrollingText.frameCounter = 0;

    clearAllDisplayCaches();

    setButtonState(['playPause'], 0);
    setButtonState(['like'], 0);
    setButtonState(['mute', 'volumeEncoder'], 0);
    setButtonState(['shuffle'], 0);
    setButtonState(['repeat'], 0);

    buttonContexts.timeTotal.forEach(context => setTimeDisplay(context, '00:00', '00:00'));
    buttonContexts.trackInfo.forEach(context => setTrackInfoDisplay(context, DISCONNECTED_TRACK_TEXT));
    buttonContexts.cover.forEach(context => deps.plugin.setImage(context, DEFAULT_COVER_IMAGE));

    log.info('Состояние кнопок сброшено: Яндекс Музыка отключена');
}

function setOptimisticState(kind, value) {
    const mapping = {
        playback: ['playPause'],
        like: ['like'],
        mute: ['mute', 'volumeEncoder'],
        shuffle: ['shuffle'],
        repeat: ['repeat']
    };
    if (mapping[kind]) setButtonState(mapping[kind], value);
    markDue(kind);
}

function getPresenceSnapshot() {
    const remote = deps.yandexMusic.getRemoteState?.() || null;
    const title = state.metadata?.title || remote?.trackTitle || '';
    const artist = state.metadata?.artist || remote?.trackArtist || '';
    const coverUrl = state.metadata?.coverUrl || remote?.coverUrl || '';
    const trackUrl = state.metadata?.trackUrl || remote?.trackUrl || '';
    const playing = remote?.playing !== null && remote?.playing !== undefined
        ? !!remote.playing
        : !!state.timer?.playing;

    let positionSec = null;
    let totalSec = null;
    if (state.timer) {
        positionSec = projectTime(state.timer);
        totalSec = state.timer.total;
    } else {
        positionSec = parseTime(remote?.progressValue) ?? parseTime(remote?.currentTime);
        totalSec = parseTime(remote?.progressMax) ?? parseTime(remote?.totalTime);
    }

    if (!String(title).trim()) return null;
    return {
        title: String(title).trim(),
        artist: String(artist || '').trim(),
        coverUrl: String(coverUrl || '').trim(),
        trackUrl: String(trackUrl || '').trim(),
        playing,
        positionSec,
        totalSec
    };
}

module.exports = {
    applyYmRemoteState,
    applyTrackInfoFromRemoteState,
    checkPlaybackState,
    checkLikeState,
    checkMuteState,
    checkShuffleState,
    checkRepeatState,
    checkTrackInfoState,
    checkTimeState,
    checkCoverState,
    startStateChecks,
    stopStateChecks,
    resyncAllStates,
    resetDisconnectedState,
    requestMediaRefresh,
    setOptimisticState,
    getPresenceSnapshot,
    ensurePresenceTrackUrl,
    formatTime,
    parseTime
};
