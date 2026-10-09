'use strict';

const registerPlaybackActions = require('./playback');
const registerLikeDislikeActions = require('./like-dislike');
const registerShuffleRepeatActions = require('./shuffle-repeat');
const registerMuteAction = require('./mute');
const registerVolumeActions = require('./volume');
const registerCoverAction = require('./cover');
const registerCoverProgressAction = require('./cover-progress');
const registerTrackInfoAction = require('./track-info');
const registerTimeTotalAction = require('./time-total');
const registerEncoderActions = require('./encoders');
const registerLaunchAction = require('./launch');
const registerLinkCopyAction = require('./link-copy');

function registerActions(plugin) {
    registerPlaybackActions(plugin);
    registerLikeDislikeActions(plugin);
    registerShuffleRepeatActions(plugin);
    registerMuteAction(plugin);
    registerVolumeActions(plugin);
    registerCoverAction(plugin);
    registerCoverProgressAction(plugin);
    registerLaunchAction(plugin);
    registerLinkCopyAction(plugin);
    registerTrackInfoAction(plugin);
    registerTimeTotalAction(plugin);
    registerEncoderActions(plugin);
}

module.exports = { registerActions };
