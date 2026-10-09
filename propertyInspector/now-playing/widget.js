'use strict';

(function () {
    const fonts = {
        system: '"Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        rounded: 'ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif',
        serif: 'Georgia, "Times New Roman", serif', mono: 'Consolas, Menlo, monospace',
        narrow: '"Arial Narrow", "Segoe UI", sans-serif'
    };
    const format = seconds => {
        const value = Math.max(0, Math.floor(seconds || 0));
        return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
    };
    const rgba = (color, opacity) => {
        const channels = color.slice(1).match(/../g).map(value => parseInt(value, 16));
        return 'rgba(' + channels.join(',') + ',' + opacity + ')';
    };

    class NowPlayingWidget {
        constructor(host) {
            this.host = host;
            host.innerHTML = '<article class="np-widget"><div class="np-surface"><div class="np-artwork"></div><div class="np-tint"></div><img class="np-cover" alt="Обложка трека"><div class="np-info"><div class="np-line np-title"><div class="np-line-track"><span></span></div></div><div class="np-line np-artist"><div class="np-line-track"><span></span></div></div><div class="np-progress"><div class="np-bar"><div class="np-fill"></div></div></div><div class="np-times"><span></span><span></span></div></div></div></article>';
            this.element = host.firstElementChild;
            this.surface = host.querySelector('.np-surface');
            this.cover = host.querySelector('.np-cover');
            this.artwork = host.querySelector('.np-artwork');
            this.tint = host.querySelector('.np-tint');
            this.lines = [host.querySelector('.np-title'), host.querySelector('.np-artist')];
            this.progress = host.querySelector('.np-progress');
            this.fill = host.querySelector('.np-fill');
            this.times = host.querySelector('.np-times');
            this.config = NowPlayingConfig.sanitize();
            this.track = null;
            this.syncedAt = performance.now();
            this.imageGeneration = 0;
            this.animations = new Map();
            this.imageUrl = '';
            this.pendingTrack = null;
            this.pendingKey = '';
            this.preparingKey = '';
            this.outgoing = null;
            this.enterAnimation = null;
            this.fitPending = null;
            this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            this.resizeObserver = new ResizeObserver(() => this.fit());
            this.resizeObserver.observe(this.element);
            document.fonts?.ready.then(() => this.fit());
            this.timer = setInterval(() => this.renderProgress(), 100);
        }

        configure(input, { animate: allowAnimation = true } = {}) {
            const config = NowPlayingConfig.sanitize(input);
            if (JSON.stringify(config) === this.configKey) return;
            const hasConfig = !!this.configKey;
            this.configKey = JSON.stringify(config);
            this.config = config;
            const animate = hasConfig && allowAnimation && this.beginTransition();
            if (!allowAnimation) {
                this.outgoing?.remove();
                this.outgoing = null;
                this.enterAnimation?.cancel();
                this.enterAnimation = null;
            }
            this.host.style.setProperty('--visibility-duration', (this.reducedMotion ? 120 : Math.min(300, config.transitionMs)) + 'ms');
            const style = this.element.style;
            const innerWidth = Math.max(1, config.width - config.padding * 2);
            const innerHeight = Math.max(1, config.height - config.padding * 2);
            const coverSize = Math.min(config.coverSize, innerWidth, innerHeight);
            const variables = {
                width: config.width + 'px', height: config.height + 'px', 'cover-size': coverSize + 'px',
                gap: config.gap + 'px', padding: config.padding + 'px', radius: config.radius + 'px',
                'cover-radius': config.coverRadius + 'px', 'title-size': config.titleSize + 'px',
                'artist-size': config.artistSize + 'px', 'bar-height': config.barHeight + 'px', weight: config.weight,
                align: config.align, 'cover-align': { left: 'start', center: 'center', right: 'end' }[config.align],
                'text-color': config.textColor, 'accent-color': config.accentColor,
                'track-color': rgba(config.textColor, .18)
            };
            for (const [key, value] of Object.entries(variables)) style.setProperty('--' + key, value);
            style.fontFamily = fonts[config.font];
            style.boxShadow = config.shadow ? '0 12px 28px -8px rgba(0,0,0,.45)' : 'none';
            style.textShadow = config.textShadow ? '0 2px 8px rgba(0,0,0,.65)' : 'none';
            this.surface.style.backdropFilter = config.background === 'glass' ? 'blur(24px)' : 'none';
            this.tint.style.background = config.background === 'transparent' ? 'transparent'
                : rgba(config.backgroundColor, config.opacity / 100);
            this.artwork.hidden = config.background !== 'artwork';
            this.cover.style.boxShadow = config.coverShadow ? '0 8px 18px -6px rgba(0,0,0,.5)' : 'none';
            this.element.dataset.layout = config.layout;
            this.element.dataset.cover = String(config.showCover);
            this.element.dataset.info = String(config.showTitle || config.showArtist || config.showProgress || config.showTime);
            this.element.dataset.shrink = String(config.pauseShrink);
            this.lines[0].hidden = !config.showTitle;
            this.lines[1].hidden = !config.showArtist;
            this.progress.hidden = !config.showProgress;
            this.times.hidden = !config.showTime;
            this.renderVisibility();
            this.fit();
            if (animate) this.finishTransition();
        }

        update(track) {
            this.pendingTrack = track;
            this.renderVisibility();
            if (!track) {
                this.imageGeneration++;
                this.preparingKey = '';
                this.pendingKey = '';
                return;
            }
            const key = JSON.stringify([track.title, track.artist, track.cover]);
            this.pendingKey = key;
            if (track.coverPending) {
                this.imageGeneration++;
                this.preparingKey = '';
                return;
            }
            if (this.track && this.track.title === track.title && this.track.artist === track.artist && this.imageUrl === track.cover) {
                this.track = track;
                this.syncedAt = performance.now();
                this.element.dataset.paused = String(!track.playing);
                this.renderProgress();
                return;
            }
            if (this.preparingKey === key) return;
            this.preparingKey = key;
            const generation = ++this.imageGeneration;
            const safe = typeof track.cover === 'string' && (track.cover === '/assets/logo.png' || (track.cover.startsWith('/now-playing/cover/') && /^[a-f0-9]{24}$/.test(track.cover.slice(19))))
                ? track.cover : '/assets/logo.png';
            const image = new Image();
            const ready = () => {
                if (generation !== this.imageGeneration || key !== this.pendingKey || !this.pendingTrack) return;
                this.preparingKey = '';
                this.commit(this.pendingTrack, image.src);
            };
            image.onload = () => image.decode().catch(() => {}).then(ready);
            image.onerror = () => {
                if (generation !== this.imageGeneration) return;
                image.onerror = null;
                image.onload = ready;
                image.src = '/assets/logo.png';
            };
            image.src = safe;
        }

        commit(track, image) {
            const animate = this.beginTransition();
            this.track = track;
            this.syncedAt = performance.now();
            this.imageUrl = track.cover;
            this.cover.src = image;
            this.artwork.style.backgroundImage = 'url("' + image + '")';
            this.setText(this.lines[0], track.title || '');
            this.setText(this.lines[1], track.artist || '');
            this.element.dataset.paused = String(!track.playing);
            this.renderVisibility();
            this.renderProgress();
            this.fit();
            if (animate) this.finishTransition();
        }

        beginTransition() {
            const animate = !!this.track && this.config.transition !== 'none' && !this.reducedMotion;
            this.outgoing?.remove();
            this.outgoing = null;
            const opacity = getComputedStyle(this.element).opacity;
            this.enterAnimation?.cancel();
            if (animate) {
                const outgoing = this.element.cloneNode(true);
                outgoing.classList.add('np-outgoing');
                outgoing.style.opacity = opacity;
                const strips = outgoing.querySelectorAll('.np-line-track');
                this.lines.forEach((line, index) => { strips[index].style.transform = getComputedStyle(line.firstElementChild).transform; });
                this.host.appendChild(outgoing);
                this.outgoing = outgoing;
                const animation = outgoing.animate([{ opacity }, { opacity: 0 }], {
                    duration: this.config.transitionMs, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards'
                });
                animation.finished.then(() => { outgoing.remove(); if (this.outgoing === outgoing) this.outgoing = null; }).catch(() => {});
            }
            return animate;
        }

        finishTransition() {
            this.enterAnimation = this.element.animate([
                { opacity: 0, transform: this.config.transition === 'slide' ? 'translateY(8px)' : 'none' },
                { opacity: 1, transform: 'none' }
            ], { duration: this.config.transitionMs, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
        }

        renderVisibility() {
            const target = this.pendingTrack;
            this.host.dataset.visible = String(this.config.enabled && !!target && !!this.track
                && (!this.config.hideOnPause || target.playing));
        }

        setText(line, text) {
            const strip = line.firstElementChild;
            if (strip.firstElementChild.textContent === text) return;
            this.animations.get(line)?.cancel();
            strip.replaceChildren();
            const label = document.createElement('span');
            label.textContent = text;
            strip.appendChild(label);
        }

        fit() {
            cancelAnimationFrame(this.fitPending);
            this.fitPending = requestAnimationFrame(() => {
                for (const line of this.lines) {
                    this.animations.get(line)?.cancel();
                    const strip = line.firstElementChild;
                    while (strip.children.length > 1) strip.lastElementChild.remove();
                    line.dataset.scroll = 'false';
                    if (line.hidden || !this.config.scrollSpeed || this.reducedMotion) continue;
                    const label = strip.firstElementChild;
                    if (label.offsetWidth <= line.clientWidth + 1) continue;
                    line.dataset.scroll = 'true';
                    strip.appendChild(label.cloneNode(true));
                    const distance = label.offsetWidth;
                    const movement = distance / this.config.scrollSpeed;
                    const duration = 2 + movement;
                    this.animations.set(line, strip.animate([
                        { transform: 'translateX(0)', offset: 0 },
                        { transform: 'translateX(0)', offset: 2 / duration },
                        { transform: 'translateX(-' + distance + 'px)', offset: 1 }
                    ], { duration: duration * 1000, iterations: Infinity, easing: 'linear' }));
                }
            });
        }

        renderProgress() {
            if (!this.track) return;
            const duration = Math.max(0, this.track.duration || 0);
            const elapsed = this.track.playing ? (performance.now() - this.syncedAt) / 1000 : 0;
            const position = Math.min(duration || Infinity, Math.max(0, (this.track.position || 0) + elapsed));
            this.fill.style.transform = 'translateX(' + ((duration ? position / duration : 0) * 100 - 100) + '%)';
            this.times.firstElementChild.textContent = format(position);
            this.times.lastElementChild.textContent = duration ? '-' + format(duration - position) : '--:--';
        }

        destroy() {
            clearInterval(this.timer);
            cancelAnimationFrame(this.fitPending);
            this.resizeObserver.disconnect();
            this.imageGeneration++;
            this.outgoing?.remove();
            this.enterAnimation?.cancel();
            for (const animation of this.animations.values()) animation.cancel();
        }
    }
    window.NowPlayingWidget = NowPlayingWidget;
})();
