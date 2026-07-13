'use strict';

const { Actions, log } = require('../utils/plugin');
const { deps } = require('../lib/deps');
const { addContext, removeContext } = require('../lib/contexts');
const { checkPlaybackState, setOptimisticState, requestMediaRefresh } = require('../lib/state-sync');

module.exports = function registerPlaybackActions(plugin) {
    plugin['ym-play-pause'] = new Actions({
        default: { state: 0 },
        async _willAppear({ context }) {
            log.info('YM Play/Pause появился:', context);
            addContext('playPause', context);
            await checkPlaybackState();
        },
        _willDisappear({ context }) {
            removeContext('playPause', context);
        },
        async keyUp({ context }) {
            try {
                const result = await deps.yandexMusic.togglePlayback();
                if (!result) plugin.showAlert(context);
                else if (typeof result.playing === 'boolean') {
                    setOptimisticState('playback', result.playing ? 1 : 0);
                }
            } catch (error) {
                log.error('Ошибка при переключении воспроизведения:', error);
                plugin.showAlert(context);
            }
        }
    });

    plugin['ym-previous'] = new Actions({
        default: {},
        async _willAppear({ context }) {
            log.info('YM Previous появился:', context);
        },
        async keyUp({ context }) {
            try {
                const result = await deps.yandexMusic.previousTrack();
                if (!result) plugin.showAlert(context);
                else requestMediaRefresh();
            } catch (error) {
                log.error('Ошибка при переходе к предыдущему треку:', error);
                plugin.showAlert(context);
            }
        }
    });

    plugin['ym-next'] = new Actions({
        default: {},
        async _willAppear({ context }) {
            log.info('YM Next появился:', context);
        },
        async keyUp({ context }) {
            try {
                const result = await deps.yandexMusic.nextTrack();
                if (!result) plugin.showAlert(context);
                else requestMediaRefresh();
            } catch (error) {
                log.error('Ошибка при переходе к следующему треку:', error);
                plugin.showAlert(context);
            }
        }
    });
};
