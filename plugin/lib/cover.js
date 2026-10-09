'use strict';

const http = require('http');
const https = require('https');

const coverCache = new Map();
const coverRequests = new Map();
const MAX_CACHE_ENTRIES = 6;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 6000;

function downloadImageAsDataUrl(imageUrl, redirects = 0, deadline = Date.now() + 20000) {
    return new Promise((resolve, reject) => {
        let url;
        try {
            url = new URL(imageUrl);
            if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid cover URL');
        } catch (error) {
            reject(error);
            return;
        }
        const remaining = deadline - Date.now();
        if (remaining <= 0) { reject(new Error('Cover download timed out')); return; }
        let timer;
        const finish = callback => value => { clearTimeout(timer); callback(value); };
        resolve = finish(resolve);
        reject = finish(reject);
        const client = url.protocol === 'https:' ? https : http;
        const request = client.get(url, { timeout: REQUEST_TIMEOUT_MS }, response => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                response.resume();
                if (redirects >= 3 || !response.headers.location) {
                    reject(new Error('Too many cover redirects'));
                    return;
                }
                downloadImageAsDataUrl(new URL(response.headers.location, url).toString(), redirects + 1, deadline).then(resolve, reject);
                return;
            }
            const contentType = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
            if (response.statusCode !== 200 || !['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'].includes(contentType)) {
                response.resume();
                reject(new Error('Invalid cover response: ' + response.statusCode));
                return;
            }
            let length = 0;
            const chunks = [];
            response.on('data', chunk => {
                length += chunk.length;
                if (length > MAX_IMAGE_BYTES) {
                    request.destroy(new Error('Cover is too large'));
                    return;
                }
                chunks.push(chunk);
            });
            response.on('end', () => {
                if (!length || !response.complete) {
                    reject(new Error('Incomplete cover response'));
                    return;
                }
                resolve('data:' + contentType + ';base64,' + Buffer.concat(chunks).toString('base64'));
            });
            response.on('aborted', () => reject(new Error('Cover response aborted')));
            response.on('error', reject);
        });
        timer = setTimeout(() => request.destroy(new Error('Cover download timed out')), remaining);
        request.on('timeout', () => request.destroy(new Error('Cover request timed out')));
        request.on('error', reject);
    });
}

async function getCoverDataUrl(imageUrl) {
    if (coverCache.has(imageUrl)) return coverCache.get(imageUrl);
    if (coverRequests.has(imageUrl)) return coverRequests.get(imageUrl);
    if (coverRequests.size >= 4) throw new Error('Too many cover requests');
    const request = downloadImageAsDataUrl(imageUrl)
        .then(dataUrl => {
            coverCache.set(imageUrl, dataUrl);
            while (coverCache.size > MAX_CACHE_ENTRIES) coverCache.delete(coverCache.keys().next().value);
            return dataUrl;
        }).finally(() => coverRequests.delete(imageUrl));
    coverRequests.set(imageUrl, request);
    return request;
}

async function restoreCoverForContext() {
    return require('./state-sync').checkCoverState();
}

module.exports = { getCoverDataUrl, restoreCoverForContext, downloadImageAsDataUrl, MAX_IMAGE_BYTES };
