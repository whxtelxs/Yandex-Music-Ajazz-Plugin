'use strict';

const { log } = require('../../../lib/logger');
const { YM_DOM_HELPERS } = require('../dom');
const { withTimeout } = require('../../../lib/async-utils');

module.exports = {
  async _evaluateDom(body, options = {}) {
    const generation = this._clientGeneration;
    return this._domQueue.enqueue(async signal => {
      if (generation !== this._clientGeneration && this.connected) return null;
      const client = await this.getClient();
      if (!client || signal.aborted) return null;
      const currentGeneration = this._clientGeneration;
      try {
        const result = await withTimeout(() => client.Runtime.evaluate({
          expression: '(async function() { ' + body + ' })()',
          awaitPromise: true,
          returnByValue: true,
          timeout: 5000
        }), 6000, 'CDP command timed out', signal);
        if (signal.aborted || currentGeneration !== this._clientGeneration || client !== this.client) return null;
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'DOM evaluation failed');
        return result.result?.value ?? null;
      } catch (error) {
        if ((error.code === 'ETIMEDOUT' || signal.aborted) && client === this.client) {
          this.disconnect({ reconnect: true }).catch(cleanupError => log.debug('CDP cleanup:', cleanupError));
        }
        throw error;
      }
    }, { priority: options.priority || 'background', key: options.key || null,
      signal: options.signal, timeoutMs: options.timeoutMs || 15000 });
  },

  async _runDomAction(helperCall, actionDescription, options = {}) {
    try {
      log.info(`Выполнение действия: ${actionDescription}`);
      const value = await this._evaluateDom(`return ${helperCall};`, { priority: 'user', signal: options.signal });
      if (value && value.success) {
        log.info(`${actionDescription} команда принята${value.message ? ` (${value.message})` : ''}`);
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
    const generation = this._clientGeneration;

    client.on('Runtime.bindingCalled', (params) => {
      if (params.name !== 'ymAjazzNotify' || generation !== this._clientGeneration || client !== this.client) return;
      try {
        this.remoteState = JSON.parse(params.payload);
        this.remoteStateUpdatedAt = Date.now();
        this.playerReady = this.remoteState.playerReady === true;
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

    const script = `
      ${YM_DOM_HELPERS}
      window.__YM_AJAZZ_HELPERS_READY__ = true;
      if (document.documentElement) {
        ymInstallAjazzObserver();
      } else {
        document.addEventListener('DOMContentLoaded', ymInstallAjazzObserver, { once: true });
      }
    `;

    const installed = await client.Page.addScriptToEvaluateOnNewDocument({ source: script });
    this._observerScriptId = installed.identifier;
    const result = await client.Runtime.evaluate({ expression: script, returnByValue: false });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Не удалось установить DOM runtime');
    }
    if (generation !== this._clientGeneration || client !== this.client) throw new Error('Observer installation cancelled');
    this._observerSetup = true;
    log.info('Наблюдатель состояния Yandex Music установлен');
  },

  getRemoteState() {
    return this.remoteState;
  },

  async refreshRemoteState() {
    const value = await this._evaluateDom('return window.__YM_AJAZZ_STATE || null;', {
      priority: 'sync',
      key: 'remote-state'
    });
    if (value) {
      this.remoteState = value;
      this.remoteStateUpdatedAt = Date.now();
      this.playerReady = value.playerReady === true;
      if (typeof this.onRemoteStateChange === 'function') {
        this.onRemoteStateChange(value);
      }
    }
    return value;
  }
};
