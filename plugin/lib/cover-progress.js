'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { svgDataUrl } = require('./text-render');

const PERIMETER = 208 + 16 * Math.PI;
const OUTLINE = 'M36 2 H62 A8 8 0 0 1 70 10 V62 A8 8 0 0 1 62 70 H10 A8 8 0 0 1 2 62 V10 A8 8 0 0 1 10 2 H36';
let fallback;

function renderCoverProgress(image, step = 0) {
    if (!/^data:image\/(?:jpeg|png|webp|gif|avif);base64,[a-zA-Z0-9+/=]+$/.test(image || '')) {
        fallback ||= 'data:image/png;base64,' + fs.readFileSync(path.resolve(__dirname, '../../static/App-logo.png')).toString('base64');
        image = fallback;
    }
    const progress = Number.isFinite(step) ? Math.max(0, Math.min(256, Math.round(step))) / 256 : 0;
    const length = (PERIMETER * progress).toFixed(3);
    return svgDataUrl('<svg width="72" height="72" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">'
        + '<rect width="72" height="72" fill="#101010"/>'
        + '<image x="2" y="2" width="68" height="68" preserveAspectRatio="xMidYMid slice" xlink:href="' + image + '"/>'
        + '<path d="M0 0 H72 V72 H0 Z ' + OUTLINE + ' Z" fill="#101010" fill-rule="evenodd"/>'
        + '<path d="' + OUTLINE + '" fill="none" stroke="#101010" stroke-opacity="0.65" stroke-width="3"/>'
        + (progress > 0 ? '<path d="' + OUTLINE + '" fill="none" stroke="#FFBC0D" stroke-width="3" stroke-linecap="round" stroke-dasharray="' + length + ' ' + PERIMETER.toFixed(3) + '"/>' : '')
        + '</svg>');
}

function renderTrackProgress(value = 0) {
    const progress = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
    const percent = Math.min(100, Math.floor(progress * 100 + 1e-8));
    const circumference = 56 * Math.PI;
    return svgDataUrl('<svg width="72" height="72" viewBox="0 0 72 72" xmlns="http://www.w3.org/2000/svg">'
        + '<rect width="72" height="72" fill="#101010"/>'
        + '<circle cx="36" cy="36" r="28" fill="none" stroke="#282828" stroke-width="4"/>'
        + (progress > 0 ? '<circle cx="36" cy="36" r="28" fill="none" stroke="#FFBC0D" stroke-width="4" stroke-linecap="round" transform="rotate(-90 36 36)" stroke-dasharray="'
            + (circumference * progress).toFixed(3) + ' ' + circumference.toFixed(3) + '"/>' : '')
        + '<text x="36" y="42" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="18" font-weight="600" fill="#ffffff">' + percent + '%</text>'
        + '</svg>');
}

module.exports = { renderCoverProgress, renderTrackProgress };
