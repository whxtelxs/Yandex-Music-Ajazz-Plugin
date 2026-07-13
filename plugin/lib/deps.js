'use strict';

const deps = {
    plugin: null,
    yandexMusic: null,
    settingsServer: null,
    launcher: null
};

function initDeps(plugin, yandexMusic, launcher = null) {
    deps.plugin = plugin;
    deps.yandexMusic = yandexMusic;
    deps.launcher = launcher;
}

function setSettingsServer(settingsServer) {
    deps.settingsServer = settingsServer;
}

module.exports = { deps, initDeps, setSettingsServer };
