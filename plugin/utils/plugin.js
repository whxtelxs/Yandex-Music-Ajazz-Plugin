const config = require('../config');
const performance = require('../lib/performance');
const { mergeGlobalSettings } = require('../lib/settings');
const debugLog = require('../lib/debug-log');
const now = new Date();

const appenders = {
    stdout: { type: 'stdout' }
};

if (config.LOG_TO_FILE) {
    appenders.file = {
        type: 'file',
        filename: `./log/${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}.log`
    };
}

const rawLog = require('log4js').configure({
    appenders,
    categories: {
        default: {
            appenders: config.LOG_TO_FILE ? ['file', 'stdout'] : ['stdout'],
            level: config.LOG_LEVEL
        }
    }
}).getLogger();

function resolveLogScope(skipFrames = 2) {
    const stack = new Error().stack.split('\n');
    for (let i = skipFrames; i < Math.min(stack.length, 8); i++) {
        const match = stack[i].match(/at (?:async )?(?:[\w$]+\.)?(\w+) \(/);
        if (!match) continue;
        const name = match[1];
        if (name === 'info' || name === 'error' || name === 'warn' || name === 'debug' || name === 'resolveLogScope') {
            continue;
        }
        return name;
    }
    return 'unknown';
}

const log = {
    info(...args) {
        if (debugLog.isEnabled()) debugLog.push('info', args);
        else rawLog.info(...args);
    },
    error(...args) {
        if (debugLog.isEnabled()) debugLog.push('error', [`[${resolveLogScope()}]`, ...args]);
        else rawLog.error(`[${resolveLogScope()}]`, ...args);
    },
    warn(...args) {
        if (debugLog.isEnabled()) debugLog.push('warn', [`[${resolveLogScope()}]`, ...args]);
        else rawLog.warn(`[${resolveLogScope()}]`, ...args);
    },
    debug(...args) {
        if (debugLog.isEnabled()) debugLog.push('debug', args);
        else rawLog.debug(...args);
    }
};

process.on('uncaughtException', (error) => {
    rawLog.error('[uncaughtException]', error);
});
process.on('unhandledRejection', (reason) => {
    rawLog.error('[unhandledRejection]', reason);
});

const ws = require('ws');
class Plugins {
    static language = JSON.parse(process.argv[9]).application.language;
    static globalSettings = {};
    getGlobalSettingsFlag = true;
    constructor() {
        if (Plugins.instance) {
            return Plugins.instance;
        }
        log.info('Инициализация плагина, порт:', process.argv[3]);
        this._messageHandlers = [];
        this.ws = new ws("ws://127.0.0.1:" + process.argv[3]);
        
        this.ws.on('open', () => {
            log.info('WebSocket соединение открыто');
            this.ws.send(JSON.stringify({ uuid: process.argv[5], event: process.argv[7] }));
        });
        
        this.ws.on('close', async () => {
            log.info('WebSocket соединение закрыто');
            try {
                await Promise.race([
                    Promise.resolve(this.onClose?.()),
                    new Promise(resolve => setTimeout(resolve, 1000))
                ]);
            } catch (error) {
                log.error('Ошибка при завершении плагина:', error);
            }
            process.exit();
        });
        
        this.ws.on('error', (error) => {
            log.error('WebSocket ошибка:', error);
        });
        
        this.ws.on('message', e => {
            try {
                if (this.getGlobalSettingsFlag) {
                    this.getGlobalSettingsFlag = false;
                    this.getGlobalSettings();
                }
                const data = JSON.parse(e.toString());
                log.debug('Получено сообщение от StreamDeck:', data.event);

                const action = data.action?.split('.').pop();
                const startedAt = Date.now();
                const actionResult = this[action]?.[data.event]?.(data);
                if (actionResult && typeof actionResult.then === 'function') {
                    const recordLatency = () => performance.record(`action.${data.event}`, Date.now() - startedAt);
                    Promise.resolve(actionResult).then(recordLatency, recordLatency);
                }
                if (data.event === 'didReceiveGlobalSettings') {
                    Plugins.globalSettings = data.payload.settings;
                }
                this[data.event]?.(data);
                this._messageHandlers.forEach(handler => handler(data));
            } catch (error) {
                log.error('Некорректное сообщение StreamDeck:', error);
            }
        });
        Plugins.instance = this;
    }

    onPluginMessage(handler) {
        this._messageHandlers.push(handler);
        return () => {
            const index = this._messageHandlers.indexOf(handler);
            if (index !== -1) this._messageHandlers.splice(index, 1);
        };
    }

    setGlobalSettings(payload) {
        const merged = mergeGlobalSettings(Plugins.globalSettings, payload);
        log.info('Установка глобальных настроек:', merged);
        Plugins.globalSettings = merged;
        this.ws.send(JSON.stringify({
            event: "setGlobalSettings",
            context: process.argv[5], payload: merged
        }));
        return merged;
    }

    getGlobalSettings() {
        log.info('Запрос глобальных настроек');
        this.ws.send(JSON.stringify({
            event: "getGlobalSettings",
            context: process.argv[5],
        }));
    }
    setTitle(context, str, row = 0, num = 6) {
        let newStr = '';
        if (row && str) {
            let nowRow = 1, strArr = str.split('');
            strArr.forEach((item, index) => {
                if (nowRow < row && index >= nowRow * num) { nowRow++; newStr += '\n'; }
                if (nowRow <= row && index < nowRow * num) { newStr += item; }
            });
            if (strArr.length > row * num) { newStr = newStr.substring(0, newStr.length - 1); newStr += '..'; }
        }
        this.ws.send(JSON.stringify({
            event: "setTitle",
            context, payload: {
                target: 0,
                title: newStr || str + ''
            }
        }));
    }
    setImage(context, url) {
        this.ws.send(JSON.stringify({
            event: "setImage",
            context, payload: {
                target: 0,
                image: url
            }
        }));
    }
    setState(context, state) {
        this.ws.send(JSON.stringify({
            event: "setState",
            context, payload: { state }
        }));
    }

    setSettings(context, payload) {
        log.info('Установка настроек для контекста:', context, payload);
        this.ws.send(JSON.stringify({
            event: "setSettings",
            context, payload
        }));
    }

    showAlert(context) {
        this.ws.send(JSON.stringify({
            event: "showAlert",
            context
        }));
    }

    showOk(context) {
        this.ws.send(JSON.stringify({
            event: "showOk",
            context
        }));
    }

    sendToPropertyInspector(payload, context, action) {
        log.info('Отправка в Property Inspector:', { payload, context, action });
        this.ws.send(JSON.stringify({
            action: action || Actions.currentAction,
            context: context || Actions.currentContext,
            payload, event: "sendToPropertyInspector"
        }));
    }

    openUrl(url) {
        this.ws.send(JSON.stringify({
            event: "openUrl",
            payload: { url }
        }));
    }
};

class Actions {
    constructor(data) {
        this.data = {};
        this.default = {};
        Object.assign(this, data);
    }

    static currentAction = null;
    static currentContext = null;
    static actions = {};
    propertyInspectorDidAppear(data) {
        log.info('Property Inspector появился:', data.action, data.context);
        Actions.currentAction = data.action;
        Actions.currentContext = data.context;
        this._propertyInspectorDidAppear?.(data);
    }

    willAppear(data) {
        log.info('Действие появилось:', data.action, data.context);
        Plugins.globalContext = data.context;
        Actions.actions[data.context] = data.action
        const { context, payload: { settings } } = data;
        this.data[context] = Object.assign({ ...this.default }, settings);
        this._willAppear?.(data);
    }

    didReceiveSettings(data) {
        log.info('Получены настройки для действия:', data.context);
        this.data[data.context] = data.payload.settings;
        this._didReceiveSettings?.(data);
    }

    willDisappear(data) {
        log.info('Действие исчезло:', data.context);
        this._willDisappear?.(data);
        delete this.data[data.context];
    }
}

module.exports = {
    log,
    Plugins,
    Actions
};