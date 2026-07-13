'use strict';

module.exports = `
function ymFindVibeLikeButton() {
  var bar = ymFindVibePlayerBar();
  if (!bar) return null;
  return bar.querySelector('button[aria-label="Нравится"]')
    || (function() {
      var icon = bar.querySelector('use[href*="liked_xs"], use[xlink\\:href*="liked_xs"], use[href*="like_xs"], use[xlink\\:href*="like_xs"]');
      return icon ? icon.closest('button') : null;
    })();
}

function ymFindVibeDislikeButton() {
  var bar = ymFindVibePlayerBar();
  if (!bar) return null;
  return bar.querySelector('button[aria-label="Не нравится"]')
    || (function() {
      var icon = bar.querySelector('use[href*="dislike_xs"], use[xlink\\:href*="dislike_xs"]');
      return icon ? icon.closest('button') : null;
    })();
}

function ymFindSonataLikeButton() {
  var playerBar = ymFindSonataPlayerBar();
  if (!playerBar) return null;
  var likeButton = playerBar.querySelector("[data-test-id='LIKE_BUTTON']");
  if (likeButton) return likeButton;
  var sonataSection = playerBar.querySelector('.PlayerBarDesktopWithBackgroundProgressBar_sonata__mGFb_');
  if (sonataSection) return sonataSection.querySelector('button:last-of-type');
  return null;
}

function ymFindSonataDislikeButton() {
  var playerBar = ymFindSonataPlayerBar();
  if (!playerBar) return null;
  var dislikeButton = playerBar.querySelector("[data-test-id='DISLIKE_BUTTON']");
  if (dislikeButton) return dislikeButton;
  var sonataSection = playerBar.querySelector('.PlayerBarDesktopWithBackgroundProgressBar_sonata__mGFb_');
  if (sonataSection) return sonataSection.querySelector('button:first-of-type');
  return null;
}

function ymIsButtonLiked(button) {
  if (!button) return false;
  var isLiked = button.getAttribute('aria-pressed') === 'true';
  var useEl = button.querySelector('use');
  if (useEl) {
    var href = useEl.getAttribute('xlink:href') || useEl.getAttribute('href') || '';
    if (href.indexOf('liked') !== -1) isLiked = true;
  }
  return isLiked;
}

function ymDetectLikeIsLiked() {
  if (ymIsVibePageActive()) {
    var vibeLike = ymFindVibeLikeButton();
    if (vibeLike) return ymIsButtonLiked(vibeLike);
  }
  var sonataLike = ymFindSonataLikeButton();
  if (sonataLike) return ymIsButtonLiked(sonataLike);
  return null;
}

function ymClickLike() {
  try {
    if (ymIsVibePageActive()) {
      var vibeLike = ymFindVibeLikeButton();
      if (vibeLike) {
        var vibeWasLiked = ymIsButtonLiked(vibeLike);
        vibeLike.click();
        return { success: true, message: 'Vibe: лайк', liked: !vibeWasLiked };
      }
    }
    var sonataLike = ymFindSonataLikeButton();
    if (sonataLike) {
      var sonataWasLiked = ymIsButtonLiked(sonataLike);
      sonataLike.click();
      return { success: true, message: 'Sonata: лайк', liked: !sonataWasLiked };
    }
    var vibeFallback = ymFindVibeLikeButton();
    if (vibeFallback) {
      var fallbackWasLiked = ymIsButtonLiked(vibeFallback);
      vibeFallback.click();
      return { success: true, message: 'Vibe: лайк', liked: !fallbackWasLiked };
    }
    return { success: false, message: 'Кнопка лайка не найдена' };
  } catch (err) {
    return { success: false, message: err.message, error: err.toString() };
  }
}

function ymClickDislike() {
  try {
    if (ymIsVibePageActive()) {
      var vibeDislike = ymFindVibeDislikeButton();
      if (vibeDislike) {
        vibeDislike.click();
        return { success: true, message: 'Vibe: дизлайк' };
      }
    }
    var sonataDislike = ymFindSonataDislikeButton();
    if (sonataDislike) {
      sonataDislike.click();
      return { success: true, message: 'Sonata: дизлайк' };
    }
    var vibeFallback = ymFindVibeDislikeButton();
    if (vibeFallback) {
      vibeFallback.click();
      return { success: true, message: 'Vibe: дизлайк' };
    }
    return { success: false, message: 'Кнопка дизлайка не найдена' };
  } catch (err) {
    return { success: false, message: err.message, error: err.toString() };
  }
}
`;
