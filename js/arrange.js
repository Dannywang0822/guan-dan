/**
 * 人的理牌：点数 / 同花顺面 / 最少出牌手数 / 自定义组牌。
 * 合法与否只问规则引擎的 evaluateSelection，这里只负责挑选和排列。
 * 不改出牌规则，也不改机器人的 policy。
 */
import {
  PLATES,
  RANKS,
  STRAIGHTS,
  SUITS,
  TUBES,
  evaluateSelection,
  isJoker,
  isWild,
  naturalValue,
  powerValue,
  sortBySuit,
  sortCards,
  typeLabel,
  wildCount,
} from './engine.js?v=8';

const RANK_I = new Map(RANKS.map((rank, index) => [rank, index]));
const SUIT_SORT = { S: 0, H: 1, C: 2, D: 3, J: 4 };
const SHOW = {
  pair: 10,
  fullhouse: 20,
  tube: 30,
  straight: 40,
  plate: 50,
  triple: 60,
  single: 70,
  straightflush: 80,
  bomb: 90,
  jokerbomb: 100,
};

const SEQS = [];
for (const seq of STRAIGHTS) SEQS.push({ kind: 'straight', each: 1, idx: seq.map((rank) => RANK_I.get(rank)) });
for (const seq of TUBES) SEQS.push({ kind: 'tube', each: 2, idx: seq.map((rank) => RANK_I.get(rank)) });
for (const seq of PLATES) SEQS.push({ kind: 'plate', each: 3, idx: seq.map((rank) => RANK_I.get(rank)) });
const TOUCH = Array.from({ length: 13 }, () => []);
SEQS.forEach((seq, index) => {
  for (const rank of new Set(seq.idx)) TOUCH[rank].push(index);
});

const NEED = {
  single: 1,
  pair: 2,
  triple: 3,
  fullhouse: 5,
  straight: 5,
  tube: 6,
  plate: 6,
  bomb: 4,
  straightflush: 5,
};

const TYPE_NAME = {
  single: '单张',
  pair: '对子',
  triple: '三张',
  fullhouse: '三带二',
  straight: '顺子',
  tube: '连对',
  plate: '钢板',
  bomb: '炸弹',
  straightflush: '同花顺',
};

export const ARRANGE_ORDER = ['rank', 'flush', 'hands'];

export function nextArrange(mode) {
  const index = ARRANGE_ORDER.indexOf(mode);
  return ARRANGE_ORDER[(index + 1) % ARRANGE_ORDER.length];
}

const cache = new Map();

function remember(key, build) {
  if (cache.has(key)) return cache.get(key);
  const value = build();
  if (cache.size > 32) cache.clear();
  cache.set(key, value);
  return value;
}

function handKey(hand, level, tag) {
  const ids = hand.map((card) => card.id).sort((a, b) => a - b).join(',');
  return `${tag}|${level}|${ids}`;
}

function bySuit(a, b) {
  return (SUIT_SORT[a.suit] ?? 9) - (SUIT_SORT[b.suit] ?? 9) || a.id - b.id;
}

function groupRanks(cards) {
  const map = new Map();
  for (const card of cards) {
    if (!map.has(card.rank)) map.set(card.rank, []);
    map.get(card.rank).push(card);
  }
  for (const list of map.values()) list.sort(bySuit);
  return map;
}

function countVector(cards) {
  const counts = new Int8Array(13);
  for (const card of cards) {
    const index = RANK_I.get(card.rank);
    if (index != null) counts[index] += 1;
  }
  return counts;
}

function pack(counts) {
  let key = 0;
  for (let i = 0; i < 13; i++) key = key * 4 + counts[i];
  return key;
}

function sumCounts(counts) {
  let n = 0;
  for (let i = 0; i < 13; i++) n += counts[i];
  return n;
}

function applyMove(counts, move) {
  if (move.k === 'R') counts[move.i] -= move.n;
  else if (move.k === 'H') {
    counts[move.t] -= 3;
    counts[move.p] -= 2;
  } else {
    for (const index of move.idx) counts[index] -= move.each;
  }
}

function undoMove(counts, move) {
  if (move.k === 'R') counts[move.i] += move.n;
  else if (move.k === 'H') {
    counts[move.t] += 3;
    counts[move.p] += 2;
  } else {
    for (const index of move.idx) counts[index] += move.each;
  }
}

function movePenalty(move) {
  if (move.k === 'R') return move.n === 3 ? 30 : 0;
  if (move.k === 'H') return 0;
  if (move.kind === 'straight') return 8;
  if (move.kind === 'plate') return 5;
  return 0;
}

function seqOk(counts, seq, protect) {
  for (const index of seq.idx) {
    if (counts[index] < seq.each) return false;
    if (protect && counts[index] === 3 && seq.each < 3) return false;
  }
  return true;
}

function nextGreedy(counts, protect) {
  let low = -1;
  for (let i = 0; i < 13; i++) {
    if (counts[i]) {
      low = i;
      break;
    }
  }
  if (low < 0) return null;
  if (counts[low] >= 3) {
    for (let p = 0; p < 13; p++) {
      if (p === low || counts[p] < 2) continue;
      if (protect && counts[p] >= 3) continue;
      if (counts[p] < 2) continue;
      return { k: 'H', t: low, p, pen: 0 };
    }
  }
  for (const index of TOUCH[low]) {
    const seq = SEQS[index];
    if (seq.kind === 'plate' && seqOk(counts, seq, protect)) {
      return { k: 'Q', idx: seq.idx, each: seq.each, kind: seq.kind, pen: 5 };
    }
  }
  for (const index of TOUCH[low]) {
    const seq = SEQS[index];
    if (seq.kind === 'tube' && seqOk(counts, seq, protect)) {
      return { k: 'Q', idx: seq.idx, each: seq.each, kind: seq.kind, pen: 0 };
    }
  }
  return { k: 'R', i: low, n: counts[low], pen: counts[low] === 3 ? 30 : 0 };
}

function greedyMoves(counts, protect) {
  const left = Int8Array.from(counts);
  const moves = [];
  let plays = 0;
  let penalty = 0;
  let guard = 0;
  while (sumCounts(left) && guard++ < 40) {
    const move = nextGreedy(left, protect);
    if (!move) break;
    moves.push(move);
    applyMove(left, move);
    plays += 1;
    penalty += move.pen;
  }
  return { plays, penalty, moves };
}

function solvePartition(countSrc, protect) {
  const counts = Int8Array.from(countSrc);
  const memo = new Map();
  let nodes = 0;
  const cap = 300000;
  let capped = false;

  function rec() {
    let low = -1;
    for (let i = 0; i < 13; i++) {
      if (counts[i]) {
        low = i;
        break;
      }
    }
    if (low < 0) return { plays: 0, penalty: 0, move: null };
    const key = pack(counts);
    const hit = memo.get(key);
    if (hit) return hit;
    nodes += 1;
    if (nodes > cap) {
      capped = true;
      const greedy = greedyMoves(counts, protect);
      return { plays: greedy.plays, penalty: greedy.penalty, move: { k: 'G' } };
    }

    let bestPlays = 9999;
    let bestPen = 0;
    let bestMove = null;
    const consider = (move) => {
      const pen = movePenalty(move);
      applyMove(counts, move);
      const sub = rec();
      const plays = 1 + sub.plays;
      const penalty = pen + sub.penalty;
      if (plays < bestPlays || (plays === bestPlays && penalty < bestPen)) {
        bestPlays = plays;
        bestPen = penalty;
        bestMove = move;
      }
      undoMove(counts, move);
    };

    for (const index of TOUCH[low]) {
      const seq = SEQS[index];
      if (!seqOk(counts, seq, protect)) continue;
      consider({ k: 'Q', idx: seq.idx, each: seq.each, kind: seq.kind });
    }
    if (counts[low] >= 3) {
      for (let p = 0; p < 13; p++) {
        if (p === low || counts[p] < 2) continue;
        if (protect && counts[p] >= 3) continue;
        consider({ k: 'H', t: low, p });
      }
    }
    if (counts[low] >= 2 && !(protect && counts[low] >= 3)) {
      for (let t = low + 1; t < 13; t++) {
        if (counts[t] < 3) continue;
        consider({ k: 'H', t, p: low });
      }
    }
    consider({ k: 'R', i: low, n: counts[low] });

    const result = { plays: bestPlays, penalty: bestPen, move: bestMove };
    if (!capped) memo.set(key, result);
    return result;
  }

  const root = rec();
  const moves = [];
  const left = Int8Array.from(countSrc);
  let guard = 0;
  while (sumCounts(left) && guard++ < 40) {
    const node = memo.get(pack(left));
    if (!node || !node.move || node.move.k === 'G') {
      moves.push(...greedyMoves(left, protect).moves);
      break;
    }
    moves.push(node.move);
    applyMove(left, node.move);
  }
  return {
    plays: moves.length,
    penalty: root.penalty,
    moves,
    exact: !capped && moves.length === root.plays,
  };
}

function takeRankCards(pools, index, n) {
  return pools[index].splice(0, n);
}

function takeStraightCards(pools, indexes) {
  for (const suit of SUITS) {
    if (indexes.every((index) => pools[index].some((card) => card.suit === suit))) {
      return indexes.map((index) => {
        const at = pools[index].findIndex((card) => card.suit === suit);
        return pools[index].splice(at, 1)[0];
      });
    }
  }
  return indexes.map((index) => pools[index].shift());
}

function asGroup(cards, level, fallback) {
  const ev = evaluateSelection(cards, level, null);
  if (!ev.ok) {
    return {
      type: fallback,
      label: TYPE_NAME[fallback] || fallback,
      cards,
      order: 0,
      penalty: 0,
    };
  }
  const combo = ev.combo;
  const order = combo.type === 'straight' || combo.type === 'straightflush' || combo.type === 'tube' || combo.type === 'plate'
    ? naturalValue(combo.main || combo.pattern?.[0] || cards[0].rank)
    : (combo.rank || 0);
  return {
    type: combo.type,
    label: combo.type === 'tube' ? '连对' : typeLabel(combo),
    cards: combo.cards.slice(),
    order,
    penalty: combo.type === 'straight' ? 8 : combo.type === 'triple' ? 30 : combo.type === 'plate' ? 5 : 0,
    rank: combo.rank || 0,
  };
}

function materialize(cards, solved, level) {
  const pools = Array.from({ length: 13 }, () => []);
  for (const card of cards.slice().sort(bySuit)) {
    const index = RANK_I.get(card.rank);
    if (index != null) pools[index].push(card);
  }
  const groups = [];
  for (const move of solved.moves) {
    let picked = [];
    if (move.k === 'R') picked = takeRankCards(pools, move.i, move.n);
    else if (move.k === 'H') picked = [...takeRankCards(pools, move.t, 3), ...takeRankCards(pools, move.p, 2)];
    else if (move.kind === 'straight') picked = takeStraightCards(pools, move.idx);
    else {
      for (const index of move.idx) picked.push(...takeRankCards(pools, index, move.each));
    }
    const fallback = move.k === 'R'
      ? (picked.length === 1 ? 'single' : picked.length === 2 ? 'pair' : 'triple')
      : move.k === 'H' ? 'fullhouse' : move.kind;
    groups.push(asGroup(picked, level, fallback));
  }
  return groups;
}

function showKey(group) {
  if (group.heldWild) return 78;
  return SHOW[group.type] ?? 65;
}

function sortGroups(groups) {
  return groups.slice().sort((a, b) => {
    const d = showKey(a) - showKey(b);
    if (d) return d;
    if (a.order !== b.order) return a.order - b.order;
    return (a.cards[0]?.id || 0) - (b.cards[0]?.id || 0);
  });
}

export function flattenGroups(groups) {
  const items = [];
  groups.forEach((group, gi) => {
    group.cards.forEach((card, i) => items.push({ card, gap: gi > 0 && i === 0 }));
  });
  return items;
}

function splitPile(hand, level) {
  const wilds = [];
  const jokers = [];
  const normals = [];
  for (const card of hand) {
    if (isWild(card, level)) wilds.push(card);
    else if (isJoker(card)) jokers.push(card);
    else normals.push(card);
  }
  wilds.sort(bySuit);
  jokers.sort((a, b) => powerValue(a.rank, level) - powerValue(b.rank, level) || a.id - b.id);
  const byRank = groupRanks(normals);
  const bombs = [];
  const free = [];
  for (const rank of RANKS) {
    const cards = byRank.get(rank) || [];
    if (cards.length >= 4) bombs.push(cards.slice());
    else free.push(...cards);
  }
  bombs.sort((a, b) => b.length - a.length || powerValue(b[0].rank, level) - powerValue(a[0].rank, level));
  return { wilds, jokers, bombs, free };
}

function jokerGroups(jokers, level) {
  if (jokers.length === 4) {
    return [asGroup(jokers.slice(), level, 'jokerbomb')];
  }
  const groups = [];
  for (const rank of ['SJ', 'BJ']) {
    const cards = jokers.filter((card) => card.rank === rank);
    if (cards.length === 2) groups.push(asGroup(cards, level, 'pair'));
    else cards.forEach((card) => groups.push(asGroup([card], level, 'single')));
  }
  return groups;
}

function wildGroups(wilds, level) {
  if (wilds.length >= 2) {
    const group = asGroup(wilds.slice(0, 2), level, 'pair');
    group.heldWild = true;
    return [group];
  }
  if (wilds.length === 1) {
    const group = asGroup(wilds.slice(0, 1), level, 'single');
    group.heldWild = true;
    return [group];
  }
  return [];
}

function bombTargetsOf(bombs, free, wildCount) {
  if (!wildCount) return [];
  const targets = [];
  for (const cards of bombs) {
    targets.push({ cards: cards.slice(), count: cards.length, rank: cards[0].rank, locked: true });
  }
  const byRank = groupRanks(free);
  for (const rank of RANKS) {
    const cards = byRank.get(rank) || [];
    if (cards.length === 3 || (cards.length === 2 && wildCount >= 2)) {
      targets.push({ cards: cards.slice(), count: cards.length, rank, locked: false });
    }
  }
  return targets;
}

function assignmentLegal(chosen, targets) {
  const tally = new Map();
  for (const index of chosen) tally.set(index, (tally.get(index) || 0) + 1);
  for (const [index, n] of tally) {
    if (targets[index].count + n < 4) return false;
  }
  return true;
}

function eachBombPlan(wildCount, targets, visit) {
  const chosen = [];
  const walk = (start) => {
    if (assignmentLegal(chosen, targets)) visit(chosen);
    if (chosen.length === wildCount) return;
    for (let t = start; t < targets.length; t++) {
      chosen.push(t);
      walk(t);
      chosen.pop();
    }
  };
  walk(0);
}

function nearSequences(free, wildCount) {
  if (!wildCount) return [];
  const byRank = groupRanks(free);
  const found = [];
  for (const seq of STRAIGHTS) {
    const present = [];
    let miss = 0;
    let splitsSeed = false;
    for (const rank of seq) {
      const cards = byRank.get(rank) || [];
      if (!cards.length) miss += 1;
      else {
        if (cards.length >= 3) splitsSeed = true;
        present.push(cards);
      }
    }
    if (splitsSeed || miss <= 0 || miss > wildCount || present.length < 4) continue;
    let flushSuit = null;
    for (const suit of SUITS) {
      if (present.every((cards) => cards.some((card) => card.suit === suit))) {
        flushSuit = suit;
        break;
      }
    }
    const cards = flushSuit
      ? present.map((list) => list.find((card) => card.suit === flushSuit))
      : present.map((list) => list[0]);
    found.push({
      seq,
      miss,
      flushSuit,
      cards,
      order: naturalValue(seq[seq.length - 1]),
    });
  }
  found.sort((a, b) => (b.flushSuit ? 1 : 0) - (a.flushSuit ? 1 : 0) || a.miss - b.miss || b.order - a.order);
  return found.slice(0, 4);
}

function buildMin(hand, level) {
  if (!hand.length) return { items: [], groups: [], plays: 0, summary: '0手', exact: true };
  const pile = splitPile(hand, level);
  const targets = bombTargetsOf(pile.bombs, pile.free, pile.wilds.length);
  const seqs = nearSequences(pile.free, pile.wilds.length);
  let best = null;

  const scorePlan = (groups, penalty, exact) => {
    const plays = groups.length;
    if (!best || plays < best.plays || (plays === best.plays && penalty < best.penalty)) {
      best = { groups, plays, penalty, exact };
    }
  };

  const runRest = (free, wilds, bombGroups, seqGroup, seqPenalty) => {
    const counts = new Map();
    for (const card of free) counts.set(card.rank, (counts.get(card.rank) || 0) + 1);
    let triples = 0;
    for (const n of counts.values()) if (n >= 3) triples += 1;
    // 手里还有逢人配时，三张是炸弹种子，不能抽走一两张去填顺子或连对。
    const protect = pile.wilds.length > 0 && triples > 0;
    const solved = solvePartition(countVector(free), protect);
    const groups = [
      ...bombGroups,
      ...(seqGroup ? [seqGroup] : []),
      ...materialize(free, solved, level),
      ...wildGroups(wilds, level),
      ...jokerGroups(pile.jokers, level),
    ];
    let penalty = solved.penalty + seqPenalty;
    const seedsLeft = free.reduce((map, card) => map.set(card.rank, (map.get(card.rank) || 0) + 1), new Map());
    let seedN = 0;
    for (const n of seedsLeft.values()) if (n >= 3) seedN += 1;
    if (wilds.length && seedN) penalty += 25 * Math.min(wilds.length, seedN);
    scorePlan(sortGroups(groups), penalty, solved.exact);
  };

  eachBombPlan(pile.wilds.length, targets, (chosen) => {
    const tally = new Map();
    chosen.forEach((index) => tally.set(index, (tally.get(index) || 0) + 1));
    const groups = [];
    const usedFree = new Set();
    const usedBomb = new Set();
    let wildAt = 0;
    for (const [index, n] of tally) {
      const target = targets[index];
      const attached = pile.wilds.slice(wildAt, wildAt + n);
      wildAt += n;
      const cards = target.cards.concat(attached);
      const group = asGroup(cards, level, 'bomb');
      if (group.type !== 'bomb' && group.type !== 'jokerbomb') return;
      groups.push(group);
      if (target.locked) usedBomb.add(target.rank);
      else target.cards.forEach((card) => usedFree.add(card.id));
    }
    for (const bomb of pile.bombs) {
      if (usedBomb.has(bomb[0].rank)) continue;
      groups.push(asGroup(bomb.slice(), level, 'bomb'));
    }
    const free = pile.free.filter((card) => !usedFree.has(card.id));
    const banked = pile.wilds.slice(wildAt);
    runRest(free, banked, groups, null, 0);
  });

  for (const seq of seqs) {
    const cards = seq.cards.concat(pile.wilds.slice(0, seq.miss));
    const group = asGroup(cards, level, seq.flushSuit ? 'straightflush' : 'straight');
    const wanted = seq.flushSuit ? 'straightflush' : 'straight';
    if (group.type !== wanted && !(wanted === 'straight' && group.type === 'straightflush')) continue;
    if (seq.flushSuit && group.type !== 'straightflush') continue;
    const used = new Set(seq.cards.map((card) => card.id));
    const free = pile.free.filter((card) => !used.has(card.id));
    const banked = pile.wilds.slice(seq.miss);
    const bombs = pile.bombs.map((bomb) => asGroup(bomb.slice(), level, 'bomb'));
    const seqPenalty = group.type === 'straightflush' ? 0 : 8 + 40 * seq.miss;
    runRest(free, banked, bombs, group, seqPenalty);
  }

  const groups = best ? best.groups : [];
  const plays = groups.length;
  return {
    items: flattenGroups(groups),
    groups,
    plays,
    penalty: best ? best.penalty : 0,
    exact: best ? best.exact : true,
    summary: `${plays}手`,
  };
}

function bucketFree(free, blockedRanks) {
  const buckets = {};
  for (const suit of SUITS) {
    buckets[suit] = {};
    for (const rank of RANKS) buckets[suit][rank] = [];
  }
  for (const card of free) {
    if (blockedRanks.has(card.rank)) continue;
    if (!buckets[card.suit]) continue;
    buckets[card.suit][card.rank].push(card);
  }
  return buckets;
}

function buildFlush(hand, level) {
  const pile = splitPile(hand, level);
  const byRank = groupRanks(pile.free);
  const blocked = new Set();
  const seedGroups = [];
  for (const rank of RANKS) {
    const cards = byRank.get(rank) || [];
    if (cards.length >= 3) {
      blocked.add(rank);
      seedGroups.push(asGroup(cards.slice(), level, 'triple'));
    }
  }
  const buckets = bucketFree(pile.free, blocked);
  const taken = new Set();
  const wilds = pile.wilds.slice();
  const groups = [];

  const avail = (suit, rank) => (buckets[suit][rank] || []).filter((card) => !taken.has(card.id));

  const windowCards = (suit, seq) => {
    const cards = [];
    const missing = [];
    for (const rank of seq) {
      const card = avail(suit, rank)[0];
      if (card) cards.push(card);
      else missing.push(rank);
    }
    return { cards, missing, seq, suit };
  };

  const takeWindow = (hit, useWild) => {
    const ordered = [];
    const wild = useWild ? wilds[0] : null;
    for (const rank of hit.seq) {
      const card = hit.cards.find((item) => item.rank === rank);
      if (card) ordered.push(card);
      else if (wild && hit.missing[0] === rank) ordered.push(wild);
    }
    if (ordered.length === 5) {
      const ev = evaluateSelection(ordered, level, null);
      if (!ev.ok || (useWild && ev.combo.type !== 'straightflush' && ev.combo.type !== 'straight')) return false;
      if (useWild && ev.combo.type !== 'straightflush') return false;
      if (useWild) wilds.shift();
      hit.cards.forEach((card) => taken.add(card.id));
      const group = asGroup(ordered, level, 'straightflush');
      group.face = 'made';
      groups.push(group);
      return true;
    }
    hit.cards.forEach((card) => taken.add(card.id));
    groups.push({
      type: 'run',
      label: '同花顺面',
      cards: ordered.slice(),
      order: naturalValue(hit.seq[hit.seq.length - 1]),
      face: 'near',
    });
    return true;
  };

  const bestWindow = (missingN) => {
    let best = null;
    for (const suit of SUITS) {
      for (const seq of STRAIGHTS) {
        const hit = windowCards(suit, seq);
        if (hit.missing.length !== missingN || !hit.cards.length) continue;
        const order = naturalValue(seq[seq.length - 1]);
        const suitKey = SUIT_SORT[suit] ?? 9;
        if (!best || order > best.order || (order === best.order && suitKey < best.suitKey)) {
          best = { ...hit, order, suitKey };
        }
      }
    }
    return best;
  };

  let guard = 0;
  while (guard++ < 12) {
    const hit = bestWindow(0);
    if (!hit || !takeWindow(hit, false)) break;
  }
  guard = 0;
  while (wilds.length && guard++ < 4) {
    const hit = bestWindow(1);
    if (!hit || !takeWindow(hit, true)) break;
  }
  guard = 0;
  while (guard++ < 12) {
    const hit = bestWindow(1);
    if (!hit) break;
    takeWindow(hit, false);
  }

  guard = 0;
  while (guard++ < 20) {
    let best = null;
    for (const suit of SUITS) {
      const lines = [RANKS, ['A', '2', '3', '4', '5']];
      for (const line of lines) {
        let cur = [];
        const consider = () => {
          if (cur.length < 2) return;
          const order = naturalValue(cur[cur.length - 1].rank);
          if (!best || cur.length > best.cards.length || (cur.length === best.cards.length && order > best.order)) {
            best = { cards: cur.slice(), suit, order };
          }
        };
        for (const rank of line) {
          const card = avail(suit, rank)[0];
          if (card) cur.push(card);
          else {
            consider();
            cur = [];
          }
        }
        consider();
      }
    }
    if (!best) break;
    best.cards.forEach((card) => taken.add(card.id));
    groups.push({
      type: 'run',
      label: '同花连张',
      cards: best.cards.slice(),
      order: best.order,
      face: 'run',
    });
  }

  const bombGroups = pile.bombs.map((cards) => asGroup(cards.slice(), level, 'bomb'));
  const usedWild = new Set(groups.flatMap((group) => group.cards.filter((card) => isWild(card, level)).map((card) => card.id)));
  const leftWilds = wilds.filter((card) => !usedWild.has(card.id));
  const rest = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      for (const card of buckets[suit][rank]) {
        if (!taken.has(card.id)) rest.push(card);
      }
    }
  }
  const tail = [
    ...bombGroups,
    ...seedGroups,
    ...jokerGroups(pile.jokers, level),
    ...wildGroups(leftWilds, level),
  ];
  if (rest.length) {
    tail.push({ type: 'rest', label: '其余', cards: sortBySuit(rest, level), order: 0 });
  }
  const all = [...groups, ...tail];
  return {
    items: flattenGroups(all),
    groups: all,
    plays: null,
    summary: '',
  };
}

function buildRank(hand, level) {
  return {
    items: sortCards(hand, level).map((card) => ({ card, gap: false })),
    groups: [],
    plays: null,
    summary: '',
  };
}

export function arrangeHand(hand, level, mode) {
  const use = mode === 'flush' || mode === 'hands' ? mode : 'rank';
  return remember(handKey(hand, level, use), () => {
    if (use === 'flush') return buildFlush(hand, level);
    if (use === 'hands') return buildMin(hand, level);
    return buildRank(hand, level);
  });
}

function typeMatch(combo, type) {
  if (!combo) return false;
  if (combo.type === type) return true;
  return type === 'bomb' && combo.type === 'jokerbomb';
}

function failText(state, type) {
  const name = TYPE_NAME[type] || type;
  const around = state.free.length + state.wilds.length + state.jokers.length
    + state.bombs.reduce((n, cards) => n + cards.length, 0);
  if (around < (NEED[type] || 1)) return `${name}牌不够`;
  if (type === 'straight' || type === 'tube' || type === 'plate' || type === 'straightflush') return `${name}点数凑不齐`;
  if (type === 'fullhouse') return '三带二还缺三张或一对';
  if (type === 'bomb') return '炸弹同点张数不够';
  if (type === 'pair') return '对子点数凑不齐';
  if (type === 'triple') return '三张点数凑不齐';
  return `${name}凑不齐`;
}

function seedRanks(cards) {
  const map = groupRanks(cards);
  const ranks = [];
  for (const [rank, list] of map) if (list.length >= 3) ranks.push(rank);
  return ranks;
}

function customCandidates(state, level, type, opt) {
  const free = state.free.slice();
  const byRank = groupRanks(free);
  const seeds = new Set(seedRanks(free));
  const lists = [];
  const push = (cards) => {
    if (!cards || !cards.length) return;
    if (new Set(cards.map((card) => card.id)).size !== cards.length) return;
    lists.push(cards);
  };
  const rankOk = (rank, take) => {
    const cards = byRank.get(rank) || [];
    if (cards.length < take) return false;
    if (!opt.splitSeed && seeds.has(rank) && take < cards.length) return false;
    return true;
  };

  if (type === 'single') {
    for (const card of free) {
      if (!opt.splitSeed && seeds.has(card.rank)) continue;
      push([card]);
    }
    if (opt.jokers) state.jokers.forEach((card) => push([card]));
    if (opt.wild) state.wilds.forEach((card) => push([card]));
    if (opt.splitBomb) state.bombs.forEach((cards) => cards.forEach((card) => push([card])));
  }

  if (type === 'pair') {
    for (const [rank, cards] of byRank) {
      if (!rankOk(rank, 2)) continue;
      push(cards.slice(0, 2));
    }
    const sj = state.jokers.filter((card) => card.rank === 'SJ');
    const bj = state.jokers.filter((card) => card.rank === 'BJ');
    if (opt.jokers && sj.length >= 2) push(sj.slice(0, 2));
    if (opt.jokers && bj.length >= 2) push(bj.slice(0, 2));
    if (opt.wild && state.wilds.length >= 2) push(state.wilds.slice(0, 2));
    if (opt.wild && state.wilds.length >= 1) {
      for (const cards of byRank.values()) push([cards[0], state.wilds[0]]);
    }
    if (opt.splitBomb) {
      for (const cards of state.bombs) if (cards.length >= 2) push(cards.slice(0, 2));
    }
  }

  if (type === 'triple') {
    for (const [rank, cards] of byRank) {
      if (cards.length >= 3) push(cards.slice(0, 3));
    }
    if (opt.wild) {
      for (const cards of byRank.values()) {
        const need = 3 - Math.min(3, cards.length);
        if (need > 0 && need <= state.wilds.length && cards.length > 0) {
          push([...cards.slice(0, 3 - need), ...state.wilds.slice(0, need)]);
        }
      }
    }
    if (opt.splitBomb) {
      for (const cards of state.bombs) if (cards.length >= 3) push(cards.slice(0, 3));
    }
  }

  if (type === 'fullhouse') {
    const ranks = [...byRank.keys()];
    for (const tr of ranks) {
      for (const pr of ranks) {
        if (tr === pr) continue;
        const tc = byRank.get(tr);
        const pc = byRank.get(pr);
        if (tc.length < 3 || pc.length < 2) continue;
        if (!opt.splitSeed && seeds.has(pr) && pc.length > 2) continue;
        push([...tc.slice(0, 3), ...pc.slice(0, 2)]);
      }
    }
    if (opt.wild && state.wilds.length) {
      for (const tr of ranks) {
        for (const pr of ranks) {
          if (tr === pr) continue;
          const tc = byRank.get(tr);
          const pc = byRank.get(pr);
          for (let wt = 0; wt <= state.wilds.length; wt++) {
            for (let wp = 0; wt + wp <= state.wilds.length; wp++) {
              if (!wt && !wp) continue;
              const needT = 3 - wt;
              const needP = 2 - wp;
              if (needT < 1 || tc.length < needT || needP < 0) continue;
              if (needP > 0 && pc.length < needP) continue;
              push([...tc.slice(0, needT), ...pc.slice(0, Math.max(0, needP)), ...state.wilds.slice(0, wt + wp)]);
            }
          }
        }
      }
    }
  }

  if (type === 'straight' || type === 'straightflush') {
    const sequences = STRAIGHTS;
    for (const seq of sequences) {
      const columns = seq.map((rank) => byRank.get(rank) || []);
      const miss = columns.filter((cards) => !cards.length).length;
      if (!opt.wild && miss) continue;
      if (opt.wild && (miss > state.wilds.length || miss === columns.length)) continue;
      if (!opt.splitSeed && seq.some((rank) => seeds.has(rank) && (byRank.get(rank) || []).length >= 3 && miss >= 0 && columns[seq.indexOf(rank)].length)) {
        const bad = seq.some((rank) => {
          const cards = byRank.get(rank) || [];
          return seeds.has(rank) && cards.length >= 3;
        });
        if (bad && !opt.splitSeed) continue;
      }
      for (const suit of SUITS) {
        const cards = [];
        let hole = 0;
        let ok = true;
        for (const rank of seq) {
          const hit = (byRank.get(rank) || []).find((card) => card.suit === suit);
          if (hit) cards.push(hit);
          else hole += 1;
        }
        if (!ok) continue;
        if (hole > (opt.wild ? state.wilds.length : 0)) continue;
        if (!opt.wild && hole) continue;
        if (opt.wild && hole) cards.push(...state.wilds.slice(0, hole));
        if (cards.length === 5) push(cards);
      }
      if (type === 'straight') {
        const mixed = [];
        let hole = 0;
        let prevSuit = '';
        for (const rank of seq) {
          const pool = (byRank.get(rank) || []).filter((card) => card.suit !== prevSuit);
          const card = pool[0] || (byRank.get(rank) || [])[0];
          if (card) {
            mixed.push(card);
            prevSuit = card.suit;
          } else hole += 1;
        }
        if (hole <= (opt.wild ? state.wilds.length : 0) && mixed.length + hole === 5 && mixed.length) {
          push(hole ? mixed.concat(state.wilds.slice(0, hole)) : mixed);
        }
      }
    }
    if (opt.splitBomb && type === 'straight') {
      const all = groupRanks(free.concat(...state.bombs));
      for (const seq of STRAIGHTS) {
        if (seq.every((rank) => (all.get(rank) || []).length)) {
          push(seq.map((rank) => all.get(rank)[0]));
        }
      }
    }
  }

  if (type === 'tube' || type === 'plate') {
    const sequences = type === 'tube' ? TUBES : PLATES;
    const each = type === 'tube' ? 2 : 3;
    for (const seq of sequences) {
      let miss = 0;
      const cards = [];
      let badSeed = false;
      for (const rank of seq) {
        const pool = byRank.get(rank) || [];
        const take = Math.min(each, pool.length);
        if (!opt.splitSeed && seeds.has(rank) && pool.length >= 3 && take < pool.length) badSeed = true;
        cards.push(...pool.slice(0, take));
        miss += each - take;
      }
      if (badSeed) continue;
      if (miss > (opt.wild ? state.wilds.length : 0)) continue;
      if (miss && !opt.wild) continue;
      if (miss) cards.push(...state.wilds.slice(0, miss));
      if (cards.length === seq.length * each) push(cards);
    }
  }

  if (type === 'bomb') {
    for (const cards of state.bombs) push(cards.slice());
    if (state.jokers.length === 4) push(state.jokers.slice());
    for (const cards of byRank.values()) {
      if (cards.length >= 4) push(cards.slice());
      if (opt.wild && state.wilds.length) {
        const need = Math.max(0, 4 - cards.length);
        if (need >= 1 && need <= state.wilds.length && cards.length >= 1) {
          push([...cards.slice(), ...state.wilds.slice(0, need)]);
        }
        if (cards.length >= 4) push([...cards.slice(), ...state.wilds.slice(0, 1)]);
        if (cards.length >= 3 && state.wilds.length >= 2) push([...cards.slice(0, 3), ...state.wilds.slice(0, 2)]);
      }
    }
    if (opt.splitBomb) {
      for (const cards of state.bombs) {
        if (cards.length > 4) push(cards.slice(0, 4));
      }
    }
  }

  return lists;
}

function bestValid(lists, level, type) {
  let best = null;
  const seen = new Set();
  for (const cards of lists) {
    const key = cards.map((card) => card.id).sort((a, b) => a - b).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    const ev = evaluateSelection(cards, level, null);
    if (!ev.ok || !typeMatch(ev.combo, type)) continue;
    const wilds = wildCount(ev.combo.cards, level);
    const size = type === 'bomb' ? -ev.combo.cards.length : 0;
    const power = type === 'bomb' ? -(ev.combo.rank || 0) : (ev.combo.rank || 0);
    const score = wilds * 10000 + size * 100 + power;
    if (!best || score < best.score) best = { score, group: asGroup(cards, level, type) };
  }
  return best && best.group;
}

function consume(state, cards) {
  const ids = new Set(cards.map((card) => card.id));
  state.free = state.free.filter((card) => !ids.has(card.id));
  state.wilds = state.wilds.filter((card) => !ids.has(card.id));
  state.jokers = state.jokers.filter((card) => !ids.has(card.id));
  state.bombs = state.bombs.filter((group) => group.some((card) => !ids.has(card.id)));
}

function takeCustom(state, level, type) {
  const name = TYPE_NAME[type] || type;
  const strictWild = type === 'bomb' || type === 'straightflush';
  const base = { splitSeed: false, splitBomb: false, jokers: type === 'single' || type === 'pair' || type === 'bomb', wild: strictWild };
  const hit = bestValid(customCandidates(state, level, type, base), level, type);
  if (hit) {
    consume(state, hit.cards);
    hit.requested = true;
    return { ok: true, group: hit };
  }
  const seeds = seedRanks(state.free);
  if (!strictWild && state.wilds.length) {
    const wildHit = bestValid(customCandidates(state, level, type, { ...base, wild: true }), level, type);
    if (wildHit && seeds.length) return { ok: false, reason: `逢人配留给炸弹，不用来组${name}` };
    if (wildHit && !seeds.length) {
      consume(state, wildHit.cards);
      wildHit.requested = true;
      return { ok: true, group: wildHit };
    }
  }
  const split = bestValid(customCandidates(state, level, type, { ...base, splitSeed: true }), level, type);
  if (split) return { ok: false, reason: `会拆开三张炸弹种子，组不成${name}` };
  const broken = bestValid(customCandidates(state, level, type, { ...base, splitSeed: true, splitBomb: true, wild: false }), level, type);
  if (broken) return { ok: false, reason: `会拆开自然炸弹，组不成${name}` };
  if ((type === 'straight' || type === 'straightflush' || type === 'tube' || type === 'plate') && state.jokers.length) {
    const probe = state.free.concat(state.jokers);
    const ev = evaluateSelection(probe.slice(0, NEED[type] || probe.length), level, null);
    if (!ev.ok) return { ok: false, reason: `${name}不能带王` };
  }
  if (type === 'straight') {
    const flush = bestValid(customCandidates(state, level, 'straightflush', { ...base, wild: true }), level, 'straightflush');
    if (flush) return { ok: false, reason: '这是同花顺，请改选同花顺' };
  }
  return { ok: false, reason: failText(state, type) };
}

function planCustom(hand, level, types) {
  if (!types?.length) return { ok: false, reason: '先点要组的牌型', items: null, groups: [], plays: null };
  const pile = splitPile(hand, level);
  const state = {
    free: pile.free.slice(),
    wilds: pile.wilds.slice(),
    jokers: pile.jokers.slice(),
    bombs: pile.bombs.map((cards) => cards.slice()),
  };
  const formed = [];
  for (const type of types) {
    const got = takeCustom(state, level, type);
    if (!got.ok) return { ok: false, reason: got.reason, items: null, groups: [], plays: null, leftovers: state.free.slice() };
  formed.push(got.group);
  }
  const protectedGroups = [];
  for (const cards of state.bombs) protectedGroups.push(asGroup(cards.slice(), level, 'bomb'));
  let loose = state.free.slice();
  if (state.jokers.length === 4) protectedGroups.push(asGroup(state.jokers.slice(), level, 'jokerbomb'));
  else loose = loose.concat(state.jokers);
  const banked = state.wilds.slice();
  const loosePlan = loose.length || banked.length
    ? buildMin(loose.concat(banked), level)
    : { plays: 0 };
  const looseCards = sortCards(loose, level);
  const tail = [
    ...protectedGroups,
    ...wildGroups(banked, level).map((group) => ({ ...group, heldWild: true })),
  ];
  if (looseCards.length) tail.push({ type: 'rest', label: '其余', cards: looseCards, order: 0 });
  const shown = [...formed, ...tail];
  const plays = formed.length + protectedGroups.length + (loose.length || banked.length ? loosePlan.plays : 0);
  const names = formed.map((group) => group.label);
  const bits = [`已组 ${names.join('、')}`];
  if (protectedGroups.length) bits.push(`保留${protectedGroups.map((group) => group.label).join('、')}`);
  if (looseCards.length || banked.length) bits.push(`余 ${looseCards.length + banked.length} 张`);
  return {
    ok: true,
    reason: '',
    items: flattenGroups(shown),
    groups: shown,
    formed,
    leftovers: looseCards.concat(banked),
    plays,
    summary: `${bits.join('，')} · ${plays}手`,
  };
}

export function planCustomGroups(hand, level, types) {
  const tag = `custom:${(types || []).join('.')}`;
  return remember(handKey(hand, level, tag), () => planCustom(hand, level, types));
}
