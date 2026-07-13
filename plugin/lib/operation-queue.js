'use strict';

const PRIORITY = {
    background: 0,
    sync: 1,
    user: 2
};

class OperationQueue {
    constructor({ onStart, onFinish } = {}) {
        this.pending = [];
        this.pendingByKey = new Map();
        this.running = false;
        this.sequence = 0;
        this.onStart = onStart;
        this.onFinish = onFinish;
    }

    enqueue(task, { priority = 'background', key = null } = {}) {
        if (key && this.pendingByKey.has(key)) {
            return this.pendingByKey.get(key);
        }

        let resolvePromise;
        let rejectPromise;
        const promise = new Promise((resolve, reject) => {
            resolvePromise = resolve;
            rejectPromise = reject;
        });

        const item = {
            task,
            key,
            priority: PRIORITY[priority] ?? PRIORITY.background,
            sequence: this.sequence++,
            resolve: resolvePromise,
            reject: rejectPromise,
            promise
        };
        this.pending.push(item);
        if (key) this.pendingByKey.set(key, promise);
        this._drain();
        return promise;
    }

    clear(error = new Error('Operation queue cleared')) {
        const items = this.pending.splice(0);
        items.forEach(item => {
            if (item.key && this.pendingByKey.get(item.key) === item.promise) {
                this.pendingByKey.delete(item.key);
            }
        });
        items.forEach(item => item.reject(error));
    }

    get size() {
        return this.pending.length + (this.running ? 1 : 0);
    }

    async _drain() {
        if (this.running) return;
        this.running = true;

        while (this.pending.length) {
            this.pending.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
            const item = this.pending.shift();
            const startedAt = Date.now();
            this.onStart?.(item);
            try {
                item.resolve(await item.task());
            } catch (error) {
                item.reject(error);
            } finally {
                if (item.key && this.pendingByKey.get(item.key) === item.promise) {
                    this.pendingByKey.delete(item.key);
                }
                this.onFinish?.(item, Date.now() - startedAt);
            }
        }

        this.running = false;
    }
}

module.exports = { OperationQueue, PRIORITY };
