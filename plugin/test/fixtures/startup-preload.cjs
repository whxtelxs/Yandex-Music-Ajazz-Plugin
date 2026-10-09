'use strict';

const cdpPath = require.resolve('chrome-remote-interface');
const remote = { playerReady: true, trackTitle: 'Test song', trackArtist: 'Test artist', playing: true, currentTime: '0:30', totalTime: '3:00' };
const cdp = async () => ({
    Page: { enable: async () => {}, addScriptToEvaluateOnNewDocument: async () => ({ identifier: 'test' }), removeScriptToEvaluateOnNewDocument: async () => {} },
    Runtime: { enable: async () => {}, addBinding: async () => {}, evaluate: async ({ expression }) => ({ result: { value: expression.includes('window.__YM_AJAZZ_STATE || null') ? remote : expression.includes('return !!') ? true : expression.includes('ymTogglePlayback()') ? { success: true, playing: false, confirmed: true } : null } }) },
    on() {}, close: async () => {}
});
cdp.List = async () => [{ type: 'page', url: 'https://music.yandex.ru/', id: 'test' }];
require.cache[cdpPath] = { id: cdpPath, filename: cdpPath, loaded: true, exports: cdp };
require('../../lib/update-service').registerUpdateService = () => {};
require('../../lib/host-process').resolveHostProcess = async () => null;
require('../../utils/yandex-music-launcher').detectRunningDebugPort = async () => null;
if (process.env.AUDIT_FATAL_TEST === '1') setTimeout(() => { throw new Error('intentional startup failure'); }, 200);
