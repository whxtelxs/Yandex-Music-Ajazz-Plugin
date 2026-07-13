'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
    getRuntimePluginRoot,
    isOurPluginManifest,
    findRegisteredPluginDirs
} = require('../lib/plugin-path');

test('isOurPluginManifest matches plugin author and action prefix', () => {
    assert.equal(isOurPluginManifest({
        Author: 'whxtelxs',
        Actions: [{ UUID: 'com.whxtelxs.streamdock.yandexmusicajazz.ym-play-pause' }]
    }), true);
    assert.equal(isOurPluginManifest({
        Author: 'other',
        Actions: [{ UUID: 'com.whxtelxs.streamdock.yandexmusicajazz.ym-play-pause' }]
    }), false);
});

test('getRuntimePluginRoot points to plugin package parent', () => {
    const root = getRuntimePluginRoot();
    assert.equal(fs.existsSync(path.join(root, 'manifest.json')), true);
    assert.equal(fs.existsSync(path.join(root, 'plugin', 'index.js')), true);
});

test('findRegisteredPluginDirs discovers plugin in search roots', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ym-plugin-root-'));
    const pluginsDir = path.join(tempRoot, 'HotSpot', 'StreamDock', 'plugins');
    const pluginDir = path.join(pluginsDir, 'yandex-music');
    fs.mkdirSync(path.join(pluginDir, 'plugin'), { recursive: true });
    fs.writeFileSync(path.join(pluginDir, 'manifest.json'), JSON.stringify({
        Author: 'whxtelxs',
        Version: '9.9.9',
        Actions: [{ UUID: 'com.whxtelxs.streamdock.yandexmusicajazz.ym-play-pause' }]
    }));

    const original = process.env.APPDATA;
    process.env.APPDATA = tempRoot;
    try {
        const matches = findRegisteredPluginDirs();
        assert.equal(matches.length, 1);
        assert.equal(matches[0].version, '9.9.9');
    } finally {
        process.env.APPDATA = original;
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
});
