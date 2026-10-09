'use strict';

const https = require('https');

const GITHUB_REPO = 'whxtelxs/Yandex-Music-Ajazz-Plugin';
const RELEASES_URL = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
const USER_AGENT = 'YandexMusicAjazz-Plugin-Updater';

function parseVersion(value) {
    const match = String(value || '').trim().match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) return null;
    return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
        label: `${match[1]}.${match[2]}.${match[3]}`
    };
}

function compareVersions(left, right) {
    const a = parseVersion(left);
    const b = parseVersion(right);
    if (!a || !b) return 0;
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    return a.patch - b.patch;
}

function requestJson(url, timeoutMs = 12000, redirects = 0, deadline = Date.now() + timeoutMs) {
    return new Promise((resolve, reject) => {
        const remaining = deadline - Date.now();
        if (redirects > 3 || remaining <= 0) { reject(new Error('GitHub API timeout or redirect limit')); return; }
        let parsed;
        try { parsed = new URL(url); } catch (error) { reject(error); return; }
        if (parsed.protocol !== 'https:') { reject(new Error('Invalid update URL')); return; }
        let timer;
        const finish = callback => value => { clearTimeout(timer); callback(value); };
        resolve = finish(resolve);
        reject = finish(reject);
        const request = https.get(parsed, {
            headers: { Accept: 'application/vnd.github+json', 'User-Agent': USER_AGENT },
            timeout: remaining
        }, response => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
                response.resume();
                requestJson(new URL(response.headers.location, parsed).href, timeoutMs, redirects + 1, deadline).then(resolve, reject);
                return;
            }
            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error('GitHub API status ' + response.statusCode));
                return;
            }
            let size = 0;
            const chunks = [];
            response.on('data', chunk => {
                size += chunk.length;
                if (size > 1024 * 1024) { request.destroy(new Error('GitHub response too large')); return; }
                chunks.push(chunk);
            });
            response.on('error', reject);
            response.on('aborted', () => reject(new Error('GitHub response aborted')));
            response.on('end', () => {
                try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (error) { reject(error); }
            });
        });
        timer = setTimeout(() => request.destroy(new Error('GitHub API timeout')), remaining);
        request.on('timeout', () => request.destroy(new Error('GitHub API timeout')));
        request.on('error', reject);
    });
}

function pickReleaseAsset(assets) {
    const list = Array.isArray(assets) ? assets : [];
    return list.find(asset => /^YandexMusic\.Ajazz\.Plugin\.v\d+\.\d+\.\d+\.zip$/i.test(asset.name))
        || list.find(asset => /\.zip$/i.test(asset.name))
        || null;
}

async function fetchLatestRelease() {
    const release = await requestJson(RELEASES_URL);
    const asset = pickReleaseAsset(release.assets);
    const version = parseVersion(release.tag_name)?.label
        || parseVersion(asset?.name)?.label
        || null;
    if (!version || !asset?.browser_download_url) {
        throw new Error('Release asset not found');
    }
    return {
        version,
        tagName: release.tag_name,
        name: release.name || release.tag_name,
        notes: String(release.body || '').trim(),
        downloadUrl: asset.browser_download_url,
        pageUrl: release.html_url,
        assetName: asset.name
    };
}

function buildUpdateInfo(currentVersion, release) {
    const latestVersion = release.version;
    const updateAvailable = compareVersions(currentVersion, latestVersion) < 0;
    return {
        currentVersion,
        latestVersion,
        updateAvailable,
        releaseName: release.name,
        releaseNotes: release.notes,
        downloadUrl: release.downloadUrl,
        pageUrl: release.pageUrl,
        assetName: release.assetName,
        checkedAt: new Date().toISOString()
    };
}

module.exports = {
    GITHUB_REPO,
    parseVersion,
    compareVersions,
    fetchLatestRelease,
    buildUpdateInfo
};
