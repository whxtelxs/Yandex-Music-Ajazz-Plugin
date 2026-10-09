'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');
const { renderMarkdown } = require('../../propertyInspector/dashboard/src/markdown');

async function render(source) {
    const { marked } = await import('marked');
    const dom = new JSDOM('');
    const document = dom.window.document;
    const purifier = createDOMPurify(dom.window);
    const html = renderMarkdown(source, { parse: marked.parse, sanitize: purifier.sanitize, document,
        baseUrl: 'https://github.com/whxtelxs/Yandex-Music-Ajazz-Plugin/releases/tag/v2.1.0' });
    document.body.innerHTML = html;
    return { document, close: () => dom.window.close() };
}

test('release notes render Markdown formatting, tables, task lists, code and disclosures', async t => {
    const f = await render('# Обновление\n\n**Жирный** и *курсив*, ~~старое~~, `npm run release`\n\n'
        + '- [x] Готово\n- [ ] Проверить\n\n> Цитата\n\n'
        + '| Версия | Статус |\n| --- | --- |\n| 2.1.0 | Готово |\n\n'
        + '```js\nconst value = 1;\n```\n\n<details><summary>Все изменения</summary><p>Описание</p></details>');
    t.after(f.close);
    const doc = f.document;
    for (const tag of ['h1', 'strong', 'em', 'del', 'blockquote', 'pre code', 'details summary']) assert.ok(doc.querySelector(tag), tag);
    assert.ok(doc.querySelector('.release-notes-table > table'));
    const checkboxes = [...doc.querySelectorAll('input')];
    assert.equal(checkboxes.length, 2);
    assert.ok(checkboxes.every(input => input.disabled));
    assert.equal(checkboxes[0].checked, true);
});

test('GitHub HTML attachments and Markdown images remain responsive image elements', async t => {
    const src = 'https://github.com/user-attachments/assets/5734928b-55c5-4e83-820f-e4454d32af4d';
    const f = await render('<img width="1614" height="941" alt="git update" src="' + src + '" />\n\n![Пример](' + src + ')');
    t.after(f.close);
    const images = [...f.document.querySelectorAll('img')];
    assert.equal(images.length, 2);
    assert.equal(images[0].width, 1614);
    assert.ok(images.every(image => image.src === src && image.getAttribute('loading') === 'lazy' && image.getAttribute('referrerpolicy') === 'no-referrer'));
});

test('release HTML cannot introduce scripts, event handlers, style overrides or active forms', async t => {
    const f = await render('<script>alert(1)</script><style>body { display:none }</style>'
        + '<img src="https://github.com/image" onerror="alert(1)" style="position:fixed" srcset="http://localhost/x 2x">'
        + '<a href="javascript:alert(1)" onclick="alert(1)">Опасная ссылка</a>'
        + '<iframe src="https://example.com"></iframe><form><input type="text" value="text"><button>Отправить</button></form>');
    t.after(f.close);
    assert.equal(f.document.querySelector('script, style, iframe, form, button, input'), null);
    assert.equal(f.document.querySelector('[onclick], [onerror], [style], [srcset]'), null);
    assert.equal(f.document.querySelector('a').hasAttribute('href'), false);
});

test('release links resolve against the release URL and reject local or executable image addresses', async t => {
    const f = await render('[Релиз](/whxtelxs/Yandex-Music-Ajazz-Plugin/releases)\n\n'
        + '<img src="http://127.0.0.1:17890/private" alt="Недоступное изображение">'
        + '<img src="javascript:alert(1)">');
    t.after(f.close);
    const link = f.document.querySelector('a');
    assert.equal(link.href, 'https://github.com/whxtelxs/Yandex-Music-Ajazz-Plugin/releases');
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
    assert.equal(f.document.querySelector('img'), null);
    assert.ok(f.document.body.textContent.includes('Недоступное изображение'));
});
