'use strict';

(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.NowPlayingConfig = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const schema = {
        width: [380, 160, 900], height: [120, 48, 600], coverSize: [88, 24, 400],
        padding: [16, 0, 48], gap: [16, 0, 48], radius: [24, 0, 64], coverRadius: [14, 0, 64],
        titleSize: [18, 10, 44], artistSize: [14, 9, 32], weight: ['600', ['400', '500', '600', '700', '800']],
        font: ['system', ['system', 'rounded', 'serif', 'mono', 'narrow']],
        layout: ['left', ['left', 'right', 'top']], align: ['left', ['left', 'center', 'right']],
        background: ['solid', ['solid', 'glass', 'artwork', 'transparent']], opacity: [90, 0, 100],
        backgroundColor: ['#151515', 'color'], textColor: ['#ffffff', 'color'], accentColor: ['#ffff00', 'color'],
        barHeight: [4, 2, 16], scrollSpeed: [32, 0, 80], transition: ['fade', ['none', 'fade', 'slide']],
        transitionMs: [450, 100, 1200], showCover: [true, 'boolean'], showTitle: [true, 'boolean'],
        showArtist: [true, 'boolean'], showProgress: [true, 'boolean'], showTime: [true, 'boolean'],
        shadow: [true, 'boolean'], coverShadow: [true, 'boolean'], textShadow: [false, 'boolean'],
        pauseShrink: [true, 'boolean'], hideOnPause: [false, 'boolean'], enabled: [true, 'boolean']
    };
    const defaults = Object.freeze(Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, value[0]])));
    const presets = Object.freeze({
        compact: { label: 'Компактный', config: { width: 340, height: 92, coverSize: 68, padding: 12, titleSize: 16, artistSize: 13, showProgress: false, showTime: false } },
        progress: { label: 'С прогрессом', config: {} },
        card: { label: 'Карточка', config: { width: 280, height: 390, coverSize: 248, layout: 'top', gap: 18, titleSize: 20, artistSize: 15 } },
        artwork: { label: 'Размытая обложка', config: { width: 420, height: 148, coverSize: 112, padding: 18, background: 'artwork', titleSize: 21, artistSize: 16 } },
        wide: { label: 'Широкий', config: { width: 560, height: 136, coverSize: 104, background: 'artwork', titleSize: 22, artistSize: 16 } },
        mini: { label: 'Мини', config: { width: 260, height: 64, coverSize: 44, padding: 10, gap: 10, radius: 18, coverRadius: 10, titleSize: 13, artistSize: 11, showProgress: false, showTime: false } },
        text: { label: 'Только текст', config: { width: 440, height: 92, showCover: false, background: 'transparent', titleSize: 24, artistSize: 17, showProgress: false, showTime: false, shadow: false, textShadow: true } },
        cover: { label: 'Только обложка', config: { width: 220, height: 220, coverSize: 220, padding: 0, gap: 0, radius: 26, coverRadius: 26, showTitle: false, showArtist: false, showProgress: false, showTime: false, background: 'transparent', shadow: false } }
    });

    function sanitize(input) {
        const result = {};
        for (const [key, rule] of Object.entries(schema)) {
            const value = input?.[key];
            if (typeof rule[0] === 'number') {
                const number = Number(value);
                result[key] = value !== null && value !== '' && Number.isFinite(number)
                    ? Math.max(rule[1], Math.min(rule[2], Math.round(number))) : rule[0];
            } else if (rule[1] === 'boolean') {
                result[key] = value === undefined ? rule[0] : value === true || value === 1 || value === 'true';
            } else if (rule[1] === 'color') {
                result[key] = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : rule[0];
            } else result[key] = rule[1].includes(String(value)) ? String(value) : rule[0];
        }
        return result;
    }

    function preset(name) { return sanitize({ ...defaults, ...presets[name]?.config }); }

    function sanitizePresets(input) {
        if (!Array.isArray(input)) return [];
        const result = [];
        const ids = new Set();
        for (const item of input) {
            if (!item || typeof item.id !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(item.id) || ids.has(item.id)) continue;
            const name = typeof item.name === 'string' ? item.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) : '';
            if (!name || !item.config || typeof item.config !== 'object' || Array.isArray(item.config)) continue;
            ids.add(item.id);
            result.push({ id: item.id, name, config: sanitize(item.config) });
            if (result.length === 50) break;
        }
        return result;
    }

    return { schema, defaults, presets, sanitize, preset, sanitizePresets };
});
