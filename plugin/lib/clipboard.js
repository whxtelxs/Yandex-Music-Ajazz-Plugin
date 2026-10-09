'use strict';

const { spawn } = require('node:child_process');

function writeClipboard(text, { platform = process.platform, startProcess = spawn } = {}) {
    let command;
    let args;
    if (platform === 'win32') {
        command = 'powershell.exe';
        args = ['-NoProfile', '-NonInteractive', '-STA', '-Command',
            "$ErrorActionPreference = 'Stop'; [Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false); Set-Clipboard -Value ([Console]::In.ReadToEnd())"];
    } else if (platform === 'darwin') {
        command = '/usr/bin/pbcopy';
        args = [];
    } else return Promise.reject(new Error('Копирование не поддерживается в этой системе'));
    return new Promise((resolve, reject) => {
        const child = startProcess(command, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
        const timer = setTimeout(() => {
            child.kill();
            reject(new Error('Не удалось записать ссылку в буфер обмена: время ожидания истекло'));
        }, 5000);
        const fail = error => { clearTimeout(timer); child.kill(); reject(error); };
        child.once('error', fail);
        child.stdin.once('error', fail);
        child.once('close', code => {
            clearTimeout(timer);
            if (code === 0) resolve();
            else reject(new Error('Не удалось записать ссылку в буфер обмена'));
        });
        child.stdin.end(text, 'utf8');
    });
}

module.exports = { writeClipboard };
