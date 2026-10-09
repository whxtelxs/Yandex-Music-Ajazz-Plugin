'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepare, complete, fail } = require('../scripts/github-release');

function fixture(t, draft = true) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ym-github-release-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify({ Version: '2.1.0' }));
    fs.mkdirSync(path.join(root, 'release/com.whxtelxs.streamdock.yandexmusic.sdPlugin'), { recursive: true });
    fs.writeFileSync(path.join(root, 'release/YandexMusic.Ajazz.Plugin.v2.1.0.zip'), 'zip');
    fs.writeFileSync(path.join(root, 'release/com.whxtelxs.streamdock.yandexmusic.sdPlugin/build-info.json'), JSON.stringify({ version: '2.1.0', commit: 'abc123' }));
    const release = { id: 7, draft, tag_name: 'v2.1.0', html_url: 'https://example.com/release', upload_url: 'https://example.com/upload', assets: [{ id: 9, name: 'YandexMusic.Ajazz.Plugin.v2.1.0.zip' }], body: 'Manual notes' };
    const calls = [];
    const outputs = {};
    const summary = { addLink() { return this; }, addRaw() { return this; }, async write() {} };
    const repos = Object.fromEntries(['listReleases', 'getRelease', 'createRelease', 'updateRelease', 'deleteReleaseAsset', 'uploadReleaseAsset'].map(name => [name, async args => { calls.push({ name, args }); return { data: release }; }]));
    const git = Object.fromEntries(['getRef', 'updateRef', 'createRef'].map(name => [name, async args => { calls.push({ name, args }); return { data: {} }; }]));
    const github = { rest: { repos, git }, paginate: async () => [release] };
    const context = { repo: { owner: 'owner', repo: 'repo' }, sha: 'abc123' };
    const core = { setOutput: (key, value) => { outputs[key] = value; }, notice() {}, warning() {}, summary };
    return { root, release, calls, outputs, github, context, core, env: { RELEASE_ID: '7', RELEASE_VERSION: '2.1.0' } };
}

test('GitHub release creates a draft for the manifest version and exact commit', async t => {
    const f = fixture(t);
    f.github.paginate = async () => [];
    await prepare(f, f.root);
    assert.equal(f.outputs.version, '2.1.0');
    assert.equal(f.outputs.release_id, '7');
    const args = f.calls[0].args;
    assert.equal(args.draft, true);
    assert.equal(args.tag_name, 'v2.1.0');
    assert.equal(args.target_commitish, f.context.sha);
    assert.equal(args.generate_release_notes, true);
});

test('GitHub release reuses a draft without replacing manual notes', async t => {
    const f = fixture(t);
    await prepare(f, f.root);
    assert.equal(f.calls[0].name, 'updateRelease');
    assert.equal(f.calls[0].args.body, undefined);
    assert.equal(f.outputs.release_id, '7');
});

test('GitHub release leaves published versions untouched', async t => {
    const f = fixture(t, false);
    await prepare(f, f.root);
    assert.equal(f.outputs.release_id, undefined);
    assert.deepEqual(f.calls, []);
    await assert.rejects(complete(f, f.root, f.env), /уже опубликован/);
    assert.deepEqual(f.calls.map(call => call.name), ['getRelease']);
});

test('GitHub release replaces assets before moving a draft tag to the built commit', async t => {
    const f = fixture(t);
    await complete(f, f.root, f.env);
    assert.deepEqual(f.calls.map(call => call.name), ['getRelease', 'deleteReleaseAsset', 'uploadReleaseAsset', 'uploadReleaseAsset', 'uploadReleaseAsset', 'getRef', 'updateRef', 'updateRelease']);
    const assets = f.calls.filter(call => call.name === 'uploadReleaseAsset');
    assert.deepEqual(assets.map(call => call.args.name), ['YandexMusic.Ajazz.Plugin.v2.1.0.zip', 'build-info.json', 'SHA256SUMS.txt']);
    assert.match(assets[2].args.data.toString().trim(), /^[a-f0-9]{64}  YandexMusic\.Ajazz\.Plugin\.v2\.1\.0\.zip$/);
    const tag = f.calls.find(call => call.name === 'updateRef').args;
    assert.equal(tag.sha, f.context.sha);
    assert.equal(tag.ref, 'tags/v2.1.0');
    assert.equal(f.calls.at(-1).args.draft, undefined);
    assert.equal(f.calls.at(-1).args.body, undefined);
});

test('GitHub release creates a missing tag and does not hide API failures', async t => {
    const f = fixture(t);
    f.github.rest.git.getRef = async () => { throw Object.assign(new Error('Missing'), { status: 404 }); };
    await complete(f, f.root, f.env);
    assert.equal(f.calls.find(call => call.name === 'createRef').args.ref, 'refs/tags/v2.1.0');
    f.calls.length = 0;
    f.github.rest.git.getRef = async () => { throw Object.assign(new Error('Denied'), { status: 403 }); };
    await assert.rejects(complete(f, f.root, f.env), /Denied/);
    assert.equal(f.calls.some(call => call.name === 'createRef'), false);
});

test('GitHub release does not upload files built from a different commit', async t => {
    const f = fixture(t);
    f.context.sha = 'other';
    await assert.rejects(complete(f, f.root, f.env), /другой версии или коммита/);
    assert.deepEqual(f.calls, []);
});

test('failed GitHub builds mark drafts without changing assets or tags', async t => {
    const f = fixture(t);
    await fail(f, f.env);
    assert.deepEqual(f.calls.map(call => call.name), ['getRelease', 'updateRelease']);
    assert.equal(f.calls.at(-1).args.name, 'v2.1.0 - сборка не прошла');
    assert.equal(f.calls.at(-1).args.body, undefined);
});

test('failed uploads cannot move the release tag', async t => {
    const f = fixture(t);
    f.github.rest.repos.uploadReleaseAsset = async () => { throw new Error('Upload failed'); };
    await assert.rejects(complete(f, f.root, f.env), /Upload failed/);
    assert.equal(f.calls.some(call => ['getRef', 'updateRef', 'createRef'].includes(call.name)), false);
});
