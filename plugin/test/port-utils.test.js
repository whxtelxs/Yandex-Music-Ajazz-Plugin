'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const {
    parseDebugPortFromCommandLine,
    isPortInUse,
    findNearestFreePort
} = require('../lib/port-utils');

function listen(port) {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}

function close(server) {
    return new Promise(resolve => server.close(resolve));
}

test('parseDebugPortFromCommandLine extracts debug port', () => {
    assert.equal(
        parseDebugPortFromCommandLine('C:\\Apps\\Яндекс Музыка.exe --remote-debugging-port=9225'),
        9225
    );
    assert.equal(parseDebugPortFromCommandLine('no debug flag'), null);
});

test('findNearestFreePort skips occupied ports', async t => {
    const blocker = await listen(0);
    const occupiedPort = blocker.address().port;
    t.after(() => close(blocker));

    const freePort = await findNearestFreePort(occupiedPort, { maxAttempts: 5 });
    assert.ok(freePort);
    assert.notEqual(freePort, occupiedPort);
    assert.equal(await isPortInUse(occupiedPort), true);
    assert.equal(await isPortInUse(freePort), false);
});
