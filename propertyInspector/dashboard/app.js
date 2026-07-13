'use strict';

const params = new URLSearchParams(window.location.search);
const token = params.get('token');
const panels = ['connection', 'volume', 'text', 'discord', 'debug', 'updates', 'github'];
const fields = {
    debugPort: { element: document.getElementById('debugPort'), min: 1, max: 65535 },
    volumeStep: { element: document.getElementById('volumeStep'), min: 1, max: 99 },
    trackInfoTextSize: { element: document.getElementById('trackInfoTextSize'), min: 4, max: 24 },
    trackInfoFontSize: { element: document.getElementById('trackInfoFontSize'), min: 8, max: 28 },
    timeTotalFontSize: { element: document.getElementById('timeTotalFontSize'), min: 8, max: 28 }
};
const debugModeInput = document.getElementById('debugMode');
const discordRpcEnabledInput = document.getElementById('discordRpcEnabled');
const debugConsole = document.getElementById('debugConsole');
const MAX_LOG_LINES = 400;

let socket = null;
let toastTimer = null;
let sessionEnded = false;
let applyingServerSettings = false;
let activePanel = 'connection';
if (params.get('panel') && panels.includes(params.get('panel'))) {
    activePanel = params.get('panel');
}
let updateInfo = null;

function setStatusPill(id, type, text) {
    const element = document.getElementById(id);
    if (!element) return;
    const statusClass = {
        neutral: 'status-pill-neutral',
        pending: 'status-pill-pending',
        connected: 'status-pill-connected',
        error: 'status-pill-error'
    }[type] || 'status-pill-neutral';
    element.className = `status-pill ${statusClass}`;
    element.textContent = text;
    element.classList.toggle('is-hidden', !text);
    element.setAttribute('aria-hidden', text ? 'false' : 'true');
}

const TOAST_ICONS = {
    success: '<svg class="toast-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    error: '<svg class="toast-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><circle cx="12" cy="12" r="9"/></svg>'
};

function showToast(type, message) {
    const stack = document.getElementById('toastStack');
    if (!stack || !message) return;

    clearTimeout(toastTimer);
    stack.replaceChildren();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.setAttribute('role', 'status');
    toast.innerHTML = `<span class="toast-icon">${TOAST_ICONS[type] || TOAST_ICONS.error}</span><span class="toast-text">${message}</span>`;
    stack.appendChild(toast);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => toast.classList.add('toast-visible'));
    });

    toastTimer = setTimeout(() => {
        toast.classList.remove('toast-visible');
        toast.classList.add('toast-leaving');
        setTimeout(() => toast.remove(), 380);
    }, 3200);
}

function showDisconnectScreen() {
    if (sessionEnded) return;
    sessionEnded = true;

    clearTimeout(toastTimer);
    document.getElementById('toastStack')?.replaceChildren();

    if (socket) {
        socket.onclose = null;
        socket.onerror = null;
        socket.onmessage = null;
        socket.close();
        socket = null;
    }

    document.getElementById('appShell')?.classList.add('is-hidden');
    document.getElementById('disconnectScreen')?.classList.remove('is-hidden');
}

function clamp(value, min, max) {
    const number = parseInt(value, 10);
    return Math.max(min, Math.min(max, Number.isNaN(number) ? min : number));
}

function updateOutputs() {
    document.getElementById('volumeStepValue').textContent = `${fields.volumeStep.element.value}%`;
    document.getElementById('trackInfoTextSizeValue').textContent = fields.trackInfoTextSize.element.value;
    document.getElementById('trackInfoFontSizeValue').textContent = fields.trackInfoFontSize.element.value;
    document.getElementById('timeTotalFontSizeValue').textContent = fields.timeTotalFontSize.element.value;
}

function collectSettings() {
    return {
        ...Object.fromEntries(Object.entries(fields).map(([key, field]) => [
            key,
            clamp(field.element.value, field.min, field.max)
        ])),
        debugMode: !!debugModeInput?.checked,
        discordRpcEnabled: !!discordRpcEnabledInput?.checked
    };
}

function applySettings(settings) {
    applyingServerSettings = true;
    for (const [key, field] of Object.entries(fields)) {
        if (settings[key] !== undefined) field.element.value = clamp(settings[key], field.min, field.max);
    }
    if (debugModeInput && settings.debugMode !== undefined) {
        debugModeInput.checked = !!settings.debugMode;
    }
    if (discordRpcEnabledInput && settings.discordRpcEnabled !== undefined) {
        discordRpcEnabledInput.checked = !!settings.discordRpcEnabled;
    }
    updateOutputs();
    updateDebugConsoleState();
    applyingServerSettings = false;
}

function send(message) {
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
}

function saveSettings() {
    if (applyingServerSettings) return;
    updateOutputs();
    if (!send({ type: 'updateSettings', settings: collectSettings() })) {
        showToast('error', 'Не удалось сохранить изменения');
    }
}

function switchPanel(panelId) {
    if (!panels.includes(panelId)) return;
    activePanel = panelId;
    for (const id of panels) {
        document.getElementById(`panel-${id}`)?.classList.toggle('is-hidden', id !== panelId);
        document.getElementById(`panel-${id}`)?.classList.toggle('view-panel-active', id === panelId);
    }
    document.querySelectorAll('[data-panel]').forEach(button => {
        button.classList.toggle('nav-item-active', button.dataset.panel === panelId);
    });
}

function formatLogTime(iso) {
    try {
        return new Date(iso).toLocaleTimeString('ru-RU', { hour12: false });
    } catch {
        return '--:--:--';
    }
}

function trimDebugConsole() {
    if (!debugConsole) return;
    const lines = debugConsole.querySelectorAll('.debug-line');
    const overflow = lines.length - MAX_LOG_LINES;
    for (let i = 0; i < overflow; i++) lines[i]?.remove();
}

function appendDebugLine(entry) {
    if (!debugConsole || !entry) return;
    debugConsole.querySelector('.debug-empty')?.remove();
    const line = document.createElement('div');
    line.className = `debug-line debug-line-${entry.level || 'info'}`;
    line.innerHTML = `<span class="debug-time">${formatLogTime(entry.at)}</span><span class="debug-level">${entry.level}</span><span class="debug-text"></span>`;
    line.querySelector('.debug-text').textContent = entry.text || '';
    debugConsole.appendChild(line);
    trimDebugConsole();
    debugConsole.scrollTop = debugConsole.scrollHeight;
}

function renderDebugLogs(entries) {
    if (!debugConsole) return;
    debugConsole.replaceChildren();
    if (!entries?.length) {
        updateDebugConsoleState();
        return;
    }
    for (const entry of entries) appendDebugLine(entry);
}

function getDebugConsoleEmptyText() {
    if (debugModeInput?.checked) return 'Ожидание логов от плагина…';
    return 'Включите режим отладки, чтобы видеть логи';
}

function getLaunchResultText(message) {
    if (message.message) return message.message;
    if (message.adjusted) return `Запущено на порту ${message.port} (порт был изменён из-за конфликта)`;
    return 'Яндекс Музыка запущена';
}

function getSaveResultToast(message) {
    if (message.ok) return { type: 'success', text: 'Изменения сохранены' };
    return { type: 'error', text: message.error || 'Не удалось сохранить' };
}

function isMusicStatusConnected() {
    return document.getElementById('musicStatus')?.textContent === 'Подключено';
}

function connectionViewFromStatus(message) {
    return {
        connected: message.connected,
        debugPort: fields.debugPort.element.value,
        activePort: message.connection?.activePort ?? null,
        portMismatch: message.connection?.portMismatch ?? false
    };
}

function connectionViewFromActivePort(message) {
    return {
        connected: isMusicStatusConnected(),
        debugPort: fields.debugPort.element.value,
        activePort: message.activePort,
        portMismatch: message.activePort !== Number(fields.debugPort.element.value)
    };
}

function connectionViewFromLaunch(message) {
    if (message.connection) return message.connection;
    return {
        connected: message.connected,
        debugPort: fields.debugPort.element.value,
        activePort: message.port,
        portMismatch: false
    };
}

function setConnectionActionButtonsEnabled(enabled) {
    document.getElementById('checkConnectionBtn').disabled = !enabled;
    document.getElementById('launchAppBtn').disabled = !enabled;
}

function applyDebugPortValue(port) {
    if (!port) return;
    fields.debugPort.element.value = port;
    updateOutputs();
}

function updateDebugConsoleState() {
    if (!debugConsole) return;
    if (debugConsole.querySelector('.debug-line')) return;
    const empty = document.createElement('p');
    empty.className = 'debug-empty';
    empty.textContent = getDebugConsoleEmptyText();
    debugConsole.replaceChildren(empty);
}

function setUpdateControlsDisabled(disabled) {
    document.getElementById('checkUpdatesBtn')?.toggleAttribute('disabled', disabled);
    document.getElementById('openReleaseBtn')?.toggleAttribute('disabled', disabled);
}

const UPDATE_STATUS_VIEWS = {
    checking: {
        pill: ['pending', 'Проверка'],
        summary: 'Проверяем обновления…',
        controlsDisabled: true
    },
    error: {
        pill: ['error', 'Ошибка'],
        summary: info => info.error || 'Не удалось проверить обновления',
        controlsDisabled: false
    },
    available: {
        pill: ['connected', 'Доступно'],
        summary: info => (info.releaseName ? info.releaseName : `Доступна новая версия ${info.latestVersion}`),
        controlsDisabled: false,
        showLatest: true
    },
    upToDate: {
        pill: ['connected', 'Актуально'],
        summary: info => (info.checkedAt ? 'У вас установлена последняя версия' : 'Нажмите «Проверить обновления»'),
        controlsDisabled: false
    }
};

function resolveUpdateView(info) {
    if (info.status === 'checking') return UPDATE_STATUS_VIEWS.checking;
    if (info.status === 'error') return UPDATE_STATUS_VIEWS.error;
    if (info.hasUpdate) return UPDATE_STATUS_VIEWS.available;
    return UPDATE_STATUS_VIEWS.upToDate;
}

function renderUpdateInfo(info) {
    if (!info) return;
    updateInfo = info;

    const latestVersionRow = document.getElementById('latestVersionRow');
    const updateNotes = document.getElementById('updateNotes');
    const openReleaseBtn = document.getElementById('openReleaseBtn');
    const updateMessage = document.getElementById('updateMessage');
    const view = resolveUpdateView(info);

    document.getElementById('currentVersionValue').textContent = info.currentVersion || '—';
    updateMessage.textContent = info.error || '';

    openReleaseBtn?.classList.add('is-hidden');
    latestVersionRow?.classList.add('is-hidden');

    const [pillType, pillLabel] = view.pill;
    setStatusPill('updateStatusPill', pillType, pillLabel);
    document.getElementById('updateSummary').textContent = typeof view.summary === 'function'
        ? view.summary(info)
        : view.summary;
    setUpdateControlsDisabled(view.controlsDisabled);

    if (view.showLatest) {
        latestVersionRow?.classList.remove('is-hidden');
        document.getElementById('latestVersionValue').textContent = info.latestVersion || '—';
    }

    if (info.releaseNotes?.trim()) {
        updateNotes.textContent = info.releaseNotes.trim();
        updateNotes.classList.remove('is-hidden');
    } else {
        updateNotes.classList.add('is-hidden');
    }

    if (info.pageUrl && info.hasUpdate && info.status !== 'checking') {
        openReleaseBtn?.classList.remove('is-hidden');
    }
}

function renderDiscordStatus(payload) {
    if (!payload) return;
    const map = {
        disabled: ['neutral', 'Выключено'],
        waiting_music: ['pending', 'Ожидание'],
        connected: ['connected', 'Активно'],
        error: ['error', 'Ошибка']
    };
    const [type, label] = map[payload.status] || ['neutral', '—'];
    setStatusPill('discordStatusPill', type, label);
    const messageEl = document.getElementById('discordStatusMessage');
    if (messageEl) messageEl.textContent = payload.message || '';
}

function getMusicConnectionPill(connected) {
    if (connected) return ['connected', 'Подключено'];
    return ['error', 'Не подключено'];
}

function getActivePortHint(connection) {
    if (!connection.activePort || !connection.portMismatch) return '';
    return `Яндекс Музыка запущена на порту ${connection.activePort} (в настройках: ${connection.debugPort})`;
}

function renderConnectionInfo(connection) {
    if (!connection) return;

    const [pillType, pillLabel] = getMusicConnectionPill(!!connection.connected);
    setStatusPill('musicStatus', pillType, pillLabel);

    const activePortInfo = document.getElementById('activePortInfo');
    if (!activePortInfo) return;

    const hint = getActivePortHint(connection);
    activePortInfo.textContent = hint;
    activePortInfo.classList.toggle('is-hidden', !hint);
}

function handleHello(message) {
    applySettings(message.settings || {});
    renderDebugLogs(message.debugLogs || []);
    renderUpdateInfo(message.updateInfo);
    renderConnectionInfo(message.connection);
    renderDiscordStatus(message.discordStatus);
}

function handleConnectionStatus(message) {
    renderConnectionInfo(connectionViewFromStatus(message));
    setConnectionActionButtonsEnabled(true);
}

function handleActivePort(message) {
    if (message.adjusted && message.activePort) {
        applyDebugPortValue(message.activePort);
    }
    renderConnectionInfo(connectionViewFromActivePort(message));
    if (message.adjusted) {
        showToast('success', `Порт синхронизирован: ${message.activePort}`);
    }
}

function handleLaunchResult(message) {
    setConnectionActionButtonsEnabled(true);
    if (!message.ok) {
        showToast('error', message.error || 'Не удалось запустить Яндекс Музыку');
        return;
    }
    applyDebugPortValue(message.port);
    renderConnectionInfo(connectionViewFromLaunch(message));
    showToast('success', getLaunchResultText(message));
}

function handleSaveResult(message) {
    const toast = getSaveResultToast(message);
    showToast(toast.type, toast.text);
}

const MESSAGE_HANDLERS = {
    hello: handleHello,
    settings: message => applySettings(message.settings || {}),
    connectionStatus: handleConnectionStatus,
    activePort: handleActivePort,
    launchResult: handleLaunchResult,
    saveResult: handleSaveResult,
    debugLog: message => appendDebugLine(message.entry),
    debugLogClear: () => renderDebugLogs([]),
    updateInfo: renderUpdateInfo,
    discordStatus: renderDiscordStatus,
    shutdown: showDisconnectScreen
};

function handleMessage(event) {
    let message;
    try {
        message = JSON.parse(event.data);
    } catch {
        return;
    }

    const handler = MESSAGE_HANDLERS[message.type];
    if (handler) handler(message);
}

function connect() {
    if (!token || sessionEnded) {
        if (!token) showDisconnectScreen();
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`);

    socket.addEventListener('message', handleMessage);
    socket.addEventListener('close', () => {
        socket = null;
        showDisconnectScreen();
    });
    socket.addEventListener('error', () => socket?.close());
}

for (const field of Object.values(fields)) {
    if (field.element.type === 'range') {
        field.element.addEventListener('input', updateOutputs);
        field.element.addEventListener('change', saveSettings);
    } else {
        field.element.addEventListener('change', saveSettings);
    }
}

document.querySelectorAll('[data-panel]').forEach(button => {
    button.addEventListener('click', () => switchPanel(button.dataset.panel));
});

debugModeInput?.addEventListener('change', () => {
    updateDebugConsoleState();
    saveSettings();
});

discordRpcEnabledInput?.addEventListener('change', saveSettings);

document.getElementById('clearDebugBtn')?.addEventListener('click', () => {
    if (!send({ type: 'clearDebugLog' })) showToast('error', 'Не удалось очистить лог');
});

document.getElementById('checkConnectionBtn')?.addEventListener('click', event => {
    event.currentTarget.disabled = true;
    setStatusPill('musicStatus', 'pending', 'Проверка');
    if (!send({ type: 'checkConnection' })) event.currentTarget.disabled = false;
});

document.getElementById('launchAppBtn')?.addEventListener('click', event => {
    event.currentTarget.disabled = true;
    setStatusPill('musicStatus', 'pending', 'Запуск');
    if (!send({ type: 'launchApp' })) event.currentTarget.disabled = false;
});

document.getElementById('checkUpdatesBtn')?.addEventListener('click', () => {
    if (!send({ type: 'checkUpdates' })) showToast('error', 'Не удалось проверить обновления');
});

document.getElementById('openReleaseBtn')?.addEventListener('click', () => {
    if (!updateInfo?.pageUrl) return;
    window.open(updateInfo.pageUrl, '_blank', 'noopener,noreferrer');
});

switchPanel(activePanel);
updateOutputs();
updateDebugConsoleState();
connect();
