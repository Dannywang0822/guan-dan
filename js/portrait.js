/**
 * 竖屏手机布局与点牌型校验。
 * 合法与否只看规则引擎的 identify / evaluateSelection / beats，这里只负责排版和说明。
 */
import {
  PLATES,
  STRAIGHTS,
  SUIT_SYMBOL,
  TUBES,
  beats,
  bestInterpretation,
  evaluateSelection,
  identify,
  isJoker,
  isWild,
  naturalValue,
  typeLabel,
} from './engine.js?v=9';

export const COMPOSE_TYPES = [
  ['single', '单张'],
  ['pair', '对子'],
  ['triple', '三张'],
  ['fullhouse', '三带二'],
  ['straight', '顺子'],
  ['tube', '连对'],
  ['plate', '钢板'],
  ['bomb', '炸弹'],
  ['straightflush', '同花顺'],
];

const TYPE_NAME = Object.fromEntries(COMPOSE_TYPES);

export function isPortraitPhone(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (w <= 0 || w > 600) return false;
  if (h > 0 && h < w) return false;
  return true;
}

export function portraitFanLayout(width, n) {
  const pad = 8;
  const avail = Math.max(80, (Number(width) || 0) - pad * 2);
  const count = Math.max(0, n | 0);
  let cw = 54;
  let step = 0;
  if (count > 1) {
    step = (avail - cw) / (count - 1);
    const minPeek = 11;
    if (step < minPeek) {
      cw = Math.min(54, Math.max(46, avail - minPeek * (count - 1)));
      step = (avail - cw) / (count - 1);
    }
    if (step < 9) {
      cw = Math.max(40, Math.min(cw, avail * 0.16));
      step = (avail - cw) / (count - 1);
    }
    const fuller = cw * 0.78;
    if (step > fuller) step = Math.min(step, cw + 4);
  }
  if (count > 1 && cw + (count - 1) * step > avail) {
    step = (avail - cw) / (count - 1);
  }
  if (step < 0) step = 0;
  const ch = Math.round(cw / 0.7);
  const total = count === 0 ? 0 : cw + Math.max(0, count - 1) * step;
  let offset = (avail - total) / 2;
  if (offset < 0) offset = 0;
  const magnet = count > 1 ? Math.min(8, Math.max(4, step * 0.45)) : 0;
  return { cw, ch, step, offset, total, avail, magnet };
}

export function fanHitIndex(x, n, step, offset, cw, magnet, selectedIndexes = [], hitY = null) {
  const count = n | 0;
  if (count <= 0 || !Number.isFinite(x)) return -1;
  const leftOf = (i) => offset + i * step;
  const inLift = hitY && Number.isFinite(hitY.y) && Number.isFinite(hitY.cardTop)
    && hitY.y < hitY.cardTop && hitY.y >= hitY.cardTop - 18;
  if (inLift && selectedIndexes.length) {
    let lifted = -1;
    for (const raw of selectedIndexes) {
      const i = raw | 0;
      if (i < 0 || i >= count) continue;
      const left = leftOf(i);
      if (x >= left && x < left + cw && i > lifted) lifted = i;
    }
    if (lifted >= 0) return lifted;
  }
  const stripRight = (i) => (i === count - 1 ? leftOf(i) + cw : leftOf(i) + step);
  let owner = -1;
  for (let i = count - 1; i >= 0; i--) {
    const left = leftOf(i);
    const right = stripRight(i);
    if (x >= left && x < right) {
      owner = i;
      break;
    }
  }
  const mag = Math.max(0, Number(magnet) || 0);
  if (owner < 0) {
    const start = leftOf(0);
    const end = leftOf(count - 1) + cw;
    if (x >= start - mag && x < start) return 0;
    if (x >= end && x <= end + mag) return count - 1;
    return -1;
  }
  // 露出的左缘就是点数。点在露出条里就选这张；抬起的牌按整张牌面接收，方便再点收回。
  return owner;
}

export function packedMetrics(maxW, n, targetW) {
  const room = Math.max(48, maxW);
  const count = Math.max(1, n | 0);
  const cw = Math.max(14, Math.min(targetW, count <= 1 ? targetW : Math.floor(room / (1 + (count - 1) * 0.42))));
  const step = count <= 1 ? 0 : Math.min(cw * 0.55, (room - cw) / (count - 1));
  return { cw, step, total: cw + Math.max(0, count - 1) * step, room };
}

export function zoomCardWidth(width, count) {
  const n = count | 0;
  if (n <= 0) return { cw: 0, ch: 0, gap: 6 };
  const avail = Math.max(80, (Number(width) || 0) - 16);
  const gap = 6;
  let cw = n <= 2 ? 78 : n <= 5 ? 64 : 54;
  const need = n * cw + (n - 1) * gap;
  if (need > avail) cw = Math.floor((avail - (n - 1) * gap) / n);
  cw = Math.max(28, Math.min(78, cw));
  return { cw, ch: Math.round(cw / 0.7), gap };
}

function splitHand(cards, level) {
  const wilds = [];
  const jokers = [];
  const normals = [];
  for (const card of cards) {
    if (isWild(card, level)) wilds.push(card);
    else if (isJoker(card)) jokers.push(card);
    else normals.push(card);
  }
  return { wilds, jokers, normals };
}

function rankCount(normals) {
  const map = new Map();
  for (const card of normals) map.set(card.rank, (map.get(card.rank) || 0) + 1);
  return map;
}

function sortedRankLabels(normals) {
  const ranks = normals.map((card) => card.rank);
  const wheel = ranks.includes('A') && ranks.includes('2') && ranks.every((rank) => ['A', '2', '3', '4', '5'].includes(rank));
  const order = wheel ? ['A', '2', '3', '4', '5'] : null;
  return normals.slice().sort((a, b) => {
    if (order) return order.indexOf(a.rank) - order.indexOf(b.rank);
    return naturalValue(a.rank) - naturalValue(b.rank);
  }).map((card) => card.rank).join('-');
}

function bestSequence(normals, wilds, sequences, each) {
  const counts = rankCount(normals);
  const present = [...counts.keys()];
  let best = null;
  for (const seq of sequences) {
    if (present.some((rank) => !seq.includes(rank))) continue;
    const miss = [];
    let overflow = false;
    for (const rank of seq) {
      const have = counts.get(rank) || 0;
      if (have > each) {
        overflow = true;
        break;
      }
      for (let i = have; i < each; i++) miss.push(rank);
    }
    if (overflow) continue;
    const unfilled = miss.slice(wilds.length);
    const head = naturalValue(seq[seq.length - 1]);
    const score = unfilled.length * 100 + miss.length;
    if (!best || score < best.score || (score === best.score && head > best.head)) {
      best = { seq, miss, unfilled, score, head };
    }
  }
  return best;
}

function uniqueRanks(list) {
  const out = [];
  for (const rank of list) if (!out.includes(rank)) out.push(rank);
  return out;
}

function contained(present, sequences) {
  return sequences.some((seq) => present.every((rank) => seq.includes(rank)));
}

function brokenText(normals, wheel, label) {
  const text = sortedRankLabels(normals);
  const unique = new Set(normals.map((card) => card.rank));
  if (unique.has('A') && unique.has('2') && [...unique].some((rank) => !wheel.includes(rank))) {
    return `不是${label} · ${text} 不能绕回`;
  }
  return `不是${label} · ${text} 中间断了`;
}

function matchesWanted(option, wanted) {
  if (!wanted) return true;
  if (option.type === wanted) return true;
  return wanted === 'bomb' && option.type === 'jokerbomb';
}

function portraitName(type) {
  if (type === 'jokerbomb') return '天王炸';
  if (type === 'tube') return '连对';
  return TYPE_NAME[type] || typeLabel({ type, cards: [] });
}

function describeCombo(combo) {
  if (!combo) return '牌';
  if (combo.type === 'jokerbomb') return '天王炸';
  if (combo.type === 'straight' || combo.type === 'straightflush') {
    const pattern = combo.pattern || [];
    const span = pattern.length ? `${pattern[0]}-${pattern[pattern.length - 1]}` : (combo.main || '');
    const suit = combo.type === 'straightflush' && combo.suit ? (SUIT_SYMBOL[combo.suit] || '') : '';
    return `${portraitName(combo.type)} ${suit}${span}`.trim();
  }
  if (combo.type === 'tube' || combo.type === 'plate') {
    const pattern = combo.pattern || [];
    const span = pattern.length ? `${pattern[0]}-${pattern[pattern.length - 1]}` : (combo.main || '');
    return `${portraitName(combo.type)} ${span}`.trim();
  }
  if (combo.type === 'bomb') {
    const n = combo.cards.length;
    const word = { 4: '四炸', 5: '五炸', 6: '六炸', 7: '七炸', 8: '八炸' }[n] || `${n}炸`;
    return `${word} ${combo.main || ''}`.trim();
  }
  if (combo.type === 'fullhouse') return `三带二 ${combo.main || ''}`.trim();
  if (combo.type === 'single' || combo.type === 'pair' || combo.type === 'triple') {
    return `${portraitName(combo.type)} ${combo.main || ''}`.trim();
  }
  return portraitName(combo.type);
}

function singleReason(cards) {
  if (cards.length === 1) return '不是单张';
  return `单张只能出 1 张，现在是 ${cards.length} 张`;
}

function pairReason(cards, level) {
  if (cards.length !== 2) return `对子需要 2 张同点，现在是 ${cards.length} 张`;
  const { jokers, normals } = splitHand(cards, level);
  if (jokers.length === 1) return '不是对子 · 单王不能和别的牌成对';
  if (jokers.length === 2) return '不是对子 · 大王和小王不能成对';
  const ranks = normals.map((card) => card.rank);
  if (ranks.length === 2 && ranks[0] !== ranks[1]) return `不是对子 · ${ranks[0]} 和 ${ranks[1]} 点数不同`;
  return '不是对子 · 两张点数不同';
}

function tripleReason(cards, level) {
  if (cards.length !== 3) return `三张需要 3 张同点，现在是 ${cards.length} 张`;
  const { jokers, normals } = splitHand(cards, level);
  if (jokers.length) return '不是三张 · 三张不能带王';
  const counts = rankCount(normals);
  if (counts.size === 0) return '不是三张 · 逢人配要配一张普通牌';
  if (counts.size > 1) return `不是三张 · ${sortedRankLabels(normals)} 点数不同`;
  return '不是三张 · 点数凑不齐';
}

function fullHouseReason(cards, level, options) {
  if (options.some((option) => option.type === 'bomb' || option.type === 'jokerbomb')) {
    return '不是三带二 · 同点张数是炸弹，请改选炸弹';
  }
  if (cards.length !== 5) return `三带二需要 5 张，三张带一对，现在是 ${cards.length} 张`;
  const { jokers, normals } = splitHand(cards, level);
  if (jokers.length) return '不是三带二 · 三带二不能带王';
  const counts = rankCount(normals);
  if (counts.size > 2) return `不是三带二 · ${sortedRankLabels(normals)} 超过两种点数`;
  if (counts.size <= 1) return '不是三带二 · 需要三张再带一对';
  return `不是三带二 · ${sortedRankLabels(normals)} 配不成三张带一对`;
}

function bombReason(cards, level, options) {
  if (options.some((option) => option.type === 'straightflush')) return '不是炸弹 · 这是同花顺，请改选同花顺';
  if (cards.length < 4) return `炸弹至少 4 张同点，现在是 ${cards.length} 张`;
  const { jokers, normals } = splitHand(cards, level);
  if (jokers.length) return '不是炸弹 · 王不能补进普通炸弹，四张王才是天王炸';
  const counts = rankCount(normals);
  if (counts.size === 0) return '不是炸弹 · 逢人配要配普通点数';
  if (counts.size > 1) return `不是炸弹 · ${sortedRankLabels(normals)} 点数不同`;
  return '不是炸弹 · 同点张数不够';
}

function missingPhrase(unfilled) {
  const counts = new Map();
  for (const rank of unfilled) counts.set(rank, (counts.get(rank) || 0) + 1);
  return [...counts].map(([rank, n]) => (n > 1 ? `${n} 张 ${rank}` : rank)).join('、');
}

function shortSequence(label, missing) {
  const lack = missingPhrase(missing);
  if (label === '顺子') return `顺子至少 5 张连续点数，缺 ${lack}`;
  if (label === '连对') return `连对要三连对共 6 张，缺 ${lack}`;
  if (label === '钢板') return `钢板要两连三张共 6 张，缺 ${lack}`;
  return `${label}还缺 ${lack}`;
}

function otherPlayed(options, wanted, cards, need) {
  if (!options.length || cards.length === need) return '';
  const rest = options.filter((option) => !matchesWanted(option, wanted));
  if (!rest.length) return '';
  return `不是${portraitName(wanted)} · 这是${portraitName(bestInterpretation(rest).type)}`;
}

function sequenceReason(cards, level, label, sequences, each, need, wheel, options) {
  const other = otherPlayed(options || [], label === '连对' ? 'tube' : label === '钢板' ? 'plate' : 'straight', cards, need);
  if (other) return other;
  const { wilds, jokers, normals } = splitHand(cards, level);
  if (jokers.length) return `不是${label} · ${label}不能带王`;
  const counts = rankCount(normals);
  if ([...counts.values()].some((n) => n > each)) {
    return `不是${label} · ${sortedRankLabels(normals)} 有重复点数`;
  }
  if (cards.length < need) {
    const best = bestSequence(normals, wilds, sequences, each);
    if (best && best.unfilled.length) return shortSequence(label, best.unfilled);
    if (!best && normals.length) return brokenText(normals, wheel, label);
    return `${label}至少 ${need} 张，现在是 ${cards.length} 张`;
  }
  if (cards.length > need) return `${label}只要 ${need} 张，现在是 ${cards.length} 张`;
  const present = [...counts.keys()];
  if (!contained(present, sequences)) return brokenText(normals, wheel, label);
  return `不是${label} · ${sortedRankLabels(normals)} 对不上`;
}

function straightReason(cards, level, options) {
  if (options.some((option) => option.type === 'straightflush')) return '不是顺子 · 这是同花顺，请改选同花顺';
  if (options.some((option) => option.type === 'bomb')) return '不是顺子 · 同点张数是炸弹，请改选炸弹';
  if (options.some((option) => option.type === 'fullhouse')) return '不是顺子 · 这是三带二，请改选三带二';
  return sequenceReason(cards, level, '顺子', STRAIGHTS, 1, 5, ['A', '2', '3', '4', '5'], options);
}

function tubeReason(cards, level, options) {
  if (options.some((option) => option.type === 'plate')) return '不是连对 · 这是钢板，请改选钢板';
  if (options.some((option) => option.type === 'bomb')) return '不是连对 · 同点张数是炸弹，请改选炸弹';
  return sequenceReason(cards, level, '连对', TUBES, 2, 6, ['A', '2', '3'], options);
}

function plateReason(cards, level, options) {
  if (options.some((option) => option.type === 'tube')) return '不是钢板 · 这是连对，请改选连对';
  if (options.some((option) => option.type === 'bomb')) return '不是钢板 · 同点张数是炸弹，请改选炸弹';
  return sequenceReason(cards, level, '钢板', PLATES, 3, 6, ['A', '2'], options);
}

function straightFlushReason(cards, level, options) {
  if (options.some((option) => option.type === 'straight')) return '不是同花顺 · 点数连上了，但花色不同';
  const { wilds, jokers, normals } = splitHand(cards, level);
  if (jokers.length) return '不是同花顺 · 同花顺不能带王';
  const suits = new Set(normals.map((card) => card.suit));
  if (cards.length < 5) {
    const best = bestSequence(normals, wilds, STRAIGHTS, 1);
    const missing = best ? uniqueRanks(best.unfilled) : [];
    if (missing.length) return `同花顺要 5 张同花连续，缺 ${missing.join('、')}`;
    return `同花顺要 5 张同花连续，现在是 ${cards.length} 张`;
  }
  if (cards.length > 5) return `同花顺只要 5 张，现在是 ${cards.length} 张`;
  if (suits.size <= 1) {
    const gap = sequenceReason(cards, level, '顺子', STRAIGHTS, 1, 5, ['A', '2', '3', '4', '5']);
    const detail = gap.replace(/^不是顺子 · /, '').replace(/^顺子/, '');
    return `不是同花顺 · 花色相同，但${detail}`;
  }
  return `不是同花顺 · ${sortedRankLabels(normals)} 花色不同，点数也不连`;
}

function mismatchReason(cards, level, wanted, options) {
  switch (wanted) {
    case 'single': return singleReason(cards);
    case 'pair': return pairReason(cards, level);
    case 'triple': return tripleReason(cards, level);
    case 'fullhouse': return fullHouseReason(cards, level, options);
    case 'straight': return straightReason(cards, level, options);
    case 'tube': return tubeReason(cards, level, options);
    case 'plate': return plateReason(cards, level, options);
    case 'bomb': return bombReason(cards, level, options);
    case 'straightflush': return straightFlushReason(cards, level, options);
    default: return '这不是合法牌型';
  }
}

function currentName(combo) {
  if (!combo) return '牌';
  if (combo.type === 'tube') return '连对';
  return typeLabel(combo);
}

export function composeVerdict(cards, level, wanted, current) {
  const list = cards || [];
  if (!list.length) return { state: 'empty', text: '', canPlay: false, combo: null };
  const options = identify(list, level);
  if (!wanted) {
    const ev = evaluateSelection(list, level, current || null);
    if (!ev.ok) {
      const named = options.length ? describeCombo(bestInterpretation(options)) : '';
      const text = named ? `${named} · ${ev.reason}` : (ev.reason || '这不是合法牌型');
      return { state: 'bad', text: `「${text}」`, canPlay: false, combo: null };
    }
    return { state: 'ok', text: `「${describeCombo(ev.combo)} · 正确，可以出牌」`, canPlay: true, combo: ev.combo };
  }
  const matched = options.filter((option) => matchesWanted(option, wanted));
  if (!matched.length) {
    return {
      state: 'bad',
      text: `「${mismatchReason(list, level, wanted, options)}」`,
      canPlay: false,
      combo: null,
    };
  }
  const chosen = bestInterpretation(matched);
  const desc = describeCombo(chosen);
  if (current && !beats(chosen, current)) {
    return {
      state: 'warn',
      text: `「${desc} · 牌型正确，但压不过当前的${currentName(current)}」`,
      canPlay: false,
      combo: chosen,
    };
  }
  return { state: 'ok', text: `「${desc} · 正确，可以出牌」`, canPlay: true, combo: chosen };
}

export function chipTypeForCombo(combo) {
  if (!combo) return null;
  if (combo.type === 'jokerbomb') return 'bomb';
  if (TYPE_NAME[combo.type]) return combo.type;
  return null;
}
