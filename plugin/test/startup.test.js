'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { WebSocketServer } = require('ws');

async function launch(t, fatal = false) {
    const host = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise(resolve => host.once('listening', resolve));
    t.after(() => new Promise(resolve => host.close(resolve)));
    const messages = [];
    let connection;
    let ready;
    const registered = new Promise(resolve => { ready = resolve; });
    host.on('connection', socket => {
        connection = socket;
        socket.on('message', raw => {
            const message = JSON.parse(raw.toString());
            messages.push(message);
            if (message.event === 'getGlobalSettings') {
                socket.send(JSON.stringify({ event: 'didReceiveGlobalSettings', payload: { settings: { debugPort: 9222, discordRpcEnabled: false } } }));
                ready();
            }
        });
    });
    const child = spawn(process.execPath, ['--require', path.join(__dirname, 'fixtures/startup-preload.cjs'), path.join(__dirname, '../index.js'), '-port', String(host.address().port), '-pluginUUID', 'test-plugin', '-registerEvent', 'registerPlugin', '-info', '{}'], { cwd: path.resolve(__dirname, '..'), windowsHide: true, env: { ...process.env, AUDIT_FATAL_TEST: fatal ? '1' : '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    const completed = new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', (code, signal) => resolve({ code, signal })); });
    const timeout = setTimeout(() => child.kill(), 6000);
    t.after(() => { clearTimeout(timeout); child.kill(); connection?.terminate(); });
    const initial = await Promise.race([registered.then(() => true), completed.then(() => false)]);
    assert.equal(initial, true, output);
    return { messages, completed, disconnect: () => connection.close(), getOutput: () => output };
}

test('entry registers with StreamDock and exits cleanly when the host disconnects', async t => {
    const run = await launch(t);
    assert.equal(run.messages[0].event, 'registerPlugin');
    assert.equal(run.messages[0].uuid, 'test-plugin');
    run.disconnect();
    const exit = await run.completed;
    assert.equal(exit.code, 0, run.getOutput());
    assert.equal(exit.signal, null);
});

test('fatal startup errors exit nonzero instead of silently passing', async t => {
    const run = await launch(t, true);
    const exit = await run.completed;
    assert.equal(exit.code, 1, run.getOutput());
    assert.equal(exit.signal, null);
});
