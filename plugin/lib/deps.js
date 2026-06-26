'use strict';

const deps = {
    plugin: null,
    yandexMusic: null
};

function initDeps(plugin, yandexMusic) {
    deps.plugin = plugin;
    deps.yandexMusic = yandexMusic;
}

module.exports = { deps, initDeps };
