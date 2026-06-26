'use strict';

const { log } = require('../../plugin');

module.exports = {
  async getTrackInfo() {
    try {
      log.info('Получение информации о треке');
      const value = await this._evaluateDom('return ymGetTrackInfo();');
      if (value && value.success) {
        log.info('Информация о треке получена успешно:', value.title, 'от', value.artist);
        log.info('URL обложки:', value.coverUrl);
        return {
          coverUrl: value.coverUrl,
          title: value.title,
          artist: value.artist
        };
      }
      log.error('Не удалось получить информацию о треке:', value?.message);
      return null;
    } catch (err) {
      log.error('Ошибка при выполнении скрипта:', err);
      return null;
    }
  },

  async getTrackTime() {
    try {
      log.info('Получение информации о времени трека');
      const value = await this._evaluateDom('return ymGetTrackTime();');
      if (value && value.success) {
        log.info('Информация о времени трека получена успешно:', value.currentTime, '/', value.totalTime);
        return {
          currentTime: value.currentTime,
          totalTime: value.totalTime,
          progressValue: value.progressValue,
          progressMax: value.progressMax,
          progressPercent: value.progressPercent
        };
      }
      log.error('Не удалось получить информацию о времени трека:', value?.message);
      return null;
    } catch (err) {
      log.error('Ошибка при выполнении скрипта:', err);
      return null;
    }
  },

  async seekTo(position) {
    try {
      log.info(`Перемотка на позицию: ${position}`);
      const value = await this._evaluateDom(`return ymSeekTo(${position});`);
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
      const value = await this._evaluateDom(`return ymSeekRelative(${seekDelta});`);
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
