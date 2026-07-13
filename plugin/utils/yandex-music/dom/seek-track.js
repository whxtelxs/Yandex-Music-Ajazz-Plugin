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

function ymAlbumUrlFromCoverUrl(coverUrl) {
  if (!coverUrl) return '';
  var match = String(coverUrl).match(/\\.a\\.(\\d+)(?:-\\d+)?(?:\\/|$)/);
  if (!match) return '';
  var origin = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.indexOf('yandex.') !== -1)
    ? window.location.origin
    : 'https://music.yandex.ru';
  return origin + '/album/' + match[1];
}

function ymHrefHasAlbum(href) {
  return String(href || '').toLowerCase().indexOf('album') !== -1;
}

function ymNormalizeMusicUrl(href, requireTrack) {
  if (!href) return '';
  var raw = String(href).trim();
  if (!raw) return '';
  if (raw.indexOf('//') === 0) raw = 'https:' + raw;
  if (raw.indexOf('/') === 0) {
    var origin = (typeof window !== 'undefined' && window.location && window.location.origin && window.location.origin.indexOf('yandex.') !== -1)
      ? window.location.origin
      : 'https://music.yandex.ru';
    raw = origin + raw;
  }
  if (raw.indexOf('http://') !== 0 && raw.indexOf('https://') !== 0) return '';
  if (raw.indexOf('yandex.') === -1) return '';
  try {
    var parsed = new URL(raw);
    var base = parsed.origin;
    var albumId = parsed.searchParams.get('albumId');
    var trackId = parsed.searchParams.get('trackId');
    if (albumId && trackId) {
      return base + '/album/' + albumId + '/track/' + trackId;
    }
    if (albumId && !requireTrack) {
      return base + '/album/' + albumId;
    }
    var path = (parsed.pathname || '').replace(/\\/+$/, '');
    var trackMatch = path.match(/\\/album\\/(\\d+)\\/track\\/(\\d+)$/i);
    if (trackMatch) {
      return base + '/album/' + trackMatch[1] + '/track/' + trackMatch[2];
    }
    var albumMatch = path.match(/\\/album\\/(\\d+)$/i);
    if (albumMatch) {
      if (requireTrack) return '';
      return base + '/album/' + albumMatch[1];
    }
  } catch (err) {
    return '';
  }
  return '';
}

function ymExtractMusicUrlFromNode(node, requireTrack) {
  if (!node) return '';
  if (node.matches && node.matches('a') && ymHrefHasAlbum(node.getAttribute('href') || node.href || '')) {
    return ymNormalizeMusicUrl(node.getAttribute('href') || node.href || '', requireTrack);
  }
  if (node.closest) {
    var link = node.closest('a[class*="AlbumCover_link"], a[class*="Meta_albumLink"], a[href*="album"]');
    if (link) return ymNormalizeMusicUrl(link.getAttribute('href') || link.href || '', requireTrack);
  }
  return '';
}

function ymExtractCoverUrlFromNode(node) {
  if (!node) return '';
  var tag = String(node.tagName || '').toUpperCase();
  if (tag === 'IMG') {
    return node.currentSrc || node.src || '';
  }
  if (node.querySelector) {
    var img = node.querySelector('img[src], img[srcset], source[srcset]');
    if (img) {
      if (img.currentSrc) return img.currentSrc;
      if (img.src) return img.src;
      var srcset = img.getAttribute('srcset') || '';
      if (srcset) return srcset.split(',')[0].trim().split(/\s+/)[0];
    }
  }
  var style = node.style && node.style.backgroundImage;
  if ((!style || style === 'none') && typeof window !== 'undefined' && window.getComputedStyle) {
    try {
      style = window.getComputedStyle(node).backgroundImage;
    } catch (err) {}
  }
  if (style && style !== 'none') {
    var match = String(style).match(/url\\(["']?(.*?)["']?\\)/);
    if (match && match[1]) return match[1];
  }
  return '';
}

function ymFindVibeCoverImage() {
  var candidates = [
    ymQueryDeep('a[class*="AlbumCover_link"]'),
    ymQueryDeep('[class*="VibePlayerBar_root"] [class*="AlbumCover_cover"]'),
    ymQueryDeep('[class*="VibePlayerBar_root"] [class*="AlbumCover_root"]'),
    ymQueryDeep('[class*="AlbumCover_cover"]'),
    ymQueryDeep('[class*="AlbumCover_root"]'),
    ymQueryDeep('[class*="VibePlayerBar_root"] img')
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i]) return candidates[i];
  }
  return null;
}

function ymResolveVibeCoverUrl() {
  var candidates = [
    ymQueryDeep('a[class*="AlbumCover_link"]'),
    ymQueryDeep('[class*="VibePlayerBar_root"] [class*="AlbumCover_cover"]'),
    ymQueryDeep('[class*="VibePlayerBar_root"] [class*="AlbumCover_root"]'),
    ymQueryDeep('[class*="AlbumCover_cover"]'),
    ymQueryDeep('[class*="AlbumCover_root"]'),
    ymQueryDeep('[class*="VibePlayerBar_root"] img')
  ];
  for (var i = 0; i < candidates.length; i++) {
    var url = ymExtractCoverUrlFromNode(candidates[i]);
    if (url) return url;
  }
  return '';
}

function ymFindVibeAlbumUrl(coverUrl) {
  var vibeRoot = ymQueryDeep('[class*="VibePlayerBar_root"]') || ymQueryDeep('[class*="AlbumCover_root"]');
  var scopes = [];
  if (vibeRoot) scopes.push(vibeRoot);
  scopes.push(document);
  var selectors = [
    'a[class*="AlbumCover_link"]',
    'a[href*="albumId="]',
    'a[href*="album"]'
  ];
  for (var r = 0; r < scopes.length; r++) {
    for (var s = 0; s < selectors.length; s++) {
      var link = ymQueryDeep(selectors[s], scopes[r]);
      if (!link) continue;
      var url = ymNormalizeMusicUrl(link.getAttribute('href') || link.href || '', false);
      if (url) return url;
    }
  }
  var coverNode = ymFindVibeCoverImage();
  var fromCoverNode = ymExtractMusicUrlFromNode(coverNode, false);
  if (fromCoverNode) return fromCoverNode;
  return ymAlbumUrlFromCoverUrl(coverUrl) || ymFindMusicUrlDeep(false);
}

function ymFindMusicUrlDeep(requireTrack) {
  var links = ymCollectDeepLinks(document);
  var best = '';
  var bestScore = -1;
  for (var i = 0; i < links.length; i++) {
    var link = links[i];
    var href = link.getAttribute('href') || link.href || '';
    if (!ymHrefHasAlbum(href)) continue;
    var url = ymNormalizeMusicUrl(href, requireTrack);
    if (!url) continue;
    var className = String(link.className || '');
    var aria = link.getAttribute('aria-label') || '';
    var score = 0;
    if (className.indexOf('Meta_albumLink') !== -1) score += 100;
    if (className.indexOf('AlbumCover_link') !== -1) score += 90;
    if (aria.indexOf('Трек') === 0) score += 80;
    if (link.closest && link.closest('[class*="PlayerBarDesktopWithBackgroundProgressBar"]')) score += 70;
    if (link.closest && link.closest('[class*="VibePlayerBar_root"]')) score += 60;
    if (link.closest && link.closest('[class*="AlbumCover_root"]')) score += 50;
    if (href.indexOf('/track/') !== -1 || href.indexOf('trackId=') !== -1) score += 40;
    if (score > bestScore) {
      bestScore = score;
      best = url;
    }
  }
  return best;
}

function ymFindSonataTrackUrl(playerBar) {
  var directLink = playerBar ? playerBar.querySelector('a[class*="Meta_albumLink"]') : null;
  if (directLink) {
    var directUrl = ymNormalizeMusicUrl(directLink.getAttribute('href') || directLink.href || '', true);
    if (directUrl) return directUrl;
  }
  return ymFindMusicUrlDeep(true);
}

function ymResolveTrackPageUrl(coverUrl) {
  var sonataUrl = ymFindSonataTrackUrl(ymFindSonataPlayerBar());
  if (sonataUrl) return sonataUrl;
  var resolvedCover = coverUrl || ymResolveVibeCoverUrl();
  return ymFindVibeAlbumUrl(resolvedCover);
}

function ymDebugTrackUrlLookup(coverUrl) {
  var playerBar = ymFindSonataPlayerBar();
  var albumLink = playerBar ? playerBar.querySelector('a[class*="Meta_albumLink"]') : null;
  var vibeLink = ymQueryDeep('a[class*="AlbumCover_link"]') || ymQueryDeep('a[href*="albumId="]');
  var resolvedCover = coverUrl || ymResolveVibeCoverUrl();
  var links = ymCollectDeepLinks(document);
  var samples = [];
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute('href') || links[i].href || '';
    if (!ymHrefHasAlbum(href)) continue;
    samples.push({
      href: href,
      className: String(links[i].className || '').slice(0, 100),
      aria: links[i].getAttribute('aria-label') || '',
      track: ymNormalizeMusicUrl(href, true),
      album: ymNormalizeMusicUrl(href, false)
    });
    if (samples.length >= 10) break;
  }
  return {
    vibeActive: ymIsVibePageActive(),
    playerBarFound: !!playerBar,
    albumLinkHref: albumLink ? (albumLink.getAttribute('href') || albumLink.href || '') : '',
    vibeLinkHref: vibeLink ? (vibeLink.getAttribute('href') || vibeLink.href || '') : '',
    coverUrl: resolvedCover,
    coverAlbumUrl: ymAlbumUrlFromCoverUrl(resolvedCover),
    albumLinkCount: samples.length,
    albumLinkSamples: samples,
    resolvedTrack: ymFindMusicUrlDeep(true),
    resolvedAlbum: ymFindMusicUrlDeep(false),
    resolved: ymResolveTrackPageUrl(resolvedCover)
  };
}

function ymUpscaleCoverUrl(url) {
  if (!url) return url;
  if (url.includes('/100x100')) return url.replace('/100x100', '/400x400');
  if (url.includes('/200x200')) return url.replace('/200x200', '/400x400');
  return url;
}

function ymGetTrackInfo() {
  try {
    var playerBar = ymFindSonataPlayerBar();
    var coverImgSonata = playerBar
      ? (playerBar.querySelector('img[class*="PlayerBarDesktopWithBackgroundProgressBar_cover"]')
        || playerBar.querySelector('[data-test-id="PLAYERBAR_DESKTOP"] img'))
      : null;
    var titleElement = playerBar
      ? (playerBar.querySelector('a[class*="Meta_albumLink"] [class*="Meta_title"]')
        || playerBar.querySelector('a[class*="Meta_albumLink"]')
        || playerBar.querySelector('[class*="Meta_title"]')
        || playerBar.querySelector('[data-test-id="TRACK_TITLE"] [class*="Meta_title"]')
        || playerBar.querySelector('[data-test-id="TRACK_TITLE"] a')
        || playerBar.querySelector('[data-test-id="TRACK_TITLE"]'))
      : null;
    var artistElement = playerBar
      ? (playerBar.querySelector('[class*="Meta_artists"] a')
        || playerBar.querySelector('[data-test-id="SEPARATED_ARTIST_TITLE"] [class*="Meta_artist"]')
        || playerBar.querySelector('[data-test-id="SEPARATED_ARTIST_TITLE"] a')
        || playerBar.querySelector('[data-test-id="SEPARATED_ARTIST_TITLE"]'))
      : null;
    var titleSonata = titleElement ? (titleElement.textContent || '').trim() : '';
    var artistSonata = artistElement ? (artistElement.textContent || '').trim() : '';

    if (coverImgSonata && titleSonata) {
      var originalCoverUrlSonata = coverImgSonata.currentSrc || coverImgSonata.src || '';
      var trackUrlSonata = ymExtractMusicUrlFromNode(titleElement, true)
        || ymExtractMusicUrlFromNode(playerBar.querySelector('a[class*="Meta_albumLink"]'), true)
        || ymResolveTrackPageUrl(originalCoverUrlSonata);
      return {
        success: true,
        title: titleSonata,
        artist: artistSonata,
        coverUrl: ymUpscaleCoverUrl(originalCoverUrlSonata),
        originalCoverUrl: originalCoverUrlSonata,
        trackUrl: trackUrlSonata
      };
    }

    if (ymIsVibePageActive()) {
      var title = ymGetVibeTrackTitle();
      if (title) {
        var artist = ymGetVibeTrackArtist();
        var originalCoverUrl = ymResolveVibeCoverUrl();
        var trackUrl = ymFindVibeAlbumUrl(originalCoverUrl);
        return {
          success: true,
          title: title,
          artist: artist,
          coverUrl: ymUpscaleCoverUrl(originalCoverUrl),
          originalCoverUrl: originalCoverUrl,
          trackUrl: trackUrl
        };
      }
    }

    if (!playerBar) return { success: false, message: 'Не найдена нижняя панель плеера' };
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
