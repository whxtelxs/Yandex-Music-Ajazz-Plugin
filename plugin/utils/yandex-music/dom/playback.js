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
    return root.querySelector('button[aria-label="Предыдущая песня"]')
      || (function() {
        var icon = root.querySelector('use[href*="previous_xs"], use[xlink\\:href*="previous_xs"]');
        return icon ? icon.closest('button') : null;
      })();
  }

  if (direction === 'next') {
    return root.querySelector('button[aria-label="Следующая песня"]')
      || (function() {
        var icon = root.querySelector('use[href*="next_xs"], use[xlink\\:href*="next_xs"]');
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
  if (document.querySelector("button.BaseSonataControlsDesktop_sonataButton__GbwFt[data-test-id='PAUSE_BUTTON']")) {
    return true;
  }
  if (document.querySelector("button.BaseSonataControlsDesktop_sonataButton__GbwFt[data-test-id='PLAY_BUTTON']")) {
    return false;
  }
  if (document.querySelector("svg.BaseSonataControlsDesktop_playButtonIcon__TlFqv use[xlink\\:href='/icons/sprite.svg#pause_filled_l'], svg.BaseSonataControlsDesktop_playButtonIcon__TlFqv use[href='/icons/sprite.svg#pause_filled_l']")) {
    return true;
  }
  if (document.querySelector("svg.BaseSonataControlsDesktop_playButtonIcon__TlFqv use[xlink\\:href='/icons/sprite.svg#play_filled_l'], svg.BaseSonataControlsDesktop_playButtonIcon__TlFqv use[href='/icons/sprite.svg#play_filled_l']")) {
    return false;
  }

  return null;
}

function ymDetectPlaybackIsPlaying() {
  if (ymIsVibePageActive()) {
    var vibeState = ymDetectVibePlaybackIsPlaying();
    if (vibeState !== null) return vibeState;
  }

  return ymDetectSonataPlaybackIsPlaying();
}

function ymToggleVibePlayback() {
  var vibePlayButton = ymFindVibePlayButton();
  if (!vibePlayButton) return null;

  var wasPlaying = ymDetectVibePlaybackIsPlaying();
  if (wasPlaying === null) wasPlaying = false;

  vibePlayButton.click();
  return {
    success: true,
    message: wasPlaying ? 'Vibe: трек поставлен на паузу' : 'Vibe: трек запущен',
    wasPlaying: wasPlaying
  };
}

function ymToggleSonataPlayback() {
  var pauseButton = document.querySelector("button.BaseSonataControlsDesktop_sonataButton__GbwFt[data-test-id='PAUSE_BUTTON']");
  if (pauseButton) {
    pauseButton.click();
    return { success: true, message: 'Трек поставлен на паузу', wasPlaying: true };
  }

  var playButton = document.querySelector("button.BaseSonataControlsDesktop_sonataButton__GbwFt[data-test-id='PLAY_BUTTON']");
  if (playButton && !playButton.classList.contains('PlayButtonWithCover_playButton__rV9pQ')) {
    playButton.click();
    return { success: true, message: 'Трек запущен', wasPlaying: false };
  }

  var pauseSvgL = document.querySelector("svg.BaseSonataControlsDesktop_playButtonIcon__TlFqv use[xlink\\:href='/icons/sprite.svg#pause_filled_l'], svg.BaseSonataControlsDesktop_playButtonIcon__TlFqv use[href='/icons/sprite.svg#pause_filled_l']");
  if (pauseSvgL) {
    var pauseBtn = pauseSvgL.closest('button');
    if (pauseBtn) {
      pauseBtn.click();
      return { success: true, message: 'Трек поставлен на паузу', wasPlaying: true };
    }
  }

  var playSvgL = document.querySelector("svg.BaseSonataControlsDesktop_playButtonIcon__TlFqv use[xlink\\:href='/icons/sprite.svg#play_filled_l'], svg.BaseSonataControlsDesktop_playButtonIcon__TlFqv use[href='/icons/sprite.svg#play_filled_l']");
  if (playSvgL) {
    var playBtn = playSvgL.closest('button');
    if (playBtn) {
      playBtn.click();
      return { success: true, message: 'Трек запущен', wasPlaying: false };
    }
  }

  var sonataButtons = document.querySelectorAll('.BaseSonataControlsDesktop_sonataButtons__7vLtw button');
  if (sonataButtons.length >= 3) {
    sonataButtons[1].click();
    return { success: true, message: 'Действие с треком выполнено через среднюю кнопку', wasPlaying: null };
  }

  return null;
}

function ymTogglePlayback() {
  try {
    if (ymIsVibePageActive()) {
      var vibeResult = ymToggleVibePlayback();
      if (vibeResult) return vibeResult;
    }

    var sonataResult = ymToggleSonataPlayback();
    if (sonataResult) return sonataResult;

    var vibeFallback = ymToggleVibePlayback();
    if (vibeFallback) return vibeFallback;

    return { success: false, message: 'Не удалось найти кнопку воспроизведения или паузы' };
  } catch (err) {
    return {
      success: false,
      message: 'Ошибка при определении состояния воспроизведения: ' + err.message,
      error: err.toString()
    };
  }
}

function ymClickTrackControl(direction) {
  try {
    if (ymIsVibePageActive()) {
      var vibeButton = ymFindVibeSkipButton(null, direction);
      if (vibeButton) {
        vibeButton.click();
        return { success: true, message: 'Vibe: ' + direction };
      }
    }

    var playerBar = ymFindSonataPlayerBar();
    if (playerBar) {
      var testId = direction === 'previous' ? 'PREVIOUS_TRACK_BUTTON' : 'NEXT_TRACK_BUTTON';
      var sonataButton = playerBar.querySelector("[data-test-id='" + testId + "']");
      if (sonataButton) {
        sonataButton.click();
        return { success: true, message: 'Sonata: ' + direction };
      }
    }

    var vibeFallback = ymFindVibeSkipButton(null, direction);
    if (vibeFallback) {
      vibeFallback.click();
      return { success: true, message: 'Vibe: ' + direction };
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
