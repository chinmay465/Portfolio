// Tests for app/src/main/assets/swar.js in a simulated YouTube Music page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

// Objects made inside the page have the page's prototypes; compare as plain data.
const plain = (x) => JSON.parse(JSON.stringify(x));
const lastState = (p) => p.messages.filter((m) => m.type === 'state').at(-1);

const SCRIPT = readFileSync(new URL('../app/src/main/assets/swar.js', import.meta.url), 'utf8');

function page(html = '', { quality, before } = {}) {
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
  if (quality) window.__swarAudioQuality = quality; // what the app puts in front of the script
  if (before) before(window);
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
  assert.equal(lastState(p).ad, true);

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
  assert.deepEqual(lastState(p), {
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
  assert.match(css, /html \{[^}]*user-select: none/);
  assert.match(css, /input, textarea, \[contenteditable\] \{[^}]*user-select: text/);
  assert.doesNotMatch(css, /\*:not\(/, 'no universal selector: it slows every style recalc');
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

const withPlayerType = (p, type, id = 'abc') => {
  const mp = p.document.createElement('div');
  mp.id = 'movie_player';
  mp.className = 'html5-video-player';
  mp.getPlayerResponse = () => ({ videoDetails: { videoId: id, musicVideoType: type } });
  p.document.body.appendChild(mp);
  return mp;
};

test('uses the player\'s own track type: official video switches, song does not', () => {
  const p = page(AV_TOGGLE);
  const mp = withPlayerType(p, 'MUSIC_VIDEO_TYPE_OMV');
  const v = fakeVideo(p.document, { paused: false, duration: 200, videoWidth: 0, videoHeight: 0 }); // picture not known yet
  mp.appendChild(v);
  let clicks = 0;
  p.document.querySelector('.song-button').addEventListener('click', () => { clicks += 1; });
  v.dispatchEvent(new p.window.Event('playing'));
  assert.equal(clicks, 1, 'official music video switches even before its picture size is known');
  p.close();

  const q = page(AV_TOGGLE);
  const mq = withPlayerType(q, 'MUSIC_VIDEO_TYPE_ATV');
  const w = fakeVideo(q.document, { paused: false, duration: 200, videoWidth: 640, videoHeight: 640 });
  mq.appendChild(w);
  let songClicks = 0;
  q.document.querySelector('.song-button').addEventListener('click', () => { songClicks += 1; });
  w.dispatchEvent(new q.window.Event('playing'));
  assert.equal(songClicks, 0, 'already the song (cover art counts as a picture)');
  q.close();
});

test('finds the Song switch by its label when the class names differ', () => {
  const p = page('<ytmusic-player-page><div role="tablist"><button role="tab">Song</button><button role="tab">Video</button></div></ytmusic-player-page>');
  const mp = withPlayerType(p, 'MUSIC_VIDEO_TYPE_OMV');
  const v = fakeVideo(p.document, { paused: false, duration: 200, videoWidth: 1280, videoHeight: 720 });
  mp.appendChild(v);
  const clicks = [];
  p.document.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => clicks.push(b.textContent)));
  v.dispatchEvent(new p.window.Event('playing'));
  assert.deepEqual(clicks, ['Song']);
  p.close();

  const hi = page('<ytmusic-player-page><button>गाना</button><button>वीडियो</button></ytmusic-player-page>');
  const mh = withPlayerType(hi, 'MUSIC_VIDEO_TYPE_OMV');
  const vh = fakeVideo(hi.document, { paused: false, duration: 200, videoWidth: 1280, videoHeight: 720 });
  mh.appendChild(vh);
  let hindi = 0;
  hi.document.querySelector('button').addEventListener('click', () => { hindi += 1; });
  vh.dispatchEvent(new hi.window.Event('playing'));
  assert.equal(hindi, 1, 'Hindi label');
  hi.close();
});

test('reports the page layout once when an official video has no findable Song switch', () => {
  const p = page('<ytmusic-player-page><ytmusic-mystery-switch><button>Audio</button></ytmusic-mystery-switch></ytmusic-player-page>');
  const mp = withPlayerType(p, 'MUSIC_VIDEO_TYPE_OMV', 'vid1');
  const v = fakeVideo(p.document, { paused: false, duration: 200, videoWidth: 1280, videoHeight: 720 });
  mp.appendChild(v);
  v.dispatchEvent(new p.window.Event('playing'));
  v.dispatchEvent(new p.window.Event('playing'));
  const diags = p.messages.filter((m) => m.type === 'diag');
  assert.equal(diags.length, 1);
  assert.equal(diags[0].reason, 'no-song-button');
  assert.equal(diags[0].videoType, 'MUSIC_VIDEO_TYPE_OMV');
  assert.equal(diags[0].avToggle, 'missing');
  assert.ok(diags[0].tags.includes('ytmusic-mystery-switch'));
  assert.deepEqual(plain(diags[0].labels), ['Audio']);
  assert.equal(JSON.stringify(diags[0]).includes('http'), false, 'no URLs in the report');
  p.close();

  const q = page(); // uploaded video with no song version: nothing to report
  const mq = withPlayerType(q, 'MUSIC_VIDEO_TYPE_UGC');
  const w = fakeVideo(q.document, { paused: false, duration: 200, videoWidth: 1280, videoHeight: 720 });
  mq.appendChild(w);
  w.dispatchEvent(new q.window.Event('playing'));
  assert.equal(q.messages.some((m) => m.type === 'diag'), false);
  q.close();
});

test('when YouTube disables the Song switch: lowest quality, cover art instead of the picture', () => {
  const p = page(`<ytmusic-player playback-mode="OMV_PREFERRED"><div id="song-image"><img src="data:,"></div><div id="song-video"></div></ytmusic-player>
    <ytmusic-av-toggle toggle-disabled audio-only-playback-available selected-item-has-video><button class="song-button">Song</button><button class="video-button">Video</button></ytmusic-av-toggle>`);
  const mp = withPlayerType(p, 'MUSIC_VIDEO_TYPE_OMV', 'v1');
  const quality = [];
  mp.setPlaybackQualityRange = (lo, hi) => quality.push(`${lo}-${hi}`);
  mp.getPlayerResponse = () => ({ videoDetails: { videoId: 'v1', musicVideoType: 'MUSIC_VIDEO_TYPE_OMV', thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/v1/hq.jpg?x=1' }, { url: 'https://i.ytimg.com/vi/v1/maxres.jpg?x=1' }] } } });
  const v = fakeVideo(p.document, { paused: false, duration: 200, videoWidth: 640, videoHeight: 360 });
  mp.appendChild(v);
  let clicks = 0;
  p.document.querySelector('.song-button').addEventListener('click', () => { clicks += 1; });

  v.dispatchEvent(new p.window.Event('playing'));
  assert.equal(clicks, 0, 'a disabled switch is not clicked');
  assert.ok(p.document.documentElement.classList.contains('swar-low-data'));
  assert.deepEqual(quality, ['tiny-tiny']);
  assert.equal(p.document.querySelector('ytmusic-player').getAttribute('playback-mode'), 'ATV_PREFERRED');
  assert.equal(p.document.querySelector('#song-image img').getAttribute('src'), 'https://i.ytimg.com/vi/v1/maxres.jpg');
  assert.equal(p.messages.some((m) => m.type === 'diag'), false, 'nothing to report: YouTube turned the switch off');

  v.dispatchEvent(new p.window.Event('playing'));
  assert.deepEqual(quality, ['tiny-tiny'], 'set once per video');

  // Next track is a song: back to normal
  mp.getPlayerResponse = () => ({ videoDetails: { videoId: 's2', musicVideoType: 'MUSIC_VIDEO_TYPE_ATV' } });
  v.dispatchEvent(new p.window.Event('playing'));
  assert.equal(p.document.documentElement.classList.contains('swar-low-data'), false);
  assert.deepEqual(quality, ['tiny-tiny', 'auto-auto']);
  p.close();
});

test('the report includes attribute values', () => {
  const p = page('<ytmusic-player-page><ytmusic-av-toggle playback-mode="OMV_PREFERRED"><button class="song-button">Song</button></ytmusic-av-toggle></ytmusic-player-page>');
  p.window.eval("document.querySelector('ytmusic-av-toggle')"); // present, enabled
  const mp = withPlayerType(p, 'MUSIC_VIDEO_TYPE_OMV', 'v9');
  const v = fakeVideo(p.document, { paused: false, duration: 200, videoWidth: 640, videoHeight: 360 });
  mp.appendChild(v);
  p.window.__swar.cmd('background');
  return new Promise((resolve) => setTimeout(() => {
    const d = p.messages.find((m) => m.type === 'diag');
    assert.ok(d, 'click had no effect is reported');
    assert.equal(d.reason, 'click-had-no-effect');
    assert.match(d.avToggle, /playback-mode=OMV_PREFERRED/);
    p.close();
    resolve();
  }, 4800));
});

// A trimmed YouTube Music search response: a video result, then songs.
const listItem = (id, type, title, subtitle) => ({
  musicResponsiveListItemRenderer: {
    playlistItemData: { videoId: id },
    overlay: { musicItemThumbnailOverlayRenderer: { content: { musicPlayButtonRenderer: { playNavigationEndpoint: {
      watchEndpoint: { videoId: id, watchEndpointMusicSupportedConfigs: { watchEndpointMusicConfig: { musicVideoType: type } } },
    } } } } },
    flexColumns: [
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: title }] } } },
      { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: subtitle }] } } },
    ],
  },
});
const searchResponse = (...items) => ({ contents: { tabbedSearchResultsRenderer: { tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [{ musicShelfRenderer: { contents: items } }] } } } }] } } });

test('normalises video titles to the song title', () => {
  const p = page();
  const n = p.window.__swar.normalizeTitle;
  assert.equal(n('Kesariya (Official Video) | Brahmāstra'), 'kesariya');
  assert.equal(n('Tum Hi Ho [Full Video Song] - Aashiqui 2'), 'tum hi ho aashiqui 2');
  assert.equal(n('Apna Bana Le - Official Music Video | Bhediya'), 'apna bana le');
  assert.equal(n('Heeriye (feat. Arijit Singh)'), 'heeriye');
  assert.equal(n('Song ft. Someone Else'), 'song');
  p.close();
});

test('picks the song version only when title and artist clearly match', () => {
  const p = page();
  const pick = (resp, wanted) => p.window.__swar.pickSongVersion(resp, wanted);
  const resp = searchResponse(
    listItem('omv1', 'MUSIC_VIDEO_TYPE_OMV', 'Kesariya (Official Video)', 'Video • Pritam, Arijit Singh • 120M views'),
    listItem('cover', 'MUSIC_VIDEO_TYPE_ATV', 'Kesariya (Cover)', 'Song • Some Cover Band • 3:10'),
    listItem('atv1', 'MUSIC_VIDEO_TYPE_ATV', 'Kesariya', 'Song • Pritam, Arijit Singh & Amitabh Bhattacharya • Brahmastra • 4:28'),
  );
  assert.equal(pick(resp, { title: 'Kesariya (Official Video) | Brahmāstra', artist: 'Arijit Singh' }).id, 'atv1');
  assert.equal(pick(resp, { title: 'Kesariya', artist: 'Some Unrelated Singer' }), null, 'artist must match');
  const film = searchResponse(listItem('th', 'MUSIC_VIDEO_TYPE_ATV', 'Tum Hi Ho', 'Song • Arijit Singh • Aashiqui 2 • 4:22'));
  assert.equal(pick(film, { title: 'Tum Hi Ho - Aashiqui 2', artist: 'Arijit Singh' }).id, 'th', 'song - film titles');
  assert.equal(pick(resp, { title: 'Deva Deva', artist: 'Arijit Singh' }), null, 'title must match');
  assert.equal(pick(searchResponse(listItem('omv1', 'MUSIC_VIDEO_TYPE_OMV', 'Kesariya', 'Arijit Singh')), { title: 'Kesariya', artist: 'Arijit Singh' }), null, 'videos are not songs');
  p.close();
});

test('no usable Song switch: searches, then plays the matching song', async () => {
  const p = page('<ytmusic-app></ytmusic-app><ytmusic-av-toggle toggle-disabled><button class="song-button">Song</button></ytmusic-av-toggle>');
  const mp = withPlayerType(p, 'MUSIC_VIDEO_TYPE_OMV', 'omv1');
  p.window.ytcfg = { get: (k) => ({ INNERTUBE_CONTEXT: { client: { clientName: 'WEB_REMIX' } }, VISITOR_DATA: 'vis' })[k] };
  p.window.navigator.mediaSession.metadata = { title: 'Kesariya (Official Video)', artist: 'Pritam, Arijit Singh', album: '', artwork: [] };
  const requests = [];
  p.window.fetch = (url, init) => {
    requests.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(searchResponse(
      listItem('atv1', 'MUSIC_VIDEO_TYPE_ATV', 'Kesariya', 'Song • Pritam, Arijit Singh • Brahmastra • 4:28'),
    ))));
  };
  const navigations = [];
  p.document.querySelector('ytmusic-app').addEventListener('yt-navigate', (e) => {
    navigations.push(e.detail.endpoint.watchEndpoint.videoId);
    mp.getPlayerResponse = () => ({ videoDetails: { videoId: 'atv1', musicVideoType: 'MUSIC_VIDEO_TYPE_ATV' } });
  });
  const v = fakeVideo(p.document, { paused: false, duration: 260, videoWidth: 640, videoHeight: 360 });
  mp.appendChild(v);

  v.dispatchEvent(new p.window.Event('playing'));
  assert.ok(p.document.documentElement.classList.contains('swar-low-data'), 'low-data while searching');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/youtubei/v1/search?prettyPrint=false', 'same-site search API only');
  assert.equal(requests[0].init.credentials, 'same-origin');
  assert.equal(JSON.parse(requests[0].init.body).query, 'kesariya Pritam, Arijit Singh');
  assert.deepEqual(navigations, ['atv1']);

  const switchMsgs = () => p.messages.filter((m) => m.type === 'switch').map((m) => m.phase);
  assert.deepEqual(switchMsgs(), ['start'], 'card shows while switching');
  assert.equal(p.messages.find((m) => m.type === 'switch').title, 'Kesariya');
  assert.equal(v.muted, true, 'video muted during the switch');

  v.dispatchEvent(new p.window.Event('playing')); // the song is playing now
  assert.equal(requests.length, 1, 'searched once per video');
  assert.deepEqual(switchMsgs(), ['start', 'done']);
  assert.equal(v.muted, false, 'sound back on for the song');
  p.close();
});

test('no clear match: stays on low-data video', async () => {
  const p = page('<ytmusic-app></ytmusic-app>');
  const mp = withPlayerType(p, 'MUSIC_VIDEO_TYPE_UGC', 'ugc1');
  p.window.ytcfg = { get: (k) => ({ INNERTUBE_CONTEXT: { client: {} } })[k] };
  p.window.navigator.mediaSession.metadata = { title: 'My vlog song', artist: 'Random Uploader', album: '', artwork: [] };
  p.window.fetch = () => Promise.resolve(new Response(JSON.stringify(searchResponse(
    listItem('x', 'MUSIC_VIDEO_TYPE_ATV', 'Something Else', 'Song • Another Artist'),
  ))));
  let navigated = false;
  p.document.querySelector('ytmusic-app').addEventListener('yt-navigate', () => { navigated = true; });
  const v = fakeVideo(p.document, { paused: false, duration: 200, videoWidth: 640, videoHeight: 360 });
  mp.appendChild(v);
  v.dispatchEvent(new p.window.Event('playing'));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(navigated, false);
  assert.ok(p.document.documentElement.classList.contains('swar-low-data'));
  assert.deepEqual(p.messages.filter((m) => m.type === 'switch').map((m) => m.phase), ['start', 'none'], 'card goes away');
  assert.equal(v.muted, false, 'sound back on for the low-data video');
  p.close();
});

test('running the script twice is harmless', () => {
  const p = page();
  const parse = p.window.JSON.parse;
  p.window.eval(SCRIPT);
  assert.equal(p.window.JSON.parse, parse);
  p.close();
});

// ---------------------------------------------------------------- audio quality
const playerResponse = (id = 'song1') => ({
  videoDetails: { videoId: id, musicVideoType: 'MUSIC_VIDEO_TYPE_ATV' },
  streamingData: {
    adaptiveFormats: [
      { itag: 248, mimeType: 'video/webm; codecs="vp9"', bitrate: 2500000 },
      { itag: 249, mimeType: 'audio/webm; codecs="opus"', bitrate: 60000, averageBitrate: 52000 },
      { itag: 250, mimeType: 'audio/webm; codecs="opus"', bitrate: 80000, averageBitrate: 68000 },
      { itag: 251, mimeType: 'audio/webm; codecs="opus"', bitrate: 150000, averageBitrate: 131000 },
      { itag: 139, mimeType: 'audio/mp4; codecs="mp4a.40.5"', bitrate: 50000, averageBitrate: 48000 },
      { itag: 140, mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 130000, averageBitrate: 129000 },
    ],
  },
});
const itags = (r) => r.streamingData.adaptiveFormats.map((f) => f.itag);

test('audio quality Auto leaves every format to YouTube', () => {
  const p = page();
  const out = p.window.JSON.parse(JSON.stringify(playerResponse()));
  assert.deepEqual(plain(itags(out)), [248, 249, 250, 251, 139, 140]);
  assert.equal(p.window.__swar.getAudioQuality(), 'auto');
  p.close();
});

test('audio quality High keeps only the best audio of each kind; video untouched', () => {
  const p = page('', { quality: 'high' });
  const out = p.window.JSON.parse(JSON.stringify(playerResponse()));
  assert.deepEqual(plain(itags(out)), [248, 251, 140]);
  p.close();
});

test('audio quality Low keeps only the lowest audio of each kind', () => {
  const p = page('', { quality: 'low' });
  const out = p.window.JSON.parse(JSON.stringify(playerResponse()));
  assert.deepEqual(plain(itags(out)), [248, 249, 139]);
  p.close();
});

test('High works on fetched and embedded player responses, and keeps language tracks apart', async () => {
  const p = page('', { quality: 'high' });
  const res = new p.window.Response(JSON.stringify({ playerResponse: playerResponse('a') }));
  Object.defineProperty(res, 'url', { value: 'https://music.youtube.com/youtubei/v1/next?prettyPrint=false' });
  assert.deepEqual(plain(itags((await res.json()).playerResponse)), [248, 251, 140]);

  const embedded = playerResponse('b');
  embedded.streamingData.adaptiveFormats.push(
    { itag: 251, mimeType: 'audio/webm; codecs="opus"', bitrate: 140000, audioTrack: { id: 'hi.4' } },
    { itag: 250, mimeType: 'audio/webm; codecs="opus"', bitrate: 70000, audioTrack: { id: 'hi.4' } },
  );
  p.window.ytInitialPlayerResponse = embedded;
  const kept = p.window.ytInitialPlayerResponse.streamingData.adaptiveFormats;
  assert.deepEqual(plain(kept.filter((f) => f.audioTrack).map((f) => f.itag)), [251]);
  p.close();
});

test('a quality change from the app applies to the next player response', () => {
  const p = page();
  p.window.__swar.cmd('quality', 'high');
  assert.equal(p.window.__swar.getAudioQuality(), 'high');
  assert.deepEqual(plain(itags(p.window.JSON.parse(JSON.stringify(playerResponse())))), [248, 251, 140]);
  p.window.__swar.cmd('quality', 'nonsense');
  assert.equal(p.window.__swar.getAudioQuality(), 'high', 'unknown values are ignored');
  p.close();
});

test('reports the playing audio format and the best on offer, and whether the player page is open', () => {
  const p = page('<ytmusic-app-layout></ytmusic-app-layout>', { quality: 'low' });
  p.window.JSON.parse(JSON.stringify(playerResponse('song1')));
  const mp = p.document.createElement('div');
  mp.id = 'movie_player';
  mp.getPlayerResponse = () => ({ videoDetails: { videoId: 'song1', musicVideoType: 'MUSIC_VIDEO_TYPE_ATV' } });
  mp.getVideoStats = () => ({ afmt: '249' });
  p.document.body.appendChild(mp);

  p.window.__swar.reportAudio();
  let last = p.messages.filter((m) => m.type === 'audio').pop();
  assert.deepEqual(plain(last), { type: 'audio', open: false, quality: 'low', codec: 'Opus', kbps: 52, measured: false, best: 131, tiers: { low: 68, normal: 131, high: 0 } });

  p.document.querySelector('ytmusic-app-layout').setAttribute('player-page-open', '');
  mp.getVideoStats = () => ({});
  mp.getStatsForNerds = () => ({ codecs: 'vp09.00.40.08 (248) / mp4a.40.2 (140)' });
  p.window.__swar.reportAudio();
  last = p.messages.filter((m) => m.type === 'audio').pop();
  assert.equal(last.open, true);
  assert.equal(last.codec, 'AAC');
  assert.equal(last.kbps, 129);
  p.close();
});

// Minimal Media Source Extensions: buffered grows by `seconds` per append.
function fakeMse(window) {
  class SourceBuffer extends window.EventTarget {
    constructor() { super(); this.end = 0; }
    get buffered() { const end = this.end; return { length: end ? 1 : 0, start: () => 0, end: () => end }; }
    appendBuffer(data) {
      this.end += data.seconds || 0;
      setTimeout(() => this.dispatchEvent(new window.Event('updateend')), 0);
    }
  }
  class MediaSource { addSourceBuffer() { return new SourceBuffer(); } }
  window.SourceBuffer = SourceBuffer;
  window.MediaSource = MediaSource;
}
const chunk = (bytes, seconds) => Object.assign(new ArrayBuffer(bytes), { seconds });
const playerFor = (p, id, extra = {}) => {
  const mp = p.document.createElement('div');
  mp.id = 'movie_player';
  mp.getPlayerResponse = () => ({ videoDetails: { videoId: id, musicVideoType: 'MUSIC_VIDEO_TYPE_ATV' } });
  Object.assign(mp, extra);
  p.document.body.appendChild(mp);
  return mp;
};

test('Auto mode: bitrate is measured from the audio when the player does not name its format', async () => {
  const p = page('', { before: fakeMse });
  playerFor(p, 'song1'); // no getVideoStats, no stats for nerds, response never seen
  const ms = new p.window.MediaSource();
  const audio = ms.addSourceBuffer('audio/webm; codecs="opus"');
  const video = ms.addSourceBuffer('video/webm; codecs="vp9"');
  audio.appendBuffer(chunk(900, 0)); // init segment: no time added, ignored
  await new Promise((r) => setTimeout(r, 5));
  for (let i = 0; i < 3; i++) { // 128 kbps; one append at a time, as MSE requires
    audio.appendBuffer(chunk(160000, 10));
    await new Promise((r) => setTimeout(r, 5));
  }
  video.appendBuffer(chunk(5000000, 10)); // video never counts
  await new Promise((r) => setTimeout(r, 20));
  p.window.__swar.reportAudio();
  const last = p.messages.filter((m) => m.type === 'audio').pop();
  assert.equal(last.quality, 'auto');
  assert.equal(last.codec, 'Opus');
  assert.equal(last.kbps, 128);
  assert.equal(last.measured, true);
  p.close();
});

test('bitrate from the player\'s own response when the response slipped past the hooks', () => {
  const p = page();
  const full = playerResponse('song2');
  playerFor(p, 'song2', { getPlayerResponse: () => full, getVideoStats: () => ({ afmt: '251' }) });
  p.window.__swar.reportAudio();
  const last = p.messages.filter((m) => m.type === 'audio').pop();
  assert.deepEqual([last.codec, last.kbps, last.measured, last.best], ['Opus', 131, false, 131]);
  p.close();
});

test('in the background: no player-page check, and only every few seconds', async () => {
  const p = page('<ytmusic-app-layout player-page-open></ytmusic-app-layout>');
  let checks = 0;
  const qs = p.document.querySelector.bind(p.document);
  p.document.querySelector = (sel) => { if (String(sel).includes('player-page-open')) checks += 1; return qs(sel); };
  p.window.__swar.cmd('background');
  checks = 0;
  await new Promise((r) => setTimeout(r, 1300));
  assert.equal(checks, 0, 'layout-reading check skipped off screen');
  p.window.__swar.cmd('foreground');
  const last = p.messages.filter((m) => m.type === 'audio').pop();
  assert.equal(last.open, true);
  p.close();
});

test('bitrate follows the playing track through the video-to-song switch', async () => {
  const p = page(AV_TOGGLE);
  p.window.JSON.parse(JSON.stringify(playerResponse('vid1')));
  const songResp = playerResponse('song1');
  songResp.streamingData.adaptiveFormats.find((f) => f.itag === 251).averageBitrate = 141000;
  p.window.JSON.parse(JSON.stringify(songResp));

  let current = { id: 'vid1', type: 'MUSIC_VIDEO_TYPE_OMV', afmt: '140' };
  const mp = playerFor(p, 'vid1', {
    getPlayerResponse: () => ({ videoDetails: { videoId: current.id, musicVideoType: current.type } }),
    getVideoStats: () => ({ afmt: current.afmt }),
  });
  const v = fakeVideo(p.document, { paused: false, duration: 200, videoWidth: 1280, videoHeight: 720, readyState: 4 });
  mp.appendChild(v);
  const audioMsgs = () => p.messages.filter((m) => m.type === 'audio');

  p.window.__swar.reportAudio();
  assert.equal(audioMsgs().pop().kbps, 129, 'the video\'s audio while it plays');

  v.dispatchEvent(new p.window.Event('playing')); // Swar starts switching to the song
  assert.equal(audioMsgs().pop().kbps, 0, 'nothing shown mid-switch');

  current = { id: 'song1', type: 'MUSIC_VIDEO_TYPE_ATV', afmt: '251' }; // song stream in
  v.videoWidth = 0; v.videoHeight = 0;
  v.dispatchEvent(new p.window.Event('playing'));
  const last = audioMsgs().pop();
  assert.deepEqual([last.codec, last.kbps], ['Opus', 141], 'the song\'s own bitrate');
  p.close();
});

const premiumResponse = (id) => {
  const r = playerResponse(id);
  r.streamingData.adaptiveFormats.push(
    { itag: 774, mimeType: 'audio/webm; codecs="opus"', bitrate: 270000, averageBitrate: 256000 },
    { itag: 141, mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 260000, averageBitrate: 255000 },
  );
  return r;
};

test('audio quality Normal caps at the Normal tier, even on Premium', () => {
  const p = page('', { quality: 'normal' });
  const out = p.window.JSON.parse(JSON.stringify(premiumResponse('s')));
  assert.deepEqual(plain(itags(out)), [248, 251, 140]);
  const high = page('', { quality: 'high' });
  assert.deepEqual(plain(itags(high.window.JSON.parse(JSON.stringify(premiumResponse('s'))))), [248, 774, 141]);
  p.close();
  high.close();
});

test('reports which tiers this song offers, so missing ones can be shown disabled', () => {
  const p = page();
  p.window.JSON.parse(JSON.stringify(premiumResponse('prem')));
  p.window.JSON.parse(JSON.stringify(playerResponse('free')));
  let id = 'prem';
  playerFor(p, 'prem', {
    getPlayerResponse: () => ({ videoDetails: { videoId: id, musicVideoType: 'MUSIC_VIDEO_TYPE_ATV' } }),
    getVideoStats: () => ({ afmt: id === 'prem' ? '774' : '251' }),
  });
  p.window.__swar.reportAudio();
  let last = p.messages.filter((m) => m.type === 'audio').pop();
  assert.deepEqual(plain(last.tiers), { low: 68, normal: 131, high: 256 });
  id = 'free';
  p.window.__swar.reportAudio();
  last = p.messages.filter((m) => m.type === 'audio').pop();
  assert.deepEqual(plain(last.tiers), { low: 68, normal: 131, high: 0 }, 'no 256 kbps on offer: High disabled');
  p.close();
});

test('notification info falls back to the player and the player bar when media-session metadata is missing', () => {
  const p = page(`<ytmusic-player-bar>
      <img class="image" src="https://lh3.googleusercontent.com/abc=w60-h60-l90-rj">
      <yt-formatted-string class="title" title="Kesariya">Kesariya</yt-formatted-string>
      <span class="byline">Arijit Singh • Brahmastra • 2022</span>
    </ytmusic-player-bar>`);
  const v = fakeVideo(p.document, { paused: false, duration: 268, currentTime: 5 });
  p.document.body.appendChild(v);
  v.dispatchEvent(new p.window.Event('playing'));
  const s = lastState(p);
  assert.equal(s.title, 'Kesariya');
  assert.equal(s.artist, 'Arijit Singh');
  assert.equal(s.artwork, 'https://lh3.googleusercontent.com/abc=w544-h544-l90-rj', 'full-size cover');
  p.close();

  const q = page(); // no bar either: the player's own track details
  playerFor(q, 'x', {
    getPlayerResponse: () => ({ videoDetails: {
      videoId: 'x', musicVideoType: 'MUSIC_VIDEO_TYPE_ATV', title: 'Tum Hi Ho', author: 'Arijit Singh',
      thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/x/default.jpg' }, { url: 'https://i.ytimg.com/vi/x/sddefault.jpg?sqp=1' }] },
    } }),
  });
  q.window.__swar.report();
  const t = lastState(q);
  assert.deepEqual([t.title, t.artist, t.artwork], ['Tum Hi Ho', 'Arijit Singh', 'https://i.ytimg.com/vi/x/sddefault.jpg']);
  q.close();
});

// ---- Gestures: swipe the player down to minimise, mini player up to open, Back minimises.
const PLAYER = `<ytmusic-app><ytmusic-app-layout player-page-open>
  <ytmusic-player-page>
    <button class="minimise" aria-label="Minimise player"></button>
    <div class="art"></div>
    <tp-yt-paper-slider id="progress-bar"><div class="knob"></div></tp-yt-paper-slider>
  </ytmusic-player-page>
  <ytmusic-player-bar><div class="content-info-wrapper"></div><button class="toggle-player-page-button"></button></ytmusic-player-bar>
</ytmusic-app-layout></ytmusic-app>`;

function touch(p, el, type, x, y) {
  const e = new p.window.Event(type, { bubbles: true, cancelable: true });
  const point = { clientX: x, clientY: y };
  Object.defineProperty(e, 'touches', { value: type === 'touchend' ? [] : [point] });
  Object.defineProperty(e, 'changedTouches', { value: [point] });
  el.dispatchEvent(e);
  return e;
}

function swipe(p, el, from, to, steps = 6) {
  touch(p, el, 'touchstart', from[0], from[1]);
  let last;
  for (let i = 1; i <= steps; i++) {
    last = touch(p, el, 'touchmove', from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps);
  }
  return last;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function minimiser(p) {
  const layout = p.document.querySelector('ytmusic-app-layout');
  const clicks = [];
  p.document.querySelector('.minimise').addEventListener('click', () => {
    clicks.push('minimise');
    layout.removeAttribute('player-page-open');
  });
  return clicks;
}

test('swiping the open player down follows the finger, then minimises it', async () => {
  const p = page(PLAYER);
  const clicks = minimiser(p);
  const art = p.document.querySelector('.art');
  const pageEl = p.document.querySelector('ytmusic-player-page');
  const move = swipe(p, art, [200, 150], [205, 450]);
  assert.equal(move.defaultPrevented, true, 'the page does not scroll under the drag');
  await wait(40);
  assert.match(pageEl.style.transform, /translate3d\(0, \d+px, 0\)/);
  touch(p, art, 'touchend', 205, 450);
  await wait(700);
  assert.deepEqual(clicks, ['minimise']);
  assert.equal(pageEl.style.transform, '', 'inline styles are removed once closed');
  assert.equal(p.messages.at(-1).type, 'player');
  assert.equal(p.messages.at(-1).open, false);
  p.close();
});

test('a short drag springs back; sideways swipes and the seek bar are left alone', async () => {
  const p = page(PLAYER);
  const clicks = minimiser(p);
  const art = p.document.querySelector('.art');
  const pageEl = p.document.querySelector('ytmusic-player-page');

  swipe(p, art, [200, 150], [200, 180]); // a small drag: not far enough
  touch(p, art, 'touchend', 200, 180);
  await wait(320);
  assert.equal(pageEl.style.transform, '');

  const side = swipe(p, art, [100, 300], [320, 330]); // next-song swipe on the art
  assert.equal(side.defaultPrevented, false);
  touch(p, art, 'touchend', 320, 330);

  const knob = p.document.querySelector('.knob');
  const seek = swipe(p, knob, [100, 500], [110, 700]);
  assert.equal(seek.defaultPrevented, false);
  touch(p, knob, 'touchend', 110, 700);
  await wait(400);
  assert.deepEqual(clicks, []);
  p.close();
});

test('Back minimises the open player first', () => {
  const p = page(PLAYER);
  const clicks = minimiser(p);
  assert.equal(p.window.__swar.cmd('collapse'), true);
  assert.deepEqual(clicks, ['minimise']);
  assert.equal(p.window.__swar.cmd('collapse'), false, 'already minimised: Back does its usual thing');
  assert.deepEqual(clicks, ['minimise']);
  p.close();
});

test('tells the app when the player opens and closes', async () => {
  const p = page(PLAYER);
  minimiser(p);
  p.document.body.click();
  await wait(450);
  assert.deepEqual(plain(p.messages.filter((m) => m.type === 'player')), [{ type: 'player', open: true }]);
  assert.equal(p.document.documentElement.classList.contains('swar-player-open'), true);
  p.window.__swar.collapsePlayer();
  await wait(450);
  assert.deepEqual(plain(p.messages.filter((m) => m.type === 'player')).at(-1), { type: 'player', open: false });
  assert.equal(p.document.documentElement.classList.contains('swar-player-open'), false);
  p.close();
});

test('swiping the mini player up opens the player', () => {
  const p = page(PLAYER.replace(' player-page-open', ''));
  let opened = 0;
  p.document.querySelector('.toggle-player-page-button').addEventListener('click', () => { opened += 1; });
  const info = p.document.querySelector('.content-info-wrapper');
  swipe(p, info, [150, 700], [155, 690]); // a tap-sized wobble does nothing
  touch(p, info, 'touchend', 155, 690);
  assert.equal(opened, 0);
  swipe(p, info, [150, 700], [160, 560]);
  touch(p, info, 'touchend', 160, 560);
  assert.equal(opened, 1);
  p.close();
});

test('restyles the page without costly effects', () => {
  const p = page();
  const css = p.document.getElementById('swar-style').textContent;
  assert.match(css, /--swar-grad/);
  assert.match(css, /ytmusic-player-bar \{/);
  assert.doesNotMatch(css, /backdrop-filter/, 'blur behind bars repaints on every scrolled frame');
  assert.doesNotMatch(css, /@keyframes|animation:/, 'no endless animations on the page');
  p.close();
});
