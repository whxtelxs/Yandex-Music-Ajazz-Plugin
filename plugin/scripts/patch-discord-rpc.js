'use strict';

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'node_modules', 'discord-rpc');
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (metadata.version !== '4.0.1') throw new Error('Unsupported discord-rpc version: ' + metadata.version);

function patchFile(relativePath, from, to) {
    const filePath = path.join(root, 'src', relativePath);
    const source = fs.readFileSync(filePath, 'utf8');
    if (source.includes(to)) return;
    if (!source.includes(from)) throw new Error('Discord patch does not match ' + relativePath);
    fs.writeFileSync(filePath, source.replace(from, to), 'utf8');
}

patchFile('client.js', "reject(new Error('RPC_CONNECTION_TIMEOUT')), 10e3)", "reject(new Error('RPC_CONNECTION_TIMEOUT')), 45e3)");
patchFile('transports/ipc.js', 'if (id < 10) {', 'if (id < 30) {');

patchFile('transports/ipc.js', 'this.socket = null;', 'this.socket = null;\n    this.closed = false;');
patchFile('transports/ipc.js', 'const socket = this.socket = await getIPC();', 'const socket = this.socket = await getIPC();\n    if (this.closed) { socket.destroy(); return; }');
patchFile('transports/ipc.js', 'async close() {', 'async close() {\n    this.closed = true;\n    if (!this.socket) return;');

patchFile('transports/websocket.js', 'this.tries = 0;', 'this.tries = 0;\n    this.closed = false;\n    this.retryTimer = null;');
patchFile('transports/websocket.js', 'async connect() {', 'async connect() {\n    if (this.closed) return;');
patchFile('transports/websocket.js', 'onError(event) {', 'onError(event) {\n    if (this.closed) return;');
patchFile('transports/websocket.js', 'setTimeout(() => {\n        this.connect();', "this.retryTimer = setTimeout(() => {\n        this.retryTimer = null;\n        this.connect().catch(error => this.emit('error', error));");
patchFile('transports/websocket.js',
  "close() {\n    return new Promise((r) => {\n      this.once('close', r);\n      this.ws.close();\n    });\n  }",
  "close() {\n    this.closed = true;\n    clearTimeout(this.retryTimer);\n    this.retryTimer = null;\n    if (!this.ws || this.ws.readyState === 3) return Promise.resolve();\n    return new Promise(resolve => {\n      this.ws.addEventListener('close', resolve, { once: true });\n      this.ws.close();\n    });\n  }");
