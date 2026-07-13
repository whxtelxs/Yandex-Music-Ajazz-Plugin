'use strict';

const { log } = require('../../plugin');

module.exports = {
  async previousTrack() {
    return await this.runTrackControl('previous', 'Переход к предыдущему треку');
  },

  async nextTrack() {
    return await this.runTrackControl('next', 'Переход к следующему треку');
  },

  async runTrackControl(direction, actionDescription) {
    return this._runDomAction(`ymClickTrackControl('${direction}')`, actionDescription);
  },

  async togglePlayback() {
    try {
      log.info('Определение состояния воспроизведения');
      const value = await this._evaluateDom('return ymTogglePlayback();', { priority: 'user' });
      if (value && value.success) {
        log.info(value.message);
        log.info(`Трек был ${value.wasPlaying ? 'в состоянии воспроизведения' : 'на паузе'}`);
        return { success: true, playing: !value.wasPlaying };
      }
      log.error('Не удалось переключить воспроизведение:', value?.message);
      if (value?.error) log.error('Детали ошибки:', value.error);
      return false;
    } catch (err) {
      log.error('Ошибка при выполнении скрипта:', err);
      return false;
    }
  },

  async getPlaybackIsPlaying() {
    try {
      const value = await this._evaluateDom('return ymDetectPlaybackIsPlaying();', { key: 'read-playback' });
      if (value === null || value === undefined) return null;
      return !!value;
    } catch (err) {
      log.error('getPlaybackIsPlaying:', err);
      return null;
    }
  }
};
