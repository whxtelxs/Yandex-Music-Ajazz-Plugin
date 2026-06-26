'use strict';

const { log } = require('../../plugin');

module.exports = {
  async toggleMute() {
    try {
      log.info('Определение состояния звука и переключение');
      const value = await this._evaluateDom('return ymToggleMute();');
      if (value && value.success) {
        log.info(value.message);
        log.info(`Звук был ${value.wasMuted ? 'выключен' : 'включен'}`);
        return true;
      }
      log.error('Не удалось переключить звук:', value?.message);
      return false;
    } catch (err) {
      log.error('Ошибка при выполнении скрипта:', err);
      return false;
    }
  },

  async getMuteIsMuted() {
    try {
      const value = await this._evaluateDom('return ymDetectMuteIsMuted();');
      if (value === null || value === undefined) return null;
      return !!value;
    } catch (err) {
      log.error('getMuteIsMuted:', err);
      return null;
    }
  },

  async getVolume() {
    try {
      const value = await this._evaluateDom('return ymGetVolume();');
      if (value && value.success) {
        log.info(`Получена громкость: ${value.volume}% (raw: ${value.rawValue}, max: ${value.max})`);
        return value.volume;
      }
      log.error('Не удалось получить громкость:', value?.message);
      return null;
    } catch (err) {
      log.error('Ошибка при получении громкости:', err);
      return null;
    }
  },

  async setVolume(volumePercent) {
    try {
      const clampedPercent = Math.max(0, Math.min(100, volumePercent));
      log.info(`Установка громкости: ${clampedPercent}%`);
      const value = await this._evaluateDom(`return ymSetVolume(${clampedPercent});`);
      if (value && value.success) {
        log.info(`Громкость установлена: ${value.volume}% (raw: ${value.rawValue}, actual: ${value.actualValue})`);
        return true;
      }
      log.error('Не удалось установить громкость:', value?.message);
      return false;
    } catch (err) {
      log.error('Ошибка при установке громкости:', err);
      return false;
    }
  },

  async changeVolume(delta) {
    try {
      const currentVolume = await this.getVolume();
      if (currentVolume === null) {
        log.error('Не удалось получить текущую громкость');
        return false;
      }

      const newVolume = Math.max(0, Math.min(100, currentVolume + delta));
      log.info(`Изменение громкости: ${currentVolume}% -> ${newVolume}% (delta: ${delta})`);
      return await this.setVolume(newVolume);
    } catch (err) {
      log.error('Ошибка при изменении громкости:', err);
      return false;
    }
  }
};
