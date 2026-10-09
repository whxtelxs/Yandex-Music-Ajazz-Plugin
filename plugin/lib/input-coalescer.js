'use strict';

function createInputCoalescer(flush, intervalMs = 60) {
    const pending = new Map();

    function schedule(context, entry) {
        if (entry.timer || entry.running || pending.get(context) !== entry) return;
        entry.timer = setTimeout(() => run(context, entry), intervalMs);
    }

    async function run(context, entry) {
        entry.timer = null;
        entry.running = true;
        const delta = entry.delta;
        const waiters = entry.waiters.splice(0);
        entry.delta = 0;
        entry.activeWaiters = waiters;
        try {
            const value = delta === 0 ? true : await flush(context, delta, entry.controller.signal);
            if (!entry.controller.signal.aborted) for (const waiter of waiters) waiter.resolve(value);
        } catch (error) {
            for (const waiter of waiters) waiter.reject(error);
        } finally {
            entry.running = false;
            entry.activeWaiters = [];
            if (pending.get(context) === entry) {
                if (entry.waiters.length) schedule(context, entry);
                else pending.delete(context);
            }
        }
    }

    function add(context, delta) {
        const amount = Number(delta);
        if (!Number.isFinite(amount)) return Promise.reject(new Error('Invalid input delta'));
        if (amount === 0) return Promise.resolve(true);
        let entry = pending.get(context);
        if (!entry) {
            entry = { delta: 0, waiters: [], activeWaiters: [], timer: null, running: false, controller: new AbortController() };
            pending.set(context, entry);
        }
        if (entry.waiters.length >= 256 || Math.abs(entry.delta + amount) > 10000) return Promise.reject(new Error('Too much pending input'));
        entry.delta += amount;
        const result = new Promise((resolve, reject) => entry.waiters.push({ resolve, reject }));
        schedule(context, entry);
        return result;
    }

    function cancel(context) {
        const entry = pending.get(context);
        if (!entry) return;
        pending.delete(context);
        clearTimeout(entry.timer);
        const error = new Error('Input cancelled');
        entry.controller.abort(error);
        for (const waiter of [...entry.waiters, ...entry.activeWaiters]) waiter.reject(error);
        entry.waiters = [];
    }

    function clear() {
        for (const context of pending.keys()) cancel(context);
    }

    return { add, cancel, clear };
}

module.exports = { createInputCoalescer };
