'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const STATE_DIR = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'YandexMusicAjazzPlugin');
const STATE_FILE = path.join(STATE_DIR, 'update-state.json');

function readState() {
    try {
        return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch {
        return {};
    }
}

function writeState(patch) {
    const next = {
        ...readState(),
        ...patch,
        updatedAt: new Date().toISOString()
    };
    fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2), 'utf8');
    return next;
}

module.exports = {
    STATE_DIR,
    readState,
    writeState
};
