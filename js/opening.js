/* 「对合」 opening. Faithful port of the locked single-file canvas (DUR = 4000).
 * Beat math is the official file: fractions written as n/2.4 sit inside the
 * 4.000s timeline. The real table starts fading at TABLE_FADE_MS (3130), under
 * the canvas, and the canvas ends at OPENING_MS. No 再看一次 control.
 */
export const OPENING_MS = 4000;
export const TABLE_FADE_MS = 3130;

/** Home 「开始对局」 plays the opening. 「再来一局」 deals straight in. */
export function shouldPlayOpening(action) {
  return action === 'start';
}

/** Official timers: reveal the table at 3130ms, end the canvas at 4000ms. */
export function scheduleOpening(setTimer, onReveal, onDone) {
  setTimer(onReveal, TABLE_FADE_MS);
  setTimer(onDone, OPENING_MS);
}

function easeOutExpo(t) { return t === 1 ? 1 : 1 - (2 ** (-10 * t)); }
function easeInCubic(t) { return t * t * t; }
function easeOutBack(t) {
  const c = 1.70158;
  return 1 + (c + 1) * ((t - 1) ** 3) + c * ((t - 1) ** 2);
}
function clamp(t) { return Math.max(0, Math.min(1, t)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function range(a, b, t) { return clamp((t - a) / (b - a)); }

/** Pure beat sample. `table` is the 3130ms fade; `settled` is the end of the 4s. */
export function openingSample(elapsedMs) {
  const p = clamp(elapsedMs / OPENING_MS);
  return {
    p,
    table: elapsedMs >= TABLE_FADE_MS,
    settled: elapsedMs >= OPENING_MS,
    ringDraw: easeOutExpo(range(0.10, 0.38, p)),
    ringHold: 1 - easeInCubic(range(1.42 / 2.4, 1.58 / 2.4, p)),
    ringScale: lerp(1.15, 0.35, easeInCubic(range(1.25 / 2.4, 1.58 / 2.4, p))),
    ringsOn: p < 1.7 / 2.4,
    orbitIn: easeOutExpo(range(0.22, 0.48, p)),
    slam: easeInCubic(range(1.28 / 2.4, 1.58 / 2.4, p)),
    deal: easeOutBack(range(1.68 / 2.4, 2.28 / 2.4, p)),
    spin: (easeInCubic(range(0.22, 1.55 / 2.4, p)) * 2.15 + p * 0.35) * Math.PI * 2,
    impact: range(1.50 / 2.4, 1.78 / 2.4, p),
    word: range(1.52 / 2.4, 2.05 / 2.4, p),
    flip: range(0.70 / 2.4, 1.40 / 2.4, p),
  };
}

/** Left ring spins one way, right ring the other. */
export function ringSpinSign(ring) {
  return ring === 0 ? 1 : -1;
}

const INK = '#12110F';
const BRONZE = '#B08A4F';

export const OPENING_FACES = [
  { r: 'A', s: 'S' },
  { r: '2', s: 'H', level: true, wild: true },
  { r: 'K', s: 'S' },
  { r: 'Q', s: 'D' },
  { r: 'J', s: 'C' },
  { r: 'A', s: 'H' },
  { r: '10', s: 'S' },
  { r: 'K', s: 'D' },
  { r: 'BJ', s: 'J' },
  { r: 'SJ', s: 'J' },
];

const RASTER_W = 280;
const RASTER_H = 400;

export function openingCardSVG(face) {
  const api = globalThis.DeuxCards || globalThis.GuanDanCards;
  if (!api) return '';
  return api.cardSVG(face.r, face.s, {
    width: RASTER_W,
    level: !!face.level,
    wild: !!face.wild,
  });
}

export function openingBackSVG() {
  const api = globalThis.DeuxCards || globalThis.GuanDanCards;
  if (!api) return '';
  return api.backSVG({ width: RASTER_W });
}

function bytesToBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function loadOpeningFontCSS() {
  try {
    const text = 'DEUXJACKQUEENKINGA2345678910JQK级配大小王';
    const url = `https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Noto+Serif+SC:wght@600;700&text=${encodeURIComponent(text)}`;
    let css = await fetch(url).then((res) => res.text());
    const urls = [...new Set([...css.matchAll(/url\(([^)]+)\)/g)].map((m) => m[1].replace(/["']/g, '')))];
    for (const fontUrl of urls) {
      const buf = new Uint8Array(await fetch(fontUrl).then((res) => res.arrayBuffer()));
      css = css.split(fontUrl).join(`data:font/woff2;base64,${bytesToBase64(buf)}`);
    }
    return css;
  } catch {
    return '';
  }
}

function withFonts(svg, css) {
  if (!css) return svg;
  return svg.replace(/(<svg\b[^>]*>)/, `$1<defs><style>${css}</style></defs>`);
}

function svgToCanvas(svg) {
  return new Promise((resolve) => {
    const img = new Image();
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = RASTER_W;
      canvas.height = RASTER_H;
      canvas.getContext('2d').drawImage(img, 0, 0, RASTER_W, RASTER_H);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

async function rasterizeOpeningCards() {
  const css = await loadOpeningFontCSS();
  const back = await svgToCanvas(withFonts(openingBackSVG(), css));
  const faces = [];
  for (const face of OPENING_FACES) {
    faces.push({ ...face, canvas: await svgToCanvas(withFonts(openingCardSVG(face), css)) });
  }
  return { back, faces };
}

/**
 * Play the opening over `app`. Calls onReveal at 3130ms so the real table can
 * fade in under the canvas, and resolves at 4000ms. The layer stays until the
 * caller paints the settled table.
 */
export function playOpening(app, { sound = true, onReveal } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const home = app.querySelector('.start');
    const layer = document.createElement('div');
    layer.className = 'deux-opening';
    const stage = document.createElement('div');
    stage.className = 'deux-stage';
    const slot = document.createElement('div');
    slot.className = 'table-slot';
    const canvas = document.createElement('canvas');
    canvas.className = 'deux-fx';
    if (home) stage.appendChild(home);
    stage.appendChild(slot);
    stage.appendChild(canvas);
    layer.appendChild(stage);
    app.appendChild(layer);
    app.classList.add('staging');
    if (home) void home.offsetWidth;
    requestAnimationFrame(() => home?.classList.add('exit'));

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      scheduleOpening(setTimeout, () => onReveal?.(), done);
      return;
    }

    let playing = false;
    let startT = 0;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let audioCtx = null;

    function resize() {
      const r = stage.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function tone(freq, dur, type, gain, at) {
      if (!audioCtx) return;
      const t0 = audioCtx.currentTime + (at || 0);
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    }

    function noiseWhoosh(dur, gain, at) {
      if (!audioCtx) return;
      const t0 = audioCtx.currentTime + (at || 0);
      const n = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
      const d = n.getChannelData(0);
      for (let i = 0; i < d.length; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = audioCtx.createBufferSource();
      src.buffer = n;
      const f = audioCtx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1800;
      f.Q.value = 0.7;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f);
      f.connect(g);
      g.connect(audioCtx.destination);
      src.start(t0);
      src.stop(t0 + dur);
    }

    function playSound() {
      try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        tone(220, 0.08, 'triangle', 0.08, 0);
        noiseWhoosh(1.92, 0.07, 0.37);
        tone(62, 0.42, 'sine', 0.22, 2.53);
        tone(186, 0.16, 'triangle', 0.1, 2.53);
        tone(880, 0.08, 'square', 0.03, 2.57);
        tone(330, 0.24, 'sine', 0.06, 3.25);
      } catch {
        /* autoplay can reject; the picture still runs */
      }
    }

    function drawCard(c, x, y, rot, w, h, flip, face, alpha) {
      const img = Math.cos(flip) >= 0 ? backCanvas : face?.canvas;
      if (!img) return;
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.globalAlpha *= alpha;
      const k = Math.cos(flip);
      c.scale(Math.max(0.08, Math.abs(k)), 1);
      c.drawImage(img, -w / 2, -h / 2, w, h);
      c.restore();
    }

    function drawRings(c, cx, cy, p, scale) {
      const R = Math.min(W, H) * 0.18 * scale;
      const sep = R * 0.62;
      c.save();
      c.translate(cx, cy);
      c.strokeStyle = BRONZE;
      c.lineWidth = 1.6;
      c.globalAlpha = p;
      c.setLineDash([R * Math.PI * 2, R * Math.PI * 2]);
      c.lineDashOffset = R * Math.PI * 2 * (1 - p);
      c.beginPath();
      c.arc(-sep, 0, R, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(sep, 0, R, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
      c.restore();
    }

    const N = 22;
    let backCanvas = null;
    let cards = [];

    function frame(now) {
      if (!playing) return;
      const t = now - startT;
      const sample = openingSample(t);
      const { p } = sample;
      ctx.clearRect(0, 0, W, H);

      const cx = W / 2;
      const cy = H * 0.46;

      const veil = easeOutExpo(range(0.02, 0.22, p));
      ctx.fillStyle = `rgba(244,239,230,${0.2 + veil * 0.72})`;
      ctx.fillRect(0, 0, W, H);

      const { ringDraw, ringHold, ringScale } = sample;
      if (ringDraw > 0 && sample.ringsOn) {
        drawRings(ctx, cx, cy, ringDraw * ringHold, ringScale);
      }

      const { orbitIn, slam, deal, spin } = sample;

      const baseR = Math.min(W, H) * 0.32;
      const radius = lerp(baseR * 1.15, 8, slam) * orbitIn * (1 - deal * 0.15);

      const dealTargets = [
        { x: W * 0.50, y: H * 0.20 },
        { x: W * 0.16, y: H * 0.38 },
        { x: W * 0.84, y: H * 0.38 },
        { x: W * 0.50, y: H * 0.78 },
      ];

      if (orbitIn > 0 && deal < 1) {
        for (const card of cards) {
          const dir = ringSpinSign(card.ring);
          const base = (card.i / N) * Math.PI * 2 + (card.ring ? Math.PI / N : 0);
          const ang = base + spin * dir;
          const ellipse = 0.62;
          const rr = radius * (card.ring === 0 ? 1.0 : 0.68);
          let x = cx + Math.cos(ang) * rr;
          let y = cy + Math.sin(ang) * rr * ellipse;
          const z = (Math.sin(ang) + 1) / 2;
          const sc = lerp(0.72, 1.18, z);
          const cw = 54 * sc;
          const ch = 80 * sc;
          let rot = ang + Math.PI / 2 + dir * 0.15;
          const flipT = range((0.70 + (card.i % 5) * 0.06) / 2.4, 1.40 / 2.4, p);
          const flip = (card.i % 2 === 0 ? 1 : 0) * flipT * Math.PI;
          let alpha = orbitIn * (1 - deal * 0.15);

          if (p > 0.3 && p < 1.55 / 2.4) {
            for (let k = 3; k >= 1; k -= 1) {
              const a2 = ang - dir * k * 0.05;
              const tx = cx + Math.cos(a2) * rr;
              const ty = cy + Math.sin(a2) * rr * ellipse;
              drawCard(ctx, tx, ty, rot, cw, ch, 0, card.face, alpha * 0.10 * k);
            }
          }

          if (deal > 0) {
            const tgt = dealTargets[card.i % 4];
            const stacked = Math.floor(card.i / 4) * 0.8;
            x = lerp(x, tgt.x + (card.ring ? 5 : -5), deal);
            y = lerp(y, tgt.y + stacked, deal);
            rot = lerp(rot, (card.i % 4 - 1.5) * 0.04, deal);
            alpha = lerp(alpha, 0.0, range(0.75, 1, deal));
          }

          drawCard(ctx, x, y, rot, cw, ch, flip, card.face, alpha);
        }
      }

      const { impact } = sample;
      if (impact > 0 && impact < 1) {
        const a = impact < 0.25 ? impact / 0.25 : 1 - (impact - 0.25) / 0.75;
        const grd = ctx.createRadialGradient(cx, cy, 4, cx, cy, Math.min(W, H) * 0.55);
        grd.addColorStop(0, `rgba(176,138,79,${0.85 * a})`);
        grd.addColorStop(0.35, `rgba(244,239,230,${0.35 * a})`);
        grd.addColorStop(1, 'rgba(244,239,230,0)');
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, W, H);
        ctx.beginPath();
        ctx.arc(cx, cy, lerp(20, Math.min(W, H) * 0.7, easeOutExpo(impact)), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(176,138,79,${0.55 * (1 - impact)})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      const { word } = sample;
      if (word > 0 && word < 1) {
        const wa = word < 0.2 ? word / 0.2 : (word < 0.65 ? 1 : 1 - (word - 0.65) / 0.35);
        ctx.save();
        ctx.globalAlpha = clamp(wa);
        ctx.fillStyle = INK;
        ctx.font = `600 ${Math.round(Math.min(W, 420) * 0.18)}px "Cormorant Garamond", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = '0.42em';
        const spread = easeInCubic(range(0.65, 1, word)) * 80;
        ctx.fillText('DEUX', cx + 8, cy - spread * 0.15);
        ctx.restore();
      }

      if (p > 1.5 / 2.4 && p < 1.62 / 2.4) {
        canvas.style.transform = `translate(${(Math.random() - 0.5) * 4}px, ${(Math.random() - 0.5) * 3}px)`;
      } else {
        canvas.style.transform = '';
      }

      if (p >= 1) {
        playing = false;
        window.removeEventListener('resize', resize);
        done();
        return;
      }
      requestAnimationFrame(frame);
    }

    window.addEventListener('resize', resize);
    if (home) void home.offsetWidth;

    const boot = async () => {
      let art = null;
      try {
        art = await Promise.race([
          rasterizeOpeningCards(),
          new Promise((finish) => setTimeout(() => finish(null), 1500)),
        ]);
      } catch {
        art = null;
      }
      backCanvas = art?.back || null;
      const faces = art?.faces?.length ? art.faces : OPENING_FACES;
      cards = Array.from({ length: N * 2 }, (_, i) => ({
        ring: i < N ? 0 : 1,
        i: i % N,
        face: faces[i % faces.length],
      }));
      requestAnimationFrame(() => {
        layer.classList.add('on');
        resize();
        playing = true;
        startT = performance.now();
        if (sound) playSound();
        scheduleOpening(setTimeout, () => {
          try { onReveal?.(); } catch { /* the canvas still finishes */ }
        }, done);
        requestAnimationFrame(frame);
      });
    };
    boot();
  });
}
