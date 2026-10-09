'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createNotifier } = require('../../propertyInspector/dashboard/src/notifications');

function notifications() {
    const timers = new Map();
    const entries = new Map();
    let sequence = 0;
    const toast = { close: id => {
        const entry = entries.get(id);
        if (!entry) return;
        entries.delete(id);
        entry.options.onClose();
    } };
    for (const variant of ['success', 'danger', 'warning', 'info']) toast[variant] = (text, options) => {
        const id = ++sequence;
        entries.set(id, { variant, text, options });
        return id;
    };
    const notify = createNotifier({ toast,
        setTimer: (fn, delay) => { const id = ++sequence; timers.set(id, { fn, delay }); return id; },
        clearTimer: id => timers.delete(id)
    });
    return { notify, toast, timers, entries };
}

test('notification deadlines close every variant without relying on HeroUI timer resumption', () => {
    for (const [type, variant, delay] of [
        ['success', 'success', 2500], ['error', 'danger', 5000], ['warning', 'warning', 5000], ['info', 'info', 3500]
    ]) {
        const f = notifications();
        const id = f.notify(type, 'Сообщение');
        assert.equal(f.entries.get(id).variant, variant);
        assert.equal(f.entries.get(id).options.timeout, 0);
        const timer = [...f.timers.values()][0];
        assert.equal(timer.delay, delay);
        timer.fn();
        assert.equal(f.entries.size, 0);
        assert.equal(f.timers.size, 0);
    }
});

test('closing a notification manually cancels its deadline without affecting other notifications', () => {
    const f = notifications();
    const first = f.notify('success', 'Первое');
    const second = f.notify('error', 'Второе');
    f.toast.close(first);
    assert.equal(f.entries.size, 1);
    assert.ok(f.entries.has(second));
    assert.equal(f.timers.size, 1);
    [...f.timers.values()][0].fn();
    assert.equal(f.entries.size, 0);
    assert.equal(f.timers.size, 0);
});
