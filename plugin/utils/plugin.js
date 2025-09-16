const now = new Date();
const log = require('log4js').configure({
    appenders: {
        file: { type: 'file', filename: `./log/${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}.log` }
    },
    categories: {
        default: { appenders: ['file'], level: 'info' }
    }
}).getLogger();

process.on('uncaughtException', (error) => {
    log.error('Uncaught Exception:', error);
});
process.on('unhandledRejection', (reason) => {
    log.error('Unhandled Rejection:', reason);
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
        this.ws = new ws("ws://127.0.0.1:" + process.argv[3]);
        this.ws.on('open', () => this.ws.send(JSON.stringify({ uuid: process.argv[5], event: process.argv[7] })));
        this.ws.on('close', process.exit);
        this.ws.on('message', e => {
            if (this.getGlobalSettingsFlag) {
                this.getGlobalSettingsFlag = false;
                this.getGlobalSettings();
            }
            const data = JSON.parse(e.toString());
            const action = data.action?.split('.').pop();
            this[action]?.[data.event]?.(data);
            if (data.event === 'didReceiveGlobalSettings') {
                Plugins.globalSettings = data.payload.settings;
            }
            this[data.event]?.(data);
        });
        Plugins.instance = this;
    }

    setGlobalSettings(payload) {
        Plugins.globalSettings = payload;
        this.ws.send(JSON.stringify({
            event: "setGlobalSettings",
            context: process.argv[5], payload
        }));
    }

    getGlobalSettings() {
        this.ws.send(JSON.stringify({
            event: "getGlobalSettings",
            context: process.argv[5],
        }));
    }
    setTitle(context, str, row = 0, num = 6) {
        let newStr = null;
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
        Actions.currentAction = data.action;
        Actions.currentContext = data.context;
        this._propertyInspectorDidAppear?.(data);
    }

    willAppear(data) {
        Plugins.globalContext = data.context;
        Actions.actions[data.context] = data.action
        const { context, payload: { settings } } = data;
        this.data[context] = Object.assign({ ...this.default }, settings);
        this._willAppear?.(data);
    }

    didReceiveSettings(data) {
        this.data[data.context] = data.payload.settings;
        this._didReceiveSettings?.(data);
    }

    willDisappear(data) {
        this._willDisappear?.(data);
        delete this.data[data.context];
    }
}

class EventEmitter {
    constructor() {
        this.events = {};
    }


    subscribe(event, listener) {
        if (!this.events[event]) {
            this.events[event] = [];
        }
        this.events[event].push(listener);
    }


    unsubscribe(event, listenerToRemove) {
        if (!this.events[event]) return;

        this.events[event] = this.events[event].filter(listener => listener !== listenerToRemove);
    }


    emit(event, data) {
        if (!this.events[event]) return;
        this.events[event].forEach(listener => listener(data));
    }
}

module.exports = {
    log,
    Plugins,
    Actions,
    EventEmitter
};