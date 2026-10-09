'use strict';

const buttonContexts = {
    playPause: [],
    like: [],
    shuffle: [],
    repeat: [],
    mute: [],
    volumeEncoder: [],
    cover: [],
    coverProgress: [],
    trackProgress: [],
    timeTotal: [],
    trackInfo: []
};

function addContext(key, context) {
    const list = buttonContexts[key];
    if (!list.includes(context)) {
        list.push(context);
    }
    return list.length;
}

function removeContext(key, context) {
    const list = buttonContexts[key];
    const index = list.indexOf(context);
    if (index !== -1) {
        list.splice(index, 1);
    }
    require('./state-sync').forgetContext(context);
    return list.length;
}

function hasContext(key, context) {
    return buttonContexts[key].includes(context);
}

module.exports = { buttonContexts, addContext, removeContext, hasContext };
