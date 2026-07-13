'use strict';

const net = require('net');

const DEBUG_PORT_RE = /--remote-debugging-port=(\d+)/;

function parseDebugPortFromCommandLine(commandLine) {
    if (!commandLine) return null;
    const match = String(commandLine).match(DEBUG_PORT_RE);
    if (!match) return null;
    const port = parseInt(match[1], 10);
    return Number.isNaN(port) || port < 1 || port > 65535 ? null : port;
}

function isPortInUse(port, host = '127.0.0.1', timeoutMs = 500) {
    return new Promise(resolve => {
        const socket = new net.Socket();
        let settled = false;

        const finish = value => {
            if (settled) return;
            settled = true;
            socket.destroy();
            resolve(value);
        };

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finish(true));
        socket.once('timeout', () => finish(false));
        socket.once('error', () => finish(false));
        socket.connect(port, host);
    });
}

async function findNearestFreePort(preferredPort, {
    host = '127.0.0.1',
    maxAttempts = 20,
    min = 1,
    max = 65535
} = {}) {
    const start = Math.max(min, Math.min(max, preferredPort));
    for (let offset = 0; offset < maxAttempts; offset++) {
        const candidate = start + offset;
        if (candidate > max) break;
        if (!(await isPortInUse(candidate, host))) return candidate;
    }
    return null;
}

module.exports = {
    DEBUG_PORT_RE,
    parseDebugPortFromCommandLine,
    isPortInUse,
    findNearestFreePort
};
