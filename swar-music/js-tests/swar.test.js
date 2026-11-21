// Tests for app/src/main/assets/swar.js in a simulated YouTube Music page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

// Objects made inside the page have the page's prototypes; compare as plain data.
const plain = (x) => JSON.parse(JSON.stringify(x));

const SCRIPT = readFileSync(new URL('../app/src/main/assets/swar.js', import.meta.url), 'utf8');

function page(html = '') {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${html}</body></html>`, {
    url: 'https://music.youtube.com/',
    runScripts: 'outside-only',
  });
  const { window } = dom;
  window.Response = globalThis.Response;
  window.MediaSession = class MediaSession {
    setActionHandler() {}
  };
  Object.defineProperty(window.navigator, 'mediaSession', { value: new window.MediaSession(), configurable: true });
  const messages = [];
  window.SwarBridge = { postMessage: (m) => messages.push(JSON.parse(m)) };
  window.eval(SCRIPT);
  return { window, document: window.document, messages, close: () => window.close() };
}

const fakeVideo = (document, props) => {
  const v = document.createElement('video');
  const state = { paused: true, ended: false, duration: NaN, currentTime: 0, muted: false, ...props };
  for (const key of Object.keys(state)) {
    Object.defineProperty(v, key, { configurable: true, get: () => state[key], set: (x) => { state[key] = x; } });
  }
  v.play = () => { state.paused = false; return Promise.resolve(); };
  v.pause = () => { state.paused = true; };
  return v;
};

test('page always reports itself visible', () => {
  const p = page();
  assert.equal(p.document.hidden, false);
  assert.equal(p.document.visibilityState, 'visible');
  assert.equal(p.document.hasFocus(), true);
  let pageSawIt = false;
  p.document.addEventListener('visibilitychange', () => { pageSawIt = true; });
  p.window.addEventListener('blur', () => { pageSawIt = true; });
  p.document.dispatchEvent(new p.window.Event('visibilitychange'));
  p.window.dispatchEvent(new p.window.Event('blur'));
  assert.equal(pageSawIt, false);
  p.close();
});

test('blur on form fields still reaches the page', () => {
  const p = page('<input id="q">');
  let blurred = false;
  const input = p.document.getElementById('q');
  input.addEventListener('blur', () => { blurred = true; });
  input.dispatchEvent(new p.window.FocusEvent('blur'));
  assert.equal(blurred, true);
  p.close();
});

test('JSON.parse strips ad scheduling data and ad renderers', () => {
  const p = page();
  const raw = JSON.stringify({
    playabilityStatus: { status: 'OK' },
    streamingData: { adaptiveFormats: [{ itag: 251 }] },
    adPlacements: [{ adPlacementRenderer: {} }],
    playerAds: [{}],
    adSlots: [{}],
    contents: [{ musicShelfRenderer: { title: 'Songs' } }, { adSlotRenderer: {} }, { mealbarPromoRenderer: {} }],
    nested: { deeper: { adBreakHeartbeatParams: 'x', keep: 1 } },
  });
  const out = p.window.JSON.parse(raw);
  assert.equal(out.adPlacements, undefined);
  assert.equal(out.playerAds, undefined);
  assert.equal(out.adSlots, undefined);
  assert.equal(out.nested.deeper.adBreakHeartbeatParams, undefined);
  assert.equal(out.nested.deeper.keep, 1);
  assert.deepEqual(plain(out.contents.map((c) => Object.keys(c)[0])), ['musicShelfRenderer']);
  assert.equal(out.streamingData.adaptiveFormats[0].itag, 251);
  assert.equal(out.playabilityStatus.status, 'OK');
  p.close();
});

test('JSON.parse leaves ordinary data alone and keeps reviver working', () => {
  const p = page();
  assert.deepEqual(plain(p.window.JSON.parse('{"a":[1,2],"adaptive":true}')), { a: [1, 2], adaptive: true });
  assert.equal(p.window.JSON.parse('{"n":2}', (k, v) => (k === 'n' ? v * 2 : v)).n, 4);
  assert.equal(p.window.JSON.parse('"adPlacements"'), 'adPlacements');
  assert.throws(() => p.window.JSON.parse('{bad'));
  p.close();
});

test('fetch responses from the YouTube API are pruned', async () => {
  const p = page();
  const res = new p.window.Response(JSON.stringify({ adPlacements: [1], videoDetails: { title: 'Song' } }));
  Object.defineProperty(res, 'url', { value: 'https://music.youtube.com/youtubei/v1/player?prettyPrint=false' });
  const out = await res.json();
  assert.equal(out.adPlacements, undefined);
  assert.equal(out.videoDetails.title, 'Song');

  const other = new p.window.Response(JSON.stringify({ adPlacements: [1] }));
  Object.defineProperty(other, 'url', { value: 'https://example.com/data.json' });
  assert.deepEqual(plain((await other.json()).adPlacements), [1]);
  p.close();
});

test('initial player response embedded in the page is pruned', () => {
  const p = page();
  p.window.ytInitialPlayerResponse = { playerAds: [1], videoDetails: { videoId: 'x' } };
  assert.equal(p.window.ytInitialPlayerResponse.playerAds, undefined);
  assert.equal(p.window.ytInitialPlayerResponse.videoDetails.videoId, 'x');
  p.close();
});

test('hides ad and Premium banner elements', () => {
  const p = page();
  const css = p.document.getElementById('swar-style').textContent;
  assert.match(css, /ytmusic-mealbar-promo-renderer/);
  assert.match(css, /display: none !important/);
  p.close();
});

test('a leftover ad is muted, skipped to the end and unmuted afterwards', () => {
  const p = page('<div id="movie_player" class="html5-video-player ad-showing"><button class="ytp-skip-ad-button">Skip</button></div>');
  const v = fakeVideo(p.document, { paused: false, duration: 30, currentTime: 2 });
  p.document.getElementById('movie_player').appendChild(v);
  let skipped = false;
  p.document.querySelector('.ytp-skip-ad-button').addEventListener('click', () => { skipped = true; });

  v.dispatchEvent(new p.window.Event('playing'));
  assert.equal(v.muted, true);
  assert.ok(v.currentTime > 29.8);
  assert.equal(skipped, true);
  assert.equal(p.messages.at(-1).ad, true);

  p.document.getElementById('movie_player').classList.remove('ad-showing');
  v.dispatchEvent(new p.window.Event('playing'));
  assert.equal(v.muted, false);
  p.close();
});

test('a muted song stays muted when no ad played', () => {
  const p = page('<div id="movie_player" class="html5-video-player"></div>');
  const v = fakeVideo(p.document, { paused: false, duration: 200, muted: true });
  p.document.getElementById('movie_player').appendChild(v);
  v.dispatchEvent(new p.window.Event('playing'));
  assert.equal(v.muted, true);
  p.close();
});

test('reports the current track to the app', () => {
  const p = page();
  const v = fakeVideo(p.document, { paused: false, duration: 245.4, currentTime: 61.2 });
  p.document.body.appendChild(v);
  p.window.navigator.mediaSession.metadata = {
    title: 'Song', artist: 'Artist', album: 'Album',
    artwork: [
      { src: 'https://lh3.googleusercontent.com/a=w60', sizes: '60x60' },
      { src: 'https://lh3.googleusercontent.com/a=w544', sizes: '544x544' },
      { src: 'https://lh3.googleusercontent.com/a=w226', sizes: '226x226' },
    ],
  };
  v.dispatchEvent(new p.window.Event('play'));
  assert.deepEqual(p.messages.at(-1), {
    type: 'state', playing: true, title: 'Song', artist: 'Artist', album: 'Album',
    artwork: 'https://lh3.googleusercontent.com/a=w544', duration: 245400, position: 61200, ad: false,
  });
  const count = p.messages.length;
  p.window.__swar.report();
  assert.equal(p.messages.length, count, 'unchanged state is not resent');
  p.close();
});

test('commands use the page media-session handlers first', () => {
  const p = page();
  const calls = [];
  for (const action of ['play', 'pause', 'nexttrack', 'previoustrack', 'seekto']) {
    p.window.navigator.mediaSession.setActionHandler(action, (d) => calls.push([d.action, d.seekTime]));
  }
  p.window.__swar.cmd('play');
  p.window.__swar.cmd('pause');
  p.window.__swar.cmd('next');
  p.window.__swar.cmd('prev');
  p.window.__swar.cmd('seek', 83.5);
  p.window.__swar.cmd('seek', 'nope');
  p.window.__swar.cmd('unknown');
  assert.deepEqual(calls, [['play', undefined], ['pause', undefined], ['nexttrack', undefined], ['previoustrack', undefined], ['seekto', 83.5]]);
  p.close();
});

test('commands fall back to the player bar and the video element', () => {
  const p = page('<ytmusic-player-bar><button class="previous-button"></button><button class="next-button"></button></ytmusic-player-bar>');
  const v = fakeVideo(p.document, { paused: true, duration: 100 });
  p.document.body.appendChild(v);
  const clicks = [];
  p.document.querySelector('.next-button').addEventListener('click', () => clicks.push('next'));
  p.document.querySelector('.previous-button').addEventListener('click', () => clicks.push('prev'));

  p.window.__swar.cmd('play');
  assert.equal(v.paused, false);
  p.window.__swar.cmd('pause');
  assert.equal(v.paused, true);
  p.window.__swar.cmd('next');
  p.window.__swar.cmd('prev');
  assert.deepEqual(clicks, ['next', 'prev']);
  p.window.__swar.cmd('seek', 42);
  assert.equal(v.currentTime, 42);
  p.close();
});

test('tells the app when the YouTube Music UI has drawn', async () => {
  const p = page();
  p.window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(p.messages.some((m) => m.type === 'ready'), false, 'not before the UI exists');
  p.document.body.insertAdjacentHTML('beforeend', '<ytmusic-app><ytmusic-pivot-bar-renderer></ytmusic-pivot-bar-renderer></ytmusic-app>');
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(p.messages.filter((m) => m.type === 'ready').length, 1);
  p.close();
});

test('feels like an app: no tap highlight, selection or overscroll', () => {
  const p = page();
  const css = p.document.getElementById('swar-style').textContent;
  assert.match(css, /-webkit-tap-highlight-color: transparent/);
  assert.match(css, /overscroll-behavior: none/);
  assert.match(css, /:not\(input\):not\(textarea\)/);
  p.close();
});

const AV_TOGGLE = '<ytmusic-av-toggle><button class="song-button">Song</button><button class="video-button">Video</button></ytmusic-av-toggle>';

test('a video that starts playing switches to its song right away', async () => {
  const p = page(AV_TOGGLE);
  const v = fakeVideo(p.document, { paused: false, duration: 200, currentTime: 3, videoWidth: 1280, videoHeight: 720, readyState: 4 });
  p.document.body.appendChild(v);
  const clicks = [];
  p.document.querySelector('.song-button').addEventListener('click', () => {
    clicks.push('song');
    v.videoWidth = 0; v.videoHeight = 0; v.paused = true; // stream reloads as audio only
  });
  p.document.querySelector('.video-button').addEventListener('click', () => clicks.push('video'));

  v.dispatchEvent(new p.window.Event('playing'));
  assert.deepEqual(clicks, ['song']);
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(v.paused, false, 'keeps playing after the switch');

  v.dispatchEvent(new p.window.Event('playing'));
  p.window.__swar.cmd('background');
  assert.deepEqual(clicks, ['song'], 'audio only now: nothing more to switch, never back to video');
  p.close();
});

test('does not click repeatedly while the song stream loads', () => {
  const p = page(AV_TOGGLE);
  const v = fakeVideo(p.document, { paused: false, duration: 200, videoWidth: 1280, videoHeight: 720 });
  p.document.body.appendChild(v);
  let clicks = 0;
  p.document.querySelector('.song-button').addEventListener('click', () => { clicks += 1; }); // video still showing
  for (let i = 0; i < 5; i++) v.dispatchEvent(new p.window.Event('loadedmetadata'));
  assert.equal(clicks, 1);
  p.close();
});

test('songs, ads and videos without a song version are left alone', () => {
  const p = page(AV_TOGGLE);
  const v = fakeVideo(p.document, { paused: false, duration: 200, videoWidth: 0, videoHeight: 0 });
  p.document.body.appendChild(v);
  const clicks = [];
  p.document.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => clicks.push(b.className)));
  v.dispatchEvent(new p.window.Event('playing')); // already the song
  assert.deepEqual(clicks, []);
  p.close();

  const ad = page(`<div id="movie_player" class="html5-video-player ad-showing"></div>${AV_TOGGLE}`);
  const av = fakeVideo(ad.document, { paused: false, duration: 15, videoWidth: 1280, videoHeight: 720 });
  ad.document.getElementById('movie_player').appendChild(av);
  let adClicks = 0;
  ad.document.querySelector('.song-button').addEventListener('click', () => { adClicks += 1; });
  ad.window.__swar.cmd('background');
  assert.equal(adClicks, 0, 'never switches during an ad');
  ad.close();

  const q = page(); // no Song | Video switch on this track
  const w = fakeVideo(q.document, { paused: false, duration: 200, videoWidth: 1280, videoHeight: 720 });
  q.document.body.appendChild(w);
  w.dispatchEvent(new q.window.Event('playing'));
  assert.equal(w.paused, false);
  q.close();
});

test('running the script twice is harmless', () => {
  const p = page();
  const parse = p.window.JSON.parse;
  p.window.eval(SCRIPT);
  assert.equal(p.window.JSON.parse, parse);
  p.close();
});
