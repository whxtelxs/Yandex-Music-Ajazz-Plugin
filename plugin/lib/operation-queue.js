'use strict';

const { withTimeout, TimeoutError } = require('./async-utils');
const PRIORITY = { background: 0, sync: 1, user: 2 };

class OperationQueue {
    constructor({ onStart, onFinish, maxPending = 128, timeoutMs = 8000 } = {}) {
        this.pending = [];
        this.pendingByKey = new Map();
        this.active = null;
        this.running = false;
        this.sequence = 0;
        this.onStart = onStart;
        this.onFinish = onFinish;
        this.maxPending = maxPending;
        this.timeoutMs = timeoutMs;
    }

    enqueue(task, { priority = 'background', key = null, timeoutMs = this.timeoutMs, signal } = {}) {
        if (signal?.aborted) return Promise.reject(signal.reason || new Error('Operation cancelled'));
        if (key && this.pendingByKey.has(key)) return this.pendingByKey.get(key);
        if (this.pending.length >= this.maxPending) return Promise.reject(new Error('Operation queue is full'));
        let resolve;
        let reject;
        const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
        const controller = new AbortController();
        let timer;
        let item;
        const cancel = error => {
            controller.abort(error);
            const index = this.pending.indexOf(item);
            if (index < 0) return;
            this.pending.splice(index, 1);
            item.cleanup();
            if (key && this.pendingByKey.get(key) === promise) this.pendingByKey.delete(key);
            reject(error);
        };
        const abort = () => cancel(signal.reason || new Error('Operation cancelled'));
        signal?.addEventListener('abort', abort, { once: true });
        item = {
            task, key, promise, resolve, reject, controller,
            priority: PRIORITY[priority] ?? PRIORITY.background,
            sequence: this.sequence++,
            deadline: Date.now() + timeoutMs,
            cleanup: () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
        };
        timer = setTimeout(() => cancel(new TimeoutError('Operation timed out')), Math.max(1, timeoutMs));
        this.pending.push(item);
        if (key) this.pendingByKey.set(key, promise);
        this._drain();
        return promise;
    }

    clear(error = new Error('Operation queue cleared')) {
        this.active?.controller.abort(error);
        for (const item of this.pending.splice(0)) {
            item.controller.abort(error);
            item.cleanup();
            item.reject(error);
            if (item.key && this.pendingByKey.get(item.key) === item.promise) this.pendingByKey.delete(item.key);
        }
    }

    get size() {
        return this.pending.length + (this.active ? 1 : 0);
    }

    async _drain() {
        if (this.running) return;
        this.running = true;
        try {
            while (this.pending.length) {
                this.pending.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
                const item = this.pending.shift();
                this.active = item;
                const startedAt = Date.now();
                try {
                    this.onStart?.(item);
                    const remaining = item.deadline - Date.now();
                    if (remaining <= 0) throw new TimeoutError('Operation expired in queue');
                    const value = await withTimeout(() => item.task(item.controller.signal), remaining,
                        'Operation timed out', item.controller.signal);
                    item.resolve(value);
                } catch (error) {
                    item.controller.abort(error);
                    item.reject(error);
                } finally {
                    item.cleanup();
                    if (item.key && this.pendingByKey.get(item.key) === item.promise) this.pendingByKey.delete(item.key);
                    this.active = null;
                    try { this.onFinish?.(item, Date.now() - startedAt); } catch {}
                }
            }
        } finally {
            this.running = false;
        }
    }
}

module.exports = { OperationQueue, PRIORITY };
