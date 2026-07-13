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

function requestJson(url, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
        const request = https.get(url, {
            headers: {
                Accept: 'application/vnd.github+json',
                'User-Agent': USER_AGENT
            },
            timeout: timeoutMs
        }, response => {
            if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                requestJson(response.headers.location, timeoutMs).then(resolve, reject);
                return;
            }
            if (response.statusCode !== 200) {
                response.resume();
                reject(new Error(`GitHub API status ${response.statusCode}`));
                return;
            }
            let raw = '';
            response.setEncoding('utf8');
            response.on('data', chunk => { raw += chunk; });
            response.on('end', () => {
                try {
                    resolve(JSON.parse(raw));
                } catch (error) {
                    reject(error);
                }
            });
        });
        request.on('timeout', () => {
            request.destroy(new Error('GitHub API timeout'));
        });
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
