/// <reference path="../utils/action.js" />

const $local = true;
const $back = false;

let initialized = false;
let panelAvailable = false;

function applyPanelInfo(info) {
    panelAvailable = !!info?.available;
    const button = document.getElementById('openSettingsBtn');
    if (button) button.disabled = !panelAvailable;
    if (!panelAvailable) {
        setTimeout(() => {
            if ($websocket?.readyState === WebSocket.OPEN) {
                $websocket.sendToPlugin({ command: 'getSettingsPanelInfo' });
            }
        }, 1000);
    }
}

function initUI() {
    if (initialized) return;
    if (!$websocket || $websocket.readyState !== WebSocket.OPEN) {
        setTimeout(initUI, 250);
        return;
    }
    initialized = true;
    $websocket.sendToPlugin({ command: 'getSettingsPanelInfo' });

    document.getElementById('openSettingsBtn')?.addEventListener('click', () => {
        if (!panelAvailable) return;
        $websocket.sendToPlugin({ command: 'openSettingsPanel' });
    });
}

const $propEvent = {
    sendToPropertyInspector(data) {
        if (data.command === 'settingsPanelInfo') applyPanelInfo(data);
    },
    didReceiveSettings() {},
    didReceiveGlobalSettings() {}
};

document.addEventListener('DOMContentLoaded', initUI);
