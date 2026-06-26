'use strict';

const { Plugins, log } = require('./utils/plugin');
const yandexMusic = require('./utils/yandex-music');
const { initDeps } = require('./lib/deps');
const { registerGlobalSettings } = require('./lib/global-settings');
const { registerPropertyInspector } = require('./lib/property-inspector');
const { applyYmRemoteState, startStateChecks } = require('./lib/state-sync');
const { registerActions } = require('./actions');

const plugin = new Plugins('demo');
initDeps(plugin, yandexMusic);

yandexMusic.connect().then(() => {
    log.info('Инициализация CDP соединения выполнена при запуске плагина');
}).catch(err => {
    log.error('Ошибка при инициализации CDP соединения:', err);
});

yandexMusic.onRemoteStateChange = applyYmRemoteState;

registerGlobalSettings(plugin);
registerActions(plugin);
registerPropertyInspector(plugin);
startStateChecks();
