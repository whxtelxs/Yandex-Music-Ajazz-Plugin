const config = require('../config');
const debugLog = require('./debug-log');
const now = new Date();

const appenders = {
    stdout: { type: 'stdout' }
};

if (config.LOG_TO_FILE) {
    appenders.file = {
        type: 'file',
        filename: require('path').join(__dirname, '..', 'log', `${now.getFullYear()}.${now.getMonth() + 1}.${now.getDate()}.log`),
        maxLogSize: 2 * 1024 * 1024,
        backups: 3
    };
}

const rawLog = require('log4js').configure({
    appenders,
    categories: {
        default: {
            appenders: config.LOG_TO_FILE ? ['file', 'stdout'] : ['stdout'],
            level: config.LOG_LEVEL
        }
    }
}).getLogger();

function resolveLogScope(skipFrames = 2) {
    const stack = new Error().stack.split('\n');
    for (let i = skipFrames; i < Math.min(stack.length, 8); i++) {
        const match = stack[i].match(/at (?:async )?(?:[\w$]+\.)?(\w+) \(/);
        if (!match) continue;
        const name = match[1];
        if (name === 'info' || name === 'error' || name === 'warn' || name === 'debug' || name === 'resolveLogScope') {
            continue;
        }
        return name;
    }
    return 'unknown';
}

const log = {
    info(...args) {
        if (debugLog.isEnabled()) debugLog.push('info', args);
        else rawLog.info(...args);
    },
    error(...args) {
        if (debugLog.isEnabled()) debugLog.push('error', [`[${resolveLogScope()}]`, ...args]);
        else rawLog.error(`[${resolveLogScope()}]`, ...args);
    },
    warn(...args) {
        if (debugLog.isEnabled()) debugLog.push('warn', [`[${resolveLogScope()}]`, ...args]);
        else rawLog.warn(`[${resolveLogScope()}]`, ...args);
    },
    debug(...args) {
        if (debugLog.isEnabled()) debugLog.push('debug', args);
        else rawLog.debug(...args);
    }
};

module.exports = { log };
