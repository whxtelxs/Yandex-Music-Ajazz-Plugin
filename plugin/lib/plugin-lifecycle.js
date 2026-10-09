'use strict';

const { resolveHostProcess } = require('./host-process');
const { withTimeout } = require('./async-utils');

function isProcessAlive(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try { process.kill(pid, 0); return true; } catch { return false; }
}

function createPluginLifecycle({ log, plugin, settingsServer, discordPresence, yandexMusic, stopStateChecks, exit = code => process.exit(code) }) {
    let shutdownPromise = null;
    let hostWatchTimer = null;
    let fatal = false;

    function shutdown(reason, exitCode = 0) {
        fatal ||= exitCode !== 0;
        if (shutdownPromise) return shutdownPromise;
        clearInterval(hostWatchTimer);
        try { stopStateChecks?.(); } catch (error) { log.error('Ошибка остановки синхронизации:', error); }
        log.info('Завершение плагина: ' + reason);
        const jobs = [
            () => plugin?.disposeActions?.(),
            () => settingsServer?.stop?.(),
            () => discordPresence?.stop?.(),
            () => yandexMusic?.disconnect?.({ reconnect: false })
        ];
        shutdownPromise = Promise.allSettled(jobs.map(job => withTimeout(job, 1500, 'Shutdown timed out')))
            .then(results => {
                for (const result of results) if (result.status === 'rejected') log.error('Ошибка очистки:', result.reason);
            }).finally(() => exit(fatal ? 1 : 0));
        return shutdownPromise;
    }

    async function startHostWatchdog() {
        try {
            const host = await withTimeout(resolveHostProcess, 6000, 'Host detection timed out');
            if (!host?.pid || shutdownPromise) return;
            hostWatchTimer = setInterval(() => {
                if (!isProcessAlive(host.pid)) shutdown('streamdock-closed');
            }, 1500);
            hostWatchTimer.unref?.();
        } catch (error) { log.debug('Host watchdog:', error.message); }
    }

    function registerProcessHooks() {
        const fatalError = error => {
            log.error('Фатальная ошибка:', error);
            shutdown('fatal-error', 1);
        };
        process.on('SIGTERM', () => shutdown('sigterm'));
        process.on('SIGINT', () => shutdown('sigint'));
        process.on('uncaughtException', fatalError);
        process.on('unhandledRejection', fatalError);
    }

    return { shutdown, startHostWatchdog, registerProcessHooks, isProcessAlive };
}

module.exports = { createPluginLifecycle, isProcessAlive };
