'use strict';

module.exports = `
function ymCollectAjazzState() {
  var metadata = ymGetTrackInfo();
  var time = ymGetTrackTime();
  var vibe = ymIsVibePageActive();
  var menu = vibe ? ymScanVibeContextMenu(ymFindVibeContextMenuPanel()) : null;
  var shuffle = vibe ? null : ymDetectSonataControlByFragment('shuffle');
  var repeat = vibe ? null : ymDetectSonataControlByFragment('repeat');
  var next = {
    playerReady: !!(vibe ? ymFindVibePlayerBar() : ymFindSonataPlayerBar()),
    vibeActive: vibe,
    shuffleAvailable: vibe ? ymDetectVibeShuffleAvailable() : true,
    shuffleOn: menu ? menu.shuffleOn : (shuffle && shuffle.ok ? shuffle.shuffle : null),
    repeatMode: menu ? menu.repeatMode : (repeat && repeat.ok ? repeat.mode : null),
    trackTitle: metadata.success ? metadata.title : null,
    trackArtist: metadata.success ? metadata.artist : null,
    trackUrl: metadata.success ? metadata.trackUrl : null,
    coverUrl: metadata.success ? metadata.coverUrl : null,
    playing: ymDetectPlaybackIsPlaying(),
    liked: ymDetectLikeIsLiked(),
    muted: ymDetectMuteIsMuted(),
    currentTime: time.success ? time.currentTime : null,
    totalTime: time.success ? time.totalTime : null,
    progressValue: time.success ? time.progressValue : null,
    progressMax: time.success ? time.progressMax : null,
    version: 0
  };
  return next;
}

function ymStateFingerprint(state) {
  var fields = ['playerReady', 'vibeActive', 'shuffleAvailable', 'shuffleOn', 'repeatMode', 'trackTitle',
    'trackArtist', 'trackUrl', 'coverUrl', 'playing', 'liked', 'muted', 'currentTime', 'totalTime'];
  return JSON.stringify(fields.map(function(key) { return state[key]; }));
}

function ymInstallAjazzObserver() {
  if (window.__YM_AJAZZ_OBSERVER__ && window.__YM_AJAZZ_OBSERVER__.dispose) {
    window.__YM_AJAZZ_OBSERVER__.dispose();
  }
  var timer = null;
  var observedRoot = null;
  var observedMenu = null;
  var disposed = false;
  var lastFingerprint = '';
  var observer = new MutationObserver(scheduleRefresh);
  var menuObserver = new MutationObserver(scheduleRefresh);
  var rootObserver = new MutationObserver(function() {
    var previousRoot = observedRoot;
    var previousMenu = observedMenu;
    attachPlayerObserver();
    if (previousRoot !== observedRoot || previousMenu !== observedMenu) scheduleRefresh();
  });

  function publish() {
    if (typeof ymAjazzNotify === 'function') ymAjazzNotify(JSON.stringify(window.__YM_AJAZZ_STATE));
  }

  function refresh() {
    if (disposed) return;
    var previous = window.__YM_AJAZZ_STATE || {};
    var next = ymCollectAjazzState();
    var sameTrack = next.trackTitle && next.trackTitle === previous.trackTitle
      && next.trackArtist === previous.trackArtist;
    if (next.vibeActive === previous.vibeActive) {
      if (next.shuffleAvailable === null) next.shuffleAvailable = previous.shuffleAvailable ?? null;
      if (next.shuffleOn === null) next.shuffleOn = previous.shuffleOn ?? null;
      if (next.repeatMode === null) next.repeatMode = previous.repeatMode ?? null;
    }
    if (sameTrack) {
      if (!next.trackUrl) next.trackUrl = previous.trackUrl;
      if (!next.coverUrl) next.coverUrl = previous.coverUrl;
    }
    next.version = (previous.version || 0) + 1;
    var fingerprint = ymStateFingerprint(next);
    if (fingerprint !== lastFingerprint) {
      lastFingerprint = fingerprint;
      window.__YM_AJAZZ_STATE = next;
      publish();
    }
  }

  function scheduleRefresh() {
    if (disposed || timer) return;
    timer = setTimeout(function() { timer = null; refresh(); }, 80);
  }

  function attachPlayerObserver() {
    if (disposed) return;
    var menu = ymFindVibeContextMenuPanel();
    if (menu !== observedMenu) {
      menuObserver.disconnect();
      observedMenu = menu;
      if (menu) menuObserver.observe(menu, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'aria-pressed', 'aria-disabled'] });
    }
    var root = ymIsVibePageActive() ? ymFindVibePlayerBar() : ymFindSonataPlayerBar();
    if (root === observedRoot) return;
    observer.disconnect();
    observedRoot = root;
    if (!root) return;
    observer.observe(root, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-expanded', 'aria-pressed', 'aria-label', 'aria-hidden', 'class', 'disabled', 'src', 'srcset']
    });
  }

  var interval = setInterval(function() { attachPlayerObserver(); scheduleRefresh(); }, 2000);
  window.__YM_AJAZZ_OBSERVER__ = {
    dispose: function() {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      clearInterval(interval);
      observer.disconnect();
      menuObserver.disconnect();
      rootObserver.disconnect();
      window.__YM_AJAZZ_OBSERVER__ = null;
    }
  };
  if (document.body || document.documentElement) {
    rootObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }
  attachPlayerObserver();
  refresh();
}

`;
