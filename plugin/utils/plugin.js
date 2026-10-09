'use strict';

const ws = require('ws');
const { log } = require('../lib/logger');
const performance = require('../lib/performance');
const { mergeGlobalSettings, settingEquals } = require('../lib/settings');
const { parseRuntimeOptions } = require('../lib/runtime-options');
const { clearDisplayCache } = require('../lib/display');
class Plugins {
    static language = 'ru';
    static globalSettings = {};
    getGlobalSettingsFlag = true;
    constructor(options = parseRuntimeOptions(process.argv)) {
        this.options = options;
        Plugins.language = options.language;
        this._messageHandlers = [];
        this._settingsWaiters = new Set();
        this._pendingSettings = {};
        this._confirmedSettings = {};
        this.ws = new ws('ws://127.0.0.1:' + options.port);
        this.ws.on('open', () => {
            this._send({ uuid: options.uuid, event: options.event });
            this.getGlobalSettings();
        });
        this.ws.on('close', () => {
            for (const waiter of this._settingsWaiters) waiter.reject(new Error('StreamDock отключён'));
            this._settingsWaiters.clear();
            Promise.resolve(this.onClose?.()).catch(error => log.error('Ошибка завершения:', error));
        });
        this.ws.on('error', error => log.error('StreamDock WebSocket:', error));
        this.ws.on('message', raw => {
            this._dispatch(raw).catch(error => log.error('Ошибка события StreamDock:', error));
        });
    }

    async _dispatch(raw) {
        const data = JSON.parse(raw.toString());
        if (!data || typeof data.event !== 'string') throw new Error('Некорректное событие StreamDock');
        if (data.event === 'didReceiveGlobalSettings') {
            const received = data.payload?.settings || {};
            this._confirmedSettings = { ...received };
            data.payload ||= {};
            for (const waiter of [...this._settingsWaiters]) {
                if (Object.entries(waiter.patch).every(([key, value]) => settingEquals(received[key], value))) {
                    this._settingsWaiters.delete(waiter);
                    waiter.resolve(received);
                }
            }
            for (const [key, value] of Object.entries(this._pendingSettings)) {
                if (settingEquals(received[key], value)) delete this._pendingSettings[key];
            }
            Plugins.globalSettings = mergeGlobalSettings(received, this._pendingSettings);
            data.payload.settings = Plugins.globalSettings;
        }
        const action = data.action?.split('.').pop();
        const startedAt = Date.now();
        const jobs = [];
        if (action && typeof this[action]?.[data.event] === 'function') {
            jobs.push(Promise.resolve().then(() => this[action][data.event](data)));
        }
        const events = new Set(['didReceiveGlobalSettings', 'deviceDidConnect', 'deviceDidDisconnect', 'systemDidWakeUp']);
        if (events.has(data.event) && typeof this[data.event] === 'function') {
            jobs.push(Promise.resolve().then(() => this[data.event](data)));
        }
        for (const handler of this._messageHandlers) jobs.push(Promise.resolve().then(() => handler(data)));
        const results = await Promise.allSettled(jobs);
        performance.record('action.' + data.event, Date.now() - startedAt);
        for (const result of results) {
            if (result.status === 'rejected') log.error('Ошибка обработчика ' + data.event + ':', result.reason);
        }
    }

    _send(message) {
        if (this.ws.readyState !== ws.OPEN) throw new Error('StreamDock не подключён');
        this.ws.send(JSON.stringify(message));
    }

    async saveGlobalSettings(patch, timeoutMs = 5000) {
        let timer;
        let waiter;
        const confirmation = new Promise((resolve, reject) => {
            waiter = { patch, resolve, reject };
            this._settingsWaiters.add(waiter);
            timer = setTimeout(() => reject(new Error('StreamDock не подтвердил сохранение настроек')), timeoutMs);
            try {
                this.setGlobalSettings(patch);
                this.getGlobalSettings();
            } catch (error) {
                reject(error);
            }
        });
        try {
            await confirmation;
            return Plugins.globalSettings;
        } catch (error) {
            for (const [key, value] of Object.entries(patch)) {
                if (this._pendingSettings[key] === value) delete this._pendingSettings[key];
            }
            Plugins.globalSettings = mergeGlobalSettings(this._confirmedSettings, this._pendingSettings);
            throw error;
        } finally {
            clearTimeout(timer);
            this._settingsWaiters.delete(waiter);
        }
    }

    onPluginMessage(handler) {
        this._messageHandlers.push(handler);
        return () => {
            const index = this._messageHandlers.indexOf(handler);
            if (index !== -1) this._messageHandlers.splice(index, 1);
        };
    }

    async disposeActions() {
        const jobs = [];
        for (const [context, action] of Object.entries(Actions.actions)) {
            const handler = this[action.split('.').pop()];
            if (handler) jobs.push(Promise.resolve().then(() => handler.willDisappear({ context, action })));
        }
        await Promise.allSettled(jobs);
    }

    setGlobalSettings(payload) {
        const merged = mergeGlobalSettings(Plugins.globalSettings, payload);
        log.info('Установка глобальных настроек:', merged);
        this._send({
            event: "setGlobalSettings",
            context: this.options.uuid, payload: merged
        });
        this._pendingSettings = { ...this._pendingSettings, ...payload };
        Plugins.globalSettings = merged;
        return merged;
    }

    getGlobalSettings() {
        log.info('Запрос глобальных настроек');
        this._send({
            event: "getGlobalSettings",
            context: this.options.uuid,
        });
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
        this._send({
            event: "setTitle",
            context, payload: {
                target: 0,
                title: newStr || str + ''
            }
        });
    }
    setImage(context, url) {
        this._send({
            event: "setImage",
            context, payload: {
                target: 0,
                image: url
            }
        });
    }
    setState(context, state) {
        this._send({
            event: "setState",
            context, payload: { state }
        });
    }

    setSettings(context, payload) {
        log.info('Установка настроек для контекста:', context, payload);
        this._send({
            event: "setSettings",
            context, payload
        });
    }

    showAlert(context) {
        this._send({
            event: "showAlert",
            context
        });
    }

    showOk(context) {
        this._send({
            event: "showOk",
            context
        });
    }

    sendToPropertyInspector(payload, context, action) {
        log.info('Отправка в Property Inspector:', { payload, context, action });
        this._send({
            action: action || Actions.currentAction,
            context: context || Actions.currentContext,
            payload, event: "sendToPropertyInspector"
        });
    }

    openUrl(url) {
        this._send({
            event: "openUrl",
            payload: { url }
        });
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
        return this._propertyInspectorDidAppear?.(data);
    }

    willAppear(data) {
        log.info('Действие появилось:', data.action, data.context);
        Plugins.globalContext = data.context;
        Actions.actions[data.context] = data.action
        const { context, payload: { settings } } = data;
        this.data[context] = Object.assign({ ...this.default }, settings);
        return this._willAppear?.(data);
    }

    didReceiveSettings(data) {
        log.info('Получены настройки для действия:', data.context);
        this.data[data.context] = data.payload.settings;
        return this._didReceiveSettings?.(data);
    }

    willDisappear(data) {
        log.info('Действие исчезло:', data.context);
        const result = this._willDisappear?.(data);
        delete this.data[data.context];
        delete Actions.actions[data.context];
        clearDisplayCache(data.context);
        if (Actions.currentContext === data.context) {
            Actions.currentContext = null;
            Actions.currentAction = null;
        }
        return result;
    }
}

module.exports = {
    log,
    Plugins,
    Actions
};