'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { getCurrentTrackLink } = require('../lib/track-link');
const { writeClipboard } = require('../lib/clipboard');

const link = 'https://music.yandex.ru/album/123/track/456';

test('copying reuses the current track link without another DOM request', async () => {
    const music = { connected: true, getRemoteState: () => ({ trackTitle: 'Song', trackArtist: 'Artist', trackUrl: link }),
        getTrackInfo: () => assert.fail('unexpected DOM request') };
    assert.equal(await getCurrentTrackLink(music), link);
});

test('missing links are retrieved from the current player even without Discord or display actions', async () => {
    const music = { connected: true, getRemoteState: () => ({ trackTitle: 'Song', trackArtist: 'Artist' }),
        getTrackInfo: async options => {
            assert.equal(options.priority, 'user');
            return { title: 'Song', artist: 'Artist', trackUrl: link };
        } };
    assert.equal(await getCurrentTrackLink(music), link);
});

test('copying rejects an album link instead of claiming it is a track link', async () => {
    const music = { connected: true, getRemoteState: () => ({ trackTitle: 'Song', trackUrl: 'https://music.yandex.ru/album/123' }),
        getTrackInfo: async () => ({ title: 'Song', trackUrl: 'https://music.yandex.ru/album/123' }) };
    await assert.rejects(getCurrentTrackLink(music), /недоступна/);
    await assert.rejects(getCurrentTrackLink({ connected: false }), /не подключена/);
});

test('a track change during URL retrieval cannot copy the previous track link', async () => {
    let remote = { trackTitle: 'Old', trackArtist: 'Artist' };
    const music = { connected: true, getRemoteState: () => remote, getTrackInfo: async () => {
        remote = { trackTitle: 'New', trackArtist: 'Artist' };
        return { title: 'Old', artist: 'Artist', trackUrl: link };
    } };
    await assert.rejects(getCurrentTrackLink(music), /Трек сменился/);
});

test('clipboard writers pass the exact text through stdin and wait for process completion', async () => {
    for (const platform of ['win32', 'darwin']) {
        let child;
        let written = '';
        const text = link + '?text=Привет&value=$test';
        const copying = writeClipboard(text, { platform, startProcess: (command, args, options) => {
            assert.equal(command, platform === 'win32' ? 'powershell.exe' : '/usr/bin/pbcopy');
            assert.equal(options.windowsHide, true);
            assert.equal(args.some(value => value.includes(text)), false);
            child = new EventEmitter();
            child.stdin = new PassThrough();
            child.stdin.on('data', chunk => { written += chunk.toString('utf8'); });
            child.kill = () => {};
            return child;
        } });
        assert.equal(written, text);
        child.emit('close', 0);
        await copying;
    }
});

test('clipboard process failures reject copying', async () => {
    const copying = writeClipboard(link, { platform: 'win32', startProcess: () => {
        const child = new EventEmitter();
        child.stdin = new PassThrough();
        child.kill = () => {};
        process.nextTick(() => child.emit('close', 1));
        return child;
    } });
    await assert.rejects(copying, /буфер обмена/);
});

test('successful copying shows no feedback and ignores repeated presses while copying', async t => {
    const { initDeps } = require('../lib/deps');
    const { Actions } = require('../utils/plugin');
    const notices = [];
    const plugin = { showOk: () => assert.fail('unexpected success overlay'), showAlert: () => assert.fail('unexpected error overlay'), setImage: (...args) => notices.push(args) };
    initDeps(plugin, { connected: true, getRemoteState: () => ({ trackTitle: 'Song', trackUrl: link }) });
    let finish;
    let writes = 0;
    require('../actions/link-copy')(plugin, { copy: async text => {
        assert.equal(text, link);
        writes++;
        await new Promise(resolve => { finish = resolve; });
    } });
    const action = plugin['ym-link-copy'];
    const descriptor = { context: 'link-test', action: 'plugin.ym-link-copy', payload: { settings: {} } };
    action.willAppear(descriptor);
    notices.length = 0;
    t.after(() => action.willDisappear(descriptor));
    const copying = action.keyUp(descriptor);
    await action.keyUp(descriptor);
    assert.equal(writes, 1);
    assert.deepEqual(notices, []);
    finish();
    await copying;
    assert.deepEqual(notices, []);
    assert.equal(Actions.actions['link-test'], descriptor.action);
});

test('a failed copy displays the error icon for two seconds and restores the button', async t => {
    const { initDeps } = require('../lib/deps');
    const notices = [];
    const timers = new Map();
    let sequence = 0;
    const plugin = { showOk: () => assert.fail('unexpected success'), showAlert: () => assert.fail('unexpected error overlay'), setImage: (...args) => notices.push(args) };
    initDeps(plugin, { connected: true, getRemoteState: () => ({ trackTitle: 'Song', trackUrl: link }) });
    require('../actions/link-copy')(plugin, {
        copy: async () => { throw new Error('Clipboard unavailable'); },
        setTimer: (fn, delay) => { assert.equal(delay, 2000); timers.set(++sequence, fn); return sequence; },
        clearTimer: id => timers.delete(id)
    });
    const action = plugin['ym-link-copy'];
    const descriptor = { context: 'link-error-test', action: 'plugin.ym-link-copy', payload: { settings: {} } };
    action.willAppear(descriptor);
    notices.length = 0;
    t.after(() => action.willDisappear(descriptor));
    await action.keyUp(descriptor);
    assert.deepEqual(notices, [['link-error-test', 'static/ym-err-icon.jpg']]);
    await action.keyUp(descriptor);
    assert.equal(timers.size, 1);
    const [timerId, expire] = [...timers][0];
    timers.delete(timerId);
    expire();
    assert.deepEqual(notices.at(-1), ['link-error-test', 'static/ym-link-copy.jpg']);
    notices.length = 0;
    await action.keyUp(descriptor);
    action.willDisappear(descriptor);
    assert.equal(timers.size, 0);
    assert.deepEqual(notices, [['link-error-test', 'static/ym-err-icon.jpg']]);
});
