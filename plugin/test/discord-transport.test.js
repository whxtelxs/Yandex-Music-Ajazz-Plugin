'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');

function load(file, dependencies, globals = {}) {
    const context = vm.createContext({ module: { exports: {} }, require: name => dependencies[name], ...globals });
    vm.runInContext(fs.readFileSync(file, 'utf8'), context);
    return context.module.exports;
}

test('Discord transport errors reject connection attempts without an unhandled error event', async () => {
    const clients = [];
    class Client extends EventEmitter {
        constructor(options) {
            super();
            this.options = options;
            this.transport = new EventEmitter();
            this.destroyed = false;
            clients.push(this);
        }
        async login() { this.transport.emit('error', new Error('Discord unavailable')); }
        async destroy() { this.destroyed = true; }
    }
    const { connectDiscordClient } = load(path.resolve(__dirname, '../lib/discord/client.js'), {
        'discord-rpc': { Client, register() {} },
        '../async-utils': require('../lib/async-utils')
    });
    await assert.rejects(connectDiscordClient('123', { debug() {} }), /ipc: Discord unavailable; websocket: Discord unavailable/);
    assert.equal(clients.length, 2);
    assert.ok(clients.every(client => client.destroyed));
    for (const client of clients) assert.doesNotThrow(() => client.transport.emit('error', new Error('Late error')));
});

function transportFixture() {
    const sockets = [];
    const timers = new Map();
    let timerId = 0;
    class Socket extends EventEmitter {
        constructor() { super(); this.readyState = 1; sockets.push(this); }
        addEventListener(event, listener) { this.once(event, listener); }
        close() { this.readyState = 3; this.emit('close', {}); }
    }
    const Transport = load(require.resolve('discord-rpc/src/transports/websocket'), {
        events: EventEmitter,
        '../constants': { browser: false },
        ws: Socket
    }, {
        setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
        clearTimeout(id) { timers.delete(id); }
    });
    return { transport: new Transport({ clientId: '123', options: {} }), sockets, timers };
}

test('closing Discord WebSocket cancels retries and prevents a late reconnect', async () => {
    const fixture = transportFixture();
    await fixture.transport.connect();
    fixture.transport.onError({ error: new Error('Connection refused') });
    assert.equal(fixture.timers.size, 1);
    const retry = [...fixture.timers.values()][0];
    await fixture.transport.close();
    assert.equal(fixture.timers.size, 0);
    retry();
    await Promise.resolve();
    assert.equal(fixture.sockets.length, 1);
    assert.equal(fixture.transport.closed, true);
    assert.doesNotThrow(() => fixture.transport.onError({ error: new Error('Late socket error') }));
    assert.equal(fixture.timers.size, 0);
});

test('Discord WebSocket can be destroyed before creating a socket', async () => {
    const fixture = transportFixture();
    await fixture.transport.close();
    await fixture.transport.connect();
    assert.equal(fixture.sockets.length, 0);
});
