'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const directory = path.join(__dirname, '..', 'test');
const tests = fs.readdirSync(directory).filter(name => name.endsWith('.test.js')).sort().map(name => path.join(directory, name));
const result = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
