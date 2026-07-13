'use strict';

const samples = new Map();
const counters = new Map();

function increment(name, amount = 1) {
    counters.set(name, (counters.get(name) || 0) + amount);
}

function record(name, durationMs) {
    const values = samples.get(name) || [];
    values.push(durationMs);
    if (values.length > 200) values.shift();
    samples.set(name, values);
}

function percentile(values, p) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function snapshot() {
    const timings = {};
    for (const [name, values] of samples) {
        timings[name] = {
            count: values.length,
            p50: percentile(values, 0.5),
            p95: percentile(values, 0.95),
            max: Math.max(...values)
        };
    }
    return {
        counters: Object.fromEntries(counters),
        timings
    };
}

function reset() {
    samples.clear();
    counters.clear();
}

module.exports = { increment, record, snapshot, reset };
