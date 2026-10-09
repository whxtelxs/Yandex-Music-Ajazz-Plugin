'use strict';

const fs = require('node:fs');
const path = require('node:path');

const INSTALL_DIR = 'com.whxtelxs.streamdock.yandexmusic.sdPlugin';

function checkProject(root) {
    const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
    const manifest = read('manifest.json');
    const metadata = read('plugin/package.json');
    const lock = read('plugin/package-lock.json');
    const version = manifest.Version;
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('Неверная версия manifest.json');
    if ([metadata.version, lock.version, lock.packages?.['']?.version].some(value => value !== version)) {
        throw new Error('Версии manifest.json, package.json и package-lock.json не совпадают');
    }
    for (const field of ['dependencies', 'devDependencies']) {
        const current = metadata[field] || {};
        const saved = lock.packages?.['']?.[field] || {};
        const keys = new Set([...Object.keys(current), ...Object.keys(saved)]);
        if ([...keys].some(key => current[key] !== saved[key])) throw new Error('package-lock.json не соответствует ' + field);
    }
    const files = new Set();
    const fileKeys = new Set(['Icon', 'Image', 'CategoryIcon', 'CodePathWin', 'CodePathMac', 'PropertyInspectorPath']);
    function collect(value) {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
            if (fileKeys.has(key) && typeof child === 'string') {
                if (key === 'Image' && /^data:image\/[^;]+;base64,/.test(child)) continue;
                files.add(child);
            }
            else collect(child);
        }
    }
    collect(manifest);
    for (const file of files) {
        const resolved = path.resolve(root, file);
        const relative = path.relative(root, resolved);
        if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
            throw new Error('Неверный файл в манифесте: ' + file);
        }
    }
    const uuids = (manifest.Actions || []).map(action => action.UUID);
    if (!uuids.length || uuids.some(uuid => !uuid) || new Set(uuids).size !== uuids.length) {
        throw new Error('Действия должны иметь уникальные UUID');
    }
    return { version, files: files.size };
}

module.exports = { checkProject, INSTALL_DIR };
