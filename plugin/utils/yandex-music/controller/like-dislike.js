'use strict';

const { log } = require('../../plugin');

module.exports = {
  async likeTrack() {
    return await this._runDomAction('ymClickLike()', 'Установка лайка');
  },

  async dislikeTrack() {
    return await this._runDomAction('ymClickDislike()', 'Установка дизлайка');
  },

  async getLikeIsLiked() {
    try {
      const value = await this._evaluateDom('return ymDetectLikeIsLiked();');
      if (value === null || value === undefined) return null;
      return !!value;
    } catch (err) {
      log.error('getLikeIsLiked:', err);
      return null;
    }
  }
};
