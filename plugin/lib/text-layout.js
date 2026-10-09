'use strict';

const segmenter = new Intl.Segmenter('ru', { granularity: 'grapheme' });

function graphemes(text) {
    return Array.from(segmenter.segment(String(text || '')), item => item.segment);
}

function textWidth(text, fontSize) {
    return graphemes(text).reduce((width, char) => {
        let factor = 0.65;
        if (/^[ilI1.,:;'!| ]$/.test(char)) factor = 0.32;
        else if (/^[MWШЩЖЮ]$/.test(char)) factor = 0.95;
        else if (/[^\u0000-\u04ff]/u.test(char)) factor = 1.15;
        return width + fontSize * factor;
    }, 0);
}

function scrollingWindow(text, position, maxLength, fontSize = 14, maxWidth = 64) {
    const chars = graphemes(text);
    if (chars.length <= maxLength && textWidth(text, fontSize) <= maxWidth) return String(text);
    const sequence = [...chars, ' ', ' ', ' '];
    const start = ((Math.trunc(position) % sequence.length) + sequence.length) % sequence.length;
    let result = '';
    for (let index = 0; index < maxLength; index++) {
        const next = result + sequence[(start + index) % sequence.length];
        if (result && textWidth(next, fontSize) > maxWidth) break;
        result = next;
    }
    return result;
}

module.exports = { graphemes, textWidth, scrollingWindow };
