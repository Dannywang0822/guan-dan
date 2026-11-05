/* 掼蛋 · 水墨素雅牌面。红黑用朱砂 / 松烟，牌角点数加大，保证缩小后仍能认牌。
 * cardSVG(rank, suit, {level, wild, selected, width})  rank: A,2..10,J,Q,K,BJ,SJ  suit: S H C D
 * backSVG({width})  jokerSVG(big, opts)  PALETTE  SUIT_PATH
 * UMD: require() 或 window.GuanDanCards
 */
(function (root) {
  const P = {
    cinnabar: '#8C3A3A',
    ink: '#1C1C1C',
    paper: '#FBF8F1',
    wildPaper: '#F6E4D0',
    gold: '#C4A882',
    bamboo: '#5B7268',
    edge: '#1C1C1C',
  };
  const SERIF = "'Noto Serif SC','Songti SC','STSong','SimSun',serif";
  const SUIT_PATH = {
    H: 'M10 18.2C8.6 16.9 1.5 11.8 1.5 6.8 1.5 3.8 3.8 1.6 6.4 1.6c1.6 0 2.9.8 3.6 2.1.7-1.3 2-2.1 3.6-2.1 2.6 0 4.9 2.2 4.9 5.2 0 5-7.1 10.1-8.5 11.4z',
    D: 'M10 1.2 18.2 10 10 18.8 1.8 10z',
    S: 'M10 1.2C11.6 3.6 18.4 8 18.4 12.2c0 2.5-1.9 4.3-4.2 4.3-1.4 0-2.5-.6-3.2-1.5.2 1.5.9 2.7 2 3.6H7c1.1-.9 1.8-2.1 2-3.6-.7.9-1.8 1.5-3.2 1.5-2.3 0-4.2-1.8-4.2-4.3C1.6 8 8.4 3.6 10 1.2z',
    C: 'M10 1.6a4 4 0 0 1 3.4 6.1 4 4 0 1 1-1.7 6.8c.2 1.6.9 2.8 2 3.7H6.3c1.1-.9 1.8-2.1 2-3.7a4 4 0 1 1-1.7-6.8A4 4 0 0 1 10 1.6z',
  };
  const W = 140;
  const H = 200;
  const R = 10;
  const isRed = (s) => s === 'H' || s === 'D';
  const sc = (s) => (isRed(s) ? P.cinnabar : P.ink);
  const suit = (s, x, y, size, flip) =>
    `<path d="${SUIT_PATH[s]}" fill="${sc(s)}" transform="translate(${x} ${y})${flip ? ' rotate(180)' : ''} scale(${size / 20}) translate(-10 -10)"/>`;

  function seal(x, y, text, bg, fg) {
    return `<g transform="translate(${x} ${y})"><rect x="-12" y="-12" width="24" height="24" rx="2" fill="${bg}" stroke="${fg}" stroke-width="1.2"/><text y="5" text-anchor="middle" font-family="${SERIF}" font-size="14" font-weight="700" fill="${fg}">${text}</text></g>`;
  }

  function rankText(rank, x, y, color, size) {
    const ten = rank === '10';
    const fs = ten ? Math.round(size * 0.72) : size;
    const fit = ten ? ' textLength="26" lengthAdjust="spacingAndGlyphs"' : '';
    return `<text x="${x}" y="${y}" text-anchor="middle" font-family="${SERIF}" font-weight="700" font-size="${fs}" fill="${color}"${fit}>${rank}</text>`;
  }

  function corner(rank, s) {
    const one = rankText(rank, 16, 32, sc(s), 30) + suit(s, 16, 50, 18);
    return `<g>${one}</g><g transform="rotate(180 70 100)">${one}</g>`;
  }

  const COL = [48, 70, 92];
  const LAYOUT = {
    2: [[1, 78], [1, 150, 1]],
    3: [[1, 74], [1, 114], [1, 154, 1]],
    4: [[0, 78], [2, 78], [0, 148, 1], [2, 148, 1]],
    5: [[0, 74], [2, 74], [1, 112], [0, 150, 1], [2, 150, 1]],
    6: [[0, 70], [2, 70], [0, 110], [2, 110], [0, 150, 1], [2, 150, 1]],
    7: [[0, 68], [2, 68], [1, 90], [0, 112], [2, 112], [0, 152, 1], [2, 152, 1]],
    8: [[0, 66], [2, 66], [1, 86], [0, 108], [2, 108], [1, 132, 1], [0, 154, 1], [2, 154, 1]],
    9: [[0, 66], [2, 66], [0, 92], [2, 92], [1, 112], [0, 132, 1], [2, 132, 1], [0, 156, 1], [2, 156, 1]],
    10: [[0, 64], [2, 64], [1, 80], [0, 98], [2, 98], [0, 126, 1], [2, 126, 1], [1, 142, 1], [0, 158, 1], [2, 158, 1]],
  };

  function pips(rank, s) {
    const n = +rank;
    const size = n >= 8 ? 18 : n >= 6 ? 20 : 24;
    return (LAYOUT[n] || []).map(([c, y, flip]) => suit(s, COL[c], y, size, flip)).join('');
  }

  function ace(s) {
    return `<circle cx="70" cy="112" r="34" fill="none" stroke="${P.gold}" stroke-width="1.4"/>${suit(s, 70, 112, 54)}`;
  }

  function court(rank, s) {
    const color = sc(s);
    return `<rect x="40" y="70" width="60" height="78" rx="3" fill="none" stroke="${color}" stroke-width="1" opacity=".45"/>
      <text x="70" y="124" text-anchor="middle" font-family="${SERIF}" font-size="52" font-weight="700" fill="${color}">${rank}</text>
      ${suit(s, 70, 142, 16)}`;
  }

  function crane() {
    return `<g transform="translate(70 118)" fill="${P.ink}" stroke="${P.ink}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M-8 4c-16-2-24 8-14 12 6-4 12-6 14-12z"/>
      <ellipse cx="6" cy="8" rx="14" ry="8"/>
      <path d="M14 2c4-14 0-26 10-34" fill="none" stroke-width="3.2"/>
      <circle cx="26" cy="-34" r="3.2" stroke="none"/>
      <path d="M29 -34h8" fill="none" stroke="${P.cinnabar}" stroke-width="2"/>
      <path d="M22 -38c2-7 6-5 4 2z" fill="${P.cinnabar}" stroke="none"/>
      <path d="M0 0c2-12 16-14 18-2" fill="none" stroke-width="2.2"/>
      <path d="M0 16v8M8 16v10" fill="none" stroke-width="1.4"/>
    </g>`;
  }

  function bamboo() {
    return `<g transform="translate(70 122)" fill="none" stroke="${P.ink}" stroke-linecap="round">
      <path d="M-14 32V-4" stroke-width="2.2"/>
      <path d="M-14 6H-24M-14 18H-6" stroke-width="1.5"/>
      <path d="M2 36V-16" stroke-width="3"/>
      <path d="M2 -4H14M2 12H-8M2 24H12" stroke-width="1.6"/>
      <path d="M16 32V4" stroke-width="2"/>
      <path d="M16 14H24M16 24H10" stroke-width="1.4"/>
      <path d="M2 -12c10-10 20-2 14 6" stroke="${P.bamboo}" stroke-width="1.8"/>
    </g>`;
  }

  function jokerArt(big) {
    const color = big ? P.cinnabar : P.ink;
    const label = big ? '大 王' : '小 王';
    return `<text x="70" y="52" text-anchor="middle" font-family="${SERIF}" font-size="36" font-weight="700" fill="${color}">${label}</text>
      ${big ? crane() : bamboo()}`;
  }

  function frame(opts) {
    const face = opts.wild ? P.wildPaper : P.paper;
    const stroke = opts.wild ? P.cinnabar : P.edge;
    const width = opts.wild ? 2.4 : 1.6;
    return `<rect x="1.2" y="1.2" width="${W - 2.4}" height="${H - 2.4}" rx="${R}" fill="${face}" stroke="${stroke}" stroke-width="${width}"/>
      <rect x="5" y="5" width="${W - 10}" height="${H - 10}" rx="${R - 3}" fill="none" stroke="${opts.wild ? P.cinnabar : P.gold}" stroke-width=".8" opacity=".85"/>`;
  }

  function wrap(inner, opts) {
    const size = opts.width ? ` width="${opts.width}" height="${Math.round(opts.width / 0.7)}"` : '';
    let deco = '';
    if (opts.wild) deco += seal(118, 78, '配', P.cinnabar, '#FBF8F1');
    else if (opts.level) deco += seal(118, 78, '级', P.gold, P.ink);
    if (opts.selected) {
      deco += `<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="${R - 2}" fill="none" stroke="${P.gold}" stroke-width="5"/>`;
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"${size}>${frame(opts)}${inner}${deco}</svg>`;
  }

  function jokerSVG(big, opts) {
    return wrap(jokerArt(big), opts || {});
  }

  function cardSVG(rank, s, opts) {
    rank = String(rank).toUpperCase();
    opts = opts || {};
    if (rank === 'BJ' || rank === 'SJ') return jokerSVG(rank === 'BJ', opts);
    let mid = pips(rank, s);
    if (rank === 'A') mid = ace(s);
    else if ('JQK'.includes(rank)) mid = court(rank, s);
    return wrap(corner(rank, s) + mid, opts);
  }

  function backSVG(opts) {
    opts = opts || {};
    const size = opts.width ? ` width="${opts.width}" height="${Math.round(opts.width / 0.7)}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"${size}>
      <rect x="1.2" y="1.2" width="137.6" height="197.6" rx="10" fill="${P.paper}" stroke="${P.ink}" stroke-width="1.6"/>
      <rect x="7" y="7" width="126" height="186" rx="6" fill="${P.ink}"/>
      <rect x="11" y="11" width="118" height="178" rx="4" fill="#F4EFE4"/>
      <path d="M11 128 C40 96 58 112 78 100 C100 86 112 104 129 92 V189 H11Z" fill="${P.ink}" opacity=".1"/>
      <path d="M11 150 C48 128 70 146 96 132 C112 122 120 138 129 130 V189 H11Z" fill="${P.ink}" opacity=".08"/>
      <g fill="none" stroke="${P.ink}" stroke-linecap="round" opacity=".55">
        <path d="M112 168V78" stroke-width="2"/><path d="M112 96H104M112 118H120M112 140H106" stroke-width="1.3"/>
        <path d="M112 84c8-10 16-6 12 2" stroke="${P.bamboo}" stroke-width="1.4"/>
      </g>
      <rect x="48" y="70" width="44" height="52" fill="#F4EFE4" stroke="${P.cinnabar}" stroke-width="1.8"/>
      <text x="70" y="94" text-anchor="middle" font-family="${SERIF}" font-size="16" font-weight="700" fill="${P.cinnabar}">掼</text>
      <text x="70" y="114" text-anchor="middle" font-family="${SERIF}" font-size="16" font-weight="700" fill="${P.cinnabar}">蛋</text>
    </svg>`;
  }

  const api = { cardSVG, backSVG, jokerSVG, PALETTE: P, SUIT_PATH, SERIF, CARD_VIEWBOX: [W, H] };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GuanDanCards = api;
})(typeof window !== 'undefined' ? window : globalThis);
