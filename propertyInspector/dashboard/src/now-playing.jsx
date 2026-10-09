import React, { useEffect, useRef, useState } from 'react';
import { Description } from '@heroui/react';
import overlay from '../../now-playing/config';
import { Action, ColorSetting, LinkField, PanelCard, RangeSetting, SelectSetting, ToggleSetting } from './controls';
import { NowPlayingPresets } from './now-playing-presets';

const groups = [
    ['size', 'Размер и расположение', [
        ['width', 'Ширина'], ['height', 'Высота'], ['coverSize', 'Размер обложки'], ['padding', 'Внутренний отступ'], ['gap', 'Зазор'],
        ['layout', 'Обложка', { left: 'Слева', right: 'Справа', top: 'Сверху' }], ['align', 'Выравнивание', { left: 'Слева', center: 'По центру', right: 'Справа' }]
    ]],
    ['elements', 'Элементы и поведение', [
        ['enabled', 'Показывать виджет в OBS'], ['showCover', 'Обложка'], ['showTitle', 'Название трека'], ['showArtist', 'Исполнитель'],
        ['showProgress', 'Полоса прогресса'], ['showTime', 'Время трека'], ['hideOnPause', 'Скрывать на паузе'], ['pauseShrink', 'Уменьшать обложку на паузе']
    ]],
    ['background', 'Фон и форма', [
        ['background', 'Фон', { solid: 'Сплошной', glass: 'Полупрозрачный', artwork: 'Размытая обложка', transparent: 'Прозрачный' }],
        ['backgroundColor', 'Цвет фона'], ['opacity', 'Плотность фона'], ['radius', 'Скругление виджета'], ['coverRadius', 'Скругление обложки'],
        ['barHeight', 'Толщина полосы'], ['shadow', 'Тень виджета'], ['coverShadow', 'Тень обложки']
    ]],
    ['text', 'Текст и движение', [
        ['titleSize', 'Размер названия'], ['artistSize', 'Размер исполнителя'],
        ['weight', 'Начертание', { 400: 'Обычный', 500: 'Средний', 600: 'Полужирный', 700: 'Жирный', 800: 'Очень жирный' }],
        ['font', 'Шрифт', { system: 'Системный', rounded: 'Округлый', serif: 'С засечками', mono: 'Моноширинный', narrow: 'Узкий' }],
        ['textColor', 'Цвет текста'], ['accentColor', 'Цвет прогресса'], ['textShadow', 'Тень текста'], ['scrollSpeed', 'Бегущая строка, px/с'],
        ['transition', 'Смена трека', { none: 'Без анимации', fade: 'Плавное появление', slide: 'Сдвиг' }], ['transitionMs', 'Длительность анимации, мс']
    ]]
];

function Preview({ config, transition }) {
    const frame = useRef(null);
    const [playing, setPlaying] = useState(false);
    const latest = useRef(config);
    const transitionRef = useRef(transition);
    const sentTransition = useRef(transition);
    latest.current = config;
    transitionRef.current = transition;
    function sync() {
        const element = frame.current;
        if (!element) return;
        element.contentWindow?.postMessage({ type: 'now-playing-preview', config: latest.current, transition: sentTransition.current !== transitionRef.current }, window.location.origin);
        sentTransition.current = transitionRef.current;
    }
    useEffect(sync, [config, transition]);
    useEffect(() => {
        const receive = event => {
            if (event.origin === window.location.origin && event.source === frame.current?.contentWindow && event.data?.type === 'now-playing-preview-status') setPlaying(!!event.data.playing);
        };
        window.addEventListener('message', receive);
        return () => window.removeEventListener('message', receive);
    }, []);
    return <PanelCard title="Предпросмотр" description={playing ? 'Текущий трек' : 'Пример, нет данных трека'} contentClassName="gap-4">
        <div className="relative aspect-[4/3] max-h-[420px] min-h-[240px] w-full">
            <iframe ref={frame} id="nowPlayingPreview" src="/now-playing?preview=1" title="Предпросмотр виджета «Играет сейчас»" onLoad={sync} className="absolute inset-0 block h-full w-full border-0" />
        </div>
        <Description>В OBS виджет скрывается, если нет связи с Музыкой или данных трека.</Description>
    </PanelCard>;
}

export function NowPlayingPanel({ config, presets, client, disabled, notify }) {
    const link = window.location.origin + '/now-playing';
    const input = useRef(null);
    const [transition, setTransition] = useState(0);
    const applyConfig = value => {
        setTransition(current => current + 1);
        client.setSetting('nowPlaying', value);
    };
    const change = (key, value, commit = true) => client.setSetting('nowPlaying', { ...client.getSnapshot().settings.nowPlaying, [key]: value }, commit);
    async function copy() {
        try { await navigator.clipboard.writeText(link); notify('success', 'Ссылка скопирована'); }
        catch {
            input.current?.focus(); input.current?.select();
            if (document.execCommand('copy')) notify('success', 'Ссылка скопирована');
            else notify('error', 'Ссылка выделена. Нажмите Ctrl+C или Cmd+C');
        }
    }
    return <div className="flex min-w-0 flex-col gap-3">
        <PanelCard title="Ссылка для OBS" description="Добавьте источник «Браузер», настройки применяются к той же ссылке." contentClassName="gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-3"><div className="min-w-0 flex-1 basis-48"><LinkField value={link} inputRef={input} /></div><Action onPress={copy} id="copyNowPlayingLink">Скопировать</Action></div>
        </PanelCard>
        <div className="grid min-w-0 items-start gap-3 @3xl:grid-cols-2">
            <div className="min-w-0 @3xl:sticky @3xl:top-4"><Preview config={config} transition={transition} /></div>
            <div className="flex min-w-0 flex-col gap-3">
                <NowPlayingPresets config={config} presets={presets} client={client} disabled={disabled} notify={notify} onApply={applyConfig} />
                {groups.map(([id, title, fields]) => <PanelCard key={id} title={title} contentClassName="gap-4">
                    {fields.map(([key, label, options]) => {
                            const rule = overlay.schema[key];
                            const props = { name: 'np-' + key, label, value: config[key], disabled, onChange: (value, commit) => change(key, value, commit) };
                            if (options) return <SelectSetting key={key} {...props} options={options} />;
                            if (typeof rule[0] === 'number') return <RangeSetting key={key} {...props} min={rule[1]} max={rule[2]} />;
                            if (rule[1] === 'boolean') return <ToggleSetting key={key} {...props} controlPosition="end" />;
                            return <ColorSetting key={key} {...props} />;
                    })}
                </PanelCard>)}
            </div>
        </div>
    </div>;
}
