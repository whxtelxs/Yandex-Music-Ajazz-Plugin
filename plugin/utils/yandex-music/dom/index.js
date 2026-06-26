'use strict';

const parts = [
  require('./shared'),
  require('./playback'),
  require('./like-dislike'),
  require('./volume'),
  require('./track-meta'),
  require('./seek-track'),
  require('./shuffle-repeat'),
  require('./observer')
];

const YM_DOM_HELPERS = parts.join('\n');

module.exports = { YM_DOM_HELPERS };
