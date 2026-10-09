'use strict';

const CDP = require('chrome-remote-interface');
const { log } = require('../../../lib/logger');
const { withTimeout } = require('../../../lib/async-utils');

const { isMusicTarget } = require('../../../lib/music-target');

module.exports = {
    async setPort(newPort) {
        const port = Number(newPort);
        if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Некорректный CDP порт');
        if (port !== this.port) {
            await this.disconnect({ reconnect: false });
            this.port = port;
            this.reconnectAttempts = 0;
        }
        this._manualDisconnect = false;
        try {
            return !!(await this.connect());
        } catch {
            this.requestReconnect();
            return false;
        }
    },

    async connect() {
        if (this.client && this.connected) return this.client;
        if (this.connectionPromise) return this.connectionPromise;
        const generation = ++this._clientGeneration;
        this._manualDisconnect = false;
        let candidate = null;
        const attempt = (async () => {
            try {
                const targets = await withTimeout(() => CDP.List({ host: '127.0.0.1', port: this.port }),
                    4000, 'CDP discovery timed out');
                if (generation !== this._clientGeneration) throw new Error('CDP connection cancelled');
                const target = targets.find(isMusicTarget);
                if (!target) throw new Error('Не найден интерфейс Яндекс Музыки на выбранном порту');
                const opening = CDP({ host: '127.0.0.1', port: this.port, target: target.id, local: true });
                opening.then(client => {
                    if (generation !== this._clientGeneration) client.close().catch(() => {});
                }, () => {});
                candidate = await withTimeout(opening, 4000, 'CDP connection timed out');
                if (generation !== this._clientGeneration) throw new Error('CDP connection cancelled');
                this.client = candidate;
                await withTimeout(async () => {
                    await Promise.all([candidate.Page.enable(), candidate.Runtime.enable()]);
                    await this._setupStateObserver(candidate);
                }, 5000, 'CDP initialization timed out');
                if (generation !== this._clientGeneration) throw new Error('CDP connection cancelled');
                candidate.on('disconnect', () => {
                    if (generation !== this._clientGeneration || this._manualDisconnect) return;
                    this._clientGeneration++;
                    this.connected = false;
                    this.playerReady = false;
                    this.client = null;
                    this._observerSetup = false;
                    this.remoteState = null;
                    this._domQueue.clear(new Error('CDP disconnected'));
                    this.onConnectionChange?.(false);
                    this.requestReconnect();
                });
                this.connected = true;
                this.lastConnectionError = null;
                this.reconnectAttempts = 0;
                clearTimeout(this._reconnectTimer);
                this._reconnectTimer = null;
                this.onConnectionChange?.(true);
                Promise.resolve(this.onConnected?.()).catch(error => log.error('Ошибка синхронизации:', error));
                return candidate;
            } catch (error) {
                if (candidate) await withTimeout(() => candidate.close(), 500, 'CDP close timed out').catch(() => {});
                if (generation === this._clientGeneration) {
                    this._clientGeneration++;
                    this.connected = false;
                    this.playerReady = false;
                    this.client = null;
                    this.remoteState = null;
                    this._observerSetup = false;
                    this.lastConnectionError = error.message;
                    this.onConnectionChange?.(false);
                }
                log.debug('CDP connection:', error.message);
                throw error;
            }
        })();
        this.connectionPromise = attempt;
        try {
            return await attempt;
        } finally {
            if (this.connectionPromise === attempt) this.connectionPromise = null;
        }
    },

    requestReconnect() {
        this._manualDisconnect = false;
        this.reconnect();
    },

    reconnect() {
        if (this._manualDisconnect || this._reconnectTimer || this.connected) return;
        const delay = Math.min(30000, this.reconnectDelay * 2 ** Math.min(this.reconnectAttempts++, 5));
        this._reconnectTimer = setTimeout(async () => {
            this._reconnectTimer = null;
            try { await this.connect(); } catch { this.reconnect(); }
        }, delay);
    },

    async getClient() {
        try { return await this.connect(); } catch { this.reconnect(); return null; }
    },

    async checkConnection() {
        try {
            const value = await this._evaluateDom('return !!(ymFindSonataPlayerBar() || ymFindVibePlayerBar());',
                { priority: 'sync', key: 'check-connection' });
            this.playerReady = value === true;
            return this.connected && this.playerReady;
        } catch {
            this.playerReady = false;
            return false;
        }
    },

    getConnectionInfo() {
        return {
            connected: this.connected,
            ready: !!this.playerReady,
            stage: this.connected ? (this.playerReady ? 'ready' : 'loading') : 'disconnected',
            port: this.port,
            lastError: this.lastConnectionError || null,
            remoteStateAgeMs: this.remoteStateUpdatedAt ? Date.now() - this.remoteStateUpdatedAt : null,
            queueSize: this._domQueue.size,
            reconnectAttempts: this.reconnectAttempts
        };
    },

    shouldPreserveUiOnDisconnect() {
        return !!this.isWarmingUp?.();
    },

    async disconnect({ reconnect = false } = {}) {
        this._manualDisconnect = !reconnect;
        this._clientGeneration++;
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
        this._domQueue.clear(new Error('CDP connection changed'));
        const client = this.client;
        const scriptId = this._observerScriptId;
        this.client = null;
        this.connected = false;
        this.playerReady = false;
        this.connectionPromise = null;
        this._observerSetup = false;
        this._observerScriptId = null;
        this.remoteState = null;
        this.remoteStateUpdatedAt = 0;
        this.vibeShuffleState = null;
        this.vibeRepeatMode = null;
        this.onConnectionChange?.(false);
        if (client) {
            await withTimeout(async () => {
                await client.Runtime.evaluate({ expression: 'window.__YM_AJAZZ_OBSERVER__?.dispose?.()' }).catch(() => {});
                if (scriptId) await client.Page.removeScriptToEvaluateOnNewDocument({ identifier: scriptId }).catch(() => {});
            }, 500, 'Observer cleanup timed out').catch(() => {});
            await withTimeout(() => client.close(), 500, 'CDP close timed out').catch(() => {});
        }
        if (reconnect) this.requestReconnect();
    },

    isMusicTarget
};
