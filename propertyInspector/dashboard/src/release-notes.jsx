import React, { useMemo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { renderMarkdown } from './markdown';

export function ReleaseNotes({ source, pageUrl, openExternal }) {
    const html = useMemo(() => renderMarkdown(source, {
        parse: marked.parse,
        sanitize: DOMPurify.sanitize,
        document,
        baseUrl: pageUrl || 'https://github.com/whxtelxs/Yandex-Music-Ajazz-Plugin/'
    }), [source, pageUrl]);
    function openLink(event) {
        const link = event.target.closest('a[href]');
        if (!link || !event.currentTarget.contains(link)) return;
        event.preventDefault();
        openExternal(link.href);
    }
    return <div className="release-notes min-w-0" onClick={openLink} dangerouslySetInnerHTML={{ __html: html }} />;
}
