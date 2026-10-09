import React from 'react';
import { createRoot } from 'react-dom/client';
import { toast } from '@heroui/react';
import { App } from './app';
import { PanelClient } from './client';
import { createNotifier } from './notifications';

const notify = createNotifier({ toast });

function openExternal(url) {
    try { if (new URL(url).protocol !== 'https:') return; } catch { return; }
    window.open(url, '_blank', 'noopener,noreferrer');
}

function download(report) {
    if (!report) return;
    const text = JSON.stringify(report, null, 2);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'yandex-music-ajazz-diagnostics.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const client = new PanelClient({ WebSocket, location: window.location, notify, download });
window.addEventListener('pagehide', () => client.stop());
createRoot(document.getElementById('root')).render(<App client={client} notify={notify} openExternal={openExternal} />);
