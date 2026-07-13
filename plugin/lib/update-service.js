'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { log } = require('../utils/plugin');
const { deps } = require('./deps');
const { fetchLatestRelease, buildUpdateInfo } = require('./update-checker');
const { readState, writeState } = require('./update-state');
const { getRuntimePluginRoot } = require('./plugin-path');

const NOTIFY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

const state = {
    info: null,
    checking: false,
    lastError: null
};

function readCurrentVersion() {
    const manifest = JSON.parse(fs.readFileSync(path.join(getRuntimePluginRoot(), 'manifest.json'), 'utf8'));
    return String(manifest.Version || '').trim();
}

function getPublicInfo() {
    const info = state.info;
    let currentVersion = info?.currentVersion;
    try {
        currentVersion = readCurrentVersion();
    } catch {
        currentVersion = currentVersion || '—';
    }

    if (!info) {
        return {
            status: state.checking ? 'checking' : (state.lastError ? 'error' : 'idle'),
            currentVersion,
            latestVersion: null,
            hasUpdate: false,
            releaseName: null,
            releaseNotes: null,
            pageUrl: null,
            checkedAt: null,
            error: state.lastError
        };
    }

    return {
        status: state.checking ? 'checking' : 'ready',
        currentVersion,
        latestVersion: info.latestVersion,
        hasUpdate: !!info.updateAvailable,
        releaseName: info.releaseName,
        releaseNotes: info.releaseNotes,
        pageUrl: info.pageUrl,
        checkedAt: info.checkedAt,
        error: state.lastError
    };
}

function broadcastUpdateInfo() {
    deps.settingsServer?.broadcast({
        type: 'updateInfo',
        ...getPublicInfo()
    });
}

function shouldNotify(info) {
    if (!info?.updateAvailable) return false;
    const saved = readState();
    if (saved.lastNotifiedVersion !== info.latestVersion) return true;
    if (!saved.lastNotifiedAt) return true;
    const elapsed = Date.now() - new Date(saved.lastNotifiedAt).getTime();
    return elapsed >= NOTIFY_COOLDOWN_MS;
}

function recordNotification(info) {
    writeState({
        lastNotifiedAt: new Date().toISOString(),
        lastNotifiedVersion: info.latestVersion
    });
}

function tryWindowsNotification(title, message, clickUrl) {
    if (process.platform !== 'win32') return;
    const script = `
Add-Type -AssemblyName System.Windows.Forms
$url = ${JSON.stringify(clickUrl || '')}
$notify = New-Object System.Windows.Forms.NotifyIcon
$notify.Icon = [System.Drawing.SystemIcons]::Information
$notify.Visible = $true
$notify.BalloonTipTitle = ${JSON.stringify(title)}
$notify.BalloonTipText = ${JSON.stringify(message)}
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 15000
$closed = $false
$close = {
    if ($closed) { return }
    $closed = $true
    $timer.Stop()
    $notify.Visible = $false
    $notify.Dispose()
    [System.Windows.Forms.Application]::Exit()
}
$timer.Add_Tick($close)
$notify.Add_BalloonTipClicked({
    if ($url) { Start-Process $url }
    & $close
})
$notify.ShowBalloonTip(12000)
$timer.Start()
[System.Windows.Forms.Application]::Run()
`;
    execFile('powershell.exe', [
        '-NoProfile',
        '-WindowStyle', 'Hidden',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        script
    ], { windowsHide: true }, () => {});
}

function notifyIfNeeded() {
    const info = state.info;
    if (!shouldNotify(info)) return;

    recordNotification(info);

    const serverInfo = deps.settingsServer?.getInfo();
    const clickUrl = serverInfo?.url
        ? `${serverInfo.url}&panel=${encodeURIComponent('updates')}`
        : (info.pageUrl || null);

    tryWindowsNotification(
        'Yandex Music Ajazz',
        `Доступна версия ${info.latestVersion}. Откройте настройки и перейдите к релизу.`,
        clickUrl
    );
}

async function checkForUpdates({ notify = false, force = false } = {}) {
    if (state.checking && !force) return getPublicInfo();
    state.checking = true;
    state.lastError = null;
    broadcastUpdateInfo();
    try {
        const currentVersion = readCurrentVersion();
        const release = await fetchLatestRelease();
        state.info = buildUpdateInfo(currentVersion, release);
        writeState({ lastCheckAt: state.info.checkedAt, latestVersion: state.info.latestVersion });
        if (notify) notifyIfNeeded();
    } catch (error) {
        state.lastError = error.message || 'Не удалось проверить обновления';
        log.warn('Проверка обновлений:', state.lastError);
    } finally {
        state.checking = false;
        broadcastUpdateInfo();
    }
    return getPublicInfo();
}

function registerUpdateService() {
    setTimeout(() => {
        checkForUpdates({ notify: true }).then(result => {
            log.info('Проверка обновлений:', result.hasUpdate
                ? `доступна ${result.latestVersion}`
                : `актуальная версия ${result.currentVersion}`);
        });
    }, 2500);
}

module.exports = {
    checkForUpdates,
    getPublicInfo,
    broadcastUpdateInfo,
    registerUpdateService
};
