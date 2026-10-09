'use strict';

const { Actions, log } = require('../utils/plugin');
const { addContext, removeContext, hasContext, buttonContexts } = require('../lib/contexts');
const { setTrackInfoDisplay } = require('../lib/display');
const { checkTrackInfoState } = require('../lib/state-sync');

module.exports = function registerTrackInfoAction(plugin) {
    plugin['ym-track-info'] = new Actions({
        default: { textSize: 12, fontSize: 14 },
        _didReceiveSettings(data) {
            this.data[data.context] = Object.assign({ ...this.default }, data.payload.settings);
            if (buttonContexts.trackInfo.includes(data.context)) {
                checkTrackInfoState();
            }
        },
        async _willAppear({ context }) {
            log.info('YM Track Info появился:', context);

            if (!hasContext('trackInfo', context)) {
                addContext('trackInfo', context);
            }

            setTrackInfoDisplay(context, 'Загрузка...');
            await checkTrackInfoState();
        },
        _willDisappear({ context }) {
            const remaining = removeContext('trackInfo', context);
        },
        keyUp() {
        }
    });
};
