'use strict';

const { log } = require('../../plugin');

module.exports = {
  async likeTrack() {
    try {
      const value = await this._evaluateDom('return ymClickLike();', { priority: 'user' });
      if (!value?.success) {
        log.error('Не удалось изменить лайк:', value?.message);
        return false;
      }
      return value;
    } catch (err) {
      log.error('Ошибка при изменении лайка:', err);
      return false;
    }
  },

  async dislikeTrack() {
    return await this._runDomAction('ymClickDislike()', 'Установка дизлайка');
  },

  async getLikeIsLiked(options = {}) {
    try {
      const value = await this._evaluateDom('return ymDetectLikeIsLiked();', {
        priority: options.priority || 'background',
        key: 'read-like'
      });
      if (value === null || value === undefined) return null;
      return !!value;
    } catch (err) {
      log.error('getLikeIsLiked:', err);
      return null;
    }
  }
};
