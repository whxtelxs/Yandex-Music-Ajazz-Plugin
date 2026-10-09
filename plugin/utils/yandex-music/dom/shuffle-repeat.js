'use strict';

module.exports = `
function ymFindVibeContextMenuButton() {
  var bar = ymFindVibePlayerBar();
  if (!bar) return null;
  return bar.querySelector('[data-test-id="VIBE_CONTEXT_MENU_BUTTON"]')
    || bar.querySelector('button[aria-label="Контекстное меню"]')
    || bar.querySelector('button[aria-haspopup="menu"]');
}

function ymFindVibeContextMenuPanel() {
  var button = ymFindVibeContextMenuButton();
  if (!button || button.getAttribute('aria-expanded') !== 'true') return null;
  var controlsId = button.getAttribute('aria-controls');
  var panel = controlsId ? document.getElementById(controlsId) : null;
  if (panel) return panel;
  var menus = document.querySelectorAll('[role="menu"]');
  for (var i = 0; i < menus.length; i++) {
    if (menus[i].getAttribute('aria-labelledby') === button.id && button.id) return menus[i];
    if (menus[i].querySelector('[data-test-id="VIBE_CONTEXT_MENU"]')) return menus[i];
  }
  return null;
}

function ymCloseVibeContextMenu() {
  var btn = ymFindVibeContextMenuButton();
  if (btn && btn.getAttribute('aria-expanded') === 'true') {
    btn.click();
    return true;
  }
  return false;
}

function ymFindMenuButtonByIconFragment(fragment, scope) {
  if (scope && scope.getAttribute && scope.getAttribute('role') === 'menu') {
    var vibeItem = ymFindVibeMenuItem(fragment, scope);
    if (vibeItem) return vibeItem;
  }
  scope = scope || document;
  var buttons = scope.querySelectorAll('button, [role="menuitem"]');
  for (var i = 0; i < buttons.length; i++) {
    var b = buttons[i];
    var useEl = b.querySelector('use');
    var href = useEl
      ? (useEl.getAttribute('xlink:href') || useEl.getAttribute('href') || '')
      : '';
    var label = (b.getAttribute('aria-label') || b.textContent || '').toLowerCase();

    if (fragment === 'shuffle') {
      if (href.indexOf('shuffle_xxs') !== -1 || href.indexOf('shuffle') !== -1) return b;
      if (label.indexOf('перемеш') !== -1 || label.indexOf('случай') !== -1) return b;
    }

    if (fragment === 'repeat') {
      if ((href.indexOf('repeat_one') !== -1 || href.indexOf('repeat_xxs') !== -1 || href.indexOf('repeat') !== -1) && href.indexOf('shuffle') === -1) return b;
      if (label.indexOf('повтор') !== -1) return b;
    }
  }
  return null;
}

function ymIsVibeMenuItemActive(button) {
  if (!button) return false;
  return button.className.indexOf('VibeContextMenu_item_active') !== -1;
}

function ymFindVibeMenuItem(fragment, scope) {
  if (!scope) return null;
  var direct = scope.querySelector('[data-test-id="VIBE_CONTEXT_MENU_' + fragment.toUpperCase() + '_ITEM"]');
  if (direct) return direct;
  var items = scope.querySelectorAll('[role="menuitem"]');
  for (var i = 0; i < items.length; i++) {
    var b = items[i];
    var useEl = b.querySelector('use');
    var href = useEl
      ? (useEl.getAttribute('xlink:href') || useEl.getAttribute('href') || '')
      : '';
    var label = (b.textContent || '').toLowerCase();
    if (fragment === 'shuffle' && (href.indexOf('shuffle_xxs') !== -1 || label.indexOf('перемеш') !== -1)) return b;
    if (fragment === 'repeat' && (href.indexOf('repeat_one_xxs') !== -1 || href.indexOf('repeat_xxs') !== -1 || label.indexOf('повтор') !== -1)) return b;
  }
  return null;
}

function ymReadVibeMenuShuffleOn(button) {
  return ymIsVibeMenuItemActive(button);
}

function ymReadVibeMenuRepeatMode(button) {
  if (!button || !ymIsVibeMenuItemActive(button)) return 0;
  var useEl = button.querySelector('use');
  var href = useEl
    ? (useEl.getAttribute('xlink:href') || useEl.getAttribute('href') || '')
    : '';
  if (href.indexOf('repeat_one') !== -1) return 2;
  return 1;
}

function ymDetectVibeShuffleAvailable() {
  if (!ymIsVibePageActive()) return null;
  var panel = ymFindVibeContextMenuPanel();
  return panel ? !!ymFindVibeMenuItem('shuffle', panel) : null;
}

function ymScanVibeContextMenu(panel) {
  if (!panel) return null;
  var shuffleBtn = ymFindVibeMenuItem('shuffle', panel);
  var repeatBtn = ymFindVibeMenuItem('repeat', panel);
  return {
    shuffleAvailable: !!shuffleBtn,
    shuffleOn: shuffleBtn ? ymReadVibeMenuShuffleOn(shuffleBtn) : null,
    repeatMode: repeatBtn ? ymReadVibeMenuRepeatMode(repeatBtn) : null
  };
}

function ymReadRepeatModeFromButton(button) {
  if (!button) return 0;
  if (button.getAttribute('role') === 'menuitem') {
    return ymReadVibeMenuRepeatMode(button);
  }
  var useEl = button.querySelector('use');
  var href = useEl
    ? (useEl.getAttribute('xlink:href') || useEl.getAttribute('href') || '')
    : '';
  if (href.indexOf('repeat_one') !== -1 && ymIsVibeMenuItemActive(button)) return 2;
  if (ymIsVibeMenuItemActive(button)) return 1;
  if (href.indexOf('repeat_one') !== -1) return 2;
  if (button.getAttribute('aria-pressed') === 'true') return 1;
  return 0;
}

async function ymOpenVibeContextMenu() {
  var btn = ymFindVibeContextMenuButton();
  if (!ymCanClick(btn)) return { success: false, message: 'Кнопка контекстного меню недоступна' };

  if (btn.getAttribute('aria-expanded') !== 'true') {
    btn.click();
    for (var i = 0; i < 12; i++) {
      await ymWait(50);
      if (ymFindVibeContextMenuPanel()) {
        return { success: true, message: 'Меню открыто' };
      }
    }
    return { success: false, message: 'Контекстное меню не появилось' };
  }

  return { success: true, message: 'Меню уже открыто' };
}

function ymPublishVibeMenuState(snapshot) {
  if (!snapshot) return;
  var previous = window.__YM_AJAZZ_STATE || {};
  window.__YM_AJAZZ_STATE = Object.assign({}, previous, snapshot, {
    vibeActive: true,
    version: (previous.version || 0) + 1
  });
  if (typeof ymAjazzNotify === 'function') ymAjazzNotify(JSON.stringify(window.__YM_AJAZZ_STATE));
}

async function ymToggleVibeMenuControl(fragment) {
  if (!ymIsVibePageActive()) return null;
  var toggle = ymFindVibeContextMenuButton();
  var wasOpen = toggle && toggle.getAttribute('aria-expanded') === 'true';
  try {
    var opened = await ymOpenVibeContextMenu();
    if (!opened.success) return opened;
    var panel = ymFindVibeContextMenuPanel();
    var button = panel ? ymFindVibeMenuItem(fragment, panel) : null;
    if (!ymCanClick(button)) return { success: false, message: 'Управление недоступно', unavailable: true };
    var before = fragment === 'shuffle' ? ymReadVibeMenuShuffleOn(button) : ymReadVibeMenuRepeatMode(button);
    button.click();
    var actual = null;
    var snapshot = null;
    var deadline = Date.now() + 1600;
    for (var attempt = 0; attempt < 20 && Date.now() < deadline; attempt++) {
      await ymWait(40);
      panel = ymFindVibeContextMenuPanel();
      if (!panel) {
        var reopened = await ymOpenVibeContextMenu();
        if (!reopened.success) break;
        panel = ymFindVibeContextMenuPanel();
      }
      snapshot = ymScanVibeContextMenu(panel);
      var value = snapshot ? (fragment === 'shuffle' ? snapshot.shuffleOn : snapshot.repeatMode) : null;
      if (value !== null && value !== before) { actual = value; break; }
    }
    if (actual !== null) ymPublishVibeMenuState(snapshot);
    var result = { success: true, accepted: true, confirmed: actual !== null };
    if (actual !== null) result.state = snapshot;
    if (fragment === 'shuffle') result.shuffle = actual;
    else result.mode = actual;
    return result;
  } finally {
    if (!wasOpen) ymCloseVibeContextMenu();
  }
}

function ymDetectSonataControlByFragment(fragment) {
  var bar = ymFindSonataPlayerBar();
  if (!bar) return { ok: false };
  var buttons = bar.querySelectorAll('button');
  for (var i = 0; i < buttons.length; i++) {
    var b = buttons[i];
    var useEl = b.querySelector('use');
    if (!useEl) continue;
    var href = useEl.getAttribute('xlink:href') || useEl.getAttribute('href') || '';
    if (fragment === 'shuffle' && href.indexOf('shuffle') !== -1) {
      return { ok: true, shuffle: b.getAttribute('aria-pressed') === 'true' };
    }
    if (fragment === 'repeat' && href.indexOf('repeat') !== -1 && href.indexOf('shuffle') === -1) {
      return { ok: true, mode: ymReadRepeatModeFromButton(b) };
    }
  }
  return { ok: false };
}

function ymDetectVibeMenuControlState(fragment) {
  if (!ymIsVibePageActive()) return { ok: false };
  var panel = ymFindVibeContextMenuPanel();
  if (!panel) return { ok: false };
  var menuBtn = ymFindVibeMenuItem(fragment, panel);
  if (!menuBtn) return { ok: false, unavailable: fragment === 'shuffle' };
  if (fragment === 'shuffle') {
    return { ok: true, shuffle: ymReadVibeMenuShuffleOn(menuBtn) };
  }
  return { ok: true, mode: ymReadVibeMenuRepeatMode(menuBtn) };
}

async function ymToggleSonataControlByFragment(fragment) {
  var bar = ymFindSonataPlayerBar();
  if (!bar) return { success: false, message: 'Нет панели плеера' };
  var buttons = bar.querySelectorAll('button');
  for (var i = 0; i < buttons.length; i++) {
    var b = buttons[i];
    var useEl = b.querySelector('use');
    if (!useEl) continue;
    var href = useEl.getAttribute('xlink:href') || useEl.getAttribute('href') || '';
    if (href.indexOf(fragment) !== -1 && !(fragment === 'repeat' && href.indexOf('shuffle') !== -1)) {
      if (!ymCanClick(b)) return { success: false, message: 'Управление недоступно' };
      var before = ymDetectSonataControlByFragment(fragment);
      b.click();
      var expected = fragment === 'shuffle' ? !before.shuffle : (before.mode + 1) % 3;
      var actual = await ymWaitForState(function() {
        var value = ymDetectSonataControlByFragment(fragment);
        if (!value.ok) return null;
        return fragment === 'shuffle' ? value.shuffle : value.mode;
      }, before.ok ? expected : undefined);
      var result = { success: true, accepted: true, confirmed: actual !== null };
      if (fragment === 'shuffle') result.shuffle = actual;
      else result.mode = actual;
      return result;
    }
  }
  return { success: false, message: 'Кнопка ' + fragment + ' не найдена' };
}

async function ymToggleShuffle() {
  if (ymIsVibePageActive()) {
    var vibeResult = await ymToggleVibeMenuControl('shuffle');
    return vibeResult;
  }
  return ymToggleSonataControlByFragment('shuffle');
}

async function ymToggleRepeat() {
  if (ymIsVibePageActive()) {
    var vibeResult = await ymToggleVibeMenuControl('repeat');
    return vibeResult;
  }
  return ymToggleSonataControlByFragment('repeat');
}

function ymDetectShufflePressed() {
  if (ymIsVibePageActive()) {
    var observed = ymDetectVibeMenuControlState('shuffle');
    if (observed.ok) return observed;
  }
  if (window.__YM_AJAZZ_STATE && window.__YM_AJAZZ_STATE.vibeActive) {
    if (window.__YM_AJAZZ_STATE.shuffleAvailable === false) {
      return { ok: true, shuffle: false, unavailable: true };
    }
    if (window.__YM_AJAZZ_STATE.shuffleOn !== null && window.__YM_AJAZZ_STATE.shuffleOn !== undefined) {
      return { ok: true, shuffle: !!window.__YM_AJAZZ_STATE.shuffleOn };
    }
  }
  if (!ymIsVibePageActive()) return ymDetectSonataControlByFragment('shuffle');
  if (ymIsVibePageActive()) {
    var vibeOpen = ymDetectVibeMenuControlState('shuffle');
    if (vibeOpen.ok) return vibeOpen;
    if (ymDetectVibeShuffleAvailable() === false) {
      return { ok: true, shuffle: false, unavailable: true };
    }
  }
  return { ok: false };
}

function ymDetectRepeatMode() {
  if (ymIsVibePageActive()) {
    var observed = ymDetectVibeMenuControlState('repeat');
    if (observed.ok) return observed;
  }
  if (window.__YM_AJAZZ_STATE && window.__YM_AJAZZ_STATE.vibeActive && window.__YM_AJAZZ_STATE.repeatMode !== null && window.__YM_AJAZZ_STATE.repeatMode !== undefined) {
    return { ok: true, mode: window.__YM_AJAZZ_STATE.repeatMode };
  }
  if (!ymIsVibePageActive()) return ymDetectSonataControlByFragment('repeat');
  if (ymIsVibePageActive()) {
    var vibeOpen = ymDetectVibeMenuControlState('repeat');
    if (vibeOpen.ok) return vibeOpen;
  }
  return { ok: false };
}
`;
