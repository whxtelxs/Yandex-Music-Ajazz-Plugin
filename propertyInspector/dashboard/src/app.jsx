import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Button, Chip, Description, ScrollShadow, Separator, Spinner, Toast } from '@heroui/react';
import overlay from '../../now-playing/config';
import { Action, PanelCard, PortSetting, RangeSetting, SelectSetting, ToggleSetting } from './controls';
import { NowPlayingPanel } from './now-playing';
import { NavigationIcon } from './navigation-icons';
import { Scrollbars } from './scrollbars';
import { ReleaseNotes } from './release-notes';

const sections = [['connection', 'Соединение'], ['volume', 'Громкость'], ['text', 'Текст'], ['discord', 'Discord'], ['nowplaying', 'Играет сейчас'], ['debug', 'Дебаг'], ['updates', 'Обновления'], ['github', 'GitHub']];
const headings = { text: 'Текст на дисплее' };
const repo = 'https://github.com/whxtelxs/Yandex-Music-Ajazz-Plugin';
const discordLabels = { disabled: 'Выключено', waiting_music: 'Ожидание Музыки', connected: 'Активно', connecting: 'Подключение', waiting_track: 'Ожидание трека', paused: 'Пауза', error: 'Ошибка' };
const saveLabels = { dirty: 'Есть изменения', saving: 'Сохранение', saved: 'Сохранено', error: 'Не сохранено' };
const navigation = {
    connection: 'Запуск и порт отладки',
    volume: 'Кнопки и энкодер',
    text: 'Название и время трека',
    discord: 'Текущий трек в профиле',
    nowplaying: 'Виджет для OBS',
    debug: 'Логи и диагностика',
    updates: 'Версия и новые релизы',
    github: 'Баги и предложения'
};


function Status({ label, color = 'default' }) { return <Chip size="sm" color={color} >{label}</Chip>; }

function Connection({ state, client, disabled }) {
    const { connection, settings, busy } = state;
    const pending = !!busy.launchApp || !!busy.checkConnection;
    const mismatch = connection.activePort && connection.activePort !== settings.debugPort;
    return <PanelCard contentClassName="gap-4">
        <PortSetting value={settings.debugPort} disabled={disabled} onChange={value => client.setSetting('debugPort', value)} />
        {mismatch && <p className="settings-description">Яндекс Музыка запущена на порту {connection.activePort}. В настройках: {settings.debugPort}.</p>}
        <div className="flex flex-wrap items-center gap-3">
            <Action id="launchAppBtn" isDisabled={disabled || pending} pending={busy.launchApp} variant="secondary" onPress={() => client.command('launchApp')}>Запустить Yandex Music</Action>
            <Action id="checkConnectionBtn" isDisabled={disabled || pending} pending={busy.checkConnection} variant="tertiary" onPress={() => client.command('checkConnection')}>Проверить соединение</Action>
        </div>
        {(state.restartRequired || !connection.connected) && <Action id="restartAppBtn" variant="ghost" isDisabled={disabled || pending} onPress={() => client.command('launchApp', { restart: true })}>Перезапустить Музыку</Action>}
    </PanelCard>;
}

function DebugPanel({ state, client, disabled }) {
    const consoleRef = useRef(null);
    const follow = useRef(true);
    useEffect(() => { if (follow.current && consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight; }, [state.logs]);
    return <PanelCard className="settings-fill-card min-h-0 flex-1" contentClassName="gap-4">
        <div className="shrink-0"><ToggleSetting name="debugMode" label="Режим отладки" description="Логи плагина в реальном времени, без записи в файл" value={state.settings.debugMode} onChange={value => client.setSetting('debugMode', value)} disabled={disabled} /></div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
            <Action id="exportDiagnosticsBtn" variant="secondary" isDisabled={disabled} pending={state.busy.getDiagnostics} onPress={() => client.command('getDiagnostics')}>Скачать диагностику</Action>
            <Action id="clearDebugBtn" variant="tertiary" isDisabled={disabled} pending={state.busy.clearDebugLog} onPress={() => client.command('clearDebugLog')}>Очистить</Action>
        </div>
        <ScrollShadow size={24} className="debug-console flex min-h-0 min-w-0 flex-1 flex-col gap-2 overflow-auto overscroll-contain rounded-field bg-background p-3 font-mono text-xs leading-5" ref={consoleRef} role="log" aria-label="Логи плагина" aria-live="polite" onScroll={event => { const e = event.currentTarget; follow.current = e.scrollHeight - e.scrollTop - e.clientHeight < 40; }}>
            {!state.logs.length && <p className="flex flex-1 items-center justify-center text-center font-sans settings-description">{state.settings.debugMode ? 'Ожидание логов от плагина' : 'Включите режим отладки, чтобы видеть логи'}</p>}
            {state.logs.map((entry, i) => <div className="debug-console-entry grid shrink-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 @lg:grid-cols-[auto_52px_minmax(0,1fr)]" data-level={entry.level} key={i}>
                <time className="text-muted tabular-nums">{new Date(entry.at).toLocaleTimeString('ru-RU', { hour12: false })}</time>
                <span className="debug-console-level" data-level={entry.level}>{entry.level}</span>
                <span className="col-span-2 whitespace-pre-wrap [overflow-wrap:anywhere] @lg:col-span-1">{entry.text}</span>
            </div>)}
        </ScrollShadow>
    </PanelCard>;
}

function Updates({ state, client, disabled, openExternal }) {
    const info = state.updates || {};
    const checking = info.status === 'checking' || state.busy.checkUpdates;
    const summary = checking ? 'Проверяем обновления' : info.status === 'error' ? 'Не удалось проверить обновления' : info.hasUpdate ? info.releaseName || 'Доступна версия ' + info.latestVersion : info.checkedAt ? 'У вас установлена последняя версия' : 'Проверьте наличие новой версии';
    return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
        <PanelCard className="shrink-0" contentClassName="gap-4">
            <div className="flex min-w-0 items-center justify-between gap-4">
                <div className="flex min-w-0 flex-col"><span className="label">Текущая версия</span><Description>{summary}</Description></div>
                <Chip size="sm" className="shrink-0 tabular-nums">{info.currentVersion || '?'}</Chip>
            </div>
            {info.hasUpdate && <div className="flex min-w-0 items-center justify-between gap-4"><span className="label">Доступная версия</span><Chip size="sm" className="shrink-0 tabular-nums text-accent">{info.latestVersion}</Chip></div>}
            <div className="flex flex-wrap items-center gap-3">
                <Action id="checkUpdatesBtn" variant="secondary" isDisabled={disabled || checking} pending={checking} onPress={() => client.command('checkUpdates')}>Проверить обновления</Action>
                {info.hasUpdate && info.pageUrl && <Action id="openReleaseBtn" variant="tertiary" isDisabled={checking} onPress={() => openExternal(info.pageUrl)}>Открыть релиз</Action>}
            </div>
            {info.error && <p className="text-[13px] leading-5 text-danger [overflow-wrap:anywhere]">{info.error}</p>}
        </PanelCard>
        {info.releaseNotes?.trim() && <PanelCard title="Что нового" className="settings-fill-card min-h-0 flex-1" contentClassName="gap-4">
            <ScrollShadow size={24} className="min-h-0 min-w-0 flex-1 overscroll-contain">
                <ReleaseNotes source={info.releaseNotes.trim()} pageUrl={info.pageUrl} openExternal={openExternal} />
            </ScrollShadow>
        </PanelCard>}
    </div>;
}

function CurrentPanel({ state, client, notify, openExternal }) {
    const disabled = state.phase !== 'connected';
    const set = (key, value, commit) => client.setSetting(key, value, commit);
    switch (state.panel) {
        case 'connection': return <Connection state={state} client={client} disabled={disabled} />;
        case 'volume': return <PanelCard><RangeSetting name="volumeStep" label="Шаг изменения" description="Для кнопок и энкодера громкости" value={state.settings.volumeStep} min={1} max={99} unit="%" disabled={disabled} onChange={(v, commit) => set('volumeStep', v, commit)} /></PanelCard>;
        case 'text': return <PanelCard >
            <RangeSetting name="trackInfoTextSize" label="Длина строки" description="Сколько символов видно в бегущей строке названия трека" value={state.settings.trackInfoTextSize} min={4} max={24} disabled={disabled} onChange={(v, commit) => set('trackInfoTextSize', v, commit)} />
            <Separator />
            <RangeSetting name="trackInfoFontSize" label="Название трека" description="Размер шрифта в пикселях" value={state.settings.trackInfoFontSize} min={8} max={28} unit=" px" disabled={disabled} onChange={(v, commit) => set('trackInfoFontSize', v, commit)} />
            <Separator />
            <RangeSetting name="timeTotalFontSize" label="Время трека" description="Размер шрифта в пикселях" value={state.settings.timeTotalFontSize} min={8} max={28} unit=" px" disabled={disabled} onChange={(v, commit) => set('timeTotalFontSize', v, commit)} />
        </PanelCard>;
        case 'discord': return <PanelCard contentClassName="gap-4">
            <ToggleSetting name="discordRpcEnabled" label="Показывать текущий трек в Дискорд" description="Если статус не появляется, перезапустите Дискорд через Ctrl+R и включите «Показывать текущую активность» в настройках конфиденциальности." value={state.settings.discordRpcEnabled} onChange={v => set('discordRpcEnabled', v)} disabled={disabled} />
        </PanelCard>;
        case 'nowplaying': return <NowPlayingPanel presets={state.settings.nowPlayingPresets} config={state.settings.nowPlaying} client={client} disabled={disabled} notify={notify} />;
        case 'debug': return <DebugPanel state={state} client={client} disabled={disabled} />;
        case 'updates': return <Updates state={state} client={client} disabled={disabled} openExternal={openExternal} />;
        case 'github': return <PanelCard title="Обратная связь" description="Сообщите о баге, предложите улучшение или поддержите проект звездой." className="gap-4" contentClassName="gap-4">
            <div className="flex flex-wrap items-center gap-3">
                <Action className="donation-button" onPress={() => openExternal('https://pay.cloudtips.ru/p/9b18bf34')}>
                    <svg className="donation-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path className="donation-heart" d="M12 20s-8-4.8-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.2-8 10-8 10Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                    </svg>
                    Донат
                </Action>
                <Action onPress={() => openExternal(repo + '/issues/new?template=bug_report.yml')}>Сообщить о баге</Action>
                <Action variant="tertiary" onPress={() => openExternal(repo + '/issues/new?template=feature_request.yml')}>Предложить улучшение</Action>
                <Action variant="tertiary" onPress={() => openExternal(repo)}>Открыть репозиторий</Action>

            </div>
        </PanelCard>;
        default: return null;
    }
}

function PanelStatus({ state }) {
    if (state.panel === 'connection') return <Status label={state.busy.launchApp ? 'Запуск' : state.busy.checkConnection ? 'Проверка' : state.connection.connected ? state.connection.stage === 'loading' ? 'Плеер загружается' : 'Подключено' : 'Не подключено'} color={state.connection.connected ? 'success' : 'default'} />;
    if (state.panel === 'discord') return <Status label={discordLabels[state.discord.status] || 'Ожидание'} color={state.discord.status === 'connected' ? 'success' : state.discord.status === 'error' ? 'danger' : 'default'} />;
    if (state.panel === 'updates') return <Status label={state.updates?.status === 'checking' || state.busy.checkUpdates ? 'Проверка' : state.updates?.status === 'error' ? 'Ошибка' : state.updates?.hasUpdate ? 'Доступно обновление' : 'Актуально'} color={state.updates?.status === 'error' ? 'danger' : 'default'} />;
    return null;
}

function LoadingPanel({ reconnecting }) {
    return <main className="panel-loading" role="status" aria-live="polite" aria-busy="true">
        <img className="panel-loading-logo" src="/assets/logo.svg" alt="" width="56" height="56" />
        <h1 className="panel-loading-title">Yandex Music</h1>
        <div className="panel-loading-status">
            <svg className="panel-loading-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.15" />
                <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <p className="settings-description">{reconnecting ? 'Восстанавливаем связь с плагином' : 'Загрузка настроек'}</p>
        </div>
    </main>;
}

export function App({ client, notify, openExternal }) {
    const state = useSyncExternalStore(client.subscribe, client.getSnapshot);
    const navigationRef = useRef(null);
    const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 767px)').matches);
    function centerNavigation(panel) {
        const container = navigationRef.current;
        const button = container?.querySelector('[data-panel="' + panel + '"]');
        if (!button || container.scrollHeight <= container.clientHeight) return;
        const bounds = container.getBoundingClientRect();
        const item = button.getBoundingClientRect();
        const top = container.scrollTop + item.top - bounds.top - container.clientTop
            - (container.clientHeight - item.height) / 2;
        container.scrollTo({
            top: Math.max(0, Math.min(top, container.scrollHeight - container.clientHeight)),
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
        });
    }
    useEffect(() => { centerNavigation(state.panel); }, [state.panel, narrow, state.settingsLoaded]);
    useEffect(() => { client.connect(); return () => client.stop(); }, []);
    useEffect(() => {
        const media = window.matchMedia('(max-width: 767px)');
        const resize = () => setNarrow(media.matches);
        resize();
        media.addEventListener('change', resize);
        return () => media.removeEventListener('change', resize);
    }, []);
    if (state.phase === 'ended') return <main className="flex min-h-dvh items-center justify-center p-6">
        <PanelCard title="Соединение прервано" description="Нет связи с плагином. Проверьте, что он запущен, и обновите страницу." className="w-full max-w-sm gap-4" contentClassName="gap-4">
            <Action onPress={() => window.location.reload()}>Обновить</Action>
        </PanelCard>
    </main>;
    if (!state.settingsLoaded) return <LoadingPanel reconnecting={state.phase !== 'connecting'} />;
    const status = state.phase !== 'connected' ? state.phase === 'connecting' ? 'Подключение' : 'Восстановление связи' : saveLabels[state.saveStatus] || 'Автосохранение';
    return <>
        <div data-fill={state.panel === 'updates' || state.panel === 'debug'} className="settings-shell mx-auto grid h-full max-w-7xl grid-rows-[auto_minmax(0,1fr)] gap-5 px-3 py-4 sm:px-6 sm:py-6 md:grid-cols-[260px_minmax(0,1fr)] md:grid-rows-1 xl:grid-cols-[300px_minmax(0,1fr)]">
            {narrow ? <div className="flex flex-col gap-5">
                <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3"><img src="/assets/logo.svg" alt="" width="36" height="36" /><div><h1 className="text-base font-semibold">Yandex Music</h1><Description>Настройки плагина Ajazz</Description></div></div>
                <div aria-live="polite"><Chip size="sm" color={state.saveStatus === 'error' ? 'danger' : 'default'}>{(state.saveStatus === 'saving' || state.phase !== 'connected') && <Spinner size="sm" color="current" />}{status}</Chip></div>
                </header>
                <SelectSetting name="panel-navigation" label="Раздел" value={state.panel} options={Object.fromEntries(sections)} onChange={key => client.showPanel(key)} />
            </div> : <aside className="settings-sidebar flex min-h-0 flex-col gap-3" aria-label="Боковая панель">
                <div className="settings-brand flex min-h-9 shrink-0 items-center gap-3 px-1"><img src="/assets/logo.svg" alt="" width="28" height="28" /><h1 className="text-lg font-semibold">Yandex Music</h1>{state.updates?.currentVersion && <Chip size="sm">{state.updates.currentVersion}</Chip>}</div>
                <div className="settings-navigation flex min-h-0 flex-col overflow-hidden bg-surface px-2.5">
                    <ScrollShadow ref={navigationRef} hideScrollBar size={24} data-scrollbar-hidden className="min-h-0 overscroll-contain">
                        <nav className="my-2.5 flex flex-col gap-[5px]" aria-label="Разделы настроек">{sections.map(([id, label]) => <Button key={id} data-panel={id} variant={state.panel === id ? 'tertiary' : 'ghost'} aria-current={state.panel === id ? 'page' : undefined} onPress={() => { if (state.panel === id) centerNavigation(id); client.showPanel(id); }} className="h-auto min-h-14 w-full shrink-0 justify-start gap-3 px-3 py-2.5 text-left whitespace-normal"><NavigationIcon panel={id} /><span className="flex min-w-0 flex-col gap-0.5"><span className="text-[13px] font-medium">{label}</span><span className="text-[11px] font-normal text-muted">{navigation[id]}</span></span></Button>)}</nav>
                    </ScrollShadow>
                </div>
            </aside>}
            <div className="settings-content min-h-0 min-w-0 overflow-y-auto overscroll-contain">
                <main id={'panel-' + state.panel} aria-labelledby="panel-heading" className="settings-page @container flex w-full min-w-0 flex-col gap-6 pb-6">
                        <div className="settings-page-header flex min-h-9 flex-wrap items-center justify-between gap-3"><h2 id="panel-heading" className="text-xl font-semibold">{headings[state.panel] || sections.find(([id]) => id === state.panel)?.[1]}</h2><div className="flex items-center gap-2"><PanelStatus state={state} />{state.panel === 'nowplaying' && <Action id="resetNowPlaying" size="sm" variant="ghost" isDisabled={state.phase !== 'connected'} onPress={() => client.setSetting('nowPlaying', overlay.defaults, true, 'Настройки виджета сброшены')}>Сбросить</Action>}</div></div>
                        <CurrentPanel state={state} client={client} notify={notify} openExternal={openExternal} />
                </main>
            </div>
        </div>
        <Toast.Provider placement="bottom end" maxVisibleToasts={2} />
        <Scrollbars />
    </>;
}
