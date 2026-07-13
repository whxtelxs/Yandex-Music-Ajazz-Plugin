'use strict';

const RPC = require('discord-rpc');

const CONNECT_TIMEOUT_MS = 50000;

async function loginClient(appId, transportName) {
    RPC.register(appId);
    const client = new RPC.Client({ transport: transportName });
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            destroyQuietly(client);
            reject(new Error('RPC_CONNECTION_TIMEOUT'));
        }, CONNECT_TIMEOUT_MS);
        const onReady = () => {
            cleanup();
            resolve(client);
        };
        const onError = error => {
            cleanup();
            destroyQuietly(client);
            reject(error);
        };
        const cleanup = () => {
            clearTimeout(timer);
            client.removeListener('ready', onReady);
            client.removeListener('error', onError);
        };
        client.once('ready', onReady);
        client.once('error', onError);
        client.login({ clientId: appId }).catch(onError);
    });
}

function destroyQuietly(client) {
    try {
        client.destroy();
    } catch {
        // ignore
    }
}

async function connectDiscordClient(appId, log) {
    const attempts = [];
    for (const transport of ['ipc', 'websocket']) {
        try {
            return await loginClient(appId, transport);
        } catch (error) {
            const message = error?.message || String(error);
            attempts.push(`${transport}: ${message}`);
            log.warn?.('Discord connect attempt failed:', attempts[attempts.length - 1]);
        }
    }
    const error = new Error(attempts.join('; ') || 'Could not connect to Discord');
    error.attempts = attempts;
    throw error;
}

function formatConnectError(error) {
    const raw = String(error?.message || error || '');
    if (/timeout/i.test(raw)) {
        return 'Discord не ответил вовремя. Нажмите Ctrl+R в Discord или перезапустите его, затем подождите ~30 секунд. Не запускайте Discord от администратора, если Ajazz — без прав.';
    }
    if (/could not connect|connection closed/i.test(raw)) {
        return 'Не удалось подключиться к Discord. Убедитесь, что Discord запущен, и перезапустите его (Ctrl+R).';
    }
    if (/invalid client id/i.test(raw)) {
        return 'Неверный Application ID в config.js. Проверьте ID в Discord Developer Portal.';
    }
    return `Discord: ${raw}`;
}

module.exports = {
    connectDiscordClient,
    formatConnectError
};
