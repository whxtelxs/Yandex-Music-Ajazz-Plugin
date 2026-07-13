'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const PLUGIN_MARKER = {
    author: 'whxtelxs',
    actionPrefix: 'com.whxtelxs.streamdock.yandexmusicajazz.'
};

function readManifest(dir) {
    try {
        const manifestPath = path.join(dir, 'manifest.json');
        if (!fs.existsSync(manifestPath)) return null;
        return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
        return null;
    }
}

function isOurPluginManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') return false;
    if (manifest.Author !== PLUGIN_MARKER.author) return false;
    const actions = Array.isArray(manifest.Actions) ? manifest.Actions : [];
    return actions.some(action => String(action.UUID || '').startsWith(PLUGIN_MARKER.actionPrefix));
}

function getRuntimePluginRoot() {
    const fromLib = path.resolve(__dirname, '..', '..');
    if (fs.existsSync(path.join(fromLib, 'manifest.json'))) {
        return fromLib;
    }
    const mainFile = require.main?.filename;
    if (mainFile) {
        const fromMain = path.resolve(path.dirname(mainFile), '..');
        if (fs.existsSync(path.join(fromMain, 'manifest.json'))) {
            return fromMain;
        }
    }
    return fromLib;
}

function getPluginSearchRoots() {
    const roots = new Set();
    const appData = process.env.APPDATA;
    const localAppData = process.env.LOCALAPPDATA;
    const home = os.homedir();

    if (appData) {
        roots.add(path.join(appData, 'HotSpot', 'StreamDock', 'plugins'));
        roots.add(path.join(appData, 'StreamDock', 'plugins'));
    }
    if (localAppData) {
        roots.add(path.join(localAppData, 'HotSpot', 'StreamDock', 'plugins'));
        roots.add(path.join(localAppData, 'StreamDock', 'plugins'));
    }
    if (home && process.platform === 'darwin') {
        roots.add(path.join(home, 'Library', 'Application Support', 'HotSpot', 'StreamDock', 'plugins'));
    }

    roots.add(getRuntimePluginRoot());
    return [...roots].filter(root => fs.existsSync(root));
}

function findRegisteredPluginDirs() {
    const matches = [];
    for (const root of getPluginSearchRoots()) {
        let entries = [];
        try {
            entries = fs.readdirSync(root, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const candidate = path.join(root, entry.name);
            const manifest = readManifest(candidate);
            if (!isOurPluginManifest(manifest)) continue;
            matches.push({
                dir: candidate,
                version: String(manifest.Version || '').trim(),
                root
            });
        }
    }
    return matches;
}

function normalizeDir(dir) {
    if (!dir) return null;
    try {
        return fs.realpathSync.native ? fs.realpathSync.native(dir) : fs.realpathSync(dir);
    } catch {
        return path.resolve(dir);
    }
}

function resolvePluginInstallDir() {
    const runtimeRoot = normalizeDir(getRuntimePluginRoot());
    const registered = findRegisteredPluginDirs();

    if (!registered.length) {
        return {
            dir: runtimeRoot,
            runtimeDir: runtimeRoot,
            source: 'runtime',
            registered: []
        };
    }

    const normalizedMatches = registered.map(item => ({
        ...item,
        dir: normalizeDir(item.dir)
    }));

    const runtimeMatch = normalizedMatches.find(item => item.dir === runtimeRoot);
    if (runtimeMatch) {
        return {
            dir: runtimeMatch.dir,
            runtimeDir: runtimeRoot,
            source: 'runtime',
            registered: normalizedMatches
        };
    }

    const pluginsFolderMatch = normalizedMatches.find(item => /[\\/]plugins([\\/]|$)/i.test(item.dir));
    const chosen = pluginsFolderMatch || normalizedMatches[0];
    return {
        dir: chosen.dir,
        runtimeDir: runtimeRoot,
        source: 'registered',
        registered: normalizedMatches
    };
}

module.exports = {
    PLUGIN_MARKER,
    getRuntimePluginRoot,
    getPluginSearchRoots,
    findRegisteredPluginDirs,
    resolvePluginInstallDir,
    isOurPluginManifest
};
