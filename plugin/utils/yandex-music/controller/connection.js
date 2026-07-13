'use strict';

const CDP = require('chrome-remote-interface');
const { log } = require('../../plugin');

module.exports = {
  async setPort(newPort) {
    if (newPort === this.port) {
      log.info(`Порт не изменился (${newPort})`);
      return !!(await this.getClient());
    }

    log.info(`Изменение порта с ${this.port} на ${newPort}`);

    await this.disconnect({ reconnect: false });
    this.port = newPort;
    this.reconnectAttempts = 0;

    try {
      await this.connect();
      log.info(`Успешное подключение к новому порту ${newPort}`);
      return true;
    } catch (err) {
      log.error(`Ошибка при подключении к новому порту ${newPort}:`, err);
      return false;
    }
  },

  async connect() {
    if (this.client && this.connected) return this.client;
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    const generation = ++this._clientGeneration;
    this._manualDisconnect = false;
    this.connectionPromise = (async () => {
      try {
        log.info('Создание нового CDP соединения на порту', this.port);
        const targets = await CDP.List({ port: this.port });
        const pages = targets.filter(target => target.type === 'page');
        const target = pages.find(item => /(^|\/\/)(music\.)?yandex\./i.test(item.url || ''))
          || pages.find(item => /yandex.*music|music.*yandex/i.test(`${item.title || ''} ${item.url || ''}`))
          || pages[0];
        if (!target) throw new Error('Не найден page target Яндекс Музыки');

        const client = await CDP({ port: this.port, target: target.id });
        if (generation !== this._clientGeneration) {
          await client.close();
          throw new Error('Устаревшая попытка CDP подключения отменена');
        }
        this.client = client;

        await Promise.all([
          client.Page.enable(),
          client.Runtime.enable()
        ]);

        await this._setupStateObserver(client);

        this.connected = true;
        this.reconnectAttempts = 0;
        this.onConnectionChange?.(true);

        client.on('disconnect', () => {
          if (generation !== this._clientGeneration || this._manualDisconnect) return;
          log.error('CDP соединение разорвано, попытка переподключения');
          this.connected = false;
          this.onConnectionChange?.(false);
          this.client = null;
          this.connectionPromise = null;
          this._observerSetup = false;
          this.remoteState = null;
          this.vibeShuffleState = null;
          this.vibeRepeatMode = null;
          this.reconnect();
        });

        log.info('CDP соединение успешно установлено');
        if (typeof this.onConnected === 'function') {
          Promise.resolve(this.onConnected()).catch(err => log.error('Ошибка полной синхронизации:', err));
        }
        return client;
      } catch (err) {
        if (generation === this._clientGeneration) {
          this.connected = false;
          this.client = null;
          this.onConnectionChange?.(false);
        }

        if (err.message.includes('connect ECONNREFUSED')) {
          log.error('Не удалось подключиться к приложению Яндекс Музыка на порту', this.port);
          log.error('Убедитесь, что приложение запущено с параметром --remote-debugging-port=' + this.port);
        } else {
          log.error('Ошибка при создании CDP-клиента:', err);
        }

        throw err;
      } finally {
        if (generation === this._clientGeneration) this.connectionPromise = null;
      }
    })();

    return this.connectionPromise;
  },

  requestReconnect() {
    this._manualDisconnect = false;
    this.reconnect();
  },

  async reconnect() {
    if (this._manualDisconnect || this._reconnectTimer || this.connected) return;
    this.reconnectAttempts++;
    const delay = Math.min(30000, this.reconnectDelay * (2 ** Math.min(this.reconnectAttempts - 1, 5)));
    log.info(`Попытка переподключения ${this.reconnectAttempts}, задержка ${delay} мс`);
    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      try {
        await this.connect();
        log.info('Переподключение успешно выполнено');
      } catch (err) {
        log.error('Ошибка при переподключении:', err);
        this.reconnect();
      }
    }, delay);
  },

  async getClient() {
    try {
      return await this.connect();
    } catch (err) {
      log.error('Не удалось получить CDP клиент:', err);
      return null;
    }
  },

  async checkConnection() {
    try {
      const client = await this.getClient();
      return !!client;
    } catch (err) {
      log.error('Ошибка при проверке соединения с Яндекс Музыкой:', err);
      return false;
    }
  },

  shouldPreserveUiOnDisconnect() {
    return !!this._manualDisconnect || !!this.isWarmingUp?.();
  },

  async disconnect({ reconnect = false } = {}) {
    this._manualDisconnect = !reconnect;
    this._clientGeneration++;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    this._domQueue.clear(new Error('CDP connection changed'));
    const client = this.client;
    this.client = null;
    this.connected = false;
    this.onConnectionChange?.(false);
    this.connectionPromise = null;
    this._observerSetup = false;
    this.remoteState = null;
    this.vibeShuffleState = null;
    this.vibeRepeatMode = null;
    if (client) {
      try {
        await client.close();
        log.info('CDP соединение закрыто');
      } catch (err) {
        log.error('Ошибка при закрытии CDP соединения:', err);
      }
    }
  }
};
