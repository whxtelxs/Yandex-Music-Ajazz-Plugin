'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { YM_DOM_HELPERS } = require('../utils/yandex-music/dom');

// Helpers are JavaScript embedded in template literals and evaluated again by
// CDP. Check the final selector string after BOTH JavaScript parsing stages.
test('SVG xlink selectors retain CSS escaping after DOM script evaluation', () => {
    const literals = [...YM_DOM_HELPERS.matchAll(/querySelector\((['"])([^\n]*?)\1\)/g)]
        .filter(match => match[2].includes('xlink'));
    assert.equal(literals.length, 8);
    for (const match of literals) {
        const selector = vm.runInNewContext(`${match[1]}${match[2]}${match[1]}`);
        assert.ok(selector.includes('xlink\\:href'), selector);
        assert.ok(!selector.includes('xlink:href'), selector);
    }
});

test('localized Vibe like button falls back to an escaped SVG selector', () => {
    const button = {};
    const selectors = [];
    const context = vm.createContext({
        document: {
            querySelector: () => ({
                querySelector(selector) {
                    selectors.push(selector);
                    if (selector.startsWith('button')) return null;
                    assert.ok(selector.includes('use[xlink\\:href*="liked_xs"]'));
                    return { closest: () => button };
                }
            })
        }
    });
    vm.runInContext(YM_DOM_HELPERS, context);
    assert.equal(vm.runInContext('ymFindVibeLikeButton()', context), button);
    assert.equal(selectors.length, 2);
});
