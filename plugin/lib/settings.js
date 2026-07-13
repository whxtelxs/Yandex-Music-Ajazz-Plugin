'use strict';

const { deps } = require('./deps');
const { resolveDiscordAppId } = require('./discord/constants');

const SETTINGS_SCHEMA = Object.freeze({
    debugPort: { defaultValue: 9222, min: 1, max: 65535 },
    volumeStep: { defaultValue: 5, min: 1, max: 99 },
    trackInfoTextSize: { defaultValue: 12, min: 4, max: 24 },
    trackInfoFontSize: { defaultValue: 14, min: 8, max: 28 },
    timeTotalFontSize: { defaultValue: 14, min: 8, max: 28 },
    debugMode: { defaultValue: false, type: 'boolean' },
    discordRpcEnabled: { defaultValue: false, type: 'boolean' }
});

function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function clampSetting(key, value) {
    const schema = SETTINGS_SCHEMA[key];
    if (!schema) return undefined;
    if (schema.type === 'boolean') return !!value;
    const number = parseInt(value, 10);
    if (Number.isNaN(number)) return schema.defaultValue;
    return Math.max(schema.min, Math.min(schema.max, number));
}

function sanitizeSettingsPatch(input) {
    const patch = {};
    for (const key of Object.keys(SETTINGS_SCHEMA)) {
        if (hasOwn(input, key)) patch[key] = clampSetting(key, input[key]);
    }
    return patch;
}

function mergeGlobalSettings(current, patch) {
    return {
        ...(current || {}),
        ...sanitizeSettingsPatch(patch)
    };
}

function getRawGlobalSettings() {
    return deps.plugin?.constructor?.globalSettings || {};
}

function getSettingsSnapshot() {
    const current = getRawGlobalSettings();
    const snapshot = {};
    for (const [key, schema] of Object.entries(SETTINGS_SCHEMA)) {
        snapshot[key] = hasOwn(current, key) ? clampSetting(key, current[key]) : schema.defaultValue;
    }
    return snapshot;
}

function getDiscordConfig() {
    const snapshot = getSettingsSnapshot();
    const raw = getRawGlobalSettings();
    const legacyAppId = raw?.discordAppId;
    return {
        enabled: !!snapshot.discordRpcEnabled,
        appId: resolveDiscordAppId(legacyAppId)
    };
}

function resolveSetting(key, { actionKey, context, legacyKey } = {}) {
    const current = getRawGlobalSettings();
    if (hasOwn(current, key)) return clampSetting(key, current[key]);

    const legacyValue = actionKey && context && legacyKey
        ? deps.plugin?.[actionKey]?.data?.[context]?.[legacyKey]
        : undefined;
    if (legacyValue !== undefined && legacyValue !== null) {
        return clampSetting(key, legacyValue);
    }
    return SETTINGS_SCHEMA[key].defaultValue;
}

module.exports = {
    SETTINGS_SCHEMA,
    clampSetting,
    sanitizeSettingsPatch,
    mergeGlobalSettings,
    getSettingsSnapshot,
    getDiscordConfig,
    resolveSetting
};
