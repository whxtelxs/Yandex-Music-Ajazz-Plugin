'use strict';

const appState = {
    lastTrackInfo: null,
    lastTimeInfo: null,
    scrollingText: {
        text: '',
        position: 0,
        speed: 0.5,
        frameCounter: 0
    },
    timers: {},
    intervals: {
        playback: null,
        like: null,
        mute: null,
        cover: null,
        time: null,
        trackInfo: null
    }
};

function resetScrollingText() {
    appState.scrollingText.text = '';
    appState.scrollingText.position = 0;
    appState.scrollingText.frameCounter = 0;
}

module.exports = { appState, resetScrollingText };
