'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { YM_DOM_HELPERS } = require('../utils/yandex-music/dom');

test('SVG fallbacks use namespace-aware href selectors after both parsing stages', () => {
    const literals = [...YM_DOM_HELPERS.matchAll(/querySelector\((['"])([^\n]*?)\1\)/g)]
        .filter(match => match[2].includes('*|href'));
    assert.equal(literals.length, 8);
    for (const match of literals) {
        const selector = vm.runInNewContext(`${match[1]}${match[2]}${match[1]}`);
        assert.ok(selector.includes('use[*|href'), selector);
    }
    assert.ok(!YM_DOM_HELPERS.includes('use[xlink'));
});

for (const [expression, testId] of [
    ["ymFindVibeSkipButton(null, 'next')", 'NEXT_TRACK_BUTTON'],
    ["ymFindVibeSkipButton(null, 'previous')", 'PREVIOUS_TRACK_BUTTON'],
    ['ymFindVibeLikeButton()', 'LIKE_BUTTON'],
    ['ymFindVibeDislikeButton()', 'DISLIKE_BUTTON']
]) {
    test(`localized Vibe control ${testId} uses its stable test ID`, () => {
        const button = {};
        const context = vm.createContext({
            document: {
                querySelector: () => ({
                    querySelector(selector) {
                        assert.equal(selector, `button[data-test-id="${testId}"]`);
                        return button;
                    }
                })
            }
        });
        vm.runInContext(YM_DOM_HELPERS, context);
        assert.equal(vm.runInContext(expression, context), button);
    });
}

test('Vibe like lookup retains SVG fallback when test ID and Russian label are absent', () => {
    const button = {};
    const context = vm.createContext({
        document: {
            querySelector: () => ({
                querySelector(selector) {
                    if (selector.startsWith('button')) return null;
                    assert.ok(selector.includes('use[*|href*="liked_xs"]'));
                    return { closest: () => button };
                }
            })
        }
    });
    vm.runInContext(YM_DOM_HELPERS, context);
    assert.equal(vm.runInContext('ymFindVibeLikeButton()', context), button);
});
