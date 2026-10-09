'use strict';

function parseRuntimeOptions(argv) {
    const args = new Map();
    for (let index = 2; index < argv.length; index += 2) {
        args.set(String(argv[index]).replace(/^-+/, ''), argv[index + 1]);
    }
    const port = Number(args.get('port'));
    const uuid = args.get('pluginUUID');
    const event = args.get('registerEvent');
    if (!Number.isInteger(port) || port < 1 || port > 65535 || !uuid || !event) {
        throw new Error('Некорректные параметры запуска StreamDock');
    }
    let info;
    try {
        info = JSON.parse(args.get('info') || '{}');
    } catch {
        throw new Error('Некорректные сведения о StreamDock');
    }
    return { port, uuid, event, language: info.application?.language || 'ru', info };
}

module.exports = { parseRuntimeOptions };
