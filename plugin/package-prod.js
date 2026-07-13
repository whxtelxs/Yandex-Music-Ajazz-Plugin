'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const projectRoot = path.resolve(__dirname, '..');
const pluginName = path.basename(projectRoot);
const releaseRoot = path.join(projectRoot, 'release');
const stagingRoot = path.join(releaseRoot, pluginName);
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'manifest.json'), 'utf8'));
const version = String(manifest.Version || '').trim();
const packageLock = JSON.parse(fs.readFileSync(path.join(__dirname, 'package-lock.json'), 'utf8'));
const devModulePaths = new Set(
    Object.entries(packageLock.packages || {})
        .filter(([modulePath, metadata]) => modulePath.startsWith('node_modules/') && metadata.dev)
        .map(([modulePath]) => `plugin/${modulePath}`.replaceAll('\\', '/'))
);
const runtimeBinFiles = new Set([
    'chrome-remote-interface',
    'chrome-remote-interface.cmd',
    'chrome-remote-interface.ps1'
]);

if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Некорректная версия в manifest.json: "${version}"`);
}

const zipPath = path.join(releaseRoot, `YandexMusic.Ajazz.Plugin.v${version}.zip`);

function normalize(relativePath) {
    return relativePath.split(path.sep).join('/');
}

function shouldExclude(relativePath) {
    const normalized = normalize(relativePath);
    const parts = normalized.split('/');
    const fileName = parts[parts.length - 1];

    if (!normalized) return false;
    if (parts[0] === '.git' || fileName === '.gitignore') return true;
    if (parts[0] === 'release') return true;
    if (normalized === 'plugin/build' || normalized.startsWith('plugin/build/')) return true;
    if (normalized === 'plugin/log' || normalized.startsWith('plugin/log/')) return true;
    if (normalized === 'plugin/test' || normalized.startsWith('plugin/test/')) return true;
    if (normalized === 'propertyInspector/tailwind.input.css') return true;
    if (parts[0] === 'log' || parts[0] === 'ym-test-plugin') return true;
    if (parts[0] === 'static' && /^git/i.test(fileName)) return true;
    if (normalized.startsWith('plugin/node_modules/.bin/') && !runtimeBinFiles.has(fileName)) return true;
    for (const modulePath of devModulePaths) {
        if (normalized === modulePath || normalized.startsWith(`${modulePath}/`)) return true;
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

fs.rmSync(releaseRoot, { recursive: true, force: true });
copyProject(projectRoot, stagingRoot);
removeEmptyDirectories(stagingRoot);
const releaseReadme = path.join(stagingRoot, 'readme.md');
if (fs.existsSync(releaseReadme)) {
    const cleanedReadme = fs.readFileSync(releaseReadme, 'utf8')
        .replace(/^!\[[^\]]*]\(static\/git[^)]*\)\s*$/gim, '');
    fs.writeFileSync(releaseReadme, cleanedReadme);
}

const fileCount = createZip(stagingRoot, zipPath);
const zipSizeMb = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);

console.log(`Релиз v${version} готов:`);
console.log(`  Папка: ${stagingRoot}`);
console.log(`  Архив: ${zipPath}`);
console.log(`  Файлов: ${fileCount}, ZIP: ${zipSizeMb} МБ`);
