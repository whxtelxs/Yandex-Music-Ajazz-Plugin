'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

class SpotifyLauncher {
    constructor() {
        this.debugPort = 9233;
    }

    setDebugPort(port) {
        this.debugPort = port;
    }

    async detectRunningDebugPort() {
        if (process.platform !== 'win32') return null;
        try {
            const output = execFileSync('powershell.exe', [
                '-NoProfile', '-NonInteractive', '-Command',
                "Get-CimInstance Win32_Process -Filter \"Name = 'Spotify.exe'\" | Select-Object -ExpandProperty CommandLine"
            ], { encoding: 'utf8', windowsHide: true });
            const match = String(output).match(/--remote-debugging-port=(\d+)/i);
            return match ? Number(match[1]) : null;
        } catch (_) {
            return null;
        }
    }

    async isRunning() {
        if (process.platform !== 'win32') return false;
        try {
            const output = execFileSync('tasklist.exe', ['/FI', 'IMAGENAME eq Spotify.exe', '/NH'], {
                encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']
            });
            return /Spotify\.exe/i.test(String(output));
        } catch (_) {
            return false;
        }
    }

    async findSpotifyPath() {
        const candidates = [
            path.join(process.env.APPDATA || '', 'Spotify', 'Spotify.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Spotify', 'Spotify.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WindowsApps', 'Spotify.exe')
        ].filter(Boolean);
        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) return candidate;
        }
        try {
            const result = execFileSync('where.exe', ['Spotify.exe'], { encoding: 'utf8', windowsHide: true });
            return result.split(/\r?\n/).find(Boolean)?.trim() || null;
        } catch (_) {
            return null;
        }
    }

    async ensureYandexMusicRunning() {
        if (process.platform !== 'win32') {
            return { success: false, error: 'Запуск Spotify через CDP поддерживается только в Windows' };
        }
        const executable = await this.findSpotifyPath();
        if (!executable) {
            return { success: false, error: 'Spotify.exe не найден' };
        }
        const runningPort = await this.detectRunningDebugPort();
        if (runningPort) {
            this.debugPort = runningPort;
            return { success: true, port: runningPort, alreadyRunning: true, adjusted: false };
        }
        if (await this.isRunning()) {
            execFileSync('taskkill.exe', ['/IM', 'Spotify.exe', '/F', '/T'], { windowsHide: true });
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        const child = spawn(executable, [`--remote-debugging-port=${this.debugPort}`], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true
        });
        child.unref();
        return { success: true, port: this.debugPort, alreadyRunning: false, adjusted: false };
    }
}

module.exports = new SpotifyLauncher();
