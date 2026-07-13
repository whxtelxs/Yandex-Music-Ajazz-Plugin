'use strict';

const { Actions, log } = require('../utils/plugin');
const { deps } = require('../lib/deps');
const { addContext, removeContext } = require('../lib/contexts');
const { checkLikeState, setOptimisticState, requestMediaRefresh } = require('../lib/state-sync');

module.exports = function registerLikeDislikeActions(plugin) {
    plugin['ym-like'] = new Actions({
        default: { state: 0 },
        async _willAppear({ context }) {
            log.info('YM Like появился:', context);
            addContext('like', context);
            await checkLikeState();
        },
        _willDisappear({ context }) {
            removeContext('like', context);
        },
        async keyUp({ context }) {
            try {
                const result = await deps.yandexMusic.likeTrack();
                if (!result) plugin.showAlert(context);
                else if (typeof result.liked === 'boolean') {
                    setOptimisticState('like', result.liked ? 1 : 0);
                }
            } catch (error) {
                log.error('Ошибка при установке лайка:', error);
                plugin.showAlert(context);
            }
        }
    });

    plugin['ym-dislike'] = new Actions({
        default: {},
        async _willAppear({ context }) {
            log.info('YM Dislike появился:', context);
        },
        async keyUp({ context }) {
            try {
                const result = await deps.yandexMusic.dislikeTrack();
                if (!result) plugin.showAlert(context);
                else requestMediaRefresh();
            } catch (error) {
                log.error('Ошибка при установке дизлайка:', error);
                plugin.showAlert(context);
            }
        }
    });
};
