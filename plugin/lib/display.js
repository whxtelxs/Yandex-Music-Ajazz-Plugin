'use strict';

const { deps } = require('./deps');
const { resolveSetting } = require('./settings');
const { renderTrackInfoImage, renderTimeImage } = require('./text-render');

const lastImageByContext = new Map();

function getTrackInfoTextSize(context) {
    return resolveSetting('trackInfoTextSize', {
        actionKey: 'ym-track-info',
        context,
        legacyKey: 'textSize'
    });
}

function getTrackInfoFontSize(context) {
    return resolveSetting('trackInfoFontSize', {
        actionKey: 'ym-track-info',
        context,
        legacyKey: 'fontSize'
    });
}

function getTimeFontSize(context) {
    return resolveSetting('timeTotalFontSize', {
        actionKey: 'ym-time-total',
        context,
        legacyKey: 'fontSize'
    });
}

function setDisplayImage(context, image) {
    if (!image || lastImageByContext.get(context) === image) return;
    lastImageByContext.set(context, image);
    deps.plugin.setImage(context, image);
}

function setTrackInfoDisplay(context, text) {
    setDisplayImage(context, renderTrackInfoImage(text, getTrackInfoFontSize(context)));
}

function setTimeDisplay(context, current, total) {
    setDisplayImage(context, renderTimeImage(current, total, getTimeFontSize(context)));
}

function clearDisplayCache(context) {
    lastImageByContext.delete(context);
}

function clearAllDisplayCaches() {
    lastImageByContext.clear();
}

module.exports = {
    getTrackInfoTextSize,
    getTrackInfoFontSize,
    getTimeFontSize,
    setTrackInfoDisplay,
    setTimeDisplay,
    clearDisplayCache,
    clearAllDisplayCaches
};
