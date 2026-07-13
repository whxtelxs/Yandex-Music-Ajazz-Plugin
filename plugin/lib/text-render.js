'use strict';

const CANVAS = 72;
const CENTER_X = CANVAS / 2;

function escapeXml(text) {
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function svgDataUrl(svg) {
    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

function hasVisibleText(text) {
    return /\S/.test(String(text || ''));
}

function buildSvg(textNodes) {
    return svgDataUrl(
        `<svg width="${CANVAS}" height="${CANVAS}" viewBox="0 0 ${CANVAS} ${CANVAS}" `
        + `xmlns="http://www.w3.org/2000/svg">`
        + `<rect width="${CANVAS}" height="${CANVAS}" fill="#000000"/>`
        + textNodes
        + '</svg>'
    );
}

function textNode(line, x, y, fontSize) {
    return `<text x="${x}" y="${y}" `
        + `font-family="Arial, Helvetica, sans-serif" font-weight="600" font-size="${fontSize}" `
        + `fill="#ffffff" text-anchor="middle">${escapeXml(line)}</text>`;
}

function renderTrackInfoImage(text, fontSize) {
    const line = String(text ?? '');
    if (!hasVisibleText(line)) return null;
    const y = CANVAS / 2 + fontSize * 0.35;
    return buildSvg(textNode(line, CENTER_X, y, fontSize));
}

function renderTimeImage(current, total, fontSize) {
    const lineHeight = fontSize * 1.15;
    const gap = 4;
    const blockHeight = lineHeight * 2 + gap;
    const firstY = (CANVAS - blockHeight) / 2 + fontSize;
    const secondY = firstY + lineHeight + gap;
    return buildSvg([
        textNode(current, CENTER_X, firstY, fontSize),
        textNode(total, CENTER_X, secondY, fontSize)
    ].join(''));
}

module.exports = {
    renderTrackInfoImage,
    renderTimeImage,
    svgDataUrl
};
