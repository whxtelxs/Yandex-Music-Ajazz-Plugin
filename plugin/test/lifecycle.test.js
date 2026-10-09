'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPluginLifecycle } = require('../lib/plugin-lifecycle');

test('shutdown cleans every resource even when one cleanup fails', async () => {
    const calls = [];
    const lifecycle = createPluginLifecycle({
        log: { info() {}, error() {} },
        plugin: { disposeActions: async () => { calls.push('actions'); throw new Error('failed'); } },
        settingsServer: { stop: async () => calls.push('server') },
        discordPresence: { stop: async () => calls.push('discord') },
        yandexMusic: { disconnect: async () => calls.push('music') },
        stopStateChecks: () => { calls.push('state'); throw new Error('timer failed'); },
        exit: code => calls.push(code)
    });
    const first = lifecycle.shutdown('fatal', 1);
    assert.equal(lifecycle.shutdown('again'), first);
    await first;
    assert.deepEqual(calls, ['state', 'actions', 'server', 'discord', 'music', 1]);
});
