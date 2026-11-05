import {
  RANKS,
  arrangeGroups,
  bombStrength,
  evaluateSelection,
  generateCandidateSets,
  isBombType,
  isJoker,
  isWild,
  powerValue,
  wildCount,
} from './engine.js?v=3';

function legalMoves(hand, level, current) {
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

function bySmallest(level) {
  return (a, b) => {
    const dw = wildCount(a.cards, level) - wildCount(b.cards, level);
    if (dw) return dw;
    if (a.rank !== b.rank) return a.rank - b.rank;
    return b.cards.length - a.cards.length;
  };
}

function finishMove(moves, hand) {
  return moves.find((m) => m.cards.length === hand.length) || null;
}

function pickLead(moves, hand, level) {
  const finish = finishMove(moves, hand);
  if (finish) return finish;
  const plain = moves.filter((m) => !isBombType(m) && wildCount(m.cards, level) === 0 && !m.cards.some(isJoker));
  const sequences = plain.filter((m) => (m.type === 'straight' || m.type === 'tube' || m.type === 'plate') && m.rank <= 10);
  if (sequences.length) {
    sequences.sort((a, b) => b.cards.length - a.cards.length || a.rank - b.rank);
    return sequences[0];
  }
  const groups = plain.filter((m) => (m.type === 'pair' || m.type === 'triple' || m.type === 'fullhouse') && m.rank <= 10);
  if (groups.length) {
    groups.sort((a, b) => a.rank - b.rank || b.cards.length - a.cards.length);
    return groups[0];
  }
  const singles = moves.filter((m) => m.type === 'single' && !isJoker(m.cards[0]) && !isWild(m.cards[0], level));
  if (singles.length) {
    const bombRanks = new Set();
    const counts = new Map();
    for (const c of hand) {
      if (isJoker(c) || isWild(c, level)) continue;
      counts.set(c.rank, (counts.get(c.rank) || 0) + 1);
    }
    for (const [rank, n] of counts) if (n >= 4) bombRanks.add(rank);
    const soft = singles.filter((m) => !bombRanks.has(m.cards[0].rank));
    const pool = soft.length ? soft : singles;
    pool.sort((a, b) => a.rank - b.rank);
    return pool[0];
  }
  const any = moves.filter((m) => m.type === 'single').sort((a, b) => a.rank - b.rank);
  return any[0] || moves.slice().sort(bySmallest(level))[0] || null;
}

function pickFollow(moves, hand, level, ctx) {
  const finish = finishMove(moves, hand);
  if (finish) return finish;
  const partnerWinning = !!(ctx && ctx.partnerWinning);
  const opponentMin = ctx && ctx.opponentMin != null ? ctx.opponentMin : 99;
  if (partnerWinning && opponentMin > 4) return null;
  const normals = moves.filter((m) => !isBombType(m)).sort(bySmallest(level));
  if (normals.length) return normals[0];
  if (opponentMin <= 5 || hand.length <= 5) {
    const bombs = moves.filter(isBombType).sort((a, b) => bombStrength(a) - bombStrength(b));
    return bombs[0] || null;
  }
  return null;
}

function pickEasyLead(moves, hand, level) {
  const finish = finishMove(moves, hand);
  if (finish && !isBombType(finish)) return finish;
  const singles = moves.filter((m) => m.type === 'single' && !isJoker(m.cards[0]) && !isWild(m.cards[0], level));
  if (singles.length) {
    singles.sort((a, b) => a.rank - b.rank);
    return singles[0];
  }
  const plain = moves.filter((m) => !isBombType(m)).sort(bySmallest(level));
  if (plain.length) return plain[0];
  if (finish) return finish;
  const bombs = moves.filter(isBombType).sort((a, b) => bombStrength(a) - bombStrength(b));
  return bombs[0] || null;
}

function pickEasyFollow(moves, hand, level, ctx) {
  const finish = finishMove(moves, hand);
  if (finish && !isBombType(finish)) return finish;
  const normals = moves.filter((m) => !isBombType(m)).sort(bySmallest(level));
  if (normals.length) return normals[0];
  if (finish) return finish;
  if ((ctx?.opponentMin ?? 99) <= 2) {
    const bombs = moves.filter(isBombType).sort((a, b) => bombStrength(a) - bombStrength(b));
    return bombs[0] || null;
  }
  return null;
}

function tally(cards, rank, suit) {
  if (!cards?.length) return 0;
  return cards.filter((c) => c.rank === rank && (!suit || c.suit === suit)).length;
}

function unknownOf(hand, ctx, rank, suit) {
  const total = suit ? 2 : (rank === 'SJ' || rank === 'BJ' ? 2 : 8);
  const used = tally(hand, rank, suit) + tally(ctx.played, rank, suit) + tally(ctx.knownElsewhere, rank, suit);
  return Math.max(0, total - used);
}

function othersCanBeat(hand, ctx, level, combo) {
  if (!combo) return true;
  const ranks = [...RANKS, 'SJ', 'BJ'];
  if (combo.type === 'single') {
    return ranks.some((rank) => powerValue(rank, level) > combo.rank && unknownOf(hand, ctx, rank) > 0);
  }
  if (combo.type === 'pair' || combo.type === 'triple') {
    const need = combo.type === 'pair' ? 2 : 3;
    const wilds = unknownOf(hand, ctx, level, 'H');
    return ranks.some((rank) => {
      if (powerValue(rank, level) <= combo.rank) return false;
      const n = unknownOf(hand, ctx, rank);
      if (n >= need) return true;
      return combo.type === 'pair' && n >= 1 && wilds >= 1;
    });
  }
  return true;
}

function meldsLeft(hand, level) {
  if (!hand.length) return 0;
  return arrangeGroups(hand, level).length;
}

function unseenHighRatio(hand, ctx, level) {
  let unseen = 0;
  let high = 0;
  const gate = powerValue('Q', level);
  for (const rank of [...RANKS, 'SJ', 'BJ']) {
    const n = unknownOf(hand, ctx, rank);
    unseen += n;
    if (powerValue(rank, level) >= gate) high += n;
  }
  return unseen ? high / unseen : 0;
}

function scoreLead(move, hand, level, ctx) {
  const rest = hand.filter((c) => !move.cards.some((x) => x.id === c.id));
  let score = meldsLeft(rest, level) * 10 - move.cards.length * 0.5;
  if (move.cards.some((c) => isWild(c, level))) score += 5;
  if (move.type === 'single' && isJoker(move.cards[0])) score += 8;
  const partnerLen = ctx.partnerLen ?? 27;
  const opp = ctx.opponentMin ?? 99;
  if (partnerLen === 1 && move.type === 'single') score -= 14;
  if (partnerLen === 2 && move.type === 'pair') score -= 12;
  if (partnerLen === 3 && (move.type === 'triple' || move.type === 'pair')) score -= 4;
  if (opp === 1 && move.type !== 'single') score -= 12;
  if (opp === 1 && move.type === 'single') {
    const ratio = unseenHighRatio(hand, ctx, level);
    if (ratio >= 0.28 && move.rank < powerValue('K', level)) score += 16;
    if (ratio >= 0.28 && move.rank >= powerValue('A', level)) score -= 8;
    if (ratio < 0.28 && move.rank >= 80) score += 6;
  }
  if (opp === 2 && move.type === 'single') score += 5;
  return score;
}

function pickSharpLead(moves, hand, level, ctx) {
  const finish = finishMove(moves, hand);
  if (finish) return finish;
  const opp = ctx.opponentMin ?? 99;
  const partnerLen = ctx.partnerLen ?? 27;
  if (partnerLen === 1 && opp > 1) {
    const singles = moves.filter((m) => m.type === 'single');
    if (singles.length) {
      singles.sort((a, b) => a.rank - b.rank);
      return singles[0];
    }
  }
  if (partnerLen === 2 && opp > 2) {
    const pairs = moves.filter((m) => m.type === 'pair' && !m.cards.some(isJoker));
    if (pairs.length) {
      pairs.sort(bySmallest(level));
      return pairs[0];
    }
  }
  const endgame = hand.length <= 12 || opp <= 8 || partnerLen <= 6;
  if (!endgame) return pickLead(moves, hand, level);
  let pool = moves.filter((m) => !isBombType(m));
  if (!pool.length) pool = moves.slice();
  const ranked = pool.map((m) => ({ m, s: scoreLead(m, hand, level, ctx) }));
  ranked.sort((a, b) => a.s - b.s);
  return ranked[0]?.m || null;
}

function pickSharpFollow(moves, hand, level, current, ctx) {
  const finish = finishMove(moves, hand);
  if (finish) return finish;
  const opp = ctx.opponentMin ?? 99;
  const partnerWinning = !!ctx.partnerWinning;
  const normals = moves.filter((m) => !isBombType(m)).sort(bySmallest(level));
  const bombs = moves.filter(isBombType).sort((a, b) => bombStrength(a) - bombStrength(b));
  if (partnerWinning) {
    if (opp <= 2 && normals.length) return normals[0];
    if (opp <= 1 && bombs.length) return bombs[0];
    return null;
  }
  const tricks = meldsLeft(hand, level);
  const dangerous = opp <= 4 || opp <= tricks;
  if (normals.length) {
    const cheap = normals[0];
    const memorable = cheap.rank >= 80 && !othersCanBeat(hand, ctx, level, current);
    if (memorable && opp > 8 && hand.length > 12) return null;
    if (dangerous || hand.length <= 12 || cheap.rank < 70) return cheap;
    if (opp > 10 && cheap.rank >= 80) return null;
    return cheap;
  }
  if (bombs.length && (dangerous || opp <= 3 || hand.length <= 6)) return bombs[0];
  return null;
}

export function listSuggestions(hand, level, current, ctx) {
  const moves = legalMoves(hand, level, current);
  if (!current) {
    const best = pickLead(moves, hand, level);
    if (!best) return [];
    const rest = moves.filter((m) => m !== best && !isBombType(m)).sort(bySmallest(level));
    return [best, ...rest.slice(0, 6)];
  }
  const choice = pickFollow(moves, hand, level, ctx || {});
  if (!choice) return [];
  const rest = moves.filter((m) => m !== choice).sort(bySmallest(level));
  return [choice, ...rest.slice(0, 6)];
}

export function chooseMove(hand, level, current, ctx) {
  if (!hand.length) return null;
  const info = ctx || {};
  const moves = legalMoves(hand, level, current);
  const difficulty = info.difficulty || 'balanced';
  if (difficulty === 'easy') {
    return current ? pickEasyFollow(moves, hand, level, info) : pickEasyLead(moves, hand, level);
  }
  if (difficulty === 'sharp') {
    return current ? pickSharpFollow(moves, hand, level, current, info) : pickSharpLead(moves, hand, level, info);
  }
  if (!current) return pickLead(moves, hand, level);
  return pickFollow(moves, hand, level, info);
}
