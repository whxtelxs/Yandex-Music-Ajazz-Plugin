'use strict';

const rendererVersion = document.querySelector('meta[name="overlay-version"]')?.content;
const preview = new URLSearchParams(window.location.search).has('preview');
const widget = new NowPlayingWidget(document.getElementById('widgetStage'));
const example = { title: 'Название трека', artist: 'Исполнитель', cover: '/assets/logo.png', playing: true, position: 45, duration: 210 };
let connection = null;
let retryTimer = null;
let retryCount = 0;
let lastFrame = null;
let draft = null;
let stopped = false;
let renderFrame = null;
let transitionPending = false;
let previewOutgoing = null;
let previewAnimation = null;

function capturePreview() {
    if (widget.host.dataset.visible !== 'true') return null;
    const snapshot = document.createElement('div');
    snapshot.className = 'np-preview-transition';
    const stage = widget.host.cloneNode(true);
    stage.removeAttribute('id');
    const originals = [widget.host, ...widget.host.querySelectorAll('*')];
    const copies = [stage, ...stage.querySelectorAll('*')];
    originals.forEach((element, index) => {
        const style = getComputedStyle(element);
        copies[index].style.opacity = style.opacity;
        copies[index].style.transform = style.transform;
        copies[index].style.transition = 'none';
    });
    snapshot.appendChild(stage);
    if (previewOutgoing) {
        previewOutgoing.style.opacity = getComputedStyle(previewOutgoing).opacity;
        previewAnimation?.cancel();
        snapshot.appendChild(previewOutgoing);
    }
    previewOutgoing = snapshot;
    document.body.appendChild(snapshot);
    return snapshot;
}

function fadePreview(snapshot) {
    const duration = widget.reducedMotion ? 120 : 220;
    previewAnimation = snapshot.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards'
    });
    previewAnimation.finished.then(() => {
        snapshot.remove();
        if (previewOutgoing === snapshot) { previewOutgoing = null; previewAnimation = null; }
    }).catch(() => {});
}

function resize() {
    const scale = Math.min(1, Math.max(1, window.innerWidth - 64) / widget.config.width,
        Math.max(1, window.innerHeight - 64) / widget.config.height);
    widget.host.style.transform = 'scale(' + scale + ')';
    if (preview) {
        widget.host.style.left = Math.max(0, (window.innerWidth - widget.config.width * scale) / 2) + 'px';
        widget.host.style.top = Math.max(0, (window.innerHeight - widget.config.height * scale) / 2) + 'px';
    }
}

function render() {
    if (renderFrame !== null) return;
    renderFrame = requestAnimationFrame(renderNow);
}

function renderNow() {
    renderFrame = null;
    if (!lastFrame) return;
    const config = draft || lastFrame.config;
    const settings = preview ? { ...config, enabled: true, hideOnPause: false } : config;
    const changed = JSON.stringify(NowPlayingConfig.sanitize(settings)) !== widget.configKey;
    const snapshot = preview && changed && transitionPending ? capturePreview() : null;
    transitionPending = false;
    widget.configure(settings, { animate: !preview });
    widget.update(lastFrame.track || (preview ? example : null));
    resize();
    if (snapshot) fadePreview(snapshot);
}

function connect() {
    if (stopped) return;
    const ws = new WebSocket('ws://' + window.location.host + '/now-playing/ws');
    connection = ws;
    ws.addEventListener('message', event => {
        if (connection !== ws) return;
        let frame;
        try { frame = JSON.parse(event.data); } catch { return; }
        if (frame.type !== 'nowPlaying') return;
        if (frame.rendererVersion && frame.rendererVersion !== rendererVersion) {
            const url = new URL(window.location.href);
            if (url.searchParams.get('v') !== frame.rendererVersion) {
                url.searchParams.set('v', frame.rendererVersion);
                window.location.replace(url.href);
                return;
            }
        }
        retryCount = 0;
        lastFrame = frame;
        render();
        if (preview) window.parent.postMessage({ type: 'now-playing-preview-status', playing: !!frame.track }, window.location.origin);
    });
    ws.addEventListener('close', () => {
        if (connection !== ws || stopped) return;
        widget.update(preview ? example : null);
        if (preview) window.parent.postMessage({ type: 'now-playing-preview-status', playing: false }, window.location.origin);
        retryTimer = setTimeout(connect, Math.min(5000, 500 * 2 ** Math.min(retryCount++, 4)));
    });
    ws.addEventListener('error', () => ws.close());
}

window.addEventListener('message', event => {
    if (!preview || event.source !== window.parent || event.origin !== window.location.origin) return;
    if (event.data?.type !== 'now-playing-preview') return;
    draft = NowPlayingConfig.sanitize(event.data.config);
    transitionPending ||= event.data.transition === true;
    render();
});
window.addEventListener('resize', resize);
window.addEventListener('pagehide', () => {
    stopped = true;
    clearTimeout(retryTimer);
    cancelAnimationFrame(renderFrame);
    previewAnimation?.cancel();
    previewOutgoing?.remove();
    connection?.close();
    widget.destroy();
});
widget.configure(NowPlayingConfig.defaults);
widget.update(preview ? example : null);
resize();
connect();
