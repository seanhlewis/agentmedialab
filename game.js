'use strict';
// Agent Studio: a Generative-Agents-style pixel room of the Cognitive Agents class.
// Everything is drawn procedurally at 640x360 and scaled up with nearest-neighbour.

const W = 640, H = 360;
const cv = document.getElementById('world');
const screenCtx = cv.getContext('2d');
let g = screenCtx; // every drawing helper draws into `g`; withG() points it at an offscreen layer
const withG = (cx, fn) => { const old = g; g = cx; try { fn(); } finally { g = old; } };
const overlay = document.getElementById('overlay');

// ---------------------------------------------------------------- utilities
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function seeded(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
const rgb = (a, al = 1) => `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`;
function shade(c, f) { const a = hex(c); return rgb(f < 0 ? a.map((v) => v * (1 + f)) : a.map((v) => v + (255 - v) * f)); }
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------------------------------------------------------------- 3x5 bitmap font (for signs drawn in the world)
const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111',
  9: '111101111001110', ':': '000010000010000', '.': '000000000000010', '-': '000000111000000', '!': '010010010000010',
  '?': '110001010000010', '/': '001001010100100', '+': '000010111010000', '&': '010101010101011', "'": '010010000000000',
  ',': '000000000010100', '#': '101111101111101', '>': '100010001010100', '<': '001010100010001', '=': '000111000111000',
  ' ': '000000000000000',
};
function text3(str, x, y, c, s = 1) {
  g.fillStyle = c;
  let cx = x;
  for (const ch of String(str).toUpperCase()) {
    const gl = GLYPHS[ch] || GLYPHS['?'];
    for (let i = 0; i < 15; i++) if (gl[i] === '1') g.fillRect(cx + (i % 3) * s, y + Math.floor(i / 3) * s, s, s);
    cx += 4 * s;
  }
}

// ---------------------------------------------------------------- people
// Looks are deliberately not based on anyone's real appearance: a stable hash picks them, and
// data/extra.js (LOOKS) can override any of them. Outfit colours come from each person's site.
const SKINS = ['#f7d9bd', '#efc39c', '#dca777', '#c08552', '#93603d', '#6a422b'];
const HAIRC = ['#1d1622', '#2b1d17', '#4a2f22', '#6e4528', '#9b6a3a', '#cfa463', '#3b3b4f', '#7a2f3f', '#d9d2c5'];
const STYLES = ['short', 'long', 'bob', 'bun', 'curly', 'ponytail', 'buzz', 'spiky', 'beanie', 'cap'];
const PANTS = ['#2d3047', '#3c2f2f', '#24364a', '#4a4a58', '#5b4636', '#1f2a2a'];

const people = [...(window.PEOPLE || []), ...(window.EXTRA_PEOPLE || [])].map((p) => {
  const r = seeded(hash(p.id));
  const look = {
    skin: SKINS[Math.floor(r() * SKINS.length)],
    hair: STYLES[Math.floor(r() * STYLES.length)],
    hairColor: HAIRC[Math.floor(r() * HAIRC.length)],
    glasses: r() < 0.35,
    pants: PANTS[Math.floor(r() * PANTS.length)],
    ...(window.LOOKS || {})[p.id],
  };
  const all = p.props || [];
  const onTable = all.filter((x) => x !== 'headphones' && x !== 'laptop');
  return {
    ...p, look,
    first: p.first || p.name.split(' ')[0],
    headphones: all.includes('headphones'),
    tableProps: ['laptop', ...onTable].slice(0, 2),
    primary: (p.colors && p.colors.primary) || '#5a6fd6',
    secondary: (p.colors && p.colors.secondary) || '#f2c14e',
    lines: p.lines && p.lines.length ? p.lines : [`Hi, I'm ${p.first || p.name}.`],
    activities: p.activities && p.activities.length ? p.activities : [p.now || 'working'],
    chatter: p.chatter || [],
    voice: 170 + (hash(p.id) % 9) * 24,
  };
});

// ---------------------------------------------------------------- character sprite (12 x 20, feet at y)
// pose: stand | walk | sit ; dir: down | up | left | right
function drawPerson(P, x, y, dir, pose, frame, opts = {}) {
  const L = Math.round(x) - 6, T = Math.round(y) - 20;
  const flip = dir === 'left';
  const px = (c, r, w, h, col) => { g.fillStyle = col; g.fillRect(L + (flip ? 12 - c - w : c), T + r, w, h); };
  const lk = P.look, skin = lk.skin, shirt = P.primary, acc = P.secondary;
  const sleeve = shade(shirt, -0.18), pants = lk.pants, shoe = '#1a1622';
  const side = dir === 'left' || dir === 'right';
  const step = pose === 'walk' ? frame % 4 : 0;
  const o = pose === 'walk' && step % 2 === 1 ? -1 : 0;

  if (!opts.noShadow && pose !== 'sit') { g.fillStyle = 'rgba(30,20,40,.28)'; g.fillRect(L + 2, T + 19, 8, 2); g.fillRect(L + 3, T + 21, 6, 1); }

  // legs
  if (pose === 'sit' && opts.sideSit) {
    px(5, 15, 6, 2, pants); px(10, 17, 2, 2, pants); px(10, 19, 3, 1, shoe);
  } else if (pose === 'sit' && opts.couch) {
    px(3, 15, 6, 2, pants); px(3, 17, 2, 1, pants); px(7, 17, 2, 1, pants); px(3, 18, 2, 1, shoe); px(7, 18, 2, 1, shoe);
  } else if (pose !== 'sit') {
    if (side) {
      const a = [0, 1, 0, -1][step];
      px(5 - a, 15, 2, 4, shade(pants, -0.2)); px(5 + a, 15, 2, 4, pants);
      px(5 - a, 19, 3, 1, shoe); px(5 + a, 19, 3, 1, shoe);
    } else {
      const lu = step === 1 ? 1 : 0, ru = step === 3 ? 1 : 0;
      px(3, 15, 3, 4 - lu, pants); px(6, 15, 3, 4 - ru, pants);
      px(3, 19 - lu, 3, 1, shoe); px(6, 19 - ru, 3, 1, shoe);
    }
  }

  // torso and arms
  if (side) {
    px(4, 9 + o, 5, 6, shirt); px(4, 9 + o, 1, 6, shade(shirt, -0.12)); px(7, 9 + o, 1, 2, acc);
    const sw = pose === 'walk' ? [0, 1, 0, -1][step] : 0;
    if (opts.reach) { px(7, 11 + o, 4, 2, sleeve); px(11, 11 + o, 1, 2, skin); }
    else { px(6 + sw, 10 + o, 2, 3, sleeve); px(6 + sw, 13 + o, 2, 1, skin); }
  } else {
    px(3, 9 + o, 6, 6, shirt); px(2, 10 + o, 8, 1, shirt);
    if (dir === 'down') { px(5, 9 + o, 2, 1, acc); px(4, 10 + o, 1, 4, acc); px(7, 10 + o, 1, 4, acc); }
    else px(3, 14 + o, 6, 1, shade(shirt, -0.15));
    const sw = pose === 'walk' ? (step === 1 ? 1 : step === 3 ? -1 : 0) : 0;
    const lift = opts.typing ? [0, 1] : [0, 0]; // typing: hands bounce alternately
    px(1, 10 + o + sw, 2, 3, sleeve); px(9, 10 + o - sw, 2, 3, sleeve);
    px(1, 13 + o + sw - lift[0], 2, 1, skin); px(9, 13 + o - sw - lift[1], 2, 1, skin);
  }

  // head
  if (side) { px(3, 1 + o, 7, 8, skin); px(2, 2 + o, 9, 6, skin); px(10, 4 + o, 1, 3, skin); }
  else { px(1, 2 + o, 10, 6, skin); px(2, 1 + o, 8, 8, skin); }
  drawHair(px, lk.hair, lk.hairColor, acc, dir, o);

  // face
  const ink = '#2a1d2a', blush = 'rgba(230,110,110,.45)', frame_ = '#2a2433';
  if (dir === 'down') {
    if (opts.blink) { px(3, 6 + o, 2, 1, ink); px(7, 6 + o, 2, 1, ink); }
    else { px(3, 5 + o, 1, 2, ink); px(8, 5 + o, 1, 2, ink); }
    px(2, 7 + o, 1, 1, blush); px(9, 7 + o, 1, 1, blush);
    if (opts.talk) px(5, 7 + o, 2, 1, '#7a3040');
    if (lk.glasses) { px(2, 4 + o, 3, 1, frame_); px(7, 4 + o, 3, 1, frame_); px(5, 5 + o, 2, 1, frame_); px(2, 5 + o, 1, 2, frame_); px(9, 5 + o, 1, 2, frame_); }
  } else if (side) {
    if (opts.blink) px(8, 6 + o, 2, 1, ink); else px(8, 5 + o, 1, 2, ink);
    px(10, 7 + o, 1, 1, blush);
    if (opts.talk) px(9, 8 + o, 1, 1, '#7a3040');
    if (lk.glasses) { px(7, 4 + o, 3, 1, frame_); px(7, 5 + o, 1, 1, frame_); px(4, 5 + o, 3, 1, frame_); }
  }
  if (P.headphones) {
    const hp = '#2b2b38';
    if (side) { px(3, -1 + o, 6, 1, hp); px(4, 3 + o, 3, 4, hp); px(5, 4 + o, 1, 2, acc); }
    else if (dir === 'down') { px(1, -1 + o, 10, 1, hp); px(0, 3 + o, 2, 4, hp); px(10, 3 + o, 2, 4, hp); px(0, 4 + o, 1, 2, acc); px(11, 4 + o, 1, 2, acc); }
    else { px(1, -1 + o, 10, 1, hp); px(0, 3 + o, 2, 4, hp); px(10, 3 + o, 2, 4, hp); }
  }
}

function drawHair(px, style, c, acc, dir, y) {
  const d = shade(c, -0.25), l = shade(c, 0.18);
  const side = dir === 'left' || dir === 'right';
  const hat = () => {
    if (style === 'beanie') { px(1, -1 + y, 10, 4, acc); px(1, 2 + y, 10, 1, shade(acc, -0.25)); px(5, -2 + y, 2, 1, shade(acc, 0.3)); for (let i = 2; i < 10; i += 2) px(i, 0 + y, 1, 2, shade(acc, -0.12)); }
    if (style === 'cap') { px(1, 0 + y, 10, 3, acc); px(2, -1 + y, 8, 1, acc); px(4, 0 + y, 2, 1, shade(acc, 0.3)); if (dir === 'down') px(1, 3 + y, 10, 1, shade(acc, -0.3)); else if (side) px(9, 2 + y, 4, 1, shade(acc, -0.3)); }
  };
  const isHat = style === 'beanie' || style === 'cap';
  if (dir === 'up') {
    if (isHat) { px(1, 2 + y, 10, 6, c); hat(); return; }
    px(2, 0 + y, 8, 1, c); px(1, 1 + y, 10, 7, c); px(2, 8 + y, 8, 1, d); px(3, 1 + y, 3, 1, l);
    if (style === 'long') px(2, 9 + y, 8, 4, c);
    if (style === 'bob') px(1, 8 + y, 10, 1, d);
    if (style === 'ponytail') { px(5, 8 + y, 2, 5, c); px(5, 7 + y, 2, 1, acc); }
    if (style === 'bun') { px(4, -2 + y, 4, 3, c); px(5, -2 + y, 2, 1, l); }
    if (style === 'curly') { for (let i = 1; i < 11; i += 2) px(i, 8 + y, 1, 1, c); px(0, 2 + y, 1, 5, c); px(11, 2 + y, 1, 5, c); }
    if (style === 'spiky') for (let i = 2; i < 10; i += 2) px(i, -1 + y, 1, 1, c);
    return;
  }
  if (side) {
    if (isHat) { px(2, 3 + y, 3, 3, c); hat(); return; }
    px(3, 0 + y, 7, 1, c); px(2, 1 + y, 9, 2, c); px(2, 3 + y, 3, 3, c); px(4, 1 + y, 3, 1, l);
    if (style === 'long') px(2, 6 + y, 3, 6, c);
    if (style === 'bob') px(2, 6 + y, 3, 2, c);
    if (style === 'ponytail') { px(0, 3 + y, 2, 5, c); px(1, 2 + y, 1, 1, acc); }
    if (style === 'bun') px(0, 0 + y, 3, 3, c);
    if (style === 'curly') { px(1, 2 + y, 1, 4, c); px(3, -1 + y, 2, 1, c); px(7, -1 + y, 2, 1, c); }
    if (style === 'spiky') { px(3, -1 + y, 1, 1, c); px(6, -1 + y, 1, 1, c); px(9, 0 + y, 2, 1, c); }
    return;
  }
  if (isHat) { px(1, 3 + y, 1, 2, c); px(10, 3 + y, 1, 2, c); hat(); return; }
  if (style === 'buzz') { px(2, 0 + y, 8, 1, c); px(1, 1 + y, 10, 1, c); px(1, 2 + y, 1, 1, c); px(10, 2 + y, 1, 1, c); return; }
  px(2, 0 + y, 8, 1, c); px(1, 1 + y, 10, 2, c); px(3, 1 + y, 3, 1, l); px(1, 3 + y, 1, 2, c); px(10, 3 + y, 1, 2, c);
  if (style === 'short') { px(2, 3 + y, 3, 1, c); px(8, 3 + y, 2, 1, d); }
  if (style === 'long') { px(0, 3 + y, 2, 10, c); px(10, 3 + y, 2, 10, c); px(2, 3 + y, 2, 1, c); px(8, 3 + y, 2, 1, c); px(0, 9 + y, 1, 4, d); px(11, 9 + y, 1, 4, d); }
  if (style === 'bob') { px(0, 3 + y, 2, 6, c); px(10, 3 + y, 2, 6, c); px(2, 3 + y, 8, 1, c); px(0, 8 + y, 2, 1, d); px(10, 8 + y, 2, 1, d); }
  if (style === 'bun') { px(4, -2 + y, 4, 2, c); px(5, -2 + y, 2, 1, l); px(2, 3 + y, 1, 1, c); px(9, 3 + y, 1, 1, c); }
  if (style === 'ponytail') { px(2, 3 + y, 4, 1, c); px(11, 4 + y, 1, 5, c); px(10, 3 + y, 2, 1, acc); }
  if (style === 'curly') { px(0, 1 + y, 1, 5, c); px(11, 1 + y, 1, 5, c); px(2, 3 + y, 2, 1, c); px(5, 3 + y, 2, 1, c); px(8, 3 + y, 2, 1, c); px(1, -1 + y, 2, 1, c); px(5, -1 + y, 3, 1, c); px(9, -1 + y, 2, 1, c); }
  if (style === 'spiky') { px(2, -1 + y, 1, 1, c); px(4, -2 + y, 1, 2, c); px(7, -2 + y, 1, 2, c); px(9, -1 + y, 1, 1, c); px(2, 3 + y, 2, 1, c); px(6, 3 + y, 2, 1, c); }
}

// ---------------------------------------------------------------- table props
function drawProp(kind, x, y, t, P, front, night) {
  x = Math.round(x); y = Math.round(y);
  const a = P ? P.primary : '#e2574c', b = P ? P.secondary : '#f2c14e';
  switch (kind) {
    case 'laptop':
      if (front) { // we see the back of the lid
        R(x - 6, y, 12, 8, '#a5adbf'); R(x - 6, y, 12, 1, '#c7cedc'); R(x - 6, y + 7, 12, 1, '#6d7690');
        R(x - 1, y + 3, 2, 2, b);
        if (night) R(x - 6, y - 1, 12, 1, 'rgba(170,220,255,.7)');
        R(x - 7, y + 8, 14, 1, '#4c5468');
      } else {
        R(x - 4, y, 8, 4, '#2c3448'); R(x - 3, y + 1, 6, 2, night ? '#9fe0ff' : '#6fb6e6'); R(x - 4, y + 4, 8, 3, '#a5adbf'); R(x - 3, y + 5, 6, 1, '#7d869b');
      }
      break;
    case 'sketchbook':
      R(x - 5, y + 2, 10, 7, '#f6f0e1'); R(x - 5, y + 8, 10, 1, '#c9bfa8'); R(x, y + 2, 1, 7, '#d9cfb8');
      for (let i = 0; i < 3; i++) R(x - 4, y + 3 + i * 2, 3, 1, a);
      R(x + 2, y + 4, 2, 2, b); R(x + 3 + ((t / 250) % 2 | 0), y + 1, 1, 4, '#f2c14e');
      break;
    case 'robot': { // Sphero Ollie with an FPV camera taped on; every so often it shakes its head
      const sh = Math.sin(t / 900) > 0.8 ? Math.round(Math.sin(t / 40)) : 0;
      R(x - 3 + sh, y + 4, 7, 4, '#e9eef5'); R(x - 4 + sh, y + 4, 1, 4, '#2a2a33'); R(x + 4 + sh, y + 4, 1, 4, '#2a2a33');
      R(x - 2 + sh, y + 5, 5, 1, '#c8d0dc'); R(x + sh, y + 3, 2, 1, '#222'); R(x + 1 + sh, y + 3, 1, 1, '#ff5050');
      R(x - 1 + sh, y + 6, 1, 1, Math.sin(t / 300) > 0 ? '#58b7ff' : '#2a6db0');
      break;
    }
    case 'mug':
      R(x, y + 4, 4, 4, b); R(x + 4, y + 5, 1, 2, b); R(x, y + 4, 4, 1, '#5a3a2a');
      R(x + 1 + ((t / 400) | 0) % 2, y + ((t / 400) | 0) % 2, 1, 2, 'rgba(255,255,255,.6)');
      break;
    case 'plant':
      R(x, y + 5, 4, 3, '#c0643c'); R(x, y + 5, 4, 1, '#e08454'); R(x - 1, y + 2, 2, 3, '#3f9a4a'); R(x + 1, y, 2, 5, '#55b85c'); R(x + 3, y + 2, 2, 2, '#3f9a4a');
      break;
    case 'books':
      R(x - 1, y + 6, 8, 2, '#c84b4b'); R(x, y + 4, 7, 2, '#3e6fb0'); R(x - 1, y + 2, 7, 2, '#e3b43c'); R(x + 1, y + 2, 1, 6, 'rgba(255,255,255,.3)');
      break;
    case 'tablet':
      R(x - 4, y + 2, 9, 6, '#20222c'); R(x - 3, y + 3, 7, 4, night ? '#c6f0ff' : '#9fd3f0'); R(x - 2, y + 4, 3, 1, a); R(x, y + 5, 3, 1, '#fff');
      break;
    case 'synth':
      R(x - 7, y + 3, 14, 6, '#2b2b36'); R(x - 6, y + 5, 12, 3, '#f4f1ea');
      for (let i = -5; i < 6; i += 2) if (i !== -1) R(x + i, y + 5, 1, 2, '#22222a');
      R(x - 6, y + 3, 2, 1, '#f2c14e'); R(x - 3, y + 3, 2, 1, '#58b7ff'); R(x + 3, y + 3, 3, 1, a);
      break;
    case 'map':
      R(x - 5, y + 2, 11, 7, '#f1e6c4'); R(x - 5, y + 2, 1, 7, '#d8c99f'); R(x, y + 2, 1, 7, '#d8c99f');
      R(x - 4, y + 5, 9, 1, '#7fb6d9'); R(x - 2, y + 3, 1, 6, '#e0a24a'); R(x + 2, y + 3, 1, 1, '#d33'); R(x + 2, y + 4, 1, 1, '#a11');
      break;
    case 'camera':
      R(x - 3, y + 4, 7, 4, '#24242c'); R(x - 2, y + 3, 2, 1, '#24242c'); R(x, y + 5, 2, 2, '#8899aa'); R(x + 2, y + 4, 1, 1, '#ff5d5d');
      break;
    case 'solder':
      R(x - 3, y + 4, 7, 4, '#2f7d4a'); R(x - 2, y + 5, 1, 1, '#e8c85a'); R(x + 1, y + 6, 1, 1, '#e8c85a'); R(x + 2, y + 5, 2, 1, '#222');
      R(x + 5, y + 1, 1, 5, '#888'); R(x + 5, y + 6, 1, 1, '#ff8a3c');
      if (((t / 300) | 0) % 3 === 0) R(x + 4, y, 1, 1, 'rgba(255,255,255,.6)');
      break;
    case 'clay':
      R(x - 2, y + 5, 6, 3, '#c97b52'); R(x - 1, y + 4, 4, 1, '#d98d62'); R(x, y + 3, 2, 1, '#e3a07a');
      break;
    case 'phone':
      R(x, y + 3, 3, 5, '#1f2029'); R(x, y + 4, 3, 3, night ? '#bfe9ff' : '#7fc3ea');
      break;
    case 'sticky_notes':
      R(x - 4, y + 2, 3, 3, '#ffe066'); R(x, y + 4, 3, 3, '#ff9ec7'); R(x + 3, y + 2, 3, 3, '#8fe3ff'); R(x - 2, y + 6, 3, 3, '#b6f08a');
      break;
    case 'globe':
      R(x - 1, y + 7, 5, 1, '#5a3a2a'); R(x + 1, y + 6, 1, 1, '#5a3a2a'); R(x - 1, y + 1, 5, 5, '#3d7fd6'); R(x, y, 3, 1, '#3d7fd6');
      R(x - 1, y + 2, 2, 2, '#59b85e'); R(x + 2, y + 3, 2, 2, '#59b85e');
      break;
    case 'newspaper':
      R(x - 4, y + 2, 9, 6, '#e4e2dc'); R(x - 3, y + 3, 7, 1, '#444'); R(x - 3, y + 5, 3, 2, '#9a9a9a'); R(x + 1, y + 5, 3, 1, '#bbb');
      break;
    case 'yarn':
      R(x - 1, y + 4, 4, 4, '#e86fa0'); R(x, y + 3, 2, 1, '#e86fa0'); R(x - 1, y + 5, 4, 1, '#c24f80'); R(x + 3, y + 1, 1, 6, '#c9a46a'); R(x + 5, y + 2, 1, 5, '#c9a46a');
      break;
  }
}

// ---------------------------------------------------------------- overhead icons (7x7)
function drawIcon(kind, x, y, t) {
  x = Math.round(x) - 5; y = Math.round(y);
  R(x, y, 11, 9, '#fffaf0'); R(x + 1, y - 1, 9, 1, '#fffaf0'); R(x + 1, y + 9, 9, 1, '#fffaf0');
  g.fillStyle = '#3a2f4a'; g.fillRect(x - 1, y, 1, 9); g.fillRect(x + 11, y, 1, 9); g.fillRect(x + 1, y - 2, 9, 1); g.fillRect(x + 1, y + 10, 9, 1);
  g.fillRect(x, y - 1, 1, 1); g.fillRect(x + 10, y - 1, 1, 1); g.fillRect(x, y + 9, 1, 1); g.fillRect(x + 10, y + 9, 1, 1);
  R(x + 4, y + 10, 3, 1, '#fffaf0'); R(x + 5, y + 11, 1, 1, '#3a2f4a'); R(x + 4, y + 11, 1, 1, '#3a2f4a'); R(x + 6, y + 11, 1, 1, '#3a2f4a');
  const X = x + 2, Y = y + 1, k = '#3a2f4a';
  switch (kind) {
    case 'dots': { const f = ((t / 260) | 0) % 4; for (let i = 0; i < 3; i++) R(X + i * 3, Y + 3 - (f === i ? 1 : 0), 1, 1, k); break; }
    case 'idea': R(X + 2, Y, 3, 1, '#f2c14e'); R(X + 1, Y + 1, 5, 3, '#f2c14e'); R(X + 2, Y + 4, 3, 1, '#f2c14e'); R(X + 2, Y + 5, 3, 1, '#8a8a8a'); R(X + 2, Y + 1, 1, 1, '#fff'); break;
    case 'note': R(X + 2, Y, 4, 1, k); R(X + 2, Y, 1, 5, k); R(X + 5, Y, 1, 4, k); R(X, Y + 4, 3, 2, '#e2574c'); R(X + 4, Y + 3, 2, 2, '#e2574c'); break;
    case 'gear': R(X + 2, Y, 3, 7, '#7d869b'); R(X, Y + 2, 7, 3, '#7d869b'); R(X + 1, Y + 1, 5, 5, '#7d869b'); R(X + 3, Y + 3, 1, 1, '#fffaf0'); break;
    case 'heart': R(X + 1, Y + 1, 2, 1, '#e2574c'); R(X + 4, Y + 1, 2, 1, '#e2574c'); R(X, Y + 2, 7, 2, '#e2574c'); R(X + 1, Y + 4, 5, 1, '#e2574c'); R(X + 2, Y + 5, 3, 1, '#e2574c'); R(X + 3, Y + 6, 1, 1, '#e2574c'); break;
    case 'pencil': for (let i = 0; i < 5; i++) R(X + 1 + i, Y + 5 - i, 2, 1, '#f2c14e'); R(X, Y + 6, 1, 1, k); R(X + 6, Y, 1, 1, '#e2574c'); break;
    case 'book': R(X, Y + 1, 3, 5, '#3e6fb0'); R(X + 4, Y + 1, 3, 5, '#3e6fb0'); R(X + 3, Y + 1, 1, 6, k); R(X + 1, Y + 2, 1, 1, '#fff'); R(X + 5, Y + 2, 1, 1, '#fff'); break;
    case 'coffee': R(X + 1, Y + 3, 4, 4, '#8a5a37'); R(X + 5, Y + 4, 1, 2, '#8a5a37'); R(X + 1, Y + 3, 4, 1, '#c99a6a'); R(X + 2 + ((t / 300) | 0) % 2, Y, 1, 2, '#bbb'); break;
    case 'drop': R(X + 3, Y, 1, 1, '#58b7ff'); R(X + 2, Y + 1, 3, 2, '#58b7ff'); R(X + 1, Y + 3, 5, 3, '#58b7ff'); R(X + 2, Y + 6, 3, 1, '#58b7ff'); R(X + 2, Y + 3, 1, 1, '#fff'); break;
    case 'zzz': R(X, Y, 3, 1, k); R(X + 1, Y + 1, 1, 1, k); R(X, Y + 2, 3, 1, k); R(X + 4, Y + 3, 3, 1, k); R(X + 5, Y + 4, 1, 1, k); R(X + 4, Y + 5, 3, 1, k); break;
    case 'pin': R(X + 2, Y, 3, 1, '#e2574c'); R(X + 1, Y + 1, 5, 3, '#e2574c'); R(X + 2, Y + 4, 3, 1, '#e2574c'); R(X + 3, Y + 5, 1, 2, '#e2574c'); R(X + 3, Y + 2, 1, 1, '#fff'); break;
    case 'chat': R(X, Y + 1, 7, 4, '#58b7ff'); R(X + 1, Y + 5, 2, 1, '#58b7ff'); R(X + 1, Y + 2, 5, 1, '#fff'); R(X + 1, Y + 3, 3, 1, '#fff'); break;
    case 'excl': R(X + 3, Y, 1, 4, '#e2574c'); R(X + 3, Y + 5, 1, 1, '#e2574c'); R(X + 1, Y + 1, 1, 2, '#f2c14e'); R(X + 5, Y + 1, 1, 2, '#f2c14e'); break;
    case 'ques': R(X + 2, Y, 3, 1, k); R(X + 5, Y + 1, 1, 2, k); R(X + 3, Y + 3, 2, 1, k); R(X + 3, Y + 4, 1, 1, k); R(X + 3, Y + 6, 1, 1, k); break;
  }
}
const ICON_WORDS = [
  [/music|hum|sound|acoustic|audio|listen|compos|song|synth/i, 'note'], [/sketch|draw|design|moodboard|paint|critique|whiteboard/i, 'pencil'],
  [/robot|hardware|solder|fab|print|device|haptic|wearable|soft/i, 'gear'], [/emotion|wellbeing|care|support|feel|mood/i, 'heart'],
  [/map|city|neighbo|urban|museum|walk/i, 'pin'], [/read|paper|doc|book|research|knowledge|notes/i, 'book'],
  [/debate|question|argu|rebel|why/i, 'ques'], [/chat|talk|interview|convers|ask/i, 'chat'], [/idea|think|imagin|dream|future|reflect/i, 'idea'],
  [/bug|fix|fail|error|eval|test|score/i, 'excl'],
];
const iconFor = (s) => { for (const [re, k] of ICON_WORDS) if (re.test(s)) return k; return 'dots'; };

// ---------------------------------------------------------------- room layout
const TABLE_W = 84, TABLE_H = 22;
const TABLE_POS = [[36, 124], [176, 124], [316, 124], [36, 240], [176, 240], [316, 240]];
const GROUP_COLORS = ['#e2574c', '#3e6fb0', '#2a8a4a', '#f2a03a', '#8a4fc0', '#1fa3a3'];
const tables = TABLE_POS.map(([tx, ty], i) => ({
  i, group: i + 1, tx, ty, base: ty + TABLE_H + 8,
  seats: [
    { x: tx + 18, y: ty + 6, dir: 'down', kind: 'top', ax: tx + 18, ay: ty - 3 },
    { x: tx + 42, y: ty + 6, dir: 'down', kind: 'top', ax: tx + 42, ay: ty - 3 },
    { x: tx + 66, y: ty + 6, dir: 'down', kind: 'top', ax: tx + 66, ay: ty - 3 },
    { x: tx - 9, y: ty + 20, dir: 'right', kind: 'side', ax: tx - 9, ay: ty + 30 },
    { x: tx + TABLE_W + 9, y: ty + 20, dir: 'left', kind: 'side', ax: tx + TABLE_W + 9, ay: ty + 30 },
  ],
}));

// where people go on a break; slots keep them from stacking on one pixel
const POIS = {
  coffee: { label: 'the coffee machine', slots: [[566, 94], [590, 96], [612, 94]], face: 'up', verb: 'making coffee', icon: 'coffee', w: 4 },
  water: { label: 'the water cooler', slots: [[522, 94]], face: 'up', verb: 'refilling water', icon: 'drop', w: 1.5 },
  board: { label: 'the whiteboard', slots: [[176, 92], [208, 94], [244, 92], [276, 94]], face: 'up', verb: 'sketching on the whiteboard', icon: 'pencil', w: 2.5 },
  cork: { label: 'the pinboard', slots: [[334, 92], [362, 94]], face: 'up', verb: 'reading the pinboard', icon: 'book', w: 1.5 },
  winA: { label: 'the window', slots: [[40, 92], [76, 94], [110, 92]], face: 'up', verb: 'watching the Charles', icon: 'idea', w: 1.5 },
  winB: { label: 'the window', slots: [[420, 92], [452, 94], [486, 92]], face: 'up', verb: 'watching the sky', icon: 'idea', w: 1.5 },
  fab: { label: 'the fab bench', slots: [[572, 176], [604, 178]], face: 'up', verb: 'tinkering at the fab bench', icon: 'gear', w: 1.2 },
  shelf: { label: 'the bookshelf', slots: [[456, 352], [482, 353]], face: 'up', verb: 'browsing the bookshelf', icon: 'book', w: 1.2 },
  couch: { label: 'the couch', slots: [[504, 238], [530, 238], [556, 238]], face: 'down', verb: 'thinking on the couch', icon: 'idea', sit: true, w: 2 },
  bean: { label: 'the beanbag', slots: [[607, 304]], face: 'down', verb: 'reading on the beanbag', icon: 'book', sit: true, w: 1 },
};
const taken = new Set();

// ---------------------------------------------------------------- walk grid + A*
const TS = 4, GW = W / TS, GH = H / TS;
const solid = new Uint8Array(GW * GH);
function block(x, y, w, h) {
  for (let gy = Math.floor(y / TS); gy < Math.ceil((y + h) / TS); gy++)
    for (let gx = Math.floor(x / TS); gx < Math.ceil((x + w) / TS); gx++)
      if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) solid[gy * GW + gx] = 1;
}
block(0, 0, W, 86); block(0, 356, W, 4); block(0, 0, 6, H); block(634, 0, 6, H);
for (const t of tables) { block(t.tx - 3, t.ty + 1, TABLE_W + 6, TABLE_H + 11); block(t.tx - 15, t.ty + 10, 12, 16); block(t.tx + TABLE_W + 3, t.ty + 10, 12, 16); }
block(480, 206, 106, 26); block(494, 250, 70, 18); block(554, 132, 80, 30); block(444, 300, 54, 46);
block(6, 334, 22, 22); block(610, 334, 24, 22); block(424, 94, 16, 14); block(6, 94, 16, 14); block(590, 290, 32, 18);

function astar(sx, sy, ex, ey) {
  const cell = (x, y) => Math.max(0, Math.min(GH - 1, Math.floor(y / TS))) * GW + Math.max(0, Math.min(GW - 1, Math.floor(x / TS)));
  const s = cell(sx, sy), e = cell(ex, ey);
  const N = GW * GH, gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = [];
  const push = (n, f) => { heap.push([f, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  const exc = e % GW, eyc = (e / GW) | 0;
  const h = (n) => { const dx = Math.abs(n % GW - exc), dy = Math.abs(((n / GW) | 0) - eyc); return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy); };
  gs[s] = 0; push(s, h(s));
  while (heap.length) {
    const [, n] = pop();
    if (n === e) break;
    if (closed[n]) continue; closed[n] = 1;
    const cx = n % GW, cy = (n / GW) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const m = ny * GW + nx;
      if (solid[m] && m !== e && n !== s) continue;
      if (dx && dy && (solid[cy * GW + nx] || solid[ny * GW + cx])) continue;
      const ng = gs[n] + (dx && dy ? Math.SQRT2 : 1);
      if (ng < gs[m]) { gs[m] = ng; from[m] = n; push(m, ng + h(m)); }
    }
  }
  if (from[e] < 0) return [[ex, ey]];
  const cells = []; let n = e;
  while (n !== s && n >= 0) { cells.push([(n % GW) * TS + TS / 2, ((n / GW) | 0) * TS + TS / 2]); n = from[n]; }
  cells.reverse();
  const pts = []; // keep only turning points
  for (let i = 0; i < cells.length; i++) {
    const a = pts[pts.length - 1] || [sx, sy], b = cells[i], c = cells[i + 1];
    if (c && (b[0] - a[0]) * (c[1] - b[1]) === (b[1] - a[1]) * (c[0] - b[0])) continue;
    pts.push(b);
  }
  pts.push([ex, ey]);
  return pts;
}

// ---------------------------------------------------------------- clock and light
const clock = { min: 14 * 60 + 30, speed: 1, paused: false };
const clockStr = (m = clock.min) => { m = Math.floor(m) % 1440; let h = Math.floor(m / 60); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m % 60).padStart(2, '0')} ${ap}`; };
// Cambridge in early November: the sun sets around 4:30 PM
const SKY = [
  [0, '#0b0f2a', '#1c2350'], [6 * 60, '#0b0f2a', '#1c2350'], [7 * 60, '#f2a37a', '#ffd9a8'], [8 * 60, '#7fb9ef', '#cfe8ff'],
  [15 * 60 + 15, '#7fb9ef', '#cfe8ff'], [16 * 60, '#e9a26a', '#ffd18f'], [16 * 60 + 35, '#b65a7a', '#f0956a'],
  [17 * 60 + 10, '#3a2d6b', '#8a4f7d'], [17 * 60 + 50, '#0d1236', '#25295a'], [24 * 60, '#0b0f2a', '#1c2350'],
];
function skyAt(m) {
  m %= 1440;
  for (let i = 0; i < SKY.length - 1; i++) {
    const [a, t0, b0] = SKY[i], [b, t1, b1] = SKY[i + 1];
    if (m >= a && m <= b) { const t = (m - a) / (b - a || 1); return [mix(hex(t0), hex(t1), t), mix(hex(b0), hex(b1), t)]; }
  }
  return [hex('#0b0f2a'), hex('#1c2350')];
}
function darkness(m) { // 0 = day, 1 = night
  m %= 1440;
  if (m < 390) return 1; if (m < 480) return 1 - (m - 390) / 90;
  if (m < 960) return 0; if (m < 1060) return (m - 960) / 100; return 1;
}
function golden(m) { m %= 1440; return m > 900 && m < 1030 ? Math.sin(((m - 900) / 130) * Math.PI) : 0; }

// ---------------------------------------------------------------- static layers (floor, wall)
const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
const floorLayer = mk(), wallLayer = mk(), lightLayer = mk();
const WINDOWS = [[10, 10, 116, 50], [404, 10, 116, 50]];
const skyline = WINDOWS.map((w, wi) => {
  const r = seeded(99 + wi), out = [];
  for (let x = 0; x < w[2];) {
    const bw = 6 + Math.floor(r() * 12), bh = 6 + Math.floor(r() * (wi === 0 ? 20 : 28));
    const lit = []; for (let yy = 2; yy < bh - 1; yy += 3) for (let xx = 1; xx < bw - 1; xx += 2) if (r() < 0.35) lit.push([xx, yy]);
    out.push({ x, w: bw, h: bh, lit, c: r() }); x += bw + (r() < 0.3 ? 1 : 0);
  }
  return out;
});
const stars = Array.from({ length: 26 }, (_, i) => { const r = seeded(500 + i); return [Math.floor(r() * 116), Math.floor(r() * 26), r()]; });

function paintStatic() {
  withG(floorLayer.getContext('2d'), () => {
    const r = seeded(42);
    for (let y = 72; y < H; y += 8) {
      const off = ((y / 8) % 3) * 16;
      for (let x = -off; x < W; x += 48) {
        const v = r();
        R(x, y, 48, 8, v < 0.33 ? '#a9764d' : v < 0.66 ? '#b07f55' : '#a36f47');
        R(x, y + 7, 48, 1, '#8a5a37'); R(x + 47, y, 1, 7, '#8a5a37'); R(x, y, 48, 1, 'rgba(255,230,190,.12)');
        for (let k = 0; k < 3; k++) R(x + Math.floor(r() * 44) + 2, y + 2 + Math.floor(r() * 4), 3 + Math.floor(r() * 6), 1, 'rgba(90,50,25,.22)');
      }
    }
    // lounge rug
    R(458, 196, 174, 132, '#4d3560'); R(462, 200, 166, 124, '#7a5a8c');
    for (let x = 468; x < 624; x += 8) { R(x, 204, 4, 2, '#e8c06a'); R(x, 318, 4, 2, '#e8c06a'); }
    for (let y = 210; y < 316; y += 8) { R(466, y, 2, 4, '#e8c06a'); R(622, y, 2, 4, '#e8c06a'); }
    for (let y = 214; y < 310; y += 12) for (let x = 474; x < 612; x += 12) R(x + ((y / 12) % 2) * 6, y, 4, 4, '#6a4a7c');
    // a rug under each group's table, tinted with the group colour
    for (const t of tables) { R(t.tx - 20, t.ty - 8, TABLE_W + 40, TABLE_H + 36, 'rgba(50,30,70,.16)'); R(t.tx - 20, t.ty - 8, TABLE_W + 40, 1, rgb(hex(GROUP_COLORS[t.i]), 0.35)); R(t.tx - 20, t.ty + TABLE_H + 27, TABLE_W + 40, 1, rgb(hex(GROUP_COLORS[t.i]), 0.35)); }
    // door mat at the bottom left
    R(150, 350, 60, 10, '#5a4a3a'); R(152, 352, 56, 8, '#6e5c48');
  });

  withG(wallLayer.getContext('2d'), () => {
    const wl = g;
    R(0, 0, W, 72, '#d8ccb6');
    for (let x = 0; x < W; x += 16) R(x, 0, 1, 60, '#cfc2ab');
    R(0, 60, W, 4, '#b8a88d'); R(0, 64, W, 8, '#6b5640'); R(0, 64, W, 1, '#86704f'); R(0, 72, W, 3, 'rgba(0,0,0,.18)');
    for (const [x, y, w, h] of WINDOWS) {
      wl.clearRect(x, y, w, h);
      R(x - 3, y - 3, w + 6, 3, '#4a3a2c'); R(x - 3, y + h, w + 6, 3, '#4a3a2c'); R(x - 3, y, 3, h, '#4a3a2c'); R(x + w, y, 3, h, '#4a3a2c');
      R(x + w / 2 - 1, y, 2, h, '#4a3a2c'); R(x, y + h / 2 - 1, w, 2, '#4a3a2c');
      R(x - 5, y + h + 3, w + 10, 3, '#8a7458'); R(x - 5, y + h + 3, w + 10, 1, '#a08a6c');
    }
    // whiteboard with the week's brief
    const bx = 140, by = 8;
    R(bx - 2, by - 2, 160, 52, '#8b8f99'); R(bx, by, 156, 48, '#f7f7f2'); R(bx, by + 44, 156, 4, '#e7e8e2');
    R(bx + 8, by + 50, 140, 3, '#6d717a'); R(bx + 20, by + 49, 6, 2, '#d33'); R(bx + 30, by + 49, 6, 2, '#36c'); R(bx + 40, by + 49, 6, 2, '#2a2');
    text3('COGNITIVE AGENTS', bx + 6, by + 5, '#2b3a8f');
    text3('WK 8: REMEMBER + ADAPT', bx + 6, by + 13, '#c23a3a');
    const box = (x, y, w, s, c) => { R(x, y, w, 1, c); R(x, y + 9, w, 1, c); R(x, y, 1, 10, c); R(x + w - 1, y, 1, 10, c); text3(s, x + 3, y + 3, c); };
    box(bx + 6, by + 24, 17, 'YOU', '#333'); box(bx + 40, by + 24, 25, 'AGENT', '#2b3a8f'); box(bx + 82, by + 24, 29, 'MEMORY', '#2a8a4a');
    R(bx + 24, by + 29, 15, 1, '#555'); R(bx + 37, by + 28, 1, 3, '#555'); R(bx + 66, by + 29, 15, 1, '#555'); R(bx + 79, by + 28, 1, 3, '#555');
    R(bx + 44, by + 36, 50, 1, '#2a8a4a'); text3('ADAPT', bx + 58, by + 38, '#2a8a4a');
    text3('DUE 11/9', bx + 118, by + 38, '#c23a3a');
    R(bx + 132, by + 20, 18, 14, '#f2c14e'); R(bx + 132, by + 33, 18, 1, '#d9a83a'); text3('PR!', bx + 135, by + 25, '#6a4a10');
    // pinboard of everyone's sites
    const px0 = 306, py0 = 10;
    R(px0 - 2, py0 - 2, 86, 46, '#7a5532'); R(px0, py0, 82, 42, '#c08a55');
    const r2 = seeded(7);
    for (let i = 0; i < 10; i++) {
      const x = px0 + 3 + (i % 5) * 16 + Math.floor(r2() * 2), y = py0 + 3 + Math.floor(i / 5) * 18 + Math.floor(r2() * 3);
      R(x + 1, y + 1, 12, 13, 'rgba(0,0,0,.2)'); R(x, y, 12, 13, ['#fff6c8', '#ffd6e6', '#d6f2ff', '#e2ffd0', '#ffffff'][i % 5]);
      for (let k = 0; k < 3; k++) R(x + 2, y + 5 + k * 3, 6 + Math.floor(r2() * 3), 1, '#9a8f80');
      R(x + 5, y + 1, 2, 2, ['#e2574c', '#3e6fb0', '#2a8a4a'][i % 3]);
    }
    // cabinets above the kitchen counter, and a framed sign
    R(536, 8, 96, 30, '#4f6b7c'); for (let x = 538; x < 630; x += 23) { R(x, 10, 21, 26, '#6f8fa3'); R(x, 10, 21, 1, '#88a6b8'); R(x + 16, 21, 2, 4, '#d9c38a'); }
    text3('MEDIA LAB', 562, 46, '#7a6a52');
  });
}

// ---------------------------------------------------------------- furniture (y-sorted with people)
function drawTable(T, t, night) {
  const { tx, ty } = T;
  // chair backs behind the top seats
  for (const s of T.seats) if (s.kind === 'top') { R(s.x - 7, ty - 6, 14, 8, '#3b4466'); R(s.x - 7, ty - 6, 14, 1, '#56618a'); R(s.x - 6, ty - 8, 12, 2, '#3b4466'); }
  // side chairs
  for (const s of T.seats) if (s.kind === 'side') {
    const back = s.dir === 'right' ? s.x - 7 : s.x + 5;
    R(back, ty + 4, 2, 16, '#3b4466'); R(back, ty + 4, 2, 1, '#56618a');
    R(s.x - 5, ty + 16, 10, 4, '#4a5580'); R(s.x - 5, ty + 16, 10, 1, '#5d6a9a');
    R(s.x - 4, ty + 20, 1, 5, '#2a2f45'); R(s.x + 3, ty + 20, 1, 5, '#2a2f45');
  }
  // people sitting at this table (drawn before the table so it hides their laps)
  for (const a of T.occupants) if (a.state === 'seated') a.drawSeated(t);
  // table
  R(tx + 2, ty + TABLE_H + 4, TABLE_W, 6, 'rgba(40,20,30,.25)');
  R(tx + 3, ty + TABLE_H, 3, 9, '#5c3a22'); R(tx + TABLE_W - 6, ty + TABLE_H, 3, 9, '#5c3a22');
  R(tx, ty + TABLE_H, TABLE_W, 5, '#8f5f36'); R(tx, ty + TABLE_H, TABLE_W, 1, '#a8713f');
  R(tx, ty, TABLE_W, TABLE_H, '#d2a06a'); R(tx, ty, TABLE_W, 1, '#e8bd88');
  for (let y = ty + 7; y < ty + TABLE_H; y += 7) R(tx, y, TABLE_W, 1, '#c3905c');
  R(tx, ty, 1, TABLE_H, '#b98653'); R(tx + TABLE_W - 1, ty, 1, TABLE_H, '#b98653');
  // props, hands and the group's tent card
  for (const a of T.occupants) a.drawDesk(t, night);
  const cx = tx + TABLE_W / 2;
  R(cx - 8, ty + 13, 17, 8, '#f8f4ea'); R(cx - 8, ty + 20, 17, 1, '#c9c2b0'); R(cx - 8, ty + 13, 17, 2, GROUP_COLORS[T.i]);
  text3(`G${T.group}`, cx - 3, ty + 15 + 1, '#3a2f4a');
}

function drawCounter(t, night) {
  // water cooler
  R(514, 70, 16, 18, '#e4e7ec'); R(514, 70, 16, 1, '#fff'); R(517, 56, 10, 14, 'rgba(120,190,255,.75)'); R(518, 57, 3, 10, 'rgba(255,255,255,.5)'); R(520, 76, 4, 2, '#58b7ff');
  // counter
  R(536, 70, 96, 6, '#e8e2d6'); R(536, 70, 96, 1, '#fff'); R(536, 76, 96, 12, '#4f6b7c');
  for (let x = 538; x < 630; x += 23) { R(x, 77, 21, 10, '#6f8fa3'); R(x + 9, 80, 3, 1, '#d9c38a'); }
  R(536, 88, 96, 2, 'rgba(0,0,0,.2)');
  // coffee machine, kettle, mugs, fridge
  R(566, 52, 16, 19, '#2b2b33'); R(568, 54, 12, 5, '#3d3d48'); R(570, 55, 2, 2, night ? '#7fe3a0' : '#3fb070'); R(574, 55, 4, 2, '#e2574c');
  R(570, 62, 8, 6, '#1a1a20'); R(572, 66, 4, 4, '#f4f1ea');
  if (((t / 600) | 0) % 2) R(573, 59, 1, 2, 'rgba(255,255,255,.5)');
  R(590, 62, 8, 8, '#c7cedc'); R(597, 64, 2, 3, '#c7cedc'); R(591, 61, 6, 1, '#a5adbf');
  R(546, 66, 3, 4, '#e2574c'); R(551, 66, 3, 4, '#3e6fb0'); R(556, 66, 3, 4, '#f2c14e');
  R(606, 36, 24, 52, '#e9edf2'); R(606, 36, 24, 1, '#fff'); R(606, 56, 24, 1, '#c3c9d2'); R(626, 42, 1, 10, '#9aa3b0'); R(626, 60, 1, 14, '#9aa3b0');
  R(609, 40, 5, 4, '#ffd6e6'); R(615, 46, 4, 3, '#d6f2ff');
}

function drawFab(t) {
  R(554, 134, 80, 6, '#9aa0aa'); R(554, 134, 80, 1, '#b8bec8'); R(554, 140, 80, 14, '#5a6070'); R(556, 154, 3, 6, '#3a3f4a'); R(629, 154, 3, 6, '#3a3f4a');
  // 3D printer with a moving nozzle
  R(562, 112, 22, 24, '#2a2d38'); R(564, 114, 18, 18, '#11131a'); const nx = 566 + Math.round((Math.sin(t / 500) + 1) * 6);
  R(564, 118, 18, 1, '#777'); R(nx, 118, 3, 3, '#ff8a3c'); R(568, 128, 10, 3, '#58b7ff'); R(568, 127, 10 * ((t / 8000) % 1), 1, '#58b7ff');
  // soft gripper / robot arm
  const ang = Math.sin(t / 700);
  R(606, 128, 8, 6, '#ff9ec7'); R(608 + Math.round(ang), 120, 4, 8, '#ff9ec7'); R(607 + Math.round(ang * 2), 116, 6, 4, '#e86fa0');
  R(590, 128, 10, 6, '#f2c14e'); R(592, 126, 6, 2, '#d9a83a');
  R(620, 126, 8, 8, '#2f7d4a'); R(621, 127, 2, 2, '#e8c85a'); R(624, 130, 2, 2, '#e8c85a');
}

function drawCouchBack() {
  R(480, 206, 106, 10, '#2f6f7a'); R(480, 206, 106, 2, '#4a8f9a'); R(478, 206, 6, 26, '#285f69'); R(582, 206, 6, 26, '#285f69');
  R(484, 216, 98, 10, '#3f8590'); R(484, 216, 98, 1, '#5aa3ad'); R(516, 216, 1, 10, '#2f6f7a'); R(550, 216, 1, 10, '#2f6f7a');
  R(484, 226, 98, 6, '#2a6670'); R(486, 232, 3, 2, '#1d3a40'); R(578, 232, 3, 2, '#1d3a40');
  R(488, 210, 10, 8, '#f2c14e'); R(566, 210, 10, 8, '#e2574c');
}
function drawCoffeeTable(t) {
  R(496, 252, 66, 12, '#7a4f30'); R(496, 252, 66, 1, '#9a6a44'); R(496, 264, 66, 3, '#5c3a22');
  R(504, 254, 10, 6, '#3e6fb0'); R(505, 255, 8, 1, '#fff'); R(540, 254, 4, 4, '#e2574c'); R(541, 253, 2, 1, 'rgba(255,255,255,.5)');
  R(526, 255, 8, 5, '#f6f0e1'); R(527, 256, 6, 1, '#c9bfa8'); R(527, 258, 4, 1, '#c9bfa8');
}
function drawShelf() {
  R(444, 290, 54, 54, '#6b4a2e'); R(446, 292, 50, 50, '#4a3220');
  const r = seeded(3);
  for (let row = 0; row < 4; row++) {
    const y = 293 + row * 12; R(446, y + 10, 50, 2, '#6b4a2e');
    for (let x = 447; x < 494;) { const w = 2 + Math.floor(r() * 3), h = 6 + Math.floor(r() * 4); R(x, y + 10 - h, w, h, ['#c84b4b', '#3e6fb0', '#e3b43c', '#2a8a4a', '#8a4fc0', '#e8e2d6'][Math.floor(r() * 6)]); x += w + (r() < 0.2 ? 2 : 0); }
  }
  R(444, 344, 54, 2, 'rgba(0,0,0,.25)');
}
function drawPlant(x, y, big) {
  R(x - 6, y - 2, 12, 2, 'rgba(0,0,0,.2)'); R(x - 5, y - 10, 10, 9, '#c0643c'); R(x - 6, y - 11, 12, 2, '#e08454');
  const leaves = big ? 22 : 12, r = seeded(x * 7 + y);
  for (let i = 0; i < leaves; i++) { const a = r() * Math.PI, d = 3 + r() * (big ? 12 : 8); R(x + Math.cos(a) * d * (r() < .5 ? -1 : 1) - 1, y - 12 - Math.sin(a) * d, 3, 2, r() < 0.5 ? '#3f9a4a' : '#55b85c'); }
}
function drawBeanbag() { R(592, 292, 28, 14, '#e2574c'); R(594, 290, 24, 4, '#f07a6e'); R(590, 300, 32, 8, '#c84b4b'); }
function drawLamp(night) { R(598, 200, 2, 32, '#3a3a44'); R(592, 232, 14, 2, '#3a3a44'); R(592, 192, 14, 9, night ? '#ffe7a6' : '#efe2c2'); R(592, 200, 14, 1, '#c9b98f'); }

// ---------------------------------------------------------------- agents
const GENERIC_REPLIES = ['ooh, show me', 'ha, same', 'did you log that?', 'ship it', 'wait, how?', 'love that', 'ablation?', 'add it to the eval', 'that is so you', 'okay that is cool', 'put it in the writeup', 'what did the agent say?'];

class Agent {
  constructor(P) {
    this.P = P; this.mem = []; this.frame = 0; this.ft = 0;
    this.act = 0; this.actT = rnd(15, 45); this.iconT = 0; this.nextIcon = rnd(2, 14);
    this.blinkT = rnd(1, 5); this.blink = 0; this.typeT = 0;
    this.path = null; this.goal = null; this.slot = null; this.dir = 'down';
    for (const w of P.weeks || []) this.remember(`Wk ${w.week}`, `built ${w.title}`);
    if (P.group) this.remember('Wk 8', `joined Group ${P.group} for the personalization build`);
  }
  get name() { return this.P.first; }
  remember(t, text) { this.mem.unshift({ t, text, at: performance.now() }); this.mem.length = Math.min(this.mem.length, 40); if (ui.sel === this) ui.fillMemory(); }
  get activity() {
    if (this.state === 'walking') return this.goal && this.goal.kind === 'seat' ? 'heading back to the table' : `walking to ${this.goal.poi.label}`;
    if (this.state === 'at') return this.goal.poi.verb;
    if (this.state === 'visit') return `checking in with ${this.goal.host.name}`;
    return this.P.activities[this.act % this.P.activities.length];
  }
  sit(T, seat) { this.table = T; this.seat = seat; this.state = 'seated'; this.x = seat.x; this.y = seat.y; this.dir = seat.dir; this.breakT = rnd(25, 160); }
  wander(first) {
    const keys = Object.keys(POIS).filter((k) => POIS[k].slots.some((s) => !taken.has(s)));
    const wts = keys.map((k) => POIS[k].w * (this.seat ? 1 : k === 'couch' || k === 'bean' ? 3 : 1) * (/fab|robot|hardware|soft|fabric/i.test(JSON.stringify(this.P.activities) + this.P.now) && k === 'fab' ? 4 : 1));
    let r = Math.random() * wts.reduce((a, b) => a + b, 0), k = keys[0];
    for (let i = 0; i < keys.length; i++) { r -= wts[i]; if (r <= 0) { k = keys[i]; break; } }
    const poi = POIS[k], slot = pick(poi.slots.filter((s) => !taken.has(s)));
    taken.add(slot); this.slot = slot;
    if (first) { this.x = slot[0]; this.y = slot[1]; this.slot = slot; this.goal = { kind: 'poi', poi }; this.arrive(true); return; }
    this.go({ kind: 'poi', poi }, slot);
  }
  visit() {
    const hosts = agents.filter((a) => a !== this && a.state === 'seated' && a.seat.kind === 'top' && a.table !== this.table && !agents.some((b) => b.goal && b.goal.host === a));
    if (!hosts.length) return this.wander();
    const host = pick(hosts);
    this.go({ kind: 'visit', host, poi: { label: `${host.name}'s table`, verb: `checking in with ${host.name}`, face: 'down' } }, [host.seat.x + (Math.random() < 0.5 ? -9 : 9), host.table.ty - 4]);
  }
  go(goal, [ex, ey]) {
    const from = this.state === 'seated' ? [this.seat.ax, this.seat.ay] : [this.x, this.y];
    this.path = [...(this.state === 'seated' ? [from] : []), ...astar(from[0], from[1], ex, ey)];
    if (goal.kind === 'seat') this.path.push([this.seat.x, this.seat.y]);
    this.goal = goal; this.state = 'walking';
  }
  goHome() { if (this.slot) { taken.delete(this.slot); this.slot = null; } if (this.seat) this.go({ kind: 'seat' }, [this.seat.ax, this.seat.ay]); else this.wander(); }
  arrive(silent) {
    const gl = this.goal;
    if (gl.kind === 'seat') { this.sit(this.table, this.seat); this.remember(clockStr(), 'came back to the table'); return; }
    if (gl.kind === 'visit') {
      this.state = 'visit'; this.dir = 'down'; this.stayT = rnd(10, 18);
      const line = pick(this.P.chatter.length ? this.P.chatter : GENERIC_REPLIES);
      say(this, line); setTimeout(() => say(gl.host, pick(gl.host.P.chatter.length && Math.random() < 0.5 ? gl.host.P.chatter : GENERIC_REPLIES)), 2200);
      this.remember(clockStr(), `stopped by ${gl.host.name}'s table: "${line}"`);
      gl.host.remember(clockStr(), `${this.name} stopped by to chat`);
      return;
    }
    this.slot = this.slot || [this.x, this.y];
    this.state = 'at'; this.dir = gl.poi.face; this.stayT = this.seat ? rnd(8, 20) : rnd(14, 40);
    this.icon = gl.poi.icon; this.iconT = 4;
    if (!silent) {
      this.remember(clockStr(), gl.poi.verb);
      for (const o of agents) if (o !== this && Math.hypot(o.x - this.x, o.y - this.y) < 70 && o.state !== 'walking') o.remember(clockStr(), `saw ${this.name} ${gl.poi.verb}`);
    }
  }
  update(dt) {
    this.ft += dt; if (this.ft > 0.14) { this.ft = 0; this.frame++; }
    this.blinkT -= dt; if (this.blinkT < 0) { this.blink = 0.14; this.blinkT = rnd(2, 6); } this.blink -= dt;
    this.iconT -= dt; this.nextIcon -= dt;
    if (this.nextIcon < 0 && this.state !== 'walking') {
      // keep the room readable: at most 4 thought icons up at once
      if (agents.filter((o) => o.iconT > 0).length >= 4) this.nextIcon = rnd(2, 6);
      else { this.icon = iconFor(this.activity); this.iconT = 3.5; this.nextIcon = rnd(9, 26); }
    }
    if (ui.sel === this) return; // they stop to talk to you
    if (this.state === 'seated') {
      this.actT -= dt; if (this.actT < 0) { this.act++; this.actT = rnd(25, 60); this.remember(clockStr(), `started ${this.activity}`); }
      this.breakT -= dt; if (this.breakT < 0) { Math.random() < 0.3 ? this.visit() : this.wander(); if (this.state === 'walking') this.remember(clockStr(), `got up from the table`); }
    } else if (this.state === 'walking') {
      let move = 30 * dt;
      while (move > 0 && this.path.length) {
        const [tx, ty] = this.path[0], dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
        if (Math.abs(dx) > Math.abs(dy) * 1.2) this.dir = dx > 0 ? 'right' : 'left'; else if (Math.abs(dy) > 0.01) this.dir = dy > 0 ? 'down' : 'up';
        if (d <= move) { this.x = tx; this.y = ty; this.path.shift(); move -= d; } else { this.x += dx / d * move; this.y += dy / d * move; move = 0; }
      }
      if (!this.path.length) this.arrive();
    } else if (this.state === 'at' || this.state === 'visit') {
      this.stayT -= dt;
      if (this.stayT < 0) this.goHome();
    }
  }
  // drawing
  get headTop() { return this.state === 'seated' && this.seat.kind === 'top' ? this.y - 21 : this.y - 22; }
  drawSeated(t) {
    const s = this.seat, talking = ui.sel === this && ui.typing;
    if (s.kind === 'top') drawPerson(this.P, this.x, this.y, 'down', 'sit', this.frame, { blink: this.blink > 0, talk: talking && this.frame % 2, typing: !talking && Math.floor(t / 180) % 2 === 0 && this.P.tableProps[0] === 'laptop' });
    else drawPerson(this.P, this.x, this.y, s.dir, 'sit', this.frame, { sideSit: true, reach: true, blink: this.blink > 0, talk: talking && this.frame % 2 });
  }
  drawDesk(t, night) {
    const s = this.homeSeat, T = this.table, P = this.P;
    if (s.kind === 'top') {
      drawProp(P.tableProps[0], s.x, T.ty + 2, t, P, true, night);
      if (P.tableProps[1]) drawProp(P.tableProps[1], s.x + (s.x > T.tx + 60 ? -14 : 9), T.ty + 7, t, P, false, night);
    } else {
      const ex = s.dir === 'right' ? T.tx + 9 : T.tx + TABLE_W - 9;
      drawProp('laptop', ex, T.ty + 4, t, P, false, night);
      if (P.tableProps[1]) drawProp(P.tableProps[1], ex + (s.dir === 'right' ? 5 : -9), T.ty + 12, t, P, false, night);
    }
  }
  drawFree() {
    const sitting = this.state === 'at' && this.goal.poi.sit;
    drawPerson(this.P, this.x, this.y, ui.sel === this ? 'down' : this.dir, this.state === 'walking' ? 'walk' : sitting ? 'sit' : 'stand', this.frame, { couch: sitting, blink: this.blink > 0, talk: ui.sel === this && ui.typing && this.frame % 2 });
  }
  hit(wx, wy) { const top = this.headTop; return wx >= this.x - 7 && wx <= this.x + 7 && wy >= top && wy <= (this.state === 'seated' && this.seat.kind === 'top' ? this.y - 5 : this.y + 1); }
}

const agents = [];
function setup() {
  const byGroup = {};
  for (const P of people) (byGroup[P.group || 0] ||= []).push(P);
  for (const [gk, list] of Object.entries(byGroup)) {
    list.sort((a, b) => a.name.localeCompare(b.name));
    if (+gk) {
      const T = tables[+gk - 1]; T.occupants = [];
      list.slice(0, 5).forEach((P, i) => { const a = new Agent(P); a.homeSeat = T.seats[i]; a.sit(T, T.seats[i]); a.breakT = rnd(8, 120); T.occupants.push(a); agents.push(a); });
      list.slice(5).forEach((P) => { const a = new Agent(P); agents.push(a); a.wander(true); });
    } else list.forEach((P) => { const a = new Agent(P); agents.push(a); a.wander(true); });
  }
  for (const T of tables) T.occupants ||= [];
}

// ---------------------------------------------------------------- ambient chatter (DOM bubbles)
const chats = [];
function say(a, text, ms = 3600) {
  const el = document.createElement('div'); el.className = 'chat'; el.textContent = text; overlay.appendChild(el);
  chats.push({ a, el, until: performance.now() + ms });
}
let chatterT = 4;
function chatter(dt) {
  chatterT -= dt; if (chatterT > 0) return; chatterT = rnd(5, 10);
  const busy = new Set(chats.map((c) => c.a));
  const T = pick(tables.filter((t) => t.occupants.filter((a) => a.state === 'seated' && !busy.has(a) && ui.sel !== a).length >= 2));
  if (!T) return;
  const here = T.occupants.filter((a) => a.state === 'seated' && ui.sel !== a);
  const sp = pick(here), other = pick(here.filter((a) => a !== sp));
  const line = pick(sp.P.chatter.length ? sp.P.chatter : GENERIC_REPLIES), reply = pick(GENERIC_REPLIES);
  say(sp, line); setTimeout(() => { if (ui.sel !== other) say(other, reply, 2800); }, 2000);
  sp.remember(clockStr(), `told ${other.name}: "${line}"`); other.remember(clockStr(), `${sp.name} said: "${line}"`);
}

// ---------------------------------------------------------------- render
function drawWindows(m, t) {
  const [top, bot] = skyAt(m), dk = darkness(m);
  WINDOWS.forEach(([x, y, w, h], wi) => {
    for (let i = 0; i < h; i += 2) R(x, y + i, w, 2, rgb(mix(top, bot, i / h)));
    if (dk > 0.3) for (const [sx, sy, tw] of stars) if (Math.sin(t / 700 + tw * 9) > -0.3) R(x + (sx + wi * 37) % w, y + sy, 1, 1, rgb([255, 255, 230], (dk - 0.3) * (0.6 + tw * 0.4)));
    // sun sinking in the right-hand (west) window
    if (wi === 1 && m > 14 * 60 && m < 16 * 60 + 40) { const p = (m - 840) / 160, sy = y + 6 + p * 40, sx = x + 70 + p * 16; R(sx - 3, sy - 3, 7, 7, rgb(mix(hex('#fff4c2'), hex('#ff8a4a'), p))); R(sx - 4, sy - 2, 9, 5, rgb(mix(hex('#fff4c2'), hex('#ff8a4a'), p), 0.8)); }
    // clouds drift by day
    if (dk < 0.8) for (let k = 0; k < 3; k++) { const cx = x + ((t / (90 + k * 40) + k * 47 + wi * 20) % (w + 30)) - 20, cy = y + 6 + k * 7; g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); R(cx, cy, 16, 3, rgb([255, 255, 255], 0.55 * (1 - dk))); R(cx + 4, cy - 2, 8, 2, rgb([255, 255, 255], 0.55 * (1 - dk))); g.restore(); }
    // skyline (Boston across the river on the left, Cambridge on the right)
    const base = y + h, sc = rgb(mix(hex('#5f7896'), hex('#141833'), Math.min(1, dk + golden(m) * 0.4)));
    for (const b of skyline[wi]) {
      if (b.x >= w) continue; const bw = Math.min(b.w, w - b.x);
      R(x + b.x, base - b.h - (wi === 0 ? 6 : 0), bw, b.h, sc);
      if (dk > 0.4) for (const [lx, ly] of b.lit) if (lx < bw) R(x + b.x + lx, base - b.h - (wi === 0 ? 6 : 0) + ly, 1, 1, rgb([255, 214, 120], (dk - 0.4) * 1.5));
    }
    if (wi === 0) { // the Charles
      for (let i = 0; i < 6; i++) R(x, base - 6 + i, w, 1, rgb(mix(mix(bot, hex('#2a4a6a'), 0.5), hex('#0b1530'), dk * 0.8)));
      for (let i = 0; i < 6; i++) R(x + ((t / 60 + i * 23) % w), base - 4 + (i % 3), 4, 1, rgb([255, 255, 255], 0.25));
    }
    R(x + 8, y + 4, 1, 10, 'rgba(255,255,255,.18)'); R(x + 11, y + 4, 1, 6, 'rgba(255,255,255,.12)'); // glass glint
  });
}

function drawBeams(m) {
  const dk = darkness(m), gl = golden(m);
  const a = (1 - dk) * 0.07 + gl * 0.06; if (a <= 0.005) return;
  g.fillStyle = rgb(gl > 0.2 ? [255, 190, 120] : [255, 245, 210], a);
  for (const [x, , w] of WINDOWS) { g.beginPath(); g.moveTo(x, 72); g.lineTo(x + w, 72); g.lineTo(x + w + 70, 200); g.lineTo(x + 70, 200); g.fill(); }
}

function drawLights(m) {
  const dk = darkness(m); if (dk <= 0.01) return;
  const lc = lightLayer.getContext('2d');
  lc.globalCompositeOperation = 'source-over'; lc.clearRect(0, 0, W, H);
  lc.fillStyle = `rgba(14,12,44,${0.55 * dk})`; lc.fillRect(0, 0, W, H);
  lc.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, s) => { const gr = lc.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(0,0,0,${s})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); lc.fillStyle = gr; lc.fillRect(x - r, y - r, r * 2, r * 2); };
  for (const T of tables) hole(T.tx + 42, T.ty + 8, 78, 0.85);
  hole(599, 205, 60, 0.9); hole(574, 70, 46, 0.7); hole(594, 130, 40, 0.6); hole(470, 300, 34, 0.5); hole(320, 330, 50, 0.4);
  g.drawImage(lightLayer, 0, 0);
  // warm pools under the table lamps
  g.globalCompositeOperation = 'lighter';
  for (const T of tables) { const gr = g.createRadialGradient(T.tx + 42, T.ty + 8, 0, T.tx + 42, T.ty + 8, 60); gr.addColorStop(0, `rgba(255,190,110,${0.13 * dk})`); gr.addColorStop(1, 'rgba(255,190,110,0)'); g.fillStyle = gr; g.fillRect(T.tx - 20, T.ty - 52, 124, 120); }
  g.globalCompositeOperation = 'source-over';
}

function render(t) {
  const m = clock.min, night = darkness(m) > 0.5;
  g.drawImage(floorLayer, 0, 0);
  drawWindows(m, t);
  g.drawImage(wallLayer, 0, 0);
  drawBeams(m);
  // y-sorted scene
  const items = [
    { y: 90, d: () => drawCounter(t, night) }, { y: 161, d: () => drawFab(t) }, { y: 233, d: drawCouchBack }, { y: 236, d: () => drawLamp(night) },
    { y: 268, d: () => drawCoffeeTable(t) }, { y: 346, d: drawShelf }, { y: 306, d: drawBeanbag },
    { y: 356, d: () => drawPlant(16, 356, true) }, { y: 356, d: () => drawPlant(622, 356, true) }, { y: 108, d: () => drawPlant(430, 108) }, { y: 108, d: () => drawPlant(14, 108) },
  ];
  for (const T of tables) items.push({ y: T.base, d: () => drawTable(T, t, night) });
  for (const a of agents) if (a.state !== 'seated') items.push({ y: a.y + (a.state === 'at' && a.goal.poi.sit ? 0.5 : 0), d: () => a.drawFree() });
  items.sort((a, b) => a.y - b.y).forEach((i) => i.d());
  drawLights(m);
  // overhead icons and the selection marker
  for (const a of agents) {
    if (a === ui.sel) { const by = a.headTop - 9 + (Math.floor(t / 300) % 2); R(a.x - 3, by, 7, 2, '#f2c14e'); R(a.x - 2, by + 2, 5, 1, '#f2c14e'); R(a.x - 1, by + 3, 3, 1, '#f2c14e'); R(a.x, by + 4, 1, 1, '#f2c14e'); continue; }
    if (a.iconT > 0 && !chats.some((c) => c.a === a)) drawIcon(a.icon, a.x, a.headTop - 14, t);
  }
  if (ui.hover && ui.hover !== ui.sel) { const a = ui.hover; R(a.x - 7, a.headTop - 2, 1, 1, '#fff'); R(a.x + 7, a.headTop - 2, 1, 1, '#fff'); }
}

// ---------------------------------------------------------------- screen mapping
let scale = 1, ox = 0, oy = 0;
function resize() {
  const s = Math.min((innerWidth - 24) / W, (innerHeight - 70) / H);
  scale = s >= 2 ? Math.floor(s * 2) / 2 : Math.max(0.5, s);
  cv.style.width = `${W * scale}px`; cv.style.height = `${H * scale}px`;
  const r = cv.getBoundingClientRect(); ox = r.left; oy = r.top;
}
const toScreen = (x, y) => [ox + x * scale, oy + y * scale];
addEventListener('resize', resize);

// ---------------------------------------------------------------- dialogue + inspector
const $ = (id) => document.getElementById(id);
let audio = null, muted = false;
function blip(freq) {
  if (muted) return;
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), gn = audio.createGain();
    o.type = 'square'; o.frequency.value = freq * (0.94 + Math.random() * 0.12);
    gn.gain.setValueAtTime(0.035, audio.currentTime); gn.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.05);
    o.connect(gn).connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.06);
  } catch (e) { /* audio is optional */ }
}

const ui = {
  sel: null, hover: null, bubble: null, lines: [], li: 0, shown: 0, typing: false, special: null,
  open(a) {
    this.closeBubble();
    this.sel = a; this.special = null;
    const P = a.P, lines = [...P.lines];
    if (a.state !== 'seated') lines.unshift(a.state === 'walking' ? `Oh hey! Just ${a.goal.kind === 'seat' ? 'heading back to my seat' : `on my way to ${a.goal.poi.label}`}. Then back to ${P.now}.` : `Taking a quick break, ${a.activity}. Back to ${P.now} soon.`);
    this.lines = lines; this.li = 0;
    this.mountBubble(P.first.toUpperCase(), P.group ? `GROUP ${P.group}` : 'VISITING');
    this.fillPanel(a);
    a.remember(clockStr(), 'talked with a visitor about their work');
    if (window.Track) Track.event(`person/${P.id}`, P.name);
  },
  openSpecial(key, title, tag, lines, anchor) {
    this.closeBubble(); this.sel = null; this.special = anchor;
    this.lines = lines; this.li = 0; this.mountBubble(title, tag);
  },
  mountBubble(title, tag) {
    const el = document.createElement('div'); el.className = 'bubble px';
    el.innerHTML = `<div class="hd"><span>${esc(title)}</span><i>${esc(tag)}</i></div><div class="tx"></div><div class="nx">▼</div>`;
    el.addEventListener('click', (e) => { e.stopPropagation(); this.advance(); });
    overlay.appendChild(el); this.bubble = el; this.startLine();
  },
  startLine() { this.shown = 0; this.typing = true; this.bubble.querySelector('.nx').style.visibility = 'hidden'; this.charT = 0; },
  advance() {
    if (!this.bubble) return;
    if (this.typing) { this.shown = this.lines[this.li].length; return; }
    this.li++;
    if (this.li >= this.lines.length) { this.close(); return; }
    this.startLine();
  },
  tick(dt) {
    if (!this.bubble) return;
    if (this.typing) {
      this.charT += dt;
      const line = this.lines[this.li];
      while (this.charT > 0.028 && this.shown < line.length) {
        this.charT -= 0.028; this.shown++;
        const ch = line[this.shown - 1];
        if (ch !== ' ' && this.shown % 2) blip(this.sel ? this.sel.P.voice : 260);
        if (',.!?'.includes(ch)) this.charT -= 0.12; // small pause at punctuation
      }
      this.bubble.querySelector('.tx').textContent = line.slice(0, this.shown);
      if (this.shown >= line.length) {
        this.typing = false; const nx = this.bubble.querySelector('.nx');
        nx.style.visibility = 'visible'; nx.textContent = this.li < this.lines.length - 1 ? `▼ ${this.li + 1}/${this.lines.length}` : '■ END';
      }
    }
    const [x, y] = this.sel ? [this.sel.x, this.sel.headTop - 10] : this.special;
    const [sx, sy] = toScreen(x, y), w = this.bubble.offsetWidth;
    this.bubble.style.left = `${Math.max(w / 2 + 8, Math.min(innerWidth - w / 2 - 8 - (panel.hidden ? 0 : 300), sx))}px`;
    this.bubble.style.top = `${Math.max(this.bubble.offsetHeight + 20, sy)}px`;
  },
  closeBubble() { if (this.bubble) this.bubble.remove(); this.bubble = null; this.typing = false; },
  close() { this.closeBubble(); this.sel = null; this.special = null; },
  fillPanel(a) {
    const P = a.P; panel.hidden = false;
    $('p-name').textContent = P.name.toUpperCase();
    $('p-meta').textContent = [P.dept, P.group ? `Group ${P.group}` : null].filter(Boolean).join(' · ');
    $('p-vibe').textContent = P.vibe || '';
    $('p-themes').innerHTML = (P.themes || []).map((t) => `<span>${esc(t)}</span>`).join('');
    $('p-weeks').innerHTML = (P.weeks || []).length ? P.weeks.map((w) => {
      const title = w.url ? `<a href="${esc(w.url)}" target="_blank" rel="noopener" data-ev="build/${P.id}/${w.week}">${esc(w.title)} ↗</a>` : esc(w.title);
      return `<li><span class="wk">W${w.week}</span>${title}${w.gist ? `<small>${esc(w.gist)}</small>` : ''}</li>`;
    }).join('') : '<li>Nothing posted yet.</li>';
    const byId = (id) => people.find((q) => q.id === id);
    const pairs = (P.pairs || []).filter((x) => byId(x.with));
    $('p-pairs-box').hidden = !pairs.length;
    $('p-pairs').innerHTML = pairs.map((x) => `<li><button data-go="${x.with}" data-ev="pair/${P.id}/${x.with}">${esc(byId(x.with).name)}</button><small>${esc(x.mine)} ↔ ${esc(x.theirs)}. ${esc(x.reason)}</small></li>`).join('');
    const rel = (P.related || []).filter((x) => byId(x.id));
    $('p-rel-box').hidden = !rel.length;
    $('p-rel').innerHTML = rel.map((x) => { const O = byId(x.id); return `<li><button data-go="${O.id}" data-ev="related/${P.id}/${O.id}"><i style="background:${O.primary}"></i>${esc(O.name)}</button><small>${O.group ? `Group ${O.group} · ` : ''}${esc(x.shared.join(', '))}</small></li>`; }).join('');
    $('p-site').href = P.site; $('p-site').dataset.ev = `site/${P.id}`;
    const pc = $('portrait').getContext('2d');
    pc.clearRect(0, 0, 20, 24); withG(pc, () => drawPerson(P, 10, 23, 'down', 'stand', 0, { noShadow: true }));
    this.panelFor = a; this.fillNow(); this.fillMemory();
  },
  fillNow() { if (this.panelFor) $('p-now').textContent = this.panelFor.activity; },
  fillMemory() {
    const a = this.panelFor; if (!a) return;
    const fresh = performance.now() - 1200;
    $('p-mem').innerHTML = a.mem.slice(0, 14).map((m) => `<li class="${m.at > fresh ? 'new' : ''}"><span class="t">${esc(m.t)}</span>${esc(m.text)}</li>`).join('');
  },
};
const panel = $('panel');
// links and buttons inside the panel: count them, and jump to a related classmate
panel.addEventListener('click', (e) => {
  const ev = e.target.closest('[data-ev]'); if (ev && window.Track) Track.event(ev.dataset.ev);
  const go = e.target.closest('[data-go]'); if (go) openPerson(go.dataset.go);
});
function openPerson(id) { const a = agents.find((x) => x.P.id === id); if (a) ui.open(a); }
window.studio = { openPerson, people: () => people, agents: () => agents };
$('close').onclick = () => { panel.hidden = true; ui.panelFor = null; ui.close(); };

const toWorld = (e) => [(e.clientX - ox) / scale, (e.clientY - oy) / scale];
function agentAt(wx, wy) { return agents.filter((a) => a.hit(wx, wy)).sort((a, b) => b.y - a.y)[0]; }
function tableAt(wx, wy) { return tables.find((T) => wx >= T.tx && wx <= T.tx + TABLE_W && wy >= T.ty && wy <= T.ty + TABLE_H + 5); }

addEventListener('click', (e) => {
  if (e.target.closest('#panel, #hud, .bubble, .page')) return;
  const [wx, wy] = toWorld(e);
  const a = agentAt(wx, wy);
  if (a) { if (ui.sel === a) ui.advance(); else ui.open(a); return; }
  if (wx >= 138 && wx <= 298 && wy >= 6 && wy <= 58) {
    if (window.Track) Track.event('board', 'Whiteboard');
    return ui.openSpecial('board', 'WHITEBOARD', 'WEEK 8', [
      'Week 8: build a personalization feature for the Course Agent, in your group.',
      'How can a course agent remember, adapt and personalize to students to help them learn, stay motivated, or connect?',
      'Fork the repo, build it, open a pull request. Draw the user, the agent, the memory, the tools.',
      'Show one moment where something it learned about you changes what it does later.',
      'Plan the most rigorous evaluation you could run. Due Monday, Nov 9, 11:59 PM.',
    ], [218, 58]);
  }
  if (wx >= 304 && wx <= 390 && wy >= 8 && wy <= 54) {
    if (window.Track) Track.event('pinboard', 'Pinboard');
    return ui.openSpecial('cork', 'PINBOARD', `${people.length} SITES`, ['Everyone\'s course site is pinned up here.', 'Click a person, then VISIT SITE in their card to read their write-ups.'], [348, 54]);
  }
  const T = tableAt(wx, wy);
  if (T && T.occupants.length && window.Track) Track.event(`table/${T.group}`, `Group ${T.group} table`);
  if (T && T.occupants.length) return ui.openSpecial('table', `GROUP ${T.group}`, 'WEEK 8', [`${T.occupants.map((o) => o.P.first).join(' · ')}`, 'This table is building a personalization feature for the Course Agent this week.'], [T.tx + 42, T.ty]);
  ui.close();
});
addEventListener('mousemove', (e) => {
  const [wx, wy] = toWorld(e);
  const a = agentAt(wx, wy), tip = $('tip');
  ui.hover = a || null;
  const hot = a || (wx >= 138 && wx <= 390 && wy >= 6 && wy <= 58) || tableAt(wx, wy);
  cv.style.cursor = hot ? 'pointer' : 'default';
  if (a && a !== ui.sel) { tip.hidden = false; tip.innerHTML = `<b>${esc(a.P.name.toUpperCase())}</b>${esc(a.activity)}`; const [sx, sy] = toScreen(a.x, a.headTop - 4); tip.style.left = `${sx}px`; tip.style.top = `${sy - 6}px`; }
  else tip.hidden = true;
});
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { ui.close(); panel.hidden = true; ui.panelFor = null; }
  else if (e.key === ' ' || e.key === 'Enter') { if (ui.bubble) { e.preventDefault(); ui.advance(); } }
  else if (e.key === 'p' || e.key === 'P') $('pause').click();
  else if (e.key === 's' || e.key === 'S') $('speed').click();
  else if (e.key === 'm' || e.key === 'M') $('sound').click();
});
const SPEEDS = [1, 3, 8];
$('pause').onclick = () => { clock.paused = !clock.paused; $('pause').textContent = clock.paused ? '▶' : 'II'; };
$('speed').onclick = () => { clock.speed = SPEEDS[(SPEEDS.indexOf(clock.speed) + 1) % SPEEDS.length]; $('speed').textContent = `${clock.speed}x`; };
$('sound').onclick = () => { muted = !muted; $('sound').textContent = muted ? '♪ OFF' : '♪ ON'; };

// ---------------------------------------------------------------- main loop
let last = performance.now(), panelT = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!clock.paused) {
    const sdt = dt * clock.speed;
    clock.min += sdt; // one game minute per real second at 1x
    for (const a of agents) a.update(sdt);
    chatter(sdt);
  }
  ui.tick(dt);
  render(now);
  for (let i = chats.length - 1; i >= 0; i--) {
    const c = chats[i];
    if (now > c.until) { c.el.remove(); chats.splice(i, 1); continue; }
    const [sx, sy] = toScreen(c.a.x, c.a.headTop - 3); c.el.style.left = `${sx}px`; c.el.style.top = `${sy}px`;
  }
  panelT -= dt; if (panelT < 0) { panelT = 0.5; ui.fillNow(); $('clock').textContent = `SUN NOV 8 · ${clockStr()}`; }
  requestAnimationFrame(loop);
}

paintStatic();
setup();
resize();
requestAnimationFrame(loop);
