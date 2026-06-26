'use strict';

const registerDemoAction = require('./demo');
const registerPlaybackActions = require('./playback');
const registerLikeDislikeActions = require('./like-dislike');
const registerShuffleRepeatActions = require('./shuffle-repeat');
const registerMuteAction = require('./mute');
const registerVolumeActions = require('./volume');
const registerCoverAction = require('./cover');
const registerTrackInfoAction = require('./track-info');
const registerTimeTotalAction = require('./time-total');
const registerEncoderActions = require('./encoders');

function registerActions(plugin) {
    registerDemoAction(plugin);
    registerPlaybackActions(plugin);
    registerLikeDislikeActions(plugin);
    registerShuffleRepeatActions(plugin);
    registerMuteAction(plugin);
    registerVolumeActions(plugin);
    registerCoverAction(plugin);
    registerTrackInfoAction(plugin);
    registerTimeTotalAction(plugin);
    registerEncoderActions(plugin);
}

module.exports = { registerActions };
