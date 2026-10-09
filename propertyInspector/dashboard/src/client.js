'use strict';

const overlay = require('../../now-playing/config');
const panels = ['connection', 'volume', 'text', 'discord', 'nowplaying', 'debug', 'updates', 'github'];
const defaults = { debugPort: 9222, volumeStep: 5, trackInfoTextSize: 12, trackInfoFontSize: 14, timeTotalFontSize: 14, debugMode: false, discordRpcEnabled: false, nowPlaying: overlay.defaults, nowPlayingPresets: [] };
const limits = { debugPort: [1, 65535], volumeStep: [1, 99], trackInfoTextSize: [4, 24], trackInfoFontSize: [8, 28], timeTotalFontSize: [8, 28] };
const settingMessages = {
    debugPort: value => 'Порт отладки сохранён: ' + value,
    volumeStep: value => 'Шаг громкости сохранён: ' + value + '%',
    trackInfoTextSize: value => 'Длина строки сохранена: ' + value,
    trackInfoFontSize: value => 'Размер названия трека сохранён: ' + value + ' px',
    timeTotalFontSize: value => 'Размер времени трека сохранён: ' + value + ' px',
    discordRpcEnabled: value => value ? 'Показ трека в Discord включён' : 'Показ трека в Discord выключен',
    debugMode: value => value ? 'Режим отладки включён' : 'Режим отладки выключен',
    nowPlaying: () => 'Настройки виджета сохранены',
    nowPlayingPresets: () => 'Конфиги сохранены'
};

class PanelClient {
    constructor({ WebSocket, location, notify = () => {}, download = () => {}, setTimer = (fn, delay) => setTimeout(fn, delay), clearTimer = timer => clearTimeout(timer) }) {
        this.WebSocket = WebSocket;
        this.location = location;
        this.notify = notify;
        this.download = download;
        this.setTimer = setTimer;
        this.clearTimer = clearTimer;
        const panel = new URLSearchParams(location.search).get('panel');
        this.state = { phase: 'connecting', settingsLoaded: false, settings: { ...defaults }, panel: panels.includes(panel) ? panel : 'connection', connection: {}, discord: {}, updates: null, logs: [], busy: {}, saveStatus: 'idle', restartRequired: false };
        this.confirmed = { ...defaults };
        this.listeners = new Set();
        this.pending = new Map();
        this.requests = new Map();
        this.revision = 0;
        this.sequence = 0;
        this.socket = null;
        this.retries = 0;
        this.saveTimer = null;
        this.retryTimer = null;
        this.saving = false;
        this.stopped = false;
    }

    getSnapshot = () => this.state;
    subscribe = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener); };

    update(patch) {
        this.state = { ...this.state, ...patch };
        for (const listener of this.listeners) listener();
    }

    showPanel(panel) { if (panels.includes(panel)) this.update({ panel }); }

    applySettings(settings, revision = this.revision) {
        if (revision < this.revision) return;
        this.revision = revision;
        this.confirmed = { ...this.confirmed, ...settings };
        const next = { ...this.state.settings, ...settings };
        for (const [key, entry] of this.pending) next[key] = entry.value;
        this.update({ settings: next });
    }

    setSetting(key, value, commit = true, message = null) {
        if (this.state.phase !== 'connected' || !(key in defaults)) return;
        if (key === 'nowPlaying') value = overlay.sanitize(value);
        else if (key === 'nowPlayingPresets') value = overlay.sanitizePresets(value);
        else if (limits[key]) {
            if (!Number.isFinite(value)) return;
            value = Math.max(limits[key][0], Math.min(limits[key][1], Math.round(value)));
        } else value = !!value;
        if (!this.pending.has(key) && JSON.stringify(value) === JSON.stringify(this.confirmed[key])) return;
        this.pending.set(key, { value, sequence: ++this.sequence, message, committed: commit });
        this.update({ settings: { ...this.state.settings, [key]: value }, saveStatus: 'dirty' });
        if (commit) this.scheduleSave();
    }

    scheduleSave() {
        this.clearTimer(this.saveTimer);
        this.saveTimer = this.setTimer(() => { this.saveTimer = null; this.flushSettings(); }, 300);
    }

    async flushSettings() {
        if (this.saving || this.state.phase !== 'connected' || !this.pending.size) return;
        this.saving = true;
        this.update({ saveStatus: 'saving' });
        const saved = new Map();
        let warning = null;
        try {
            while (this.pending.size && this.state.phase === 'connected') {
                const batch = new Map([...this.pending].filter(([, entry]) => entry.committed));
                if (!batch.size) break;
                const settings = Object.fromEntries([...batch].map(([key, entry]) => [key, entry.value]));
                try {
                    const result = await this.request({ type: 'updateSettings', settings });
                    for (const [key, entry] of batch) if (this.pending.get(key) === entry) {
                        this.pending.delete(key);
                        if (result.persisted && !(result.revision < this.revision)) saved.set(key, entry);
                    }
                    this.applySettings(result.revision < this.revision ? this.confirmed : result.settings || this.confirmed);
                    if (result.discordStatus && !(result.revision < this.revision)) this.update({ discord: result.discordStatus });
                    if (!result.persisted) this.notify('error', 'Применено, но сохранение не подтверждено');
                    if (result.applied === false) warning = result.message || 'Настройки сохранены. Музыка пока не подключена';
                } catch (error) {
                    if (this.state.phase !== 'connected') break;
                    let current = false;
                    for (const [key, entry] of batch) {
                        if (this.pending.get(key) !== entry) continue;
                        this.pending.delete(key);
                        current = true;
                    }
                    this.applySettings(error.revision < this.revision ? this.confirmed : error.settings || this.confirmed);
                    if (current) {
                        this.notify('error', error.message);
                        this.update({ saveStatus: 'error' });
                        return;
                    }
                }
            }
            this.update({ saveStatus: this.pending.size ? 'dirty' : 'saved' });
            if (!this.pending.size && this.state.phase === 'connected' && saved.size) {
                const [key, entry] = [...saved].at(-1);
                if (saved.get('discordRpcEnabled')?.value) {
                    const discord = this.state.discord;
                    if (discord.status === 'error') this.notify('error', discord.message || 'Discord не подключён. Запустите приложение');
                    else if (discord.status === 'connected') this.notify('success', 'Discord подключён');
                    else this.notify('info', discord.message || 'Настройка сохранена. Ожидаем подключения к Discord');
                } else this.notify(warning ? 'warning' : 'success', warning || entry.message || (saved.size === 1 ? settingMessages[key](entry.value) : 'Настройки сохранены'));
            }
        } finally {
            this.saving = false;
            if ([...this.pending.values()].some(entry => entry.committed) && this.state.phase === 'connected') this.scheduleSave();
        }
    }

    request(message, timeout = 25000) {
        if (this.socket?.readyState !== this.WebSocket.OPEN) return Promise.reject(new Error('Соединение с плагином прервано'));
        const requestId = String(++this.sequence);
        return new Promise((resolve, reject) => {
            const timer = this.setTimer(() => {
                this.requests.delete(requestId);
                reject(new Error('Время ожидания истекло. Повторите действие'));
            }, timeout);
            this.requests.set(requestId, { resolve, reject, timer });
            try { this.socket.send(JSON.stringify({ ...message, requestId, revision: this.revision })); }
            catch (error) { this.clearTimer(timer); this.requests.delete(requestId); reject(error); }
        });
    }

    async command(type, payload = {}) {
        if (this.state.phase !== 'connected' || this.state.busy[type]) return;
        this.update({ busy: { ...this.state.busy, [type]: true } });
        try {
            const result = await this.request({ type, ...payload }, type === 'launchApp' ? 45000 : 25000);
            switch (type) {
                case 'launchApp':
                    this.notify('success', result.message || (payload.restart ? 'Яндекс Музыка перезапущена' : 'Яндекс Музыка запущена'));
                    break;
                case 'checkConnection':
                    this.notify(result.connected ? 'success' : 'warning', result.connected ? 'Соединение с Яндекс Музыкой установлено' : 'Яндекс Музыка не подключена. Проверьте запуск с портом отладки');
                    break;
                case 'clearDebugLog':
                    this.update({ logs: [] });
                    this.notify('success', 'Логи очищены');
                    break;
                case 'getDiagnostics':
                    this.notify('success', 'Диагностика подготовлена');
                    break;
                case 'checkUpdates':
                    if (result.status === 'error' || result.error) this.notify('error', result.error || 'Не удалось проверить обновления');
                    else this.notify(result.hasUpdate ? 'info' : 'success', result.hasUpdate ? 'Доступна версия ' + result.latestVersion : 'Установлена последняя версия');
                    break;
            }
        } catch (error) {
            if (type === 'launchApp') this.update({ restartRequired: !!error.restartRequired });
            this.notify('error', error.message);
        } finally {
            const busy = { ...this.state.busy };
            delete busy[type];
            this.update({ busy });
        }
    }

    receive(raw) {
        let message;
        try { message = JSON.parse(raw); } catch { return; }
        if (!message || typeof message.type !== 'string') return;
        const revision = Number.isInteger(message.revision) ? message.revision : this.revision;
        if (message.type === 'settings' && revision < this.revision) return;
        this.revision = Math.max(this.revision, revision);
        const pending = this.requests.get(message.requestId);
        if (pending) {
            this.clearTimer(pending.timer);
            this.requests.delete(message.requestId);
            if (message.ok === false) {
                const error = new Error(message.error || 'Команда не выполнена');
                Object.assign(error, { settings: message.settings, revision, restartRequired: message.restartRequired });
                pending.reject(error);
                return;
            }
            pending.resolve(message);
        }
        switch (message.type) {
            case 'hello':
                this.revision = revision;
                this.retries = 0;
                this.update({ phase: 'connected', settingsLoaded: true, connection: message.connection || {}, discord: message.discordStatus || {}, updates: message.updateInfo || null, logs: (message.debugLogs || []).slice(-400) });
                this.applySettings(message.settings || {}, revision);
                if (this.pending.size) this.scheduleSave();
                break;
            case 'showPanel': this.showPanel(message.panel); break;
            case 'settings': this.applySettings(message.settings || {}, revision); break;
            case 'connectionStatus': this.update({ connection: { ...message.connection, connected: message.connected, stage: message.stage || message.connection?.stage } }); break;
            case 'activePort':
                if (message.adjusted && message.activePort) this.applySettings({ debugPort: message.activePort }, revision);
                this.update({ connection: { ...this.state.connection, activePort: message.activePort, portMismatch: message.activePort !== this.state.settings.debugPort } });
                break;
            case 'launchResult':
                this.update({ connection: message.connection || { connected: message.connected, activePort: message.port }, restartRequired: false });
                if (message.port) this.applySettings({ debugPort: message.port }, revision);
                break;
            case 'discordStatus': this.update({ discord: message }); break;
            case 'updateInfo': this.update({ updates: message }); break;
            case 'debugLog': if (message.entry) this.update({ logs: [...this.state.logs, message.entry].slice(-400) }); break;
            case 'debugLogClear': this.update({ logs: [] }); break;
            case 'diagnostics': this.download(message.report); break;
            case 'commandError': this.notify('error', message.error || 'Команда не выполнена'); break;
            case 'shutdown': this.stop(); break;
        }
    }

    rejectRequests() {
        for (const request of this.requests.values()) {
            this.clearTimer(request.timer);
            request.reject(new Error('Соединение с плагином прервано'));
        }
        this.requests.clear();
    }

    connect() {
        if (this.stopped) return;
        this.clearTimer(this.retryTimer);
        const protocol = this.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new this.WebSocket(protocol + '//' + this.location.host + '/ws');
        this.socket = socket;
        socket.addEventListener('message', event => { if (this.socket === socket && !this.stopped) this.receive(event.data); });
        socket.addEventListener('error', () => socket.close());
        socket.addEventListener('close', () => {
            if (this.socket !== socket || this.stopped) return;
            this.socket = null;
            this.update({ phase: ++this.retries > 5 ? 'ended' : 'reconnecting', busy: {} });
            this.rejectRequests();
            if (this.state.phase === 'ended') { this.stopped = true; return; }
            this.retryTimer = this.setTimer(() => this.connect(), Math.min(5000, 500 * 2 ** this.retries));
        });
    }

    stop() {
        this.stopped = true;
        this.clearTimer(this.retryTimer);
        this.clearTimer(this.saveTimer);
        this.update({ phase: 'ended', busy: {} });
        this.rejectRequests();
        this.socket?.close();
        this.socket = null;
    }
}

module.exports = { PanelClient, defaults, panels };
