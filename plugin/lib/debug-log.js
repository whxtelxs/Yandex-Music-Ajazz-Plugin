'use strict';

const MAX_BUFFER = 500;

const state = {
    enabled: false,
    buffer: [],
    broadcast: null
};

function setBroadcast(fn) {
    state.broadcast = typeof fn === 'function' ? fn : null;
}

function setEnabled(enabled) {
    state.enabled = !!enabled;
}

function isEnabled() {
    return state.enabled;
}

function formatArg(arg) {
    if (arg instanceof Error) return arg.stack || arg.message;
    if (typeof arg === 'object') {
        try {
            return JSON.stringify(arg);
        } catch {
            return String(arg);
        }
    }
    return String(arg);
}

function formatArgs(args) {
    return args.map(formatArg).join(' ');
}

function push(level, args) {
    if (!state.enabled) return;
    const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        at: new Date().toISOString(),
        level,
        text: formatArgs(args)
    };
    state.buffer.push(entry);
    if (state.buffer.length > MAX_BUFFER) state.buffer.shift();
    state.broadcast?.({ type: 'debugLog', entry });
}

function getBuffer() {
    return state.buffer.slice();
}

function clear() {
    state.buffer = [];
    state.broadcast?.({ type: 'debugLogClear' });
}

module.exports = {
    setBroadcast,
    setEnabled,
    isEnabled,
    push,
    getBuffer,
    clear
};
