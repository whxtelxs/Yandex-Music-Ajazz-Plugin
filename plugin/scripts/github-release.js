'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { isVersion } = require('./release');

const projectRoot = path.resolve(__dirname, '../..');

async function prepare({ github, context, core }, root = projectRoot) {
    const version = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')).Version;
    if (!isVersion(version)) throw new Error('Неверная версия manifest.json');
    core.setOutput('version', version);
    const tag = 'v' + version;
    const releases = await github.paginate(github.rest.repos.listReleases, { ...context.repo, per_page: 100 });
    let release = releases.find(item => item.tag_name === tag);
    if (release && !release.draft) {
        core.notice('Релиз ' + tag + ' уже опубликован. Сборка будет проверена без изменения релиза. Для нового релиза измените Version в manifest.json.');
        return;
    }
    if (release) {
        release = (await github.rest.repos.updateRelease({ ...context.repo, release_id: release.id,
            target_commitish: context.sha, name: tag + ' - сборка' })).data;
    } else {
        release = (await github.rest.repos.createRelease({ ...context.repo, tag_name: tag,
            target_commitish: context.sha, name: tag + ' - сборка', draft: true,
            generate_release_notes: true })).data;
    }
    core.setOutput('release_id', String(release.id));
    await core.summary.addLink('Черновик ' + tag, release.html_url).write();
}

async function getDraft({ github, context }, id) {
    const release = (await github.rest.repos.getRelease({ ...context.repo, release_id: id })).data;
    if (!release.draft) throw new Error('Релиз уже опубликован, изменение остановлено.');
    return release;
}

async function complete({ github, context, core }, root = projectRoot, env = process.env) {
    const version = env.RELEASE_VERSION;
    const id = Number(env.RELEASE_ID);
    if (!isVersion(version) || !Number.isSafeInteger(id) || id <= 0) throw new Error('Неверные параметры релиза');
    const tag = 'v' + version;
    const zipName = 'YandexMusic.Ajazz.Plugin.' + tag + '.zip';
    const zip = fs.readFileSync(path.join(root, 'release', zipName));
    const info = fs.readFileSync(path.join(root, 'release/com.whxtelxs.streamdock.yandexmusic.sdPlugin/build-info.json'));
    const metadata = JSON.parse(info);
    if (metadata.version !== version || metadata.commit !== context.sha) throw new Error('Архив собран для другой версии или коммита');
    const draft = await getDraft({ github, context }, id);
    if (draft.tag_name !== tag) throw new Error('Тег черновика не соответствует версии');
    const assets = [
        { name: zipName, data: zip, headers: { 'content-type': 'application/zip' } },
        { name: 'build-info.json', data: info, headers: { 'content-type': 'application/json' } },
        { name: 'SHA256SUMS.txt', data: Buffer.from(createHash('sha256').update(zip).digest('hex') + '  ' + zipName + '\n'),
            headers: { 'content-type': 'text/plain' } }
    ];
    for (const asset of assets) {
        const existing = draft.assets.find(item => item.name === asset.name);
        if (existing) await github.rest.repos.deleteReleaseAsset({ ...context.repo, asset_id: existing.id });
        await github.rest.repos.uploadReleaseAsset({ ...context.repo, release_id: id,
            url: draft.upload_url, ...asset });
    }
    try {
        await github.rest.git.getRef({ ...context.repo, ref: 'tags/' + tag });
        await github.rest.git.updateRef({ ...context.repo, ref: 'tags/' + tag, sha: context.sha, force: true });
    } catch (error) {
        if (error.status !== 404) throw error;
        await github.rest.git.createRef({ ...context.repo, ref: 'refs/tags/' + tag, sha: context.sha });
    }
    await github.rest.repos.updateRelease({ ...context.repo, release_id: id,
        target_commitish: context.sha, name: tag });
    await core.summary.addLink('Готовый черновик ' + tag, draft.html_url)
        .addRaw('\n\nZIP, сведения о сборке и SHA256 прикреплены. Тег указывает на ' + context.sha + '.').write();
}

async function fail({ github, context, core }, env = process.env) {
    const id = Number(env.RELEASE_ID);
    const draft = await getDraft({ github, context }, id);
    await github.rest.repos.updateRelease({ ...context.repo, release_id: id,
        name: draft.tag_name + ' - сборка не прошла' });
    core.warning('Черновик оставлен для повторной сборки. Подробности ошибки находятся в логе workflow.');
}

module.exports = { prepare, complete, fail };
