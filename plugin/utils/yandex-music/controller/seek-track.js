'use strict';

const { log } = require('../../plugin');

module.exports = {
  async getTrackInfo(options = {}) {
    try {
      const quiet = !!options.quiet || this.isWarmingUp?.();
      if (!quiet) log.info('Получение информации о треке');
      const value = await this._evaluateDom('return ymGetTrackInfo();', {
        priority: options.priority || 'background',
        key: options.key || 'read-track-info'
      });
      if (value && value.success) {
        const trackUrl = value.trackUrl || '';
        if (!quiet) {
          log.info('Информация о треке получена успешно:', value.title, 'от', value.artist);
          log.info('URL обложки:', value.coverUrl);
          log.info('URL трека:', trackUrl || '(не найден)');
        }
        if (!trackUrl) {
          if (this._lastTrackUrlDebugTitle !== value.title) {
            this._lastTrackUrlDebugTitle = value.title;
            const debug = await this._evaluateDom('return ymDebugTrackUrlLookup();', {
              priority: options.priority || 'background',
              key: 'debug-track-url'
            });
            if (debug) {
              log.info('Диагностика URL трека:', JSON.stringify(debug));
            }
          }
        } else {
          this._lastTrackUrlDebugTitle = '';
          log.debug?.('URL трека:', trackUrl);
        }
        return {
          coverUrl: value.coverUrl,
          title: value.title,
          artist: value.artist,
          trackUrl
        };
      }
      if (this.isWarmingUp?.()) {
        return null;
      }
      log.error('Не удалось получить информацию о треке:', value?.message);
      return null;
    } catch (err) {
      if (!this.isWarmingUp?.()) {
        log.error('Ошибка при выполнении скрипта:', err);
      }
      return null;
    }
  },

  async getTrackTime(options = {}) {
    try {
      const quiet = !!options.quiet || this.isWarmingUp?.();
      if (!quiet) log.info('Получение информации о времени трека');
      const value = await this._evaluateDom('return ymGetTrackTime();', {
        priority: options.priority || 'background',
        key: options.key || 'read-track-time'
      });
      if (value && value.success) {
        if (!quiet) {
          log.info('Информация о времени трека получена успешно:', value.currentTime, '/', value.totalTime);
        }
        return {
          currentTime: value.currentTime,
          totalTime: value.totalTime,
          progressValue: value.progressValue,
          progressMax: value.progressMax,
          progressPercent: value.progressPercent
        };
      }
      if (this.isWarmingUp?.()) {
        return null;
      }
      log.error('Не удалось получить информацию о времени трека:', value?.message);
      return null;
    } catch (err) {
      if (!this.isWarmingUp?.()) {
        log.error('Ошибка при выполнении скрипта:', err);
      }
      return null;
    }
  },

  async seekTo(position) {
    try {
      log.info(`Перемотка на позицию: ${position}`);
      const value = await this._evaluateDom(`return ymSeekTo(${position});`, { priority: 'user' });
      if (value && value.success) {
        log.info(`Перемотка выполнена: ${value.position}/${value.max}`);
        return true;
      }
      log.error('Не удалось выполнить перемотку:', value?.message);
      return false;
    } catch (err) {
      log.error('Ошибка при перемотке:', err);
      return false;
    }
  },

  async seekRelative(deltaTicks) {
    try {
      const seekDelta = deltaTicks * 5;
      log.info(`Относительная перемотка: ${seekDelta} секунд`);
      const value = await this._evaluateDom(`return ymSeekRelative(${seekDelta});`, { priority: 'user' });
      if (value && value.success) {
        log.info(`Перемотка выполнена: ${value.oldPosition} -> ${value.newPosition} (delta: ${value.delta})`);
        return true;
      }
      log.error('Не удалось выполнить перемотку:', value?.message);
      return false;
    } catch (err) {
      log.error('Ошибка при перемотке:', err);
      return false;
    }
  }
};
