/**
 * 掼蛋规则引擎（纯函数，无界面）。
 *
 * 级牌：单张 / 对子 / 三张 / 三带二 / 炸弹里，级牌仅次于小王。
 * 顺子、木板、钢板按自然点数衔接，级牌回到原位；A2345 最小，10JQKA 最大。
 * 木板允许 A23，钢板允许 A2（A 当小）。
 * 逢人配 = 当前打的级牌的红桃，可替任意非王。
 * 同花顺大于四炸和五炸，小于六炸及以上。四王最大。
 */

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const SUITS = ['S', 'H', 'C', 'D'];
export const SUIT_SYMBOL = { S: '♠', H: '♥', C: '♣', D: '♦' };
export const SUIT_NAME = { S: '黑桃', H: '红桃', C: '梅花', D: '方块' };
export const FINISH_NAME = ['', '头游', '二游', '三游', '末游'];

const SUIT_POWER = { D: 1, C: 2, H: 3, S: 4 };

export const STRAIGHTS = [
  ['A', '2', '3', '4', '5'],
  ...Array.from({ length: 9 }, (_, i) => RANKS.slice(i, i + 5)),
];

export const TUBES = [
  ['A', '2', '3'],
  ...Array.from({ length: 11 }, (_, i) => RANKS.slice(i, i + 3)),
];

export const PLATES = [
  ['A', '2'],
  ...Array.from({ length: 12 }, (_, i) => RANKS.slice(i, i + 2)),
];

export function naturalValue(rank) {
  const i = RANKS.indexOf(rank);
  return i < 0 ? 0 : i + 2;
}

export function powerValue(rank, level) {
  if (rank === 'BJ') return 100;
  if (rank === 'SJ') return 90;
  if (rank === level) return 80;
  return naturalValue(rank);
}

export function isJoker(card) {
  return card.rank === 'SJ' || card.rank === 'BJ';
}

export function isWild(card, level) {
  return card.suit === 'H' && card.rank === level;
}

export function isReturnable(card) {
  if (isJoker(card)) return false;
  return naturalValue(card.rank) <= 10;
}

export function advanceLevel(current, steps) {
  const i = RANKS.indexOf(current);
  return RANKS[Math.min(RANKS.length - 1, i + steps)];
}

export function upgradeSteps(order) {
  const head = order[0];
  const partner = (head + 2) % 4;
  const pos = order.indexOf(partner);
  return [0, 3, 2, 1][pos] || 0;
}

export function createDeck() {
  const cards = [];
  let id = 0;
  for (let deck = 0; deck < 2; deck++) {
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ id: id++, rank, suit, deck });
      }
    }
    cards.push({ id: id++, rank: 'SJ', suit: 'J', deck });
    cards.push({ id: id++, rank: 'BJ', suit: 'J', deck });
  }
  return cards;
}

export function shuffle(list, rng = Math.random) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function cardText(card) {
  if (card.rank === 'BJ') return '大王';
  if (card.rank === 'SJ') return '小王';
  return `${SUIT_SYMBOL[card.suit]}${card.rank}`;
}

export function typeLabel(combo) {
  switch (combo.type) {
    case 'single': return '单张';
    case 'pair': return '对子';
    case 'triple': return '三张';
    case 'fullhouse': return '三带二';
    case 'straight': return '顺子';
    case 'tube': return '木板';
    case 'plate': return '钢板';
    case 'straightflush': return '同花顺';
    case 'jokerbomb': return '天王炸';
    case 'bomb': {
      const names = { 4: '四炸', 5: '五炸', 6: '六炸', 7: '七炸', 8: '八炸' };
      return names[combo.cards.length] || `${combo.cards.length}炸`;
    }
    default: return '牌';
  }
}

export function isBombType(combo) {
  return !!combo && (combo.type === 'bomb' || combo.type === 'straightflush' || combo.type === 'jokerbomb');
}

export function bombStrength(combo) {
  if (combo.type === 'jokerbomb') return 1_000_000;
  if (combo.type === 'straightflush') {
    return 5500 + combo.rank * 10 + (SUIT_POWER[combo.suit] || 0);
  }
  if (combo.type === 'bomb') {
    const n = combo.cards.length;
    const base = n >= 6 ? n * 1000 : n * 1000;
    return base + combo.rank;
  }
  return 0;
}

export function beats(a, b) {
  if (!a || !b) return false;
  const ab = isBombType(a);
  const bb = isBombType(b);
  if (ab || bb) {
    if (!ab) return false;
    if (!bb) return true;
    return bombStrength(a) > bombStrength(b);
  }
  if (a.type !== b.type) return false;
  return a.rank > b.rank;
}

function splitCards(cards, level) {
  const wilds = [];
  const jokers = [];
  const normals = [];
  for (const c of cards) {
    if (isWild(c, level)) wilds.push(c);
    else if (isJoker(c)) jokers.push(c);
    else normals.push(c);
  }
  return { wilds, jokers, normals };
}

function countRanks(cards) {
  const map = new Map();
  for (const c of cards) map.set(c.rank, (map.get(c.rank) || 0) + 1);
  return map;
}

function groupByRank(cards) {
  const map = new Map();
  for (const c of cards) {
    if (!map.has(c.rank)) map.set(c.rank, []);
    map.get(c.rank).push(c);
  }
  return map;
}

function sequenceHead(seq) {
  return naturalValue(seq[seq.length - 1]);
}

function makeCombo(type, cards, rank, extra = {}) {
  return { type, cards, rank, ...extra };
}

function orderByPattern(pattern, normals, wilds) {
  const pool = normals.slice();
  const ws = wilds.slice();
  const ordered = [];
  for (const rank of pattern) {
    const need = arguments.length > 3 ? arguments[3] : 1;
    let got = 0;
    while (got < need) {
      const idx = pool.findIndex((c) => c.rank === rank);
      if (idx >= 0) {
        ordered.push(pool[idx]);
        pool.splice(idx, 1);
      } else if (ws.length) {
        ordered.push(ws.shift());
      } else {
        break;
      }
      got++;
    }
  }
  return ordered;
}

function tryPair(cards, level) {
  if (cards.length !== 2) return [];
  const [a, b] = cards;
  if (isJoker(a) || isJoker(b)) {
    if (a.rank === b.rank) return [makeCombo('pair', cards, powerValue(a.rank, level), { main: a.rank })];
    return [];
  }
  const aw = isWild(a, level);
  const bw = isWild(b, level);
  let rank = null;
  if (aw && bw) rank = level;
  else if (aw) rank = b.rank;
  else if (bw) rank = a.rank;
  else if (a.rank === b.rank) rank = a.rank;
  if (!rank) return [];
  return [makeCombo('pair', cards, powerValue(rank, level), { main: rank })];
}

function tryTriple(cards, level) {
  if (cards.length !== 3) return [];
  const { wilds, jokers, normals } = splitCards(cards, level);
  if (jokers.length || wilds.length + normals.length !== 3) return [];
  const counts = countRanks(normals);
  if (counts.size > 1) return [];
  if (counts.size === 0) return [];
  const rank = [...counts.keys()][0];
  return [makeCombo('triple', cards, powerValue(rank, level), { main: rank })];
}

function tryBomb(cards, level) {
  if (cards.length < 4) return [];
  const { wilds, jokers, normals } = splitCards(cards, level);
  if (jokers.length || !normals.length) return [];
  const counts = countRanks(normals);
  if (counts.size !== 1) return [];
  const rank = [...counts.keys()][0];
  if ((counts.get(rank) || 0) + wilds.length !== cards.length) return [];
  return [makeCombo('bomb', cards, powerValue(rank, level), { main: rank })];
}

function tryFullHouse(cards, level) {
  if (cards.length !== 5) return [];
  const { wilds, jokers, normals } = splitCards(cards, level);
  if (jokers.length) return [];
  const counts = countRanks(normals);
  const ranks = [...counts.keys()];
  if (ranks.length === 0 || ranks.length > 2) return [];
  const out = [];
  const w = wilds.length;
  if (ranks.length === 1) {
    const r = ranks[0];
    if (counts.get(r) === 3 && w === 2) {
      out.push(makeCombo('fullhouse', cards, powerValue(r, level), { main: r }));
    }
    return out;
  }
  const [r1, r2] = ranks;
  const c1 = counts.get(r1);
  const c2 = counts.get(r2);
  const can = (tc, pc) => {
    if (tc > 3 || pc > 2) return false;
    const need = (3 - tc) + (2 - pc);
    return need === w && 3 - tc >= 0 && 2 - pc >= 0;
  };
  if (can(c1, c2)) out.push(makeCombo('fullhouse', cards, powerValue(r1, level), { main: r1 }));
  if (can(c2, c1)) out.push(makeCombo('fullhouse', cards, powerValue(r2, level), { main: r2 }));
  return out;
}

function matchSequence(cards, level, sequences, each) {
  if (cards.length !== sequences[0].length * each) return [];
  const { wilds, jokers, normals } = splitCards(cards, level);
  if (jokers.length) return [];
  const counts = countRanks(normals);
  const present = [...counts.keys()];
  const out = [];
  for (const seq of sequences) {
    if (present.some((r) => !seq.includes(r))) continue;
    let need = 0;
    let overflow = false;
    for (const r of seq) {
      const c = counts.get(r) || 0;
      if (c > each) {
        overflow = true;
        break;
      }
      need += each - c;
    }
    if (overflow || need !== wilds.length) continue;
    const ordered = orderByPattern(seq, normals, wilds, each);
    const suits = new Set(normals.map((c) => c.suit));
    const flush = each === 1 && normals.length > 0 && suits.size === 1;
    out.push({
      seq,
      ordered,
      flush,
      suit: flush ? normals[0].suit : null,
      head: sequenceHead(seq),
    });
  }
  return out;
}

function tryStraights(cards, level) {
  return matchSequence(cards, level, STRAIGHTS, 1).map((m) => {
    if (m.flush) {
      return makeCombo('straightflush', m.ordered, m.head, { main: m.seq[m.seq.length - 1], suit: m.suit, pattern: m.seq });
    }
    return makeCombo('straight', m.ordered, m.head, { main: m.seq[m.seq.length - 1], pattern: m.seq });
  });
}

function tryTubes(cards, level) {
  return matchSequence(cards, level, TUBES, 2).map((m) =>
    makeCombo('tube', m.ordered, m.head, { main: m.seq[m.seq.length - 1], pattern: m.seq }),
  );
}

function tryPlates(cards, level) {
  return matchSequence(cards, level, PLATES, 3).map((m) =>
    makeCombo('plate', m.ordered, m.head, { main: m.seq[m.seq.length - 1], pattern: m.seq }),
  );
}

const PRIO = {
  jokerbomb: 100,
  bomb: 90,
  straightflush: 80,
  plate: 70,
  tube: 60,
  straight: 50,
  fullhouse: 40,
  triple: 30,
  pair: 20,
  single: 10,
};

export function bestInterpretation(options) {
  return options.slice().sort((a, b) => {
    const d = (PRIO[b.type] || 0) - (PRIO[a.type] || 0);
    if (d) return d;
    if (b.rank !== a.rank) return b.rank - a.rank;
    return bombStrength(b) - bombStrength(a);
  })[0];
}

export function identify(cards, level) {
  if (!cards || !cards.length) return [];
  if (cards.length === 4 && cards.every((c) => isJoker(c))) {
    return [makeCombo('jokerbomb', cards, 1000, { main: 'BJ' })];
  }
  const out = [];
  if (cards.length === 1) {
    const c = cards[0];
    out.push(makeCombo('single', cards, powerValue(c.rank, level), { main: c.rank }));
  }
  out.push(...tryPair(cards, level));
  out.push(...tryTriple(cards, level));
  out.push(...tryBomb(cards, level));
  out.push(...tryFullHouse(cards, level));
  out.push(...tryStraights(cards, level));
  out.push(...tryTubes(cards, level));
  out.push(...tryPlates(cards, level));
  return out;
}

export function evaluateSelection(cards, level, current) {
  if (!cards.length) return { ok: false, reason: '请选择要出的牌' };
  const options = identify(cards, level);
  if (!options.length) return { ok: false, reason: '这不是合法牌型' };
  if (!current) return { ok: true, combo: bestInterpretation(options) };
  // 能合成几张一样的炸弹时，按炸弹打出（压过同花顺以外的普通牌，也避免三张+两张逢人配被当成三带二）。
  const rankBombs = options.filter((o) => (o.type === 'bomb' || o.type === 'jokerbomb') && beats(o, current));
  if (rankBombs.length) return { ok: true, combo: bestInterpretation(rankBombs) };
  const same = options.filter((o) => o.type === current.type && beats(o, current));
  if (same.length) return { ok: true, combo: bestInterpretation(same) };
  const bombs = options.filter((o) => isBombType(o) && beats(o, current));
  if (bombs.length) return { ok: true, combo: bestInterpretation(bombs) };
  if (options.some((o) => o.type === current.type)) return { ok: false, reason: '压不过上面的牌' };
  if (options.some((o) => isBombType(o))) return { ok: false, reason: '炸弹不够大' };
  return { ok: false, reason: `牌型不符，要出${typeLabel(current)}或炸弹` };
}

export function generateCandidateSets(hand, level) {
  const wilds = hand.filter((c) => isWild(c, level));
  const normals = hand.filter((c) => !isWild(c, level) && !isJoker(c));
  const jokers = hand.filter((c) => isJoker(c));
  const byRank = groupByRank(normals);
  const sets = [];
  const seen = new Set();

  function add(cards) {
    if (!cards.length) return;
    const key = cards.map((c) => c.id).sort((a, b) => a - b).join(',');
    if (seen.has(key)) return;
    seen.add(key);
    sets.push(cards);
  }

  for (const c of hand) add([c]);

  for (const rank of RANKS) {
    const cs = byRank.get(rank) || [];
    if (cs.length >= 2) add(cs.slice(0, 2));
    if (cs.length >= 1 && wilds.length >= 1) add([cs[0], wilds[0]]);
    for (let w = 0; w <= wilds.length; w++) {
      const need = 3 - w;
      if (need >= 1 && cs.length >= need) add([...cs.slice(0, need), ...wilds.slice(0, w)]);
      const max = cs.length + w;
      for (let size = 4; size <= max; size++) {
        const needN = size - w;
        if (needN < 1 || needN > cs.length) continue;
        add([...cs.slice(0, needN), ...wilds.slice(0, w)]);
      }
    }
  }
  if (wilds.length >= 2) add(wilds.slice(0, 2));
  const sj = jokers.filter((c) => c.rank === 'SJ');
  const bj = jokers.filter((c) => c.rank === 'BJ');
  if (sj.length === 2) add(sj);
  if (bj.length === 2) add(bj);
  if (jokers.length === 4) add(jokers.slice());

  for (const tr of RANKS) {
    for (const pr of RANKS) {
      if (tr === pr) continue;
      const tc = byRank.get(tr) || [];
      const pc = byRank.get(pr) || [];
      for (let wt = 0; wt <= wilds.length; wt++) {
        for (let wp = 0; wp + wt <= wilds.length; wp++) {
          const needT = 3 - wt;
          const needP = 2 - wp;
          if (needT < 1 || needP < 0) continue;
          if (tc.length < needT) continue;
          if (needP > 0 && pc.length < needP) continue;
          const cards = [...tc.slice(0, needT), ...pc.slice(0, needP), ...wilds.slice(0, wt + wp)];
          if (cards.length === 5) add(cards);
        }
      }
    }
  }

  function fillSeq(seq, each, suit) {
    const picked = [];
    let miss = 0;
    for (const rank of seq) {
      const pool = (byRank.get(rank) || []).filter((c) => !suit || c.suit === suit);
      const use = Math.min(each, pool.length);
      picked.push(...pool.slice(0, use));
      miss += each - use;
    }
    if (miss <= wilds.length && picked.length + miss === seq.length * each && picked.length > 0) {
      add([...picked, ...wilds.slice(0, miss)]);
    }
  }

  for (const seq of STRAIGHTS) {
    fillSeq(seq, 1, null);
    for (const suit of SUITS) fillSeq(seq, 1, suit);
  }
  for (const seq of TUBES) fillSeq(seq, 2, null);
  for (const seq of PLATES) fillSeq(seq, 3, null);

  return sets;
}

export function sortCards(cards, level) {
  const suitOrder = { S: 0, H: 1, C: 2, D: 3, J: 4 };
  return cards.slice().sort((a, b) => {
    const d = powerValue(a.rank, level) - powerValue(b.rank, level);
    if (d) return d;
    const aw = isWild(a, level) ? 1 : 0;
    const bw = isWild(b, level) ? 1 : 0;
    if (aw !== bw) return aw - bw;
    return (suitOrder[a.suit] ?? 9) - (suitOrder[b.suit] ?? 9);
  });
}

export function sortBySuit(cards, level) {
  const suitOrder = { S: 0, H: 1, C: 2, D: 3, J: 5 };
  return cards.slice().sort((a, b) => {
    const ds = (suitOrder[a.suit] ?? 9) - (suitOrder[b.suit] ?? 9);
    if (ds) return ds;
    return powerValue(a.rank, level) - powerValue(b.rank, level);
  });
}

export function arrangeGroups(hand, level) {
  const wilds = hand.filter((c) => isWild(c, level));
  const jokers = hand.filter((c) => isJoker(c));
  let rest = hand.filter((c) => !isWild(c, level) && !isJoker(c));
  const groups = [];
  const used = new Set();

  const take = (list, label) => {
    if (!list.length) return;
    list.forEach((c) => used.add(c.id));
    groups.push({ label, cards: list });
    rest = rest.filter((c) => !used.has(c.id));
  };

  if (jokers.length === 4) {
    groups.push({ label: '天王炸', cards: jokers.slice() });
    jokers.length = 0;
  }

  const byRank = groupByRank(rest);
  const ranksByPower = RANKS.slice().sort((a, b) => powerValue(b, level) - powerValue(a, level));
  for (const rank of ranksByPower) {
    const cs = byRank.get(rank) || [];
    if (cs.length >= 4) take(cs.slice(), typeLabel({ type: 'bomb', cards: cs }));
  }

  function findSeq(sequences, each, label, suit) {
    let found = true;
    while (found) {
      found = false;
      for (const seq of sequences) {
        const picked = [];
        let ok = true;
        for (const rank of seq) {
          const pool = rest.filter((c) => c.rank === rank && !picked.includes(c) && (!suit || c.suit === suit));
          if (pool.length < each) {
            ok = false;
            break;
          }
          picked.push(...pool.slice(0, each));
        }
        if (ok) {
          take(picked, label);
          found = true;
          break;
        }
      }
    }
  }

  for (const suit of SUITS) findSeq(STRAIGHTS, 1, '同花顺', suit);
  findSeq(PLATES, 3, '钢板', null);
  findSeq(TUBES, 2, '木板', null);
  findSeq(STRAIGHTS, 1, '顺子', null);

  const leftBy = groupByRank(rest);
  for (const rank of ranksByPower) {
    const cs = leftBy.get(rank) || [];
    if (cs.length === 3) take(cs.slice(), '三张');
  }
  const leftPairs = groupByRank(rest);
  for (const rank of ranksByPower) {
    const cs = leftPairs.get(rank) || [];
    if (cs.length === 2) take(cs.slice(), '对子');
  }
  const singles = sortCards(rest, level);
  for (const c of singles) groups.push({ label: '单张', cards: [c] });

  if (jokers.length) {
    const js = jokers.slice().sort((a, b) => powerValue(a.rank, level) - powerValue(b.rank, level));
    groups.push({ label: '王', cards: js });
  }
  if (wilds.length) groups.push({ label: '逢人配', cards: wilds.slice() });
  return groups.filter((g) => g.cards.length);
}

export function highestTributeCard(hand, level) {
  const pool = hand.filter((c) => !isWild(c, level));
  const src = pool.length ? pool : hand;
  return src.slice().sort((a, b) => {
    const d = powerValue(b.rank, level) - powerValue(a.rank, level);
    if (d) return d;
    return (SUIT_POWER[b.suit] || 0) - (SUIT_POWER[a.suit] || 0);
  })[0];
}

export function pickReturnCard(hand) {
  const ok = hand.filter((c) => isReturnable(c));
  const src = ok.length ? ok : hand.filter((c) => !isJoker(c));
  const pool = src.length ? src : hand.slice();
  return pool.slice().sort((a, b) => {
    const aw = a.suit === 'H' && ok.includes(a) ? 1 : 0;
    const bw = b.suit === 'H' && ok.includes(b) ? 1 : 0;
    if (aw !== bw) return aw - bw;
    const d = naturalValue(a.rank) - naturalValue(b.rank);
    if (d) return d;
    return (SUIT_POWER[a.suit] || 0) - (SUIT_POWER[b.suit] || 0);
  })[0];
}

export function planTribute(hands, order, level) {
  const teamOf = (seat) => (seat % 2 === 0 ? 0 : 1);
  const head = order[0];
  const second = order[1];
  const third = order[2];
  const last = order[3];
  const doubleDown = teamOf(third) === teamOf(last);
  const resistTeam = teamOf(last);
  let bigJokers = 0;
  for (let i = 0; i < 4; i++) {
    if (teamOf(i) !== resistTeam) continue;
    bigJokers += hands[i].filter((c) => c.rank === 'BJ').length;
  }
  if (bigJokers >= 2) {
    return { resist: true, doubleDown, gives: [], leader: head, resistTeam };
  }
  const givers = doubleDown ? [last, third] : [last];
  const gives = givers.map((from) => ({
    from,
    card: highestTributeCard(hands[from], level),
    to: null,
  }));
  gives.sort((a, b) => {
    const d = powerValue(b.card.rank, level) - powerValue(a.card.rank, level);
    if (d) return d;
    if (a.from === last) return -1;
    if (b.from === last) return 1;
    return 0;
  });
  if (doubleDown) {
    gives[0].to = head;
    gives[1].to = second;
  } else {
    gives[0].to = head;
  }
  return {
    resist: false,
    doubleDown,
    gives,
    leader: gives[0].from,
    resistTeam,
  };
}

export function wildCount(cards, level) {
  return cards.filter((c) => isWild(c, level)).length;
}
