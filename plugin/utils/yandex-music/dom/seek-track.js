'use strict';

module.exports = `
function ymFindSeekSlider() {
  if (ymIsVibePageActive()) {
    var vibeSlider = ymQueryDeep('input[aria-label="Управление таймкодом"]')
      || ymQueryDeep('[class*="VibePlayerbarMeta_slider"]');
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

function ymReadAudioTime() {
  try {
    var audioElements = document.querySelectorAll('audio');
    var audio = null;
    for (var i = 0; i < audioElements.length; i++) {
      var item = audioElements[i];
      if (!item.paused && !item.ended && Number.isFinite(item.duration) && item.duration > 0) {
        audio = item;
        break;
      }
      if (!audio && Number.isFinite(item.duration) && item.duration > 0) audio = item;
    }
    if (!audio) audio = ymQueryDeep('audio') || ymQueryDeep('video');
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return null;
    var duration = audio.duration;
    var position = Number.isFinite(audio.currentTime) ? Math.max(0, Math.min(duration, audio.currentTime)) : 0;
    function format(seconds) {
      var total = Math.floor(seconds);
      return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
    }
    return {
      success: true,
      currentTime: format(position), totalTime: format(duration),
      progressValue: position, progressMax: duration,
      progressPercent: position / duration * 100
    };
  } catch (err) { return null; }
}


function ymReadVisibleTrackTime() {
  try {
    var current = ymQueryDeep('[data-test-id="TIMECODE_TIME_START"]')
      || ymQueryDeep('[class*="Timecode_timeStart"]')
      || ymQueryDeep('[class*="Timecode_currentTime"]');
    var total = ymQueryDeep('[data-test-id="TIMECODE_TIME_END"]')
      || ymQueryDeep('[class*="Timecode_timeEnd"]')
      || ymQueryDeep('[class*="Timecode_totalTime"]');
    var slider = ymFindSeekSlider();
    var rawCurrent = current ? String(current.textContent || '').trim() : '';
    var rawTotal = total ? String(total.textContent || '').trim() : '';
    if (!rawCurrent || !rawTotal) return null;
    var parse = function(str) {
      if (!/^\\d{1,3}:\\d{2}(?::\\d{2})?$/.test(str)) return null;
      return str.split(':').reduce(function(acc, part) { return 60 * acc + Number(part); }, 0);
    };
    var time = parse(rawCurrent);
    var duration = parse(rawTotal);
    if (time === null || duration === null || duration <= 0) return null;
    var value = slider ? Number(slider.value) : NaN;
    var max = slider ? Number(slider.max) : NaN;
    if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) {
      value = time;
      max = duration;
    }
    return {
      success: true, currentTime: rawCurrent, totalTime: rawTotal,
      progressValue: value, progressMax: max,
      progressPercent: value / max * 100
    };
  } catch (ignored) { return null; }
}

function ymGetTrackTime() {
  try {
    if (ymIsVibePageActive()) {
      var timeOverlay = ymQueryDeep('[class*="VibePlayerbarMeta_timecodeOverlay"]');
      var slider = ymFindSeekSlider();
      if (timeOverlay) {
        var parsed = ymParseTimecodeOverlay(timeOverlay.textContent);
        if (parsed) {
          var progressValue = slider ? Number(slider.value) : null;
          var progressMax = slider ? Number(slider.max) : null;
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

    var visibleTime = ymReadVisibleTrackTime();
    if (visibleTime) return visibleTime;
    var audioTime = ymReadAudioTime();
    if (audioTime) return audioTime;
    var mediaTime = ymReadMediaPosition();
    if (mediaTime) return mediaTime;

    var playerBar = ymFindSonataPlayerBar();
    if (!playerBar) return {
      success: false,
      message: 'Данные о времени пока недоступны',
      transient: ymIsVibePageActive()
    };

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

    return ymReadAudioTime() || { success: false, message: 'Не удалось найти элементы времени трека' };
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
    if (!/^music\\.yandex\\.(ru|com|by|kz|uz)$/.test(parsed.hostname)) return '';
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
      if (srcset) return srcset.split(',')[0].trim().split(/\\s+/)[0];
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
    ymQueryDeep('[class*="VibePlayerBar_root"] a[class*="AlbumCover_link"]'),
    ymQueryDeep('[class*="VibePlayerBar_root"] [class*="AlbumCover_cover"]'),
    ymQueryDeep('[class*="VibePlayerBar_root"] [class*="AlbumCover_root"]'),
    ymQueryDeep('[class*="VibePlayerBar_root"] img'),
    ymQueryDeep('[class*="VibePage_root"] [class*="AlbumCover_cover"]'),
    ymQueryDeep('[class*="VibePage_root"] img[class*="AlbumCover"]'),
    ymQueryDeep('[class*="VibePlayerbarMeta_root"] img')
  ];
  for (var i = 0; i < candidates.length; i++) {
    if (candidates[i]) return candidates[i];
  }
  return null;
}

function ymResolveVibeCoverUrl() {
  var candidates = [
    ymQueryDeep('[class*="VibePlayerBar_root"] a[class*="AlbumCover_link"]'),
    ymQueryDeep('[class*="VibePlayerBar_root"] [class*="AlbumCover_cover"]'),
    ymQueryDeep('[class*="VibePlayerBar_root"] [class*="AlbumCover_root"]'),
    ymQueryDeep('[class*="VibePlayerBar_root"] img'),
    ymQueryDeep('[class*="VibePage_root"] [class*="AlbumCover_cover"]'),
    ymQueryDeep('[class*="VibePage_root"] img[class*="AlbumCover"]'),
    ymQueryDeep('[class*="VibePlayerbarMeta_root"] img')
  ];
  for (var i = 0; i < candidates.length; i++) {
    var url = ymExtractCoverUrlFromNode(candidates[i]);
    if (url) return url;
  }
  var media = ymReadMediaSessionTrack();
  return media ? media.coverUrl : '';
}

function ymFindVibeAlbumUrl(coverUrl) {
  var vibeRoot = ymQueryDeep('[class*="VibePlayerBar_root"]');
  var scopes = [];
  if (vibeRoot) scopes.push(vibeRoot);

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
  var scope = ymIsVibePageActive() ? ymFindVibePlayerBar() : ymFindSonataPlayerBar();
  if (!scope) return '';
  var links = ymCollectDeepLinks(scope);
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


function ymNormalizeTrackName(text) {
  return String(text || '').trim().toLocaleLowerCase().replace(/\\s+/g, ' ');
}

function ymGetVibeTrackUrlFromNodes() {
  var meta = ymQueryDeep('[class*="VibePage_entityMeta"], [class*="VibePlayerbarMeta_root"]')
    || ymFindVibeMetadataRoot();
  if (!meta) return '';
  var title = ymNormalizeTrackName(ymGetVibeTrackTitle());
  if (!title) return '';
  var links = ymCollectDeepLinks(meta);
  var matching = [];
  for (var i = 0; i < links.length; i++) {
    // Do not copy a link to an unrelated recommendation on the Vibe page.
    var url = ymNormalizeMusicUrl(links[i].getAttribute('href') || links[i].href || '', true);
    if (!url) continue;
    var label = ymNormalizeTrackName(links[i].getAttribute('aria-label') || links[i].textContent);
    if (label === title || label.indexOf(title + ' ') === 0) return url;
    matching.push(url);
  }
  // A single link inside the track metadata (not the entire page) is unambiguous.
  var className = String(meta.className || '');
  if (matching.length === 1 && (/VibePage_entityMeta|VibePlayerbarMeta_root/.test(className))) {
    return matching[0];
  }
  return '';
}

function ymFindVibeReactTrackUrl(title, artist) {
  var root = ymFindVibeMetadataRoot();
  if (!root || !title) return '';
  var nodes = [root];
  var titleNode = ymQueryDeep('[class*="VibePage_trackNameText"], [class*="VibePlayerbarMeta_trackNameText"]', root);
  if (titleNode) nodes.unshift(titleNode);
  var expected = ymNormalizeTrackName(title);
  var expectedArtist = ymNormalizeTrackName(artist);
  for (var i = 0; i < nodes.length; i++) {
    var node = nodes[i];
    for (var parent = 0; node && parent < 5; node = node.parentElement, parent++) {
      var keys = Object.keys(node);
      for (var k = 0; k < keys.length; k++) {
        if (!/^__react(?:Props|Fiber)\\$/.test(keys[k])) continue;
        var queue = [{ object: node[keys[k]], depth: 0 }];
        var seen = new Set();
        var budget = 0;
        while (queue.length && budget++ < 750) {
          var next = queue.shift();
          var obj = next.object;
          if (!obj || typeof obj !== 'object' || seen.has(obj)) continue;
          seen.add(obj);
          var name = obj.title || obj.trackTitle;
          var album = obj.albumId || obj.album_id;
          if (!album && Array.isArray(obj.albums) && obj.albums[0]) album = obj.albums[0].id;
          if (!album && obj.album && typeof obj.album === 'object') album = obj.album.id;
          var trackId = obj.trackId || obj.realId || obj.track_id;
          if (!trackId && name && album) trackId = obj.id;
          if (ymNormalizeTrackName(name) === expected && /^\\d+$/.test(String(trackId || ''))
              && /^\\d+$/.test(String(album || ''))) {
            var artists = Array.isArray(obj.artists) ? obj.artists.map(function(a) { return a.name || a.title || ''; }).join(', ') : '';
            if (!expectedArtist || !artists || ymNormalizeTrackName(artists).indexOf(expectedArtist) !== -1
                || expectedArtist.indexOf(ymNormalizeTrackName(artists)) !== -1) {
              return ymNormalizeMusicUrl('/album/' + album + '/track/' + trackId, true);
            }
          }
          if (next.depth >= 5) continue;
          var own = Object.keys(obj);
          for (var j = 0; j < own.length && j < 60; j++) {
            var key = own[j];
            if (key === 'children' || key === '_owner' || key === 'stateNode'
                || key === 'alternate' || key === 'return' || key === 'child' || key === 'sibling') continue;
            var value = obj[key];
            if (value && typeof value === 'object') queue.push({ object: value, depth: next.depth + 1 });
          }
        }
      }
    }
  }
  return '';
}

async function ymLookupCurrentTrackUrl() {
  var before = ymGetTrackInfo();
  if (!before.success || !before.title) return { success: false, reason: 'no-track' };
  var link = ymNormalizeMusicUrl(before.trackUrl, true);
  if (!link && ymIsVibePageActive()) {
    link = ymGetVibeTrackUrlFromNodes() || ymFindVibeReactTrackUrl(before.title, before.artist);
  }
  if (!link && ymIsVibePageActive()) {
    // Read-only catalog search. It is run only when the user presses Copy Link.
    // Never copy an arbitrary search result: title and artist must match.
    try {
      var query = (before.artist ? before.artist + ' ' : '') + before.title;
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var stop = controller ? setTimeout(function() { controller.abort(); }, 2200) : null;
      var response;
      try {
        response = await fetch('https://api.music.yandex.net/search?type=track&page=0&text='
          + encodeURIComponent(query), controller ? { signal: controller.signal } : {});
      } finally { if (stop) clearTimeout(stop); }
      if (response && response.ok) {
        var result = await response.json();
        var catalog = result.result || result;
        var section = catalog && catalog.tracks;
        var tracks = section && (section.results || section.items) || [];
        var matches = [];
        for (var n = 0; n < tracks.length && n < 20; n++) {
          var item = tracks[n];
          if (!item || ymNormalizeTrackName(item.title) !== ymNormalizeTrackName(before.title)) continue;
          var art = Array.isArray(item.artists) ? item.artists.map(function(a) { return a.name || ''; }) : [];
          var wanted = ymNormalizeTrackName(before.artist);
          if (wanted && !art.some(function(a) { return wanted.indexOf(ymNormalizeTrackName(a)) !== -1
              || ymNormalizeTrackName(a).indexOf(wanted) !== -1; })) continue;
          var albums = Array.isArray(item.albums) ? item.albums : [];
          if (!albums.length || !/^\\d+$/.test(String(item.id || '')) || !/^\\d+$/.test(String(albums[0].id || ''))) continue;
          var candidate = ymNormalizeMusicUrl('/album/' + albums[0].id + '/track/' + item.id, true);
          if (candidate && matches.indexOf(candidate) < 0) matches.push(candidate);
        }
        // Multiple editions of the same song are ambiguous unless the cover identifies its album.
        if (matches.length === 1) link = matches[0];
        if (matches.length > 1) {
          var expectedAlbum = ymAlbumUrlFromCoverUrl(before.coverUrl);
          var albumId = String(expectedAlbum).match(/\\/album\\/(\\d+)$/);
          if (albumId) link = matches.find(function(url) { return url.indexOf('/album/' + albumId[1] + '/track/') !== -1; }) || '';
        }
      }
    } catch (ignored) {}
  }
  var after = ymGetTrackInfo();
  if (!after.success || ymNormalizeTrackName(after.title) !== ymNormalizeTrackName(before.title)
      || ymNormalizeTrackName(after.artist) !== ymNormalizeTrackName(before.artist)) {
    return { success: false, reason: 'track-changed' };
  }
  return { success: !!link, trackUrl: link || '', title: before.title, artist: before.artist };
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
    if (ymIsVibePageActive()) {
      var title = ymGetVibeTrackTitle();
      if (title) {
        var mediaVibe = ymReadMediaSessionTrack();
        if (mediaVibe && mediaVibe.title !== title) mediaVibe = null;
        var artist = ymGetVibeTrackArtist() || (mediaVibe ? mediaVibe.artist : '');
        var originalCoverUrl = ymResolveVibeCoverUrl() || (mediaVibe ? mediaVibe.coverUrl : '');
        var trackUrl = ymGetVibeTrackUrlFromNodes();
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
    var artistLinks = playerBar ? playerBar.querySelectorAll('[class*="Meta_artists"] a, [data-test-id="SEPARATED_ARTIST_TITLE"] a') : [];
    var artistNames = [];
    for (var ai = 0; ai < artistLinks.length; ai++) artistNames.push(ymParseArtistLink(artistLinks[ai]));
    var artistSonata = ymUniqueNonEmpty(artistNames).join(', ') || (artistElement ? (artistElement.textContent || '').trim() : '');

    if (titleSonata) {
      var originalCoverUrlSonata = coverImgSonata ? (coverImgSonata.currentSrc || coverImgSonata.src || '') : '';
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

    // Media Session is the current track even without Yandex's desktop player bar.
    var media = ymReadMediaSessionTrack();
    if (media) {
      return {
        success: true,
        title: media.title, artist: media.artist,
        coverUrl: ymUpscaleCoverUrl(media.coverUrl),
        originalCoverUrl: media.coverUrl,
        trackUrl: ''
      };
    }
    if (!playerBar) return {
      success: false, message: 'Метаданные трека пока недоступны',
      transient: ymIsVibePageActive()
    };
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
    if (!ymCanClick(progressSlider)) return { success: false, message: 'Перемотка недоступна' };
    var time = ymGetTrackTime();
    var parts = String(time.totalTime || '').split(':');
    var duration = parts.reduce(function(total, part) { return total * 60 + Number(part); }, 0);
    if (!Number.isFinite(duration) || duration <= 0) return { success: false, message: 'Неизвестна длительность трека' };
    var newValue = Math.max(0, Math.min(maxValue, currentValue + deltaSeconds * maxValue / duration));
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
