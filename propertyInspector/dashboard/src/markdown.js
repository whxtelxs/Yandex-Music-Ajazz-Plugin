'use strict';

function renderMarkdown(source, { parse, sanitize, document, baseUrl }) {
    const fragment = sanitize(parse(String(source || ''), { gfm: true, async: false }), {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['style', 'form', 'button', 'textarea', 'select'],
        FORBID_ATTR: ['style', 'class', 'id', 'name', 'srcset'],
        RETURN_DOM_FRAGMENT: true
    });
    const address = value => {
        try {
            const url = new URL(value, baseUrl);
            return url.protocol === 'https:' ? url.href : null;
        } catch { return null; }
    };
    for (const link of fragment.querySelectorAll('a')) {
        const href = link.getAttribute('href');
        const url = href ? address(href) : null;
        if (!url) { link.removeAttribute('href'); continue; }
        link.setAttribute('href', url);
        link.setAttribute('target', '_blank');
        link.setAttribute('rel', 'noopener noreferrer');
    }
    for (const image of fragment.querySelectorAll('img')) {
        const src = image.getAttribute('src');
        const url = src ? address(src) : null;
        if (!url) { image.replaceWith(document.createTextNode(image.alt || '')); continue; }
        image.setAttribute('src', url);
        image.setAttribute('loading', 'lazy');
        image.setAttribute('decoding', 'async');
        image.setAttribute('referrerpolicy', 'no-referrer');
    }
    for (const input of fragment.querySelectorAll('input')) {
        if (input.type === 'checkbox') input.disabled = true;
        else input.remove();
    }
    for (const table of fragment.querySelectorAll('table')) {
        const wrapper = document.createElement('div');
        wrapper.className = 'release-notes-table';
        table.replaceWith(wrapper);
        wrapper.append(table);
    }
    const container = document.createElement('div');
    container.append(fragment);
    return container.innerHTML;
}

module.exports = { renderMarkdown };
