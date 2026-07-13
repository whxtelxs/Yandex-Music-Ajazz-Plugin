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
    trackUrl: null,
    coverUrl: null,
    playing: null,
    liked: null,
    muted: null,
    currentTime: null,
    totalTime: null,
    progressValue: null,
    progressMax: null,
    version: 0
  };

  next.playing = ymDetectPlaybackIsPlaying();
  next.liked = ymDetectLikeIsLiked();
  next.muted = ymDetectMuteIsMuted();
  var timeInfo = ymGetTrackTime();
  if (timeInfo && timeInfo.success) {
    next.currentTime = timeInfo.currentTime;
    next.totalTime = timeInfo.totalTime;
    next.progressValue = timeInfo.progressValue;
    next.progressMax = timeInfo.progressMax;
  }

  if (next.vibeActive) {
    var ctx = document.querySelector('[class*="VibeResetButton_context"]');
    var modeText = ctx ? (ctx.textContent || ctx.getAttribute('title') || '').trim() : '';
    if (modeText.indexOf('Мне нравится') !== -1) next.vibeMode = 'likes';
    else if (modeText) next.vibeMode = 'wave';

    next.shuffleAvailable = ymDetectVibeShuffleAvailable();
    next.trackTitle = ymGetVibeTrackTitle();
    next.trackArtist = ymGetVibeTrackArtist();
    var vibeCoverUrl = ymResolveVibeCoverUrl();
    next.coverUrl = ymUpscaleCoverUrl(vibeCoverUrl);
    next.trackUrl = ymResolveTrackPageUrl(vibeCoverUrl);

    var panel = ymFindVibeContextMenuPanel();
    var menuState = ymScanVibeContextMenu(panel);
    if (menuState) {
      if (panel) next.shuffleAvailable = menuState.shuffleAvailable;
      if (menuState.shuffleOn !== null) next.shuffleOn = menuState.shuffleOn;
      if (menuState.repeatMode !== null) next.repeatMode = menuState.repeatMode;
    }
  } else {
    next.shuffleAvailable = true;
    var sonataBar = ymFindSonataPlayerBar();
    if (sonataBar) next.trackUrl = ymResolveTrackPageUrl();
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
    state.trackArtist,
    state.trackUrl,
    state.coverUrl,
    state.playing,
    state.liked,
    state.muted,
    state.currentTime,
    state.totalTime
  ].join('|');
}

function ymInstallAjazzObserver() {
  if (window.__YM_AJAZZ_OBSERVER__) {
    window.__YM_AJAZZ_STATE = ymCollectAjazzState();
    window.__YM_AJAZZ_STATE.version = (window.__YM_AJAZZ_STATE.version || 0) + 1;
    return;
  }
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
    if (collected.vibeActive === prev.vibeActive && collected.shuffleOn === null && prev.shuffleOn !== null && prev.shuffleOn !== undefined) {
      collected.shuffleOn = prev.shuffleOn;
    }
    if (collected.vibeActive === prev.vibeActive && (collected.repeatMode === null || collected.repeatMode === undefined) && prev.repeatMode !== null && prev.repeatMode !== undefined) {
      collected.repeatMode = prev.repeatMode;
    }
    if (!collected.trackArtist && prev.trackArtist && prev.trackTitle === collected.trackTitle) {
      collected.trackArtist = prev.trackArtist;
    }
    if (!collected.trackUrl && prev.trackUrl && prev.trackTitle === collected.trackTitle) {
      collected.trackUrl = prev.trackUrl;
    }
    if (!collected.coverUrl && prev.coverUrl && prev.trackTitle === collected.trackTitle) {
      collected.coverUrl = prev.coverUrl;
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
    if (timer) return;
    timer = setTimeout(function() {
      timer = null;
      refresh();
    }, 50);
  }

  var observedRoot = null;
  var observer = new MutationObserver(scheduleRefresh);
  function attachPlayerObserver() {
    var root = ymFindVibePlayerBar() || ymFindSonataPlayerBar() || document.body;
    if (!root || root === observedRoot) return;
    observer.disconnect();
    observedRoot = root;
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-expanded', 'aria-pressed', 'aria-label', 'class', 'aria-hidden', 'disabled', 'src', 'style']
    });
  }
  attachPlayerObserver();

  var rootObserver = new MutationObserver(function() {
    attachPlayerObserver();
    scheduleRefresh();
  });
  rootObserver.observe(document.body || document.documentElement, {
    childList: true,
    subtree: false
  });
  window.__YM_AJAZZ_ROOT_TIMER__ = setInterval(function() {
    attachPlayerObserver();
    scheduleRefresh();
  }, 2000);

  scheduleRefresh();
}
`;
