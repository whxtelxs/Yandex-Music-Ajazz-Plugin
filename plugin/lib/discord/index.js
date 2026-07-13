'use strict';

const { createDiscordPresenceService } = require('./service');

module.exports = {
    createDiscordPresenceService,
    ...require('./builder')
};
