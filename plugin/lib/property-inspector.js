'use strict';

const { log, Actions } = require('../utils/plugin');
const { deps } = require('./deps');

const PI_COMMANDS = {
    checkConnection(context, action) {
        deps.yandexMusic.checkConnection().then(isConnected => {
            log.info('Результат проверки соединения:', isConnected ? 'подключено' : 'не подключено');
            deps.plugin.sendToPropertyInspector({
                command: 'connectionStatus',
                status: isConnected ? 'connected' : 'disconnected'
            }, context, action);
        });
    },
    changePort(message, context, action) {
        if (!message.payload.port) return;

        const newPort = parseInt(message.payload.port, 10);
        if (Number.isNaN(newPort) || newPort < 1 || newPort > 65535) {
            log.error('Некорректный порт:', message.payload.port);
            return;
        }

        log.info(`Изменение порта на ${newPort}`);
        deps.plugin.setGlobalSettings({ debugPort: newPort });

        deps.yandexMusic.setPort(newPort).then(success => {
            log.info(`Результат изменения порта: ${success ? 'успешно' : 'ошибка'}`);
            deps.plugin.sendToPropertyInspector({
                command: 'portChanged',
                port: newPort,
                success
            }, context, action);
        });
    },
    togglePlayback() {
        deps.yandexMusic.togglePlayback().then(result => {
            log.info('Результат переключения воспроизведения:', result);
        });
    },
    previousTrack() {
        deps.yandexMusic.previousTrack().then(result => {
            log.info('Результат перехода к предыдущему треку:', result);
        });
    },
    nextTrack() {
        deps.yandexMusic.nextTrack().then(result => {
            log.info('Результат перехода к следующему треку:', result);
        });
    },
    likeTrack() {
        deps.yandexMusic.likeTrack().then(result => {
            log.info('Результат установки лайка:', result);
        });
    },
    dislikeTrack() {
        deps.yandexMusic.dislikeTrack().then(result => {
            log.info('Результат установки дизлайка:', result);
        });
    },
    toggleMute() {
        deps.yandexMusic.toggleMute().then(result => {
            log.info('Результат переключения звука:', result);
        });
    },
    changeVolume(message) {
        if (typeof message.payload.delta === 'number') {
            deps.yandexMusic.changeVolume(message.payload.delta).then(result => {
                log.info('Результат изменения громкости:', result);
            });
        }
    },
    setVolume(message) {
        if (typeof message.payload.volume === 'number') {
            deps.yandexMusic.setVolume(message.payload.volume).then(result => {
                log.info('Результат установки громкости:', result);
            });
        }
    },
    seekRelative(message) {
        if (typeof message.payload.ticks === 'number') {
            deps.yandexMusic.seekRelative(message.payload.ticks).then(result => {
                log.info('Результат перемотки:', result);
            });
        }
    }
};

function handlePropertyInspectorMessage(message) {
    const { command } = message.payload;
    const handler = PI_COMMANDS[command];
    if (!handler) return;

    log.info('Выполняем команду Property Inspector:', command, message.payload);

    if (command === 'changePort' || command === 'changeVolume' || command === 'setVolume' || command === 'seekRelative') {
        handler(message, message.context, message.action);
    } else if (command === 'checkConnection') {
        handler(message.context, message.action);
    } else {
        handler();
    }
}

function registerPropertyInspector(plugin) {
    plugin.ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());
            log.info('Получено сообщение от StreamDeck:', message.event, message.action);

            if (message.event === 'sendToPlugin' && message.payload?.command) {
                log.info('Получена команда от Property Inspector:', message.payload.command, message.payload);
                handlePropertyInspectorMessage(message);
            }
        } catch (error) {
            log.error('Ошибка при обработке сообщения от Property Inspector:', error);
        }
    });

    plugin.sendToPropertyInspector = function (payload, context, action) {
        log.info('Отправка сообщения в Property Inspector:', payload);

        if (!action) {
            action = Actions.actions[context] || 'com.whxtelxs.streamdock.yandexmusicajazz.demo';
        }

        this.ws.send(JSON.stringify({
            action,
            context: context || Actions.currentContext,
            payload,
            event: 'sendToPropertyInspector'
        }));
    };
}

module.exports = { registerPropertyInspector };
