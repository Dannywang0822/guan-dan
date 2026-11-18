import {
  bombStrength,
  isBombType,
  isJoker,
  isWild,
  wildCount,
} from './engine.js?v=8';
import { choosePolicyMove, legalMoves as policyMoves } from './policy.js?v=8';

function legalMoves(hand, level, current) {
  return policyMoves(hand, level, current);
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
  // 均衡是默认档，和精算一样走实战口诀；精算额外用记牌放过打不回来的大牌。
  // 轻松仍只出小牌，不套这套口诀。
  return choosePolicyMove(hand, level, current, info, moves);
}
