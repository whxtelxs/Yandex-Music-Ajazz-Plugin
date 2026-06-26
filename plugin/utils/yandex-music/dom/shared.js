'use strict';

module.exports = `
function ymFindSonataPlayerBar() {
  return document.querySelector('.PlayerBarDesktopWithBackgroundProgressBar_root__bpmwN')
    || document.querySelector('[data-test-id="PLAYERBAR_DESKTOP"]');
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
  var seen = {};
  var out = [];
  for (var i = 0; i < items.length; i++) {
    var item = (items[i] || '').trim();
    if (!item || seen[item]) continue;
    seen[item] = true;
    out.push(item);
  }
  return out;
}
`;
