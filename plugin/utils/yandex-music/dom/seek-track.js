'use strict';

module.exports = `
function ymFindSeekSlider() {
  if (ymIsVibePageActive()) {
    var vibeSlider = document.querySelector('input[aria-label="Управление таймкодом"]')
      || document.querySelector('[class*="VibePlayerbarMeta_slider"]');
    if (vibeSlider) return vibeSlider;
  }
  return document.querySelector('[data-test-id="TIMECODE_SLIDER"]');
}

function ymParseTimecodeOverlay(text) {
  if (!text) return null;
  var parts = text.split('/').map(function(s) { return s.trim(); });
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { currentTime: parts[0], totalTime: parts[1] };
}

function ymGetTrackTime() {
  try {
    if (ymIsVibePageActive()) {
      var timeOverlay = document.querySelector('[class*="VibePlayerbarMeta_timecodeOverlay"]');
      var slider = ymFindSeekSlider();
      if (timeOverlay) {
        var parsed = ymParseTimecodeOverlay(timeOverlay.textContent);
        if (parsed) {
          var progressValue = slider ? parseFloat(slider.value) || 0 : 0;
          var progressMax = slider ? parseFloat(slider.max) || 100 : 100;
          return {
            success: true,
            currentTime: parsed.currentTime,
            totalTime: parsed.totalTime,
            progressValue: progressValue,
            progressMax: progressMax,
            progressPercent: progressMax ? (progressValue / progressMax) * 100 : 0
          };
        }
      }
    }

    var playerBar = ymFindSonataPlayerBar();
    if (!playerBar) return { success: false, message: 'Не найдена нижняя панель плеера' };

    var currentTimeElement = playerBar.querySelector('[data-test-id="TIMECODE_TIME_START"]');
    var totalTimeElement = playerBar.querySelector('[data-test-id="TIMECODE_TIME_END"]');
    var progressSlider = playerBar.querySelector('[data-test-id="TIMECODE_SLIDER"]') || ymFindSeekSlider();

    if (currentTimeElement && totalTimeElement && progressSlider) {
      var progressValueSonata = parseFloat(progressSlider.value) || 0;
      var progressMaxSonata = parseFloat(progressSlider.max) || 100;
      return {
        success: true,
        currentTime: currentTimeElement.textContent.trim(),
        totalTime: totalTimeElement.textContent.trim(),
        progressValue: progressValueSonata,
        progressMax: progressMaxSonata,
        progressPercent: (progressValueSonata / progressMaxSonata) * 100
      };
    }

    return { success: false, message: 'Не удалось найти элементы времени трека' };
  } catch (err) {
    return { success: false, message: err.message, error: err.toString() };
  }
}

function ymUpscaleCoverUrl(url) {
  if (!url) return url;
  if (url.includes('/100x100')) return url.replace('/100x100', '/400x400');
  if (url.includes('/200x200')) return url.replace('/200x200', '/400x400');
  return url;
}

function ymGetTrackInfo() {
  try {
    if (ymIsVibePageActive()) {
      var title = ymGetVibeTrackTitle();
      if (title) {
        var artist = ymGetVibeTrackArtist();
        var coverImg = document.querySelector('[class*="AlbumCover_cover"] img, [class*="AlbumCover_root"] img');
        var originalCoverUrl = coverImg ? (coverImg.currentSrc || coverImg.src || '') : '';
        return {
          success: true,
          title: title,
          artist: artist,
          coverUrl: ymUpscaleCoverUrl(originalCoverUrl),
          originalCoverUrl: originalCoverUrl
        };
      }
    }

    var playerBar = ymFindSonataPlayerBar();
    if (!playerBar) return { success: false, message: 'Не найдена нижняя панель плеера' };

    var coverImgSonata = playerBar.querySelector('img[class*="PlayerBarDesktopWithBackgroundProgressBar_cover"]')
      || playerBar.querySelector('[data-test-id="PLAYERBAR_DESKTOP"] img');
    var titleElement = playerBar.querySelector('[data-test-id="TRACK_TITLE"] [class*="Meta_title"]')
      || playerBar.querySelector('[data-test-id="TRACK_TITLE"] a')
      || playerBar.querySelector('[data-test-id="TRACK_TITLE"]');
    var artistElement = playerBar.querySelector('[data-test-id="SEPARATED_ARTIST_TITLE"] [class*="Meta_artist"]')
      || playerBar.querySelector('[data-test-id="SEPARATED_ARTIST_TITLE"] a')
      || playerBar.querySelector('[data-test-id="SEPARATED_ARTIST_TITLE"]');

    var titleSonata = titleElement ? (titleElement.textContent || '').trim() : '';
    var artistSonata = artistElement ? (artistElement.textContent || '').trim() : '';

    if (coverImgSonata && titleSonata) {
      var originalCoverUrlSonata = coverImgSonata.currentSrc || coverImgSonata.src || '';
      return {
        success: true,
        title: titleSonata,
        artist: artistSonata,
        coverUrl: ymUpscaleCoverUrl(originalCoverUrlSonata),
        originalCoverUrl: originalCoverUrlSonata
      };
    }

    return { success: false, message: 'Не удалось найти информацию о треке' };
  } catch (err) {
    return { success: false, message: err.message, error: err.toString() };
  }
}

function ymSeekTo(position) {
  try {
    var progressSlider = ymFindSeekSlider();
    if (!progressSlider) return { success: false, message: 'Прогресс-бар не найден' };
    var maxValue = parseFloat(progressSlider.max) || 100;
    var newValue = Math.max(0, Math.min(maxValue, position));
    ymSetRangeValue(progressSlider, newValue);
    return { success: true, position: newValue, max: maxValue };
  } catch (err) {
    return { success: false, message: err.message, error: err.toString() };
  }
}

function ymSeekRelative(deltaSeconds) {
  try {
    var progressSlider = ymFindSeekSlider();
    if (!progressSlider) return { success: false, message: 'Прогресс-бар не найден' };
    var currentValue = parseFloat(progressSlider.value) || 0;
    var maxValue = parseFloat(progressSlider.max) || 100;
    var newValue = Math.max(0, Math.min(maxValue, currentValue + deltaSeconds));
    ymSetRangeValue(progressSlider, newValue);
    return {
      success: true,
      oldPosition: currentValue,
      newPosition: newValue,
      max: maxValue,
      delta: deltaSeconds
    };
  } catch (err) {
    return { success: false, message: err.message, error: err.toString() };
  }
}
`;
