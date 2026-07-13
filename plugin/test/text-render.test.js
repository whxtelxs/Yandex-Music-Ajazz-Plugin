'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderTrackInfoImage, renderTimeImage } = require('../lib/text-render');

test('text render produces svg data urls with escaped content', () => {
    const track = renderTrackInfoImage('Artist & Title', 16);
    assert.match(track, /^data:image\/svg\+xml;base64,/);
    const trackSvg = Buffer.from(track.split(',')[1], 'base64').toString('utf8');
    assert.match(trackSvg, /Artist &amp; Title/);
    assert.match(trackSvg, /x="36"/);
    assert.match(trackSvg, /text-anchor="middle"/);

    const time = renderTimeImage('1:23', '4:56', 14);
    const timeSvg = Buffer.from(time.split(',')[1], 'base64').toString('utf8');
    assert.match(timeSvg, /1:23/);
    assert.match(timeSvg, /4:56/);
    assert.match(timeSvg, /x="36"/);
    assert.match(timeSvg, /font-size="14"/);
    assert.equal(renderTrackInfoImage('   ', 14), null);
});
