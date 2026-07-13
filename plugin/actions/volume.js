'use strict';

const { Actions, log } = require('../utils/plugin');
const { deps } = require('../lib/deps');
const { addContext, removeContext } = require('../lib/contexts');
const { setOptimisticState } = require('../lib/state-sync');
const { createInputCoalescer } = require('../lib/input-coalescer');
const { resolveSetting } = require('../lib/settings');

function getVolumeStep(context, actionKey) {
    return resolveSetting('volumeStep', {
        actionKey,
        context,
        legacyKey: 'volumeStep'
    });
}

const volumeInput = createInputCoalescer(async (_context, delta) => {
    const result = await deps.yandexMusic.changeVolume(delta);
    if (result?.success && typeof result.muted === 'boolean') {
        setOptimisticState('mute', result.muted ? 1 : 0);
    }
    return result;
});

function createVolumeKeyActions(deltaSign, actionKey) {
    return {
        default: { volumeStep: 5 },
        _didReceiveSettings(data) {
            this.data[data.context] = Object.assign({ ...this.default }, data.payload.settings);
        },
        async keyUp({ context }) {
            const step = getVolumeStep(context, actionKey);
            try {
                const result = await volumeInput.add(context, deltaSign * step);
                if (!result) deps.plugin.showAlert(context);
            } catch (error) {
                log.error('Ошибка при изменении громкости кнопкой:', error);
                deps.plugin.showAlert(context);
            }
        }
    };
}

async function toggleMuteOnEncoder(context) {
    const result = await deps.yandexMusic.toggleMute();
    if (result) {
        if (typeof result.muted === 'boolean') {
            setOptimisticState('mute', result.muted ? 1 : 0);
        }
    } else {
        deps.plugin.showAlert(context);
    }
}

module.exports = function registerVolumeActions(plugin) {
    plugin['ym-volume-add'] = new Actions(createVolumeKeyActions(1, 'ym-volume-add'));
    plugin['ym-volume-remove'] = new Actions(createVolumeKeyActions(-1, 'ym-volume-remove'));

    plugin['ym-volume-encoder'] = new Actions({
        default: { volumeStep: 5 },
        _didReceiveSettings(data) {
            this.data[data.context] = Object.assign({ ...this.default }, data.payload.settings);
        },
        async _willAppear({ context }) {
            log.info('YM Volume Encoder появился:', context);
            addContext('volumeEncoder', context);
            plugin.setTitle(context, '');

            const muted = await deps.yandexMusic.getMuteIsMuted();
            if (muted !== null) {
                plugin.setState(context, muted ? 1 : 0);
            }
        },
        _willDisappear({ context }) {
            log.info('YM Volume Encoder исчез:', context);
            removeContext('volumeEncoder', context);
        },
        async keyUp({ context }) {
            log.info('YM Volume Encoder keyUp:', context);
            try {
                await toggleMuteOnEncoder(context);
            } catch (error) {
                log.error('Ошибка при переключении звука через кнопку энкодера:', error);
                plugin.showAlert(context);
            }
        },
        async dialDown({ context, payload }) {
            log.info('YM Volume Encoder dialDown:', context, JSON.stringify(payload));
            try {
                await toggleMuteOnEncoder(context);
            } catch (error) {
                log.error('Ошибка при переключении звука через энкодер:', error);
                plugin.showAlert(context);
            }
        },
        async dialRotate({ context, payload }) {
            log.info('YM Volume Encoder dialRotate:', context, JSON.stringify(payload));

            const ticks = payload?.ticks || 0;
            log.info(`Тики вращения: ${ticks}`);
            if (ticks === 0) {
                log.info('Тики равны 0, пропускаем');
                return;
            }

            const volumeStep = getVolumeStep(context, 'ym-volume-encoder');
            const delta = ticks * volumeStep;

            try {
                log.info(`Изменяем громкость на ${delta}%`);
                const result = await volumeInput.add(context, delta);
                if (result) {
                    if (typeof result.muted === 'boolean') {
                        setOptimisticState('mute', result.muted ? 1 : 0);
                    }
                } else {
                    log.error('changeVolume вернул false');
                    plugin.showAlert(context);
                }
            } catch (error) {
                log.error('Ошибка при изменении громкости через энкодер:', error);
                plugin.showAlert(context);
            }
        }
    });
};
