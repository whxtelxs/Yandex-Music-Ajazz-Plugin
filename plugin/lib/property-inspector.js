'use strict';

const { log, Actions } = require('../utils/plugin');
const { deps } = require('./deps');

const PI_COMMANDS = {
    checkConnection(_message, context, action) {
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
        deps.launcher?.setDebugPort(newPort);

        deps.yandexMusic.setPort(newPort).then(success => {
            log.info(`Результат изменения порта: ${success ? 'успешно' : 'ошибка'}`);
            deps.plugin.sendToPropertyInspector({
                command: 'portChanged',
                port: newPort,
                success
            }, context, action);
        });
    },
    getSettingsPanelInfo(_message, context, action) {
        const info = deps.settingsServer?.getInfo() || { available: false, port: null };
        deps.plugin.sendToPropertyInspector({
            command: 'settingsPanelInfo',
            available: info.available,
            port: info.port
        }, context, action);
    },
    openSettingsPanel(_message, context, action) {
        const opened = deps.settingsServer?.open() || false;
        deps.plugin.sendToPropertyInspector({
            command: 'settingsPanelInfo',
            available: opened,
            port: deps.settingsServer?.port || null
        }, context, action);
    }
};

function handlePropertyInspectorMessage(message) {
    const { command } = message.payload;
    const handler = PI_COMMANDS[command];
    if (!handler) return;

    log.info('Выполняем команду Property Inspector:', command, message.payload);

    handler(message, message.context, message.action);
}

function registerPropertyInspector(plugin) {
    plugin.onPluginMessage((message) => {
        try {
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
