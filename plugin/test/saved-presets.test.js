'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { WebSocket } = require('ws');
const config = require('../../propertyInspector/now-playing/config');
const { initDeps } = require('../lib/deps');
const { getSettingsSnapshot, mergeGlobalSettings } = require('../lib/settings');
const { SettingsServer } = require('../lib/settings-server');

test('saved configs reject malformed records and duplicate IDs without losing valid settings', () => {
    const library = config.sanitizePresets([
        null, { id: '../invalid', name: 'Bad', config: {} },
        { id: 'valid', name: '  My\u0000 config  ', config: { width: 1200, accentColor: 'invalid' } },
        { id: 'valid', name: 'Duplicate', config: {} },
        { id: 'empty', name: ' ', config: {} }
    ]);
    assert.equal(library.length, 1);
    assert.equal(library[0].name, 'My config');
    assert.equal(library[0].config.width, 900);
    assert.equal(library[0].config.accentColor, '#ffff00');
    assert.deepEqual(config.sanitizePresets(library), library);
});

test('all 50 saved configs persist through the real settings WebSocket', { timeout: 10000 }, async t => {
    class Plugin {
        static globalSettings = {};
        async saveGlobalSettings(patch) { Plugin.globalSettings = mergeGlobalSettings(Plugin.globalSettings, patch); }
    }
    const plugin = new Plugin();
    const music = { connected: false, getConnectionInfo: () => ({ stage: 'disconnected' }) };
    initDeps(plugin, music);
    const server = new SettingsServer({ plugin, yandexMusic: music, rootDir: path.resolve(__dirname, '../../propertyInspector'), preferredPort: 0, maxPortAttempts: 1, logger: { info() {}, warn() {}, error() {} } });
    await server.start();
    t.after(() => server.stop());
    const socket = new WebSocket('ws://127.0.0.1:' + server.server.address().port + '/ws');
    t.after(() => socket.terminate());
    const next = type => new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.off('message', receive); reject(new Error('Missing ' + type)); }, 3000);
        function receive(raw) {
            const frame = JSON.parse(raw);
            if (frame.type !== type) return;
            clearTimeout(timer);
            socket.off('message', receive);
            resolve(frame);
        }
        socket.on('message', receive);
    });
    await next('hello');
    const library = Array.from({ length: 50 }, (_, index) => ({ id: 'config-' + index, name: 'Конфиг ' + index, config: config.preset('card') }));
    assert.ok(Buffer.byteLength(JSON.stringify(library)) > 16 * 1024);
    const reply = next('saveResult');
    socket.send(JSON.stringify({ type: 'updateSettings', requestId: 'save-library', settings: { nowPlayingPresets: library } }));
    const result = await reply;
    assert.equal(result.ok, true);
    assert.equal(result.persisted, true);
    assert.deepEqual(getSettingsSnapshot().nowPlayingPresets, library);
    assert.deepEqual(Plugin.globalSettings.nowPlayingPresets, library);
    assert.equal(getSettingsSnapshot().nowPlaying.width, config.defaults.width);
});
