const { Plugins, Actions, log, EventEmitter } = require('./utils/plugin');
const { execSync } = require('child_process');
const yandexMusic = require('./utils/yandex-music');

const plugin = new Plugins('demo');

const buttonContexts = {
    playPause: [],
    like: [],
    mute: []
};

let playbackCheckInterval = null;
let likeCheckInterval = null;
let muteCheckInterval = null;

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

function startStateChecks() {
    if (playbackCheckInterval) clearInterval(playbackCheckInterval);
    if (likeCheckInterval) clearInterval(likeCheckInterval);
    if (muteCheckInterval) clearInterval(muteCheckInterval);
    
    playbackCheckInterval = setInterval(checkPlaybackState, 100);
    likeCheckInterval = setInterval(checkLikeState, 100);
    muteCheckInterval = setInterval(checkMuteState, 100);
    
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