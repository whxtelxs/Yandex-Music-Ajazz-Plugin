'use strict';

const { Actions, log } = require('../utils/plugin');
const { deps } = require('../lib/deps');
const { addContext, removeContext } = require('../lib/contexts');
const { checkCoverState, checkTimeState, checkPlaybackState, setOptimisticState } = require('../lib/state-sync');
const { renderCoverProgress, renderTrackProgress } = require('../lib/cover-progress');

module.exports = function registerCoverProgressAction(plugin) {
    for (const [action, contextKey, initialImage, hasCover] of [
        ['ym-cover-progress', 'coverProgress', () => renderCoverProgress(null), true],
        ['ym-track-progress', 'trackProgress', () => renderTrackProgress(0), false]
    ]) plugin[action] = new Actions({
        default: {},
        async _willAppear({ context }) {
            addContext(contextKey, context);
            plugin.setImage(context, initialImage());
            await Promise.all([checkTimeState(), checkPlaybackState(), ...(hasCover ? [checkCoverState()] : [])]);
        },
        _willDisappear({ context }) {
            removeContext(contextKey, context);
        },
        async keyUp({ context }) {
            try {
                const result = await deps.yandexMusic.togglePlayback();
                if (!result) plugin.showAlert(context);
                else if (typeof result.playing === 'boolean') setOptimisticState('playback', result.playing ? 1 : 0);
            } catch (error) {
                log.error('Переключение воспроизведения на кнопке с прогрессом:', error.message);
                plugin.showAlert(context);
            }
        }
    });
};
