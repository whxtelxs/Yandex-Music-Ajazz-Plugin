'use strict';

const { log } = require('../../plugin');
const { YM_DOM_HELPERS } = require('../dom');

module.exports = {
  async _evaluateDom(body) {
    const client = await this.getClient();
    if (!client) return null;
    const { Runtime } = client;
    const result = await Runtime.evaluate({
      expression: `(function() { ${YM_DOM_HELPERS} ${body} })()`,
      awaitPromise: true,
      returnByValue: true
    });
    return result.result?.value ?? null;
  },

  async _runDomAction(helperCall, actionDescription) {
    try {
      log.info(`Выполнение действия: ${actionDescription}`);
      const value = await this._evaluateDom(`return ${helperCall};`);
      if (value && value.success) {
        log.info(`${actionDescription} выполнено успешно${value.message ? ` (${value.message})` : ''}`);
        return true;
      }
      log.error(`Не удалось выполнить действие: ${actionDescription}`, value?.message);
      if (value?.error) log.error('Детали ошибки:', value.error);
      return false;
    } catch (err) {
      log.error('Ошибка при выполнении скрипта:', err);
      return false;
    }
  },

  async _setupStateObserver(client) {
    if (this._observerSetup) return;

    client.on('Runtime.bindingCalled', (params) => {
      if (params.name !== 'ymAjazzNotify') return;
      try {
        this.remoteState = JSON.parse(params.payload);
        this.remoteStateUpdatedAt = Date.now();
        if (this.remoteState.shuffleOn !== undefined && this.remoteState.shuffleOn !== null) {
          this.vibeShuffleState = !!this.remoteState.shuffleOn;
        }
        if (this.remoteState.repeatMode !== undefined && this.remoteState.repeatMode !== null) {
          this.vibeRepeatMode = this.remoteState.repeatMode;
        }
        if (typeof this.onRemoteStateChange === 'function') {
          this.onRemoteStateChange(this.remoteState);
        }
      } catch (err) {
        log.error('Ошибка обработки ymAjazzNotify:', err);
      }
    });

    await client.Runtime.addBinding({ name: 'ymAjazzNotify' });

    const script = `(function() {
      ${YM_DOM_HELPERS}
      ymInstallAjazzObserver();
    })();`;

    await client.Page.addScriptToEvaluateOnNewDocument({ source: script });
    await client.Runtime.evaluate({ expression: script, returnByValue: false });
    this._observerSetup = true;
    log.info('Наблюдатель состояния Yandex Music установлен');
  },

  getRemoteState() {
    return this.remoteState;
  },

  async refreshRemoteState() {
    const value = await this._evaluateDom('return window.__YM_AJAZZ_STATE || null;');
    if (value) {
      this.remoteState = value;
      this.remoteStateUpdatedAt = Date.now();
      if (typeof this.onRemoteStateChange === 'function') {
        this.onRemoteStateChange(value);
      }
    }
    return value;
  }
};
