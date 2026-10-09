'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PanelClient } = require('../../propertyInspector/dashboard/src/client');

const tick = () => new Promise(resolve => setImmediate(resolve));

function dashboard() {
    const timers = new Map();
    const sockets = [];
    const notices = [];
    let timerId = 0;
    class Socket {
        static OPEN = 1;
        constructor(url) { this.url = url; this.readyState = 1; this.sent = []; this.handlers = {}; sockets.push(this); }
        send(raw) { this.sent.push(JSON.parse(raw)); }
        addEventListener(event, handler) { this.handlers[event] = handler; }
        close() { this.readyState = 3; this.handlers.close?.(); }
    }
    const client = new PanelClient({ WebSocket: Socket, location: { host: 'localhost:1', protocol: 'http:', search: '' },
        notify: (...args) => notices.push(args),
        setTimer: fn => { const id = ++timerId; timers.set(id, fn); return id; }, clearTimer: id => timers.delete(id) });
    client.connect();
    const deliver = message => sockets.at(-1).handlers.message({ data: JSON.stringify(message) });
    const hello = (settings = {}, revision = 1) => deliver({ type: 'hello', settings, revision, connection: { connected: true, stage: 'ready' } });
    return { client, sockets, timers, notices, deliver, hello };
}

test('panel connects at the current address without a token', () => {
    const f = dashboard();
    assert.equal(f.sockets[0].url, 'ws://localhost:1/ws');
});

test('panel coalesces rapid changes and confirms the final value', async () => {
    const f = dashboard();
    f.hello();
    for (let i = 1; i <= 20; i++) f.client.setSetting('volumeStep', i);
    assert.equal(f.timers.size, 1);
    const saving = f.client.flushSettings();
    const command = f.sockets[0].sent.at(-1);
    assert.deepEqual(command.settings, { volumeStep: 20 });
    f.deliver({ type: 'saveResult', requestId: command.requestId, revision: 2, ok: true, persisted: true, settings: { volumeStep: 20 } });
    await saving;
    assert.equal(f.client.state.settings.volumeStep, 20);
    assert.equal(f.client.state.saveStatus, 'saved');
    assert.deepEqual(f.notices, [['success', 'Шаг громкости сохранён: 20%']]);
});

test('a conflict restores the confirmed value but preserves other pending fields', async () => {
    const f = dashboard();
    f.hello();
    f.client.setSetting('volumeStep', 17);
    const saving = f.client.flushSettings();
    const command = f.sockets[0].sent.at(-1);
    f.client.setSetting('trackInfoFontSize', 20);
    f.deliver({ type: 'settings', revision: 2, settings: { volumeStep: 9, trackInfoFontSize: 14 } });
    f.deliver({ type: 'saveResult', requestId: command.requestId, revision: 2, ok: false, error: 'conflict', settings: { volumeStep: 9, trackInfoFontSize: 14 } });
    await saving;
    assert.equal(f.client.state.settings.volumeStep, 9);
    assert.equal(f.client.state.settings.trackInfoFontSize, 20);
    assert.equal(f.client.pending.size, 1);
    assert.equal(f.notices.length, 1);
});

test('obsolete save failures do not reset or notify for a newer local edit', async () => {
    const f = dashboard();
    f.hello();
    f.client.setSetting('volumeStep', 17);
    const saving = f.client.flushSettings();
    const first = f.sockets[0].sent.at(-1);
    f.client.setSetting('volumeStep', 22);
    f.deliver({ type: 'saveResult', requestId: first.requestId, revision: 2, ok: false, error: 'conflict', settings: { volumeStep: 9 } });
    await tick();
    const second = f.sockets[0].sent.at(-1);
    assert.deepEqual(second.settings, { volumeStep: 22 });
    assert.equal(second.revision, 2);
    assert.equal(f.notices.length, 0);
    f.deliver({ type: 'saveResult', requestId: second.requestId, revision: 3, ok: true, persisted: true, settings: { volumeStep: 22 } });
    await saving;
    assert.equal(f.client.state.settings.volumeStep, 22);
    assert.deepEqual(f.notices, [['success', 'Шаг громкости сохранён: 22%']]);
});

test('an old save reply cannot overwrite a newer external snapshot', async () => {
    const f = dashboard();
    f.hello();
    f.client.setSetting('volumeStep', 17);
    const saving = f.client.flushSettings();
    const command = f.sockets[0].sent.at(-1);
    f.deliver({ type: 'settings', revision: 3, settings: { volumeStep: 9 } });
    f.deliver({ type: 'saveResult', requestId: command.requestId, revision: 2, ok: true, persisted: true, settings: { volumeStep: 17 } });
    await saving;
    assert.equal(f.client.state.settings.volumeStep, 9);
    assert.equal(f.notices.length, 0);
});

test('slider edits wait for completion and notify only after confirmed persistence', async () => {
    const f = dashboard();
    f.hello();
    f.client.setSetting('volumeStep', 12, false);
    await f.client.flushSettings();
    assert.equal(f.sockets[0].sent.length, 0);
    assert.equal(f.timers.size, 0);
    assert.equal(f.notices.length, 0);
    f.client.setSetting('volumeStep', 12, true);
    const saving = f.client.flushSettings();
    const command = f.sockets[0].sent.at(-1);
    assert.equal(f.notices.length, 0);
    f.deliver({ type: 'saveResult', requestId: command.requestId, revision: 2, ok: true, persisted: true, settings: { volumeStep: 12 } });
    await saving;
    assert.deepEqual(f.notices, [['success', 'Шаг громкости сохранён: 12%']]);
});

test('a slider dragged during a save does not save or notify an intermediate value', async () => {
    const f = dashboard();
    f.hello();
    f.client.setSetting('volumeStep', 12);
    const saving = f.client.flushSettings();
    const command = f.sockets[0].sent.at(-1);
    f.client.setSetting('volumeStep', 18, false);
    f.deliver({ type: 'saveResult', requestId: command.requestId, revision: 2, ok: true, persisted: true, settings: { volumeStep: 12 } });
    await saving;
    assert.equal(f.sockets[0].sent.length, 1);
    assert.equal(f.client.state.settings.volumeStep, 18);
    assert.equal(f.client.state.saveStatus, 'dirty');
    assert.equal(f.notices.length, 0);
});

test('unconfirmed persistence never reports successful saving', async () => {
    const f = dashboard();
    f.hello();
    f.client.setSetting('debugMode', true);
    const saving = f.client.flushSettings();
    const command = f.sockets[0].sent.at(-1);
    f.deliver({ type: 'saveResult', requestId: command.requestId, revision: 2, ok: true, persisted: false, settings: { debugMode: true } });
    await saving;
    assert.deepEqual(f.notices, [['error', 'Применено, но сохранение не подтверждено']]);
});

test('config actions report their specific result after saving', async () => {
    const f = dashboard();
    f.hello();
    f.client.setSetting('nowPlayingPresets', [{ id: 'custom', name: 'Мой конфиг', config: f.client.state.settings.nowPlaying }], true, 'Конфиг «Мой конфиг» сохранён');
    const saving = f.client.flushSettings();
    const command = f.sockets[0].sent.at(-1);
    assert.equal(f.notices.length, 0);
    f.deliver({ type: 'saveResult', requestId: command.requestId, revision: 2, ok: true, persisted: true, settings: command.settings });
    await saving;
    assert.deepEqual(f.notices, [['success', 'Конфиг «Мой конфиг» сохранён']]);
});

test('enabling Discord reports the actual connection outcome after saving', async () => {
    for (const [discordStatus, notice] of [
        [{ status: 'error', message: 'Discord не запущен' }, ['error', 'Discord не запущен']],
        [{ status: 'connected' }, ['success', 'Discord подключён']],
        [{ status: 'waiting_music', message: 'Ожидание Яндекс Музыки' }, ['info', 'Ожидание Яндекс Музыки']],
        [{ status: 'connecting' }, ['info', 'Настройка сохранена. Ожидаем подключения к Discord']]
    ]) {
        const f = dashboard();
        f.hello();
        f.client.setSetting('discordRpcEnabled', true);
        const saving = f.client.flushSettings();
        const command = f.sockets[0].sent.at(-1);
        f.deliver({ type: 'saveResult', requestId: command.requestId, revision: 2, ok: true, persisted: true,
            settings: { discordRpcEnabled: true }, discordStatus });
        await saving;
        assert.equal(f.client.state.settings.discordRpcEnabled, true);
        assert.deepEqual(f.client.state.discord, discordStatus);
        assert.deepEqual(f.notices, [notice]);
    }
});

test('Discord connection errors cannot hide successful disabling', async () => {
    const f = dashboard();
    f.hello({ discordRpcEnabled: true });
    f.deliver({ type: 'discordStatus', status: 'error', message: 'Discord не запущен' });
    f.client.setSetting('discordRpcEnabled', false);
    const saving = f.client.flushSettings();
    const command = f.sockets[0].sent.at(-1);
    f.deliver({ type: 'saveResult', requestId: command.requestId, revision: 2, ok: true, persisted: true,
        settings: { discordRpcEnabled: false }, discordStatus: { status: 'disabled' } });
    await saving;
    assert.deepEqual(f.notices, [['success', 'Показ трека в Discord выключен']]);
});

test('commands notify once and automatic status updates stay silent', async () => {
    const f = dashboard();
    f.hello();
    f.deliver({ type: 'connectionStatus', connected: true });
    f.deliver({ type: 'updateInfo', hasUpdate: true, latestVersion: '3.0.0' });
    f.deliver({ type: 'discordStatus', status: 'connected' });
    assert.equal(f.notices.length, 0);
    for (const [type, reply, notice] of [
        ['launchApp', { type: 'launchResult', connected: true }, ['success', 'Яндекс Музыка запущена']],
        ['checkConnection', { type: 'connectionStatus', connected: true }, ['success', 'Соединение с Яндекс Музыкой установлено']],
        ['checkConnection', { type: 'connectionStatus', connected: false }, ['warning', 'Яндекс Музыка не подключена. Проверьте запуск с портом отладки']],
        ['clearDebugLog', { type: 'commandResult' }, ['success', 'Логи очищены']],
        ['getDiagnostics', { type: 'diagnostics', report: {} }, ['success', 'Диагностика подготовлена']],
        ['checkUpdates', { type: 'updateInfo', hasUpdate: false }, ['success', 'Установлена последняя версия']],
        ['checkUpdates', { type: 'updateInfo', hasUpdate: true, latestVersion: '3.0.0' }, ['info', 'Доступна версия 3.0.0']],
        ['checkUpdates', { type: 'updateInfo', status: 'error', error: 'Нет сети' }, ['error', 'Нет сети']]
    ]) {
        const before = f.notices.length;
        const waiting = f.client.command(type);
        const command = f.sockets[0].sent.at(-1);
        assert.equal(f.notices.length, before);
        f.deliver({ ...reply, ok: true, requestId: command.requestId });
        await waiting;
        assert.equal(f.notices.length, before + 1);
        assert.deepEqual(f.notices.at(-1), notice);
    }
});

test('panel ignores stale snapshots and keeps player loading status', () => {
    const f = dashboard();
    f.hello({ volumeStep: 17 }, 4);
    f.deliver({ type: 'connectionStatus', connected: true, stage: 'loading' });
    f.deliver({ type: 'settings', revision: 3, settings: { volumeStep: 5 } });
    assert.equal(f.client.state.settings.volumeStep, 17);
    assert.equal(f.client.state.connection.stage, 'loading');
});

test('temporary disconnection retains edits and resends after a fresh hello', async () => {
    const f = dashboard();
    f.hello({}, 4);
    f.client.setSetting('volumeStep', 18);
    const saving = f.client.flushSettings();
    f.sockets[0].close();
    await saving;
    assert.equal(f.client.state.phase, 'reconnecting');
    assert.equal(f.client.pending.size, 1);
    f.client.setSetting('volumeStep', 19);
    assert.equal(f.client.state.settings.volumeStep, 18);
    f.client.connect();
    f.hello({ volumeStep: 5 }, 0);
    assert.equal(f.client.revision, 0);
    const second = f.client.flushSettings();
    const command = f.sockets[1].sent.at(-1);
    f.deliver({ type: 'saveResult', requestId: command.requestId, revision: 1, ok: true, persisted: true, settings: { volumeStep: 18 } });
    await second;
    assert.equal(f.client.state.settings.volumeStep, 18);
});

test('commands cannot run twice while waiting and timeout releases the button', async () => {
    const f = dashboard();
    f.hello();
    const waiting = f.client.command('checkConnection');
    await f.client.command('checkConnection');
    assert.equal(f.sockets[0].sent.length, 1);
    [...f.timers.values()][0]();
    await waiting;
    assert.equal(f.client.state.busy.checkConnection, undefined);
    assert.equal(f.notices.length, 1);
});

test('shutdown clears timers and prevents reopening the connection', () => {
    const f = dashboard();
    f.hello();
    f.client.setSetting('volumeStep', 10);
    f.deliver({ type: 'shutdown' });
    assert.equal(f.client.state.phase, 'ended');
    assert.equal(f.timers.size, 0);
    f.client.connect();
    assert.equal(f.sockets.length, 1);
});
