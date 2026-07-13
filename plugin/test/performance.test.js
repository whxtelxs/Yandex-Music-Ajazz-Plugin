'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { OperationQueue } = require('../lib/operation-queue');
const { createInputCoalescer } = require('../lib/input-coalescer');
const { parseTime, formatTime, projectTime } = require('../lib/time-utils');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test('operation queue prioritizes user work after current operation', async () => {
    const queue = new OperationQueue();
    const order = [];
    const first = queue.enqueue(async () => {
        order.push('running');
        await sleep(15);
    });
    const background = queue.enqueue(async () => order.push('background'));
    const user = queue.enqueue(async () => order.push('user'), { priority: 'user' });
    await Promise.all([first, background, user]);
    assert.deepEqual(order, ['running', 'user', 'background']);
});

test('operation queue coalesces pending reads by key', async () => {
    const queue = new OperationQueue();
    let calls = 0;
    const blocker = queue.enqueue(() => sleep(10));
    const first = queue.enqueue(async () => ++calls, { key: 'snapshot' });
    const second = queue.enqueue(async () => ++calls, { key: 'snapshot' });
    await blocker;
    assert.equal(await first, 1);
    assert.equal(await second, 1);
    assert.equal(calls, 1);
});

test('input coalescer accumulates encoder ticks', async () => {
    const flushed = [];
    const coalescer = createInputCoalescer(async (context, delta) => {
        flushed.push([context, delta]);
        return delta;
    }, 10);
    const results = await Promise.all([
        coalescer.add('encoder', 1),
        coalescer.add('encoder', 2),
        coalescer.add('encoder', -1)
    ]);
    assert.deepEqual(flushed, [['encoder', 2]]);
    assert.deepEqual(results, [2, 2, 2]);
});

test('timer projection advances locally and clamps to duration', () => {
    const timer = { position: 59.2, total: 61, playing: true, syncedAt: 1000 };
    assert.equal(projectTime(timer, 2500), 60.7);
    assert.equal(projectTime(timer, 5000), 61);
    assert.equal(formatTime(projectTime(timer, 2500)), '1:00');
    assert.equal(parseTime('1:02'), 62);
});
