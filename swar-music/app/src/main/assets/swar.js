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
 *  4b. Never plays video: whenever a video that has a song version starts,
 *     switches YouTube Music to the song (audio-only) version and keeps
 *     playing.
 *  5. Makes the page feel like an app: no tap flashes, no text selection on
 *     long-press, no rubber-band overscroll, and a "ready" signal so the app
 *     can drop its loading screen once the UI has drawn.
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
  ].join(',\n') + ' { display: none !important; }\n' + [
    // Feel like an app, not a web page.
    'html { -webkit-tap-highlight-color: transparent; }',
    'html, body { overscroll-behavior: none; }',
    '*:not(input):not(textarea):not([contenteditable]) { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }',
  ].join('\n');
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

  // Messages to the app (MainActivity, over the origin-locked bridge).
  const post = (message) => {
    try {
      if (window.SwarBridge) window.SwarBridge.postMessage(JSON.stringify(message));
    } catch (_) {}
  };

  // ---------------------------------------------------------------- 3. fallback
  const SKIP_BUTTONS = '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button, .ytp-ad-skip-button-container button';
  // The player's own <video>; YouTube Music can have other (preview) videos on the page.
  const video = () => document.querySelector('#movie_player video, ytmusic-player video') || document.querySelector('video');
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

  // ---------------------------------------------------------------- 4b. song only
  // A track with both versions shows YouTube Music's Song | Video switch.
  const SONG_SELECTORS = '#av-id ytmusic-av-toggle .song-button, ytmusic-av-toggle .song-button, ytmusic-av-toggle #song-button, .song-button';
  // Fallback: the switch's "Song" label, in English and the main Indian languages.
  const SONG_LABELS = ['song', 'गाना', 'गाणे', 'गाणं', 'ಹಾಡು', 'பாடல்', 'పాట', 'গান', 'ગીત', 'ਗੀਤ', 'ഗാനം', 'گانا'];
  const LABELLED = 'button, [role="tab"], [role="radio"], tp-yt-paper-tab, tp-yt-paper-button, yt-button-renderer, ytmusic-chip-cloud-chip-renderer, yt-chip-cloud-chip-renderer';
  const VIDEO_TYPES = ['MUSIC_VIDEO_TYPE_OMV', 'MUSIC_VIDEO_TYPE_UGC'];
  const SWITCH_COOLDOWN_MS = 2500; // the new stream takes a moment to replace the video
  const CHECK_AFTER_MS = 4500;
  let lastSwitch = 0;
  let resumeTimer = 0;
  const reported = new Set();

  const showingVideo = (v) => !!(v && v.videoWidth > 0 && v.videoHeight > 0);

  function playerVideo() {
    try {
      const p = playerEl();
      const r = p && typeof p.getPlayerResponse === 'function' ? p.getPlayerResponse() : null;
      const d = r && r.videoDetails;
      return d ? { id: d.videoId || '', type: d.musicVideoType || '' } : null;
    } catch (_) {
      return null;
    }
  }

  /** Playing a music video or uploaded video, rather than a song? */
  function isVideoPlayback(v) {
    const pv = playerVideo();
    if (pv && pv.type) return VIDEO_TYPES.includes(pv.type);
    return showingVideo(v);
  }

  function findSongButton() {
    const direct = document.querySelector(SONG_SELECTORS);
    if (direct) return direct;
    const scope = document.querySelector('ytmusic-player-page') || document.body;
    if (!scope) return null;
    for (const el of scope.querySelectorAll(LABELLED)) {
      if (SONG_LABELS.includes((el.textContent || '').trim().toLowerCase())) return el;
    }
    return null;
  }

  // Switching loads the song's stream; make sure playback carries on.
  function keepPlaying() {
    clearInterval(resumeTimer);
    let ticks = 0;
    resumeTimer = setInterval(() => {
      ticks += 1;
      const v = video();
      if (v && v.paused && !v.ended && v.readyState >= 2) v.play().catch(() => {});
      if ((v && !v.paused && ticks >= 4) || ticks >= 24) clearInterval(resumeTimer);
    }, 250);
  }

  /** Once per video: describe the page so a failed switch can be fixed. No personal data. */
  function reportSwitchProblem(reason) {
    const pv = playerVideo();
    const key = `${(pv && pv.id) || location.pathname}:${reason}`;
    if (reported.has(key)) return;
    reported.add(key);
    const page = document.querySelector('ytmusic-player-page') || document.body;
    const toggle = document.querySelector('ytmusic-av-toggle');
    const tags = new Set();
    if (page) for (const el of page.querySelectorAll('*')) if (el.tagName.includes('-')) tags.add(el.tagName.toLowerCase());
    const labels = page
      ? [...page.querySelectorAll(LABELLED)].map((el) => (el.textContent || '').trim().replace(/\s+/g, ' ')).filter((t) => t && t.length <= 24).slice(0, 25)
      : [];
    const v = video();
    post({
      type: 'diag',
      reason,
      videoType: (pv && pv.type) || 'unknown',
      picture: v ? `${v.videoWidth}x${v.videoHeight}` : 'no-video',
      avToggle: toggle ? [...toggle.attributes].map((a) => a.name).join(' ') || 'present' : 'missing',
      songButton: !!findSongButton(),
      labels,
      tags: [...tags].slice(0, 60),
      path: location.pathname,
    });
  }

  /** If a music video is playing and it has a song version, switch to the song. */
  function preferSong() {
    const v = video();
    if (!v || adShowing() || !isVideoPlayback(v)) return;
    if (Date.now() - lastSwitch < SWITCH_COOLDOWN_MS) return;
    const pv = playerVideo();
    const button = findSongButton();
    if (!button) {
      // Official music videos almost always have a song version; say so if we can't find it.
      if (pv && pv.type === 'MUSIC_VIDEO_TYPE_OMV') reportSwitchProblem('no-song-button');
      return;
    }
    const wasPlaying = !v.paused || v.autoplay;
    button.click();
    lastSwitch = Date.now();
    if (wasPlaying) keepPlaying();
    const before = pv && pv.id;
    setTimeout(() => {
      const now = playerVideo();
      if (isVideoPlayback(video()) && (!now || now.id === before)) reportSwitchProblem('click-had-no-effect');
    }, CHECK_AFTER_MS);
  }
  window.__swar.preferSong = preferSong;

  function cmd(name, arg) {
    switch (name) {
      case 'background': preferSong(); break;
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

  // ---------------------------------------------------------------- 5. ready
  // Tell the app once YouTube Music's UI has drawn, so it can drop its loading
  // screen. If the expected elements never show up, say so anyway after a while.
  const READY_SELECTORS = 'ytmusic-pivot-bar-renderer, ytmusic-nav-bar, ytmusic-browse-response, ytmusic-player-page, ytmusic-search-page';
  const readyStart = Date.now();
  (function waitForUi() {
    const drawn = document.querySelector('ytmusic-app') && document.querySelector(READY_SELECTORS);
    if (drawn || Date.now() - readyStart > 10000) {
      // One frame later, so the first paint is on screen before the cover lifts.
      requestAnimationFrame(() => post({ type: 'ready' }));
      return;
    }
    setTimeout(waitForUi, 120);
  })();

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
    post(state);
  }
  window.__swar.report = report;

  const onMediaEvent = () => { guard(); preferSong(); report(); };
  for (const type of ['play', 'playing', 'pause', 'ended', 'loadedmetadata', 'seeked', 'durationchange']) {
    document.addEventListener(type, onMediaEvent, true);
  }
  setInterval(onMediaEvent, 1000);
})();
