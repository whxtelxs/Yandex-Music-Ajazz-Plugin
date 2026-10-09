'use strict';

const { Actions, log } = require('../utils/plugin');
const { deps } = require('../lib/deps');
const { createInputCoalescer } = require('../lib/input-coalescer');
const { setOptimisticState, requestMediaRefresh } = require('../lib/state-sync');

const seekInput = createInputCoalescer((_context, ticks, signal) => deps.yandexMusic.seekRelative(ticks, { signal }));
const trackInput = createInputCoalescer(async (_context, ticks, signal) => {
    const steps = Math.abs(Math.trunc(ticks));
    for (let index = 0; index < steps; index++) {
        if (signal.aborted) return false;
        const result = ticks > 0
            ? await deps.yandexMusic.nextTrack({ signal })
            : await deps.yandexMusic.previousTrack({ signal });
        if (!result) return false;
        if (index + 1 < steps) await new Promise(resolve => setTimeout(resolve, 120));
    }
    return true;
});

async function togglePlaybackOnEncoder(context, errorLabel) {
    try {
        const result = await deps.yandexMusic.togglePlayback();
        if (!result && Actions.actions[context]) deps.plugin.showAlert(context);
        else if (typeof result.playing === 'boolean') setOptimisticState('playback', result.playing ? 1 : 0);
    } catch (error) {
        log.error(errorLabel, error);
        if (Actions.actions[context]) deps.plugin.showAlert(context);
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
            seekInput.cancel(context);
            trackInput.cancel(context);
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
    plugin['ym-seek-encoder'] = new Actions(createPlaybackEncoderAction('YM Seek Encoder', async function ({ context, payload }) {
        log.info('YM Seek Encoder dialRotate:', context, JSON.stringify(payload));
        const ticks = payload?.ticks || 0;

        try {
            const result = await seekInput.add(context, ticks);
            if (!result && this.data[context]) plugin.showAlert(context);
        } catch (error) {
            log.error('Ошибка при перемотке через энкодер:', error);
            if (this.data[context]) plugin.showAlert(context);
        }
    }));

    plugin['ym-track-encoder'] = new Actions(createPlaybackEncoderAction('YM Track Encoder', async function ({ context, payload }) {
        log.info('YM Track Encoder dialRotate:', context, JSON.stringify(payload));
        const ticks = payload?.ticks || 0;
        if (ticks === 0) return;

        try {
            const result = await trackInput.add(context, ticks);

            if (!result && this.data[context]) plugin.showAlert(context);
            else requestMediaRefresh();
        } catch (error) {
            log.error('Ошибка при переключении трека через энкодер:', error);
            if (this.data[context]) plugin.showAlert(context);
        }
    }));
};
