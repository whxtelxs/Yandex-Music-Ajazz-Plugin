'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { initDeps } = require('../lib/deps');
const {
    clampSetting,
    sanitizeSettingsPatch,
    mergeGlobalSettings,
    getSettingsSnapshot,
    resolveSetting
} = require('../lib/settings');

class FakePlugin {}

test('settings validation clamps values and ignores unknown fields', () => {
    assert.equal(clampSetting('debugPort', 70000), 65535);
    assert.equal(clampSetting('volumeStep', 0), 1);
    assert.deepEqual(sanitizeSettingsPatch({
        debugPort: '9333',
        volumeStep: 500,
        debugMode: 1,
        discordRpcEnabled: 1,
        unknown: 'value'
    }), {
        debugPort: 9333,
        volumeStep: 99,
        debugMode: true,
        discordRpcEnabled: true
    });
});

test('global patches preserve existing and unknown settings', () => {
    assert.deepEqual(
        mergeGlobalSettings({ debugPort: 9222, futureOption: true }, { volumeStep: '12' }),
        { debugPort: 9222, futureOption: true, volumeStep: 12 }
    );
});

test('retired application paths are ignored in saved settings and patches', () => {
    const plugin = new FakePlugin();
    initDeps(plugin, {});
    FakePlugin.globalSettings = { appPath: 'missing.exe', debugPort: 9333 };
    assert.equal(Object.hasOwn(getSettingsSnapshot(), 'appPath'), false);
    assert.equal(getSettingsSnapshot().debugPort, 9333);
    assert.deepEqual(sanitizeSettingsPatch({ appPath: 'other.exe' }), {});
    FakePlugin.globalSettings = {};
});

test('resolver uses global, then legacy context, then default', () => {
    const plugin = new FakePlugin();
    plugin['ym-volume-add'] = {
        data: {
            contextA: { volumeStep: 7 }
        }
    };
    initDeps(plugin, {});

    FakePlugin.globalSettings = {};
    assert.equal(resolveSetting('volumeStep', {
        actionKey: 'ym-volume-add',
        context: 'contextA',
        legacyKey: 'volumeStep'
    }), 7);
    assert.equal(resolveSetting('trackInfoTextSize'), 12);

    FakePlugin.globalSettings = { volumeStep: 13, trackInfoFontSize: 18 };
    assert.equal(resolveSetting('volumeStep', {
        actionKey: 'ym-volume-add',
        context: 'contextA',
        legacyKey: 'volumeStep'
    }), 13);
    assert.equal(resolveSetting('trackInfoFontSize'), 18);
    assert.deepEqual(getSettingsSnapshot(), {
        nowPlaying: require('../../propertyInspector/now-playing/config').defaults,
        nowPlayingPresets: [],
        debugPort: 9222,
        volumeStep: 13,
        trackInfoTextSize: 12,
        trackInfoFontSize: 18,
        timeTotalFontSize: 14,
        debugMode: false,
        discordRpcEnabled: false
    });
});
