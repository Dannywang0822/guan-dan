/* 掼蛋 · 国潮「兔镖局」扑克生成器 —— 极兔速递风格化致敬，仅个人娱乐，未使用任何官方 logo/字标/吉祥物原形
 * cardSVG(rank, suit, {level, wild, selected, width})  rank: A,2..10,J,Q,K,BJ,SJ  suit: S H C D
 * backSVG({width})  jokerSVG(big, opts)  PALETTE  SUIT_PATH   UMD: require() 或 window.GuanDanCards
 */
(function (root) {
const P = {
  cinnabar: '#B5121B', cinnabarDeep: '#8E0E15', cinnabarLight: '#F3DEC6',
  gold: '#D4A017', goldLight: '#F3D27A', goldDeep: '#8C6511',
  ink: '#1A1A1A', ink2: '#3A3A3A', paper: '#F7EEDC', paperDeep: '#EADFCB', edge: '#C9A25A',
  teal: '#1F3A3D', tealLight: '#2A4A4B', tealDeep: '#122627', jade: '#3E8F86', blush: '#F2B8A8'
};
const FONT = "'DIN Alternate','Roboto Condensed','Arial Narrow','Helvetica Neue',Arial,sans-serif";
const SERIF = "'Noto Serif CJK SC','Source Han Serif SC','Songti SC','STSong','SimSun',serif";
const SUIT_PATH = {
  H: 'M10 18.2C8.6 16.9 1.5 11.8 1.5 6.8 1.5 3.8 3.8 1.6 6.4 1.6c1.6 0 2.9.8 3.6 2.1.7-1.3 2-2.1 3.6-2.1 2.6 0 4.9 2.2 4.9 5.2 0 5-7.1 10.1-8.5 11.4z',
  D: 'M10 1 17.6 10 10 19 2.4 10z',
  S: 'M10 1.2C11.6 3.6 18.4 8 18.4 12.2c0 2.5-1.9 4.3-4.2 4.3-1.4 0-2.5-.6-3.2-1.5.2 1.5.9 2.7 2 3.6H7c1.1-.9 1.8-2.1 2-3.6-.7.9-1.8 1.5-3.2 1.5-2.3 0-4.2-1.8-4.2-4.3C1.6 8 8.4 3.6 10 1.2z',
  C: 'M10 1.6a4 4 0 0 1 3.4 6.1 4 4 0 1 1-1.7 6.8c.2 1.6.9 2.8 2 3.7H6.3c1.1-.9 1.8-2.1 2-3.7a4 4 0 1 1-1.7-6.8A4 4 0 0 1 10 1.6z'
};
const W = 140, H = 200, R = 12;
const isRed = s => s === 'H' || s === 'D';
const sc = s => isRed(s) ? P.cinnabar : P.ink;
let uid = 0; const nid = p => p + (uid++).toString(36);
const suit = (s, x, y, size, flip, color) => `<path d="${SUIT_PATH[s]}" fill="${color || sc(s)}" transform="translate(${x} ${y})${flip ? ' rotate(180)' : ''} scale(${size / 20}) translate(-10 -10)"/>`;
const cloud = (x, y, s, c, o = 1, w = 2.2) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" opacity="${o}"><path d="M-14 4a6 6 0 0 1 0-12a8 8 0 0 1 15-3a6 6 0 0 1 11 5a5 5 0 0 1-2 10z"/><path d="M-6 0a4 4 0 0 1 7-3a3 3 0 0 1 3 3"/></g>`;
const seal = (x, y, s, t, bg, fg = '#fff', ring) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-14" y="-14" width="28" height="28" rx="3" fill="${bg}"${ring ? ` stroke="${ring}" stroke-width="2.5"` : ''}/><rect x="-10.5" y="-10.5" width="21" height="21" rx="1.5" fill="none" stroke="${fg}" stroke-width="1.3"/><text y="7" font-family="${SERIF}" font-weight="900" font-size="19" fill="${fg}" text-anchor="middle">${t}</text></g>`;
const rankText = (rank, x, y, color, size) => `<text x="${x}" y="${y}" font-family="${FONT}" font-weight="900" font-size="${size}" fill="${color}" text-anchor="middle"${rank === '10' ? ' textLength="30" lengthAdjust="spacingAndGlyphs"' : ''}>${rank}</text>`;
const corner = (rank, s) => { const one = rankText(rank, 17, 36, sc(s), 36) + suit(s, 17, 52, 18); return `<g>${one}</g><g transform="rotate(180 70 100)">${one}</g>`; };
// 双线描金框 + 四角回纹
function paperFrame(opts) {
  const g = nid('g'), hi = opts.level || opts.wild;
  const corners = [[10, 10, 0], [130, 10, 90], [130, 190, 180], [10, 190, 270]].map(([x, y, r]) => `<path d="M0 9V0h9M3 9V3h6" fill="none" stroke="${P.edge}" stroke-width="1.3" transform="translate(${x} ${y}) rotate(${r})"/>`).join('');
  return `<defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${P.goldLight}"/><stop offset=".5" stop-color="${P.gold}"/><stop offset="1" stop-color="${P.goldDeep}"/></linearGradient></defs>
  <rect x="${hi ? 2.5 : 1.5}" y="${hi ? 2.5 : 1.5}" width="${hi ? W - 5 : W - 3}" height="${hi ? H - 5 : H - 3}" rx="${R}" fill="${opts.wild ? '#FBE7CF' : P.paper}" stroke="${hi ? `url(#${g})` : P.edge}" stroke-width="${hi ? 5 : 2}"/>${corners}`;
}
const LAYOUT = {
  2: [[1,52],[1,148,1]], 3: [[1,52],[1,100],[1,148,1]], 4: [[0,52],[2,52],[0,148,1],[2,148,1]],
  5: [[0,52],[2,52],[1,100],[0,148,1],[2,148,1]], 6: [[0,52],[2,52],[0,100],[2,100],[0,148,1],[2,148,1]],
  7: [[0,52],[2,52],[1,76],[0,100],[2,100],[0,148,1],[2,148,1]], 8: [[0,52],[2,52],[1,76],[0,100],[2,100],[1,124,1],[0,148,1],[2,148,1]],
  9: [[0,52],[2,52],[0,84],[2,84],[1,100],[0,116,1],[2,116,1],[0,148,1],[2,148,1]],
  10: [[0,52],[2,52],[1,68],[0,84],[2,84],[0,116,1],[2,116,1],[1,132,1],[0,148,1],[2,148,1]]
};
const COLS = [50, 70, 90];
function rabbit(cx, cy, s, o = {}) {
  const fur = o.fur || '#FFFDF7', line = o.line || P.ink, inner = o.inner || P.blush;
  return `<g transform="translate(${cx} ${cy}) scale(${s})">
  <path d="M-11-13c-4-14-3-29 2-31s8 14 6 30z" fill="${fur}" stroke="${line}" stroke-width="2.4"/><path d="M-8-15c-2-9-2-19 1-20s4 10 3 19z" fill="${inner}"/>
  <path d="M5-14c3-12 9-24 15-22 5 2-1 11-9 23z" fill="${fur}" stroke="${line}" stroke-width="2.4"/><path d="M8-16c3-8 7-15 10-14 2 1-2 7-7 15z" fill="${inner}"/>
  <ellipse rx="19" ry="17" fill="${fur}" stroke="${line}" stroke-width="2.4"/>
  <path d="M-10-2q3-3 6 0M4-2q3-3 6 0" fill="none" stroke="${line}" stroke-width="2.4" stroke-linecap="round"/>
  <ellipse cx="-12" cy="5" rx="3.4" ry="2" fill="${P.cinnabar}" opacity=".35"/><ellipse cx="12" cy="5" rx="3.4" ry="2" fill="${P.cinnabar}" opacity=".35"/>
  <path d="M-2 4h4l-2 2.4z" fill="${P.cinnabar}"/><path d="M-4 8q4 3 8 0" fill="none" stroke="${line}" stroke-width="1.6" stroke-linecap="round"/></g>`;
}
// 人物牌：J 镖师兔（斗笠+包袱） Q 分拣女官兔（发髻金簪+账册） K 总镖头兔（官帽+镖旗）
function figure(rank, s) {
  const robe = isRed(s) ? P.cinnabar : P.teal, trim = P.gold, bg = isRed(s) ? P.cinnabarLight : P.paperDeep, fc = nid('fc');
  const body = `<path d="M42 102q0-20 28-20t28 20z" fill="${robe}" stroke="${P.ink}" stroke-width="2.2"/><path d="M60 83l10 12 10-12" fill="none" stroke="${trim}" stroke-width="3"/><path d="M70 95v7" stroke="${trim}" stroke-width="3"/>`;
  let hat = '', prop = '';
  if (rank === 'J') {
    hat = `<path d="M44 60 70 46 96 60z" fill="${P.goldLight}" stroke="${P.ink}" stroke-width="2.2" stroke-linejoin="round"/><path d="M50 60h40" stroke="${robe}" stroke-width="3"/><path d="M90 60l8 10" stroke="${robe}" stroke-width="2.5"/>`;
    prop = `<g transform="translate(97 88)"><path d="M-10-4q10-12 20 0v10q-10 6-20 0z" fill="${isRed(s) ? P.teal : P.cinnabar}" stroke="${P.ink}" stroke-width="1.8"/><path d="M-3-9 0-14 3-9" fill="none" stroke="${P.ink}" stroke-width="1.8"/>${cloud(0, 1, .28, P.gold, 1, 3)}</g>`;
  } else if (rank === 'Q') {
    hat = `<ellipse cx="70" cy="56" rx="12" ry="8" fill="${P.ink}"/><path d="M58 52 88 44" stroke="${P.gold}" stroke-width="3" stroke-linecap="round"/><circle cx="89" cy="44" r="3.5" fill="${P.cinnabar}" stroke="${P.gold}" stroke-width="1.5"/><path d="M89 47v8" stroke="${P.gold}" stroke-width="1.5"/>`;
    prop = `<g transform="translate(36 90) rotate(-8)"><rect x="-8" y="-12" width="16" height="22" rx="1.5" fill="${P.paper}" stroke="${P.ink}" stroke-width="1.8"/><rect x="-8" y="-12" width="4" height="22" fill="${P.gold}"/><path d="M-1-6h6M-1-1h6M-1 4h4" stroke="${robe}" stroke-width="1.6"/></g>`;
  } else {
    hat = `<path d="M54 60q0-14 16-14t16 14z" fill="${P.ink}" stroke="${P.ink}" stroke-width="2"/><path d="M40 56h14M86 56h14" stroke="${P.ink}" stroke-width="5" stroke-linecap="round"/><circle cx="70" cy="54" r="3" fill="${P.gold}"/>`;
    prop = `<g transform="translate(100 72)"><path d="M0 0v34" stroke="${P.goldDeep}" stroke-width="2.4"/><path d="M0 1h-17l4 8-4 8H0z" fill="${isRed(s) ? P.teal : P.cinnabar}" stroke="${P.gold}" stroke-width="1.4"/><text x="-8" y="13" font-family="${SERIF}" font-weight="900" font-size="10" fill="${P.gold}" text-anchor="middle">镖</text></g>`;
  }
  const half = body + rabbit(70, 72, .76) + hat + prop;
  const sc2 = g => `<g transform="translate(70 100) scale(.86) translate(-70 -100)">${g}</g>`;
  return `<clipPath id="${fc}"><rect x="32" y="28" width="76" height="144" rx="4"/></clipPath>
  <rect x="32" y="28" width="76" height="144" rx="4" fill="${bg}" stroke="${P.gold}" stroke-width="2"/>
  <g clip-path="url(#${fc})">${cloud(46, 40, .5, P.gold, .5)}${cloud(94, 160, .5, P.gold, .5)}${sc2(half)}<g transform="rotate(180 70 100)">${sc2(half)}</g>
  <path d="M32 100h76" stroke="${P.gold}" stroke-width="1.4"/></g>
  <rect x="35" y="31" width="70" height="138" rx="3" fill="none" stroke="${P.gold}" stroke-width=".8"/>
  ${suit(s, 98, 40, 11)}${suit(s, 42, 160, 11, 1)}`;
}
function jokerArt(big) {
  const c = big ? P.cinnabar : P.ink, ring = big ? P.gold : P.ink2;
  const letters = 'JOKER'.split('').map((l, i) => `<text x="16" y="${26 + i * 17}" font-family="${FONT}" font-weight="900" font-size="17" fill="${c}" text-anchor="middle">${l}</text>`).join('');
  const rays = big ? Array.from({ length: 16 }, (_, i) => { const a = i * Math.PI / 8; return `<path d="M${70 + 42 * Math.cos(a)} ${96 + 42 * Math.sin(a)}L${70 + 50 * Math.cos(a)} ${96 + 50 * Math.sin(a)}"/>`; }).join('') : '';
  return `${letters}<g transform="rotate(180 70 100)">${letters}</g>
  <circle cx="70" cy="96" r="38" fill="${big ? P.cinnabar : '#E4DCCB'}" stroke="${ring}" stroke-width="3"/><circle cx="70" cy="96" r="33" fill="none" stroke="${big ? P.goldLight : P.ink2}" stroke-width="1" stroke-dasharray="2 3"/>
  <g stroke="${P.gold}" stroke-width="3" stroke-linecap="round">${rays}</g>
  ${cloud(48, 124, .8, big ? P.gold : P.ink2, 1, 2.6)}${cloud(92, 126, .7, big ? P.gold : P.ink2, 1, 2.6)}
  <path d="M48 126q0-18 22-18t22 18z" fill="${big ? P.gold : P.ink2}"/>
  ${rabbit(70, 98, .95, big ? {} : { fur: '#F2EEE6', inner: '#BDB6AA' })}
  <g transform="translate(70 66)"><path d="M-15 0l-4-14 9 7 10-11 10 11 9-7-4 14z" fill="${big ? P.gold : P.ink}" stroke="${P.ink}" stroke-width="1.8" stroke-linejoin="round"/><circle cx="0" cy="-11" r="2.4" fill="${big ? P.cinnabar : P.paper}"/></g>
  ${seal(70, 160, 1.05, big ? '王' : '王', big ? P.cinnabar : P.ink, big ? P.goldLight : '#fff', big ? P.gold : null)}
  <text x="70" y="186" font-family="${SERIF}" font-weight="900" font-size="12" fill="${c}" text-anchor="middle">${big ? '大 王' : '小 王'}</text>`;
}
// 露出条（左侧约 30 单位宽）内的级/配小印
function stripMark(o) {
  if (o.wild) return seal(17, 74, .78, '配', P.cinnabar, P.goldLight, P.gold);
  if (o.level) return seal(17, 74, .78, '级', P.gold, P.ink);
  return '';
}
function wrap(inner, opts) {
  const size = opts.width ? ` width="${opts.width}" height="${Math.round(opts.width / .7)}"` : '';
  let deco = '';
  if (opts.wild) deco += seal(113, 27, .95, '配', P.cinnabar, P.goldLight, P.gold) + cloud(36, 182, .5, P.gold, .9);
  else if (opts.level) deco += seal(113, 27, .95, '级', P.gold, P.ink);
  deco += stripMark(opts);
  if (opts.selected) deco += `<rect x="1.5" y="1.5" width="${W - 3}" height="${H - 3}" rx="${R}" fill="${P.gold}" opacity=".22" stroke="${P.gold}" stroke-width="4"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"${size}>${paperFrame(opts)}${inner}${deco}</svg>`;
}
function jokerSVG(big, opts) { return wrap(jokerArt(big), opts || {}); }
function cardSVG(rank, s, opts) {
  rank = String(rank).toUpperCase(); opts = opts || {};
  if (rank === 'BJ' || rank === 'SJ') return jokerSVG(rank === 'BJ', opts);
  let mid;
  if (rank === 'A') mid = `<circle cx="70" cy="100" r="34" fill="none" stroke="${P.gold}" stroke-width="2"/><circle cx="70" cy="100" r="29" fill="${isRed(s) ? P.cinnabarLight : P.paperDeep}"/>${cloud(44, 140, .7, P.gold, .8)}${cloud(98, 62, .7, P.gold, .8)}${suit(s, 70, 100, 46)}`;
  else if ('JQK'.includes(rank)) mid = figure(rank, s);
  else mid = (LAYOUT[+rank] || []).map(([c, y, f]) => suit(s, COLS[c], y, 24, f)).join('') + cloud(70, 186, .45, P.gold, .55);
  return wrap(corner(rank, s) + mid, opts);
}
function backSVG(opts) {
  opts = opts || {};
  const size = opts.width ? ` width="${opts.width}" height="${Math.round(opts.width / .7)}"` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"${size}><rect x="1.5" y="1.5" width="137" height="197" rx="12" fill="${P.paper}" stroke="${P.edge}" stroke-width="2"/>
  <rect x="8" y="8" width="124" height="184" rx="6" fill="${P.cinnabar}"/><rect x="13" y="13" width="114" height="174" rx="4" fill="none" stroke="${P.gold}" stroke-width="1.5"/><rect x="17" y="17" width="106" height="166" rx="3" fill="none" stroke="${P.gold}" stroke-width=".8"/>
  ${[[34, 40], [106, 40], [34, 160], [106, 160], [70, 32], [70, 170], [30, 100], [110, 100]].map(([x, y]) => cloud(x, y, .85, P.gold, .8)).join('')}
  <circle cx="70" cy="100" r="32" fill="none" stroke="${P.gold}" stroke-width="2"/><circle cx="70" cy="100" r="27" fill="${P.ink}"/>
  <g transform="translate(70 104)" fill="${P.gold}"><path d="M-9-10c-4-12-2-24 2-24s5 12 3 23zM4-11c3-10 8-20 12-18s-2 10-8 19z"/><ellipse rx="14" ry="12"/></g>
  <circle cx="65" cy="102" r="1.8" fill="${P.ink}"/><circle cx="75" cy="102" r="1.8" fill="${P.ink}"/>${seal(104, 140, .8, '速', P.ink, '#fff', P.gold)}</svg>`;
}
const api = { cardSVG, backSVG, jokerSVG, PALETTE: P, SUIT_PATH, FONT, SERIF, CARD_VIEWBOX: [W, H] };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.GuanDanCards = api;
})(typeof window !== 'undefined' ? window : globalThis);
