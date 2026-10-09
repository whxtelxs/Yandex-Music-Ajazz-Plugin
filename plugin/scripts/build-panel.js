'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const esbuild = require('esbuild');

const plugin = path.resolve(__dirname, '..');
const dashboard = path.resolve(plugin, '../propertyInspector/dashboard');
const output = path.join(dashboard, 'dist');
const buildOptions = {
    entryPoints: [path.join(dashboard, 'src/index.jsx')],
    outfile: path.join(output, 'panel.js'),
    bundle: true,
    minify: true,
    treeShaking: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome110', 'safari16.4'],
    jsx: 'automatic',
    nodePaths: [path.join(plugin, 'node_modules')],
    define: { 'process.env.NODE_ENV': '"production"' },
    legalComments: 'none',
    metafile: true
};

function buildPanel() {
    fs.mkdirSync(output, { recursive: true });
    const result = esbuild.buildSync(buildOptions);
    execFileSync(process.execPath, [path.join(plugin, 'node_modules/@tailwindcss/cli/dist/index.mjs'), '-i', path.join(dashboard, 'src/styles.css'), '-o', path.join(output, 'panel.css'), '--minify'], { cwd: plugin, stdio: 'inherit' });
    const cssFile = path.join(output, 'panel.css');
    fs.writeFileSync(cssFile, fs.readFileSync(cssFile, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ''));
    const packages = new Set(['@heroui/styles', 'tailwindcss', 'tw-animate-css']);
    const bundledInputs = Object.values(result.metafile.outputs).flatMap(output => Object.entries(output.inputs).filter(([, info]) => info.bytesInOutput > 0).map(([input]) => input));
    for (const input of bundledInputs) {
        const match = input.replaceAll('\\', '/').match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
        if (match) packages.add(match[1]);
    }
    const notices = [];
    for (const name of [...packages].sort()) {
        const directory = path.join(plugin, 'node_modules', name);
        const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
        const licenseFile = fs.readdirSync(directory).find(file => /^license(?:\.|$)/i.test(file));
        if (!licenseFile) throw new Error('License missing: ' + name);
        notices.push(name + ' ' + metadata.version + '\n' + fs.readFileSync(path.join(directory, licenseFile), 'utf8'));
    }
    fs.writeFileSync(path.join(output, 'licenses.txt'), notices.join('\n\n'));
    for (const file of ['panel.js', 'panel.css']) console.log(file + ': ' + Math.round(fs.statSync(path.join(output, file)).size / 1024) + ' KiB');
}

if (require.main === module) buildPanel();
module.exports = { buildOptions, dashboard, plugin };
