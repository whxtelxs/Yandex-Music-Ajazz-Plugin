'use strict';

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { log } = require('./plugin');
const {
    parseDebugPortFromCommandLine,
    isPortInUse,
    findNearestFreePort
} = require('../lib/port-utils');

class YandexMusicLauncher {
    constructor() {
        this.platform = os.platform();
        this.debugPort = 9222;
        this.lastResolvedPort = null;
    }

    setDebugPort(port) {
        this.debugPort = port;
        if (this.isLinux()) {
            this.ensureDebugDesktop().catch(error => {
                log.warn('Не удалось обновить debug-ярлык:', error.message);
            });
        }
    }

    isLinux() {
        return this.platform === 'linux';
    }

    execLinux(command, options = {}) {
        return execSync(command, {
            encoding: 'utf-8',
            timeout: 5000,
            shell: '/bin/bash',
            ...options
        });
    }

    getLinuxProcessList() {
        try {
            return this.execLinux(
                `ps -eo args= | grep -E '/yandexmusic|/yandex-music' | grep -v 'node ' | grep -v 'plugin/index.js' || true`
            );
        } catch {
            return '';
        }
    }

    async getProcessCommandLines() {
        try {
            if (this.isLinux()) {
                const processes = this.getLinuxProcessList();
                return processes.split('\n').map(line => line.trim()).filter(Boolean);
            }

            if (this.platform === 'win32') {
                const result = execSync(
                    `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'Яндекс Музыка.exe' } | Select-Object -ExpandProperty CommandLine"`,
                    { encoding: 'utf-8', timeout: 5000 }
                );
                return result.split('\n').map(line => line.trim()).filter(Boolean);
            }

            if (this.platform === 'darwin') {
                const result = execSync(
                    `ps aux | grep -i "Яндекс Музыка" | grep -v grep | grep -v "yandex-music-launcher"`,
                    { encoding: 'utf-8', timeout: 3000, shell: '/bin/bash' }
                );
                return result.split('\n').map(line => line.trim()).filter(Boolean);
            }
        } catch (error) {
            log.warn('Не удалось получить командную строку процесса:', error.message);
        }
        return [];
    }

    async detectRunningDebugPort() {
        const commandLines = await this.getProcessCommandLines();
        for (const commandLine of commandLines) {
            const port = parseDebugPortFromCommandLine(commandLine);
            if (port) return port;
        }
        return null;
    }

    async waitForYandexMusicRunning({
        timeoutMs = 20000,
        intervalMs = 500
    } = {}) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (await this.isYandexMusicRunning()) return true;
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        return false;
    }

    async waitForDebugPortListening(port, {
        timeoutMs = 30000,
        intervalMs = 500
    } = {}) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            if (await isPortInUse(port)) return true;
            if (!(await this.isYandexMusicRunning())) return false;
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        return false;
    }

    async resolveRunningDebugPort(preferredPort = this.debugPort, {
        waitMs = 8000,
        intervalMs = 400
    } = {}) {
        const detected = await this.detectRunningDebugPort();
        if (detected) return detected;

        const deadline = Date.now() + waitMs;
        while (Date.now() < deadline) {
            const port = await this.detectRunningDebugPort();
            if (port) return port;
            if (await isPortInUse(preferredPort)) return preferredPort;
            if (!(await this.isYandexMusicRunning())) break;
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
        return null;
    }

    async resolveLaunchPort(preferredPort = this.debugPort) {
        const runningPort = await this.detectRunningDebugPort();
        if (runningPort) {
            log.info(`Яндекс Музыка уже использует порт ${runningPort}`);
            this.lastResolvedPort = runningPort;
            return { port: runningPort, adjusted: runningPort !== preferredPort, reason: 'running' };
        }

        if (!(await isPortInUse(preferredPort))) {
            this.lastResolvedPort = preferredPort;
            return { port: preferredPort, adjusted: false, reason: 'preferred-free' };
        }

        log.warn(`Порт ${preferredPort} занят, ищем ближайший свободный...`);
        const freePort = await findNearestFreePort(preferredPort);
        if (!freePort) {
            throw new Error(`Не удалось найти свободный порт, начиная с ${preferredPort}`);
        }

        log.info(`Выбран свободный порт ${freePort} вместо ${preferredPort}`);
        this.lastResolvedPort = freePort;
        return { port: freePort, adjusted: freePort !== preferredPort, reason: 'nearest-free' };
    }

    parseLinuxDesktopExec(execLine) {
        if (!execLine) return null;

        const cleaned = execLine
            .replace(/^Exec=/, '')
            .replace(/%[fFuUdDnNickvm]/g, '')
            .trim();

        const parts = cleaned.match(/(?:[^\s"']+|"[^"]*")+/g) || [];
        const unquoted = parts.map(part => part.replace(/^"|"$/g, ''));

        if (unquoted.length === 0) return null;

        return {
            binary: unquoted[0],
            extraArgs: unquoted.slice(1).filter(arg => !arg.startsWith('--remote-debugging-port='))
        };
    }

    findLinuxBinary() {
        const candidates = [
            '/opt/yandex-music/yandexmusic',
            '/opt/yandex-music/yandex-music',
            '/usr/bin/yandexmusic',
            '/usr/bin/yandex-music',
            path.join(process.env.HOME || '', '.local/bin/yandexmusic'),
            path.join(process.env.HOME || '', '.local/bin/yandex-music')
        ];

        for (const candidate of candidates) {
            if (fs.existsSync(candidate)) {
                return { binary: candidate, extraArgs: ['--gtk-version=3'] };
            }
        }

        for (const command of ['yandexmusic', 'yandex-music']) {
            try {
                const found = this.execLinux(`command -v ${command} 2>/dev/null`).trim();
                if (found) return { binary: found, extraArgs: ['--gtk-version=3'] };
            } catch {
                // continue
            }
        }

        return null;
    }

    getLinuxDebugDesktopPath() {
        return path.join(process.env.HOME || '', '.local/share/applications/yandexmusic-debug.desktop');
    }

    buildLinuxDebugDesktopContent(spec) {
        const args = [
            ...(spec.extraArgs || []),
            `--remote-debugging-port=${this.debugPort}`
        ];
        const exec = `${spec.binary} ${args.join(' ')}`;

        return `[Desktop Entry]
Name=Yandex Music (Debug)
Comment=Яндекс Музыка с CDP-портом для Stream Deck / OpenDeck
Exec=${exec}
Icon=yandexmusic
Terminal=false
Type=Application
Categories=Audio;Music;
StartupWMClass=Yandex Music
`;
    }

    async ensureDebugDesktop() {
        if (!this.isLinux()) return false;

        const spec = this.findLinuxBinary();
        if (!spec) {
            log.warn('Не удалось создать debug-ярлык: бинарь Яндекс Музыки не найден');
            return false;
        }

        const desktopPath = this.getLinuxDebugDesktopPath();
        fs.mkdirSync(path.dirname(desktopPath), { recursive: true });

        const content = this.buildLinuxDebugDesktopContent(spec);
        const existing = fs.existsSync(desktopPath) ? fs.readFileSync(desktopPath, 'utf-8') : '';

        if (existing !== content) {
            fs.writeFileSync(desktopPath, content, { mode: 0o644 });
            log.info('Debug-ярлык создан или обновлён:', desktopPath);
        }

        return true;
    }

    findLinuxLaunchSpec() {
        const debugDesktopPath = this.getLinuxDebugDesktopPath();

        try {
            if (fs.existsSync(debugDesktopPath)) {
                const content = fs.readFileSync(debugDesktopPath, 'utf-8');
                const execLine = content.split('\n').find(line => line.startsWith('Exec='));
                const parsed = this.parseLinuxDesktopExec(execLine);
                if (parsed?.binary && fs.existsSync(parsed.binary)) return parsed;
            }
        } catch {
            // continue
        }

        const desktopDirs = [
            path.join(process.env.HOME || '', '.local/share/applications'),
            '/usr/share/applications',
            '/usr/local/share/applications'
        ];
        const desktopNames = [
            'yandex-music-debug.desktop',
            'yandexmusic.desktop',
            'yandex-music.desktop'
        ];

        for (const dir of desktopDirs) {
            for (const name of desktopNames) {
                const desktopPath = path.join(dir, name);
                try {
                    if (!fs.existsSync(desktopPath)) continue;
                    const content = fs.readFileSync(desktopPath, 'utf-8');
                    const execLine = content.split('\n').find(line => line.startsWith('Exec='));
                    const parsed = this.parseLinuxDesktopExec(execLine);
                    if (parsed?.binary && fs.existsSync(parsed.binary)) return parsed;
                } catch {
                    // continue
                }
            }
        }

        return this.findLinuxBinary();
    }

    async findYandexMusicPath() {
        try {
            if (this.isLinux()) {
                return this.findLinuxLaunchSpec()?.binary || null;
            }

            if (this.platform === 'win32') {
                const possiblePaths = [
                    path.join(process.env.LOCALAPPDATA, 'Programs', 'YandexMusic', 'Яндекс Музыка.exe'),
                    path.join(process.env.APPDATA, '..', 'Local', 'Programs', 'YandexMusic', 'Яндекс Музыка.exe'),
                    path.join(process.env.PROGRAMFILES, 'YandexMusic', 'Яндекс Музыка.exe'),
                    path.join(process.env['PROGRAMFILES(X86)'], 'YandexMusic', 'Яндекс Музыка.exe')
                ];

                for (const possiblePath of possiblePaths) {
                    if (fs.existsSync(possiblePath)) {
                        log.info('Найден путь к Яндекс Музыке:', possiblePath);
                        return possiblePath;
                    }
                }

                try {
                    const whereResult = execSync('where "Яндекс Музыка.exe" 2>nul', { encoding: 'utf-8', timeout: 3000 });
                    if (whereResult?.trim()) return whereResult.trim().split('\n')[0];
                } catch {
                    // ignore
                }
            } else if (this.platform === 'darwin') {
                const possiblePaths = [
                    '/Applications/Яндекс Музыка.app',
                    path.join(process.env.HOME, 'Applications', 'Яндекс Музыка.app')
                ];

                for (const possiblePath of possiblePaths) {
                    if (fs.existsSync(possiblePath)) return possiblePath;
                }

                try {
                    const mdfindResult = execSync(
                        `mdfind "kMDItemKind == 'Application' && kMDItemDisplayName == 'Яндекс Музыка'" 2>/dev/null | head -1`,
                        { encoding: 'utf-8', timeout: 5000, shell: '/bin/bash' }
                    );
                    if (mdfindResult?.trim()) return mdfindResult.trim();
                } catch {
                    // ignore
                }
            }

            log.warn('Не удалось найти путь к Яндекс Музыке автоматически');
            return null;
        } catch (error) {
            log.error('Ошибка при поиске пути к Яндекс Музыке:', error);
            return null;
        }
    }

    async isYandexMusicRunning() {
        try {
            if (this.isLinux()) return this.getLinuxProcessList().trim().length > 0;

            if (this.platform === 'win32') {
                const result = execSync(
                    'tasklist /FI "IMAGENAME eq Яндекс Музыка.exe" /FO CSV /NH 2>nul',
                    { encoding: 'utf-8', timeout: 3000 }
                );
                return result?.trim().length > 0 && result.includes('Яндекс Музыка.exe');
            }

            if (this.platform === 'darwin') {
                const result = execSync(
                    `ps aux | grep -i "Яндекс Музыка" | grep -v grep | grep -v "yandex-music-launcher"`,
                    { encoding: 'utf-8', timeout: 3000, shell: '/bin/bash' }
                );
                return result?.trim().length > 0;
            }
        } catch (error) {
            log.error('Ошибка при проверке запущенного процесса:', error);
        }
        return false;
    }

    async isRunningWithDebugPort(port = this.debugPort) {
        const detected = await this.detectRunningDebugPort();
        return detected === port;
    }

    async killYandexMusic() {
        try {
            if (this.isLinux()) {
                this.execLinux(`pkill -f '[y]andexmusic|[y]andex-music' || true`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return true;
            }

            if (this.platform === 'win32') {
                execSync(`taskkill /IM "Яндекс Музыка.exe" /F /T 2>nul`, { timeout: 5000 });
                await new Promise(resolve => setTimeout(resolve, 1000));
                return true;
            }

            if (this.platform === 'darwin') {
                execSync(`killall "Яндекс Музыка" 2>/dev/null || true`, { timeout: 5000, shell: '/bin/bash' });
                await new Promise(resolve => setTimeout(resolve, 1000));
                return true;
            }
        } catch (error) {
            log.warn('Не удалось завершить процесс (возможно, он уже не запущен):', error.message);
        }
        return false;
    }

    async launchYandexMusic(appPath, port = this.debugPort) {
        try {
            if (this.isLinux()) {
                const spec = this.findLinuxLaunchSpec();
                if (!spec?.binary) {
                    log.error('Не удалось найти путь к Яндекс Музыке на Linux');
                    return false;
                }

                const args = [
                    ...(spec.extraArgs || []),
                    `--remote-debugging-port=${port}`
                ];

                const child = spawn(spec.binary, args, { detached: true, stdio: 'ignore' });
                child.unref();
                return true;
            }

            if (!appPath) {
                appPath = await this.findYandexMusicPath();
                if (!appPath) return false;
            }

            if (this.platform === 'win32') {
                try {
                    const escapedPath = appPath.replace(/\\/g, '\\\\').replace(/'/g, "''");
                    const command = `Start-Process -FilePath '${escapedPath}' -ArgumentList '--remote-debugging-port=${port}' -WindowStyle Normal`;
                    execSync(`powershell -NoProfile -Command "${command}"`, { timeout: 10000, encoding: 'utf-8' });
                } catch (error) {
                    log.error('Ошибка при запуске через PowerShell, пробуем spawn:', error.message);
                    const child = spawn(appPath, [`--remote-debugging-port=${port}`], {
                        detached: true,
                        stdio: 'ignore'
                    });
                    child.unref();
                }
                return true;
            }

            if (this.platform === 'darwin') {
                execSync(
                    `open -a "${appPath}" --args --remote-debugging-port=${port}`,
                    { timeout: 10000, shell: '/bin/bash' }
                );
                return true;
            }
        } catch (error) {
            log.error('Ошибка при запуске Яндекс Музыки:', error);
        }
        return false;
    }

    async ensureYandexMusicRunning() {
        try {
            log.info('Проверка состояния Яндекс Музыки...');
            const preferredPort = this.debugPort;

            const isRunning = await this.isYandexMusicRunning();
            if (isRunning) {
                const detectedPort = await this.resolveRunningDebugPort(preferredPort);
                if (detectedPort) {
                    log.info(`Яндекс Музыка уже запущена с портом ${detectedPort}`);
                    this.setDebugPort(detectedPort);
                    return {
                        success: true,
                        port: detectedPort,
                        adjusted: detectedPort !== preferredPort,
                        alreadyRunning: true
                    };
                }

                log.info('Яндекс Музыка запущена без debug-порта, перезапускаем...');
                await this.killYandexMusic();
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            const resolved = await this.resolveLaunchPort(preferredPort);
            this.setDebugPort(resolved.port);

            log.info(`Запуск Яндекс Музыки с --remote-debugging-port=${resolved.port}`);
            const spawned = await this.launchYandexMusic(null, resolved.port);
            if (!spawned) {
                return { success: false, port: resolved.port, adjusted: resolved.adjusted };
            }

            const running = await this.waitForYandexMusicRunning({ timeoutMs: 20000 });
            if (!running) {
                log.error('Процесс Яндекс Музыки не появился после запуска');
                return { success: false, port: resolved.port, adjusted: resolved.adjusted };
            }

            const confirmedPort = await this.resolveRunningDebugPort(resolved.port, { waitMs: 12000 }) || resolved.port;

            return {
                success: true,
                port: confirmedPort,
                adjusted: confirmedPort !== preferredPort || resolved.adjusted,
                alreadyRunning: false
            };
        } catch (error) {
            log.error('Ошибка при проверке/запуске Яндекс Музыки:', error);
            return { success: false, port: this.debugPort, adjusted: false, error: error.message };
        }
    }
}

module.exports = new YandexMusicLauncher();
