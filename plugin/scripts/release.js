'use strict';

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');

const pluginRoot = path.resolve(__dirname, '..');
const projectRoot = path.dirname(pluginRoot);

function isVersion(value) {
    return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value);
}

async function chooseVersion(current, ask) {
    while (true) {
        const answer = (await ask('Текущая версия ' + current + '. Enter: оставить, или введи новую X.Y.Z: ')).trim();
        const version = answer || current;
        if (isVersion(version)) return version;
        console.log('Нужна версия из трех чисел, например 2.0.1.');
    }
}

function syncVersion(root, version) {
    if (!isVersion(version)) throw new Error('Неверная версия: ' + version);
    const files = ['manifest.json', 'plugin/package.json', 'plugin/package-lock.json'];
    const entries = files.map(file => {
        const filePath = path.join(root, file);
        const original = fs.readFileSync(filePath, 'utf8');
        return { filePath, original, data: JSON.parse(original) };
    });
    const [manifest, metadata, lock] = entries.map(entry => entry.data);
    if (!lock.packages?.['']) throw new Error('В package-lock.json отсутствует корневой пакет.');
    manifest.Version = version;
    metadata.version = version;
    lock.version = version;
    lock.packages[''].version = version;
    const written = [];
    try {
        for (const entry of entries) {
            const ending = entry.original.includes('\r\n') ? '\r\n' : '\n';
            const content = (JSON.stringify(entry.data, null, 2) + '\n').replaceAll('\n', ending);
            if (content === entry.original) continue;
            written.push(entry);
            fs.writeFileSync(entry.filePath, content);
        }
    } catch (error) {
        for (const entry of written) fs.writeFileSync(entry.filePath, entry.original);
        throw error;
    }
}

function needsInstall(root) {
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    for (const [relativePath, expected] of Object.entries(lock.packages || {})) {
        if (!relativePath.startsWith('node_modules/') || expected.optional) continue;
        try {
            const installed = JSON.parse(fs.readFileSync(path.join(root, relativePath, 'package.json'), 'utf8'));
            if (installed.version !== expected.version) return true;
        } catch {
            return true;
        }
    }
    return false;
}

function runNpm(args) {
    const npmCli = process.env.npm_execpath;
    if (!npmCli) throw new Error('Запусти сборку через npm run release.');
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [npmCli, ...args], { cwd: pluginRoot, stdio: 'inherit' });
        child.once('error', reject);
        child.once('exit', (code, signal) => {
            if (code === 0) resolve();
            else reject(new Error('npm ' + args.join(' ') + ' завершился ' + (signal ? 'сигналом ' + signal : 'с кодом ' + code)));
        });
    });
}

async function runPipeline(install, run = runNpm) {
    const steps = [];
    if (install) steps.push(['Установка зависимостей', ['ci', '--include=dev']]);
    steps.push(
        ['Проверка синтаксиса', ['run', 'check']],
        ['Тесты', ['test']],
        ['Сборка панели, CSS и архива', ['run', 'prod']]
    );
    for (const [title, args] of steps) {
        console.log('\n' + title);
        await run(args);
    }
}

async function promptVersion(current) {
    if (!process.stdin.isTTY) throw new Error('Для сборки без вопросов используй npm run release -- --keep-version.');
    const input = readline.createInterface({ input: process.stdin, output: process.stdout });
    function ask(question) {
        return new Promise((resolve, reject) => {
            const cancel = () => { reject(new Error('Сборка отменена.')); };
            input.once('close', cancel);
            input.question(question, answer => {
                input.removeListener('close', cancel);
                resolve(answer);
            });
        });
    }
    input.on('SIGINT', () => input.close());
    try {
        return await chooseVersion(current, ask);
    } finally {
        input.close();
    }
}

async function main(args = process.argv.slice(2)) {
    if (Number(process.versions.node.split('.')[0]) < 20) throw new Error('Нужен Node.js 20 или новее.');
    if (args.length > 1 || (args.length && args[0] !== '--keep-version')) {
        throw new Error('Поддерживается только параметр --keep-version.');
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'manifest.json'), 'utf8'));
    const version = args[0] === '--keep-version' ? manifest.Version : await promptVersion(manifest.Version);
    syncVersion(projectRoot, version);
    console.log('\nСборка версии ' + version);
    const install = needsInstall(pluginRoot);
    if (!install) console.log('Зависимости установлены, повторная установка не нужна.');
    await runPipeline(install);
    console.log('\nГотово: ' + path.join(projectRoot, 'release', 'YandexMusic.Ajazz.Plugin.v' + version + '.zip'));
}

if (require.main === module) {
    main().catch(error => {
        console.error('\nСборка остановлена: ' + error.message);
        process.exitCode = 1;
    });
}

module.exports = { isVersion, chooseVersion, syncVersion, needsInstall, runPipeline };
