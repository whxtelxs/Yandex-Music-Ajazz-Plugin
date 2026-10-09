'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { checkProject, INSTALL_DIR } = require('./scripts/project-check');
const { getProductionModulePaths } = require('./scripts/production-modules');

const projectRoot = path.resolve(__dirname, '..');
const pluginName = INSTALL_DIR;
checkProject(projectRoot);
const releaseRoot = path.join(projectRoot, 'release');
const finalRoot = path.join(releaseRoot, pluginName);
const stagingRoot = path.join(releaseRoot, '.stage-' + process.pid);
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'manifest.json'), 'utf8'));
const version = String(manifest.Version || '').trim();
const packageLock = JSON.parse(fs.readFileSync(path.join(__dirname, 'package-lock.json'), 'utf8'));
const devModulePaths = new Set(
    Object.entries(packageLock.packages || {})
        .filter(([modulePath, metadata]) => modulePath.startsWith('node_modules/') && metadata.dev)
        .map(([modulePath]) => `plugin/${modulePath}`.replaceAll('\\', '/'))
);

if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Некорректная версия в manifest.json: "${version}"`);
}

const zipPath = path.join(releaseRoot, `YandexMusic.Ajazz.Plugin.v${version}.zip`);

const productionModulePaths = getProductionModulePaths(packageLock, __dirname);

function normalize(relativePath) {
    return relativePath.split(path.sep).join('/');
}

function shouldExclude(relativePath) {
    const normalized = normalize(relativePath);
    if (!normalized) return false;
    const parts = normalized.split('/');
    const allowedRoot = new Set(['manifest.json', 'ru.json', 'readme.md', 'LICENSE', 'THIRD_PARTY_NOTICES.txt', 'static', 'propertyInspector', 'plugin']);
    if (!allowedRoot.has(parts[0])) return true;
    if (parts[0] === 'propertyInspector') return normalized === 'propertyInspector/tailwind.input.css' || normalized.startsWith('propertyInspector/dashboard/src') || normalized.endsWith('.map');
    if (parts[0] !== 'plugin') return false;
    const allowedPlugin = new Set(['index.js', 'config.js', 'package.json', 'actions', 'lib', 'utils', 'node_modules']);
    if (parts[1] && !allowedPlugin.has(parts[1])) return true;
    if (normalized.startsWith('plugin/node_modules/.')) return true;
    for (const modulePath of devModulePaths) {
        if (normalized === modulePath || normalized.startsWith(modulePath + '/')) return true;
    }
    if (normalized.startsWith('plugin/node_modules/')) {
        const index = parts.lastIndexOf('node_modules');
        if (!parts[index + 1]) return false;
        const scoped = parts[index + 1].startsWith('@');
        const modulePath = parts.slice(0, index + (scoped ? 3 : 2)).join('/');
        if (scoped && !parts[index + 2]) return ![...productionModulePaths].some(name => name.startsWith(modulePath + '/'));
        return !productionModulePaths.has(modulePath);
    }
    return false;
}

function copyProject(sourceDir, destinationDir, relativeDir = '') {
    fs.mkdirSync(destinationDir, { recursive: true });
    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
        const relativePath = path.join(relativeDir, entry.name);
        if (shouldExclude(relativePath)) continue;

        const sourcePath = path.join(sourceDir, entry.name);
        const destinationPath = path.join(destinationDir, entry.name);
        if (entry.isDirectory()) {
            copyProject(sourcePath, destinationPath, relativePath);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
            fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
            fs.copyFileSync(sourcePath, destinationPath);
            fs.chmodSync(destinationPath, fs.statSync(sourcePath).mode);
        }
    }
}

function removeEmptyDirectories(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.isDirectory()) removeEmptyDirectories(path.join(directory, entry.name));
    }
    if (directory !== stagingRoot && fs.readdirSync(directory).length === 0) {
        fs.rmdirSync(directory);
    }
}

const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let value = i;
        for (let bit = 0; bit < 8; bit++) {
            value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
        }
        table[i] = value >>> 0;
    }
    return table;
})();

function crc32(buffer) {
    let crc = 0xFFFFFFFF;
    for (const byte of buffer) {
        crc = crcTable[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date) {
    const year = Math.max(1980, date.getFullYear());
    return {
        time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
        date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
    };
}

function collectFiles(directory, relativeDir = '') {
    const files = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const relativePath = path.join(relativeDir, entry.name);
        const absolutePath = path.join(directory, entry.name);
        if (entry.isDirectory()) files.push(...collectFiles(absolutePath, relativePath));
        else if (entry.isFile()) files.push({ absolutePath, relativePath: normalize(relativePath) });
    }
    return files;
}

function createZip(sourceDir, destinationZip) {
    const files = collectFiles(sourceDir).sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
        const data = fs.readFileSync(file.absolutePath);
        const compressed = zlib.deflateRawSync(data, { level: 9 });
        const checksum = crc32(data);
        const name = Buffer.from(`${pluginName}/${file.relativePath}`, 'utf8');
        const timestamp = dosDateTime(fs.statSync(file.absolutePath).mtime);

        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034B50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt16LE(0x0800, 6);
        localHeader.writeUInt16LE(8, 8);
        localHeader.writeUInt16LE(timestamp.time, 10);
        localHeader.writeUInt16LE(timestamp.date, 12);
        localHeader.writeUInt32LE(checksum, 14);
        localHeader.writeUInt32LE(compressed.length, 18);
        localHeader.writeUInt32LE(data.length, 22);
        localHeader.writeUInt16LE(name.length, 26);

        localParts.push(localHeader, name, compressed);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014B50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt16LE(0x0800, 8);
        centralHeader.writeUInt16LE(8, 10);
        centralHeader.writeUInt16LE(timestamp.time, 12);
        centralHeader.writeUInt16LE(timestamp.date, 14);
        centralHeader.writeUInt32LE(checksum, 16);
        centralHeader.writeUInt32LE(compressed.length, 20);
        centralHeader.writeUInt32LE(data.length, 24);
        centralHeader.writeUInt16LE(name.length, 28);
        centralHeader.writeUInt32LE(offset, 42);
        centralParts.push(centralHeader, name);

        offset += localHeader.length + name.length + compressed.length;
    }

    const centralDirectory = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054B50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(offset, 16);

    fs.writeFileSync(destinationZip, Buffer.concat([...localParts, centralDirectory, end]));
    return files.length;
}

function verifyZip(file) {
    const archive = fs.readFileSync(file);
    let offset = 0;
    let count = 0;
    while (archive.readUInt32LE(offset) === 0x04034B50) {
        const checksum = archive.readUInt32LE(offset + 14);
        const compressedSize = archive.readUInt32LE(offset + 18);
        const size = archive.readUInt32LE(offset + 22);
        const nameLength = archive.readUInt16LE(offset + 26);
        const extraLength = archive.readUInt16LE(offset + 28);
        const name = archive.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
        if (!name.startsWith(pluginName + '/') || name.includes('../')) throw new Error('Invalid ZIP path');
        const dataStart = offset + 30 + nameLength + extraLength;
        const data = zlib.inflateRawSync(archive.subarray(dataStart, dataStart + compressedSize));
        if (data.length !== size || crc32(data) !== checksum) throw new Error('Invalid ZIP checksum: ' + name);
        offset = dataStart + compressedSize;
        count++;
    }
    if (!count || archive.readUInt32LE(offset) !== 0x02014B50) throw new Error('Invalid ZIP directory');
    return count;
}

fs.mkdirSync(releaseRoot, { recursive: true });
const temporaryZip = zipPath + '.' + process.pid + '.tmp';
const backupRoot = finalRoot + '.backup-' + process.pid;
let previousMoved = false;
let installed = false;
try {
    require('./scripts/patch-discord-rpc');
    copyProject(projectRoot, stagingRoot);
    removeEmptyDirectories(stagingRoot);
    const files = collectFiles(stagingRoot);
    const hashes = Object.fromEntries(files.map(file => [file.relativePath, crypto.createHash('sha256').update(fs.readFileSync(file.absolutePath)).digest('hex')]));
    let commit = null;
    let dirty = true;
    try {
        commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
        dirty = !!execFileSync('git', ['status', '--porcelain'], { cwd: projectRoot, encoding: 'utf8' }).trim();
    } catch {}
    fs.writeFileSync(path.join(stagingRoot, 'build-info.json'), JSON.stringify({ version, commit, dirty, builtAt: new Date().toISOString(), node: process.version, hashes }, null, 2));
    const fileCount = createZip(stagingRoot, temporaryZip);
    if (verifyZip(temporaryZip) !== fileCount) throw new Error('ZIP file count mismatch');
    if (fs.existsSync(finalRoot)) { fs.renameSync(finalRoot, backupRoot); previousMoved = true; }
    fs.renameSync(stagingRoot, finalRoot);
    installed = true;
    fs.renameSync(temporaryZip, zipPath);
    if (previousMoved) fs.rmSync(backupRoot, { recursive: true, force: true });
    console.log('Релиз v' + version + ': ' + zipPath);
    console.log('Проверено файлов: ' + fileCount);
} catch (error) {
    if (previousMoved) {
        if (installed) fs.rmSync(finalRoot, { recursive: true, force: true });
        fs.renameSync(backupRoot, finalRoot);
    }
    throw error;
} finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    fs.rmSync(temporaryZip, { force: true });
}
