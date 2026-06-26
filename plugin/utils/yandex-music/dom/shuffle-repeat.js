'use strict';

module.exports = `
function ymFindVibeContextMenuButton() {
  var bar = ymFindVibePlayerBar();
  if (!bar) return null;
  return bar.querySelector('button[aria-label="Контекстное меню"]')
    || bar.querySelector('button[aria-haspopup="menu"]');
}

function ymFindVibeContextMenuPanel() {
  var btn = ymFindVibeContextMenuButton();
  if (btn) {
    var controlsId = btn.getAttribute('aria-controls');
    if (controlsId) {
      var panel = document.getElementById(controlsId);
      if (panel) return panel;
    }
  }
  return document.querySelector('[role="menu"]');
}

function ymCloseVibeContextMenu() {
  var btn = ymFindVibeContextMenuButton();
  if (btn && btn.getAttribute('aria-expanded') === 'true') {
    btn.click();
    return true;
  }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
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
  scope = scope || document;
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
  if (panel) {
    return !!ymFindVibeMenuItem('shuffle', panel);
  }
  var ctx = document.querySelector('[class*="VibeResetButton_context"]');
  var modeText = ctx ? (ctx.textContent || ctx.getAttribute('title') || '').trim().toLowerCase() : '';
  if (modeText.indexOf('мне нравится') !== -1) return true;
  if (modeText.indexOf('моя волна') !== -1 || (modeText.indexOf('волна') !== -1 && modeText.indexOf('нравится') === -1)) return false;
  return null;
}

function ymScanVibeContextMenu(panel) {
  if (!panel) return null;
  var shuffleBtn = ymFindVibeMenuItem('shuffle', panel);
  var repeatBtn = ymFindVibeMenuItem('repeat', panel);
  return {
    shuffleAvailable: !!shuffleBtn,
    shuffleOn: shuffleBtn ? ymReadVibeMenuShuffleOn(shuffleBtn) : null,
    repeatMode: repeatBtn ? ymReadVibeMenuRepeatMode(repeatBtn) : 0
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
  if (!btn) return { success: false, message: 'Кнопка контекстного меню не найдена' };

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

async function ymToggleVibeMenuControl(fragment) {
  if (!ymIsVibePageActive()) return null;

  if (fragment === 'shuffle') {
    var available = ymDetectVibeShuffleAvailable();
    if (available === false) {
      return { success: false, message: 'Перемешивание недоступно в этом режиме', unavailable: true };
    }
  }

  var openResult = await ymOpenVibeContextMenu();
  if (!openResult.success) return openResult;

  var panel = ymFindVibeContextMenuPanel();
  var menuBtn = ymFindVibeMenuItem(fragment, panel || document);
  if (!menuBtn) {
    ymCloseVibeContextMenu();
    return {
      success: false,
      message: fragment === 'shuffle' ? 'Перемешивание недоступно' : 'Повтор недоступен',
      unavailable: fragment === 'shuffle'
    };
  }

  menuBtn.click();
  await ymWait(120);

  var result = { success: true, message: 'Vibe menu: ' + fragment };
  if (fragment === 'shuffle') {
    var shuffleBtn = ymFindVibeMenuItem('shuffle', ymFindVibeContextMenuPanel() || document) || menuBtn;
    result.shuffle = ymReadVibeMenuShuffleOn(shuffleBtn);
  } else if (fragment === 'repeat') {
    var repeatBtn = ymFindVibeMenuItem('repeat', ymFindVibeContextMenuPanel() || document) || menuBtn;
    result.mode = ymReadVibeMenuRepeatMode(repeatBtn);
  }

  ymCloseVibeContextMenu();
  return result;
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
      b.click();
      return { success: true, message: 'Sonata: ' + fragment };
    }
  }
  return { success: false, message: 'Кнопка ' + fragment + ' не найдена' };
}

async function ymToggleShuffle() {
  if (ymIsVibePageActive()) {
    var vibeResult = await ymToggleVibeMenuControl('shuffle');
    if (vibeResult && vibeResult.success) return vibeResult;
  }
  return ymToggleSonataControlByFragment('shuffle');
}

async function ymToggleRepeat() {
  if (ymIsVibePageActive()) {
    var vibeResult = await ymToggleVibeMenuControl('repeat');
    if (vibeResult && vibeResult.success) return vibeResult;
  }
  return ymToggleSonataControlByFragment('repeat');
}

function ymDetectShufflePressed() {
  if (window.__YM_AJAZZ_STATE && window.__YM_AJAZZ_STATE.vibeActive) {
    if (window.__YM_AJAZZ_STATE.shuffleAvailable === false) {
      return { ok: true, shuffle: false, unavailable: true };
    }
    if (window.__YM_AJAZZ_STATE.shuffleOn !== null && window.__YM_AJAZZ_STATE.shuffleOn !== undefined) {
      return { ok: true, shuffle: !!window.__YM_AJAZZ_STATE.shuffleOn };
    }
  }
  var sonata = ymDetectSonataControlByFragment('shuffle');
  if (sonata.ok) return sonata;
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
  if (window.__YM_AJAZZ_STATE && window.__YM_AJAZZ_STATE.vibeActive && window.__YM_AJAZZ_STATE.repeatMode !== null && window.__YM_AJAZZ_STATE.repeatMode !== undefined) {
    return { ok: true, mode: window.__YM_AJAZZ_STATE.repeatMode };
  }
  var sonata = ymDetectSonataControlByFragment('repeat');
  if (sonata.ok) return sonata;
  if (ymIsVibePageActive()) {
    var vibeOpen = ymDetectVibeMenuControlState('repeat');
    if (vibeOpen.ok) return vibeOpen;
  }
  return { ok: false };
}
`;
