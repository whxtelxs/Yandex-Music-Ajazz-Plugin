'use strict';

const { buildPresenceModel, worthSending, THROTTLE_MS, HEARTBEAT_MS, AFK_CLEAR_MS } = require('./builder');
const { connectDiscordClient, formatConnectError } = require('./client');
const { withTimeout } = require('../async-utils');

function buildActivity(model, level = 0) {
    const activity = { type: 2, details: model.details, instance: false };
    if (model.state) activity.state = model.state;
    if (level < 3 && (model.largeImageKey || model.largeImageText)) {
        activity.assets = {};
        if (model.largeImageKey) activity.assets.large_image = model.largeImageKey;
        if (model.largeImageText) activity.assets.large_text = model.largeImageText;
        if (level < 2 && model.largeImageUrl) activity.assets.large_url = model.largeImageUrl;
    }
    if (level < 2) {
        if (model.detailsUrl) activity.details_url = model.detailsUrl;
        if (model.stateUrl) activity.state_url = model.stateUrl;
    }
    if (level === 0 && model.buttons?.length) activity.buttons = model.buttons;
    return activity;
}

function createDiscordPresenceService({
    log = console,
    getSnapshot,
    getConfig,
    ensureTrackUrl = async () => false,
    onStatusChange = () => {},
    connectClient = connectDiscordClient
} = {}) {
    if (typeof getSnapshot !== 'function' || typeof getConfig !== 'function') throw new Error('Discord dependencies are required');
    const state = {
        running: false, stopped: false, timer: null, generation: 0,
        client: null, appId: null, musicConnected: false,
        connectAbort: null, reconcilePromise: null, requested: false, force: false,
        lastSent: null, lastSendAt: 0, pausedSince: null, afkCleared: false,
        connectFailures: 0, nextConnectAt: 0, status: 'disabled', message: ''
    };

    function setStatus(status, message = '') {
        if (state.status === status && state.message === message) return;
        state.status = status;
        state.message = message;
        onStatusChange(getStatus());
    }

    function getStatus() {
        return { status: state.status, message: state.message, connected: !!state.client };
    }

    function allowed(generation) {
        return !state.stopped && generation === state.generation && !!getConfig()?.enabled && state.musicConnected;
    }

    async function dispose(client) {
        if (!client) return;
        await withTimeout(() => client.clearActivity(), 600, 'Discord cleanup timed out').catch(() => {});
        await withTimeout(() => client.destroy(), 600, 'Discord close timed out').catch(() => {});
    }

    async function destroyClient() {
        const client = state.client;
        state.client = null;
        state.appId = null;
        state.lastSent = null;
        state.lastSendAt = 0;
        await dispose(client);
    }

    function invalidate() {
        state.generation++;
        state.connectAbort?.abort(new Error('Discord operation cancelled'));
        state.connectAbort = null;
    }

    async function ensureClient(appId, generation) {
        if (!allowed(generation)) return null;
        if (state.client && state.appId === appId) return state.client;
        if (Date.now() < state.nextConnectAt) return null;
        await destroyClient();
        if (!allowed(generation)) return null;
        const controller = new AbortController();
        state.connectAbort = controller;
        setStatus('connecting', 'Подключение к Discord');
        try {
            const client = await connectClient(appId, log, { signal: controller.signal });
            if (!allowed(generation) || String(getConfig().appId || '').trim() !== appId) {
                await dispose(client);
                return null;
            }
            state.client = client;
            state.appId = appId;
            state.connectFailures = 0;
            state.nextConnectAt = 0;
            client.on?.('error', error => log.debug?.('Discord:', error.message));
            client.on?.('disconnected', () => {
                if (state.client !== client) return;
                invalidate();
                destroyClient().catch(error => log.debug?.('Discord cleanup:', error));
                setStatus('error', 'Соединение с Discord прервано');
            });
            setStatus('connected', 'Discord подключён');
            return client;
        } catch (error) {
            if (!allowed(generation)) return null;
            state.nextConnectAt = Date.now() + Math.min(60000, 5000 * 2 ** Math.min(state.connectFailures++, 4));
            setStatus('error', formatConnectError(error));
            log.debug?.('Discord connection:', error.message);
            return null;
        } finally {
            if (state.connectAbort === controller) state.connectAbort = null;
        }
    }

    async function reconcile(force) {
        const generation = state.generation;
        const config = getConfig();
        if (state.stopped || !config.enabled) {
            await destroyClient();
            setStatus('disabled', 'Rich Presence выключен');
            return;
        }
        if (!state.musicConnected) {
            await destroyClient();
            if (generation === state.generation) setStatus('waiting_music', 'Ожидание Яндекс Музыки');
            return;
        }
        let snapshot = getSnapshot();
        if (!snapshot?.title?.trim()) {
            setStatus('waiting_track', 'Ожидание данных трека');
            return;
        }
        if (!snapshot.trackUrl) {
            await withTimeout(ensureTrackUrl, 3000, 'Track URL lookup timed out').catch(() => {});
            if (!allowed(generation)) return;
            snapshot = getSnapshot();
            if (!snapshot?.title?.trim()) return;
        }
        if (!snapshot.playing) {
            state.pausedSince ??= Date.now();
            if (Date.now() - state.pausedSince >= AFK_CLEAR_MS) {
                if (!state.afkCleared) {
                    await destroyClient();
                    state.afkCleared = true;
                    if (allowed(generation)) setStatus('paused', 'Статус снят после долгой паузы');
                }
                return;
            }
        } else {
            state.pausedSince = null;
            state.afkCleared = false;
        }
        const model = buildPresenceModel(snapshot);
        if (!model || !allowed(generation)) return;
        const stale = Date.now() - state.lastSendAt >= HEARTBEAT_MS;
        if (!force && !stale && Date.now() - state.lastSendAt < THROTTLE_MS) return;
        if (!worthSending(model, state.lastSent, { force: force || stale })) return;
        const appId = String(config.appId || '').trim();
        if (!appId) { setStatus('error', 'Discord Application ID не настроен'); return; }
        const client = await ensureClient(appId, generation);
        if (!client || !allowed(generation) || client !== state.client) return;
        for (let level = 0; level < 4; level++) {
            if (!allowed(generation) || client !== state.client) return;
            try {
                await withTimeout(() => client.request('SET_ACTIVITY', { pid: process.pid, activity: buildActivity(model, level) }),
                    2500, 'Discord activity timed out');
                if (!allowed(generation) || client !== state.client) return;
                state.lastSent = model;
                state.lastSendAt = Date.now();
                setStatus('connected', 'Discord подключён');
                return;
            } catch (error) {
                if (!allowed(generation)) return;
                if (error.code === 'ETIMEDOUT' || level === 3) {
                    await destroyClient();
                    if (allowed(generation)) setStatus('error', 'Не удалось обновить статус Discord');
                    return;
                }
            }
        }
    }

    function refresh({ force = false } = {}) {
        if (state.stopped) return Promise.resolve();
        state.requested = true;
        state.force ||= force;
        if (state.reconcilePromise) return state.reconcilePromise;
        const job = Promise.resolve().then(async () => {
            while (state.requested && !state.stopped) {
                const nextForce = state.force;
                state.requested = false;
                state.force = false;
                await reconcile(nextForce);
            }
        }).finally(() => { if (state.reconcilePromise === job) state.reconcilePromise = null; });
        state.reconcilePromise = job;
        return job;
    }

    async function tick() {
        try { await refresh(); } catch (error) { log.error('Discord refresh:', error); }
        if (state.running) state.timer = setTimeout(tick, 1000);
    }

    return {
        start() {
            if (state.running) return;
            state.stopped = false;
            state.running = true;
            tick();
        },
        async stop() {
            state.running = false;
            state.stopped = true;
            state.requested = false;
            clearTimeout(state.timer);
            invalidate();
            await destroyClient();
            setStatus('disabled');
        },
        async applyConfig() {
            invalidate();
            state.nextConnectAt = 0;
            state.connectFailures = 0;
            state.pausedSince = null;
            state.afkCleared = false;
            if (!getConfig().enabled) {
                await destroyClient();
                setStatus('disabled', 'Rich Presence выключен');
                return;
            }
            await refresh({ force: true });
        },
        setMusicConnected(connected) {
            const value = !!connected;
            if (value === state.musicConnected) return;
            state.musicConnected = value;
            invalidate();
            state.pausedSince = null;
            state.afkCleared = false;
            refresh({ force: true }).catch(error => log.error('Discord connection state:', error));
        },
        refresh,
        getStatus
    };
}

module.exports = { createDiscordPresenceService, buildActivity };
