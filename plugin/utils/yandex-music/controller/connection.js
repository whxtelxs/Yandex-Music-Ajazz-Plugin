'use strict';

const CDP = require('chrome-remote-interface');
const { log } = require('../../plugin');

module.exports = {
  async setPort(newPort) {
    if (newPort === this.port) {
      log.info(`Порт не изменился (${newPort})`);
      return false;
    }

    log.info(`Изменение порта с ${this.port} на ${newPort}`);

    await this.disconnect();

    this.port = newPort;

    this.connected = false;
    this.connectionPromise = null;
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
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise(async (resolve, reject) => {
      try {
        if (this.client) {
          log.info('Используем существующее CDP соединение');
          this.connected = true;
          resolve(this.client);
          return;
        }

        log.info('Создание нового CDP соединения на порту', this.port);
        this.client = await CDP({ port: this.port });

        await Promise.all([
          this.client.Page.enable(),
          this.client.Runtime.enable()
        ]);

        await this._setupStateObserver(this.client);

        this.connected = true;
        this.reconnectAttempts = 0;

        this.client.on('disconnect', () => {
          log.error('CDP соединение разорвано, попытка переподключения');
          this.connected = false;
          this.client = null;
          this.connectionPromise = null;
          this.reconnect();
        });

        log.info('CDP соединение успешно установлено');
        resolve(this.client);
      } catch (err) {
        this.connected = false;
        this.client = null;
        this.connectionPromise = null;

        if (err.message.includes('connect ECONNREFUSED')) {
          log.error('Не удалось подключиться к приложению Яндекс Музыка на порту', this.port);
          log.error('Убедитесь, что приложение запущено с параметром --remote-debugging-port=' + this.port);
        } else {
          log.error('Ошибка при создании CDP-клиента:', err);
        }

        reject(err);
      }
    });

    return this.connectionPromise;
  },

  async reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      log.error(`Превышено максимальное количество попыток переподключения (${this.maxReconnectAttempts})`);
      return;
    }

    this.reconnectAttempts++;
    log.info(`Попытка переподключения ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    setTimeout(async () => {
      try {
        await this.connect();
        log.info('Переподключение успешно выполнено');
      } catch (err) {
        log.error('Ошибка при переподключении:', err);
        this.reconnect();
      }
    }, this.reconnectDelay * this.reconnectAttempts);
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

  async disconnect() {
    if (this.client) {
      try {
        await this.client.close();
        log.info('CDP соединение закрыто');
      } catch (err) {
        log.error('Ошибка при закрытии CDP соединения:', err);
      } finally {
        this.client = null;
        this.connected = false;
        this.connectionPromise = null;
        this._observerSetup = false;
        this.remoteState = null;
      }
    }
  }
};
