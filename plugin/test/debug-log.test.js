'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const debugLog = require('../lib/debug-log');

test('debug log buffers entries and broadcasts when enabled', () => {
    const messages = [];
    debugLog.setBroadcast(payload => messages.push(payload));
    debugLog.setEnabled(false);
    debugLog.push('info', ['hidden']);
    assert.equal(debugLog.getBuffer().length, 0);

    debugLog.setEnabled(true);
    debugLog.push('info', ['hello', { ok: true }]);
    debugLog.push('error', [new Error('boom')]);
    assert.equal(debugLog.getBuffer().length, 2);
    assert.equal(messages.length, 2);
    assert.equal(messages[0].type, 'debugLog');
    assert.match(messages[0].entry.text, /hello/);

    debugLog.clear();
    assert.equal(debugLog.getBuffer().length, 0);
    assert.equal(messages.at(-1).type, 'debugLogClear');
    debugLog.setEnabled(false);
    debugLog.setBroadcast(null);
});
