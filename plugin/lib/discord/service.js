'use strict';

const {
    buildPresenceModel,
    worthSending,
    THROTTLE_MS,
    HEARTBEAT_MS,
    AFK_CLEAR_MS
} = require('./builder');
const { connectDiscordClient, formatConnectError } = require('./client');
const { RPCCommands } = require('discord-rpc/src/constants');
const { pid: getPid } = require('discord-rpc/src/util');

const LISTENING = 2;
const MAX_CONNECT_BACKOFF_MS = 60000;

function createDiscordPresenceService({
    log = console,
    getSnapshot,
    getConfig,
    ensureTrackUrl = async () => false,
    onStatusChange = () => {}
} = {}) {
    if (typeof getSnapshot !== 'function' || typeof getConfig !== 'function') {
        throw new Error('Discord presence service requires getSnapshot and getConfig');
    }

    const state = {
        running: false,
        tickTimer: null,
        client: null,
        clientAppId: null,
        connected: false,
        musicConnected: false,
        lastSent: null,
        lastSendAt: 0,
        pausedSince: null,
        afkCleared: false,
        connectFailures: 0,
        nextConnectAt: 0,
        connectPromise: null,
        lastThrottleAt: 0,
        status: 'disabled',
        statusMessage: ''
    };

    function setStatus(status, message = '') {
        if (state.status === status && state.statusMessage === message) return;
        state.status = status;
        state.statusMessage = message;
        onStatusChange({
            status,
            message,
            connected: state.connected
        });
    }

    async function destroyClient() {
        const client = state.client;
        state.client = null;
        state.clientAppId = null;
        state.connected = false;
        if (!client) return;
        try {
            await client.clearActivity();
        } catch (error) {
            log.debug?.('Discord clearActivity:', error.message || error);
        }
        try {
            client.destroy();
        } catch (error) {
            log.debug?.('Discord destroy:', error.message || error);
        }
    }

    async function teardown({ status = 'disabled', message = '' } = {}) {
        state.lastSent = null;
        state.lastSendAt = 0;
        state.pausedSince = null;
        state.afkCleared = false;
        await destroyClient();
        setStatus(status, message);
    }

    function resolveAppId() {
        return String(getConfig()?.appId || '').trim();
    }

    async function ensureClient(appId) {
        if (state.client && state.clientAppId === appId && state.connected) {
            return state.client;
        }
        if (Date.now() < state.nextConnectAt) return null;
        if (state.connectPromise) {
            try {
                return await state.connectPromise;
            } catch {
                return null;
            }
        }

        state.connectPromise = (async () => {
            await destroyClient();
            try {
                const client = await connectDiscordClient(appId, log);
                state.client = client;
                state.clientAppId = appId;
                state.connected = true;
                state.connectFailures = 0;
                state.nextConnectAt = 0;
                state.lastSent = null;
                setStatus('connected', 'Discord подключён');
                return client;
            } catch (error) {
                state.connectFailures += 1;
                const delay = Math.min(
                    MAX_CONNECT_BACKOFF_MS,
                    Math.max(5000, 5000 * (2 ** Math.min(state.connectFailures - 1, 4)))
                );
                state.nextConnectAt = Date.now() + delay;
                state.lastThrottleAt = Date.now();
                const message = error?.message || String(error);
                log.warn?.(`Discord connect failed (retry in ${delay} ms):`, message);
                setStatus('error', formatConnectError(error));
                throw error;
            } finally {
                state.connectPromise = null;
            }
        })();

        try {
            return await state.connectPromise;
        } catch {
            return null;
        }
    }

    async function sendPresence(model, { force = false } = {}) {
        const now = Date.now();
        if (!force && state.lastSendAt && now - state.lastSendAt < THROTTLE_MS) return false;
        if (!worthSending(model, state.lastSent, { force })) return false;

        const appId = resolveAppId();
        if (!appId) return false;

        const client = await ensureClient(appId);
        if (!client) return false;

        const buildActivity = ({
            includeButtons = true,
            includeCover = true,
            includeUrls = true
        } = {}) => {
            const activity = {
                type: LISTENING,
                details: model.details,
                state: model.state,
                instance: false
            };
            if (includeUrls) {
                if (model.detailsUrl) activity.details_url = model.detailsUrl;
                if (model.stateUrl) activity.state_url = model.stateUrl;
            }
            if (includeCover && (model.largeImageKey || model.largeImageText)) {
                activity.assets = {};
                if (model.largeImageKey) {
                    activity.assets.large_image = model.largeImageKey;
                }
                if (model.largeImageText) {
                    activity.assets.large_text = model.largeImageText;
                }
                if (includeUrls && model.largeImageUrl) {
                    activity.assets.large_url = model.largeImageUrl;
                }
            }
            if (includeButtons && model.buttons?.length) {
                activity.buttons = model.buttons;
            }
            return activity;
        };

        const attempts = [
            buildActivity({ includeButtons: true, includeCover: true, includeUrls: true }),
            buildActivity({ includeButtons: false, includeCover: true, includeUrls: true }),
            buildActivity({ includeButtons: false, includeCover: true, includeUrls: false }),
            buildActivity({ includeButtons: false, includeCover: false, includeUrls: false })
        ];

        for (let i = 0; i < attempts.length; i++) {
            try {
                await client.request(RPCCommands.SET_ACTIVITY, {
                    pid: getPid(),
                    activity: attempts[i]
                });
                state.lastSent = model;
                state.lastSendAt = now;
                if (state.status !== 'connected') {
                    setStatus('connected', 'Discord подключён');
                }
                if (i > 0) {
                    log.debug?.(`Discord presence sent with fallback (level ${i})`);
                }
                return true;
            } catch (error) {
                if (i === attempts.length - 1) {
                    log.debug?.('Discord setActivity failed:', error.message || error);
                    await destroyClient();
                    setStatus('error', 'Не удалось обновить статус в Discord');
                    return false;
                }
            }
        }
        return false;
    }

    async function reconcile({ force = false } = {}) {
        const config = getConfig();
        if (!config.enabled) {
            if (state.client) {
                await teardown({ status: 'disabled', message: 'Rich Presence выключен' });
            } else if (state.status !== 'disabled') {
                setStatus('disabled', 'Rich Presence выключен');
            }
            return;
        }

        const appId = resolveAppId();
        if (!appId) {
            await teardown({
                status: 'error',
                message: 'Discord Application ID не настроен в плагине'
            });
            return;
        }

        if (!state.musicConnected) {
            if (state.client) {
                await destroyClient();
                state.lastSent = null;
            }
            setStatus('waiting_music', 'Ожидание подключения к Яндекс Музыке');
            return;
        }

        const snapshot = getSnapshot();
        if (!snapshot?.title?.trim()) {
            setStatus('connected', 'Discord подключён, трек не найден');
            return;
        }

        if (!String(snapshot.trackUrl || '').trim()) {
            await ensureTrackUrl();
        }

        const freshSnapshot = getSnapshot();
        if (!freshSnapshot?.title?.trim()) return;

        const playing = !!freshSnapshot.playing;
        if (!playing) {
            const pausedSince = state.pausedSince ?? Date.now();
            state.pausedSince = pausedSince;
            if (Date.now() - pausedSince >= AFK_CLEAR_MS) {
                if (!state.afkCleared) {
                    await destroyClient();
                    state.lastSent = null;
                    state.afkCleared = true;
                    setStatus('connected', 'Статус снят после долгой паузы');
                }
                return;
            }
        } else {
            state.pausedSince = null;
            state.afkCleared = false;
        }

        const model = buildPresenceModel(freshSnapshot);
        if (!model) return;

        const stale = !state.lastSendAt || Date.now() - state.lastSendAt >= HEARTBEAT_MS;
        await sendPresence(model, { force: force || stale });
    }

    function start() {
        if (state.running) return;
        state.running = true;
        const tick = () => {
            reconcile().catch(error => log.error('Discord reconcile error:', error));
            state.tickTimer = setTimeout(tick, 1000);
        };
        tick();
    }

    function stop() {
        state.running = false;
        if (state.tickTimer) {
            clearTimeout(state.tickTimer);
            state.tickTimer = null;
        }
    }

    return {
        start,
        async stop() {
            stop();
            await teardown({ status: 'disabled', message: '' });
        },
        async applyConfig() {
            const config = getConfig();
            if (!config.enabled) {
                if (state.client) {
                    await teardown({ status: 'disabled', message: 'Rich Presence выключен' });
                } else {
                    setStatus('disabled', 'Rich Presence выключен');
                }
                return;
            }
            const appId = resolveAppId();
            if (!appId) {
                await teardown({
                    status: 'error',
                    message: 'Discord Application ID не настроен в плагине'
                });
                return;
            }
            if (state.clientAppId && state.clientAppId !== appId) {
                await destroyClient();
                state.lastSent = null;
            }
            await reconcile({ force: true });
        },
        setMusicConnected(connected) {
            const next = !!connected;
            if (state.musicConnected === next) return;
            state.musicConnected = next;
            if (!next) {
                state.pausedSince = null;
                state.afkCleared = false;
                state.lastSent = null;
            }
            reconcile({ force: !next }).catch(error => log.error('Discord reconcile error:', error));
        },
        async refresh({ force = false } = {}) {
            await reconcile({ force });
        },
        getStatus() {
            return {
                status: state.status,
                message: state.statusMessage,
                connected: state.connected
            };
        }
    };
}

module.exports = { createDiscordPresenceService };
