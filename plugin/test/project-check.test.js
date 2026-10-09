'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkProject } = require('../scripts/project-check');

function fixture(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ym-project-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.mkdirSync(path.join(root, 'plugin'));
    const manifest = { Version: '2.1.0', CodePathWin: 'plugin/index.js', Actions: [{ UUID: 'ym.play', States: [{ Image: 'data:image/svg+xml;base64,PHN2Zy8+' }] }] };
    const metadata = { version: '2.1.0', dependencies: { ws: '^8.0.0' } };
    const lock = { version: '2.1.0', packages: { '': metadata } };
    function write(file, value) { fs.writeFileSync(path.join(root, file), JSON.stringify(value)); }
    write('manifest.json', manifest);
    write('plugin/package.json', metadata);
    write('plugin/package-lock.json', lock);
    fs.writeFileSync(path.join(root, 'plugin/index.js'), "'use strict';\n");
    return { root, manifest, metadata, lock, write };
}

test('project check accepts embedded images and existing manifest files', t => {
    const f = fixture(t);
    assert.deepEqual(checkProject(f.root), { version: '2.1.0', files: 1 });
});

test('project check rejects mismatched versions and dependency declarations', t => {
    const f = fixture(t);
    f.metadata.version = '2.0.0';
    f.write('plugin/package.json', f.metadata);
    assert.throws(() => checkProject(f.root), /Версии/);
    f.metadata.version = '2.1.0';
    f.metadata.dependencies.ws = '^9.0.0';
    f.write('plugin/package.json', f.metadata);
    assert.throws(() => checkProject(f.root), /не соответствует dependencies/);
});

test('project check rejects missing files and paths outside the project', t => {
    const f = fixture(t);
    for (const file of ['static/missing.png', '../outside.png']) {
        f.manifest.Icon = file;
        f.write('manifest.json', f.manifest);
        assert.throws(() => checkProject(f.root), /Неверный файл/);
    }
});

test('project check rejects duplicate action identifiers', t => {
    const f = fixture(t);
    f.manifest.Actions.push({ UUID: 'ym.play' });
    f.write('manifest.json', f.manifest);
    assert.throws(() => checkProject(f.root), /уникальные UUID/);
});
