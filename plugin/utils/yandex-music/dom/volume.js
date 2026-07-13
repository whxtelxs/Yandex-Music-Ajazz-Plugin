'use strict';

module.exports = `
function ymFindVolumeRoot() {
  if (ymIsVibePageActive()) {
    var vibeBar = ymFindVibePlayerBar();
    if (vibeBar) {
      var vibeRoot = vibeBar.querySelector('[class*="ChangeVolume_root"]');
      if (vibeRoot) return vibeRoot;
    }
  }
  var sliderByTestId = document.querySelector('[data-test-id="VOLUME_SLIDER"]');
  if (sliderByTestId) {
    var rootFromSlider = sliderByTestId.closest('[class*="ChangeVolume_root"]');
    if (rootFromSlider) return rootFromSlider;
  }
  return document.querySelector('[class*="ChangeVolume_root"]');
}

function ymFindVolumeSlider() {
  var root = ymFindVolumeRoot();
  if (root) {
    var slider = root.querySelector('input[type="range"][aria-label="Управление громкостью"]')
      || root.querySelector('input[class*="ChangeVolume_slider"]')
      || root.querySelector('input[type="range"]');
    if (slider) return slider;
  }
  return document.querySelector('[data-test-id="VOLUME_SLIDER"]')
    || document.querySelector('input[class*="ChangeVolume_slider"]');
}

function ymFindMuteButton() {
  var root = ymFindVolumeRoot();
  if (root) {
    var btn = root.querySelector('[class*="ChangeVolume_button"]')
      || root.querySelector('button[aria-label="Выключить звук"], button[aria-label="Включить звук"]');
    if (btn) return btn;
  }
  return document.querySelector("button[class*='ChangeVolume_button'][data-test-id='CHANGE_VOLUME_BUTTON']")
    || document.querySelector('button[aria-label="Выключить звук"], button[aria-label="Включить звук"]');
}

function ymDetectMuteIsMuted() {
  var muteButton = ymFindMuteButton();
  if (muteButton) {
    if (muteButton.getAttribute('aria-label') === 'Включить звук') return true;
    var useEl = muteButton.querySelector('use');
    if (useEl) {
      var href = useEl.getAttribute('xlink:href') || useEl.getAttribute('href') || '';
      if (href.indexOf('volumeOff') !== -1) return true;
    }
    return false;
  }
  return null;
}

function ymToggleMute() {
  try {
    var muteButton = ymFindMuteButton();
    if (muteButton) {
      var wasMuted = muteButton.getAttribute('aria-label') === 'Включить звук';
      muteButton.click();
      return {
        success: true,
        message: wasMuted ? 'Звук включен' : 'Звук выключен',
        wasMuted: wasMuted
      };
    }
    return { success: false, message: 'Не удалось найти кнопку управления звуком' };
  } catch (err) {
    return { success: false, message: err.message, error: err.toString() };
  }
}

function ymGetVolume() {
  var volumeSlider = ymFindVolumeSlider();
  if (!volumeSlider) return { success: false, message: 'Слайдер громкости не найден' };
  var value = parseFloat(volumeSlider.value) || 0;
  var max = parseFloat(volumeSlider.max) || 1;
  return {
    success: true,
    volume: (value / max) * 100,
    rawValue: value,
    max: max
  };
}

function ymSetVolume(percent) {
  var volumeSlider = ymFindVolumeSlider();
  if (!volumeSlider) return { success: false, message: 'Слайдер громкости не найден' };
  var clampedPercent = Math.max(0, Math.min(100, percent));
  var max = parseFloat(volumeSlider.max) || 1;
  var newValue = (clampedPercent / 100) * max;
  ymSetRangeValue(volumeSlider, newValue);
  return {
    success: true,
    volume: clampedPercent,
    rawValue: newValue,
    actualValue: parseFloat(volumeSlider.value)
  };
}

function ymChangeVolume(delta) {
  var current = ymGetVolume();
  if (!current.success) return current;
  var result = ymSetVolume(current.volume + delta);
  if (result.success) {
    result.muted = result.volume <= 0;
  }
  return result;
}
`;
