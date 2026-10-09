'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { Plugins } = require('../utils/plugin');

function createHost() {
    const host = Object.create(Plugins.prototype);
    Object.assign(host, { _messageHandlers: [], _settingsWaiters: new Set(), _pendingSettings: {}, _confirmedSettings: { volumeStep: 5 }, options: { uuid: 'plugin' }, sent: [] });
    host._send = message => host.sent.push(message);
    Plugins.globalSettings = { volumeStep: 5 };
    return host;
}

test('settings save waits for a matching StreamDock readback', async () => {
    const host = createHost();
    let settled = false;
    const save = host.saveGlobalSettings({ volumeStep: 17 }, 1000).then(result => { settled = true; return result; });
    await host._dispatch(JSON.stringify({ event: 'didReceiveGlobalSettings', payload: { settings: { volumeStep: 5 } } }));
    assert.equal(settled, false);
    await host._dispatch(JSON.stringify({ event: 'didReceiveGlobalSettings', payload: { settings: { volumeStep: 17 } } }));
    assert.equal((await save).volumeStep, 17);
    assert.deepEqual(host.sent.map(message => message.event), ['setGlobalSettings', 'getGlobalSettings']);
    assert.equal(host._settingsWaiters.size, 0);
});

test('unconfirmed settings roll back instead of remaining falsely saved', async () => {
    const host = createHost();
    await assert.rejects(host.saveGlobalSettings({ volumeStep: 17 }, 10), /не подтвердил/);
    assert.equal(Plugins.globalSettings.volumeStep, 5);
    assert.deepEqual(host._pendingSettings, {});
    assert.equal(host._settingsWaiters.size, 0);
});

test('transport send failures leave confirmed settings intact', async () => {
    const host = createHost();
    host._send = () => { throw new Error('offline'); };
    await assert.rejects(host.saveGlobalSettings({ volumeStep: 17 }), /offline/);
    assert.equal(Plugins.globalSettings.volumeStep, 5);
});

test('nested settings confirmation accepts reordered keys and clears pending values', async () => {
    const host = createHost();
    const config = require('../../propertyInspector/now-playing/config').sanitize({ width: 560 });
    const save = host.saveGlobalSettings({ nowPlaying: config }, 1000);
    const reordered = Object.fromEntries(Object.entries(config).reverse());
    await host._dispatch(JSON.stringify({ event: 'didReceiveGlobalSettings', payload: { settings: { volumeStep: 5, nowPlaying: reordered } } }));
    assert.equal((await save).nowPlaying.width, 560);
    assert.deepEqual(host._pendingSettings, {});
});
