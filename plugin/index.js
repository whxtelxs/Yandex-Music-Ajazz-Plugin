const { Plugins, Actions, log, EventEmitter } = require('./utils/plugin');
const { execSync } = require('child_process');
const yandexMusic = require('./utils/yandex-music');

const plugin = new Plugins('demo');

const buttonContexts = {
    playPause: [],
    like: [],
    mute: [],
    cover: [],
    timeTotal: [],
    trackInfo: []
};

let lastTrackInfo = null;
let lastTimeInfo = null;
let scrollingText = {
    text: '',
    position: 0,
    maxLength: 12,
    speed: 0.5,
    frameCounter: 0
};

let playbackCheckInterval = null;
let likeCheckInterval = null;
let muteCheckInterval = null;
let coverCheckInterval = null;
let timeCheckInterval = null;
let trackInfoCheckInterval = null;

plugin.didReceiveGlobalSettings = ({ payload: { settings } }) => {
    log.info('didReceiveGlobalSettings', settings);
};

const createSvg = (text) => `<svg width="144" height="144" xmlns="http://www.w3.org/2000/svg">
    <text x="72" y="120" font-family="Arial" font-weight="bold" font-size="36" fill="white" text-anchor="middle"
        stroke="black" stroke-width="2" paint-order="stroke">
        ${text}
    </text>
</svg>`;
const timers = {};

// Вырезанная функция в prod
function sendLogToPropertyInspector(message, type = 'info') {
    return;
}

async function downloadAndSetImageAsDataUrl(imageUrl) {
    try {
        sendLogToPropertyInspector(`Скачивание изображения с URL: ${imageUrl}`, 'info');
        
        const https = require('https');
        const http = require('http');
        
        return new Promise((resolve, reject) => {
            const client = imageUrl.startsWith('https:') ? https : http;
            
            client.get(imageUrl, (response) => {
                if (response.statusCode !== 200) {
                    sendLogToPropertyInspector(`HTTP ошибка при скачивании: ${response.statusCode}`, 'error');
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }
                
                const chunks = [];
                let totalLength = 0;
                
                response.on('data', (chunk) => {
                    chunks.push(chunk);
                    totalLength += chunk.length;
                });
                
                response.on('end', () => {
                    try {
                        const buffer = Buffer.concat(chunks, totalLength);
                        sendLogToPropertyInspector(`Изображение скачано, размер: ${buffer.length} байт`, 'info');
                        
                        const contentType = response.headers['content-type'] || 'image/jpeg';
                        const base64Data = buffer.toString('base64');
                        const dataUrl = `data:${contentType};base64,${base64Data}`;
                        
                        sendLogToPropertyInspector(`Создан data URL, длина: ${dataUrl.length} символов`, 'info');
                        
                        buttonContexts.cover.forEach((context, index) => {
                            sendLogToPropertyInspector(`Установка data URL для кнопки ${index + 1}`, 'info');
                            plugin.setImage(context, dataUrl);
                        });
                        
                        sendLogToPropertyInspector('✅ Изображение установлено через data URL', 'info');
                        resolve(dataUrl);
                        
                    } catch (error) {
                        sendLogToPropertyInspector(`Ошибка при обработке изображения: ${error.message}`, 'error');
                        reject(error);
                    }
                });
                
                response.on('error', (error) => {
                    sendLogToPropertyInspector(`Ошибка при скачивании: ${error.message}`, 'error');
                    reject(error);
                });
                
            }).on('error', (error) => {
                sendLogToPropertyInspector(`Ошибка HTTP запроса: ${error.message}`, 'error');
                reject(error);
            });
        });
        
    } catch (error) {
        sendLogToPropertyInspector(`Ошибка в downloadAndSetImageAsDataUrl: ${error.message}`, 'error');
        log.error('Ошибка в downloadAndSetImageAsDataUrl:', error);
    }
}

async function checkYandexMusicConnection() {
    const isConnected = await yandexMusic.checkConnection();
    log.info('Проверка соединения с Яндекс Музыкой:', isConnected ? 'Успешно' : 'Ошибка');
    return isConnected;
}

async function checkPlaybackState() {
    try {
        if (buttonContexts.playPause.length === 0) return;
        
        const isConnected = await checkYandexMusicConnection();
        if (!isConnected) return;
        
        let client;
        try {
            client = await yandexMusic.getClient();
            
            if (!client) return;
            
            const { Runtime } = client;
            
            const result = await Runtime.evaluate({
                expression: `
                    (function() {
                        let pauseButton = document.querySelector("button.BaseSonataControlsDesktop_sonataButton__GbwFt[data-test-id='PAUSE_BUTTON']");
                        if (pauseButton) {
                            return { isPlaying: true };
                        }
                        
                        let playButton = document.querySelector("button.BaseSonataControlsDesktop_sonataButton__GbwFt[data-test-id='PLAY_BUTTON']");
                        if (playButton) {
                            return { isPlaying: false };
                        }
                        
                        const pauseSvg = document.querySelector("svg.BaseSonataControlsDesktop_playButtonIcon__TlFqv use[xlink:href='/icons/sprite.svg#pause_filled_l']");
                        if (pauseSvg) {
                            return { isPlaying: true };
                        }
                        
                        const playSvg = document.querySelector("svg.BaseSonataControlsDesktop_playButtonIcon__TlFqv use[xlink:href='/icons/sprite.svg#play_filled_l']");
                        if (playSvg) {
                            return { isPlaying: false };
                        }
                        
                        return { isPlaying: false };
                    })()
                `,
                returnByValue: true
            });
            
            if (result.result && result.result.value) {
                const { isPlaying } = result.result.value;
                
                buttonContexts.playPause.forEach(context => {
                    plugin.setState(context, isPlaying ? 1 : 0);
                });
                
                log.info('Состояние воспроизведения:', isPlaying ? 'Воспроизведение' : 'Пауза');
            }
        } catch (error) {
            log.error('Ошибка при проверке состояния воспроизведения:', error);
        } finally {
            if (client) {
                try {
                    await client.close();
                } catch (closeErr) {
                    log.error('Ошибка при закрытии соединения:', closeErr);
                }
            }
        }
    } catch (error) {
        log.error('Ошибка в checkPlaybackState:', error);
    }
}

async function checkLikeState() {
    try {
        if (buttonContexts.like.length === 0) return;
        
        const isConnected = await checkYandexMusicConnection();
        if (!isConnected) return;
        
        let client;
        try {
            client = await yandexMusic.getClient();
            
            if (!client) return;
            
            const { Runtime } = client;
            
            const result = await Runtime.evaluate({
                expression: `
                    (function() {
                        try {
                            let playerBar = document.querySelector('.PlayerBarDesktopWithBackgroundProgressBar_root__bpmwN');
                            if (!playerBar) {
                                playerBar = document.querySelector('[data-test-id="PLAYERBAR_DESKTOP"]');
                                if (!playerBar) {
                                    console.log("Не найдена нижняя панель плеера");
                                    return { isLiked: false, error: 'Не найдена нижняя панель плеера' };
                                }
                            }
                            
                            let likeButton = playerBar.querySelector("[data-test-id='LIKE_BUTTON']");
                            if (likeButton) {
                                const isLiked = likeButton.getAttribute('aria-pressed') === 'true';
                                
                                const likeIconHref = likeButton.querySelector('svg use')?.getAttribute('xlink:href');
                                const isLikedBySvg = likeIconHref && likeIconHref.includes('liked_xs');
                                
                                console.log('Состояние лайка по атрибуту:', isLiked);
                                console.log('Состояние лайка по иконке:', isLikedBySvg);
                                console.log('SVG href:', likeIconHref);
                                
                                return { isLiked: isLiked || isLikedBySvg };
                            }
                            
                            const sonataSection = playerBar.querySelector('.PlayerBarDesktopWithBackgroundProgressBar_sonata__mGFb_');
                            if (sonataSection) {
                                const likeButton = sonataSection.querySelector('button:last-of-type');
                                if (likeButton) {
                                    const isLiked = likeButton.getAttribute('aria-pressed') === 'true';
                                    
                                    const likeIconHref = likeButton.querySelector('svg use')?.getAttribute('xlink:href');
                                    const isLikedBySvg = likeIconHref && likeIconHref.includes('liked_xs');
                                    
                                    console.log('Состояние лайка по позиции (последняя кнопка) по атрибуту:', isLiked);
                                    console.log('Состояние лайка по позиции (последняя кнопка) по иконке:', isLikedBySvg);
                                    console.log('SVG href:', likeIconHref);
                                    
                                    return { isLiked: isLiked || isLikedBySvg };
                                }
                            }
                            
                            return { isLiked: false };
                        } catch (err) {
                            console.error('Ошибка при определении лайка:', err);
                            return { isLiked: false, error: err.toString() };
                        }
                    })()
                `,
                returnByValue: true
            });
            
            if (result.result && result.result.value) {
                const { isLiked, error } = result.result.value;
                
                if (error) {
                    log.error('Ошибка в JavaScript при проверке лайка:', error);
                }
                
                buttonContexts.like.forEach(context => {
                    plugin.setState(context, isLiked ? 1 : 0);
                });
                
                log.info('Состояние лайка:', isLiked ? 'Лайкнут' : 'Не лайкнут');
            }
        } catch (error) {
            log.error('Ошибка при проверке состояния лайка:', error);
        } finally {
            if (client) {
                try {
                    await client.close();
                } catch (closeErr) {
                    log.error('Ошибка при закрытии соединения:', closeErr);
                }
            }
        }
    } catch (error) {
        log.error('Ошибка в checkLikeState:', error);
    }
}

async function checkMuteState() {
    try {
        if (buttonContexts.mute.length === 0) return;
        
        const isConnected = await checkYandexMusicConnection();
        if (!isConnected) return;
        
        let client;
        try {
            client = await yandexMusic.getClient();
            
            if (!client) return;
            
            const { Runtime } = client;
            
            const result = await Runtime.evaluate({
                expression: `
                    (function() {
                        let muteButton = document.querySelector("button.ChangeVolume_button__4HLEr[data-test-id='CHANGE_VOLUME_BUTTON']");
                        if (muteButton) {
                            const ariaLabel = muteButton.getAttribute('aria-label');
                            const isMuted = ariaLabel === 'Включить звук';
                            return { isMuted };
                        }
                        
                        const volumeOffSvg = document.querySelector("svg.ChangeVolume_icon__5Zv2a use[xlink:href='/icons/sprite.svg#volumeOff_xs']");
                        if (volumeOffSvg) {
                            return { isMuted: true };
                        }
                        
                        return { isMuted: false };
                    })()
                `,
                returnByValue: true
            });
            
            if (result.result && result.result.value) {
                const { isMuted } = result.result.value;
                
                buttonContexts.mute.forEach(context => {
                    plugin.setState(context, isMuted ? 1 : 0);
                });
                
                log.info('Состояние звука:', isMuted ? 'Выключен' : 'Включен');
            }
        } catch (error) {
            log.error('Ошибка при проверке состояния звука:', error);
        } finally {
            if (client) {
                try {
                    await client.close();
                } catch (closeErr) {
                    log.error('Ошибка при закрытии соединения:', closeErr);
                }
            }
        }
    } catch (error) {
        log.error('Ошибка в checkMuteState:', error);
    }
}

async function restoreCoverForContext(context) {
    try {
        if (!lastTrackInfo || !lastTrackInfo.coverUrl) {
            sendLogToPropertyInspector('Нет кэшированной обложки для восстановления, проверяем текущий трек...', 'info');
            await checkCoverState();
            return;
        }
        
        sendLogToPropertyInspector(`Восстановление обложки для контекста ${context}`, 'info');
        sendLogToPropertyInspector(`Кэшированный трек: ${lastTrackInfo.title} - ${lastTrackInfo.artist}`, 'info');
        
        try {
            await downloadAndSetImageForContext(lastTrackInfo.coverUrl, context);
            sendLogToPropertyInspector(`✅ Обложка восстановлена для контекста ${context}`, 'info');
        } catch (error) {
            sendLogToPropertyInspector(`Ошибка восстановления обложки: ${error.message}`, 'error');
            sendLogToPropertyInspector('Попробуем получить актуальную информацию о треке...', 'info');
            await checkCoverState();
        }
    } catch (error) {
        sendLogToPropertyInspector(`Ошибка в restoreCoverForContext: ${error.message}`, 'error');
        log.error('Ошибка в restoreCoverForContext:', error);
    }
}

async function downloadAndSetImageForContext(imageUrl, context) {
    try {
        sendLogToPropertyInspector(`Скачивание изображения для контекста ${context}`, 'info');
        
        const https = require('https');
        const http = require('http');
        
        return new Promise((resolve, reject) => {
            const client = imageUrl.startsWith('https:') ? https : http;
            
            client.get(imageUrl, (response) => {
                if (response.statusCode !== 200) {
                    sendLogToPropertyInspector(`HTTP ошибка при скачивании: ${response.statusCode}`, 'error');
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }
                
                const chunks = [];
                let totalLength = 0;
                
                response.on('data', (chunk) => {
                    chunks.push(chunk);
                    totalLength += chunk.length;
                });
                
                response.on('end', () => {
                    try {
                        const buffer = Buffer.concat(chunks, totalLength);
                        sendLogToPropertyInspector(`Изображение скачано для контекста ${context}, размер: ${buffer.length} байт`, 'info');
                        
                        const contentType = response.headers['content-type'] || 'image/jpeg';
                        const base64Data = buffer.toString('base64');
                        const dataUrl = `data:${contentType};base64,${base64Data}`;
                        
                        sendLogToPropertyInspector(`Установка изображения для контекста ${context}`, 'info');
                        plugin.setImage(context, dataUrl);
                        
                        resolve(dataUrl);
                        
                    } catch (error) {
                        sendLogToPropertyInspector(`Ошибка при обработке изображения для контекста ${context}: ${error.message}`, 'error');
                        reject(error);
                    }
                });
                
                response.on('error', (error) => {
                    sendLogToPropertyInspector(`Ошибка при скачивании для контекста ${context}: ${error.message}`, 'error');
                    reject(error);
                });
                
            }).on('error', (error) => {
                sendLogToPropertyInspector(`Ошибка HTTP запроса для контекста ${context}: ${error.message}`, 'error');
                reject(error);
            });
        });
        
    } catch (error) {
        sendLogToPropertyInspector(`Ошибка в downloadAndSetImageForContext: ${error.message}`, 'error');
        log.error('Ошибка в downloadAndSetImageForContext:', error);
    }
}

function parseTimeToSeconds(timeString) {
    const parts = timeString.split(':');
    if (parts.length === 2) {
        const minutes = parseInt(parts[0], 10) || 0;
        const seconds = parseInt(parts[1], 10) || 0;
        return minutes * 60 + seconds;
    }
    return 0;
}

function formatSecondsToTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function getScrollingText(fullText, position, maxLength) {
    if (fullText.length <= maxLength) {
        return fullText;
    }
    
    const padding = '   ';
    const extendedText = fullText + padding;
    const totalLength = extendedText.length;
    
    let startPos = position % totalLength;
    let result = '';
    
    for (let i = 0; i < maxLength; i++) {
        result += extendedText[(startPos + i) % totalLength];
    }
    
    return result;
}

async function checkTrackInfoState() {
    try {
        if (buttonContexts.trackInfo.length === 0) {
            return;
        }
        
        const isConnected = await checkYandexMusicConnection();
        if (!isConnected) {
            return;
        }
        
        const trackInfo = await yandexMusic.getTrackInfo();
        if (trackInfo && trackInfo.title && trackInfo.artist) {
            const fullText = `${trackInfo.artist} - ${trackInfo.title}`;
            
            if (scrollingText.text !== fullText) {
                scrollingText.text = fullText;
                scrollingText.position = 0;
                scrollingText.frameCounter = 0;
                sendLogToPropertyInspector(`Новый трек для бегущей строки: ${fullText}`, 'info');
            }
            
            const currentPosition = Math.floor(scrollingText.position);
            const displayText = getScrollingText(scrollingText.text, currentPosition, scrollingText.maxLength);
            
            buttonContexts.trackInfo.forEach(context => {
                plugin.setTitle(context, displayText);
            });
            
            scrollingText.frameCounter++;
            scrollingText.position += scrollingText.speed;
        } else {
            buttonContexts.trackInfo.forEach(context => {
                plugin.setTitle(context, 'Нет данных');
            });
        }
    } catch (error) {
        sendLogToPropertyInspector(`Ошибка в checkTrackInfoState: ${error.message}`, 'error');
        log.error('Ошибка в checkTrackInfoState:', error);
    }
}

async function checkTimeState() {
    try {
        const hasTimeButtons = buttonContexts.timeTotal.length > 0;
        
        if (!hasTimeButtons) {
            return;
        }
        
        const isConnected = await checkYandexMusicConnection();
        if (!isConnected) {
            return;
        }
        
        const timeInfo = await yandexMusic.getTrackTime();
        if (timeInfo && timeInfo.currentTime && timeInfo.totalTime) {
            const timeData = {
                current: timeInfo.currentTime,
                total: timeInfo.totalTime
            };
            
            if (JSON.stringify(timeData) !== JSON.stringify(lastTimeInfo)) {
                buttonContexts.timeTotal.forEach(context => {
                    plugin.setTitle(context, `${timeData.current}\n${timeData.total}`);
                });
                
                lastTimeInfo = timeData;
                sendLogToPropertyInspector(`Время синхронизировано: ${timeData.current}/${timeData.total}`, 'info');
            }
        } else {
            if (lastTimeInfo) {
                sendLogToPropertyInspector('Сброс кэша времени из-за ошибки получения данных', 'info');
                lastTimeInfo = null;
            }
        }
    } catch (error) {
        sendLogToPropertyInspector(`Ошибка в checkTimeState: ${error.message}`, 'error');
        log.error('Ошибка в checkTimeState:', error);
    }
}

async function checkCoverState() {
    try {
        if (buttonContexts.cover.length === 0) {
            return;
        }
        
        sendLogToPropertyInspector(`Проверка обложки для ${buttonContexts.cover.length} кнопок`, 'info');
        
        const isConnected = await checkYandexMusicConnection();
        if (!isConnected) {
            sendLogToPropertyInspector('Нет соединения с Яндекс Музыкой для обновления обложки', 'error');
            return;
        }
        
        sendLogToPropertyInspector('Получение информации о треке...', 'info');
        const trackInfo = await yandexMusic.getTrackInfo();
        
        if (trackInfo && trackInfo.coverUrl) {
            const trackId = `${trackInfo.title}-${trackInfo.artist}`;
            const lastTrackId = lastTrackInfo ? `${lastTrackInfo.title}-${lastTrackInfo.artist}` : null;
            
            if (trackId === lastTrackId && lastTrackInfo && lastTrackInfo.coverUrl === trackInfo.coverUrl) {
                return;
            }
            
            sendLogToPropertyInspector(`Найден новый трек: ${trackInfo.title} - ${trackInfo.artist}`, 'info');
            sendLogToPropertyInspector(`URL обложки: ${trackInfo.coverUrl}`, 'info');
            if (trackInfo.originalCoverUrl && trackInfo.originalCoverUrl !== trackInfo.coverUrl) {
                sendLogToPropertyInspector(`Оригинальный URL: ${trackInfo.originalCoverUrl}`, 'info');
            }
            
            try {
                sendLogToPropertyInspector('Скачивание и установка изображения...', 'info');
                await downloadAndSetImageAsDataUrl(trackInfo.coverUrl);
                
                lastTrackInfo = trackInfo;
                sendLogToPropertyInspector(`✅ Обложка обновлена для трека: ${trackInfo.title}`, 'info');
                log.info('Обложка обновлена:', trackInfo.title, 'от', trackInfo.artist);
                
            } catch (error) {
                sendLogToPropertyInspector(`Ошибка при установке изображения: ${error.message}`, 'error');
                log.error('Ошибка при установке изображения:', error);
            }
        } else {
            sendLogToPropertyInspector('Не удалось получить информацию о треке или обложку', 'error');
            log.error('Не удалось получить информацию о треке');
            
            if (lastTrackInfo) {
                sendLogToPropertyInspector('Сброс кэша трека из-за ошибки', 'info');
                lastTrackInfo = null;
            }
        }
    } catch (error) {
        sendLogToPropertyInspector(`Ошибка в checkCoverState: ${error.message}`, 'error');
        log.error('Ошибка в checkCoverState:', error);
    }
}

function startStateChecks() {
    if (playbackCheckInterval) clearInterval(playbackCheckInterval);
    if (likeCheckInterval) clearInterval(likeCheckInterval);
    if (muteCheckInterval) clearInterval(muteCheckInterval);
    if (coverCheckInterval) clearInterval(coverCheckInterval);
    if (timeCheckInterval) clearInterval(timeCheckInterval);
    if (trackInfoCheckInterval) clearInterval(trackInfoCheckInterval);
    
    playbackCheckInterval = setInterval(checkPlaybackState, 100);
    likeCheckInterval = setInterval(checkLikeState, 100);
    muteCheckInterval = setInterval(checkMuteState, 100);
    coverCheckInterval = setInterval(checkCoverState, 1000);
    timeCheckInterval = setInterval(checkTimeState, 500);
    trackInfoCheckInterval = setInterval(checkTrackInfoState, 100);
    
    log.info('Запущены проверки состояния кнопок');
}

startStateChecks();

plugin.demo = new Actions({
    default: {
    },
    async _willAppear({ context, payload }) {
        let n = 0;
        timers[context] = setInterval(async () => {
            const svg = createSvg(++n);
            plugin.setImage(context, `data:image/svg+xml;charset=utf8,${svg}`);
        }, 1000);

        const isConnected = await checkYandexMusicConnection();
        if (isConnected) {
            log.info('Соединение с Яндекс Музыкой установлено успешно');
        } else {
            log.error('Не удалось установить соединение с Яндекс Музыкой');
        }
    },
    _willDisappear({ context }) {
        timers[context] && clearInterval(timers[context]);
    },
    _propertyInspectorDidAppear({ context }) {
    },
    sendToPlugin({ payload, context }) {
        if (payload && payload.command) {
            log.info('Получена команда:', payload.command);
            
            switch (payload.command) {
                case 'checkConnection':
                    checkYandexMusicConnection().then(isConnected => {
                        plugin.sendToPropertyInspector({
                            command: 'connectionStatus',
                            status: isConnected ? 'connected' : 'disconnected'
                        }, context, 'com.whxtelxs.streamdock.yandexmusicajazz.demo');
                    });
                    break;
                case 'togglePlayback':
                    yandexMusic.togglePlayback().then(result => {
                        log.info('Результат переключения воспроизведения:', result);
                    });
                    break;
                case 'previousTrack':
                    yandexMusic.previousTrack().then(result => {
                        log.info('Результат перехода к предыдущему треку:', result);
                    });
                    break;
                case 'nextTrack':
                    yandexMusic.nextTrack().then(result => {
                        log.info('Результат перехода к следующему треку:', result);
                    });
                    break;
                case 'likeTrack':
                    yandexMusic.likeTrack().then(result => {
                        log.info('Результат установки лайка:', result);
                    });
                    break;
                case 'dislikeTrack':
                    yandexMusic.dislikeTrack().then(result => {
                        log.info('Результат установки дизлайка:', result);
                    });
                    break;
                case 'toggleMute':
                    yandexMusic.toggleMute().then(result => {
                        log.info('Результат переключения звука:', result);
                    });
                    break;
            }
        }
    },
    keyUp({ context, payload }) {
        checkYandexMusicConnection().then(isConnected => {
            if (isConnected) {
                log.info('Соединение с Яндекс Музыкой установлено');
                yandexMusic.togglePlayback().then(result => {
                    if (!result) {
                        plugin.showAlert(context);
                    }
                });
            } else {
                log.error('Нет соединения с Яндекс Музыкой');
                plugin.showAlert(context);
            }
        });
    },
    dialDown({ context, payload }) {},
    dialRotate({ context, payload }) {}
});

plugin["ym-play-pause"] = new Actions({
    default: {
        state: 0
    },
    async _willAppear({ context, payload }) {
        log.info("YM Play/Pause появился:", context);
        
        if (!buttonContexts.playPause.includes(context)) {
            buttonContexts.playPause.push(context);
        }
        
        const isConnected = await checkYandexMusicConnection();
        if (!isConnected) {
            log.error('Не удалось установить соединение с Яндекс Музыкой');
            plugin.showAlert(context);
            return;
        }
        
        await checkPlaybackState();
    },
    _willDisappear({ context }) {
        const index = buttonContexts.playPause.indexOf(context);
        if (index !== -1) {
            buttonContexts.playPause.splice(index, 1);
        }
    },
    keyUp({ context, payload }) {
        checkYandexMusicConnection().then(isConnected => {
            if (isConnected) {
                log.info('Соединение с Яндекс Музыкой установлено');
                
                yandexMusic.togglePlayback().then(result => {
                    if (!result) {
                        plugin.showAlert(context);
                    }
                });
            } else {
                log.error('Нет соединения с Яндекс Музыкой');
                plugin.showAlert(context);
            }
        });
    }
});

plugin["ym-previous"] = new Actions({
    default: {},
    async _willAppear({ context, payload }) {
        log.info("YM Previous появился:", context);
        
        const isConnected = await checkYandexMusicConnection();
        if (!isConnected) {
            log.error('Не удалось установить соединение с Яндекс Музыкой');
            plugin.showAlert(context);
        }
    },
    keyUp({ context, payload }) {
        checkYandexMusicConnection().then(isConnected => {
            if (isConnected) {
                log.info('Соединение с Яндекс Музыкой установлено');
                
                yandexMusic.previousTrack().then(result => {
                    if (!result) {
                        plugin.showAlert(context);
                    }
                });
            } else {
                log.error('Нет соединения с Яндекс Музыкой');
                plugin.showAlert(context);
            }
        });
    }
});

plugin["ym-next"] = new Actions({
    default: {},
    async _willAppear({ context, payload }) {
        log.info("YM Next появился:", context);
        
        const isConnected = await checkYandexMusicConnection();
        if (!isConnected) {
            log.error('Не удалось установить соединение с Яндекс Музыкой');
            plugin.showAlert(context);
        }
    },
    keyUp({ context, payload }) {
        checkYandexMusicConnection().then(isConnected => {
            if (isConnected) {
                log.info('Соединение с Яндекс Музыкой установлено');
                
                yandexMusic.nextTrack().then(result => {
                    if (!result) {
                        plugin.showAlert(context);
                    }
                });
            } else {
                log.error('Нет соединения с Яндекс Музыкой');
                plugin.showAlert(context);
            }
        });
    }
});

plugin["ym-like"] = new Actions({
    default: {
        state: 0
    },
    async _willAppear({ context, payload }) {
        log.info("YM Like появился:", context);
        
        if (!buttonContexts.like.includes(context)) {
            buttonContexts.like.push(context);
        }
        
        const isConnected = await checkYandexMusicConnection();
        if (!isConnected) {
            log.error('Не удалось установить соединение с Яндекс Музыкой');
            plugin.showAlert(context);
            return;
        }
        
        await checkLikeState();
    },
    _willDisappear({ context }) {
        const index = buttonContexts.like.indexOf(context);
        if (index !== -1) {
            buttonContexts.like.splice(index, 1);
        }
    },
    keyUp({ context, payload }) {
        checkYandexMusicConnection().then(isConnected => {
            if (isConnected) {
                log.info('Соединение с Яндекс Музыкой установлено');
                
                yandexMusic.likeTrack().then(result => {
                    if (!result) {
                        plugin.showAlert(context);
                    }
                });
            } else {
                log.error('Нет соединения с Яндекс Музыкой');
                plugin.showAlert(context);
            }
        });
    }
});

plugin["ym-dislike"] = new Actions({
    default: {},
    async _willAppear({ context, payload }) {
        log.info("YM Dislike появился:", context);
        
        const isConnected = await checkYandexMusicConnection();
        if (!isConnected) {
            log.error('Не удалось установить соединение с Яндекс Музыкой');
            plugin.showAlert(context);
        }
    },
    keyUp({ context, payload }) {
        checkYandexMusicConnection().then(isConnected => {
            if (isConnected) {
                log.info('Соединение с Яндекс Музыкой установлено');
                
                yandexMusic.dislikeTrack().then(result => {
                    if (!result) {
                        plugin.showAlert(context);
                    }
                });
            } else {
                log.error('Нет соединения с Яндекс Музыкой');
                plugin.showAlert(context);
            }
        });
    }
});

plugin["ym-mute"] = new Actions({
    default: {
        state: 0
    },
    async _willAppear({ context, payload }) {
        log.info("YM Mute появился:", context);
        
        if (!buttonContexts.mute.includes(context)) {
            buttonContexts.mute.push(context);
        }
        
        const isConnected = await checkYandexMusicConnection();
        if (!isConnected) {
            log.error('Не удалось установить соединение с Яндекс Музыкой');
            plugin.showAlert(context);
            return;
        }
        
        await checkMuteState();
    },
    _willDisappear({ context }) {
        const index = buttonContexts.mute.indexOf(context);
        if (index !== -1) {
            buttonContexts.mute.splice(index, 1);
        }
    },
    keyUp({ context, payload }) {
        checkYandexMusicConnection().then(isConnected => {
            if (isConnected) {
                log.info('Соединение с Яндекс Музыкой установлено');
                
                yandexMusic.toggleMute().then(result => {
                    if (!result) {
                        plugin.showAlert(context);
                    }
                });
            } else {
                log.error('Нет соединения с Яндекс Музыкой');
                plugin.showAlert(context);
            }
        });
    }
});

plugin["ym-cover"] = new Actions({
    default: {},
    async _willAppear({ context, payload }) {
        log.info("YM Cover появился:", context);
        sendLogToPropertyInspector(`Инициализация кнопки обложки: ${context}`, 'info');
        
        const isNewButton = !buttonContexts.cover.includes(context);
        
        if (isNewButton) {
            buttonContexts.cover.push(context);
            sendLogToPropertyInspector(`Добавлена кнопка обложки. Всего кнопок: ${buttonContexts.cover.length}`, 'info');
        } else {
            sendLogToPropertyInspector(`Кнопка обложки возвращена на страницу: ${context}`, 'info');
        }
        
        sendLogToPropertyInspector('Проверка соединения с Яндекс Музыкой...', 'info');
        const isConnected = await checkYandexMusicConnection();
        if (!isConnected) {
            log.error('Не удалось установить соединение с Яндекс Музыкой');
            sendLogToPropertyInspector('❌ Не удалось установить соединение с Яндекс Музыкой для кнопки обложки', 'error');
            plugin.showAlert(context);
            return;
        }
        
        sendLogToPropertyInspector('✅ Соединение установлено, загружаем обложку...', 'info');
        
        if (isNewButton) {
            sendLogToPropertyInspector('Сброс кэша трека для новой кнопки', 'info');
            lastTrackInfo = null;
        } else {
            sendLogToPropertyInspector('Восстановление обложки для существующей кнопки...', 'info');
        }
        
        sendLogToPropertyInspector('Немедленная загрузка обложки...', 'info');
        await checkCoverState();
    },
    _willDisappear({ context }) {
        const index = buttonContexts.cover.indexOf(context);
        if (index !== -1) {
            buttonContexts.cover.splice(index, 1);
            sendLogToPropertyInspector(`Удалена кнопка обложки. Осталось кнопок: ${buttonContexts.cover.length}`, 'info');
        }
    },
    keyUp({ context, payload }) {
        sendLogToPropertyInspector('Кнопка обложки не кликабельная', 'info');
    }
});

plugin["ym-track-info"] = new Actions({
    default: {},
    async _willAppear({ context, payload }) {
        log.info("YM Track Info появился:", context);
        sendLogToPropertyInspector(`Инициализация кнопки информации о треке: ${context}`, 'info');
        
        const isNewButton = !buttonContexts.trackInfo.includes(context);
        
        if (isNewButton) {
            buttonContexts.trackInfo.push(context);
            sendLogToPropertyInspector(`Добавлена кнопка информации о треке. Всего кнопок: ${buttonContexts.trackInfo.length}`, 'info');
            scrollingText.text = '';
            scrollingText.position = 0;
            scrollingText.frameCounter = 0;
        }
        
        const isConnected = await checkYandexMusicConnection();
        if (!isConnected) {
            log.error('Не удалось установить соединение с Яндекс Музыкой');
            sendLogToPropertyInspector('❌ Не удалось установить соединение с Яндекс Музыкой', 'error');
            plugin.showAlert(context);
            return;
        }
        
        plugin.setTitle(context, 'Загрузка...');
        await checkTrackInfoState();
    },
    _willDisappear({ context }) {
        const index = buttonContexts.trackInfo.indexOf(context);
        if (index !== -1) {
            buttonContexts.trackInfo.splice(index, 1);
            sendLogToPropertyInspector(`Удалена кнопка информации о треке. Осталось кнопок: ${buttonContexts.trackInfo.length}`, 'info');
        }
    },
    keyUp({ context, payload }) {
        sendLogToPropertyInspector('Кнопка информации о треке не кликабельная', 'info');
    }
});

plugin["ym-time-total"] = new Actions({
    default: {},
    async _willAppear({ context, payload }) {
        log.info("YM Time Total появился:", context);
        sendLogToPropertyInspector(`Инициализация кнопки времени (общее): ${context}`, 'info');
        
        const isNewButton = !buttonContexts.timeTotal.includes(context);
        
        if (isNewButton) {
            buttonContexts.timeTotal.push(context);
            sendLogToPropertyInspector(`Добавлена кнопка времени (общее). Всего кнопок: ${buttonContexts.timeTotal.length}`, 'info');
            lastTimeInfo = null;
        }
        
        const isConnected = await checkYandexMusicConnection();
        if (!isConnected) {
            log.error('Не удалось установить соединение с Яндекс Музыкой');
            sendLogToPropertyInspector('❌ Не удалось установить соединение с Яндекс Музыкой', 'error');
            plugin.showAlert(context);
            return;
        }
        
        plugin.setTitle(context, '0:00\n0:00');
        await checkTimeState();
    },
    _willDisappear({ context }) {
        const index = buttonContexts.timeTotal.indexOf(context);
        if (index !== -1) {
            buttonContexts.timeTotal.splice(index, 1);
            sendLogToPropertyInspector(`Удалена кнопка времени (общее). Осталось кнопок: ${buttonContexts.timeTotal.length}`, 'info');
        }
    },
    keyUp({ context, payload }) {
        sendLogToPropertyInspector('Кнопка времени не кликабельная', 'info');
    }
});

plugin.ws.on('message', (data) => {
    try {
        const message = JSON.parse(data.toString());
        
        if (message.event === 'sendToPlugin' && message.payload && message.payload.command === 'checkConnection') {
            log.info('Получена команда проверки соединения от Property Inspector');
            checkYandexMusicConnection().then(isConnected => {
                plugin.sendToPropertyInspector({
                    command: 'connectionStatus',
                    status: isConnected ? 'connected' : 'disconnected'
                }, message.context, message.action);
            });
        }
    } catch (error) {
        log.error('Ошибка при обработке сообщения от Property Inspector:', error);
    }
});