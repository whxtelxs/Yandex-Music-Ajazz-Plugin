'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { YM_DOM_HELPERS } = require('../utils/yandex-music/dom');

const controls = [
    ["ymFindVibeSkipButton(null, 'next')", 'NEXT_TRACK_BUTTON', 'next_xs'],
    ["ymFindVibeSkipButton(null, 'previous')", 'PREVIOUS_TRACK_BUTTON', 'previous_xs'],
    ['ymFindVibeLikeButton()', 'LIKE_BUTTON', 'liked_xs'],
    ['ymFindVibeDislikeButton()', 'DISLIKE_BUTTON', 'dislike_xs']
];

function context(root) {
    const sandbox = { ymFindVibeControlsRoot: () => root, ymFindVibePlayerBar: () => root };
    vm.createContext(sandbox);
    vm.runInContext(require('../utils/yandex-music/dom/playback') + require('../utils/yandex-music/dom/like-dislike'), sandbox);
    return sandbox;
}

test('injected SVG selectors retain namespace syntax through both parsing stages', () => {
    const selectors = [...YM_DOM_HELPERS.matchAll(/querySelector\((['"])([^\n]*?)\1\)/g)]
        .filter(match => match[2].includes('use['));
    assert.ok(selectors.length >= 7);
    assert.equal(YM_DOM_HELPERS.includes('use[xlink'), false);
    for (const match of selectors) {
        const selector = vm.runInNewContext(match[1] + match[2] + match[1]);
        assert.ok(selector.includes('use[*|href'), selector);
        assert.equal(selector.includes('xlink:'), false);
    }
});

for (const [expression, testId, iconName] of controls) {
    test('Vibe ' + testId + ' prefers its locale independent test ID', () => {
        const button = {};
        const root = { querySelector(selector) {
            assert.equal(selector, 'button[data-test-id="' + testId + '"]');
            return button;
        } };
        assert.equal(vm.runInContext(expression, context(root)), button);
    });

    test('Vibe ' + testId + ' retains namespace aware SVG fallback', () => {
        const button = {};
        const root = { querySelector(selector) {
            if (selector.startsWith('button')) return null;
            assert.ok(selector.includes('use[*|href*="' + iconName + '"]'), selector);
            return { closest: tag => { assert.equal(tag, 'button'); return button; } };
        } };
        assert.equal(vm.runInContext(expression, context(root)), button);
    });
}

test('Sonata detects playback from namespace aware SVG fallback', () => {
    for (const playing of [true, false]) {
        const root = { querySelector(selector) {
            if (selector.startsWith('button')) return null;
            assert.ok(selector.includes('use[*|href='), selector);
            return selector.includes(playing ? 'pause_filled_l' : 'play_filled_l') ? {} : null;
        } };
        const sandbox = context(root);
        sandbox.ymFindSonataPlayerBar = () => root;
        assert.equal(sandbox.ymDetectSonataPlaybackIsPlaying(), playing);
    }
});

test('Sonata playback action finds a namespaced icon without test IDs', async () => {
    let clicks = 0;
    const button = { click: () => { clicks++; } };
    const sandbox = context(null);
    Object.assign(sandbox, {
        ymIsVibePageActive: () => false, ymCanClick: value => value === button,
        ymFindSonataPlayerBar: () => ({ querySelector(selector) {
            if (selector.startsWith('[data-test-id')) return null;
            assert.ok(selector.includes('use[*|href*="pause_filled"]'));
            return { closest: () => button };
        } }),
        ymDetectPlaybackIsPlaying: () => true, ymWaitForState: async () => false
    });
    assert.equal((await sandbox.ymTogglePlayback()).success, true);
    assert.equal(clicks, 1);
});

test('DOM observer installation exposes the browser exception description', async () => {
    const runtime = require('../utils/yandex-music/controller/dom-runtime');
    const client = {
        on() {},
        Page: { addScriptToEvaluateOnNewDocument: async () => ({ identifier: 'script' }) },
        Runtime: { addBinding: async () => {}, evaluate: async () => ({ exceptionDetails: { text: 'Uncaught', exception: { description: 'SyntaxError: invalid SVG selector' } } }) }
    };
    const controller = { ...runtime, client, _clientGeneration: 1 };
    await assert.rejects(controller._setupStateObserver(client), /SyntaxError: invalid SVG selector/);
    assert.notEqual(controller._observerSetup, true);
});

test('DOM actions expose the browser exception description', async () => {
    const runtime = require('../utils/yandex-music/controller/dom-runtime');
    const client = { Runtime: { evaluate: async () => ({ exceptionDetails: { text: 'Uncaught', exception: { description: 'ReferenceError: control missing' } } }) } };
    const controller = { ...runtime, client, connected: true, _clientGeneration: 1, getClient: async () => client, _domQueue: { enqueue: run => run(new AbortController().signal) } };
    await assert.rejects(controller._evaluateDom('return missing;'), /ReferenceError: control missing/);
});
