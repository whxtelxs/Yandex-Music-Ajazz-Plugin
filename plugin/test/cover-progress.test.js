'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderCoverProgress, renderTrackProgress } = require('../lib/cover-progress');
const { createStateEngine } = require('../lib/state-engine');

const artwork = 'data:image/jpeg;base64,AAAA';
const decode = image => Buffer.from(image.split(',')[1], 'base64').toString('utf8');
const length = image => Number(decode(image).match(/stroke-dasharray="([\d.]+)/)?.[1] || 0);
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
    let time = 0;
    let loads = 0;
    const sent = [];
    const contexts = Object.fromEntries(['playPause', 'like', 'mute', 'volumeEncoder', 'shuffle', 'repeat', 'trackInfo', 'timeTotal', 'cover', 'coverProgress', 'trackProgress'].map(key => [key, []]));
    contexts.coverProgress.push('progress');
    const music = { connected: true, getRemoteState: () => null, getTrackInfo: async () => null };
    const display = { setCoverDisplay: (context, image) => sent.push({ context, image }), setTrackInfoDisplay() {}, setTimeDisplay() {}, clearAllDisplayCaches() {}, clearDisplayCache() {} };
    const engine = createStateEngine({ contexts, display, now: () => time,
        loadCover: async () => { loads++; return artwork; },
        getDeps: () => ({ yandexMusic: music, plugin: { setState() {} } }) });
    return { engine, contexts, sent, music, get loads() { return loads; }, advance: ms => { time += ms; } };
}

test('progress artwork embeds the image and clamps the perimeter without invalid SVG values', () => {
    const empty = decode(renderCoverProgress(artwork, 0));
    assert.ok(empty.includes('xlink:href="' + artwork + '"'));
    assert.ok(empty.includes('fill-rule="evenodd"'));
    assert.ok(empty.includes('<image x="2" y="2" width="68" height="68"'));
    assert.equal(empty.includes('clip-path='), false);
    assert.equal(empty.includes('stroke-dasharray'), false);
    const halfway = length(renderCoverProgress(artwork, 128));
    const full = length(renderCoverProgress(artwork, 256));
    assert.ok(Math.abs(halfway * 2 - full) < 0.002);
    assert.equal(length(renderCoverProgress(artwork, 999)), full);
    assert.equal(length(renderCoverProgress(artwork, -1)), 0);
    assert.equal(length(renderCoverProgress(artwork, NaN)), 0);
    const fallback = decode(renderCoverProgress('https://example.com/image', 64));
    assert.ok(fallback.includes('data:image/png;base64,'));
    assert.equal(fallback.includes('https://example.com'), false);
});

test('a progress-only button downloads a cover and tracks seeking, pause and track changes', async t => {
    const f = fixture();
    t.after(() => f.engine.stopStateChecks());
    f.engine.applyYmRemoteState({ trackTitle: 'Song', trackArtist: 'Artist', coverUrl: 'a', currentTime: 50, totalTime: 100, playing: true });
    await tick();
    assert.equal(f.loads, 1);
    assert.ok(decode(f.sent.at(-1).image).includes(artwork));
    const halfway = length(f.sent.at(-1).image);
    f.engine.setOptimisticState('playback', 0);
    f.advance(10000);
    await f.engine.checkCoverState();
    assert.equal(length(f.sent.at(-1).image), halfway);
    f.engine.setOptimisticState('playback', 1);
    f.advance(10000);
    await f.engine.checkCoverState();
    assert.ok(length(f.sent.at(-1).image) > halfway);
    f.engine.applyYmRemoteState({ currentTime: 10, totalTime: 100, playing: true });
    assert.ok(length(f.sent.at(-1).image) < halfway);
    f.engine.applyYmRemoteState({ trackTitle: 'Next', trackArtist: 'Artist', coverUrl: '' });
    assert.equal(length(f.sent.at(-1).image), 0);
    assert.equal(decode(f.sent.at(-1).image).includes(artwork), false);
    f.engine.resetDisconnectedState();
    assert.equal(length(f.sent.at(-1).image), 0);
});

test('regular and progress covers share downloads and frame rendering is reused', async t => {
    const f = fixture();
    t.after(() => f.engine.stopStateChecks());
    f.contexts.cover.push('regular');
    f.engine.applyYmRemoteState({ trackTitle: 'Song', coverUrl: 'a', currentTime: 20, totalTime: 100, playing: false });
    await tick();
    assert.equal(f.loads, 1);
    assert.equal(f.sent.findLast(entry => entry.context === 'regular').image, artwork);
    const frame = f.sent.at(-1).image;
    await f.engine.checkCoverState();
    assert.equal(f.sent.at(-1).image, frame);
    f.contexts.coverProgress.push('second-progress');
    await f.engine.checkCoverState();
    assert.deepEqual(f.sent.at(-1), { context: 'second-progress', image: frame });
    assert.equal(f.loads, 1);
});

test('the progress button reads playback and time without a separate time display', async t => {
    const f = fixture();
    t.after(() => f.engine.stopStateChecks());
    f.music.getPlaybackIsPlaying = async () => true;
    f.music.getTrackTime = async () => ({ currentTime: 25, totalTime: 100 });
    await f.engine.checkPlaybackState();
    await f.engine.checkTimeState();
    assert.ok(length(f.sent.at(-1).image) > 0);
    const initial = length(f.sent.at(-1).image);
    f.advance(10000);
    await f.engine.checkCoverState();
    assert.ok(length(f.sent.at(-1).image) > initial);
    f.engine.applyYmRemoteState({ currentTime: 0, totalTime: 0 });
    assert.equal(length(f.sent.at(-1).image), 0);
});

test('circular progress shows the actual completed percentage and clamps unknown durations', () => {
    for (const [progress, percent] of [[0, 0], [0.25, 25], [0.6, 60], [0.999, 99], [1, 100], [2, 100], [-1, 0], [NaN, 0]]) {
        const svg = decode(renderTrackProgress(progress));
        assert.ok(svg.includes('>' + percent + '%</text>'));
        assert.ok(svg.includes('<circle cx="36" cy="36" r="28"'));
        assert.equal(svg.includes('NaN'), false);
    }
    const half = length(renderTrackProgress(0.5));
    assert.ok(Math.abs(half * 2 - length(renderTrackProgress(1))) < 0.002);
});

test('a standalone circular progress button advances and pauses without loading artwork', async t => {
    const f = fixture();
    t.after(() => f.engine.stopStateChecks());
    f.contexts.coverProgress.length = 0;
    f.contexts.trackProgress.push('ring');
    f.engine.applyYmRemoteState({ trackTitle: 'Song', coverUrl: 'a', currentTime: 60, totalTime: 100, playing: true });
    assert.ok(decode(f.sent.at(-1).image).includes('>60%</text>'));
    assert.equal(f.loads, 0);
    f.advance(10000);
    f.engine.applyYmRemoteState({});
    assert.ok(decode(f.sent.at(-1).image).includes('>70%</text>'));
    f.engine.setOptimisticState('playback', 0);
    f.advance(10000);
    f.engine.applyYmRemoteState({});
    assert.ok(decode(f.sent.at(-1).image).includes('>70%</text>'));
    f.engine.applyYmRemoteState({ currentTime: 10, totalTime: 100, playing: false });
    assert.ok(decode(f.sent.at(-1).image).includes('>10%</text>'));
    f.engine.applyYmRemoteState({ trackTitle: 'Next' });
    assert.ok(decode(f.sent.at(-1).image).includes('>0%</text>'));
    f.engine.resetDisconnectedState();
    assert.ok(decode(f.sent.at(-1).image).includes('>0%</text>'));
    assert.equal(f.loads, 0);
});
