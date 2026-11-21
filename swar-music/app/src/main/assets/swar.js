/*
 * Swar page script. Injected into music.youtube.com before the page's own
 * scripts run (WebViewCompat.addDocumentStartJavaScript).
 *
 *  1. Keeps the page "visible", so the player doesn't pause when the screen
 *     turns off or the app goes to the background.
 *  2. Strips ad data from the player and browse API responses, so no ad is
 *     scheduled in the first place.
 *  3. Fallback: if an ad still starts, mutes it, jumps to its end and clicks
 *     Skip. Also dismisses the "Are you still there?" dialog.
 *  4. Reports what's playing to the app (notification, lock screen, headset
 *     buttons) and runs commands coming back from it.
 */
(() => {
  'use strict';
  if (window.__swar) return;
  window.__swar = { version: 1 };

  // ---------------------------------------------------------------- 1. visibility
  const constant = (proto, prop, value) => {
    try {
      Object.defineProperty(proto, prop, { configurable: true, get: () => value });
    } catch (_) { /* not fatal */ }
  };
  constant(Document.prototype, 'hidden', false);
  constant(Document.prototype, 'webkitHidden', false);
  constant(Document.prototype, 'visibilityState', 'visible');
  constant(Document.prototype, 'webkitVisibilityState', 'visible');
  try { Document.prototype.hasFocus = function hasFocus() { return true; }; } catch (_) {}

  // Swallow page-level "you're in the background" events. Only events aimed at
  // the window or document itself: blur on an <input> must still work.
  const swallow = (e) => {
    if (e.target === window || e.target === document) e.stopImmediatePropagation();
  };
  for (const type of ['visibilitychange', 'webkitvisibilitychange', 'blur', 'pagehide', 'freeze']) {
    window.addEventListener(type, swallow, true);
    document.addEventListener(type, swallow, true);
  }

  // ---------------------------------------------------------------- 2. ad data
  // Keys the player reads to schedule ads (same set uBlock Origin prunes).
  const AD_KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams', 'adBreakParams'];
  // Renderers that are ads or Premium upsells when they appear in lists.
  const AD_RENDERERS = [
    'adSlotRenderer', 'promotedSparklesWebRenderer', 'promotedVideoRenderer',
    'compactPromotedItemRenderer', 'mealbarPromoRenderer', 'statementBannerRenderer',
    'actionCompanionAdRenderer', 'bannerPromoRenderer',
  ];
  // Cheap pre-check on raw JSON text before walking the parsed object.
  const AD_MARKER = /"(adPlacements|adSlots|playerAds|adBreak\w*Params|adSlotRenderer|promoted\w*Renderer|mealbarPromoRenderer|statementBannerRenderer|actionCompanionAdRenderer|bannerPromoRenderer)"/;

  const isObject = (v) => v !== null && typeof v === 'object';
  const isAdItem = (item) => isObject(item) && !Array.isArray(item) && AD_RENDERERS.some((k) => k in item);

  function prune(root) {
    const stack = [root];
    let visited = 0;
    while (stack.length && visited++ < 500000) {
      const node = stack.pop();
      if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0; i--) {
          if (isAdItem(node[i])) node.splice(i, 1);
          else if (isObject(node[i])) stack.push(node[i]);
        }
      } else {
        for (const key of AD_KEYS) if (key in node) delete node[key];
        for (const key of Object.keys(node)) if (isObject(node[key])) stack.push(node[key]);
      }
    }
    return root;
  }
  window.__swar.prune = prune;

  const nativeParse = JSON.parse;
  JSON.parse = function parse(text, reviver) {
    const out = nativeParse.call(this, text, reviver);
    try {
      if (isObject(out) && typeof text === 'string' && AD_MARKER.test(text)) prune(out);
    } catch (_) {}
    return out;
  };

  if (typeof Response !== 'undefined' && Response.prototype.json) {
    const nativeJson = Response.prototype.json;
    Response.prototype.json = function json() {
      const url = this.url || '';
      return nativeJson.call(this).then((out) => {
        try { if (isObject(out) && url.includes('/youtubei/')) prune(out); } catch (_) {}
        return out;
      });
    };
  }

  // Data the server embeds in the first page load.
  for (const name of ['ytInitialPlayerResponse', 'ytInitialData', 'playerResponse']) {
    let value;
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        get: () => value,
        set: (v) => {
          try { if (isObject(v)) prune(v); } catch (_) {}
          value = v;
        },
      });
    } catch (_) {}
  }

  // Ad slots and Premium banners that survive in the DOM.
  const CSS = [
    'ytmusic-mealbar-promo-renderer',
    'ytmusic-statement-banner-renderer',
    'ytmusic-banner-promo-renderer',
    '.ytp-ad-module',
    '.ytp-ad-overlay-container',
    '.ytp-ad-image-overlay',
    '.ytp-ad-player-overlay',
    '.video-ads',
    '#player-ads',
  ].join(',\n') + ' { display: none !important; }';
  const addStyle = () => {
    const style = document.createElement('style');
    style.id = 'swar-style';
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  };
  if (document.documentElement) addStyle();
  else document.addEventListener('DOMContentLoaded', addStyle, { once: true });

  // Everything below drives the player, which only lives in the top frame.
  if (window.top !== window) return;

  // ---------------------------------------------------------------- 3. fallback
  const SKIP_BUTTONS = '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-container button';
  const video = () => document.querySelector('video');
  const playerEl = () => document.getElementById('movie_player') || document.querySelector('.html5-video-player');
  let mutedByUs = false;

  function adShowing() {
    const p = playerEl();
    return !!(p && p.classList && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')));
  }

  function guard() {
    const v = video();
    if (v && adShowing()) {
      if (!v.muted) { v.muted = true; mutedByUs = true; }
      if (Number.isFinite(v.duration) && v.duration > 0 && v.currentTime < v.duration - 0.3) {
        v.currentTime = v.duration - 0.1;
      }
      document.querySelectorAll(SKIP_BUTTONS).forEach((b) => b.click());
    } else if (v && mutedByUs) {
      v.muted = false;
      mutedByUs = false;
    }

    const stillThere = document.querySelector('ytmusic-you-there-renderer');
    if (stillThere && stillThere.getClientRects().length) {
      const button = stillThere.querySelector('button, tp-yt-paper-button, yt-button-renderer');
      if (button) {
        button.click();
        if (v && v.paused) v.play().catch(() => {});
      }
    }
  }

  // ---------------------------------------------------------------- 4. app bridge
  // Remember the page's own media-session handlers so the app can call them:
  // they go through the player's queue logic, unlike poking <video> directly.
  const handlers = {};
  if (typeof MediaSession !== 'undefined' && MediaSession.prototype.setActionHandler) {
    const nativeSet = MediaSession.prototype.setActionHandler;
    MediaSession.prototype.setActionHandler = function setActionHandler(action, handler) {
      handlers[action] = handler;
      return nativeSet.call(this, action, handler);
    };
  }

  const clickFirst = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return false;
    el.click();
    return true;
  };
  const callHandler = (action, details) => {
    const h = handlers[action];
    if (typeof h !== 'function') return false;
    try { h(Object.assign({ action }, details)); return true; } catch (_) { return false; }
  };

  function play() {
    if (callHandler('play')) return;
    const p = playerEl();
    if (p && typeof p.playVideo === 'function') { p.playVideo(); return; }
    const v = video();
    if (v) v.play().catch(() => {});
  }
  function pause() {
    if (callHandler('pause')) return;
    const p = playerEl();
    if (p && typeof p.pauseVideo === 'function') { p.pauseVideo(); return; }
    const v = video();
    if (v) v.pause();
  }

  function cmd(name, arg) {
    switch (name) {
      case 'play': play(); break;
      case 'pause': pause(); break;
      case 'next':
        if (!callHandler('nexttrack')) clickFirst('ytmusic-player-bar .next-button, .next-button');
        break;
      case 'prev':
        if (!callHandler('previoustrack')) clickFirst('ytmusic-player-bar .previous-button, .previous-button');
        break;
      case 'seek': {
        const seconds = Number(arg);
        if (!Number.isFinite(seconds)) break;
        if (!callHandler('seekto', { seekTime: seconds })) {
          const v = video();
          if (v) v.currentTime = seconds;
        }
        break;
      }
      default: return;
    }
    setTimeout(report, 300);
  }
  window.__swar.cmd = cmd;

  function largestArtwork(artwork) {
    let best = '';
    let bestSize = -1;
    for (const a of artwork || []) {
      const size = parseInt(String(a.sizes || '0').split('x')[0], 10) || 0;
      if (a.src && size > bestSize) { best = a.src; bestSize = size; }
    }
    return best;
  }

  let lastSent = '';
  function report() {
    const v = video();
    const md = navigator.mediaSession && navigator.mediaSession.metadata;
    const state = {
      type: 'state',
      playing: !!(v && !v.paused && !v.ended),
      title: (md && md.title) || '',
      artist: (md && md.artist) || '',
      album: (md && md.album) || '',
      artwork: md ? largestArtwork(md.artwork) : '',
      duration: v && Number.isFinite(v.duration) ? Math.round(v.duration * 1000) : 0,
      position: v && Number.isFinite(v.currentTime) ? Math.round(v.currentTime * 1000) : 0,
      ad: adShowing(),
    };
    const json = JSON.stringify(state);
    if (json === lastSent) return;
    lastSent = json;
    try {
      if (window.SwarBridge) window.SwarBridge.postMessage(json);
    } catch (_) {}
  }
  window.__swar.report = report;

  const onMediaEvent = () => { guard(); report(); };
  for (const type of ['play', 'playing', 'pause', 'ended', 'loadedmetadata', 'seeked', 'durationchange']) {
    document.addEventListener(type, onMediaEvent, true);
  }
  setInterval(onMediaEvent, 1000);
})();
