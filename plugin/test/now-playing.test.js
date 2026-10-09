'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { WebSocket } = require('ws');
const config = require('../../propertyInspector/now-playing/config');
const { NowPlayingFeed, coverAddress } = require('../lib/now-playing');
const { SettingsServer } = require('../lib/settings-server');
const { initDeps } = require('../lib/deps');
const { settingEquals } = require('../lib/settings');

const tick = () => new Promise(resolve => setImmediate(resolve));

test('overlay settings reject unknown fields and constrain dimensions, colors and modes', () => {
    const result = config.sanitize({ width: 99999, height: -10, titleSize: NaN, backgroundColor: 'url(evil)', layout: 'bad', enabled: false, token: 'secret' });
    assert.equal(result.width, 900);
    assert.equal(result.height, 48);
    assert.equal(result.titleSize, config.defaults.titleSize);
    assert.equal(result.backgroundColor, config.defaults.backgroundColor);
    assert.equal(result.layout, 'left');
    assert.equal(result.enabled, false);
    assert.equal(Object.hasOwn(result, 'token'), false);
    for (const name of Object.keys(config.presets)) assert.deepEqual(config.sanitize(config.preset(name)), config.preset(name));
    assert.equal(settingEquals(config.defaults, JSON.parse(JSON.stringify(config.defaults))), true);
});

test('overlay exposes only connected track data and clamps playback time', () => {
    let connected = true;
    const feed = new NowPlayingFeed({ getConfig: () => ({}), isConnected: () => connected,
        getState: () => ({ title: '<track>', artist: 'Артист', playing: true, positionSec: 999, totalSec: 200, secret: 'hidden' }) });
    assert.deepEqual(feed.snapshot().track, { title: '<track>', artist: 'Артист', playing: true, position: 200, duration: 200, coverPending: false, cover: '/assets/logo.png' });
    connected = false;
    assert.equal(feed.snapshot().track, null);
    assert.equal(coverAddress('https://evil.example/image.png'), '');
    assert.equal(coverAddress('https://yandex.net.evil.example/a'), '');
    assert.equal(coverAddress('http://avatars.yandex.net/a'), '');
});

test('late cover requests cannot replace the current track or publish after shutdown', async () => {
    const pending = [];
    let changes = 0;
    let state = { title: 'one', coverUrl: 'https://avatars.yandex.net/one' };
    const feed = new NowPlayingFeed({ getConfig: () => ({}), isConnected: () => true, getState: () => state,
        onChange: () => changes++, loadCover: () => new Promise(resolve => pending.push(resolve)) });
    feed.snapshot();
    await tick();
    state = { title: 'two', coverUrl: 'https://avatars.yandex.net/two' };
    feed.snapshot();
    await tick();
    pending[0]('data:image/png;base64,YQ==');
    await tick();
    assert.equal(feed.cover, null);
    pending[1]('data:image/png;base64,Yg==');
    await tick();
    assert.equal(feed.cover.data.toString(), 'b');
    assert.equal(changes, 1);
    state = { title: 'three', coverUrl: 'https://avatars.yandex.net/three' };
    feed.snapshot();
    await tick();
    feed.stop();
    pending[2]('data:image/png;base64,Yw==');
    await tick();
    assert.equal(changes, 1);
});

test('OBS serves transparent overlay assets and a read-only live connection', async t => {
    class Plugin { static globalSettings = {}; }
    const plugin = new Plugin();
    const music = { connected: true };
    let state = { title: 'Track', artist: 'Artist', playing: true, positionSec: 40, totalSec: 100 };
    initDeps(plugin, music);
    const server = new SettingsServer({ plugin, yandexMusic: music, rootDir: path.resolve(__dirname, '../../propertyInspector'), preferredPort: 0, maxPortAttempts: 1, getNowPlayingState: () => state });
    await server.start();
    t.after(() => server.stop());
    const port = server.server.address().port;
    const base = 'http://127.0.0.1:' + port;
    const page = await fetch(base + '/now-playing');
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-security-policy'), /frame-ancestors 'self'/);
    const html = await page.text();
    assert.match(html, /now-playing-widget.js\?v=[a-f0-9]{16}/);
    assert.equal(html.includes('__OVERLAY_VERSION__'), false);
    for (const asset of ['config.js', 'widget.js', 'view.js']) assert.equal((await fetch(base + '/assets/now-playing-' + asset)).status, 200);
    for (const asset of ['panel.js', 'panel.css']) assert.equal((await fetch(base + '/assets/' + asset)).status, 200);
    const panel = await fetch(base + '/');
    const panelHtml = await panel.text();
    const nonce = panelHtml.match(/name="csp-nonce" content="([^"]+)"/)[1];
    assert.ok(panel.headers.get('content-security-policy').includes("'nonce-" + nonce + "'"));
    assert.equal(panelHtml.includes('__CSP_NONCE__'), false);
    assert.equal((await fetch(base + '/now-playing/cover/missing')).status, 404);
    const socket = new WebSocket('ws://127.0.0.1:' + port + '/now-playing/ws');
    t.after(() => socket.terminate());
    const next = () => new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Missing overlay frame')), 2000);
        socket.once('message', raw => { clearTimeout(timer); resolve(JSON.parse(raw)); });
    });
    const first = await next();
    assert.deepEqual(Object.keys(first).sort(), ['config', 'rendererVersion', 'track', 'type']);
    assert.equal(first.track.title, 'Track');
    assert.equal(first.rendererVersion, server.overlayVersion);
    const paused = next();
    state = { ...state, playing: false };
    Plugin.globalSettings = { nowPlaying: config.sanitize({ hideOnPause: true, width: 560 }) };
    server.handleGlobalSettings();
    assert.equal((await paused).config.width, 560);
    const disconnected = next();
    music.connected = false;
    server.publishNowPlaying();
    assert.equal((await disconnected).track, null);
    const closed = new Promise(resolve => socket.once('close', code => resolve(code)));
    socket.send(JSON.stringify({ type: 'updateSettings', settings: { volumeStep: 90 } }));
    assert.equal(await closed, 1008);
    assert.equal(Plugin.globalSettings.volumeStep, undefined);
});

test('overlay reuses cached covers and preserves old URLs during a track transition', async () => {
    let calls = 0;
    let state = { title: 'one', coverUrl: 'https://avatars.yandex.net/one' };
    const feed = new NowPlayingFeed({ getConfig: () => ({}), isConnected: () => true, getState: () => state,
        loadCover: async () => { calls++; return 'data:image/png;base64,YQ=='; } });
    assert.equal(feed.snapshot().track.coverPending, true);
    await tick();
    const first = feed.snapshot().track;
    assert.equal(first.coverPending, false);
    state = { title: 'two', coverUrl: 'https://avatars.yandex.net/two' };
    feed.snapshot();
    await tick();
    assert.ok(feed.getCover(first.cover.slice(19)));
    state = { title: 'one', coverUrl: 'https://avatars.yandex.net/one' };
    assert.equal(feed.snapshot().track.cover, first.cover);
    assert.equal(calls, 2);
    feed.stop();
});
