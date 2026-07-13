'use strict';

const { log } = require('../../plugin');

module.exports = {
  async toggleShuffle() {
    try {
      const value = await this._evaluateDom('return ymToggleShuffle();', { priority: 'user' });
      if (value && value.success) {
        if (value.shuffle !== undefined) this.vibeShuffleState = !!value.shuffle;
        this.remoteState = { ...(this.remoteState || {}), shuffleOn: !!value.shuffle };
        this.onRemoteStateChange?.(this.remoteState);
        return value;
      }
      if (value && value.unavailable) {
        log.info('Shuffle недоступен в текущем режиме Vibe');
      }
      return false;
    } catch (err) {
      log.error('Ошибка при переключении shuffle:', err);
      return false;
    }
  },

  async toggleRepeat() {
    try {
      const value = await this._evaluateDom('return ymToggleRepeat();', { priority: 'user' });
      if (value && value.success) {
        if (value.mode !== undefined) this.vibeRepeatMode = value.mode;
        this.remoteState = { ...(this.remoteState || {}), repeatMode: value.mode };
        this.onRemoteStateChange?.(this.remoteState);
        return value;
      }
      return false;
    } catch (err) {
      log.error('Ошибка при переключении repeat:', err);
      return false;
    }
  },

  async getShufflePressed() {
    try {
      if (this.remoteState) {
        if (this.remoteState.shuffleAvailable === false) return false;
        if (this.remoteState.shuffleOn !== null && this.remoteState.shuffleOn !== undefined) {
          return !!this.remoteState.shuffleOn;
        }
      }
      const value = await this._evaluateDom('return ymDetectShufflePressed();', { key: 'read-shuffle' });
      if (value && value.ok) {
        this.vibeShuffleState = !!value.shuffle;
        return !!value.shuffle;
      }
      if (this.vibeShuffleState !== null) return this.vibeShuffleState;
      return null;
    } catch (err) {
      log.error('getShufflePressed:', err);
      return null;
    }
  },

  async getRepeatMode() {
    try {
      if (this.remoteState && this.remoteState.repeatMode !== null && this.remoteState.repeatMode !== undefined) {
        return this.remoteState.repeatMode;
      }
      const value = await this._evaluateDom('return ymDetectRepeatMode();', { key: 'read-repeat' });
      if (value && value.ok) {
        this.vibeRepeatMode = value.mode;
        return value.mode;
      }
      if (this.vibeRepeatMode !== null) return this.vibeRepeatMode;
      return null;
    } catch (err) {
      log.error('getRepeatMode:', err);
      return null;
    }
  }
};
