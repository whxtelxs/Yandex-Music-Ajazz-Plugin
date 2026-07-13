'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'node_modules', 'discord-rpc', 'src');

function patchFile(relativePath, replacements) {
    const filePath = path.join(root, relativePath);
    if (!fs.existsSync(filePath)) {
        console.warn(`[patch-discord-rpc] skip missing file: ${relativePath}`);
        return;
    }
    let source = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    for (const [from, to] of replacements) {
        if (source.includes(from)) {
            source = source.replace(from, to);
            changed = true;
        }
    }
    if (changed) {
        fs.writeFileSync(filePath, source, 'utf8');
        console.log(`[patch-discord-rpc] patched ${relativePath}`);
    }
}

patchFile('client.js', [
    ['reject(new Error(\'RPC_CONNECTION_TIMEOUT\')), 10e3)', 'reject(new Error(\'RPC_CONNECTION_TIMEOUT\')), 45e3)']
]);

patchFile('transports/ipc.js', [
    ['if (id < 10) {', 'if (id < 30) {']
]);
