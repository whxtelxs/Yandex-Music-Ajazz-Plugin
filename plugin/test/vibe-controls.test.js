'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('../utils/yandex-music/dom/shuffle-repeat');

function fixture({ repeat = 0, shuffle = false, opened = false } = {}) {
    const state = { repeat, shuffle, opened, panel: null, clicks: 0 };
    const notifications = [];
    const toggle = { id: 'vibe-toggle', getAttribute: name => name === 'aria-expanded' ? String(state.opened) : name === 'aria-controls' ? 'vibe-menu' : null, click() { state.opened = !state.opened; if (state.opened) state.panel = render(); } };
    function render() {
        const items = Object.fromEntries(['repeat', 'shuffle'].map(fragment => {
            const value = state[fragment];
            return [fragment, {
                className: value ? 'VibeContextMenu_item_active__test' : 'item',
                textContent: fragment === 'repeat' ? 'Повторять' : 'Перемешать',
                getAttribute: () => null,
                querySelector: () => ({ getAttribute: () => '#' + (fragment === 'repeat' && value === 2 ? 'repeat_one' : fragment) + '_xxs' }),
                click() { state.clicks++; state[fragment] = fragment === 'repeat' ? (state.repeat + 1) % 3 : !state.shuffle; state.opened = false; }
            }];
        }));
        return { querySelector: selector => selector.includes('REPEAT_ITEM') ? items.repeat : selector.includes('SHUFFLE_ITEM') ? items.shuffle : null, querySelectorAll: () => Object.values(items), getAttribute: name => name === 'aria-labelledby' ? toggle.id : null };
    }
    if (opened) state.panel = render();
    const sandbox = {
        window: { __YM_AJAZZ_STATE: { vibeActive: true, repeatMode: 2, shuffleOn: true, shuffleAvailable: false } },
        document: { getElementById: () => state.panel, querySelectorAll: () => state.panel ? [state.panel] : [], querySelector: () => ({ textContent: 'Моя волна' }) },
        ymFindVibePlayerBar: () => ({ querySelector: () => toggle }), ymIsVibePageActive: () => true,
        ymCanClick: button => !!button, ymWait: async () => {}, ymAjazzNotify: value => notifications.push(JSON.parse(value))
    };
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox);
    return { state, sandbox, notifications };
}

test('Vibe repeat reads newly opened menus for the full off-list-track-off cycle', async () => {
    const f = fixture();
    for (const expected of [1, 2, 0]) {
        const result = await f.sandbox.ymToggleRepeat();
        assert.equal(result.confirmed, true);
        assert.equal(result.mode, expected);
        assert.equal(f.sandbox.window.__YM_AJAZZ_STATE.repeatMode, expected);
        assert.equal(f.notifications.at(-1).repeatMode, expected);
        assert.equal(f.state.opened, false);
    }
    assert.equal(f.state.clicks, 3);
});

test('Vibe shuffle uses the actual menu instead of cached unavailability and mode labels', async () => {
    const f = fixture();
    for (const expected of [true, false]) {
        const result = await f.sandbox.ymToggleShuffle();
        assert.equal(result.success, true);
        assert.equal(result.confirmed, true);
        assert.equal(result.shuffle, expected);
        assert.equal(result.state.shuffleAvailable, true);
        assert.equal(f.sandbox.window.__YM_AJAZZ_STATE.shuffleOn, expected);
    }
});

test('closed Vibe menus left in the DOM cannot supply stale values', () => {
    const f = fixture({ opened: true });
    f.state.opened = false;
    assert.equal(f.sandbox.ymFindVibeContextMenuPanel(), null);
    assert.equal(f.sandbox.ymDetectVibeShuffleAvailable(), null);
});

test('visible Vibe menu state takes precedence over the previous cache', () => {
    const f = fixture({ repeat: 0, shuffle: false, opened: true });
    assert.equal(f.sandbox.ymDetectRepeatMode().mode, 0);
    assert.equal(f.sandbox.ymDetectShufflePressed().shuffle, false);
});

test('Vibe controls preserve a menu that was already open', async () => {
    const f = fixture({ opened: true });
    await f.sandbox.ymToggleRepeat();
    assert.equal(f.state.opened, true);
});

test('shuffle actions do not reject a command using an old unavailable snapshot', async () => {
    const { initDeps } = require('../lib/deps');
    let toggles = 0;
    const plugin = { showAlert: () => assert.fail('unexpected alert') };
    initDeps(plugin, { getRemoteState: () => ({ shuffleAvailable: false }), toggleShuffle: async () => { toggles++; return { success: true, shuffle: true }; } });
    require('../actions/shuffle-repeat')(plugin);
    await plugin['ym-shuffle'].keyUp({ context: 'shuffle-test' });
    assert.equal(toggles, 1);
});

test('observer refresh after closing Vibe preserves confirmed off values', async () => {
    const f = fixture({ repeat: 2, shuffle: true });
    const timers = [];
    Object.assign(f.sandbox, {
        MutationObserver: class { observe() {} disconnect() {} },
        ymGetTrackInfo: () => ({ success: true, title: 'Track', artist: 'Artist' }),
        ymGetTrackTime: () => ({ success: false }),
        ymDetectPlaybackIsPlaying: () => true, ymDetectLikeIsLiked: () => false, ymDetectMuteIsMuted: () => false,
        setInterval: () => 1, clearInterval() {},
        setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {}
    });
    f.sandbox.document.body = {};
    vm.runInContext(require('../utils/yandex-music/dom/observer'), f.sandbox);
    f.sandbox.ymInstallAjazzObserver();
    await f.sandbox.ymToggleRepeat();
    await f.sandbox.ymToggleShuffle();
    f.sandbox.ymInstallAjazzObserver();
    assert.equal(f.sandbox.window.__YM_AJAZZ_STATE.repeatMode, 0);
    assert.equal(f.sandbox.window.__YM_AJAZZ_STATE.shuffleOn, false);
    assert.equal(f.sandbox.window.__YM_AJAZZ_STATE.shuffleAvailable, true);
    assert.equal(f.notifications.at(-1).repeatMode, 0);
    assert.equal(f.notifications.at(-1).shuffleOn, false);
    f.sandbox.window.__YM_AJAZZ_OBSERVER__.dispose();
});
