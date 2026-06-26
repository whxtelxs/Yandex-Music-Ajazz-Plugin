'use strict';

const { Actions, log } = require('../utils/plugin');
const { deps } = require('../lib/deps');

async function togglePlaybackOnEncoder(context, errorLabel) {
    try {
        const result = await deps.yandexMusic.togglePlayback();
        if (!result) deps.plugin.showAlert(context);
    } catch (error) {
        log.error(errorLabel, error);
        deps.plugin.showAlert(context);
    }
}

function createPlaybackEncoderAction(name, dialRotateHandler) {
    return {
        default: {},
        async _willAppear({ context }) {
            log.info(`${name} появился:`, context);
            deps.plugin.setTitle(context, '');
            deps.plugin.setState(context, 0);
        },
        _willDisappear({ context }) {
            log.info(`${name} исчез:`, context);
        },
        async keyUp({ context }) {
            log.info(`${name} keyUp:`, context);
            await togglePlaybackOnEncoder(context, `Ошибка при переключении воспроизведения через кнопку энкодера (${name}):`);
        },
        async dialDown({ context, payload }) {
            log.info(`${name} dialDown:`, context, JSON.stringify(payload));
            await togglePlaybackOnEncoder(context, `Ошибка при переключении воспроизведения через энкодер (${name}):`);
        },
        dialRotate: dialRotateHandler
    };
}

module.exports = function registerEncoderActions(plugin) {
    plugin['ym-seek-encoder'] = new Actions(createPlaybackEncoderAction('YM Seek Encoder', async ({ context, payload }) => {
        log.info('YM Seek Encoder dialRotate:', context, JSON.stringify(payload));
        const ticks = payload?.ticks || 0;

        try {
            const result = await deps.yandexMusic.seekRelative(ticks);
            if (!result) plugin.showAlert(context);
        } catch (error) {
            log.error('Ошибка при перемотке через энкодер:', error);
            plugin.showAlert(context);
        }
    }));

    plugin['ym-track-encoder'] = new Actions(createPlaybackEncoderAction('YM Track Encoder', async ({ context, payload }) => {
        log.info('YM Track Encoder dialRotate:', context, JSON.stringify(payload));
        const ticks = payload?.ticks || 0;
        if (ticks === 0) return;

        try {
            const result = ticks > 0
                ? await deps.yandexMusic.nextTrack()
                : await deps.yandexMusic.previousTrack();

            if (!result) plugin.showAlert(context);
        } catch (error) {
            log.error('Ошибка при переключении трека через энкодер:', error);
            plugin.showAlert(context);
        }
    }));
};
