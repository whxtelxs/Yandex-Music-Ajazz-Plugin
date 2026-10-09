'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const http = require('node:http');
const { OperationQueue } = require('../lib/operation-queue');
const { createInputCoalescer } = require('../lib/input-coalescer');
const { isSameTrack } = require('../lib/track-identity');
const { createStateEngine } = require('../lib/state-engine');
const { downloadImageAsDataUrl, MAX_IMAGE_BYTES } = require('../lib/cover');
const { createDiscordPresenceService } = require('../lib/discord/service');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fixture(options = {}) {
    const contexts = Object.fromEntries(['playPause', 'like', 'mute', 'volumeEncoder', 'shuffle', 'repeat', 'trackInfo', 'timeTotal', 'cover'].map(key => [key, []]));
    const sent = [];
    const metadata = deferred();
    const music = { connected: true, getRemoteState: () => null, getTrackInfo: () => metadata.promise };
    const display = { setTrackInfoDisplay: (...args) => sent.push(['text', ...args]), setTimeDisplay: (...args) => sent.push(['time', ...args]), setCoverDisplay: (...args) => sent.push(['cover', ...args]), getTrackInfoTextSize: () => 20, getTrackInfoFontSize: () => 10, clearAllDisplayCaches() {}, clearDisplayCache() {} };
    const engine = createStateEngine({ contexts, display, getDeps: () => ({ yandexMusic: music, plugin: { setState: (...args) => sent.push(['state', ...args]) } }), loadCover: async () => 'image', ...options });
    return { contexts, sent, metadata, music, engine };
}

test('track identity separates artists and accepts newly discovered URLs', () => {
    assert.equal(isSameTrack({ title: 'Song', artist: 'A' }, { title: 'Song', artist: 'B' }), false);
    assert.equal(isSameTrack({ title: 'Song', artist: 'A' }, { title: 'Song', artist: 'A', trackUrl: 'https://music.yandex.ru/album/1/track/2' }), true);
    assert.equal(isSameTrack({ trackId: '1' }, { trackId: '2' }), false);
});

test('expired pending work rejects before a blocked active operation finishes', async () => {
    const queue = new OperationQueue();
    const hold = deferred();
    const first = queue.enqueue(() => hold.promise);
    let ran = false;
    await assert.rejects(queue.enqueue(() => { ran = true; }, { timeoutMs: 20 }), { code: 'ETIMEDOUT' });
    assert.equal(ran, false);
    hold.resolve();
    await first;
});

test('clear aborts active work and allows fresh operations', async () => {
    const queue = new OperationQueue();
    const active = queue.enqueue(signal => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason))));
    queue.clear(new Error('disconnect'));
    await assert.rejects(active, /disconnect/);
    assert.equal(await queue.enqueue(() => 42), 42);
});

test('pending external cancellation removes the operation immediately', async () => {
    const queue = new OperationQueue();
    const hold = deferred();
    const first = queue.enqueue(() => hold.promise);
    const controller = new AbortController();
    const pending = queue.enqueue(() => assert.fail('cancelled work ran'), { signal: controller.signal });
    controller.abort(new Error('removed'));
    await assert.rejects(pending, /removed/);
    assert.equal(queue.size, 1);
    hold.resolve();
    await first;
});

test('continuous encoder input flushes before rotation stops', async () => {
    const batches = [];
    const input = createInputCoalescer(async (context, delta) => { batches.push(delta); return true; }, 15);
    const jobs = [];
    for (let i = 0; i < 8; i++) { jobs.push(input.add('dial', 1)); await sleep(5); }
    assert.ok(batches.length >= 2);
    await Promise.all(jobs);
    assert.equal(batches.reduce((a, b) => a + b, 0), 8);
    input.clear();
});

test('context disappearance cancels active encoder work', async () => {
    const started = deferred();
    let signal;
    const input = createInputCoalescer(async (context, delta, abort) => { signal = abort; started.resolve(); await sleep(30); }, 1);
    const job = input.add('dial', 3);
    await started.promise;
    input.cancel('dial');
    await assert.rejects(job, /cancelled/);
    assert.equal(signal.aborted, true);
});

test('late metadata cannot restore a disconnected display', async () => {
    const f = fixture();
    f.contexts.trackInfo.push('key');
    const request = f.engine.checkTrackInfoState();
    await sleep(0);
    f.music.connected = false;
    f.engine.resetDisconnectedState();
    f.metadata.resolve({ title: 'Old song', artist: 'A' });
    await request;
    assert.equal(f.engine.getPresenceSnapshot(), null);
    assert.equal(f.sent.some(row => row[0] === 'text' && row[2].includes('Old')), false);
    f.engine.stopStateChecks();
});

test('same title with another artist does not inherit a cover or link', () => {
    const f = fixture();
    f.engine.applyYmRemoteState({ trackTitle: 'Song', trackArtist: 'A', trackUrl: 'https://music.yandex.ru/album/1/track/1', coverUrl: 'cover-a' });
    f.engine.applyYmRemoteState({ trackTitle: 'Song', trackArtist: 'B' });
    assert.deepEqual(f.engine.getPresenceSnapshot().trackUrl, '');
    assert.deepEqual(f.engine.getPresenceSnapshot().coverUrl, '');
    f.engine.stopStateChecks();
});

test('repeated observed button values are sent once and unknown values are ignored', () => {
    const f = fixture();
    f.contexts.playPause.push('key');
    f.engine.applyYmRemoteState({ playing: true });
    f.engine.applyYmRemoteState({ playing: true });
    f.engine.applyYmRemoteState({ playing: null });
    assert.deepEqual(f.sent, [['state', 'key', 1]]);
    f.engine.stopStateChecks();
});

test('normalized slider progress becomes elapsed seconds', () => {
    const f = fixture();
    f.contexts.timeTotal.push('key');
    f.engine.applyYmRemoteState({ currentTime: '1:00', totalTime: '4:00', progressValue: 25, progressMax: 100, playing: false });
    assert.deepEqual(f.sent, [['time', 'key', '1:00', '4:00']]);
    f.engine.stopStateChecks();
});

test('relative seek translates seconds into normalized slider units', () => {
    const source = require('../utils/yandex-music/dom/seek-track');
    const slider = { value: '25', max: '100' };
    const sandbox = { document: { querySelector: () => slider }, ymIsVibePageActive: () => false, ymCanClick: () => true, ymSetRangeValue: (node, value) => { node.value = value; } };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    sandbox.ymGetTrackTime = () => ({ totalTime: '4:00' });
    const result = sandbox.ymSeekRelative(30);
    assert.equal(result.success, true);
    assert.equal(slider.value, 37.5);
});

test('music URL normalization rejects lookalike domains', () => {
    const sandbox = { URL };
    vm.createContext(sandbox);
    vm.runInContext(require('../utils/yandex-music/dom/seek-track'), sandbox);
    assert.equal(sandbox.ymNormalizeMusicUrl('https://music.yandex.ru.evil.com/album/1/track/2', true), '');
    assert.equal(sandbox.ymNormalizeMusicUrl('https://music.yandex.ru/album/1/track/2', true), 'https://music.yandex.ru/album/1/track/2');
});

test('cover loading rejects unexpected MIME and oversized images', async t => {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': req.url === '/html' ? 'text/html' : 'image/png' });
        res.end(req.url === '/html' ? 'html' : Buffer.alloc(MAX_IMAGE_BYTES + 1));
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = 'http://127.0.0.1:' + server.address().port;
    await assert.rejects(downloadImageAsDataUrl(base + '/html'), /Invalid cover/);
    await assert.rejects(downloadImageAsDataUrl(base + '/large'), /too large|aborted/);
});

test('disabling Discord during connection never publishes a late activity', async () => {
    const connected = deferred();
    const started = deferred();
    const calls = [];
    const config = { enabled: true, appId: '123' };
    const client = { request: async () => calls.push('send'), clearActivity: async () => calls.push('clear'), destroy: async () => calls.push('destroy') };
    const service = createDiscordPresenceService({ getConfig: () => config, getSnapshot: () => ({ title: 'Song', artist: 'A', playing: true, trackUrl: 'https://music.yandex.ru/album/1/track/2' }), connectClient: async () => { started.resolve(); return connected.promise; }, log: { debug() {}, error() {} } });
    service.setMusicConnected(true);
    const job = service.refresh();
    await started.promise;
    config.enabled = false;
    await service.applyConfig();
    connected.resolve(client);
    await job;
    assert.equal(calls.includes('send'), false);
    assert.equal(calls.includes('destroy'), true);
    await service.stop();
});

function loadConnection(mock) {
    const fs = require('node:fs');
    const path = require('node:path');
    const module = { exports: {} };
    const source = fs.readFileSync(path.join(__dirname, '../utils/yandex-music/controller/connection.js'), 'utf8');
    const localRequire = name => name === 'chrome-remote-interface' ? mock : name.endsWith('/logger') ? { log: { debug() {}, error() {} } } : require(name.replace('../../../lib/', '../lib/'));
    vm.runInNewContext(source, { module, require: localRequire, URL, setTimeout, clearTimeout, Promise });
    return module.exports;
}

test('CDP target selection excludes unrelated tabs', () => {
    const connection = loadConnection({});
    assert.equal(connection.isMusicTarget({ type: 'page', url: 'https://example.com', title: 'Yandex Music' }), false);
    assert.equal(connection.isMusicTarget({ type: 'page', url: 'https://music.yandex.ru/player' }), true);
    assert.equal(connection.isMusicTarget({ type: 'worker', url: 'https://music.yandex.ru/' }), false);
});

test('failed CDP initialization closes the partially created client', async () => {
    let closes = 0;
    const candidate = { Page: { enable: async () => { throw new Error('enable failed'); } }, Runtime: { enable: async () => {} }, close: async () => { closes++; } };
    const cdp = async () => candidate;
    cdp.List = async () => [{ type: 'page', url: 'https://music.yandex.ru/', id: 'music' }];
    const connection = loadConnection(cdp);
    const controller = { ...connection, _clientGeneration: 0, port: 9222, _setupStateObserver: async () => {} };
    await assert.rejects(controller.connect(), /enable failed/);
    assert.equal(closes, 1);
    assert.equal(controller.client, null);
    assert.equal(controller.connected, false);
});

test('a disabled Vibe control cannot fall through to the Sonata player', async () => {
    const sandbox = { ymIsVibePageActive: () => true };
    vm.createContext(sandbox);
    vm.runInContext(require('../utils/yandex-music/dom/shuffle-repeat'), sandbox);
    sandbox.ymToggleVibeMenuControl = async () => ({ success: false, unavailable: true });
    sandbox.ymToggleSonataControlByFragment = () => assert.fail('hidden player was clicked');
    assert.equal((await sandbox.ymToggleShuffle()).unavailable, true);
});


test('the track encoder executes every tick and removes its context', async () => {
    const { initDeps } = require('../lib/deps');
    const { Actions } = require('../utils/plugin');
    const plugin = { setTitle() {}, setState() {}, showAlert() { assert.fail('unexpected alert'); } };
    let transitions = 0;
    initDeps(plugin, { nextTrack: async () => { transitions++; return true; } });
    require('../actions/encoders')(plugin);
    const action = plugin['ym-track-encoder'];
    const descriptor = { context: 'dial-test', action: 'plugin.ym-track-encoder', payload: { settings: {} } };
    await action.willAppear(descriptor);
    await action.dialRotate({ context: 'dial-test', payload: { ticks: 5 } });
    assert.equal(transitions, 5);
    action.willDisappear(descriptor);
    assert.equal(Actions.actions['dial-test'], undefined);
    assert.equal(action.data['dial-test'], undefined);
    require('../lib/state-sync').stopStateChecks();
});

test('text scrolling preserves joined emoji and fits the available width', () => {
    const { graphemes, scrollingWindow, textWidth } = require('../lib/text-layout');
    const text = '👨‍👩‍👧‍👦 Пример названия трека';
    assert.equal(graphemes(text)[0], '👨‍👩‍👧‍👦');
    const value = scrollingWindow(text, 0, 24, 28);
    assert.equal(graphemes(value)[0], '👨‍👩‍👧‍👦');
    assert.ok(textWidth(value, 28) <= 64);
});

test('track changes request fresh metadata before the periodic poll', async () => {
    const f = fixture();
    let reads = 0;
    f.music.getTrackInfo = async () => { reads++; return { title: 'New', artist: 'A' }; };
    f.engine.applyYmRemoteState({ trackTitle: 'Old', trackArtist: 'A' });
    f.engine.applyYmRemoteState({ trackTitle: 'New', trackArtist: 'A' });
    await sleep(100);
    assert.equal(reads, 1);
    f.engine.stopStateChecks();
});


test('the observer collects Sonata metadata and disposes every observer and timer', () => {
    const observers = [];
    const timers = new Set();
    let timerId = 0;
    class MutationObserver {
        constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
        observe() {}
        disconnect() { this.disconnected = true; }
    }
    const root = {};
    const sandbox = {
        window: {}, document: { body: {} }, MutationObserver,
        ymGetTrackInfo: () => ({ success: true, title: 'Sonata', artist: 'A', coverUrl: 'cover', trackUrl: 'track' }),
        ymGetTrackTime: () => ({ success: true, currentTime: '0:30', totalTime: '3:00' }),
        ymIsVibePageActive: () => false, ymFindVibeContextMenuPanel: () => null, ymFindSonataPlayerBar: () => root,
        ymDetectSonataControlByFragment: fragment => fragment === 'shuffle' ? { ok: true, shuffle: true } : { ok: true, mode: 2 },
        ymDetectPlaybackIsPlaying: () => true, ymDetectLikeIsLiked: () => false, ymDetectMuteIsMuted: () => false,
        setInterval: () => { const id = ++timerId; timers.add(id); return id; }, clearInterval: id => timers.delete(id),
        setTimeout: () => { const id = ++timerId; timers.add(id); return id; }, clearTimeout: id => timers.delete(id)
    };
    vm.createContext(sandbox);
    vm.runInContext(require('../utils/yandex-music/dom/observer'), sandbox);
    sandbox.ymInstallAjazzObserver();
    assert.equal(sandbox.window.__YM_AJAZZ_STATE.trackTitle, 'Sonata');
    assert.equal(sandbox.window.__YM_AJAZZ_STATE.coverUrl, 'cover');
    assert.equal(sandbox.window.__YM_AJAZZ_STATE.playerReady, true);
    sandbox.ymInstallAjazzObserver();
    assert.equal(timers.size, 1);
    sandbox.window.__YM_AJAZZ_OBSERVER__.dispose();
    assert.equal(timers.size, 0);
    assert.ok(observers.every(observer => observer.disconnected));
});


test('the patched Discord IPC transport destroys sockets opened after cancellation', async () => {
    const fs = require('node:fs');
    const EventEmitter = require('node:events');
    const source = fs.readFileSync(require.resolve('discord-rpc/src/transports/ipc'), 'utf8');
    let connected;
    let destroyed = 0;
    const socket = new EventEmitter();
    socket.destroy = () => { destroyed++; };
    const module = { exports: {} };
    vm.runInNewContext(source, { module, Buffer, process, require: name => name === 'net' ? { createConnection: (path, callback) => { connected = callback; return socket; } } : name === 'events' ? EventEmitter : name === '../util' ? { uuid: () => 'test' } : () => {} });
    const transport = new module.exports({});
    const opening = transport.connect();
    await transport.close();
    connected();
    await opening;
    assert.equal(destroyed, 1);
});


test('a slow cover from the previous track cannot replace the current cover', async () => {
    const first = deferred();
    const second = deferred();
    const f = fixture({ loadCover: url => url === 'a' ? first.promise : second.promise });
    f.contexts.cover.push('cover-key');
    f.engine.applyYmRemoteState({ trackTitle: 'A', trackArtist: 'Artist', coverUrl: 'a' });
    f.engine.applyYmRemoteState({ trackTitle: 'B', trackArtist: 'Artist', coverUrl: 'b' });
    first.resolve('cover-a');
    second.resolve('cover-b');
    await sleep(0);
    assert.equal(f.sent.some(row => row[2] === 'cover-a'), false);
    assert.equal(f.sent.at(-1)[2], 'cover-b');
    f.engine.stopStateChecks();
});

test('buttons retain the previous cover until the current cover finishes loading', async t => {
    const second = deferred();
    const f = fixture({ loadCover: url => url === 'a' ? Promise.resolve('cover-a') : second.promise });
    t.after(() => f.engine.stopStateChecks());
    f.contexts.cover.push('cover-key');
    f.engine.applyYmRemoteState({ trackTitle: 'A', trackArtist: 'Artist', coverUrl: 'a' });
    await sleep(0);
    assert.equal(f.sent.at(-1)[2], 'cover-a');
    f.engine.applyYmRemoteState({ trackTitle: 'B', trackArtist: 'Artist', coverUrl: 'b' });
    assert.equal(f.sent.at(-1)[2], 'cover-a');
    f.contexts.cover.push('new-cover-key');
    await f.engine.checkCoverState();
    assert.deepEqual(f.sent.at(-1), ['cover', 'new-cover-key', 'cover-a']);
    second.resolve('cover-b');
    await sleep(0);
    assert.deepEqual(f.sent.slice(-2), [['cover', 'cover-key', 'cover-b'], ['cover', 'new-cover-key', 'cover-b']]);
    assert.equal(f.sent.some(row => row[0] === 'cover' && row[2] === 'static/App-logo.png'), false);
});

test('tracks without a cover show the fallback instead of retaining the previous artwork', async t => {
    const f = fixture({ loadCover: async () => 'cover-a' });
    t.after(() => f.engine.stopStateChecks());
    f.contexts.cover.push('cover-key');
    f.engine.applyYmRemoteState({ trackTitle: 'A', trackArtist: 'Artist', coverUrl: 'a' });
    await sleep(0);
    assert.equal(f.sent.at(-1)[2], 'cover-a');
    f.engine.applyYmRemoteState({ trackTitle: 'B', trackArtist: 'Artist', coverUrl: '' });
    assert.equal(f.sent.at(-1)[2], 'static/App-logo.png');
    assert.equal(f.engine.getPresenceSnapshot().coverUrl, '');
    f.contexts.cover.push('new-cover-key');
    await f.engine.checkCoverState();
    assert.deepEqual(f.sent.at(-1), ['cover', 'new-cover-key', 'static/App-logo.png']);
});

test('failed cover loading replaces retained artwork with the fallback', async t => {
    let rejectCover;
    const pending = new Promise((resolve, reject) => { rejectCover = reject; });
    const f = fixture({ loadCover: url => url === 'a' ? Promise.resolve('cover-a') : pending });
    t.after(() => f.engine.stopStateChecks());
    f.contexts.cover.push('cover-key');
    f.engine.applyYmRemoteState({ trackTitle: 'A', trackArtist: 'Artist', coverUrl: 'a' });
    await sleep(0);
    f.engine.applyYmRemoteState({ trackTitle: 'B', trackArtist: 'Artist', coverUrl: 'b' });
    assert.equal(f.sent.at(-1)[2], 'cover-a');
    rejectCover(new Error('Cover not found'));
    await sleep(0);
    assert.equal(f.sent.at(-1)[2], 'static/App-logo.png');
});

test('disconnect clears the retained cover and rejects a late replacement', async t => {
    const second = deferred();
    const f = fixture({ loadCover: url => url === 'a' ? Promise.resolve('cover-a') : second.promise });
    t.after(() => f.engine.stopStateChecks());
    f.contexts.cover.push('cover-key');
    f.engine.applyYmRemoteState({ trackTitle: 'A', trackArtist: 'Artist', coverUrl: 'a' });
    await sleep(0);
    f.engine.applyYmRemoteState({ trackTitle: 'B', trackArtist: 'Artist', coverUrl: 'b' });
    f.music.connected = false;
    f.engine.resetDisconnectedState();
    second.resolve('cover-b');
    await sleep(0);
    assert.equal(f.sent.at(-1)[2], 'static/App-logo.png');
    assert.equal(f.sent.some(row => row[2] === 'cover-b'), false);
});

test('an outdated cover URL for the same track cannot replace its latest cover', async t => {
    const first = deferred();
    const second = deferred();
    const f = fixture({ loadCover: url => url === 'a' ? first.promise : second.promise });
    t.after(() => f.engine.stopStateChecks());
    f.contexts.cover.push('cover-key');
    f.engine.applyYmRemoteState({ trackTitle: 'A', trackArtist: 'Artist', coverUrl: 'a' });
    f.engine.applyYmRemoteState({ trackTitle: 'A', trackArtist: 'Artist', coverUrl: 'b' });
    second.resolve('cover-b');
    await sleep(0);
    first.resolve('cover-a');
    await sleep(0);
    assert.equal(f.sent.at(-1)[2], 'cover-b');
    assert.equal(f.sent.some(row => row[2] === 'cover-a'), false);
});


test('native Yandex Music desktop pages are accepted by CDP discovery', () => {
    const { isMusicTarget } = require('../lib/music-target');
    assert.equal(isMusicTarget({ type: 'page', title: 'Яндекс Музыка', url: 'music-application://desktop/' }), true);
    assert.equal(isMusicTarget({ type: 'iframe', url: 'music-application://desktop/' }), false);
    assert.equal(isMusicTarget({ type: 'page', url: 'music-application://other/' }), false);
    assert.equal(isMusicTarget({ type: 'page', url: 'music-application://user:password@desktop/' }), false);
    assert.equal(isMusicTarget({ type: 'page', url: 'ftp://music.yandex.ru/' }), false);
});
