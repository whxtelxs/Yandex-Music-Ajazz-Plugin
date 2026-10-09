import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { scrollbarMetrics } from "./scrollbar-metrics";
function Scrollbar({ bar }) {
  const ref = useRef(null);
  const drag = useRef(null);
  const horizontal = bar.axis === "x";
  const setScroll = (value) => {
    if (horizontal) bar.target.scrollLeft = value;
    else bar.target.scrollTop = value;
  };
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    let timer;
    const show = () => {
      node.setAttribute("data-active", "true");
      clearTimeout(timer);
      timer = setTimeout(() => node.removeAttribute("data-active"), 800);
    };
    const enter = (event) => {
      if (event.pointerType === "mouse" && matchMedia("(hover: hover) and (pointer: fine)").matches) show();
    };
    const target = bar.target === document.scrollingElement ? document : bar.target;
    target.addEventListener("scroll", show, { passive: true });
    bar.target.addEventListener("pointerenter", enter);
    return () => {
      clearTimeout(timer);
      target.removeEventListener("scroll", show);
      bar.target.removeEventListener("pointerenter", enter);
    };
  }, [bar.target]);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const wheel = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const delta = (horizontal ? event.deltaX || event.deltaY : event.deltaY) * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? bar.length : 1);
      setScroll((horizontal ? bar.target.scrollLeft : bar.target.scrollTop) + delta);
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [bar.target, bar.axis, bar.length]);
  const endDrag = () => {
    drag.current = null;
    ref.current?.removeAttribute("data-dragging");
  };
  const down = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const point = horizontal ? event.clientX : event.clientY;
    if (!event.target.closest(".custom-scrollbar__thumb")) {
      setScroll((point - (horizontal ? bar.left : bar.top) - bar.thumb / 2) / (bar.length - bar.thumb) * bar.range);
    }
    drag.current = { pointer: event.pointerId, start: point, scroll: horizontal ? bar.target.scrollLeft : bar.target.scrollTop };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.setAttribute("data-dragging", "true");
  };
  return <div
    ref={ref}
    data-custom-scrollbar=""
    data-react-aria-top-layer=""
    aria-hidden="true"
    className={`custom-scrollbar custom-scrollbar--${bar.axis}`}
    style={{ left: bar.left, top: bar.top, width: horizontal ? bar.length : 10, height: horizontal ? 10 : bar.length }}
    onPointerDown={down}
    onPointerUp={endDrag}
    onPointerCancel={endDrag}
    onLostPointerCapture={endDrag}
    onPointerMove={(event) => {
      const current = drag.current;
      if (current && current.pointer === event.pointerId) setScroll(current.scroll + ((horizontal ? event.clientX : event.clientY) - current.start) * bar.range / (bar.length - bar.thumb));
    }}
  >
    <div className="custom-scrollbar__thumb" style={horizontal ? { width: bar.thumb, transform: `translateX(${bar.offset}px)` } : { height: bar.thumb, transform: `translateY(${bar.offset}px)` }} />
  </div>;
}
function Scrollbars() {
  const [bars, setBars] = useState([]);
  const barsRef = useRef([]);
  useLayoutEffect(() => {
    let frame = 0;
    let counter = 0;
    const ids =  new WeakMap();
    const observed =  new Set();
    const candidates =  new Set();
    const pending =  new Set([document.body]);
    const changed =  new Set();
    const ignored = "[data-custom-scrollbar], [data-scrollbar-hidden], .code-input__paint, .code-input__gutter, svg";
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(scan);
    };
    const resize = new ResizeObserver(schedule);
    function scan() {
      frame = 0;
      const next = [];
      const styles =  new Map();
      const readStyle = (node) => {
        let style = styles.get(node);
        if (!style) {
          style = getComputedStyle(node);
          styles.set(node, style);
        }
        return style;
      };
      const root = document.scrollingElement;
      const modal = [...document.querySelectorAll('[aria-modal="true"]')].at(-1);
      candidates.add(root);
      const inspect = (node) => {
        const style = readStyle(node);
        if (/auto|scroll/.test(`${style.overflowX} ${style.overflowY}`)) candidates.add(node);
        else if (node !== root) candidates.delete(node);
      };
      for (const node of changed) if (node.isConnected && !node.closest(ignored)) inspect(node);
      changed.clear();
      for (const subtree of pending) {
        if (!subtree.isConnected || subtree.closest(ignored)) continue;
        if ([...pending].some((other) => other !== subtree && other.contains(subtree))) continue;
        inspect(subtree);
        const walker = document.createTreeWalker(subtree, NodeFilter.SHOW_ELEMENT, {
          acceptNode: (node) => node.matches(ignored) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
        });
        while (walker.nextNode()) {
          const node = walker.currentNode;
          if (!(node instanceof HTMLElement)) continue;
          inspect(node);
        }
      }
      pending.clear();
      const currentTargets =  new Set([document.documentElement, document.body]);
      for (const target of candidates) {
        if (!target.isConnected) {
          candidates.delete(target);
          continue;
        }
        if (!target || target.closest(ignored)) continue;
        currentTargets.add(target);
        if (modal && !modal.contains(target)) continue;
        const isPage = target === root;
        const style = readStyle(target);
        const pageLocked = isPage && [style.overflowY, readStyle(document.body).overflowY].some((overflow) => /hidden|clip/.test(overflow));
        if (pageLocked) continue;
        const scrollY = target.scrollHeight - target.clientHeight;
        const scrollX = target.scrollWidth - target.clientWidth;
        const vertical = scrollY > 1 && (isPage || /auto|scroll/.test(style.overflowY));
        const horizontal = scrollX > 1 && (isPage || /auto|scroll/.test(style.overflowX));
        if (!vertical && !horizontal || !target.clientWidth || !target.clientHeight) continue;
        const rect = isPage ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight } : target.getBoundingClientRect();
        let left = Math.max(0, rect.left + (isPage ? 0 : target.clientLeft));
        let top = Math.max(0, rect.top + (isPage ? 0 : target.clientTop));
        let right = Math.min(innerWidth, rect.right);
        let bottom = Math.min(innerHeight, rect.bottom);
        for (let parent = isPage ? null : target.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
          const parentStyle = readStyle(parent);
          const clipY = /auto|scroll|hidden|clip/.test(parentStyle.overflowY);
          const clipX = /auto|scroll|hidden|clip/.test(parentStyle.overflowX);
          if (clipY || clipX) {
            const parentRect = parent.getBoundingClientRect();
            if (clipY) {
              top = Math.max(top, parentRect.top);
              bottom = Math.min(bottom, parentRect.bottom);
            }
            if (clipX) {
              left = Math.max(left, parentRect.left);
              right = Math.min(right, parentRect.right);
            }
          }
        }
        if (bottom - top < 36 || right - left < 36) continue;
        if (!ids.has(target)) ids.set(target, ++counter);
        for (const axis of ["y", "x"]) {
          if (axis === "y" ? !vertical : !horizontal) continue;
          const resizeGrip = /vertical|horizontal|both/.test(style.resize);
          const insetStart = 24;
          const insetEnd = resizeGrip ? 32 : 24;
          const length = (axis === "y" ? bottom - top : right - left) - insetStart - insetEnd;
          if (length < 26) continue;
          const viewport = axis === "y" ? target.clientHeight : target.clientWidth;
          const content = axis === "y" ? target.scrollHeight : target.scrollWidth;
          const range = axis === "y" ? scrollY : scrollX;
          const position = axis === "y" ? target.scrollTop : target.scrollLeft;
          const { thumb, offset } = scrollbarMetrics(length, viewport, content, position);
          next.push({
            id: `${ids.get(target)}-${axis}`,
            target,
            axis,
            left: axis === "y" ? right - 12 : left + insetStart,
            top: axis === "y" ? top + insetStart : bottom - 12,
            length,
            thumb,
            offset,
            range
          });
        }
      }
      for (const target of observed) if (!currentTargets.has(target)) {
        resize.unobserve(target);
        observed.delete(target);
      }
      for (const target of currentTargets) if (!observed.has(target)) {
        observed.add(target);
        resize.observe(target);
      }
      const previous = barsRef.current;
      const unchanged = previous.length === next.length && previous.every((bar, index) => {
        const other = next[index];
        return bar.id === other.id && bar.left === other.left && bar.top === other.top && bar.length === other.length && bar.thumb === other.thumb && bar.offset === other.offset && bar.range === other.range;
      });
      if (!unchanged) {
        barsRef.current = next;
        setBars(next);
      }
    }
    const mutations = new MutationObserver((records) => {
      const relevant = records.filter((record) => !record.target.closest?.(ignored) && !(record.type === "childList" && [...record.addedNodes, ...record.removedNodes].every((node) => node instanceof Element && node.hasAttribute("data-custom-scrollbar"))));
      if (!relevant.length) return;
      for (const record of relevant) {
        if (record.type === "childList") {
          for (const node of record.addedNodes) if (node instanceof HTMLElement) pending.add(node);
        } else if (record.target instanceof HTMLElement) changed.add(record.target);
      }
      schedule();
    });
    mutations.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "style", "open"] });
    document.addEventListener("scroll", schedule, true);
    document.addEventListener("input", schedule, true);
    document.addEventListener("toggle", schedule, true);
    const viewportResize = () => {
      pending.add(document.body);
      schedule();
    };
    window.addEventListener("resize", viewportResize);
    window.visualViewport?.addEventListener("resize", viewportResize);
    scan();
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resize.disconnect();
      document.removeEventListener("scroll", schedule, true);
      document.removeEventListener("input", schedule, true);
      document.removeEventListener("toggle", schedule, true);
      window.removeEventListener("resize", viewportResize);
      window.visualViewport?.removeEventListener("resize", viewportResize);
    };
  }, []);
  return createPortal(bars.map((bar) => <Scrollbar key={bar.id} bar={bar} />), document.body);
}
export {
  Scrollbars
};
