'use strict';

const RPC = require('discord-rpc');
const { withTimeout } = require('../async-utils');

async function loginClient(appId, transport, signal) {
    RPC.register(appId);
    const client = new RPC.Client({ transport });
    const ready = new Promise((resolve, reject) => {
        client.once('ready', () => resolve(client));
        client.on('error', reject);
        client.transport.on('error', error => client.emit('error', error));
        client.login({ clientId: appId }).catch(reject);
    });
    try {
        return await withTimeout(ready, 12000, 'RPC_CONNECTION_TIMEOUT', signal);
    } catch (error) {
        Promise.resolve(client.destroy()).catch(() => {});
        throw error;
    }
}

async function connectDiscordClient(appId, log, { signal } = {}) {
    const failures = [];
    for (const transport of ['ipc', 'websocket']) {
        if (signal?.aborted) throw signal.reason;
        try { return await loginClient(appId, transport, signal); }
        catch (error) {
            if (signal?.aborted) throw signal.reason;
            failures.push(transport + ': ' + error.message);
            log.debug?.('Discord connection:', error.message);
        }
    }
    throw new Error(failures.join('; '));
}

function formatConnectError(error) {
    const message = String(error?.message || error || '');
    if (/timeout|timed out/i.test(message)) return 'Discord не ответил вовремя. Проверьте, что он запущен';
    if (/invalid client id/i.test(message)) return 'Неверный Discord Application ID';
    return 'Не удалось подключиться к Discord. Проверьте приложение и права доступа';
}

module.exports = { connectDiscordClient, formatConnectError };
