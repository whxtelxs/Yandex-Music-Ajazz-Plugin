'use strict';

module.exports = `
function ymFindVibeLikeButton() {
  var bar = ymFindVibePlayerBar();
  if (!bar) return null;
  return bar.querySelector('button[data-test-id="LIKE_BUTTON"]')
    || bar.querySelector('button[aria-label="Нравится"]')
    || (function() {
      var icon = bar.querySelector('use[href*="liked_xs"], use[*|href*="liked_xs"], use[href*="like_xs"], use[*|href*="like_xs"]');
      return icon ? icon.closest('button') : null;
    })();
}

function ymFindVibeDislikeButton() {
  var bar = ymFindVibePlayerBar();
  if (!bar) return null;
  return bar.querySelector('button[data-test-id="DISLIKE_BUTTON"]')
    || bar.querySelector('button[aria-label="Не нравится"]')
    || (function() {
      var icon = bar.querySelector('use[href*="dislike_xs"], use[*|href*="dislike_xs"]');
      return icon ? icon.closest('button') : null;
    })();
}

function ymFindSonataLikeButton() {
  var playerBar = ymFindSonataPlayerBar();
  if (!playerBar) return null;
  var likeButton = playerBar.querySelector("[data-test-id='LIKE_BUTTON']");
  if (likeButton) return likeButton;
  return null;
}

function ymFindSonataDislikeButton() {
  var playerBar = ymFindSonataPlayerBar();
  if (!playerBar) return null;
  var dislikeButton = playerBar.querySelector("[data-test-id='DISLIKE_BUTTON']");
  if (dislikeButton) return dislikeButton;
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

async function ymClickLike() {
  try {
    var button = ymIsVibePageActive() ? ymFindVibeLikeButton() : ymFindSonataLikeButton();
    if (!ymCanClick(button)) return { success: false, message: 'Лайк недоступен' };
    var before = ymIsButtonLiked(button);
    button.click();
    var liked = await ymWaitForState(ymDetectLikeIsLiked, !before);
    return { success: true, accepted: true, confirmed: liked !== null, liked: liked };
  } catch (error) {
    return { success: false, message: error.message };
  }
}

function ymClickDislike() {
  var button = ymIsVibePageActive() ? ymFindVibeDislikeButton() : ymFindSonataDislikeButton();
  if (!ymCanClick(button)) return { success: false, message: 'Дизлайк недоступен' };
  button.click();
  return { success: true, accepted: true, confirmed: false };
}
`;
