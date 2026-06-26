'use strict';

const { Actions, log } = require('../utils/plugin');
const { deps } = require('../lib/deps');
const { addContext, removeContext } = require('../lib/contexts');
const { checkShuffleState, checkRepeatState } = require('../lib/state-sync');

module.exports = function registerShuffleRepeatActions(plugin) {
    plugin['ym-shuffle'] = new Actions({
        default: { state: 0 },
        async _willAppear({ context }) {
            log.info('YM Shuffle появился:', context);
            addContext('shuffle', context);
            await deps.yandexMusic.refreshRemoteState();
            await checkShuffleState();
        },
        _willDisappear({ context }) {
            removeContext('shuffle', context);
        },
        async keyUp({ context }) {
            try {
                const remote = deps.yandexMusic.getRemoteState();
                if (remote?.shuffleAvailable === false) {
                    plugin.showAlert(context);
                    return;
                }
                const result = await deps.yandexMusic.toggleShuffle();
                if (!result) {
                    plugin.showAlert(context);
                    return;
                }
                await checkShuffleState();
            } catch (error) {
                log.error('Ошибка при переключении случайного порядка:', error);
                plugin.showAlert(context);
            }
        }
    });

    plugin['ym-repeat'] = new Actions({
        default: { state: 0 },
        async _willAppear({ context }) {
            log.info('YM Repeat появился:', context);
            addContext('repeat', context);
            await deps.yandexMusic.refreshRemoteState();
            await checkRepeatState();
        },
        _willDisappear({ context }) {
            removeContext('repeat', context);
        },
        async keyUp({ context }) {
            try {
                const result = await deps.yandexMusic.toggleRepeat();
                if (!result) {
                    plugin.showAlert(context);
                    return;
                }
                await checkRepeatState();
            } catch (error) {
                log.error('Ошибка при переключении повтора:', error);
                plugin.showAlert(context);
            }
        }
    });
};
