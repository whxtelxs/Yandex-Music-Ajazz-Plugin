'use strict';

const { Actions, log } = require('../utils/plugin');
const { deps } = require('../lib/deps');
const { getCurrentTrackLink } = require('../lib/track-link');
const { writeClipboard } = require('../lib/clipboard');

module.exports = function registerLinkCopyAction(plugin, { copy = writeClipboard, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
    const pending = new Set();
    const errorTimers = new Map();
    plugin['ym-link-copy'] = new Actions({
        default: {},
        _willAppear({ context }) {
            plugin.setImage(context, 'static/ym-link-copy.jpg');
        },
        _willDisappear({ context }) {
            clearTimer(errorTimers.get(context));
            errorTimers.delete(context);
        },
        async keyUp({ context }) {
            if (pending.has(context)) return;
            const data = this.data[context];
            pending.add(context);
            try {
                const link = await getCurrentTrackLink(deps.yandexMusic);
                await copy(link);
            } catch (error) {
                log.error('Копирование ссылки на трек:', error.message);
                if (data && this.data[context] === data) {
                    clearTimer(errorTimers.get(context));
                    plugin.setImage(context, 'static/ym-err-icon.jpg');
                    errorTimers.set(context, setTimer(() => {
                        errorTimers.delete(context);
                        if (this.data[context] === data) plugin.setImage(context, 'static/ym-link-copy.jpg');
                    }, 2000));
                }
            } finally {
                pending.delete(context);
            }
        }
    });
};
