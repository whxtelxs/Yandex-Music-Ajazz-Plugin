'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { YandexMusicLauncher } = require('../utils/yandex-music-launcher');

test('launching an already open app without CDP requests a restart instead of killing it', async () => {
    const launcher = new YandexMusicLauncher();
    launcher.isYandexMusicRunning = async () => true;
    launcher.detectRunningDebugPort = async () => null;
    launcher.closeYandexMusic = async () => assert.fail('unexpected termination');
    launcher.launchYandexMusic = async () => assert.fail('unexpected launch');
    const result = await launcher.ensureYandexMusicRunning();
    assert.equal(result.success, false);
    assert.equal(result.restartRequired, true);
});

test('an existing debug-enabled app is reused with its active port', async () => {
    const launcher = new YandexMusicLauncher();
    launcher.isYandexMusicRunning = async () => true;
    launcher.detectRunningDebugPort = async () => 9230;
    const result = await launcher.ensureYandexMusicRunning();
    assert.equal(result.success, true);
    assert.equal(result.alreadyRunning, true);
    assert.equal(result.port, 9230);
    assert.equal(result.adjusted, true);
});

test('process detection failures are reported and do not launch duplicate applications', async () => {
    const launcher = new YandexMusicLauncher({ platform: 'win32', command: async () => { throw new Error('permission denied'); } });
    launcher.launchYandexMusic = async () => assert.fail('unexpected launch');
    const result = await launcher.ensureYandexMusicRunning();
    assert.equal(result.success, false);
    assert.match(result.error, /permission denied/);
});

test('an invalid executable reports spawn failure', async () => {
    const launcher = new YandexMusicLauncher({ platform: 'win32' });
    launcher.findYandexMusicPath = async () => path.join(__dirname, 'missing-audit-test.exe');
    await assert.rejects(launcher.launchYandexMusic(), { code: 'ENOENT' });
});

test('missing automatic installation reports manual debug launch without a path setting', async () => {
    const launcher = new YandexMusicLauncher({ platform: 'win32' });
    launcher.findYandexMusicPath = async () => null;
    await assert.rejects(launcher.launchYandexMusic(), /запустите его вручную с портом отладки/);
});
