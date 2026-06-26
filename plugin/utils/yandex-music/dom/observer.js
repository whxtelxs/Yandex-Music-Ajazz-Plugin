'use strict';

module.exports = `
function ymCollectAjazzState() {
  var next = {
    vibeActive: ymIsVibePageActive(),
    vibeMode: null,
    shuffleAvailable: null,
    shuffleOn: null,
    repeatMode: null,
    trackTitle: null,
    trackArtist: null,
    version: 0
  };

  if (next.vibeActive) {
    var ctx = document.querySelector('[class*="VibeResetButton_context"]');
    var modeText = ctx ? (ctx.textContent || ctx.getAttribute('title') || '').trim() : '';
    if (modeText.indexOf('Мне нравится') !== -1) next.vibeMode = 'likes';
    else if (modeText) next.vibeMode = 'wave';

    next.shuffleAvailable = ymDetectVibeShuffleAvailable();
    next.trackTitle = ymGetVibeTrackTitle();
    next.trackArtist = ymGetVibeTrackArtist();

    var panel = ymFindVibeContextMenuPanel();
    var menuState = ymScanVibeContextMenu(panel);
    if (menuState) {
      if (panel) next.shuffleAvailable = menuState.shuffleAvailable;
      if (menuState.shuffleOn !== null) next.shuffleOn = menuState.shuffleOn;
      if (menuState.repeatMode !== null) next.repeatMode = menuState.repeatMode;
    }
  } else {
    next.shuffleAvailable = true;
    var sonataShuffle = ymDetectSonataControlByFragment('shuffle');
    if (sonataShuffle.ok) next.shuffleOn = sonataShuffle.shuffle;
    var sonataRepeat = ymDetectSonataControlByFragment('repeat');
    if (sonataRepeat.ok) next.repeatMode = sonataRepeat.mode;
  }

  return next;
}

function ymStateFingerprint(state) {
  return [
    state.vibeActive,
    state.vibeMode,
    state.shuffleAvailable,
    state.shuffleOn,
    state.repeatMode,
    state.trackTitle,
    state.trackArtist
  ].join('|');
}

function ymInstallAjazzObserver() {
  if (window.__YM_AJAZZ_OBSERVER__) return;
  window.__YM_AJAZZ_OBSERVER__ = true;
  window.__YM_AJAZZ_STATE = ymCollectAjazzState();
  window.__YM_AJAZZ_STATE.version = 1;

  var lastFp = ymStateFingerprint(window.__YM_AJAZZ_STATE);
  var timer = null;

  function publish() {
    if (typeof ymAjazzNotify === 'function') {
      ymAjazzNotify(JSON.stringify(window.__YM_AJAZZ_STATE));
    }
  }

  function refresh() {
    var prev = window.__YM_AJAZZ_STATE || {};
    var collected = ymCollectAjazzState();
    if (collected.shuffleOn === null && prev.shuffleOn !== null && prev.shuffleOn !== undefined) {
      collected.shuffleOn = prev.shuffleOn;
    }
    if ((collected.repeatMode === null || collected.repeatMode === undefined) && prev.repeatMode !== null && prev.repeatMode !== undefined) {
      collected.repeatMode = prev.repeatMode;
    }
    if (!collected.trackArtist && prev.trackArtist && prev.trackTitle === collected.trackTitle) {
      collected.trackArtist = prev.trackArtist;
    }
    collected.version = (prev.version || 0) + 1;
    var fp = ymStateFingerprint(collected);
    if (fp !== lastFp) {
      lastFp = fp;
      window.__YM_AJAZZ_STATE = collected;
      publish();
    }
  }

  function scheduleRefresh() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(refresh, 150);
  }

  var observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-expanded', 'aria-pressed', 'class', 'aria-hidden', 'disabled']
  });

  scheduleRefresh();
}
`;
