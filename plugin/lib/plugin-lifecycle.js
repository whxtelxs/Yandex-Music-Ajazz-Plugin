'use strict';

const { resolveHostProcess } = require('./host-process');

function isProcessAlive(pid) {
    if (!pid || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch {
        return false;
    }
}

function createPluginLifecycle({
    log,
    settingsServer,
    discordPresence,
    yandexMusic,
    stopStateChecks
}) {
    let shuttingDown = false;
    let hostWatchTimer = null;
    let hostPid = null;

    async function shutdown(reason) {
        if (shuttingDown) return;
        shuttingDown = true;
        log.info(`Завершение плагина (${reason})`);

        if (hostWatchTimer) {
            clearInterval(hostWatchTimer);
            hostWatchTimer = null;
        }

        try {
            await discordPresence?.stop?.();
            await settingsServer?.stop?.();
            stopStateChecks?.();
            await yandexMusic?.disconnect?.({ reconnect: false });
        } catch (error) {
            log.error('Ошибка при завершении плагина:', error);
        }

        setImmediate(() => process.exit(0));
    }

    async function startHostWatchdog() {
        try {
            const host = await resolveHostProcess();
            hostPid = host?.pid || null;
            if (!hostPid) {
                log.warn('Не удалось определить процесс StreamDock для watchdog');
                return;
            }
            log.info(`Watchdog StreamDock: pid=${hostPid}`);
        } catch (error) {
            log.warn('Watchdog StreamDock не запущен:', error.message || error);
            return;
        }

        hostWatchTimer = setInterval(() => {
            if (shuttingDown) return;
            if (!isProcessAlive(hostPid)) {
                shutdown('streamdock-closed');
            }
        }, 1500);
    }

    function registerProcessHooks() {
        process.on('SIGTERM', () => shutdown('sigterm'));
        process.on('SIGINT', () => shutdown('sigint'));
    }

    return {
        shutdown,
        startHostWatchdog,
        registerProcessHooks,
        isProcessAlive
    };
}

module.exports = {
    createPluginLifecycle,
    isProcessAlive
};
