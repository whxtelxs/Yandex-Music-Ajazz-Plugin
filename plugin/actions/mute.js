'use strict';

const { Actions, log } = require('../utils/plugin');
const { deps } = require('../lib/deps');
const { addContext, removeContext } = require('../lib/contexts');
const { checkMuteState } = require('../lib/state-sync');

module.exports = function registerMuteAction(plugin) {
    plugin['ym-mute'] = new Actions({
        default: { state: 0 },
        async _willAppear({ context }) {
            log.info('YM Mute появился:', context);
            addContext('mute', context);
            await checkMuteState();
        },
        _willDisappear({ context }) {
            removeContext('mute', context);
        },
        async keyUp({ context }) {
            try {
                const result = await deps.yandexMusic.toggleMute();
                if (!result) plugin.showAlert(context);
            } catch (error) {
                log.error('Ошибка при переключении звука:', error);
                plugin.showAlert(context);
            }
        }
    });
};
