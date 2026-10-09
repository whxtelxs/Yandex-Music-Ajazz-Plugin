'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isVersion, chooseVersion, syncVersion, needsInstall, runPipeline } = require('../scripts/release');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ym-release-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'plugin'));
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ Version: '2.0.0', Actions: [{ Name: 'Плей' }] }));
    fs.writeFileSync(path.join(root, 'plugin/package.json'), JSON.stringify({ version: '1.9.0', scripts: { release: 'node scripts/release.js' } }));
    fs.writeFileSync(path.join(root, 'plugin/package-lock.json'), JSON.stringify({ version: '1.9.0', packages: { '': { version: '1.9.0' }, 'node_modules/ws': { version: '8.0.0' } } }));
    return root;
}

test('release prompt keeps the version or accepts a valid replacement', async () => {
    assert.equal(await chooseVersion('2.0.0', async () => ''), '2.0.0');
    const answers = ['wrong', '2.01.0', '2.0.1'];
    assert.equal(await chooseVersion('2.0.0', async () => answers.shift()), '2.0.1');
    for (const value of ['2.0.1-beta', '2.0', '-1.0.0', '2.0.1; echo bad']) assert.equal(isVersion(value), false);
});

test('release synchronizes all version fields and preserves other data', t => {
    const root = fixture(t);
    syncVersion(root, '2.0.1');
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'plugin/package.json')));
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'plugin/package-lock.json')));
    assert.equal(manifest.Version, '2.0.1');
    assert.equal(manifest.Actions[0].Name, 'Плей');
    assert.equal(metadata.version, '2.0.1');
    assert.equal(metadata.scripts.release, 'node scripts/release.js');
    assert.equal(lock.version, '2.0.1');
    assert.equal(lock.packages[''].version, '2.0.1');
    assert.equal(lock.packages['node_modules/ws'].version, '8.0.0');
});

test('release validates every version file before writing', t => {
    const root = fixture(t);
    const manifestPath = path.join(root, 'manifest.json');
    const before = fs.readFileSync(manifestPath);
    fs.writeFileSync(path.join(root, 'plugin/package-lock.json'), 'broken');
    assert.throws(() => syncVersion(root, '2.0.1'));
    assert.deepEqual(fs.readFileSync(manifestPath), before);
    assert.throws(() => syncVersion(root, '2.0.1-beta'), /Неверная версия/);
});

test('release detects missing or mismatched dependencies without reinstalling valid ones', t => {
    const root = fixture(t);
    const plugin = path.join(root, 'plugin');
    assert.equal(needsInstall(plugin), true);
    fs.mkdirSync(path.join(plugin, 'node_modules/ws'), { recursive: true });
    fs.writeFileSync(path.join(plugin, 'node_modules/ws/package.json'), JSON.stringify({ version: '8.0.0' }));
    assert.equal(needsInstall(plugin), false);
    fs.writeFileSync(path.join(plugin, 'node_modules/ws/package.json'), JSON.stringify({ version: '7.0.0' }));
    assert.equal(needsInstall(plugin), true);
});

test('release installs full dependencies before checking, testing and packaging', async () => {
    const calls = [];
    await runPipeline(true, async args => calls.push(args));
    assert.deepEqual(calls, [['ci', '--include=dev'], ['run', 'check'], ['test'], ['run', 'prod']]);
});

test('release stops at a failed check without testing or replacing the archive', async () => {
    const calls = [];
    await assert.rejects(runPipeline(false, async args => {
        calls.push(args);
        throw new Error('syntax failed');
    }), /syntax failed/);
    assert.deepEqual(calls, [['run', 'check']]);
});

test('release stops at failed tests without packaging', async () => {
    const calls = [];
    await assert.rejects(runPipeline(false, async args => {
        calls.push(args);
        if (args[0] === 'test') throw new Error('tests failed');
    }), /tests failed/);
    assert.deepEqual(calls, [['run', 'check'], ['test']]);
});
