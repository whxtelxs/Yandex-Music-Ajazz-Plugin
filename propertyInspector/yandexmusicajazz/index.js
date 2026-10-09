'use strict';

const $local = true;
const $back = false;

let initialized = false;
let panelUrl = null;

function applyPanelInfo(info) {
    panelUrl = info?.available ? info.url || null : null;
    const button = document.getElementById('openSettingsBtn');
    if (button) button.disabled = !panelUrl;
    if (!panelUrl) {
        setTimeout(() => {
            if ($websocket?.readyState === WebSocket.OPEN) $websocket.sendToPlugin({ command: 'getSettingsPanelInfo' });
        }, 1000);
    }
}

function openSettings() {
    if (panelUrl) $websocket.openUrl(panelUrl);
}

function initUI() {
    if (initialized) return;
    if (!$websocket || $websocket.readyState !== WebSocket.OPEN) {
        setTimeout(initUI, 250);
        return;
    }
    initialized = true;
    $websocket.sendToPlugin({ command: 'getSettingsPanelInfo' });
    document.getElementById('openSettingsBtn')?.addEventListener('click', openSettings);
}

const $propEvent = {
    sendToPropertyInspector(data) {
        if (data.command === 'settingsPanelInfo') applyPanelInfo(data);
    },
    didReceiveSettings() {},
    didReceiveGlobalSettings() {}
};

document.addEventListener('DOMContentLoaded', initUI);
