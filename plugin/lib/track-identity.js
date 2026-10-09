'use strict';

function getTrackIdentity(track) {
    if (!track) return '';
    const id = String(track.trackId || '').trim();
    if (id) return 'id:' + id;
    const url = String(track.trackUrl || '').trim();
    const match = url.match(/\/track\/(\d+)(?:[/?#]|$)/);
    if (match) return 'id:' + match[1];
    const title = String(track.title || track.trackTitle || '').trim();
    if (!title) return '';
    const artist = String(track.artist || track.trackArtist || '').trim();
    return JSON.stringify([title, artist]);
}

function isSameTrack(left, right) {
    const a = getTrackIdentity(left);
    const b = getTrackIdentity(right);
    if (!a || !b) return false;
    if (a.startsWith('id:') && b.startsWith('id:')) return a === b;
    const title = track => String(track.title || track.trackTitle || '').trim();
    const artist = track => String(track.artist || track.trackArtist || '').trim();
    return !!title(left) && title(left) === title(right) && artist(left) === artist(right);
}

module.exports = { getTrackIdentity, isSameTrack };
