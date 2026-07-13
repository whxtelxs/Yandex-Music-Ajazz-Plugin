'use strict';

const { log } = require('../../plugin');

module.exports = {
    isWarmingUp() {
        return !!this._warmupUntil && Date.now() < this._warmupUntil;
    },

    setWarmingUp(durationMs = 45000) {
        this._warmupUntil = Date.now() + durationMs;
    },

    clearWarmingUp() {
        this._warmupUntil = 0;
    },

    async waitForPlayerReady({
        timeoutMs = 45000,
        intervalMs = 500
    } = {}) {
        const deadline = Date.now() + timeoutMs;
        log.info('Ожидание готовности интерфейса Яндекс Музыки...');

        while (Date.now() < deadline) {
            const ready = await this._evaluateDom(
                'return !!(ymFindSonataPlayerBar() || ymFindVibePlayerBar());',
                { priority: 'background', key: 'player-ready' }
            );
            if (ready) {
                log.info('Интерфейс плеера готов');
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }

        log.warn('Интерфейс плеера не готов за отведённое время');
        return false;
    }
};
