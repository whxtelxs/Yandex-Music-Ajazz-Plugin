'use strict';

let stopped = false;
let retry;
let socket;

function connectDevelopment() {
    if (stopped) return;
    socket = new WebSocket('ws://' + window.location.host + '/dev-events');
    socket.addEventListener('message', event => {
        let message;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message?.type !== 'reload') return;
        try {
            const panel = document.querySelector('main[id^="panel-"]');
            if (panel) {
                const url = new URL(window.location.href);
                url.searchParams.set('panel', panel.id.slice(6));
                window.history.replaceState(null, '', url);
            }
        } catch {}
        window.location.reload();
    });
    socket.addEventListener('error', () => socket.close());
    socket.addEventListener('close', () => { if (!stopped) retry = setTimeout(connectDevelopment, 1000); });
}

window.addEventListener('pagehide', () => { stopped = true; clearTimeout(retry); socket?.close(); });
connectDevelopment();
