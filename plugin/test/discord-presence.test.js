'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildPresenceModel,
    buildArtistState,
    worthSending,
    normalizeCover,
    normalizeTrackUrl,
    discordText
} = require('../lib/discord/builder');

test('discordText trims and pads single-character values', () => {
    assert.equal(discordText('  Faded  '), 'Faded');
    assert.equal(discordText('A'), 'A ');
    assert.equal(discordText(''), '');
});

test('normalizeCover upgrades yandex cover template and adds https', () => {
    assert.equal(
        normalizeCover('avatars.yandex.net/get-music-content/x/%%'),
        'https://avatars.yandex.net/get-music-content/x/400x400'
    );
    assert.equal(normalizeCover(''), null);
});

test('buildArtistState returns artist only', () => {
    assert.equal(buildArtistState('Alan Walker'), 'Alan Walker');
    assert.equal(buildArtistState(''), '');
    assert.equal(buildArtistState('Неизвестный исполнитель'), '');
});

test('normalizeTrackUrl accepts yandex track and album links', () => {
    assert.equal(
        normalizeTrackUrl('https://music.yandex.ru/album/37596605/track/141409337'),
        'https://music.yandex.ru/album/37596605/track/141409337'
    );
    assert.equal(
        normalizeTrackUrl('https://music.yandex.ru/album/37596605'),
        'https://music.yandex.ru/album/37596605'
    );
    assert.equal(
        normalizeTrackUrl('/album/track?albumId=36326202&trackId=138448803'),
        'https://music.yandex.ru/album/36326202/track/138448803'
    );
    assert.equal(
        normalizeTrackUrl('/album?albumId=36326202'),
        'https://music.yandex.ru/album/36326202'
    );
    assert.equal(normalizeTrackUrl('https://example.com/track/1'), 'https://music.yandex.ru/');
    assert.equal(normalizeTrackUrl(''), 'https://music.yandex.ru/');
});

test('normalizeTrackUrl falls back to album id from cover url on vibe', () => {
    const cover = 'https://avatars.yandex.net/get-music-content/20013662/c12d5e66.a.42511627-1/400x400';
    assert.equal(
        normalizeTrackUrl('', 'https://music.yandex.ru/', cover),
        'https://music.yandex.ru/album/42511627'
    );
});

test('buildPresenceModel uses album url from cover when track url missing', () => {
    const cover = 'https://avatars.yandex.net/get-music-content/20013662/c12d5e66.a.42511627-1/400x400';
    const model = buildPresenceModel({
        title: 'рабочий класс (временно)',
        artist: '1337, Locura',
        playing: true,
        coverUrl: cover
    });

    assert.equal(model.trackUrl, 'https://music.yandex.ru/album/42511627');
    assert.equal(model.buttons[0].url, 'https://music.yandex.ru/album/42511627');
});

test('buildPresenceModel uses track url from snapshot', () => {
    const model = buildPresenceModel({
        title: 'КАК МАЛОЛЕТКА',
        artist: 'EVEN CUTE',
        playing: true,
        trackUrl: 'https://music.yandex.ru/album/37596605/track/141409337'
    });

    assert.equal(model.trackUrl, 'https://music.yandex.ru/album/37596605/track/141409337');
    assert.equal(model.buttons[0].url, 'https://music.yandex.ru/album/37596605/track/141409337');
    assert.equal(model.detailsUrl, 'https://music.yandex.ru/album/37596605/track/141409337');
});

test('buildPresenceModel falls back to home when track url missing', () => {
    const model = buildPresenceModel({
        title: 'КАК МАЛОЛЕТКА',
        artist: 'EVEN CUTE',
        playing: true
    });

    assert.equal(model.trackUrl, 'https://music.yandex.ru/');
});

test('presence state shows artist without playback label', () => {
    const model = buildPresenceModel({
        title: 'Faded',
        artist: 'Alan Walker',
        playing: false
    });

    assert.equal(model.state, 'Alan Walker');
    assert.equal(model.playing, false);
});

test('worthSending ignores playback-only changes', () => {
    const base = buildPresenceModel({
        title: 'Faded',
        artist: 'Alan Walker',
        playing: true,
        trackUrl: 'https://music.yandex.ru/album/1/track/2'
    });
    const near = buildPresenceModel({
        title: 'Faded',
        artist: 'Alan Walker',
        playing: true,
        trackUrl: 'https://music.yandex.ru/album/1/track/2'
    });
    const paused = buildPresenceModel({
        title: 'Faded',
        artist: 'Alan Walker',
        playing: false,
        trackUrl: 'https://music.yandex.ru/album/1/track/2'
    });
    const other = buildPresenceModel({
        title: 'Other',
        artist: 'Alan Walker',
        playing: true,
        trackUrl: 'https://music.yandex.ru/album/1/track/2'
    });
    const otherUrl = buildPresenceModel({
        title: 'Faded',
        artist: 'Alan Walker',
        playing: true,
        trackUrl: 'https://music.yandex.ru/album/9/track/9'
    });

    assert.equal(worthSending(near, base), false);
    assert.equal(worthSending(paused, base), false);
    assert.equal(worthSending(other, base), true);
    assert.equal(worthSending(otherUrl, base), true);
    assert.equal(worthSending(base, null), true);
});
