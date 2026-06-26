'use strict';

const { Actions, log } = require('../utils/plugin');
const { deps } = require('../lib/deps');
const { appState } = require('../lib/app-state');
const { sendLogToPropertyInspector } = require('../lib/helpers');
const { buttonContexts, addContext, removeContext, hasContext } = require('../lib/contexts');
const { checkCoverState } = require('../lib/state-sync');

module.exports = function registerCoverAction(plugin) {
    plugin['ym-cover'] = new Actions({
        default: {},
        async _willAppear({ context }) {
            log.info('YM Cover появился:', context);
            sendLogToPropertyInspector(`Инициализация кнопки обложки: ${context}`, 'info');

            const isNewButton = !hasContext('cover', context);

            if (isNewButton) {
                addContext('cover', context);
                sendLogToPropertyInspector(`Добавлена кнопка обложки. Всего кнопок: ${buttonContexts.cover.length}`, 'info');
            } else {
                sendLogToPropertyInspector(`Кнопка обложки возвращена на страницу: ${context}`, 'info');
            }

            sendLogToPropertyInspector('Соединение установлено, загружаем обложку', 'info');

            if (isNewButton) {
                sendLogToPropertyInspector('Сброс кэша трека для новой кнопки', 'info');
                appState.lastTrackInfo = null;
            } else {
                sendLogToPropertyInspector('Восстановление обложки для существующей кнопки', 'info');
            }

            sendLogToPropertyInspector('Немедленная загрузка обложки', 'info');
            await checkCoverState();
        },
        _willDisappear({ context }) {
            const remaining = removeContext('cover', context);
            sendLogToPropertyInspector(`Удалена кнопка обложки. Осталось кнопок: ${remaining}`, 'info');
        },
        async keyUp({ context }) {
            try {
                const result = await deps.yandexMusic.togglePlayback();
                if (!result) plugin.showAlert(context);
            } catch (error) {
                log.error('Ошибка при переключении воспроизведения (обложка):', error);
                plugin.showAlert(context);
            }
        }
    });
};
