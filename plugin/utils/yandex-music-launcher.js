'use strict';

const { execFile, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { log } = require('../lib/logger');
const { parseDebugPortFromCommandLine, findNearestFreePort } = require('../lib/port-utils');
const { delay } = require('../lib/async-utils');
const { isMusicTarget } = require('../lib/music-target');

function runCommand(file, args, timeout = 5000) {
    return new Promise((resolve, reject) => {
        execFile(file, args, { encoding: 'utf8', timeout, windowsHide: true, maxBuffer: 2 * 1024 * 1024 },
            (error, stdout) => error ? reject(error) : resolve(stdout.trim()));
    });
}

function debugPortReady(port) {
    return new Promise(resolve => {
        let settled = false;
        const finish = value => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
        };
        const request = http.get({ host: '127.0.0.1', port, path: '/json/list', timeout: 1200 }, response => {
            let text = '';
            response.setEncoding('utf8');
            response.on('data', chunk => {
                text += chunk;
                if (text.length > 256 * 1024) request.destroy();
            });
            response.on('end', () => {
                try {
                    const targets = JSON.parse(text);
                    finish(Array.isArray(targets) && targets.some(isMusicTarget));
                } catch { finish(false); }
            });
            response.on('error', () => finish(false));
            response.on('aborted', () => finish(false));
        });
        const timer = setTimeout(() => { request.destroy(); finish(false); }, 1500);
        request.on('timeout', () => request.destroy());
        request.on('error', () => finish(false));
    });
}

class YandexMusicLauncher {
    constructor({ platform = os.platform(), command = runCommand } = {}) {
        this.platform = platform;
        this.command = command;
        this.debugPort = 9222;
        this._processCache = null;
    }

    setDebugPort(port) { this.debugPort = port; }
    isLinux() { return this.platform === 'linux'; }

    async getProcessCommandLines({ fresh = false } = {}) {
        if (!fresh && this._processCache && Date.now() - this._processCache.at < 2000) return this._processCache.lines;
        let lines;
        if (this.platform === 'win32') {
            const script = "[Console]::OutputEncoding = [Text.Encoding]::UTF8; @(Get-CimInstance Win32_Process -Filter \"Name = 'Яндекс Музыка.exe'\" | Select-Object -ExpandProperty CommandLine) | ConvertTo-Json -Compress";
            const output = await this.command('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
            const parsed = output ? JSON.parse(output) : [];
            lines = (Array.isArray(parsed) ? parsed : [parsed]).filter(value => typeof value === 'string');
        } else {
            const output = await this.command('ps', ['-eo', 'args=']);
            lines = output.split('\n').map(line => line.trim()).filter(line =>
                /(?:\/yandexmusic|\/yandex-music|Яндекс Музыка\.app\/)/i.test(line) && !/\bnode\b|plugin\/index\.js/.test(line));
        }
        this._processCache = { at: Date.now(), lines };
        return lines;
    }

    async detectRunningDebugPort() {
        try {
            const lines = await this.getProcessCommandLines();
            for (const line of lines) {
                const port = parseDebugPortFromCommandLine(line);
                if (port && await debugPortReady(port)) return port;
            }
        } catch (error) { log.debug('Проверка процесса:', error.message); }
        return null;
    }

    async isYandexMusicRunning() {
        return (await this.getProcessCommandLines()).length > 0;
    }

    async findYandexMusicPath() {
        let candidates = [];
        if (this.platform === 'win32') {
            candidates = [
                process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'YandexMusic', 'Яндекс Музыка.exe'),
                process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, 'YandexMusic', 'Яндекс Музыка.exe'),
                process.env['PROGRAMFILES(X86)'] && path.join(process.env['PROGRAMFILES(X86)'], 'YandexMusic', 'Яндекс Музыка.exe')
            ];
        } else if (this.platform === 'darwin') {
            candidates = ['/Applications/Яндекс Музыка.app', path.join(os.homedir(), 'Applications', 'Яндекс Музыка.app')];
        } else {
            candidates = ['/opt/yandex-music/yandexmusic', '/opt/yandex-music/yandex-music', '/usr/bin/yandexmusic', '/usr/bin/yandex-music'];
        }
        return candidates.find(candidate => candidate && fs.existsSync(candidate)) || null;
    }

    async launchYandexMusic(port = this.debugPort) {
        const resolved = await this.findYandexMusicPath();
        if (!resolved) throw new Error('Яндекс Музыка не найдена. Установите приложение или запустите его вручную с портом отладки');
        const args = ['--remote-debugging-port=' + port, '--remote-debugging-address=127.0.0.1'];
        if (this.platform === 'darwin') {
            await this.command('open', ['-a', resolved, '--args', ...args]);
        } else {
            await new Promise((resolve, reject) => {
                const child = spawn(resolved, args, { detached: true, stdio: 'ignore' });
                child.once('error', reject);
                child.once('spawn', () => { child.unref(); resolve(); });
            });
        }
        this._processCache = null;
        return true;
    }

    async closeYandexMusic() {
        if (this.platform === 'win32') {
            await this.command('taskkill.exe', ['/IM', 'Яндекс Музыка.exe', '/T']);
        } else if (this.platform === 'darwin') {
            await this.command('osascript', ['-e', 'tell application "Яндекс Музыка" to quit']);
        } else {
            await this.command('pkill', ['-TERM', '-f', '^(/[^ ]*/)?(yandexmusic|yandex-music)( |$)']);
        }
        this._processCache = null;
        for (let attempt = 0; attempt < 12; attempt++) {
            if (!(await this.isYandexMusicRunning())) return;
            await delay(500);
            this._processCache = null;
        }
        throw new Error('Яндекс Музыка не закрылась. Закройте её вручную');
    }

    async ensureYandexMusicRunning({ restart = false } = {}) {
        try {
            const running = await this.isYandexMusicRunning();
            if (running) {
                const activePort = await this.detectRunningDebugPort();
                if (activePort) return { success: true, port: activePort, adjusted: activePort !== this.debugPort, alreadyRunning: true };
                if (!restart) return { success: false, restartRequired: true, error: 'Музыка открыта без доступного порта отладки. Для управления нужен перезапуск' };
                await this.closeYandexMusic();
            }
            const port = await findNearestFreePort(this.debugPort);
            if (!port) throw new Error('Свободный порт отладки не найден');
            await this.launchYandexMusic(port);
            const deadline = Date.now() + 25000;
            while (Date.now() < deadline) {
                if (await debugPortReady(port)) {
                    const adjusted = port !== this.debugPort;
                    this.debugPort = port;
                    return { success: true, port, adjusted, alreadyRunning: false };
                }
                await delay(500);
            }
            throw new Error('Музыка запущена, но интерфейс отладки пока не готов. Проверьте соединение');
        } catch (error) {
            return { success: false, port: this.debugPort, adjusted: false, error: error.message };
        }
    }
}

module.exports = new YandexMusicLauncher();
module.exports.YandexMusicLauncher = YandexMusicLauncher;
module.exports.debugPortReady = debugPortReady;
module.exports.runCommand = runCommand;
