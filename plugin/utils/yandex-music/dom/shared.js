'use strict';

module.exports = `
function ymFindSonataPlayerBar() {
  return ymQueryDeep('[class*="PlayerBarDesktopWithBackgroundProgressBar_root"]')
    || ymQueryDeep('[data-test-id="PLAYERBAR_DESKTOP"]')
    || ymQueryDeep('[class*="PlayerBarDesktopWithBackgroundProgressBar_info"]');
}

function ymIsVisibleNode(node) {
  if (!node) return false;
  if (node.closest && node.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  if (node.getClientRects && node.getClientRects().length === 0) return false;
  return true;
}

function ymFindVibeMetadataRoot() {
  var node = document.querySelector('[class*="VibePage_root"], [class*="VibePlayerbarMeta_root"], '
    + '[class*="VibePage_entityMeta"], [class*="VibePlayerbarMeta_trackNameText"]');
  return ymIsVisibleNode(node) ? node : null;
}

function ymReadMediaSessionTrack() {
  try {
    var metadata = typeof navigator !== 'undefined' && navigator.mediaSession
      ? navigator.mediaSession.metadata : null;
    if (!metadata) return null;
    var title = String(metadata.title || '').trim();
    if (!title || /^(моя волна|my vibe|яндекс музыка|yandex music)$/i.test(title)) return null;
    var artwork = metadata.artwork || [];
    var coverUrl = '';
    var bestSize = -1;
    for (var i = 0; i < artwork.length; i++) {
      var item = artwork[i];
      if (!item || !item.src) continue;
      var raw = String(item.src);
      if (raw.indexOf('//') === 0) raw = 'https:' + raw;
      else if (raw.indexOf('/') === 0 && typeof location !== 'undefined') raw = location.origin + raw;
      if (!/^https?:[/][/]/i.test(raw)) continue;
      var dims = String(item.sizes || '').match(/([0-9]+) *x *([0-9]+)/i);
      var size = dims ? Math.min(Number(dims[1]), Number(dims[2])) : 0;
      if (size >= bestSize) { bestSize = size; coverUrl = raw; }
    }
    return { title: title, artist: String(metadata.artist || '').trim(), coverUrl: coverUrl };
  } catch (err) { return null; }
}


function ymInstallMediaPositionCapture() {
  try {
    var session = typeof navigator !== 'undefined' ? navigator.mediaSession : null;
    if (!session || typeof session.setPositionState !== 'function') return;
    if (session.setPositionState.__ymAjazzPositionCapture) return;
    var original = session.setPositionState;
    var wrapped = function(positionState) {
      try {
        if (positionState && Number.isFinite(Number(positionState.duration)) && Number(positionState.duration) > 0) {
          var meta = ymReadMediaSessionTrack();
          var duration = Number(positionState.duration);
          var position = Number(positionState.position);
          window.__YM_AJAZZ_MEDIA_POSITION = {
            duration: duration,
            position: Number.isFinite(position) ? Math.max(0, Math.min(duration, position)) : 0,
            at: Date.now(),
            title: meta ? meta.title : '',
            artist: meta ? meta.artist : ''
          };
        } else {
          window.__YM_AJAZZ_MEDIA_POSITION = null;
        }
      } catch (ignored) {}
      return original.apply(this, arguments);
    };
    wrapped.__ymAjazzPositionCapture = true;
    session.setPositionState = wrapped;
  } catch (ignored) {}
}

function ymReadMediaPosition() {
  try {
    var value = window.__YM_AJAZZ_MEDIA_POSITION;
    if (!value || !Number.isFinite(value.duration) || value.duration <= 0) return null;
    var media = ymReadMediaSessionTrack();
    var title = ymIsVibePageActive() ? ymGetVibeTrackTitle() : '';
    var normal = function(value) { return String(value || '').trim().toLocaleLowerCase().replace(/ +/g, ' '); };
    if (value.title && media && normal(value.title) !== normal(media.title)) return null;
    if (value.title && !media && title && normal(value.title) !== normal(title)) return null;
    if (value.artist && media && normal(value.artist) !== normal(media.artist)) return null;
    if (Date.now() - value.at > value.duration * 1000 + 30000) return null;
    var playback = typeof navigator !== 'undefined' && navigator.mediaSession
      ? navigator.mediaSession.playbackState : '';
    var playing = playback === 'playing' ? true : playback === 'paused' ? false : ymDetectPlaybackIsPlaying();
    var elapsed = playing === true ? Math.max(0, (Date.now() - value.at) / 1000) : 0;
    var position = Math.min(value.duration, value.position + elapsed);
    return {
      success: true,
      currentTime: ymFormatSeconds(position),
      totalTime: ymFormatSeconds(value.duration),
      progressValue: position, progressMax: value.duration,
      progressPercent: 100 * position / value.duration
    };
  } catch (ignored) { return null; }
}

function ymFormatSeconds(seconds) {
  var s = Math.max(0, Math.floor(seconds));
  var minutes = Math.floor(s / 60);
  var hours = Math.floor(minutes / 60);
  return hours > 0
    ? hours + ':' + String(minutes % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
    : minutes + ':' + String(s % 60).padStart(2, '0');
}

function ymIsMusicPlayerReady() {
  return !!(ymFindSonataPlayerBar() || ymFindVibePlayerBar()
    || (ymIsVibePageActive() && ymGetVibeTrackTitle()) || ymReadMediaSessionTrack());
}

function ymFindVibeControlsRoot() {
  return document.querySelector('[class*="VibePlayerControls_root"]');
}

function ymIsVibePageActive() {
  var vibeControls = ymFindVibeControlsRoot();
  if (vibeControls && ymIsVisibleNode(vibeControls)) {
    var rect = vibeControls.getBoundingClientRect ? vibeControls.getBoundingClientRect() : null;
    if (!rect || (rect.width > 0 && rect.height > 0)) return true;
  }
  if (ymFindVibeMetadataRoot()) return true;
  var vibePlayer = ymFindVibePlayerBar();
  if (ymIsVisibleNode(vibePlayer)) return true;
  var path = typeof location !== 'undefined' ? String(location.pathname || '') : '';
  return /(^|[/])(vibe|my-vibe)([/]|$)/i.test(path);
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
