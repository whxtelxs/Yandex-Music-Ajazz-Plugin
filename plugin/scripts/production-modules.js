'use strict';

const fs = require('node:fs');
const path = require('node:path');

function getProductionModulePaths(lock, pluginRoot) {
    const paths = new Set();
    for (const [modulePath, expected] of Object.entries(lock.packages || {})) {
        if (!modulePath.startsWith('node_modules/') || expected.dev) continue;
        let installed;
        try {
            installed = JSON.parse(fs.readFileSync(path.join(pluginRoot, modulePath, 'package.json'), 'utf8'));
        } catch (error) {
            if (expected.optional && error.code === 'ENOENT') continue;
            throw error;
        }
        if (installed.version !== expected.version) throw new Error('Dependency version mismatch: ' + modulePath);
        paths.add('plugin/' + modulePath);
    }
    return paths;
}

module.exports = { getProductionModulePaths };
