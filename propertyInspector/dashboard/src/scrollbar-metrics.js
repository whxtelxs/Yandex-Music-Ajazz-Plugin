function scrollbarMetrics(length, viewport, content, scroll) {
  const range = Math.max(0, content - viewport);
  const thumb = Math.max(0, Math.min(length - 1, Math.max(24, length * viewport / Math.max(1, content))));
  const travel = Math.max(0, length - thumb);
  const offset = range ? Math.max(0, Math.min(range, scroll)) / range * travel : 0;
  return { range, thumb, travel, offset };
}
module.exports = { scrollbarMetrics };
