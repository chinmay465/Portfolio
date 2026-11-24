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
 *  4b. Plays songs, not videos: whenever a video starts, switches YouTube
 *     Music's Song | Video toggle to Song. Where YouTube has disabled that
 *     toggle, looks the same title and artist up in YouTube Music's search
 *     and plays the song if it clearly matches; until then (or if nothing
 *     matches) hides the picture behind the cover art and drops the video to
 *     the lowest quality.
 *  5. Makes the page feel like an app: no tap flashes, no text selection on
 *     long-press, no rubber-band overscroll, and a "ready" signal so the app
 *     can drop its loading screen once the UI has drawn.
 *  6. Audio quality: Auto leaves YouTube's adaptive choice alone; High and Low
 *     narrow the audio formats the player can pick from. Reports the format
 *     that's playing, for the app's selector on the player page.
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

  // ---------------------------------------------------------------- 2b. audio quality
  // The app's Audio quality setting (set by the app just before this script).
  //  auto: leave YouTube's choice alone (it adapts to the connection).
  //  high: the player only sees the highest-bitrate audio of each kind, so it
  //        can't drop to a lower one.
  //  normal: the best audio up to YouTube's Normal tier (about 128 kbps).
  //  low:  only the lowest-bitrate audio, to save data.
  // Video formats are never touched. Applies to player responses as they load,
  // so a change takes effect from the next song.
  const QUALITIES = ['auto', 'high', 'normal', 'low'];
  // YouTube Music's tiers: Low up to ~48 kbps, Normal ~128, High ~256 (Premium).
  const NORMAL_MAX_KBPS = 180;
  const LOW_MAX_KBPS = 80;
  let audioQuality = QUALITIES.includes(window.__swarAudioQuality) ? window.__swarAudioQuality : 'auto';
  const audioInfo = new Map(); // video id -> { best: kbps, formats: { itag: { codec, kbps } } }

  const kbpsOf = (f) => Math.round((f.averageBitrate || f.bitrate || 0) / 1000);
  const isAudioFormat = (f) => isObject(f) && typeof f.mimeType === 'string' && f.mimeType.startsWith('audio/');
  const codecOf = (mime) => (/opus/i.test(mime) ? 'Opus' : /mp4a/i.test(mime) ? 'AAC' : /[ae]c-3/i.test(mime) ? 'Dolby' : 'Audio');

  function rememberAudio(id, audio) {
    const prev = audioInfo.get(id) || { best: 0, formats: {} };
    for (const f of audio) prev.formats[String(f.itag)] = { codec: codecOf(f.mimeType), kbps: kbpsOf(f) };
    prev.best = Math.max(prev.best, ...audio.map(kbpsOf));
    audioInfo.delete(id);
    audioInfo.set(id, prev);
    if (audioInfo.size > 60) audioInfo.delete(audioInfo.keys().next().value);
  }

  function shapeAudio(response, quality = audioQuality) {
    const sd = response.streamingData;
    const formats = sd && sd.adaptiveFormats;
    if (!Array.isArray(formats)) return;
    const audio = formats.filter(isAudioFormat);
    if (!audio.length) return;
    const id = (response.videoDetails && response.videoDetails.videoId) || '';
    if (id) rememberAudio(id, audio);
    if (!['high', 'normal', 'low'].includes(quality)) return;
    // One pick per container, language track and loudness variant, so the
    // player still has a codec it can decode and the right language.
    const groups = new Map();
    for (const f of audio) {
      const key = [f.mimeType.split(';')[0], (f.audioTrack && f.audioTrack.id) || '', f.isDrc ? 'drc' : ''].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }
    const keep = new Set();
    for (const list of groups.values()) {
      const rates = list.map(kbpsOf);
      const capped = rates.filter((r) => r <= NORMAL_MAX_KBPS);
      const target = quality === 'high' ? Math.max(...rates)
        : quality === 'normal' ? (capped.length ? Math.max(...capped) : Math.min(...rates))
          : Math.min(...rates);
      for (const f of list) if (kbpsOf(f) === target) keep.add(f);
    }
    sd.adaptiveFormats = formats.filter((f) => !isAudioFormat(f) || keep.has(f));
  }

  /** Player responses sit at the top of a response or a couple of levels down. */
  function shapeAll(root) {
    const queue = [[root, 0]];
    while (queue.length) {
      const [node, depth] = queue.shift();
      if (node.streamingData) shapeAudio(node);
      if (depth >= 2) continue;
      for (const v of Array.isArray(node) ? node : Object.values(node)) if (isObject(v)) queue.push([v, depth + 1]);
    }
  }
  Object.assign(window.__swar, {
    shapeAudio,
    audioInfo,
    getAudioQuality: () => audioQuality,
    setAudioQuality: (q) => { if (QUALITIES.includes(q)) audioQuality = q; },
  });

  const nativeParse = JSON.parse;
  JSON.parse = function parse(text, reviver) {
    const out = nativeParse.call(this, text, reviver);
    try {
      if (isObject(out) && typeof text === 'string') {
        if (AD_MARKER.test(text)) prune(out);
        if (text.includes('"adaptiveFormats"')) shapeAll(out);
      }
    } catch (_) {}
    return out;
  };

  if (typeof Response !== 'undefined' && Response.prototype.json) {
    const nativeJson = Response.prototype.json;
    Response.prototype.json = function json() {
      const url = this.url || '';
      return nativeJson.call(this).then((out) => {
        try {
          if (isObject(out) && url.includes('/youtubei/')) {
            prune(out);
            shapeAll(out);
          }
        } catch (_) {}
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
          try {
            if (isObject(v)) {
              prune(v);
              shapeAll(v);
            }
          } catch (_) {}
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
    // Low-data video (see 4b): cover art instead of the picture.
    'html.swar-low-data ytmusic-player #song-video, html.swar-low-data #movie_player video { visibility: hidden !important; }',
    'html.swar-low-data ytmusic-player #song-image { display: block !important; visibility: visible !important; }',
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
      avToggle: toggle ? [...toggle.attributes].map((a) => (a.value ? `${a.name}=${a.value}` : a.name)).join(' ') || 'present' : 'missing',
      songButton: !!findSongButton(),
      labels,
      tags: [...tags].slice(0, 60),
      path: location.pathname,
    });
  }

  // ---- Switch state for the app's "Switching to the song" card. The video is
  // muted meanwhile, so its audio doesn't play before the song starts.
  const SWITCH_TIMEOUT_MS = 9000;
  let switching = null; // { from, muted, timer }

  function startSwitch(fromId, title) {
    if (switching && switching.from === fromId) return;
    endSwitch('replaced');
    const v = video();
    const muted = !!(v && !v.muted);
    if (muted) v.muted = true;
    switching = { from: fromId, muted, timer: setTimeout(() => endSwitch('timeout'), SWITCH_TIMEOUT_MS) };
    post({ type: 'switch', phase: 'start', title: title || '' });
  }

  function endSwitch(phase) {
    if (!switching) return;
    clearTimeout(switching.timer);
    const v = video();
    if (switching.muted && v) v.muted = false;
    switching = null;
    post({ type: 'switch', phase });
    reportAudio();
  }

  const avToggle = () => document.querySelector('#av-id ytmusic-av-toggle, ytmusic-av-toggle');
  const toggleDisabled = (t) => !!(t && t.hasAttribute('toggle-disabled'));

  // ---- Low-data video: when YouTube won't switch to the song, make the video
  // cost as little as possible: lowest quality, picture hidden behind the art.
  let lowDataFor = '';
  let modeObserver = null;

  function playerVideoDetails() {
    try {
      const p = playerEl();
      const r = p && typeof p.getPlayerResponse === 'function' ? p.getPlayerResponse() : null;
      return (r && r.videoDetails) || null;
    } catch (_) {
      return null;
    }
  }

  function coverArt() {
    const d = playerVideoDetails();
    const thumbs = (d && d.thumbnail && d.thumbnail.thumbnails) || [];
    const best = thumbs[thumbs.length - 1];
    return best && best.url ? best.url.split('?')[0] : '';
  }

  function enterLowData(id) {
    if (lowDataFor === id) return;
    lowDataFor = id;
    document.documentElement.classList.add('swar-low-data');
    const p = playerEl();
    try {
      if (p && typeof p.setPlaybackQualityRange === 'function') p.setPlaybackQualityRange('tiny', 'tiny');
      else if (p && typeof p.setPlaybackQuality === 'function') p.setPlaybackQuality('tiny');
    } catch (_) {}
    // Song-style layout: YouTube Music shows the cover art in ATV mode.
    const ytPlayer = document.querySelector('ytmusic-player');
    if (ytPlayer) {
      ytPlayer.setAttribute('playback-mode', 'ATV_PREFERRED');
      if (modeObserver) modeObserver.disconnect();
      modeObserver = new MutationObserver(() => {
        if (lowDataFor && ytPlayer.getAttribute('playback-mode') !== 'ATV_PREFERRED') ytPlayer.setAttribute('playback-mode', 'ATV_PREFERRED');
      });
      modeObserver.observe(ytPlayer, { attributes: true, attributeFilter: ['playback-mode'] });
    }
    const img = document.querySelector('ytmusic-player #song-image img');
    const art = coverArt();
    if (img && art && (!img.src || img.src.startsWith('data:'))) img.src = art;
  }

  function leaveLowData() {
    if (!lowDataFor) return;
    lowDataFor = '';
    document.documentElement.classList.remove('swar-low-data');
    if (modeObserver) modeObserver.disconnect();
    modeObserver = null;
    const p = playerEl();
    try {
      if (p && typeof p.setPlaybackQualityRange === 'function') p.setPlaybackQualityRange('auto', 'auto');
    } catch (_) {}
  }

  // ---- Song version by search: when YouTube offers no usable Song switch, look
  // the same title and artist up in YouTube Music and play the song if it
  // clearly matches. Uses the page's own search API on this same site.
  const INNERTUBE_SEARCH = '/youtubei/v1/search?prettyPrint=false';
  const searched = new Map(); // video id -> song id ('' when nothing matched)

  const NOISE = /\(([^)]*)\)|\[([^\]]*)\]|\{([^}]*)\}|\|.*$|\s-\s.*(official|video|lyric|audio|full song|hd|4k).*$/gi;
  const FEAT = /\b(ft|feat|featuring)\b\.?.*$/i;

  /** "Kesariya (Official Video) | Brahmāstra" -> "kesariya" */
  function normalizeTitle(text) {
    return String(text || '')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(NOISE, ' ').replace(FEAT, ' ')
      .toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  }

  const artistNames = (text) => String(text || '')
    .toLowerCase().split(/\s*(?:,|&|•|\band\b|\bx\b|\bwith\b)\s*/)
    .map((s) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N} ]+/gu, '').trim())
    .filter((s) => s.length >= 2);

  function titlesMatch(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const [short, long] = a.length <= b.length ? [a, b] : [b, a];
    return long.startsWith(short) && short.length / long.length >= 0.6;
  }

  function artistsOverlap(wanted, found) {
    const have = artistNames(found);
    return artistNames(wanted).some((w) => have.some((h) => h === w || h.includes(w) || w.includes(h)));
  }

  const runsText = (t) => (t && (t.simpleText || (t.runs || []).map((r) => r.text).join(''))) || '';

  function findVideoType(node) {
    const stack = [node];
    let n = 0;
    while (stack.length && n++ < 400) {
      const o = stack.pop();
      if (!o || typeof o !== 'object') continue;
      if (o.watchEndpointMusicConfig && o.watchEndpointMusicConfig.musicVideoType) return o.watchEndpointMusicConfig.musicVideoType;
      for (const k of Object.keys(o)) stack.push(o[k]);
    }
    return '';
  }

  function findVideoId(node) {
    const stack = [node];
    let n = 0;
    while (stack.length && n++ < 400) {
      const o = stack.pop();
      if (!o || typeof o !== 'object') continue;
      if (o.watchEndpoint && o.watchEndpoint.videoId) return o.watchEndpoint.videoId;
      if (o.playlistItemData && o.playlistItemData.videoId) return o.playlistItemData.videoId;
      for (const k of Object.keys(o)) stack.push(o[k]);
    }
    return '';
  }

  /** Song results (ATV) from a search response, in page order. */
  function songResults(response) {
    const out = [];
    const stack = [response];
    let n = 0;
    while (stack.length && n++ < 50000) {
      const o = stack.pop();
      if (!o || typeof o !== 'object') continue;
      const item = o.musicResponsiveListItemRenderer;
      const card = o.musicCardShelfRenderer;
      if (item && item.flexColumns) {
        const cols = item.flexColumns.map((c) => runsText(c.musicResponsiveListItemFlexColumnRenderer && c.musicResponsiveListItemFlexColumnRenderer.text));
        out.push({ id: findVideoId(item), type: findVideoType(item), title: cols[0] || '', artists: cols.slice(1).join(' • ') });
      } else if (card) {
        out.push({ id: findVideoId(card.title || card), type: findVideoType(card.title || card), title: runsText(card.title), artists: runsText(card.subtitle) });
      }
      if (Array.isArray(o)) for (let i = o.length - 1; i >= 0; i--) stack.push(o[i]);
      else for (const k of Object.keys(o)) stack.push(o[k]);
    }
    return out.filter((r) => r.id && r.type === 'MUSIC_VIDEO_TYPE_ATV');
  }

  /** The song version of {title, artist}, or null if nothing clearly matches. */
  function pickSongVersion(response, wanted) {
    // "Tum Hi Ho - Aashiqui 2": also try the part before the dash (song - film).
    const wants = [...new Set([
      normalizeTitle(wanted.title),
      normalizeTitle(String(wanted.title || '').split(/\s[-–—]\s/)[0]),
    ])].filter(Boolean);
    for (const r of songResults(response).slice(0, 8)) {
      const got = normalizeTitle(r.title);
      if (wants.some((w) => titlesMatch(w, got)) && artistsOverlap(wanted.artist, r.artists)) return r;
    }
    return null;
  }

  function ytcfgValue(key) {
    try {
      const c = window.ytcfg;
      if (c && typeof c.get === 'function') return c.get(key);
      return c && c.data_ ? c.data_[key] : undefined;
    } catch (_) {
      return undefined;
    }
  }

  /** The same search request YouTube Music sends when you type in its search box. */
  function searchSongs(query) {
    const context = ytcfgValue('INNERTUBE_CONTEXT');
    if (!context || typeof fetch !== 'function') return Promise.resolve(null);
    const headers = { 'Content-Type': 'application/json' };
    const visitor = ytcfgValue('VISITOR_DATA');
    if (visitor) headers['X-Goog-Visitor-Id'] = visitor;
    return fetch(INNERTUBE_SEARCH, {
      method: 'POST',
      credentials: 'same-origin',
      headers,
      body: JSON.stringify({ context, query }),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  }

  /** Play a song through YouTube Music's own navigation; reload onto it if that doesn't take. */
  function playSong(id) {
    const endpoint = {
      watchEndpoint: {
        videoId: id,
        watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType: 'MUSIC_VIDEO_TYPE_ATV' } },
      },
    };
    const app = document.querySelector('ytmusic-app');
    if (app) app.dispatchEvent(new CustomEvent('yt-navigate', { bubbles: true, composed: true, detail: { endpoint } }));
    setTimeout(() => {
      const now = playerVideo();
      if (!now || now.id !== id) location.assign(`/watch?v=${encodeURIComponent(id)}`);
    }, 3000);
  }

  function playSongVersion(videoId) {
    if (searched.has(videoId)) return;
    const md = navigator.mediaSession && navigator.mediaSession.metadata;
    const details = playerVideoDetails();
    const title = (md && md.title) || (details && details.title) || '';
    const artist = (md && md.artist) || (details && details.author) || '';
    if (!title) return; // metadata not there yet; try again on the next tick
    searched.set(videoId, '');
    startSwitch(videoId, normalizeTitle(title) ? title.replace(/\s*[([|].*$/, '').trim() : title);
    searchSongs(`${normalizeTitle(title)} ${artist}`.trim()).then((response) => {
      if (!response) {
        endSwitch('none');
        return;
      }
      const song = pickSongVersion(response, { title, artist });
      if (!song) {
        endSwitch('none'); // no clear match: stay on low-data video
        return;
      }
      searched.set(videoId, song.id);
      const now = playerVideo();
      if (now && now.id === videoId) playSong(song.id); // only if that video is still on
      else endSwitch('none');
    });
  }
  Object.assign(window.__swar, { normalizeTitle, pickSongVersion, songResults });

  /** Plays songs, not videos: switch to Song, or failing that, low-data video. */
  function preferSong() {
    const v = video();
    if (!v || adShowing()) return;
    if (!isVideoPlayback(v)) {
      leaveLowData();
      if (switching && !v.paused) endSwitch('done');
      return;
    }
    if (Date.now() - lastSwitch < SWITCH_COOLDOWN_MS) return;
    const pv = playerVideo();
    const id = (pv && pv.id) || location.pathname;
    const toggle = avToggle();
    const button = findSongButton();

    if (!button || toggleDisabled(toggle)) {
      // YouTube offers no song for this video, or has turned the switch off:
      // low-data video right away, then look the song up and play it if it matches.
      enterLowData(id);
      playSongVersion(id);
      if (!button && !toggle && pv && pv.type === 'MUSIC_VIDEO_TYPE_OMV') reportSwitchProblem('no-song-button');
      return;
    }
    const wasPlaying = !v.paused || v.autoplay;
    startSwitch(id, (navigator.mediaSession && navigator.mediaSession.metadata && navigator.mediaSession.metadata.title) || '');
    button.click();
    lastSwitch = Date.now();
    if (wasPlaying) keepPlaying();
    const before = pv && pv.id;
    setTimeout(() => {
      const now = playerVideo();
      if (isVideoPlayback(video()) && (!now || now.id === before)) {
        enterLowData(id);
        playSongVersion(id);
        reportSwitchProblem('click-had-no-effect');
      }
    }, CHECK_AFTER_MS);
  }
  window.__swar.preferSong = preferSong;

  function cmd(name, arg) {
    switch (name) {
      case 'background':
        onScreen = false;
        preferSong();
        break;
      case 'foreground':
        onScreen = true;
        reportAudio();
        return;
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
      case 'quality':
        window.__swar.setAudioQuality(arg);
        reportAudio();
        return;
      default: return;
    }
    setTimeout(report, 300);
  }
  window.__swar.cmd = cmd;

  // ---------------------------------------------------------------- 6. audio report
  // What's actually playing, for the app's quality chip and notification.
  // Bitrate comes from the format the player picked (its own audio format id);
  // if the player doesn't say, it's measured from the audio it downloads.
  // Follows the track that's playing: re-checked on every track change and
  // player event, blanked while a video switches to its song. Cheap by design:
  // the format lookup repeats every 2 s on screen and 4 s in the background,
  // and the player-page check (it reads layout) only runs while on screen.

  // ---- Measured: bytes appended to the audio buffer per second of audio added.
  const measured = { id: '', bytes: 0, seconds: 0, codec: '' };
  const bufferedSeconds = (sb) => {
    let total = 0;
    const r = sb.buffered;
    for (let i = 0; i < r.length; i++) total += r.end(i) - r.start(i);
    return total;
  };
  if (typeof MediaSource !== 'undefined' && MediaSource.prototype.addSourceBuffer &&
      typeof SourceBuffer !== 'undefined' && SourceBuffer.prototype.appendBuffer) {
    const audioBuffers = new WeakMap(); // SourceBuffer -> codec name
    const nativeAdd = MediaSource.prototype.addSourceBuffer;
    MediaSource.prototype.addSourceBuffer = function addSourceBuffer(type) {
      const sb = nativeAdd.call(this, type);
      try { if (/^audio\//i.test(String(type))) audioBuffers.set(sb, codecOf(String(type))); } catch (_) {}
      return sb;
    };
    const nativeAppend = SourceBuffer.prototype.appendBuffer;
    SourceBuffer.prototype.appendBuffer = function appendBuffer(data) {
      let codec = '';
      let before = 0;
      let size = 0;
      try {
        codec = audioBuffers.get(this) || '';
        if (codec) { size = (data && data.byteLength) || 0; before = bufferedSeconds(this); }
      } catch (_) { codec = ''; }
      const out = nativeAppend.call(this, data); // the player's own call, unchanged
      if (codec && size) {
        this.addEventListener('updateend', () => {
          try {
            const added = bufferedSeconds(this) - before;
            if (added > 0.5 && added < 120) { // skip init segments and overlapping re-appends
              const pv = playerVideo();
              const id = (pv && pv.id) || '';
              if (measured.id !== id) Object.assign(measured, { id, bytes: 0, seconds: 0 });
              measured.bytes += size;
              measured.seconds += added;
              measured.codec = codec;
            }
          } catch (_) {}
        }, { once: true });
      }
      return out;
    };
  }

  /** Bytes are counted against the track playing when they arrived. */
  function measuredKbps(id) {
    if (measured.id !== id || measured.seconds < 8) return 0;
    return Math.round((measured.bytes * 8) / measured.seconds / 1000);
  }

  function currentAudioItag() {
    const p = playerEl();
    try {
      const s = p && typeof p.getVideoStats === 'function' ? p.getVideoStats() : null;
      if (s && s.afmt) return String(s.afmt);
    } catch (_) {}
    try {
      // Stats for nerds: "vp09.00.40.08 (248) / opus (251)"
      const n = p && typeof p.getStatsForNerds === 'function' ? p.getStatsForNerds() : null;
      for (const part of String((n && n.codecs) || '').split('/')) {
        const m = /(opus|mp4a|[ae]c-3)[^(]*\((\d+)\)/i.exec(part);
        if (m) return m[2];
      }
    } catch (_) {}
    return '';
  }

  /** Bitrate on offer in each tier for this track (0: not offered). Surround tracks don't count. */
  function tierRates(info) {
    const rates = info ? Object.values(info.formats).filter((f) => f.codec !== 'Dolby').map((f) => f.kbps).filter((k) => k > 0) : [];
    const top = (list) => (list.length ? Math.max(...list) : 0);
    return {
      low: top(rates.filter((k) => k <= LOW_MAX_KBPS)),
      normal: top(rates.filter((k) => k > LOW_MAX_KBPS && k <= NORMAL_MAX_KBPS)),
      high: top(rates.filter((k) => k > NORMAL_MAX_KBPS)),
    };
  }

  /** Formats for this track; from the player itself if the response slipped past the hooks. */
  function audioFormats(id) {
    if (!audioInfo.has(id)) {
      try {
        const p = playerEl();
        const r = p && typeof p.getPlayerResponse === 'function' ? p.getPlayerResponse() : null;
        const formats = r && r.streamingData && r.streamingData.adaptiveFormats;
        const audio = Array.isArray(formats) ? formats.filter(isAudioFormat) : [];
        if (audio.length) rememberAudio(id, audio);
      } catch (_) {}
    }
    return audioInfo.get(id) || null;
  }

  /** Is the full-screen player page (cover art, controls) open? */
  function playerPageOpen() {
    if (document.querySelector('ytmusic-app-layout[player-page-open], ytmusic-app-layout[player-page-open_], ytmusic-player-page[player-page-open]')) return true;
    const pageEl = document.querySelector('ytmusic-player-page');
    if (!pageEl || !pageEl.getClientRects().length) return false;
    const r = pageEl.getBoundingClientRect();
    const h = window.innerHeight || 1;
    return r.height > h * 0.5 && r.top < h * 0.25 && r.bottom > 0;
  }

  let onScreen = true;
  const NOTHING = { id: '', codec: '', kbps: 0, measured: false, best: 0, tiers: { low: 0, normal: 0, high: 0 } };
  let nowPlaying = NOTHING;
  let lastAudio = '';

  /** refresh: look up the playing format again (otherwise only on a track change). */
  function reportAudio(refresh = true) {
    const pv = playerVideo();
    const id = (pv && pv.id) || '';
    // Mid-switch from a video to its song, the video's audio is muted and on
    // its way out: show nothing rather than its bitrate.
    if (switching) {
      nowPlaying = NOTHING;
    } else if (refresh || id !== nowPlaying.id) {
      const info = id ? audioFormats(id) : null;
      const itag = info ? currentAudioItag() : '';
      const known = info && itag ? info.formats[itag] : null;
      const live = id ? measuredKbps(id) : 0;
      const base = { id, best: info ? info.best : 0, tiers: tierRates(info) };
      let next;
      if (known && known.kbps) next = { ...base, codec: known.codec, kbps: known.kbps, measured: false };
      else if (live) next = { ...base, codec: measured.codec, kbps: live, measured: true };
      else next = { ...base, codec: '', kbps: 0, measured: false };
      // A measured figure drifts a little as more audio arrives; only pass on real changes.
      const steady = next.measured && nowPlaying.measured && nowPlaying.id === id &&
        Math.abs(next.kbps - nowPlaying.kbps) < nowPlaying.kbps * 0.05;
      if (!steady) nowPlaying = next;
    }
    const message = {
      type: 'audio',
      open: onScreen && playerPageOpen(),
      quality: audioQuality,
      codec: nowPlaying.codec,
      kbps: nowPlaying.kbps,
      measured: nowPlaying.measured,
      best: nowPlaying.best,
      tiers: nowPlaying.tiers,
    };
    const json = JSON.stringify(message);
    if (json === lastAudio) return;
    lastAudio = json;
    post(message);
  }
  window.__swar.reportAudio = reportAudio;

  let audioTicks = 0;
  setInterval(() => {
    audioTicks += 1;
    if (!onScreen && audioTicks % 10) return; // background: every 4 s
    reportAudio(audioTicks % 5 === 0); // format lookup every 2 s; page-open check every 0.4 s on screen
  }, 400);

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

  const onMediaEvent = () => { guard(); preferSong(); report(); reportAudio(false); };
  for (const type of ['play', 'playing', 'pause', 'ended', 'loadedmetadata', 'seeked', 'durationchange']) {
    document.addEventListener(type, onMediaEvent, true);
  }
  setInterval(onMediaEvent, 1000);
})();
