const path = require('path');
const fs = require('fs-extra');

const currentDir = __dirname;

const parentDir = path.join(currentDir, '..');
const PluginName = path.basename(parentDir);


const PluginPath = path.join(process.env.APPDATA, 'HotSpot/StreamDock/plugins', PluginName);

try {
    fs.removeSync(PluginPath);

    fs.ensureDirSync(path.dirname(PluginPath));

    fs.copySync(path.resolve(__dirname, '..'), PluginPath, {
        filter: (src) => {
            const relativePath = path.relative(path.resolve(__dirname, '..'), src);
            return !relativePath.startsWith('plugin\\node_modules') 
                 &&!relativePath.startsWith('plugin\\index.js')
                 &&!relativePath.startsWith('plugin\\package.json')
                 &&!relativePath.startsWith('plugin\\package-lock.json')
                 &&!relativePath.startsWith('plugin\\pnpm-lock.yaml')
                 &&!relativePath.startsWith('plugin\\yarn.lock')
                 &&!relativePath.startsWith('plugin\\build')
                 &&!relativePath.startsWith('plugin\\log')
                 &&!relativePath.startsWith('.git')
                 &&!relativePath.startsWith('.vscode');
        }
    });
    
    fs.copySync( path.join(__dirname, "build"), path.join(PluginPath,'plugin'))
} catch (err) {
    console.error(`Copy error "${PluginName}":`, err);
}