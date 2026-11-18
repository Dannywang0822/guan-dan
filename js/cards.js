/* DEUX · Guandan card faces. viewBox 140×200.
 * Source of truth for in-game faces, backs, and jokers.
 * Browser: window.DeuxCards and window.GuanDanCards (the game renderer).
 * CommonJS: module.exports, and the same globals for the rules tests.
 */
(function (root, factory) {
  const api = factory();
  const g = typeof globalThis !== "undefined" ? globalThis : root;
  g.DeuxCards = api;
  g.GuanDanCards = api;
  if (typeof module === "object" && module && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const P = {
    ivory: "#F4EFE6",
    paper: "#FBF8F2",
    ink: "#12110F",
    lacquer: "#8B1E1E",
    bronze: "#B08A4F",
    graphite: "#6B6560",
    wildPaper: "#F7EDEA",
  };

  const SUITS = {
    S: { pip: "spade", red: false, name: "spades" },
    H: { pip: "heart", red: true, name: "hearts" },
    C: { pip: "club", red: false, name: "clubs" },
    D: { pip: "diamond", red: true, name: "diamonds" },
  };

  const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

  const LAYOUTS = {
    A: [[70, 100, 1]],
    "2": [[70, 48, 1], [70, 152, -1]],
    "3": [[70, 48, 1], [70, 100, 1], [70, 152, -1]],
    "4": [[46, 48, 1], [94, 48, 1], [46, 152, -1], [94, 152, -1]],
    "5": [[46, 48, 1], [94, 48, 1], [70, 100, 1], [46, 152, -1], [94, 152, -1]],
    "6": [[46, 48, 1], [94, 48, 1], [46, 100, 1], [94, 100, 1], [46, 152, -1], [94, 152, -1]],
    "7": [[46, 46, 1], [94, 46, 1], [70, 72, 1], [46, 100, 1], [94, 100, 1], [46, 154, -1], [94, 154, -1]],
    "8": [[46, 46, 1], [94, 46, 1], [70, 72, 1], [46, 100, 1], [94, 100, 1], [70, 128, -1], [46, 154, -1], [94, 154, -1]],
    "9": [[46, 42, 1], [94, 42, 1], [46, 80, 1], [94, 80, 1], [70, 100, 1], [46, 120, -1], [94, 120, -1], [46, 158, -1], [94, 158, -1]],
    "10": [[46, 42, 1], [94, 42, 1], [70, 61, 1], [46, 80, 1], [94, 80, 1], [46, 120, -1], [94, 120, -1], [70, 139, -1], [46, 158, -1], [94, 158, -1]],
  };

  let _uid = 0;
  const uid = (p) => `${p}-${++_uid}`;

  function color(suit, opts) {
    if (opts && opts.mono) return P.ink;
    return SUITS[suit].red ? P.lacquer : P.ink;
  }

  function pipPath(kind, s) {
    // unit paths centered at 0,0; s = scale (half-width ~ s*0.5)
    if (kind === "spade") {
      return `M 0 ${-0.52 * s}
        C ${0.30 * s} ${-0.16 * s} ${0.52 * s} ${0.04 * s} ${0.52 * s} ${0.22 * s}
        C ${0.52 * s} ${0.40 * s} ${0.34 * s} ${0.52 * s} ${0.16 * s} ${0.52 * s}
        C ${0.08 * s} ${0.52 * s} ${0.04 * s} ${0.46 * s} ${0.05 * s} ${0.40 * s}
        L ${0.09 * s} ${0.68 * s} L ${-0.09 * s} ${0.68 * s} L ${-0.05 * s} ${0.40 * s}
        C ${-0.04 * s} ${0.46 * s} ${-0.08 * s} ${0.52 * s} ${-0.16 * s} ${0.52 * s}
        C ${-0.34 * s} ${0.52 * s} ${-0.52 * s} ${0.40 * s} ${-0.52 * s} ${0.22 * s}
        C ${-0.52 * s} ${0.04 * s} ${-0.30 * s} ${-0.16 * s} 0 ${-0.52 * s} Z`;
    }
    if (kind === "heart") {
      return `M 0 ${0.56 * s}
        C ${0.46 * s} ${0.18 * s} ${0.54 * s} ${-0.10 * s} ${0.54 * s} ${-0.24 * s}
        C ${0.54 * s} ${-0.44 * s} ${0.36 * s} ${-0.56 * s} ${0.20 * s} ${-0.56 * s}
        C ${0.08 * s} ${-0.56 * s} ${0.02 * s} ${-0.48 * s} 0 ${-0.38 * s}
        C ${-0.02 * s} ${-0.48 * s} ${-0.08 * s} ${-0.56 * s} ${-0.20 * s} ${-0.56 * s}
        C ${-0.36 * s} ${-0.56 * s} ${-0.54 * s} ${-0.44 * s} ${-0.54 * s} ${-0.24 * s}
        C ${-0.54 * s} ${-0.10 * s} ${-0.46 * s} ${0.18 * s} 0 ${0.56 * s} Z`;
    }
    if (kind === "diamond") {
      return `M 0 ${-0.58 * s} L ${0.42 * s} 0 L 0 ${0.58 * s} L ${-0.42 * s} 0 Z`;
    }
    // club
    const r = 0.26 * s;
    const cy = -0.10 * s;
    return `
      M ${-0.08 * s} ${0.22 * s}
      L ${-0.10 * s} ${0.68 * s} L ${0.10 * s} ${0.68 * s} L ${0.08 * s} ${0.22 * s}
      M ${-r} ${cy - r * 0.95} a ${r} ${r} 0 1 1 ${r * 2} 0 a ${r} ${r} 0 1 1 ${-r * 2} 0
      M ${-r * 1.85} ${cy + r * 0.75} a ${r} ${r} 0 1 1 ${r * 2} 0 a ${r} ${r} 0 1 1 ${-r * 2} 0
      M ${r * -0.15} ${cy + r * 0.75} a ${r} ${r} 0 1 1 ${r * 2} 0 a ${r} ${r} 0 1 1 ${-r * 2} 0
    `.replace(/\n\s+/g, " ");
  }

  function pip(kind, x, y, s, fill, flip) {
    const body =
      kind === "club"
        ? `<g fill="${fill}">
            <circle cx="0" cy="${-0.22 * s}" r="${0.27 * s}"/>
            <circle cx="${-0.30 * s}" cy="${0.12 * s}" r="${0.27 * s}"/>
            <circle cx="${0.30 * s}" cy="${0.12 * s}" r="${0.27 * s}"/>
            <rect x="${-0.07 * s}" y="${0.10 * s}" width="${0.14 * s}" height="${0.58 * s}"/>
          </g>`
        : `<path d="${pipPath(kind, s)}" fill="${fill}"/>`;
    const t = flip < 0 ? `translate(${x} ${y}) rotate(180)` : `translate(${x} ${y})`;
    return `<g transform="${t}">${body}</g>`;
  }

  function frame(opts) {
    const level = opts && opts.level;
    const wild = opts && opts.wild;
    const stroke = level ? P.bronze : "rgba(18,17,15,.28)";
    const sw = level ? 2.2 : 1.15;
    const fill = wild ? P.wildPaper : P.paper;
    const inner = `<rect x="5" y="5" width="130" height="190" rx="8" fill="none" stroke="${P.ink}" stroke-width="0.55" opacity=".35"/>`;
    return `
      <rect x="0" y="0" width="140" height="200" rx="12" fill="${P.ivory}"/>
      <rect x="3" y="3" width="134" height="194" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>
      ${inner}
    `;
  }

  function index(rank, kind, col, opts) {
    const fs = rank === "10" ? 22 : 26;
    return `
      <g fill="${col}">
        <text x="16" y="30" text-anchor="middle" font-family="Cormorant Garamond, Noto Serif SC, serif"
          font-weight="700" font-size="${fs}" letter-spacing="${rank === "10" ? "-0.06em" : "0"}">${rank}</text>
        <g transform="translate(16 46)">${pip(kind, 0, 0, 14, col, 1).replace(/transform="[^"]*"/, "")}</g>
      </g>
      <g fill="${col}" transform="rotate(180 70 100)">
        <text x="16" y="30" text-anchor="middle" font-family="Cormorant Garamond, Noto Serif SC, serif"
          font-weight="700" font-size="${fs}" letter-spacing="${rank === "10" ? "-0.06em" : "0"}">${rank}</text>
        <g transform="translate(16 46)">${pip(kind, 0, 0, 14, col, 1).replace(/transform="[^"]*"/, "")}</g>
      </g>
    `;
  }

  function seal(text, x, y, bg, fg, stroke) {
    return `
      <g transform="translate(${x} ${y})">
        <rect x="-9" y="-9" width="18" height="18" rx="2" fill="${bg}" stroke="${stroke || bg}" stroke-width="0.8"/>
        <text x="0" y="5" text-anchor="middle" font-family="Noto Serif SC, serif" font-weight="600" font-size="11" fill="${fg}">${text}</text>
      </g>`;
  }

  function aceExtra(suit, kind, col) {
    if (suit === "S") {
      return `
        <g transform="translate(70 100)">
          <circle r="36" fill="none" stroke="${P.bronze}" stroke-width="1.2"/>
          <circle r="31" fill="none" stroke="${P.bronze}" stroke-width="0.5" opacity=".7"/>
          ${pip(kind, 0, -1, 42, col, 1).replace(/transform="[^"]*"/, 'transform="translate(0 -1)"')}
        </g>
        <text x="70" y="154" text-anchor="middle" font-family="Cormorant Garamond, serif"
          font-weight="600" font-size="8" letter-spacing="0.35em" fill="${P.bronze}">DEUX</text>
      `;
    }
    return `<g transform="translate(70 100)">${pip(kind, 0, 0, 52, col, 1).replace(/transform="[^"]*"/, "")}</g>`;
  }

  function court(rank, kind, col) {
    const label = { J: "JACK", Q: "QUEEN", K: "KING" }[rank];
    const ornament = `
      <g fill="none" stroke="${col}" stroke-width="1.05">
        <rect x="38" y="36" width="64" height="128" rx="2"/>
        <line x1="38" y1="100" x2="102" y2="100" stroke="${P.bronze}" stroke-width="0.7"/>
      </g>
      <text x="70" y="92" text-anchor="middle" font-family="Cormorant Garamond, serif"
        font-weight="600" font-size="54" fill="${col}">${rank}</text>
      <g transform="translate(70 58)">${pip(kind, 0, 0, 16, col, 1).replace(/transform="[^"]*"/, "")}</g>
      <g transform="translate(70 142) rotate(180)">${pip(kind, 0, 0, 16, col, 1).replace(/transform="[^"]*"/, "")}</g>
      <text x="70" y="116" text-anchor="middle" font-family="Cormorant Garamond, serif"
        font-weight="500" font-size="7.5" letter-spacing="0.42em" fill="${P.bronze}">${label}</text>
    `;
    return ornament;
  }

  function cardSVG(rank, suit, opts) {
    opts = opts || {};
    const w = opts.width || 140;
    const h = (w * 200) / 140;
    if (rank === "BJ" || rank === "SJ") return jokerSVG(rank === "BJ", opts);
    const kind = SUITS[suit].pip;
    const col = color(suit, opts);
    const pipSize = rank === "A" ? 0 : (rank === "10" || rank === "9") ? 16 : (rank === "7" || rank === "8") ? 18 : 21;
    let body = "";
    if (rank === "A") body = aceExtra(suit, kind, col);
    else if (rank === "J" || rank === "Q" || rank === "K") body = court(rank, kind, col);
    else {
      body = LAYOUTS[rank]
        .map(([x, y, f]) => pip(kind, x, y, pipSize, col, f))
        .join("");
    }
    const marks =
      (opts.level ? seal("级", 112, 24, P.bronze, P.paper) : "") +
      (opts.wild ? seal("配", 112, 46, P.lacquer, P.paper, P.bronze) : "");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 200" width="${w}" height="${h}" role="img" aria-label="${rank}${suit}">
      ${frame(opts)}
      ${index(rank, kind, col, opts)}
      ${body}
      ${marks}
    </svg>`;
  }

  function jokerSVG(isBig, opts) {
    opts = opts || {};
    const w = opts.width || 140;
    const h = (w * 200) / 140;
    const col = isBig ? P.lacquer : P.ink;
    const ring = isBig ? P.bronze : P.ink;
    const title = isBig ? "大 王" : "小 王";
    const sub = isBig ? "JOKER" : "JOKER";
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 200" width="${w}" height="${h}" role="img" aria-label="${title}">
      ${frame(opts)}
      <g fill="${col}">
        <text x="16" y="28" text-anchor="middle" font-family="Noto Serif SC, serif" font-weight="700" font-size="16">${isBig ? "大" : "小"}</text>
        <text x="16" y="46" text-anchor="middle" font-family="Noto Serif SC, serif" font-weight="700" font-size="16">王</text>
      </g>
      <g fill="${col}" transform="rotate(180 70 100)">
        <text x="16" y="28" text-anchor="middle" font-family="Noto Serif SC, serif" font-weight="700" font-size="16">${isBig ? "大" : "小"}</text>
        <text x="16" y="46" text-anchor="middle" font-family="Noto Serif SC, serif" font-weight="700" font-size="16">王</text>
      </g>
      <g transform="translate(70 100)" fill="none" stroke="${ring}" stroke-width="1.4">
        <circle cx="-12" cy="0" r="28"/>
        <circle cx="12" cy="0" r="28"/>
      </g>
      <text x="70" y="152" text-anchor="middle" font-family="Cormorant Garamond, serif"
        font-weight="600" font-size="9" letter-spacing="0.38em" fill="${col}">${sub}</text>
      <text x="70" y="64" text-anchor="middle" font-family="Noto Serif SC, serif"
        font-weight="600" font-size="13" letter-spacing="0.45em" fill="${col}">${title}</text>
    </svg>`;
  }

  function backSVG(opts) {
    opts = opts || {};
    const w = opts.width || 140;
    const h = (w * 200) / 140;
    const id = uid("back");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 200" width="${w}" height="${h}" role="img" aria-label="DEUX back">
      <rect x="0" y="0" width="140" height="200" rx="12" fill="${P.ivory}"/>
      <rect x="3" y="3" width="134" height="194" rx="10" fill="${P.paper}" stroke="${P.bronze}" stroke-width="1.6"/>
      <rect x="8" y="8" width="124" height="184" rx="7" fill="none" stroke="${P.ink}" stroke-width="0.5" opacity=".35"/>
      <g transform="translate(70 100)" fill="none" stroke="${P.bronze}" stroke-width="1.5">
        <circle cx="-16" cy="0" r="34"/>
        <circle cx="16" cy="0" r="34"/>
      </g>
      <text x="70" y="36" text-anchor="middle" font-family="Cormorant Garamond, serif"
        font-weight="600" font-size="10" letter-spacing="0.42em" fill="${P.bronze}">DEUX</text>
      <text x="70" y="174" text-anchor="middle" font-family="Cormorant Garamond, serif"
        font-weight="600" font-size="10" letter-spacing="0.42em" fill="${P.bronze}" transform="rotate(180 70 168)">DEUX</text>
    </svg>`;
  }

  return { PALETTE: P, SUITS, RANKS, cardSVG, jokerSVG, backSVG };
});
