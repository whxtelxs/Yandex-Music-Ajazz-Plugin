'use strict';

const { Actions, log } = require('../utils/plugin');
const { sendLogToPropertyInspector } = require('../lib/helpers');
const { addContext, removeContext, hasContext, buttonContexts } = require('../lib/contexts');
const { resetScrollingText } = require('../lib/app-state');
const { checkTrackInfoState } = require('../lib/state-sync');

module.exports = function registerTrackInfoAction(plugin) {
    plugin['ym-track-info'] = new Actions({
        default: { textSize: 12 },
        _didReceiveSettings(data) {
            this.data[data.context] = Object.assign({ ...this.default }, data.payload.settings);
            if (buttonContexts.trackInfo.includes(data.context)) {
                checkTrackInfoState();
            }
        },
        async _willAppear({ context }) {
            log.info('YM Track Info появился:', context);
            sendLogToPropertyInspector(`Инициализация кнопки информации о треке: ${context}`, 'info');

            if (!hasContext('trackInfo', context)) {
                addContext('trackInfo', context);
                sendLogToPropertyInspector(`Добавлена кнопка информации о треке. Всего кнопок: ${buttonContexts.trackInfo.length}`, 'info');
                resetScrollingText();
            }

            plugin.setTitle(context, 'Загрузка...');
            await checkTrackInfoState();
        },
        _willDisappear({ context }) {
            const remaining = removeContext('trackInfo', context);
            sendLogToPropertyInspector(`Удалена кнопка информации о треке. Осталось кнопок: ${remaining}`, 'info');
        },
        keyUp() {
            sendLogToPropertyInspector('Кнопка информации о треке не кликабельная', 'info');
        }
    });
};
