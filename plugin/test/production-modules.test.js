'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getProductionModulePaths } = require('../scripts/production-modules');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ym-production-modules-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const install = (modulePath, version) => {
        fs.mkdirSync(path.join(root, modulePath), { recursive: true });
        fs.writeFileSync(path.join(root, modulePath, 'package.json'), JSON.stringify({ version }));
    };
    return { root, install };
}

test('packaging tolerates optional packages omitted by a clean npm install', t => {
    const f = fixture(t);
    f.install('node_modules/discord-rpc', '4.0.1');
    const packages = {
        'node_modules/discord-rpc': { version: '4.0.1' },
        'node_modules/register-scheme': { version: '0.0.2', optional: true },
        'node_modules/bindings': { version: '1.5.0', optional: true },
        'node_modules/file-uri-to-path': { version: '1.0.0', optional: true },
        'node_modules/register-scheme/node_modules/node-addon-api': { version: '1.7.2', optional: true },
        'node_modules/esbuild': { version: '0.25.12', dev: true }
    };
    assert.deepEqual([...getProductionModulePaths({ packages }, f.root)], ['plugin/node_modules/discord-rpc']);
    f.install('node_modules/bindings', '1.5.0');
    assert.equal(getProductionModulePaths({ packages }, f.root).has('plugin/node_modules/bindings'), true);
});

test('packaging still fails when required dependencies are absent or have the wrong version', t => {
    const f = fixture(t);
    const lock = { packages: { 'node_modules/ws': { version: '8.20.0' } } };
    assert.throws(() => getProductionModulePaths(lock, f.root), { code: 'ENOENT' });
    f.install('node_modules/ws', '8.19.0');
    assert.throws(() => getProductionModulePaths(lock, f.root), /Dependency version mismatch/);
});

test('packaging does not hide corrupted or mismatched installed optional dependencies', t => {
    const f = fixture(t);
    const lock = { packages: { 'node_modules/bindings': { version: '1.5.0', optional: true } } };
    f.install('node_modules/bindings', '1.4.0');
    assert.throws(() => getProductionModulePaths(lock, f.root), /Dependency version mismatch/);
    fs.writeFileSync(path.join(f.root, 'node_modules/bindings/package.json'), '{');
    assert.throws(() => getProductionModulePaths(lock, f.root), SyntaxError);
});
