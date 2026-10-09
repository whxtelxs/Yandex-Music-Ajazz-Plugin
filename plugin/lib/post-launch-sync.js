'use strict';

const { log } = require('../lib/logger');
const { deps } = require('./deps');
const { applyActiveDebugPort } = require('./debug-port-sync');
const { resyncAllStates, requestMediaRefresh } = require('./state-sync');

const WARMUP_MS = 45000;
const PLAYER_READY_TIMEOUT_MS = 45000;
const CONNECT_RETRY_DELAY_MS = 1500;
const CONNECT_RETRIES = 12;

let ensureInFlight = null;
let connectInFlight = null;

function buildLaunchMessage(result) {
    if (result.adjusted) {
        return `Запущено на порту ${result.port} (порт был изменён из-за конфликта)`;
    }
    return 'Яндекс Музыка запущена';
}

async function connectWithRetries() {
    for (let attempt = 1; attempt <= CONNECT_RETRIES; attempt++) {
        try {
            const client = await deps.yandexMusic.connect();
            if (client) return true;
        } catch (error) {
            log.warn(`Попытка CDP подключения ${attempt}/${CONNECT_RETRIES}:`, error.message);
        }
        if (attempt < CONNECT_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, CONNECT_RETRY_DELAY_MS));
        }
    }
    return false;
}

function runPostLaunchConnect(result, options = {}) {
    if (connectInFlight) return connectInFlight;
    connectInFlight = performPostLaunchConnect(result, options).finally(() => { connectInFlight = null; });
    return connectInFlight;
}

async function performPostLaunchConnect(result, { source = 'launch' } = {}) {
    await applyActiveDebugPort(result.port, { source });

    const needsWarmup = !result.alreadyRunning;
    if (needsWarmup) {
        deps.yandexMusic.setWarmingUp(WARMUP_MS);
    }

    if (!deps.yandexMusic.connected) {
        await new Promise(resolve => setTimeout(resolve, needsWarmup ? 1000 : 300));
    }

    const connected = await connectWithRetries();
    if (!connected) {
        if (needsWarmup) deps.yandexMusic.clearWarmingUp();
        log.warn(`[${source}] CDP пока недоступен, продолжаем переподключение в фоне`);
        deps.yandexMusic.requestReconnect?.();
        return { connected: false, ready: false, cdpPending: true };
    }

    let ready;
    try {
        ready = await deps.yandexMusic.waitForPlayerReady({ timeoutMs: PLAYER_READY_TIMEOUT_MS });
    } finally {
        deps.yandexMusic.clearWarmingUp();
    }

    if (ready) {
        await resyncAllStates();
        requestMediaRefresh(250);
        deps.settingsServer?.broadcast({ type: 'connectionStatus', ...deps.yandexMusic.getConnectionInfo() });
    } else {
        requestMediaRefresh(5000);
        log.warn(`[${source}] Плеер ещё загружается, синхронизация отложена`);
    }

    return { connected: true, ready };
}

function startPostLaunchInBackground(result, { source = 'launch' } = {}) {
    runPostLaunchConnect(result, { source }).catch(error => {
        deps.yandexMusic.clearWarmingUp();
        log.error(`[${source}] Фоновое подключение CDP после запуска:`, error);
    });
}

async function ensureYandexMusicOnce(options) {
    if (ensureInFlight) return ensureInFlight;

    ensureInFlight = deps.launcher.ensureYandexMusicRunning(options)
        .finally(() => {
            ensureInFlight = null;
        });

    return ensureInFlight;
}

async function launchYandexMusicApp({ source = 'unknown', restart = false } = {}) {
    try {
        const result = await ensureYandexMusicOnce({ restart });
        if (!result.success) {
            log.error(`[${source}] Не удалось запустить Яндекс Музыку`);
            return { success: false, ...result };
        }

        startPostLaunchInBackground(result, { source });

        return {
            launched: true,
            success: true,
            port: result.port,
            adjusted: !!result.adjusted,
            alreadyRunning: !!result.alreadyRunning,
            connected: !!deps.yandexMusic.connected,
            message: buildLaunchMessage(result)
        };
    } catch (error) {
        deps.yandexMusic.clearWarmingUp();
        log.error(`[${source}] Ошибка запуска Яндекс Музыки:`, error);
        return { success: false, error: error.message };
    }
}

module.exports = {
    launchYandexMusicApp,
    runPostLaunchConnect,
    buildLaunchMessage
};
