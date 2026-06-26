'use strict';

const { deps } = require('./deps');
const { clampTextSize } = require('./helpers');

function getTrackInfoTextSize(context) {
    const settings = deps.plugin['ym-track-info']?.data?.[context];
    return clampTextSize(settings?.textSize, 12, 4, 24);
}

function getTimeTextSize(context) {
    const settings = deps.plugin['ym-time-total']?.data?.[context];
    return clampTextSize(settings?.textSize, 6, 3, 12);
}

function setTimeTitle(context, current, total) {
    const textSize = getTimeTextSize(context);
    const combined = current.padEnd(textSize, ' ') + total;
    deps.plugin.setTitle(context, combined, 2, textSize);
}

module.exports = {
    getTrackInfoTextSize,
    getTimeTextSize,
    setTimeTitle
};
