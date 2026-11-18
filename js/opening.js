/* 「对合」 opening. Faithful port of the locked single-file canvas (DUR = 4000).
 * Beat math is the official file, unchanged: fractions written as n/2.4 are
 * positions inside the 4.000s timeline, not a shorter duration.
 * The real table is shown only after OPENING_MS. The demo's placeholder table
 * (the one that fades in at 3130ms and offers 再看一次) is not part of the game.
 */
export const OPENING_MS = 4000;

function easeOutExpo(t) { return t === 1 ? 1 : 1 - (2 ** (-10 * t)); }
function easeInCubic(t) { return t * t * t; }
function easeOutBack(t) {
  const c = 1.70158;
  return 1 + (c + 1) * ((t - 1) ** 3) + c * ((t - 1) ** 2);
}
function clamp(t) { return Math.max(0, Math.min(1, t)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function range(a, b, t) { return clamp((t - a) / (b - a)); }

/** Pure beat sample. `table` is true only once the locked 4000ms have elapsed. */
export function openingSample(elapsedMs) {
  const p = clamp(elapsedMs / OPENING_MS);
  return {
    p,
    table: elapsedMs >= OPENING_MS,
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
const LACQUER = '#8B1E1E';
const BRONZE = '#B08A4F';

const FACES = [
  { r: 'A', s: '♠', red: false },
  { r: '2', s: '♥', red: true },
  { r: 'K', s: '♠', red: false },
  { r: 'Q', s: '♦', red: true },
  { r: 'J', s: '♣', red: false },
  { r: 'A', s: '♥', red: true },
  { r: '10', s: '♠', red: false },
  { r: 'K', s: '♦', red: true },
];

/**
 * Play the opening over `app`. Resolves at OPENING_MS (the first frame at or
 * after 4.000s). Does not remove its own layer; the next table paint replaces
 * the document so the dealt table appears as the canvas ends.
 */
export function playOpening(app, { sound = true } = {}) {
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
    const canvas = document.createElement('canvas');
    canvas.className = 'deux-fx';
    stage.appendChild(canvas);
    layer.appendChild(stage);
    app.appendChild(layer);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      home?.classList.add('exit');
      setTimeout(done, OPENING_MS);
      return;
    }

    const DUR = OPENING_MS;
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

    function roundRect(c, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      c.beginPath();
      c.moveTo(x + rr, y);
      c.arcTo(x + w, y, x + w, y + h, rr);
      c.arcTo(x + w, y + h, x, y + h, rr);
      c.arcTo(x, y + h, x, y, rr);
      c.arcTo(x, y, x + w, y, rr);
      c.closePath();
    }

    function drawBack(c, w, h) {
      c.fillStyle = '#FBF8F2';
      roundRect(c, -w / 2, -h / 2, w, h, Math.min(8, w * 0.08));
      c.fill();
      c.strokeStyle = BRONZE;
      c.lineWidth = 1.2;
      c.stroke();
      c.strokeStyle = INK;
      c.lineWidth = 0.6;
      roundRect(c, -w / 2 + 3.5, -h / 2 + 3.5, w - 7, h - 7, Math.min(5, w * 0.06));
      c.stroke();
      const R = Math.min(w, h) * 0.22;
      c.save();
      c.strokeStyle = BRONZE;
      c.lineWidth = 1.15;
      c.beginPath();
      c.arc(-R * 0.55, 0, R, 0, Math.PI * 2);
      c.stroke();
      c.beginPath();
      c.arc(R * 0.55, 0, R, 0, Math.PI * 2);
      c.stroke();
      c.restore();
      c.fillStyle = BRONZE;
      c.font = `600 ${Math.max(7, w * 0.13)}px "Cormorant Garamond", serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.letterSpacing = '0.2em';
      c.fillText('DEUX', 0, h / 2 - Math.max(10, h * 0.1));
    }

    function drawFace(c, w, h, face) {
      c.fillStyle = '#FBF8F2';
      roundRect(c, -w / 2, -h / 2, w, h, Math.min(8, w * 0.08));
      c.fill();
      c.strokeStyle = 'rgba(18,17,15,.35)';
      c.lineWidth = 1;
      c.stroke();
      const col = face.red ? LACQUER : INK;
      c.fillStyle = col;
      const fs = Math.max(11, w * 0.26);
      c.font = `700 ${fs}px "Cormorant Garamond", serif`;
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.fillText(face.r, -w / 2 + 5, -h / 2 + 4);
      c.font = `${fs * 0.85}px "Cormorant Garamond", serif`;
      c.fillText(face.s, -w / 2 + 5, -h / 2 + 4 + fs);
      c.save();
      c.font = `${w * 0.42}px "Cormorant Garamond", serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(face.s, 0, h * 0.08);
      c.restore();
    }

    function drawCard(c, x, y, rot, w, h, flip, face, alpha) {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.globalAlpha *= alpha;
      const k = Math.cos(flip);
      c.scale(Math.max(0.08, Math.abs(k)), 1);
      if (k >= 0) drawBack(c, w, h);
      else drawFace(c, w, h, face);
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
    const cards = Array.from({ length: N * 2 }, (_, i) => ({
      ring: i < N ? 0 : 1,
      i: i % N,
      face: FACES[i % FACES.length],
    }));

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
    requestAnimationFrame(() => {
      home?.classList.add('exit');
      layer.classList.add('on');
      resize();
      playing = true;
      startT = performance.now();
      if (sound) playSound();
      if (document.fonts?.load) {
        document.fonts.load('600 64px "Cormorant Garamond"');
        document.fonts.load('700 28px "Noto Serif SC"');
      }
      requestAnimationFrame(frame);
    });

    // If the tab never paints a frame, still release the table at 4s.
    setTimeout(() => {
      if (!playing && !settled) done();
    }, DUR + 80);
  });
}
