'use strict';

const { Actions, log } = require('../utils/plugin');
const { sendLogToPropertyInspector } = require('../lib/helpers');
const { addContext, removeContext, hasContext, buttonContexts } = require('../lib/contexts');
const { appState } = require('../lib/app-state');
const { setTimeDisplay } = require('../lib/display');
const { checkTimeState } = require('../lib/state-sync');

module.exports = function registerTimeTotalAction(plugin) {
    plugin['ym-time-total'] = new Actions({
        default: { fontSize: 14 },
        _didReceiveSettings(data) {
            this.data[data.context] = Object.assign({ ...this.default }, data.payload.settings);
            if (buttonContexts.timeTotal.includes(data.context)) {
                appState.lastTimeInfo = null;
                checkTimeState();
            }
        },
        async _willAppear({ context }) {
            log.info('YM Time Total появился:', context);
            sendLogToPropertyInspector(`Инициализация кнопки времени (общее): ${context}`, 'info');

            if (!hasContext('timeTotal', context)) {
                addContext('timeTotal', context);
                sendLogToPropertyInspector(`Добавлена кнопка времени (общее). Всего кнопок: ${buttonContexts.timeTotal.length}`, 'info');
                appState.lastTimeInfo = null;
            }

            setTimeDisplay(context, '0:00', '0:00');
            await checkTimeState();
        },
        _willDisappear({ context }) {
            const remaining = removeContext('timeTotal', context);
            sendLogToPropertyInspector(`Удалена кнопка времени (общее). Осталось кнопок: ${remaining}`, 'info');
        },
        keyUp() {
            sendLogToPropertyInspector('Кнопка времени не кликабельная', 'info');
        }
    });
};
