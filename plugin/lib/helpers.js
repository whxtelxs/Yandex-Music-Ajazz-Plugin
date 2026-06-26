'use strict';

function sendLogToPropertyInspector(_message, _type = 'info') {
    return;
}

function clampVolumeStep(value) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return 5;
    return Math.max(1, Math.min(99, n));
}

function clampTextSize(value, defaultVal, min, max) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return defaultVal;
    return Math.max(min, Math.min(max, n));
}

function parseTimeToSeconds(timeString) {
    const parts = timeString.split(':');
    if (parts.length === 2) {
        const minutes = parseInt(parts[0], 10) || 0;
        const seconds = parseInt(parts[1], 10) || 0;
        return minutes * 60 + seconds;
    }
    return 0;
}

function formatSecondsToTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function getScrollingText(fullText, position, maxLength) {
    if (fullText.length <= maxLength) {
        return fullText;
    }

    const padding = '   ';
    const extendedText = fullText + padding;
    const totalLength = extendedText.length;
    const startPos = position % totalLength;
    let result = '';

    for (let i = 0; i < maxLength; i++) {
        result += extendedText[(startPos + i) % totalLength];
    }

    return result;
}

function createSvg(text) {
    return `<svg width="144" height="144" xmlns="http://www.w3.org/2000/svg">
    <text x="72" y="120" font-family="Arial" font-weight="bold" font-size="36" fill="white" text-anchor="middle"
        stroke="black" stroke-width="2" paint-order="stroke">
        ${text}
    </text>
</svg>`;
}

module.exports = {
    sendLogToPropertyInspector,
    clampVolumeStep,
    clampTextSize,
    parseTimeToSeconds,
    formatSecondsToTime,
    getScrollingText,
    createSvg
};
