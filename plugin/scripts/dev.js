'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const esbuild = require('esbuild');
const { SettingsServer, isAllowedOrigin } = require('../lib/settings-server');
const { initDeps } = require('../lib/deps');
const { getSettingsSnapshot } = require('../lib/settings');
const { buildOptions, dashboard, plugin: pluginRoot } = require('./build-panel');

const root = path.dirname(pluginRoot);
const output = path.join(root, '.dev-panel');
const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).Version;
const updateInfo = { currentVersion: version, latestVersion: version, hasUpdate: false, checkedAt: new Date().toISOString() };

class DemoPlugin {
    static globalSettings = {};
    async saveGlobalSettings(patch) { DemoPlugin.globalSettings = { ...DemoPlugin.globalSettings, ...patch }; }
}

class DevelopmentServer extends SettingsServer {
    constructor(options) {
        super(options);
        this.reloadClients = new Set();
    }

    _sendFile(response, filePath, contentType, transform = data => data) {
        if (filePath.endsWith(path.join('dashboard', 'index.html'))) {
            super._sendFile(response, filePath, contentType, data => transform(Buffer.from(data.toString('utf8')
                .replace('<title>', '<title>DEV | ')
                .replace('<script src="/assets/panel.js"', '<script src="/assets/dev-reload.js" defer></script>\n    <script src="/assets/panel.js"'))));
            return;
        }
        if (filePath === path.join(dashboard, 'dist', 'panel.js') || filePath === path.join(dashboard, 'dist', 'panel.css')) filePath = path.join(output, path.basename(filePath));
        super._sendFile(response, filePath, contentType, transform);
    }

    _handleHttp(request, response) {
        if (request.url === '/assets/dev-reload.js' && request.method === 'GET') {
            this._securityHeaders(response);
            this._sendFile(response, path.join(dashboard, 'src', 'dev-reload.js'), 'text/javascript; charset=utf-8');
            return;
        }
        super._handleHttp(request, response);
    }

    _handleUpgrade(request, socket, head) {
        if (request.url !== '/dev-events') { super._handleUpgrade(request, socket, head); return; }
        if (!isAllowedOrigin(request.headers.origin) || this.stopping) { socket.destroy(); return; }
        this.wss.handleUpgrade(request, socket, head, client => {
            client.developmentOnly = true;
            this.wss.emit('connection', client, request);
        });
    }

    _handleSocket(socket) {
        if (!socket.developmentOnly) { super._handleSocket(socket); return; }
        socket.isAlive = true;
        this.reloadClients.add(socket);
        socket.on('pong', () => { socket.isAlive = true; });
        socket.on('close', () => this.reloadClients.delete(socket));
        socket.on('error', () => this.reloadClients.delete(socket));
        socket.on('message', () => socket.close(1008));
    }

    async _sendHello(socket) {
        this._reply(socket, { type: 'hello', settings: this._snapshotSettings(), connection: await this._buildConnectionInfo(),
            discordStatus: { status: 'connected', message: 'Демо-статус Discord' }, updateInfo,
            debugLogs: [{ at: Date.now(), level: 'info', text: 'Режим разработки. Настройки хранятся только в памяти этого процесса.' }] });
    }

    async _handleSocketMessage(socket, raw) {
        let message;
        try { message = JSON.parse(raw.toString()); } catch { await super._handleSocketMessage(socket, raw); return; }
        if (message?.type === 'launchApp') {
            this._reply(socket, { type: 'launchResult', ok: true, success: true, connected: true, port: getSettingsSnapshot().debugPort,
                message: 'Демо: приложение запущено', connection: await this._buildConnectionInfo() }, message.requestId);
        } else if (message?.type === 'checkUpdates') {
            this._reply(socket, { type: 'updateInfo', ok: true, ...updateInfo }, message.requestId);
        } else if (message?.type === 'clearDebugLog') {
            this._reply(socket, { type: 'debugLogClear', ok: true }, message.requestId);
        } else await super._handleSocketMessage(socket, raw);
    }

    reload() {
        this.overlayVersion = this._overlayVersion();
        for (const client of this.reloadClients) if (client.readyState === 1) client.send('{"type":"reload"}');
    }
}

async function startDevelopment(port = 17891) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Нужен порт от 1 до 65535');
    fs.mkdirSync(output, { recursive: true });
    const plugin = new DemoPlugin();
    const music = { connected: true, getConnectionInfo: () => ({ stage: 'ready' }), checkConnection: async () => true, setPort: async () => true };
    initDeps(plugin, music);
    const server = new DevelopmentServer({ plugin, yandexMusic: music, rootDir: path.join(root, 'propertyInspector'), preferredPort: port,
        maxPortAttempts: Math.min(100, 65536 - port), getDiscordStatus: () => ({ status: 'connected' }),
        getNowPlayingState: () => ({ title: 'Трек для предпросмотра', artist: 'Демо-исполнитель', playing: true, positionSec: Math.floor(Date.now() / 1000) % 210, totalSec: 210 }),
        logger: { info() {}, warn: console.warn, error: console.error } });
    let context;
    let css;
    let assets;
    let widget;
    let html;
    let reloadTimer;
    let stopping;
    const stop = () => stopping ||= (async () => {
        clearTimeout(reloadTimer);
        assets?.close();
        widget?.close();
        html?.close();
        css?.kill();
        await context?.dispose();
        await server.stop();
    })();
    try {
        context = await esbuild.context({ ...buildOptions, outfile: path.join(output, 'panel.js'), metafile: false,
            define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'info' });
        await context.rebuild();
        const cssArgs = [path.join(pluginRoot, 'node_modules/@tailwindcss/cli/dist/index.mjs'), '-i', path.join(dashboard, 'src/styles.css'), '-o', path.join(output, 'panel.css'), '--minify'];
        execFileSync(process.execPath, cssArgs, { cwd: pluginRoot, stdio: 'inherit' });
        await server.start();
        const reload = () => { clearTimeout(reloadTimer); reloadTimer = setTimeout(() => server.reload(), 150); };
        assets = fs.watch(output, (_, name) => { if (name === 'panel.js' || name === 'panel.css') reload(); });
        widget = fs.watch(path.join(root, 'propertyInspector', 'now-playing'), reload);
        html = fs.watch(path.join(dashboard, 'index.html'), reload);
        css = spawn(process.execPath, [...cssArgs, '--watch=always'], { cwd: pluginRoot, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
        css.on('error', error => { console.error(error); stop().catch(console.error); });
        css.on('exit', code => { if (!stopping) { console.error('Наблюдатель CSS остановился, код:', code); stop().catch(console.error); } });
        await context.watch();
        console.log('\nПанель разработки: ' + server.getInfo().url);
        console.log('Демо-данные, без StreamDock и устройства. Изменения JSX и CSS обновляют страницу автоматически.');
        console.log('Настройки сохраняются до остановки процесса. Ctrl+C: остановить.\n');
        return { server, stop };
    } catch (error) { await stop(); throw error; }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const argument = args[0];
    const valid = !args.length || (args.length === 1 && /^--port=\d+$/.test(argument));
    if (!valid) { console.error('Использование: npm run dev -- --port=17891'); process.exitCode = 1; }
    else startDevelopment(argument ? Number(argument.slice(7)) : 17891).then(({ stop }) => {
        for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { stop().catch(console.error); });
    }).catch(error => { console.error(error); process.exitCode = 1; });
}

module.exports = { DevelopmentServer, startDevelopment };
