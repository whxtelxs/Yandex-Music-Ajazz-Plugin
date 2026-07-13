'use strict';

function parseTime(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value !== 'string') return null;
    const parts = value.split(':').map(Number);
    if (!parts.length || parts.some(Number.isNaN)) return null;
    return parts.reduce((total, part) => total * 60 + part, 0);
}

function formatTime(seconds) {
    const safe = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(safe / 60);
    return `${minutes}:${String(safe % 60).padStart(2, '0')}`;
}

function projectTime(timer, now = Date.now()) {
    if (!timer) return null;
    const elapsed = timer.playing ? Math.max(0, now - timer.syncedAt) / 1000 : 0;
    return Math.min(timer.total, timer.position + elapsed);
}

module.exports = { parseTime, formatTime, projectTime };
