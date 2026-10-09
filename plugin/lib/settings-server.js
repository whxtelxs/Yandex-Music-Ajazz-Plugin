'use strict';

const fs = require('fs');
const http = require('http');
const { createHash, randomBytes } = require('node:crypto');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const { withTimeout } = require('./async-utils');
const performance = require('./performance');
const { OperationQueue } = require('./operation-queue');
const { sanitizeSettingsPatch, getSettingsSnapshot, settingEquals } = require('./settings');
const debugLog = require('./debug-log');
const { NowPlayingFeed } = require('./now-playing');
const { applyDebugMode } = require('./debug-settings');
const { syncRunningDebugPort } = require('./debug-port-sync');
const { launchYandexMusicApp } = require('./post-launch-sync');
const {
    checkForUpdates,
    getPublicInfo
} = require('./update-service');

const HOST = '127.0.0.1';
const PREFERRED_PORT = 17890;

function isAllowedOrigin(origin) {
    if (!origin) return true;
    try {
        const parsed = new URL(origin);
        return parsed.protocol === 'http:'
            && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost');
    } catch {
        return false;
    }
}

class SettingsServer {
    constructor({
        plugin,
        yandexMusic,
        launcher = null,
        rootDir,
        preferredPort = PREFERRED_PORT,
        maxPortAttempts = 65536 - preferredPort,
        onSettingsChanged = async () => {},
        getDiscordStatus = () => null,
        getNowPlayingState = () => null,
        logger = console
    }) {
        this.plugin = plugin;
        this.yandexMusic = yandexMusic;
        this.launcher = launcher;
        this.rootDir = rootDir;
        this.overlayVersion = this._overlayVersion();
        this.preferredPort = preferredPort;
        this.maxPortAttempts = maxPortAttempts;
        this.onSettingsChanged = onSettingsChanged;
        this.getDiscordStatus = getDiscordStatus;
        this.log = logger;
        this.server = null;
        this.wss = null;
        this.port = null;
        this.clients = new Set();
        this.overlayClients = new Set();
        this.overlayTimer = null;
        this.nowPlaying = new NowPlayingFeed({
            getState: getNowPlayingState,
            getConfig: () => getSettingsSnapshot().nowPlaying,
            isConnected: () => !!this.yandexMusic.connected,
            onChange: () => this.publishNowPlaying()
        });
        this.pingTimer = null;
        this.stopping = false;
        this.revision = 0;
        this.settingsFingerprint = null;
        this.fieldRevisions = new Map();
        this.settingsQueue = new OperationQueue({ maxPending: 32, timeoutMs: 20000 });
    }

    _overlayVersion() {
        const hash = createHash('sha256');
        for (const file of ['config.js', 'widget.js', 'view.js', 'widget.css', 'index.html']) {
            try { hash.update(fs.readFileSync(path.join(this.rootDir, 'now-playing', file))); }
            catch { hash.update(file); }
        }
        return hash.digest('hex').slice(0, 16);
    }

    async start() {
        if (this.server) return this.getInfo();
        this.stopping = false;
        this.server = http.createServer((request, response) => this._handleHttp(request, response));
        this.wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
        this.wss.on('connection', socket => socket.overlayOnly ? this._handleOverlaySocket(socket) : this._handleSocket(socket));
        this.server.on('upgrade', (request, socket, head) => this._handleUpgrade(request, socket, head));

        let lastError;
        for (let offset = 0; offset < this.maxPortAttempts; offset++) {
            try {
                await this._listen(this.preferredPort + offset);
                this.port = this.preferredPort + offset;
                this._startHeartbeat();
                this.log.info(`Панель настроек запущена: http://${HOST}:${this.port}`);
                return this.getInfo();
            } catch (error) {
                lastError = error;
                if (!['EADDRINUSE', 'EACCES'].includes(error.code)) break;
            }
        }
        await this.stop();
        throw lastError || new Error('Не удалось запустить сервер панели настроек');
    }

    _listen(port) {
        return new Promise((resolve, reject) => {
            const onError = error => {
                this.server.off('listening', onListening);
                reject(error);
            };
            const onListening = () => {
                this.server.off('error', onError);
                resolve();
            };
            this.server.once('error', onError);
            this.server.once('listening', onListening);
            this.server.listen(port, HOST);
        });
    }

    getInfo() {
        return {
            available: !!this.port,
            port: this.port,
            url: this.port ? `http://${HOST}:${this.port}/` : null
        };
    }

    async open(panel = null) {
        const { url } = this.getInfo();
        if (!url || this.stopping) return false;
        const targetUrl = panel
            ? `${url}?panel=${encodeURIComponent(panel)}`
            : url;
        this.plugin.openUrl(targetUrl);
        if (panel) this.broadcast({ type: 'showPanel', panel });
        return true;
    }

    _snapshotSettings() {
        const settings = getSettingsSnapshot();
        const fingerprint = JSON.stringify(settings);
        if (fingerprint !== this.settingsFingerprint) {
            const previous = this.settingsFingerprint ? JSON.parse(this.settingsFingerprint) : {};
            this.revision++;
            for (const [key, value] of Object.entries(settings)) {
                if (!settingEquals(previous[key], value)) this.fieldRevisions.set(key, this.revision);
            }
            this.settingsFingerprint = fingerprint;
        }
        return settings;
    }

    handleGlobalSettings() {
        this.publishNowPlaying();
        this.broadcast({ type: 'settings', settings: this._snapshotSettings(), revision: this.revision });
    }

    _reply(socket, payload, requestId) {
        if (socket.readyState !== WebSocket.OPEN) return;
        if (payload.type === 'saveResult') payload = { ...payload, settings: this._snapshotSettings(), discordStatus: this.getDiscordStatus() };
        socket.send(JSON.stringify({ ...payload, requestId, revision: this.revision }));
    }

    broadcast(payload) {
        const message = JSON.stringify(payload);
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN && client.bufferedAmount < 512 * 1024) client.send(message);
        }
    }

    async stop() {
        if (this.stopping) return;
        this.stopping = true;
        this.nowPlaying.stop();
        clearInterval(this.overlayTimer);
        this.overlayTimer = null;
        this.overlayClients.clear();
        this.settingsQueue.clear(new Error('Settings server stopped'));
        clearInterval(this.pingTimer);
        this.pingTimer = null;

        try {
            this.broadcast({ type: 'shutdown' });
        } catch {
        }

        for (const client of [...this.clients]) {
            try {
                client.terminate();
            } catch {
                client.close(1001, 'Plugin stopped');
            }
        }
        this.clients.clear();

        if (this.wss) {
            for (const client of this.wss.clients) {
                try {
                    client.terminate();
                } catch {
                }
            }
        }

        await Promise.all([
            new Promise(resolve => {
                if (!this.wss) return resolve();
                this.wss.close(() => resolve());
                setTimeout(resolve, 300).unref?.();
            }),
            new Promise(resolve => {
                if (!this.server) return resolve();
                this.server.closeAllConnections?.();
                this.server.close(() => resolve());
                setTimeout(resolve, 300).unref?.();
            })
        ]);

        this.server = null;
        this.wss = null;
        this.port = null;
    }

    _securityHeaders(response, overlay = false, nonce = null) {
        response.setHeader('Content-Security-Policy', [
            "default-src 'self'",
            "script-src 'self'",
            nonce ? `style-src 'self' 'nonce-${nonce}'` : "style-src 'self'",
            overlay ? "img-src 'self' data:" : "img-src 'self' data: https:",
            `connect-src 'self' ws://${HOST}:*`,
            overlay ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
            "base-uri 'none'"
        ].join('; '));
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Referrer-Policy', 'no-referrer');
        response.setHeader('Cache-Control', 'no-store');
    }

    _handleHttp(request, response) {
        const nonce = request.url === '/' || request.url?.startsWith('/?') ? randomBytes(18).toString('base64') : null;
        this._securityHeaders(response, request.url?.startsWith('/now-playing'), nonce);
        let requestUrl;
        try { requestUrl = new URL(request.url, `http://${HOST}:${this.port || this.preferredPort}`); } catch {
            response.writeHead(400).end('Bad Request');
            return;
        }

        if (request.method !== 'GET') {
            response.writeHead(405).end('Method Not Allowed');
            return;
        }
        if (requestUrl.pathname.startsWith('/now-playing/cover/')) {
            const cover = this.nowPlaying.getCover(requestUrl.pathname.slice('/now-playing/cover/'.length));
            if (!cover || requestUrl.pathname !== '/now-playing/cover/' + cover.key) {
                response.writeHead(404).end('Not Found');
                return;
            }
            response.setHeader('Content-Type', cover.mime);
            response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            response.setHeader('Content-Length', cover.data.length);
            response.end(cover.data);
            return;
        }
        if (requestUrl.pathname === '/now-playing') {
            try {
                const html = fs.readFileSync(path.join(this.rootDir, 'now-playing', 'index.html'), 'utf8')
                    .replaceAll('__OVERLAY_VERSION__', this.overlayVersion);
                response.setHeader('Content-Type', 'text/html; charset=utf-8');
                response.end(html);
            } catch (error) {
                this.log.error('OBS page:', error);
                response.writeHead(500).end('Internal Server Error');
            }
            return;
        }
        if (requestUrl.pathname === '/api/health') {
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({ ok: true }));
            return;
        }
        if (requestUrl.pathname === '/') {
            this._sendFile(response, path.join(this.rootDir, 'dashboard', 'index.html'), 'text/html; charset=utf-8', data => Buffer.from(data.toString('utf8').replace('__CSP_NONCE__', nonce)));
            return;
        }

        const assets = {
            '/assets/logo.svg': [path.join(this.rootDir, 'dashboard', 'logo.svg'), 'image/svg+xml'],
            '/assets/panel.js': [path.join(this.rootDir, 'dashboard', 'dist', 'panel.js'), 'text/javascript; charset=utf-8'],
            '/assets/panel.css': [path.join(this.rootDir, 'dashboard', 'dist', 'panel.css'), 'text/css; charset=utf-8'],
            '/assets/now-playing-config.js': [path.join(this.rootDir, 'now-playing', 'config.js'), 'text/javascript; charset=utf-8'],
            '/assets/now-playing-widget.js': [path.join(this.rootDir, 'now-playing', 'widget.js'), 'text/javascript; charset=utf-8'],
            '/assets/now-playing-view.js': [path.join(this.rootDir, 'now-playing', 'view.js'), 'text/javascript; charset=utf-8'],
            '/assets/now-playing.css': [path.join(this.rootDir, 'now-playing', 'widget.css'), 'text/css; charset=utf-8'],
            '/assets/tailwind.css': [path.join(this.rootDir, 'utils', 'tailwind.css'), 'text/css; charset=utf-8'],
            '/assets/logo.png': [path.resolve(this.rootDir, '..', 'static', 'App-logo.png'), 'image/png']
        };
        const asset = Object.hasOwn(assets, requestUrl.pathname) ? assets[requestUrl.pathname] : null;
        if (!asset) {
            response.writeHead(404).end('Not Found');
            return;
        }
        this._sendFile(response, asset[0], asset[1]);
    }

    _sendFile(response, filePath, contentType, transform = data => data) {
        try {
            const data = transform(fs.readFileSync(filePath));
            response.setHeader('Content-Type', contentType);
            response.setHeader('Content-Length', data.length);
            response.end(data);
        } catch (error) {
            this.log.error('Ошибка чтения файла dashboard:', error);
            response.writeHead(500).end('Internal Server Error');
        }
    }

    _handleUpgrade(request, socket, head) {
        try {
            const requestUrl = new URL(request.url, `http://${HOST}:${this.port}`);
            const allowed = ['/ws', '/now-playing/ws'].includes(requestUrl.pathname)
                && isAllowedOrigin(request.headers.origin);
            if (!allowed || this.stopping) {
                socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
                socket.destroy();
                return;
            }
            this.wss.handleUpgrade(request, socket, head, client => {
                client.overlayOnly = requestUrl.pathname === '/now-playing/ws';
                this.wss.emit('connection', client, request);
            });
        } catch {
            socket.destroy();
        }
    }

    async _buildConnectionInfo() {
        const settings = getSettingsSnapshot();
        const activePort = await this.launcher?.detectRunningDebugPort?.() ?? null;
        return {
            connected: !!this.yandexMusic.connected,
            ...this.yandexMusic.getConnectionInfo?.(),
            debugPort: settings.debugPort,
            activePort,
            portMismatch: !!activePort && activePort !== settings.debugPort
        };
    }

    async _sendHello(socket) {
        const settings = this._snapshotSettings();
        this._reply(socket, {
            type: 'hello',
            settings,
            connection: await this._buildConnectionInfo(),
            discordStatus: this.getDiscordStatus(),
            debugLogs: debugLog.getBuffer(),
            updateInfo: getPublicInfo(),
            revision: this.revision
        });
    }

    _handleSocket(socket) {
        socket.isAlive = true;
        this.clients.add(socket);
        socket.on('pong', () => {
            socket.isAlive = true;
        });
        socket.on('close', () => this.clients.delete(socket));
        socket.on('error', error => this.log.warn('Dashboard WebSocket:', error.message));
        socket.pendingCommands = 0;
        socket.on('message', raw => {
            if (socket.pendingCommands >= 8) {
                this._reply(socket, { type: 'commandError', ok: false, error: 'Слишком много запросов' });
                return;
            }
            socket.pendingCommands++;
            this._handleSocketMessage(socket, raw).finally(() => socket.pendingCommands--).catch(error => this.log.error('Dashboard:', error));
        });
        this._sendHello(socket).catch(error => this.log.error('Ошибка hello dashboard:', error));
    }

    async _saveSettings(message) {
        this._snapshotSettings();
        const patch = sanitizeSettingsPatch(message.settings);
        if (!Object.keys(patch).length) return { type: 'saveResult', ok: true, persisted: true };
        if (Number.isInteger(message.revision)) {
            for (const key of Object.keys(patch)) {
                if ((this.fieldRevisions.get(key) || 0) > message.revision) {
                    return { type: 'saveResult', ok: false, conflict: true, error: 'Настройка изменена в другой панели. Проверьте новое значение' };
                }
            }
        }
        const previous = getSettingsSnapshot();
        const persisted = typeof this.plugin.saveGlobalSettings === 'function';
        if (persisted) await this.plugin.saveGlobalSettings(patch);
        else this.plugin.setGlobalSettings(patch);
        let applied = true;
        if ('debugPort' in patch && patch.debugPort !== previous.debugPort) {
            this.launcher?.setDebugPort(patch.debugPort);
            applied = await this.yandexMusic.setPort(patch.debugPort);
        }
        if ('debugMode' in patch) applyDebugMode(patch.debugMode);
        await this.onSettingsChanged(patch);
        this.handleGlobalSettings();
        return { type: 'saveResult', ok: true, persisted, applied,
            message: applied ? null : 'Настройки сохранены. Музыка пока не подключена' };
    }

    async _handleSocketMessage(socket, raw) {
        let message;
        try {
            message = JSON.parse(raw.toString());
            if (!message || typeof message.type !== 'string') throw new Error('Некорректная команда');
            const result = await withTimeout(async () => {
                switch (message.type) {
                    case 'getSettings':
                        return { type: 'settings', settings: getSettingsSnapshot() };
                    case 'checkConnection': {
                        await syncRunningDebugPort();
                        const connected = await this.yandexMusic.checkConnection();
                        const connection = await this._buildConnectionInfo();
                        return { type: 'connectionStatus', ok: true, connected, connection };
                    }
                    case 'launchApp': {
                        if (!this.launcher) throw new Error('Лаунчер недоступен');
                        const result = await launchYandexMusicApp({ source: 'dashboard', restart: message.restart === true });
                        return { type: 'launchResult', ok: !!result.success, ...result,
                            connection: await this._buildConnectionInfo() };
                    }
                    case 'updateSettings':
                        return this.settingsQueue.enqueue(() => this._saveSettings(message), { priority: 'user' });
                    case 'clearDebugLog':
                        debugLog.clear();
                        return { type: 'commandResult', ok: true };
                    case 'checkUpdates':
                        await checkForUpdates({ notify: false });
                        return { type: 'updateInfo', ...getPublicInfo() };
                    case 'getDiagnostics':
                        return { type: 'diagnostics', ok: true, report: {
                            generatedAt: new Date().toISOString(),
                            version: getPublicInfo().currentVersion,
                            runtime: process.version,
                            platform: process.platform,
                            connection: this.yandexMusic.getConnectionInfo?.() || { connected: this.yandexMusic.connected },
                            settings: getSettingsSnapshot(),
                            discord: this.getDiscordStatus(),
                            performance: performance.snapshot(),
                            logs: debugLog.getBuffer()
                        } };
                    default:
                        throw new Error('Неизвестная команда');
                }
            }, message.type === 'launchApp' ? 45000 : 25000, 'Время ожидания команды истекло');
            this._reply(socket, result, message.requestId);
        } catch (error) {
            this.log.error('Ошибка команды dashboard:', error);
            const types = { updateSettings: 'saveResult', launchApp: 'launchResult', checkConnection: 'connectionStatus' };
            this._reply(socket, { type: types[message?.type] || 'commandError', ok: false,
                error: error.message || 'Не удалось выполнить команду' }, message?.requestId);
        }
    }

    publishNowPlaying() {
        if (this.stopping) return;
        const targets = [...this.overlayClients];
        try {
            const snapshot = this.nowPlaying.snapshot();
            if (!targets.length) return;
            const frame = JSON.stringify({ ...snapshot, rendererVersion: this.overlayVersion });
            for (const socket of targets) {
                if (socket.readyState !== WebSocket.OPEN) continue;
                if (socket.bufferedAmount > 512 * 1024) { socket.terminate(); continue; }
                socket.send(frame);
            }
        } catch (error) {
            this.log.warn('OBS: ' + error.message);
        }
    }

    _handleOverlaySocket(socket) {
        socket.isAlive = true;
        this.overlayClients.add(socket);
        socket.on('pong', () => { socket.isAlive = true; });
        socket.on('close', () => this.overlayClients.delete(socket));
        socket.on('error', error => this.log.debug?.('OBS WebSocket:', error.message));
        socket.on('message', () => socket.close(1008, 'Read-only connection'));
        this.publishNowPlaying();
    }

    _startHeartbeat() {
        this.overlayTimer = setInterval(() => this.publishNowPlaying(), 1000);
        this.overlayTimer.unref?.();
        this.pingTimer = setInterval(() => {
            for (const client of this.wss?.clients || []) {
                if (!client.isAlive) {
                    client.terminate();
                    continue;
                }
                client.isAlive = false;
                client.ping();
            }
        }, 30000);
        this.pingTimer.unref?.();
    }
}

module.exports = {
    SettingsServer,
    HOST,
    PREFERRED_PORT,
    isAllowedOrigin
};
