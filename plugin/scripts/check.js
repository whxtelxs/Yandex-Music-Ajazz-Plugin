'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.resolve(__dirname, '../..');
const { checkProject } = require('./project-check');
const project = checkProject(root);
let checked = 0;
function check(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (['node_modules', 'log', '.git', 'release'].includes(entry.name)) continue;
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) check(file);
        else if (entry.name.endsWith('.jsx')) {
            require('esbuild').transformSync(fs.readFileSync(file, 'utf8'), { loader: 'jsx', jsx: 'automatic' });
            checked++;
        } else if (entry.name.endsWith('.js')) {
            new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
            checked++;
        }
    }
}
check(path.join(root, 'plugin'));
check(path.join(root, 'propertyInspector'));
const dom = require('../utils/yandex-music/dom');
new vm.Script(typeof dom === 'string' ? dom : dom.YM_DOM_HELPERS, { filename: 'embedded-dom.js' });
console.log('Проверено JS файлов: ' + checked);
console.log('Проверен манифест v' + project.version + ', файлов: ' + project.files);
