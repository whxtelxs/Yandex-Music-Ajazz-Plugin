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
