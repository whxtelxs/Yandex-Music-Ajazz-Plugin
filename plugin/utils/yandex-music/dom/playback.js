'use strict';

module.exports = `
function ymFindVibePlayButton(root) {
  root = root || ymFindVibeControlsRoot();
  if (!root) return null;
  return root.querySelector('[class*="VibePlayerControls_playButton"]')
    || root.querySelector('button[aria-label="Воспроизведение"], button[aria-label="Пауза"]');
}

function ymFindVibeSkipButton(root, direction) {
  root = root || ymFindVibeControlsRoot();
  if (!root) return null;

  if (direction === 'previous') {
    return root.querySelector('button[data-test-id="PREVIOUS_TRACK_BUTTON"]')
      || root.querySelector('button[aria-label="Предыдущая песня"]')
      || (function() {
        var icon = root.querySelector('use[href*="previous_xs"], use[*|href*="previous_xs"]');
        return icon ? icon.closest('button') : null;
      })();
  }

  if (direction === 'next') {
    return root.querySelector('button[data-test-id="NEXT_TRACK_BUTTON"]')
      || root.querySelector('button[aria-label="Следующая песня"]')
      || (function() {
        var icon = root.querySelector('use[href*="next_xs"], use[*|href*="next_xs"]');
        return icon ? icon.closest('button') : null;
      })();
  }

  return null;
}

function ymDetectVibePlaybackIsPlaying() {
  var vibePlayButton = ymFindVibePlayButton();
  if (vibePlayButton) {
    var label = vibePlayButton.getAttribute('aria-label') || '';
    if (label === 'Пауза') return true;
    if (label === 'Воспроизведение') return false;

    var useEl = vibePlayButton.querySelector('use');
    if (useEl) {
      var href = useEl.getAttribute('xlink:href') || useEl.getAttribute('href') || '';
      if (href.indexOf('pause') !== -1) return true;
      if (href.indexOf('play') !== -1) return false;
    }
  }

  if (document.querySelector('[class*="VibePage_textContainer_playing"]')) {
    return true;
  }

  return null;
}

function ymDetectSonataPlaybackIsPlaying() {
  var bar = ymFindSonataPlayerBar();
  if (!bar) return null;
  if (bar.querySelector("button[data-test-id='PAUSE_BUTTON']")) {
    return true;
  }
  if (bar.querySelector("button[data-test-id='PLAY_BUTTON']")) {
    return false;
  }
  if (bar.querySelector("svg use[*|href='/icons/sprite.svg#pause_filled_l'], svg use[href='/icons/sprite.svg#pause_filled_l']")) {
    return true;
  }
  if (bar.querySelector("svg use[*|href='/icons/sprite.svg#play_filled_l'], svg use[href='/icons/sprite.svg#play_filled_l']")) {
    return false;
  }

  return null;
}

function ymDetectPlaybackIsPlaying() {
  if (ymIsVibePageActive()) {
    var vibeState = ymDetectVibePlaybackIsPlaying();
    return vibeState;
  }

  return ymDetectSonataPlaybackIsPlaying();
}

async function ymTogglePlayback() {
  try {
    var button = ymIsVibePageActive() ? ymFindVibePlayButton() : null;
    var bar = ymFindSonataPlayerBar();
    if (!ymIsVibePageActive() && !button && bar) {
      button = bar.querySelector('[data-test-id="PAUSE_BUTTON"], [data-test-id="PLAY_BUTTON"]');
      if (!button) {
        var icon = bar.querySelector('use[*|href*="pause_filled"], use[*|href*="play_filled"]');
        button = icon ? icon.closest('button') : null;
      }
    }
    if (!ymCanClick(button)) return { success: false, message: 'Воспроизведение недоступно' };
    var before = ymDetectPlaybackIsPlaying();
    button.click();
    var playing = before === null ? null : await ymWaitForState(ymDetectPlaybackIsPlaying, !before);
    return { success: true, accepted: true, confirmed: playing !== null, playing: playing, wasPlaying: before };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

async function ymClickTrackControl(direction) {
  try {
    if (ymIsVibePageActive()) {
      var vibeButton = ymFindVibeSkipButton(null, direction);
      if (ymCanClick(vibeButton)) {
        vibeButton.click();
        return { success: true, accepted: true, confirmed: false, message: 'Vibe: ' + direction };
      }
      return { success: false, message: 'Управление треком недоступно' };
    }

    var playerBar = ymFindSonataPlayerBar();
    if (playerBar) {
      var testId = direction === 'previous' ? 'PREVIOUS_TRACK_BUTTON' : 'NEXT_TRACK_BUTTON';
      var sonataButton = playerBar.querySelector("[data-test-id='" + testId + "']");
      if (ymCanClick(sonataButton)) {
        sonataButton.click();
        return { success: true, accepted: true, confirmed: false, message: 'Sonata: ' + direction };
      }
    }

    var vibeFallback = ymFindVibeSkipButton(null, direction);
    if (ymCanClick(vibeFallback)) {
      vibeFallback.click();
      return { success: true, accepted: true, confirmed: false, message: 'Vibe: ' + direction };
    }

    return { success: false, message: 'Кнопка ' + direction + ' не найдена' };
  } catch (err) {
    return {
      success: false,
      message: 'Ошибка при поиске кнопки: ' + err.message,
      error: err.toString()
    };
  }
}
`;
