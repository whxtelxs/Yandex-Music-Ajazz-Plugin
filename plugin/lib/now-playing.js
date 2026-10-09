'use strict';

const { createHash } = require('node:crypto');
const { getCoverDataUrl } = require('./cover');
const { sanitize } = require('../../propertyInspector/now-playing/config');

function coverAddress(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || !/(^|\.)yandex\.(net|ru)$/i.test(url.hostname)) return '';
        return url.href;
    } catch { return ''; }
}

function seconds(value) { return Number.isFinite(value) ? Math.max(0, value) : 0; }

class NowPlayingFeed {
    constructor({ getState, getConfig, isConnected, onChange = () => {}, loadCover = getCoverDataUrl }) {
        this.getState = getState;
        this.getConfig = getConfig;
        this.isConnected = isConnected;
        this.onChange = onChange;
        this.loadCover = loadCover;
        this.coverUrl = '';
        this.cover = null;
        this.covers = new Map();
        this.loading = false;
        this.retryAt = 0;
        this.generation = 0;
        this.stopped = false;
    }

    snapshot() {
        const track = this.isConnected() ? this.getState() : null;
        const config = sanitize(this.getConfig());
        const address = coverAddress(track?.coverUrl);
        if (address !== this.coverUrl) {
            this.generation++;
            this.coverUrl = address;
            this.cover = this.covers.get(address) || null;
            this.loading = false;
            this.retryAt = 0;
        }
        if (!this.stopped && address && !this.cover && !this.loading && Date.now() >= this.retryAt
            && (config.showCover || config.background === 'artwork')) this.fetchCover(address);
        const duration = seconds(track?.totalSec);
        return {
            type: 'nowPlaying', config,
            track: track?.title ? {
                title: String(track.title).slice(0, 1000), artist: String(track.artist || '').slice(0, 1000),
                playing: track.playing === true, position: Math.min(duration || Infinity, seconds(track.positionSec)),
                duration, coverPending: !!address && !this.cover && !this.retryAt && (config.showCover || config.background === 'artwork'), cover: this.cover ? '/now-playing/cover/' + this.cover.key : '/assets/logo.png'
            } : null
        };
    }

    fetchCover(url) {
        const generation = this.generation;
        this.loading = true;
        Promise.resolve().then(() => this.loadCover(url)).then(data => {
            if (this.stopped || generation !== this.generation) return;
            const match = String(data).match(/^data:(image\/(?:jpeg|png|webp|gif|avif));base64,([a-zA-Z0-9+/=]+)$/);
            if (!match) throw new Error('Invalid overlay cover');
            this.cover = { key: createHash('sha256').update(url).digest('hex').slice(0, 24),
                mime: match[1], data: Buffer.from(match[2], 'base64') };
            this.covers.delete(url);
            this.covers.set(url, this.cover);
            while (this.covers.size > 8) this.covers.delete(this.covers.keys().next().value);
            this.onChange();
        }).catch(() => {
            if (!this.stopped && generation === this.generation) {
                this.retryAt = Date.now() + 10000;
                this.onChange();
            }
        }).finally(() => { if (generation === this.generation) this.loading = false; });
    }

    getCover(key) { return [...this.covers.values()].find(cover => cover.key === key) || null; }

    stop() { this.stopped = true; this.generation++; }
}

module.exports = { NowPlayingFeed, coverAddress };
