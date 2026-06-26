'use strict';

const { log } = require('../utils/plugin');
const { deps } = require('./deps');
const { buttonContexts } = require('./contexts');
const { appState } = require('./app-state');
const { sendLogToPropertyInspector, getScrollingText } = require('./helpers');
const { getTrackInfoTextSize, setTimeTitle } = require('./display');
const { downloadAndSetImageAsDataUrl } = require('./cover');

function applyTrackInfoFromRemoteState(state) {
    if (!state.trackTitle || buttonContexts.trackInfo.length === 0) return;

    const fullText = state.trackArtist
        ? `${state.trackArtist} - ${state.trackTitle}`
        : state.trackTitle;

    const { scrollingText } = appState;
    if (scrollingText.text !== fullText) {
        scrollingText.text = fullText;
        scrollingText.position = 0;
        scrollingText.frameCounter = 0;
    }

    updateTrackInfoTitles();
}

function updateTrackInfoTitles() {
    const { scrollingText } = appState;
    const currentPosition = Math.floor(scrollingText.position);

    buttonContexts.trackInfo.forEach(context => {
        const displayText = getScrollingText(
            scrollingText.text,
            currentPosition,
            getTrackInfoTextSize(context)
        );
        deps.plugin.setTitle(context, displayText);
    });

    scrollingText.frameCounter++;
    scrollingText.position += scrollingText.speed;
}

function applyYmRemoteState(state) {
    if (!state) return;

    if (buttonContexts.shuffle.length > 0 && state.shuffleOn !== null && state.shuffleOn !== undefined) {
        const pressed = state.shuffleAvailable === false ? false : !!state.shuffleOn;
        buttonContexts.shuffle.forEach(context => {
            deps.plugin.setState(context, pressed ? 1 : 0);
        });
    }

    if (buttonContexts.repeat.length > 0 && state.repeatMode !== null && state.repeatMode !== undefined) {
        buttonContexts.repeat.forEach(context => {
            deps.plugin.setState(context, state.repeatMode);
        });
    }

    if (state.vibeActive && state.trackTitle) {
        if (state.trackArtist) {
            applyTrackInfoFromRemoteState(state);
        } else {
            checkTrackInfoState();
        }
    }
}

async function checkPlaybackState() {
    try {
        if (buttonContexts.playPause.length === 0) return;

        const isPlaying = await deps.yandexMusic.getPlaybackIsPlaying();
        if (isPlaying === null) return;

        buttonContexts.playPause.forEach(context => {
            deps.plugin.setState(context, isPlaying ? 1 : 0);
        });

        log.info('Состояние воспроизведения:', isPlaying ? 'Воспроизведение' : 'Пауза');
    } catch (error) {
        log.error('Ошибка в checkPlaybackState:', error);
    }
}

async function checkLikeState() {
    try {
        if (buttonContexts.like.length === 0) return;

        const isLiked = await deps.yandexMusic.getLikeIsLiked();
        if (isLiked === null) return;

        buttonContexts.like.forEach(context => {
            deps.plugin.setState(context, isLiked ? 1 : 0);
        });

        log.info('Состояние лайка:', isLiked ? 'Лайкнут' : 'Не лайкнут');
    } catch (error) {
        log.error('Ошибка в checkLikeState:', error);
    }
}

async function checkMuteState() {
    try {
        if (buttonContexts.mute.length === 0 && buttonContexts.volumeEncoder.length === 0) return;

        const isMuted = await deps.yandexMusic.getMuteIsMuted();
        if (isMuted === null) return;

        const state = isMuted ? 1 : 0;
        buttonContexts.mute.forEach(context => {
            deps.plugin.setState(context, state);
        });
        buttonContexts.volumeEncoder.forEach(context => {
            deps.plugin.setState(context, state);
        });

        log.info('Состояние звука:', isMuted ? 'Выключен' : 'Включен');
    } catch (error) {
        log.error('Ошибка в checkMuteState:', error);
    }
}

async function checkShuffleState() {
    try {
        if (buttonContexts.shuffle.length === 0) return;

        const pressed = await deps.yandexMusic.getShufflePressed();
        if (pressed === null) return;

        buttonContexts.shuffle.forEach(context => {
            deps.plugin.setState(context, pressed ? 1 : 0);
        });
        log.info('Случайный порядок:', pressed ? 'вкл' : 'выкл');
    } catch (error) {
        log.error('Ошибка в checkShuffleState:', error);
    }
}

async function checkRepeatState() {
    try {
        if (buttonContexts.repeat.length === 0) return;

        const mode = await deps.yandexMusic.getRepeatMode();
        if (mode === null) return;

        buttonContexts.repeat.forEach(context => {
            deps.plugin.setState(context, mode);
        });
        log.info('Режим повтора:', mode === 0 ? 'выкл' : mode === 1 ? 'список' : 'трек');
    } catch (error) {
        log.error('Ошибка в checkRepeatState:', error);
    }
}

async function checkTrackInfoState() {
    try {
        if (buttonContexts.trackInfo.length === 0) return;

        const remote = deps.yandexMusic.getRemoteState();
        if (remote?.vibeActive && remote.trackTitle) {
            let state = remote;
            if (!remote.trackArtist) {
                const trackInfo = await deps.yandexMusic.getTrackInfo();
                if (trackInfo?.artist) {
                    state = { ...remote, trackArtist: trackInfo.artist };
                }
            }
            applyTrackInfoFromRemoteState(state);
            return;
        }

        const trackInfo = await deps.yandexMusic.getTrackInfo();
        if (trackInfo?.title) {
            const fullText = trackInfo.artist
                ? `${trackInfo.artist} - ${trackInfo.title}`
                : trackInfo.title;

            const { scrollingText } = appState;
            if (scrollingText.text !== fullText) {
                scrollingText.text = fullText;
                scrollingText.position = 0;
                scrollingText.frameCounter = 0;
                sendLogToPropertyInspector(`Новый трек для бегущей строки: ${fullText}`, 'info');
            }

            updateTrackInfoTitles();
        } else if (appState.scrollingText.text) {
            updateTrackInfoTitles();
        } else {
            buttonContexts.trackInfo.forEach(context => {
                deps.plugin.setTitle(context, 'Нет данных');
            });
        }
    } catch (error) {
        sendLogToPropertyInspector(`Ошибка в checkTrackInfoState: ${error.message}`, 'error');
        log.error('Ошибка в checkTrackInfoState:', error);
    }
}

async function checkTimeState() {
    try {
        if (buttonContexts.timeTotal.length === 0) return;

        const timeInfo = await deps.yandexMusic.getTrackTime();
        if (timeInfo?.currentTime && timeInfo?.totalTime) {
            const timeData = {
                current: timeInfo.currentTime,
                total: timeInfo.totalTime
            };

            if (JSON.stringify(timeData) !== JSON.stringify(appState.lastTimeInfo)) {
                buttonContexts.timeTotal.forEach(context => {
                    setTimeTitle(context, timeData.current, timeData.total);
                });

                appState.lastTimeInfo = timeData;
                sendLogToPropertyInspector(`Время синхронизировано: ${timeData.current}/${timeData.total}`, 'info');
            }
        } else if (appState.lastTimeInfo) {
            sendLogToPropertyInspector('Сброс кэша времени из-за ошибки получения данных', 'info');
            appState.lastTimeInfo = null;
        }
    } catch (error) {
        sendLogToPropertyInspector(`Ошибка в checkTimeState: ${error.message}`, 'error');
        log.error('Ошибка в checkTimeState:', error);
    }
}

async function checkCoverState() {
    try {
        if (buttonContexts.cover.length === 0) return;

        sendLogToPropertyInspector(`Проверка обложки для ${buttonContexts.cover.length} кнопок`, 'info');
        sendLogToPropertyInspector('Получение информации о треке', 'info');

        const trackInfo = await deps.yandexMusic.getTrackInfo();
        if (trackInfo?.coverUrl) {
            const trackId = `${trackInfo.title}-${trackInfo.artist}`;
            const lastTrackId = appState.lastTrackInfo
                ? `${appState.lastTrackInfo.title}-${appState.lastTrackInfo.artist}`
                : null;

            if (trackId === lastTrackId && appState.lastTrackInfo?.coverUrl === trackInfo.coverUrl) {
                return;
            }

            sendLogToPropertyInspector(`Найден новый трек: ${trackInfo.title} - ${trackInfo.artist}`, 'info');
            sendLogToPropertyInspector(`URL обложки: ${trackInfo.coverUrl}`, 'info');
            if (trackInfo.originalCoverUrl && trackInfo.originalCoverUrl !== trackInfo.coverUrl) {
                sendLogToPropertyInspector(`Оригинальный URL: ${trackInfo.originalCoverUrl}`, 'info');
            }

            try {
                sendLogToPropertyInspector('Скачивание и установка изображения', 'info');
                await downloadAndSetImageAsDataUrl(trackInfo.coverUrl);
                appState.lastTrackInfo = trackInfo;
                sendLogToPropertyInspector(`Обложка обновлена для трека: ${trackInfo.title}`, 'info');
                log.info('Обложка обновлена:', trackInfo.title, 'от', trackInfo.artist);
            } catch (error) {
                sendLogToPropertyInspector(`Ошибка при установке изображения: ${error.message}`, 'error');
                log.error('Ошибка при установке изображения:', error);
            }
        } else {
            sendLogToPropertyInspector('Не удалось получить информацию о треке или обложку', 'error');
            log.error('Не удалось получить информацию о треке');

            if (appState.lastTrackInfo) {
                sendLogToPropertyInspector('Сброс кэша трека из-за ошибки', 'info');
                appState.lastTrackInfo = null;
            }
        }
    } catch (error) {
        sendLogToPropertyInspector(`Ошибка в checkCoverState: ${error.message}`, 'error');
        log.error('Ошибка в checkCoverState:', error);
    }
}

function startStateChecks() {
    const { intervals } = appState;

    Object.values(intervals).forEach(id => id && clearInterval(id));

    intervals.playback = setInterval(checkPlaybackState, 500);
    intervals.like = setInterval(checkLikeState, 1000);
    intervals.mute = setInterval(checkMuteState, 1000);
    intervals.cover = setInterval(checkCoverState, 3000);
    intervals.time = setInterval(checkTimeState, 1000);
    intervals.trackInfo = setInterval(checkTrackInfoState, 1000);

    log.info('Запущены проверки состояния (shuffle/repeat через наблюдатель страницы)');
}

module.exports = {
    applyYmRemoteState,
    applyTrackInfoFromRemoteState,
    checkPlaybackState,
    checkLikeState,
    checkMuteState,
    checkShuffleState,
    checkRepeatState,
    checkTrackInfoState,
    checkTimeState,
    checkCoverState,
    startStateChecks
};
