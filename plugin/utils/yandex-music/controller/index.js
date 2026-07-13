'use strict';

const { OperationQueue } = require('../../../lib/operation-queue');
const performance = require('../../../lib/performance');

const mixins = [
  require('./connection'),
  require('./dom-runtime'),
  require('./playback'),
  require('./like-dislike'),
  require('./volume'),
  require('./seek-track'),
  require('./shuffle-repeat'),
  require('./readiness')
];

class YandexMusicController {
  constructor() {
    this.port = 9222;
    this.connected = false;
    this.client = null;
    this.connectionPromise = null;
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    this.vibeShuffleState = null;
    this.vibeRepeatMode = null;
    this.remoteState = null;
    this.remoteStateUpdatedAt = 0;
    this.onRemoteStateChange = null;
    this.onConnectionChange = null;
    this._observerSetup = false;
    this._clientGeneration = 0;
    this._reconnectTimer = null;
    this._manualDisconnect = false;
    this._domQueue = new OperationQueue({
      onStart: () => performance.increment('cdp.started'),
      onFinish: (_item, duration) => {
        performance.increment('cdp.completed');
        performance.record('cdp.evaluate', duration);
      }
    });
  }
}

for (const mixin of mixins) {
  Object.assign(YandexMusicController.prototype, mixin);
}

module.exports = { YandexMusicController };
