'use strict';

const mixins = [
  require('./connection'),
  require('./dom-runtime'),
  require('./playback'),
  require('./like-dislike'),
  require('./volume'),
  require('./seek-track'),
  require('./shuffle-repeat')
];

class YandexMusicController {
  constructor() {
    this.port = 9222;
    this.connected = false;
    this.client = null;
    this.connectionPromise = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
    this.reconnectDelay = 1000;
    this.vibeShuffleState = null;
    this.vibeRepeatMode = null;
    this.remoteState = null;
    this.remoteStateUpdatedAt = 0;
    this.onRemoteStateChange = null;
    this._observerSetup = false;
  }
}

for (const mixin of mixins) {
  Object.assign(YandexMusicController.prototype, mixin);
}

module.exports = { YandexMusicController };
