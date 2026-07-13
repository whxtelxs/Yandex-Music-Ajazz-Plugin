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

test('settings server falls back, authenticates and synchronizes WebSockets', async t => {
    const blocker = http.createServer();
    const occupiedPort = await listen(blocker);
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
        maxPortAttempts: 3,
        token: 'test-session-token'
    });
    await server.start();
    t.after(() => server.stop());

    assert.equal(server.port, occupiedPort + 1);
    assert.equal(await request(server.port, '/'), 401);
    assert.equal(await request(server.port, '/?token=test-session-token'), 200);
    assert.equal(await request(server.port, '/..%2Fplugin%2Findex.js?token=test-session-token'), 404);
    assert.equal(isAllowedOrigin('https://evil.example'), false);

    const wsUrl = `ws://127.0.0.1:${server.port}/ws?token=test-session-token`;
    const rejectedStatus = await new Promise(resolve => {
        const rejected = new WebSocket(wsUrl, { origin: 'https://evil.example' });
        rejected.once('unexpected-response', (_request, response) => {
            response.resume();
            resolve(response.statusCode);
        });
        rejected.once('error', () => {});
    });
    assert.equal(rejectedStatus, 401);

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
