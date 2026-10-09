'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseVersion,
    compareVersions,
    buildUpdateInfo
} = require('../lib/update-checker');

test('version parser and comparator detect newer releases', () => {
    assert.deepEqual(parseVersion('v1.7.0'), { major: 1, minor: 7, patch: 0, label: '1.7.0' });
    assert.ok(compareVersions('1.5.0', '1.7.0') < 0);
    assert.equal(compareVersions('1.7.0', '1.7.0'), 0);
    assert.ok(compareVersions('1.8.0', '1.7.0') > 0);
});

test('buildUpdateInfo marks release as available when github version is newer', () => {
    const info = buildUpdateInfo('1.5.0', {
        version: '1.7.0',
        name: 'v1.7.0',
        notes: 'Bug fixes',
        downloadUrl: 'https://example.com/plugin.zip',
        pageUrl: 'https://github.com/example/releases/tag/v1.7.0',
        assetName: 'YandexMusic.Ajazz.Plugin.v1.7.0.zip'
    });
    assert.equal(info.updateAvailable, true);
    assert.equal(info.latestVersion, '1.7.0');
    assert.equal(info.currentVersion, '1.5.0');
});


test('forced update checks share in-flight work and preserve the latest error status', async () => {
    const vm = require('node:vm');
    const fs = require('node:fs');
    const path = require('node:path');
    let accept;
    let fail;
    let calls = 0;
    let fetching = new Promise(resolve => { accept = resolve; });
    const module = { exports: {} };
    const sandbox = {
        module, process: { platform: 'test' }, setTimeout,
        require(name) {
            if (name === 'fs') return { readFileSync: () => JSON.stringify({ Version: '2.0.0' }) };
            if (name === 'path') return path;
            if (name === 'child_process') return { execFile() {} };
            if (name.endsWith('/logger')) return { log: { warn() {}, info() {} } };
            if (name === './deps') return { deps: {} };
            if (name === './update-state') return { readState: () => ({}), writeState() {} };
            if (name === './plugin-path') return { getRuntimePluginRoot: () => 'fixture' };
            if (name === './update-checker') return { buildUpdateInfo, fetchLatestRelease: () => { calls++; return fetching; } };
            throw new Error(name);
        }
    };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../lib/update-service.js'), 'utf8'), sandbox);
    const first = module.exports.checkForUpdates();
    assert.equal(module.exports.checkForUpdates({ force: true }), first);
    accept({ version: '2.1.0', name: 'Release' });
    await first;
    assert.equal(calls, 1);
    fetching = new Promise((resolve, reject) => { fail = reject; });
    const second = module.exports.checkForUpdates();
    fail(new Error('offline'));
    await second;
    assert.equal(module.exports.getPublicInfo().status, 'error');
    assert.equal(module.exports.getPublicInfo().error, 'offline');
});
