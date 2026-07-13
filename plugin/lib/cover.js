'use strict';

const https = require('https');
const http = require('http');
const { log } = require('../utils/plugin');
const { deps } = require('./deps');
const { appState } = require('./app-state');
const { sendLogToPropertyInspector } = require('./helpers');

const coverCache = new Map();
const coverRequests = new Map();
const MAX_CACHE_ENTRIES = 6;

function downloadImageAsDataUrl(imageUrl) {
    const client = imageUrl.startsWith('https:') ? https : http;

    return new Promise((resolve, reject) => {
        client.get(imageUrl, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode}`));
                return;
            }

            const chunks = [];
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                try {
                    const buffer = Buffer.concat(chunks);
                    const contentType = response.headers['content-type'] || 'image/jpeg';
                    resolve(`data:${contentType};base64,${buffer.toString('base64')}`);
                } catch (error) {
                    reject(error);
                }
            });
            response.on('error', reject);
        }).on('error', reject);
    });
}

async function getCoverDataUrl(imageUrl) {
    if (coverCache.has(imageUrl)) return coverCache.get(imageUrl);
    if (coverRequests.has(imageUrl)) return coverRequests.get(imageUrl);

    const request = downloadImageAsDataUrl(imageUrl)
        .then(dataUrl => {
            coverCache.set(imageUrl, dataUrl);
            while (coverCache.size > MAX_CACHE_ENTRIES) {
                coverCache.delete(coverCache.keys().next().value);
            }
            return dataUrl;
        })
        .finally(() => coverRequests.delete(imageUrl));
    coverRequests.set(imageUrl, request);
    return request;
}

async function downloadAndSetImageForContext(imageUrl, context) {
    try {
        sendLogToPropertyInspector(`Скачивание изображения для контекста ${context}`, 'info');
        const dataUrl = await getCoverDataUrl(imageUrl);
        sendLogToPropertyInspector(`Установка изображения для контекста ${context}`, 'info');
        deps.plugin.setImage(context, dataUrl);
        return dataUrl;
    } catch (error) {
        sendLogToPropertyInspector(`Ошибка в downloadAndSetImageForContext: ${error.message}`, 'error');
        log.error('Ошибка в downloadAndSetImageForContext:', error);
        throw error;
    }
}

async function restoreCoverForContext(context) {
    try {
        if (!appState.lastTrackInfo?.coverUrl) {
            sendLogToPropertyInspector('Нет кэшированной обложки, проверяем текущий трек', 'info');
            const { checkCoverState } = require('./state-sync');
            await checkCoverState();
            return;
        }

        sendLogToPropertyInspector(`Восстановление обложки для контекста ${context}`, 'info');
        sendLogToPropertyInspector(`Кэшированный трек: ${appState.lastTrackInfo.title} - ${appState.lastTrackInfo.artist}`, 'info');

        try {
            await downloadAndSetImageForContext(appState.lastTrackInfo.coverUrl, context);
            sendLogToPropertyInspector(`Обложка восстановлена для контекста ${context}`, 'info');
        } catch (error) {
            sendLogToPropertyInspector(`Ошибка восстановления обложки: ${error.message}`, 'error');
            sendLogToPropertyInspector('Получаем актуальную информацию о треке', 'info');
            const { checkCoverState } = require('./state-sync');
            await checkCoverState();
        }
    } catch (error) {
        sendLogToPropertyInspector(`Ошибка в restoreCoverForContext: ${error.message}`, 'error');
        log.error('Ошибка в restoreCoverForContext:', error);
    }
}

module.exports = {
    getCoverDataUrl,
    downloadAndSetImageForContext,
    restoreCoverForContext
};
