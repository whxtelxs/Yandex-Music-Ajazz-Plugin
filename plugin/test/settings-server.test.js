'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const path = require('path');
const { WebSocket } = require('ws');
const { initDeps } = require('../lib/deps');
const { mergeGlobalSettings } = require('../lib/settings');
const { SettingsServer, isAllowedOrigin } = require('../lib/settings-server');

function listen(server, port = 0) {
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server.address().port));
    });
}

function close(server) {
    return new Promise(resolve => server.close(resolve));
}

function request(port, requestPath) {
    return new Promise((resolve, reject) => {
        http.get({ host: '127.0.0.1', port, path: requestPath }, response => {
            response.resume();
            response.once('end', () => resolve(response.statusCode));
        }).once('error', reject);
    });
}

function connect(url, origin = 'http://127.0.0.1') {
    return new Promise((resolve, reject) => {
        const socket = new WebSocket(url, { origin });
        socket.once('open', () => resolve(socket));
        socket.once('error', reject);
    });
}

function waitForMessage(socket, predicate) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Timed out waiting for WebSocket message'));
        }, 2000);
        const onMessage = raw => {
            const message = JSON.parse(raw.toString());
            if (!predicate(message)) return;
            cleanup();
            resolve(message);
        };
        const cleanup = () => {
            clearTimeout(timeout);
            socket.off('message', onMessage);
        };
        socket.on('message', onMessage);
    });
}

class FakePlugin {
    static globalSettings = {};

    setGlobalSettings(patch) {
        FakePlugin.globalSettings = mergeGlobalSettings(FakePlugin.globalSettings, patch);
        return FakePlugin.globalSettings;
    }

    openUrl() {}
}

test('panel URLs use a plain address and preserve section selection', async () => {
    const opened = [];
    const server = new SettingsServer({ plugin: { openUrl: url => opened.push(url) }, yandexMusic: {}, rootDir: '' });
    assert.equal(server.getInfo().url, null);
    assert.equal(await server.open(), false);
    server.port = 17890;
    assert.equal(await server.open(), true);
    assert.equal(await server.open('debug'), true);
    assert.deepEqual(opened, ['http://127.0.0.1:17890/', 'http://127.0.0.1:17890/?panel=debug']);
});

test('settings server falls back and synchronizes WebSockets without authentication', async t => {
    let blocker;
    let occupiedPort;
    for (let port = 19000; port < 19100; port++) {
        const candidate = http.createServer();
        try {
            occupiedPort = await listen(candidate, port);
            blocker = candidate;
            break;
        } catch (error) {
            if (!['EADDRINUSE', 'EACCES'].includes(error.code)) throw error;
        }
    }
    assert.ok(blocker, 'No available port for the settings server test');
    t.after(() => close(blocker));

    const plugin = new FakePlugin();
    const yandexMusic = {
        connected: true,
        port: 9222,
        async checkConnection() {
            return this.connected;
        },
        async setPort(port) {
            this.port = port;
            return true;
        }
    };
    initDeps(plugin, yandexMusic);

    const server = new SettingsServer({
        plugin,
        yandexMusic,
        rootDir: path.resolve(__dirname, '..', '..', 'propertyInspector'),
        preferredPort: occupiedPort,
        maxPortAttempts: Math.min(100, 65536 - occupiedPort)
    });
    await server.start();
    t.after(() => server.stop());

    assert.ok(server.port > occupiedPort && server.port < occupiedPort + 100);
    assert.equal(server.getInfo().url, 'http://127.0.0.1:' + server.port + '/');
    assert.equal(server.server.address().address, '127.0.0.1');
    assert.equal(await request(server.port, '/'), 200);
    assert.equal(await request(server.port, '/..%2Fplugin%2Findex.js'), 404);
    assert.equal(isAllowedOrigin('https://evil.example'), false);

    const wsUrl = `ws://127.0.0.1:${server.port}/ws`;
    const rejectedStatus = await new Promise(resolve => {
        const rejected = new WebSocket(wsUrl, { origin: 'https://evil.example' });
        rejected.once('unexpected-response', (_request, response) => {
            response.resume();
            resolve(response.statusCode);
        });
        rejected.once('error', () => {});
    });
    assert.equal(rejectedStatus, 403);

    const first = await connect(wsUrl);
    const second = await connect(wsUrl);
    t.after(() => {
        first.terminate();
        second.terminate();
    });

    const firstSettings = waitForMessage(first, message => message.type === 'settings');
    const secondSettings = waitForMessage(second, message => message.type === 'settings');
    const saveResult = waitForMessage(first, message => message.type === 'saveResult');
    first.send(JSON.stringify({
        type: 'updateSettings',
        settings: { volumeStep: 17, trackInfoTextSize: 14 }
    }));
    assert.equal((await saveResult).ok, true);
    assert.equal((await firstSettings).settings.volumeStep, 17);
    assert.equal((await secondSettings).settings.trackInfoTextSize, 14);
    assert.equal(FakePlugin.globalSettings.volumeStep, 17);

    const shutdown = waitForMessage(first, message => message.type === 'shutdown');
    await server.stop();
    assert.equal((await shutdown).type, 'shutdown');
});


test('stale settings patches preserve unrelated fields and reject field conflicts', async () => {
    FakePlugin.globalSettings = { volumeStep: 5, trackInfoFontSize: 14 };
    const plugin = new FakePlugin();
    const music = { connected: false };
    initDeps(plugin, music);
    const server = new SettingsServer({ plugin, yandexMusic: music, rootDir: path.resolve(__dirname, '../../propertyInspector') });
    server._snapshotSettings();
    const revision = server.revision;
    assert.equal((await server._saveSettings({ revision, settings: { volumeStep: 17 } })).ok, true);
    assert.equal((await server._saveSettings({ revision, settings: { trackInfoFontSize: 20 } })).ok, true);
    assert.equal(FakePlugin.globalSettings.volumeStep, 17);
    const conflict = await server._saveSettings({ revision, settings: { volumeStep: 8 } });
    assert.equal(conflict.ok, false);
    assert.equal(conflict.conflict, true);
    assert.equal(FakePlugin.globalSettings.volumeStep, 17);
});
