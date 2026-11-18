/**
 * 掼蛋实战口诀（v7）——只给机器人选牌，不另写一套规则。
 *
 * 合法牌一律来自 engine.generateCandidateSets + evaluateSelection。
 * 口诀里的说法和引擎牌型的对应：
 * - 夯 = fullhouse（三带二）
 * - 钢板 = plate
 * - 连对（界面上有时也叫连对）= tube（木板）。内部继续用 tube，不改引擎类型名。
 * - 配牌 / 逢人配 = isWild，即红桃级牌；打 2 时是 ♥2
 * - 火 / 炸 = isBombType：bomb、straightflush（同花顺）、jokerbomb
 * - 三不带 = triple
 * - 毒怪怪：不是合法牌型。按常见教法理解成「逢人配硬粘出来的别扭组合」
 *   （假对、假三张、配完拆不开的残张）加上光秃的三不带。
 *   默认不把逢人配贴进非炸，也不主动出三不带。
 * - 上家 / 下家 / 对家：本仓库出牌顺序是座位 +1。
 *   南你(0) → 东下家(1) → 北对家(2) → 西上家(3) → 你。
 *   下家 = (seat+1)%4，对家 = (seat+2)%4，上家 = (seat+3)%4。
 *   四人都在时下家和上家是对手，对家是队友。有人走完后，
 *   下一手有牌的人可能变成队友，送小按这个座位是不是队友来区分。
 * - 头游 / 走牌 / 飞 = finishOrder 已有人，或该家手牌张数为 0。
 *
 * 六段口诀落在这些函数上：
 * 1. 理牌 shapeOf / acceptable / straightPlanPenalty
 * 2. 控场 pickPolicyLead / topSingle
 * 3. 火力 bombGate / goOutThreat
 * 4. 配合 partnerGuard
 * 5. 残局 countDefense
 * 6. 记牌 recallTable / othersCanBeat，心态 moodOf
 */

import {
  RANKS,
  SUITS,
  STRAIGHTS,
  arrangeGroups,
  bombStrength,
  evaluateSelection,
  generateCandidateSets,
  isBombType,
  isJoker,
  isWild,
  powerValue,
  wildCount,
} from './engine.js?v=7';

export function legalMoves(hand, level, current) {
  const out = [];
  const seen = new Set();
  for (const cards of generateCandidateSets(hand, level)) {
    const ev = evaluateSelection(cards, level, current || null);
    if (!ev.ok) continue;
    const key = ev.combo.cards.map((c) => c.id).sort((a, b) => a - b).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ev.combo);
  }
  return out;
}

/** 组顺不超五：非走牌时，长于 5 的顺子重罚，5 张顺子也轻罚（轻易不组顺）。 */
export function straightPlanPenalty(move, { finishing = false } = {}) {
  if (!move || move.type !== 'straight') return 0;
  if (finishing) return 0;
  if ((move.cards?.length || 0) > 5) return 100;
  return 8;
}

function bySmallest(level, finishing = false) {
  return (a, b) => {
    const ps = straightPlanPenalty(a, { finishing }) - straightPlanPenalty(b, { finishing });
    if (ps) return ps;
    const dw = wildCount(a.cards, level) - wildCount(b.cards, level);
    if (dw) return dw;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.cards.length - b.cards.length;
  };
}

function lengthsOf(ctx) {
  if (Array.isArray(ctx.lengths) && ctx.lengths.length === 4) return ctx.lengths.slice();
  const seat = ctx.seat ?? 0;
  const lens = [null, null, null, null];
  if (ctx.myLen != null) lens[seat] = ctx.myLen;
  if (ctx.partnerLen != null) lens[(seat + 2) % 4] = ctx.partnerLen;
  if (ctx.opponentMin != null) {
    lens[(seat + 1) % 4] = ctx.opponentMin;
    lens[(seat + 3) % 4] = ctx.opponentMin;
  }
  return lens;
}

function opponentLengths(ctx) {
  const lens = lengthsOf(ctx);
  const seat = ctx.seat ?? 0;
  const partner = ctx.partner ?? (seat + 2) % 4;
  const out = [];
  for (let i = 0; i < 4; i++) {
    if (i === seat || i === partner) continue;
    if (lens[i] == null || lens[i] <= 0) continue;
    out.push(lens[i]);
  }
  if (!out.length && ctx.opponentMin != null && ctx.opponentMin < 99 && ctx.opponentMin > 0) out.push(ctx.opponentMin);
  return out;
}

function opponentMin(ctx) {
  const lens = opponentLengths(ctx);
  if (!lens.length) return ctx.opponentMin ?? 99;
  return Math.min(...lens);
}

function winnerLength(ctx) {
  if (ctx.trickWinner != null) {
    const n = lengthsOf(ctx)[ctx.trickWinner];
    if (n != null) return n;
  }
  if (ctx.partnerWinning) return ctx.partnerLen ?? 99;
  return ctx.opponentMin ?? 99;
}

function nextLiveIsPartner(ctx) {
  if (ctx.seat == null) return false;
  const lens = lengthsOf(ctx);
  const partner = ctx.partner ?? (ctx.seat + 2) % 4;
  if (lens.some((n) => n == null)) return false;
  for (let k = 1; k <= 3; k++) {
    const id = (ctx.seat + k) % 4;
    if (lens[id] > 0) return id === partner;
  }
  return false;
}

function headDecided(ctx) {
  if (ctx.headDecided != null) return !!ctx.headDecided;
  if (ctx.headSeat != null) return true;
  if (Array.isArray(ctx.finishes)) return ctx.finishes.some((f) => f === 1);
  return false;
}

function tally(cards, rank, suit) {
  if (!cards?.length) return 0;
  return cards.filter((c) => (rank == null || c.rank === rank) && (!suit || c.suit === suit)).length;
}

function unknownOf(hand, ctx, rank, suit) {
  let total = 8;
  if (suit) total = 2;
  else if (rank === 'SJ' || rank === 'BJ') total = 2;
  const used = tally(hand, rank, suit) + tally(ctx.played, rank, suit) + tally(ctx.knownElsewhere, rank, suit);
  return Math.max(0, total - used);
}

function unknownSuit(hand, ctx, suit) {
  const used = tally(hand, null, suit) + tally(ctx.played, null, suit) + tally(ctx.knownElsewhere, null, suit);
  return Math.max(0, 26 - used);
}

/**
 * 记牌优先级：大小王 → 四个二 → 级牌与红桃逢人配 → 缺门断张。
 * 用的是桌上已经公开的牌（ctx.played / ctx.knownElsewhere），不另数一副牌。
 */
export function recallTable(hand, ctx, level) {
  const info = ctx || {};
  return {
    bj: unknownOf(hand, info, 'BJ'),
    sj: unknownOf(hand, info, 'SJ'),
    twos: unknownOf(hand, info, '2'),
    levels: unknownOf(hand, info, level),
    wilds: unknownOf(hand, info, level, 'H'),
    gaps: RANKS.filter((rank) => unknownOf(hand, info, rank) === 0),
    voids: SUITS.filter((suit) => unknownSuit(hand, info, suit) === 0),
  };
}

function othersCanBeat(hand, ctx, level, combo) {
  if (!combo) return true;
  const mem = recallTable(hand, ctx, level);
  const higher = (rank) => powerValue(rank, level) > combo.rank;
  if (combo.type === 'single') {
    if (mem.bj > 0 && higher('BJ')) return true;
    if (mem.sj > 0 && higher('SJ')) return true;
    if (mem.levels > 0 && higher(level)) return true;
    if (mem.twos > 0 && higher('2')) return true;
    return RANKS.some((rank) => higher(rank) && unknownOf(hand, ctx, rank) > 0);
  }
  if (combo.type === 'pair' || combo.type === 'triple') {
    const need = combo.type === 'pair' ? 2 : 3;
    const jokerOk = (left) => combo.type === 'pair' && left >= 2;
    if (jokerOk(mem.bj) && higher('BJ')) return true;
    if (jokerOk(mem.sj) && higher('SJ')) return true;
    const ranks = [];
    if (mem.levels >= 1 && higher(level)) ranks.push(level);
    if (level !== '2' && mem.twos >= 1 && higher('2')) ranks.push('2');
    for (const rank of RANKS) if (!ranks.includes(rank) && higher(rank)) ranks.push(rank);
    return ranks.some((rank) => {
      const n = unknownOf(hand, ctx, rank);
      if (n >= need) return true;
      return combo.type === 'pair' && n >= 1 && mem.wilds >= 1 && rank !== 'SJ' && rank !== 'BJ';
    });
  }
  return true;
}

function canFullHouse(counts) {
  const trips = [];
  const pairs = [];
  for (const [rank, n] of counts) {
    if (n >= 3) trips.push(n);
    else if (n >= 2) pairs.push(n);
  }
  if (trips.length >= 1 && pairs.length >= 1) return true;
  if (trips.length >= 2) return true;
  if (trips.some((n) => n >= 5)) return true;
  return false;
}

function shapeOf(hand, level) {
  const groups = arrangeGroups(hand, level);
  const counts = new Map();
  for (const card of hand) {
    if (isJoker(card) || isWild(card, level)) continue;
    counts.set(card.rank, (counts.get(card.rank) || 0) + 1);
  }
  const bombRanks = new Set();
  const seedRanks = new Set();
  const wilds = hand.filter((card) => isWild(card, level)).length;
  for (const [rank, n] of counts) {
    if (n >= 4) bombRanks.add(rank);
    if (wilds > 0 && n >= 3) seedRanks.add(rank);
  }
  const singles = groups.filter((g) => g.label === '单张').length;
  const pairs = groups.filter((g) => g.label === '对子').length;
  const bombs = groups.filter((g) => g.label.includes('炸') || g.label === '同花顺').length;
  let posture = 'unclear';
  if (bombs >= 1 && singles <= 5) posture = 'strong';
  else if (bombs === 0 && canFullHouse(counts) && singles >= 4) posture = 'poor';
  else if (bombs === 0 && singles >= 5) posture = 'weak';
  return {
    groups,
    counts,
    bombRanks,
    seedRanks,
    singles,
    pairs,
    bombs,
    straights: groups.filter((g) => g.label === '顺子').length,
    posture,
  };
}

function heldBombCount(shape) {
  return shape.bombs;
}

/** 顺风不浪 / 逆风不慌：只看名次和张数，不改牌型。 */
function moodOf(ctx) {
  if (ctx.headSeat != null && ctx.seat != null) {
    return ctx.headSeat % 2 === ctx.seat % 2 ? 'ahead' : 'behind';
  }
  const opp = ctx.opponentMin ?? 99;
  const partner = ctx.partnerLen ?? 99;
  const mine = ctx.myLen ?? 27;
  if (partner + mine + 8 < opp * 2) return 'ahead';
  if (opp <= 6 && opp * 2 + 8 < partner) return 'behind';
  return 'even';
}

function breaksBomb(move, shape) {
  return move.cards.some((card) => shape.bombRanks.has(card.rank));
}

function breaksSeed(move, shape) {
  return move.cards.some((card) => shape.seedRanks.has(card.rank));
}

function keepStructure(pool, shape) {
  const intact = pool.filter((m) => !breaksBomb(m, shape) && !breaksSeed(m, shape));
  if (intact.length) return intact;
  const bombsafe = pool.filter((m) => !breaksBomb(m, shape));
  return bombsafe.length ? bombsafe : pool;
}

function naturalMoves(moves, level, shape) {
  const pool = moves.filter((m) => !isBombType(m) && wildCount(m.cards, level) === 0 && !m.cards.some(isJoker));
  return pool.filter((m) => !breaksBomb(m, shape) && !breaksSeed(m, shape));
}

function smallestOf(moves, level, shape, type) {
  let pool = naturalMoves(moves, level, shape);
  if (type) pool = pool.filter((m) => m.type === type);
  if (!pool.length) return null;
  pool.sort(bySmallest(level));
  return pool[0];
}

function topSingle(moves, level, shape) {
  let singles = naturalMoves(moves, level, shape).filter((m) => m.type === 'single');
  if (!singles.length) return null;
  const gate = powerValue('K', level);
  const big = singles.filter((m) => m.rank >= gate);
  if (big.length) {
    big.sort((a, b) => a.rank - b.rank);
    return big[0];
  }
  singles.sort((a, b) => b.rank - a.rank);
  return singles[0];
}

function opponentStraightHeavy(hand, ctx, level) {
  const seen = (ctx.played?.length || 0) + (ctx.knownElsewhere?.length || 0);
  if (seen < 8) return false;
  if (!opponentLengths(ctx).some((n) => n >= 10)) return false;
  let open = 0;
  for (const seq of STRAIGHTS) {
    const live = seq.filter((rank) => unknownOf(hand, ctx, rank) >= 4).length;
    if (live >= 4) open += 1;
  }
  return open >= 6;
}

function straightThreat(current, ctx) {
  if (!current || current.type !== 'straight' || ctx.partnerWinning) return false;
  return winnerLength(ctx) <= 3;
}

function fullhouseThreat(current, ctx) {
  if (!current || current.type !== 'fullhouse' || ctx.partnerWinning) return false;
  const left = winnerLength(ctx);
  if (left === 0 || left === 5) return true;
  return opponentLengths(ctx).some((n) => n === 5) && left <= 5;
}

function longRunThreat(current, ctx) {
  if (!current || ctx.partnerWinning) return false;
  if (current.type !== 'tube' && current.type !== 'plate' && current.type !== 'straight') return false;
  const left = winnerLength(ctx);
  const before = left + current.cards.length;
  return (before === 7 || before === 8) && left <= 2;
}

function goOutThreat(current, ctx) {
  return straightThreat(current, ctx) || fullhouseThreat(current, ctx) || longRunThreat(current, ctx);
}

function shouldTop(ctx) {
  if (opponentMin(ctx) === 1) return true;
  if (ctx.trickWinner != null && ctx.upstream != null && ctx.trickWinner === ctx.upstream) return true;
  if (ctx.partnerWinning && opponentMin(ctx) <= 2) return true;
  return false;
}

function acceptable(moves, hand, level, shape) {
  let pool = moves.filter((m) => !isBombType(m) && wildCount(m.cards, level) === 0 && !m.cards.some(isJoker));
  pool = pool.filter((m) => m.type !== 'triple');
  pool = pool.filter((m) => !(m.type === 'straight' && m.cards.length > 5));
  pool = keepStructure(pool, shape);
  if (shape.singles + shape.pairs < 2 && hand.length > 10) {
    const noPlate = pool.filter((m) => m.type !== 'plate');
    if (noPlate.length) pool = noPlate;
  }
  if (pool.length) return pool;
  return moves.filter((m) => !isBombType(m) && wildCount(m.cards, level) === 0);
}

function pickPolicyLead(moves, hand, level, ctx) {
  const finishing = moves.find((m) => m.cards.length === hand.length);
  if (finishing) return finishing;

  const shape = shapeOf(hand, level);
  const pool = acceptable(moves, hand, level, shape);
  const opp = opponentMin(ctx);
  const partnerLen = ctx.partnerLen ?? 99;
  const lowest = (type) => {
    const list = pool.filter((m) => m.type === type).sort(bySmallest(level));
    if (!list.length) return null;
    if ((type === 'straight' || type === 'tube' || type === 'plate') && !nextLiveIsPartner(ctx) && opp <= 5 && list.length > 1) {
      return list[list.length - 1];
    }
    return list[0];
  };

  if (partnerLen === 1 && opp > 1) return lowest('single') || lowest('pair') || pool[0];
  if (partnerLen === 2 && opp > 2) return lowest('pair') || lowest('single') || pool[0];

  if (opp === 1) return lowest('fullhouse') || lowest('pair') || lowest('tube') || lowest('straight') || lowest('single') || pool[0];
  if (opponentLengths(ctx).some((n) => n === 5)) return lowest('pair') || lowest('fullhouse') || lowest('single') || pool[0];
  if (opponentLengths(ctx).some((n) => n === 7 || n === 8) || opponentStraightHeavy(hand, ctx, level)) {
    return lowest('pair') || lowest('fullhouse') || lowest('single') || pool[0];
  }

  if (shape.straights >= 2) return lowest('single') || lowest('pair') || pool[0];
  if (shape.posture === 'poor') return lowest('fullhouse') || lowest('pair') || lowest('single') || pool[0];
  if (shape.posture === 'strong' && !(headDecided(ctx) && partnerLen > 0 && partnerLen <= 5)) {
    return lowest('single') || lowest('pair') || pool[0];
  }
  if (headDecided(ctx) && partnerLen > 0 && partnerLen <= 5 && opp > partnerLen) {
    if (partnerLen === 3) return lowest('pair') || lowest('single') || pool[0];
    if (partnerLen === 4) return lowest('pair') || lowest('fullhouse') || lowest('single') || pool[0];
    return lowest('pair') || lowest('single') || pool[0];
  }
  if (shape.posture === 'weak') return lowest('pair') || lowest('fullhouse') || lowest('single') || pool[0];
  return lowest('pair') || lowest('fullhouse') || lowest('single') || lowest('tube') || lowest('straight') || pool.slice().sort(bySmallest(level))[0];
}

function bombChoices(moves, level) {
  return moves.filter(isBombType).sort((a, b) => {
    const dw = wildCount(a.cards, level) - wildCount(b.cards, level);
    if (dw) return dw;
    return bombStrength(a) - bombStrength(b);
  });
}

function partnerGuard(moves, hand, level, current, ctx, shape) {
  const partnerLen = ctx.partnerLen ?? 99;
  const opp = opponentMin(ctx);
  if (partnerLen <= 3) {
    if (opp === 1 && current.type === 'single') return topSingle(moves, level, shape);
    return null;
  }
  if (opp > 4) return null;
  if (opp > 2 && headDecided(ctx)) return null;
  if (current.type === 'single' && shouldTop(ctx)) return topSingle(moves, level, shape);
  if (current.type === 'pair' || current.type === 'fullhouse') return smallestOf(moves, level, shape, current.type);
  return smallestOf(moves, level, shape);
}

function bombGate(bombs, ctx, shape) {
  if (!bombs.length) return null;
  const opp = opponentMin(ctx);
  const held = heldBombCount(shape);
  const mood = moodOf(ctx);
  if (opp === 4 || opp === 2) return null;
  if (mood === 'behind' && held <= 2) return null;
  if (mood === 'ahead') return null;
  if (held === 1) return null;
  if (held >= 2 && opp <= 6) return bombs[0];
  if (held >= 3 && opp <= 10) return bombs[0];
  return null;
}

function pickPolicyFollow(moves, hand, level, current, ctx) {
  const shape = shapeOf(hand, level);
  const bombs = bombChoices(moves, level);
  const partnerWin = !!ctx.partnerWinning;
  const opp = opponentMin(ctx);
  const finishing = moves.find((m) => m.cards.length === hand.length);

  if (finishing && !isBombType(finishing) && !(partnerWin && (ctx.partnerLen ?? 99) <= 3)) return finishing;

  if (partnerWin) return partnerGuard(moves, hand, level, current, ctx, shape);

  if (goOutThreat(current, ctx) && bombs.length) return bombs[0];

  if (opp === 1) {
    if (current.type === 'single') {
      const top = topSingle(moves, level, shape);
      if (top) return top;
    }
    const cheap = smallestOf(moves, level, shape);
    if (cheap) return cheap;
    return bombs[0] || null;
  }

  if (opp === 2) return smallestOf(moves, level, shape);

  if (current.type === 'single' && shouldTop(ctx)) {
    const top = topSingle(moves, level, shape);
    if (top) return top;
  }

  if (current.type === 'straight' || current.type === 'tube' || current.type === 'plate') {
    const same = smallestOf(moves, level, shape, current.type);
    if (same) return same;
    if (!goOutThreat(current, ctx)) return bombGate(bombs, ctx, shape);
  }

  let natural = smallestOf(moves, level, shape);
  if (natural && current.type === 'single' && shape.posture === 'weak') {
    const push = topSingle(moves, level, shape);
    if (push) natural = push;
  }
  if (natural) {
    const quiet = opp > 10 && hand.length > 12 && natural.rank >= powerValue('Q', level);
    if (quiet && moodOf(ctx) === 'ahead') return null;
    if (quiet && ctx.difficulty === 'sharp' && !othersCanBeat(hand, ctx, level, current)) return null;
    return natural;
  }
  if (goOutThreat(current, ctx)) return bombs[0] || null;
  return bombGate(bombs, ctx, shape);
}

export function choosePolicyMove(hand, level, current, ctx, moves) {
  if (!hand?.length) return null;
  const info = ctx || {};
  const legal = moves || legalMoves(hand, level, current);
  if (!legal.length) return null;
  if (!current) {
    return pickPolicyLead(legal, hand, level, info)
      || legal.slice().sort(bySmallest(level, legal.some((m) => m.cards.length === hand.length)))[0]
      || null;
  }
  return pickPolicyFollow(legal, hand, level, current, info);
}
