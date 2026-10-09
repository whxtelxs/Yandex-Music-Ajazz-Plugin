'use strict';

class TimeoutError extends Error {
    constructor(message = 'Operation timed out') {
        super(message);
        this.name = 'TimeoutError';
        this.code = 'ETIMEDOUT';
    }
}

function withTimeout(operation, timeoutMs, message, signal) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            callback(value);
        };
        const abort = () => finish(reject, signal.reason || new Error('Operation cancelled'));
        const timer = setTimeout(() => finish(reject, new TimeoutError(message)), timeoutMs);
        if (signal?.aborted) {
            abort();
            return;
        }
        signal?.addEventListener('abort', abort, { once: true });
        Promise.resolve().then(() => typeof operation === 'function' ? operation() : operation)
            .then(value => finish(resolve, value), error => finish(reject, error));
    });
}

function delay(ms, signal) {
    return new Promise((resolve, reject) => {
        const cleanup = () => signal?.removeEventListener('abort', abort);
        const abort = () => {
            clearTimeout(timer);
            cleanup();
            reject(signal.reason || new Error('Operation cancelled'));
        };
        const timer = setTimeout(() => {
            cleanup();
            resolve();
        }, ms);
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
    });
}

module.exports = { TimeoutError, withTimeout, delay };
