'use strict';

const fs = require('fs');
const path = require('path');
const file = path.resolve(__dirname, '../../propertyInspector/utils/tailwind.css');
let source = fs.readFileSync(file, 'utf8');
while (source.includes('/*')) {
    const start = source.indexOf('/*');
    const end = source.indexOf('*/', start);
    if (end < 0) throw new Error('Unclosed CSS comment');
    source = source.slice(0, start) + source.slice(end + 2);
}
fs.writeFileSync(file, source, 'utf8');
