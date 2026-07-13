'use strict';

function createInputCoalescer(flush, delayMs = 60) {
    const pending = new Map();

    function add(context, delta) {
        let entry = pending.get(context);
        if (!entry) {
            entry = { delta: 0, waiters: [], timer: null };
            pending.set(context, entry);
        }
        entry.delta += delta;
        clearTimeout(entry.timer);

        const result = new Promise((resolve, reject) => entry.waiters.push({ resolve, reject }));
        entry.timer = setTimeout(async () => {
            pending.delete(context);
            try {
                const value = await flush(context, entry.delta);
                entry.waiters.forEach(waiter => waiter.resolve(value));
            } catch (error) {
                entry.waiters.forEach(waiter => waiter.reject(error));
            }
        }, delayMs);
        return result;
    }

    function cancel(context) {
        const entry = pending.get(context);
        if (!entry) return;
        clearTimeout(entry.timer);
        pending.delete(context);
        const error = new Error('Input coalescing cancelled');
        entry.waiters.forEach(waiter => waiter.reject(error));
    }

    return { add, cancel };
}

module.exports = { createInputCoalescer };
