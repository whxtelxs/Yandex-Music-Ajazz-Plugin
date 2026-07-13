'use strict';

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');
const { sanitizeSettingsPatch, getSettingsSnapshot } = require('./settings');
const debugLog = require('./debug-log');
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

function safeEqual(actual, expected) {
    const actualBuffer = Buffer.from(String(actual || ''));
    const expectedBuffer = Buffer.from(String(expected || ''));
    return actualBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

class SettingsServer {
    constructor({
        plugin,
        yandexMusic,
        launcher = null,
        rootDir,
        preferredPort = PREFERRED_PORT,
        maxPortAttempts = 10,
        token = crypto.randomBytes(32).toString('base64url'),
        onSettingsChanged = async () => {},
        getDiscordStatus = () => null,
        logger = console
    }) {
        this.plugin = plugin;
        this.yandexMusic = yandexMusic;
        this.launcher = launcher;
        this.rootDir = rootDir;
        this.preferredPort = preferredPort;
        this.maxPortAttempts = maxPortAttempts;
        this.token = token;
        this.onSettingsChanged = onSettingsChanged;
        this.getDiscordStatus = getDiscordStatus;
        this.log = logger;
        this.server = null;
        this.wss = null;
        this.port = null;
        this.clients = new Set();
        this.pingTimer = null;
        this.stopping = false;
    }

    async start() {
        if (this.server) return this.getInfo();
        this.stopping = false;
        this.server = http.createServer((request, response) => this._handleHttp(request, response));
        this.wss = new WebSocketServer({ noServer: true });
        this.wss.on('connection', socket => this._handleSocket(socket));
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
                if (error.code !== 'EADDRINUSE') break;
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
            url: this.port ? `http://${HOST}:${this.port}/?token=${encodeURIComponent(this.token)}` : null
        };
    }

    open(panel = null) {
        const { url } = this.getInfo();
        if (!url) return false;
        const targetUrl = panel
            ? `${url}&panel=${encodeURIComponent(panel)}`
            : url;
        this.plugin.openUrl(targetUrl);
        return true;
    }

    handleGlobalSettings() {
        this.broadcast({
            type: 'settings',
            settings: getSettingsSnapshot()
        });
    }

    broadcast(payload) {
        const message = JSON.stringify(payload);
        for (const client of this.clients) {
            if (client.readyState === WebSocket.OPEN) client.send(message);
        }
    }

    async stop() {
        if (this.stopping) return;
        this.stopping = true;
        clearInterval(this.pingTimer);
        this.pingTimer = null;

        try {
            this.broadcast({ type: 'shutdown' });
        } catch {
            // ignore
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
                    // ignore
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

    _securityHeaders(response) {
        response.setHeader('Content-Security-Policy', [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self'",
            "img-src 'self' data:",
            `connect-src 'self' ws://${HOST}:*`,
            "frame-ancestors 'none'",
            "base-uri 'none'"
        ].join('; '));
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Referrer-Policy', 'no-referrer');
        response.setHeader('Cache-Control', 'no-store');
    }

    _handleHttp(request, response) {
        this._securityHeaders(response);
        const requestUrl = new URL(request.url, `http://${HOST}:${this.port || this.preferredPort}`);

        if (request.method !== 'GET') {
            response.writeHead(405).end('Method Not Allowed');
            return;
        }
        if (requestUrl.pathname === '/api/health') {
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end(JSON.stringify({ ok: true }));
            return;
        }
        if (requestUrl.pathname === '/') {
            if (!safeEqual(requestUrl.searchParams.get('token'), this.token)) {
                response.writeHead(401).end('Unauthorized');
                return;
            }
            this._sendFile(response, path.join(this.rootDir, 'dashboard', 'index.html'), 'text/html; charset=utf-8');
            return;
        }

        const assets = {
            '/assets/app.js': [path.join(this.rootDir, 'dashboard', 'app.js'), 'text/javascript; charset=utf-8'],
            '/assets/tailwind.css': [path.join(this.rootDir, 'utils', 'tailwind.css'), 'text/css; charset=utf-8'],
            '/assets/logo.png': [path.resolve(this.rootDir, '..', 'static', 'App-logo.png'), 'image/png']
        };
        const asset = assets[requestUrl.pathname];
        if (!asset) {
            response.writeHead(404).end('Not Found');
            return;
        }
        this._sendFile(response, asset[0], asset[1]);
    }

    _sendFile(response, filePath, contentType) {
        try {
            const data = fs.readFileSync(filePath);
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
            const authorized = requestUrl.pathname === '/ws'
                && safeEqual(requestUrl.searchParams.get('token'), this.token)
                && isAllowedOrigin(request.headers.origin);
            if (!authorized || this.stopping) {
                socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
                socket.destroy();
                return;
            }
            this.wss.handleUpgrade(request, socket, head, client => {
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
            debugPort: settings.debugPort,
            activePort,
            portMismatch: !!activePort && activePort !== settings.debugPort
        };
    }

    async _sendHello(socket) {
        socket.send(JSON.stringify({
            type: 'hello',
            settings: getSettingsSnapshot(),
            connection: await this._buildConnectionInfo(),
            discordStatus: this.getDiscordStatus(),
            debugLogs: debugLog.getBuffer(),
            updateInfo: getPublicInfo()
        }));
    }

    _handleSocket(socket) {
        socket.isAlive = true;
        this.clients.add(socket);
        socket.on('pong', () => {
            socket.isAlive = true;
        });
        socket.on('close', () => this.clients.delete(socket));
        socket.on('error', error => this.log.warn('Dashboard WebSocket:', error.message));
        socket.on('message', raw => this._handleSocketMessage(socket, raw));
        this._sendHello(socket).catch(error => this.log.error('Ошибка hello dashboard:', error));
    }

    async _handleSocketMessage(socket, raw) {
        try {
            const message = JSON.parse(raw.toString());
            if (message.type === 'getSettings') {
                socket.send(JSON.stringify({ type: 'settings', settings: getSettingsSnapshot() }));
                return;
            }
            if (message.type === 'checkConnection') {
                await syncRunningDebugPort();
                const connected = await this.yandexMusic.checkConnection();
                const connection = await this._buildConnectionInfo();
                this.broadcast({ type: 'connectionStatus', connected, connection });
                return;
            }
            if (message.type === 'launchApp') {
                if (!this.launcher) {
                    socket.send(JSON.stringify({ type: 'launchResult', ok: false, error: 'Лаунчер недоступен' }));
                    return;
                }

                const result = await launchYandexMusicApp({ source: 'dashboard' });
                if (!result.success) {
                    socket.send(JSON.stringify({
                        type: 'launchResult',
                        ok: false,
                        error: result.error || 'Не удалось запустить Яндекс Музыку'
                    }));
                    return;
                }

                const connection = await this._buildConnectionInfo();
                this.broadcast({
                    type: 'launchResult',
                    ok: true,
                    connected: !!connection.connected,
                    connection,
                    port: result.port,
                    adjusted: !!result.adjusted,
                    message: result.message
                });
                return;
            }
            if (message.type === 'updateSettings') {
                const patch = sanitizeSettingsPatch(message.settings);
                const previous = getSettingsSnapshot();
                const merged = this.plugin.setGlobalSettings(patch);
                if (Object.prototype.hasOwnProperty.call(patch, 'debugPort')
                    && patch.debugPort !== previous.debugPort) {
                    this.launcher?.setDebugPort(patch.debugPort);
                    await this.yandexMusic.setPort(patch.debugPort);
                }
                if (Object.prototype.hasOwnProperty.call(patch, 'debugMode')
                    && patch.debugMode !== previous.debugMode) {
                    applyDebugMode(patch.debugMode);
                }
                await this.onSettingsChanged(patch);
                this.handleGlobalSettings(merged);
                socket.send(JSON.stringify({ type: 'saveResult', ok: true }));
                return;
            }
            if (message.type === 'clearDebugLog') {
                debugLog.clear();
                return;
            }
            if (message.type === 'checkUpdates') {
                await checkForUpdates({ notify: false, force: true });
                socket.send(JSON.stringify({ type: 'updateInfo', ...getPublicInfo() }));
                return;
            }
        } catch (error) {
            this.log.error('Ошибка команды dashboard:', error);
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: 'saveResult', ok: false, error: 'Не удалось сохранить настройки' }));
            }
        }
    }

    _startHeartbeat() {
        this.pingTimer = setInterval(() => {
            for (const client of this.clients) {
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
    isAllowedOrigin,
    safeEqual
};
