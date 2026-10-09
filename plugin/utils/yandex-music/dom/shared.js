'use strict';

module.exports = `
function ymFindSonataPlayerBar() {
  return ymQueryDeep('[class*="PlayerBarDesktopWithBackgroundProgressBar_root"]')
    || ymQueryDeep('[data-test-id="PLAYERBAR_DESKTOP"]')
    || ymQueryDeep('[class*="PlayerBarDesktopWithBackgroundProgressBar_info"]');
}

function ymFindVibeControlsRoot() {
  return document.querySelector('[class*="VibePlayerControls_root"]');
}

function ymIsVibePageActive() {
  var vibeControls = ymFindVibeControlsRoot();
  if (!vibeControls) return false;
  var rect = vibeControls.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function ymFindVibePlayerBar() {
  return document.querySelector('[class*="VibePlayerBar_root"]');
}

function ymQueryDeep(selector, root) {
  root = root || document;
  if (root.querySelector) {
    var direct = root.querySelector(selector);
    if (direct) return direct;
  }
  var nodes = root.querySelectorAll ? root.querySelectorAll('*') : [];
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    if (!node.shadowRoot) continue;
    var found = ymQueryDeep(selector, node.shadowRoot);
    if (found) return found;
  }
  return null;
}

function ymCollectDeepLinks(root) {
  var links = [];
  function collect(scope) {
    if (!scope || !scope.querySelectorAll) return;
    links.push.apply(links, scope.querySelectorAll('a[href]'));
    var elements = scope.querySelectorAll('*');
    for (var i = 0; i < elements.length; i++) {
      if (elements[i].shadowRoot) collect(elements[i].shadowRoot);
    }
  }
  collect(root || document);
  return links;
}

function ymCanClick(button) {
  return !!button && !button.disabled && button.getAttribute('aria-disabled') !== 'true'
    && button.getAttribute('aria-hidden') !== 'true'
    && !(button.closest && button.closest('[hidden], [inert], [aria-hidden="true"]'))
    && !(button.getClientRects && button.getClientRects().length === 0);
}

async function ymWaitForState(read, expected) {
  for (var attempt = 0; attempt < 20; attempt++) {
    var value = read();
    if (value !== null && value !== undefined && (expected === undefined || value === expected)) return value;
    await ymWait(40);
  }
  return null;
}

function ymSetRangeValue(slider, newValue) {
  var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  nativeInputValueSetter.call(slider, newValue);
  slider.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: String(newValue)
  }));
  slider.dispatchEvent(new Event('change', { bubbles: true }));
}

function ymWait(ms) {
  return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function ymParseArtistLink(link) {
  if (!link) return '';
  var aria = link.getAttribute('aria-label') || '';
  if (aria.indexOf('Артист ') === 0) {
    var fromAria = aria.slice(7).trim();
    if (fromAria) return fromAria;
  }
  if (aria.indexOf('Исполнитель ') === 0) {
    var fromPerformer = aria.slice(12).trim();
    if (fromPerformer) return fromPerformer;
  }
  var title = link.getAttribute('title');
  if (title && title.trim()) return title.trim();
  var span = link.querySelector('span');
  if (span && span.textContent.trim()) return span.textContent.trim();
  var linkText = (link.textContent || '').trim();
  if (linkText) return linkText;
  return '';
}

function ymUniqueNonEmpty(items) {
  var seen = new Set();
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var item = (items[i] || '').trim();
    if (!item || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out;
}
`;
