import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import {
  RANKS,
  advanceLevel,
  beats,
  bestInterpretation,
  cardText,
  createDeck,
  evaluateSelection,
  generateCandidateSets,
  highestTributeCard,
  identify,
  isWild,
  naturalValue,
  pickReturnCard,
  planTribute,
  powerValue,
  shuffle,
  sortCards,
  arrangeGroups,
  upgradeSteps,
} from '../js/engine.js?v=8';
import { chooseMove } from '../js/ai.js?v=8';
import { straightPlanPenalty } from '../js/policy.js?v=8';
import { Match, unplayedPool } from '../js/controller.js?v=8';
import { cardMetrics, handLayout, twoRowLayout, ARRANGE } from '../js/ui.js?v=8';
import { arrangeHand, nextArrange, planCustomGroups } from '../js/arrange.js?v=8';
import {
  composeVerdict,
  fanHitIndex,
  isPortraitPhone,
  packedMetrics,
  portraitFanLayout,
  zoomCardWidth,
} from '../js/portrait.js?v=8';

const require = createRequire(import.meta.url);
require('../js/cards.js');
const { cardSVG, backSVG } = globalThis.GuanDanCards;

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log('ok', name);
  } catch (error) {
    failed += 1;
    console.error('FAIL', name, error);
  }
}

function take(deck, specs) {
  const used = new Set();
  return specs.map(([rank, suit, nth = 0]) => {
    const card = deck.filter((c) => c.rank === rank && c.suit === suit)[nth];
    if (!card || used.has(card.id)) throw new Error(`missing ${suit}${rank}#${nth}`);
    used.add(card.id);
    return card;
  });
}

const deck = createDeck();

check('deck', () => {
  assert.equal(deck.length, 108);
  assert.equal(new Set(deck.map((c) => c.id)).size, 108);
  assert.equal(deck.filter((c) => c.rank === 'BJ').length, 2);
  assert.equal(deck.filter((c) => c.rank === 'SJ').length, 2);
  assert.equal(deck.filter((c) => c.rank === 'J' && c.suit === 'S').length, 2);
});

check('power order', () => {
  const level = '5';
  const order = ['BJ', 'SJ', '5', 'A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '4', '3', '2'];
  for (let i = 0; i < order.length - 1; i++) {
    assert.ok(powerValue(order[i], level) > powerValue(order[i + 1], level));
  }
  assert.ok(powerValue('2', '2') > powerValue('A', '2'));
  assert.ok(powerValue('A', 'A') > powerValue('K', 'A'));
});

check('wild is heart level only', () => {
  const heart = deck.find((c) => c.rank === '7' && c.suit === 'H');
  const spade = deck.find((c) => c.rank === '7' && c.suit === 'S');
  assert.equal(isWild(heart, '7'), true);
  assert.equal(isWild(spade, '7'), false);
  assert.equal(isWild(heart, '8'), false);
});

check('singles pairs triples bombs', () => {
  const three = take(deck, [['3', 'S'], ['3', 'H'], ['3', 'C']]);
  assert.equal(identify(three, '2')[0].type, 'triple');
  const pair = take(deck, [['K', 'S'], ['K', 'D']]);
  assert.equal(identify(pair, '2')[0].type, 'pair');
  const four = take(deck, [['9', 'S'], ['9', 'H'], ['9', 'C'], ['9', 'D']]);
  assert.equal(identify(four, '2')[0].type, 'bomb');
  const mixedJokers = take(deck, [['SJ', 'J'], ['BJ', 'J']]);
  assert.equal(identify(mixedJokers, '2').length, 0);
  const jokers = deck.filter((c) => c.rank === 'SJ' || c.rank === 'BJ');
  assert.equal(identify(jokers, '2')[0].type, 'jokerbomb');
});

check('straights and wheel', () => {
  const wheel = take(deck, [['A', 'S'], ['2', 'D'], ['3', 'C'], ['4', 'S'], ['5', 'H']]);
  const low = identify(wheel, '9');
  assert.equal(low[0].type, 'straight');
  assert.equal(low[0].rank, naturalValue('5'));
  const next = take(deck, [['2', 'S'], ['3', 'D'], ['4', 'C'], ['5', 'S'], ['6', 'D']]);
  const six = identify(next, '9')[0];
  assert.equal(six.type, 'straight');
  assert.ok(beats(six, low[0]));
  const wrap = take(deck, [['J', 'S'], ['Q', 'D'], ['K', 'C'], ['A', 'S'], ['2', 'C']]);
  assert.equal(identify(wrap, '9').filter((c) => c.type === 'straight').length, 0);
  const broadway = take(deck, [['10', 'S'], ['J', 'D'], ['Q', 'C'], ['K', 'S'], ['A', 'D']]);
  assert.equal(identify(broadway, '9')[0].rank, naturalValue('A'));
  const gap = take(deck, [['3', 'S'], ['4', 'D'], ['5', 'C'], ['6', 'S'], ['8', 'D']]);
  assert.equal(identify(gap, '9').some((c) => c.type === 'straight'), false);
});

check('wild straight uses natural place', () => {
  const cards = take(deck, [['4', 'S'], ['5', 'C'], ['6', 'D'], ['7', 'S'], ['2', 'H']]);
  assert.equal(isWild(cards[4], '2'), true);
  const best = bestInterpretation(identify(cards, '2'));
  assert.equal(best.type, 'straight');
  assert.equal(best.rank, naturalValue('8'));
});

check('level pair beats ace', () => {
  const levelPair = take(deck, [['5', 'S'], ['5', 'C']]);
  const aces = take(deck, [['A', 'S'], ['A', 'D']]);
  assert.ok(beats(identify(levelPair, '5')[0], identify(aces, '5')[0]));
  const wilds = take(deck, [['5', 'H', 0], ['5', 'H', 1]]);
  const wildPair = identify(wilds, '5')[0];
  assert.equal(wildPair.type, 'pair');
  assert.ok(beats(wildPair, identify(aces, '5')[0]));
  const singleWild = identify([wilds[0]], '5')[0];
  const singleLevel = identify([levelPair[0]], '5')[0];
  assert.equal(beats(singleWild, singleLevel), false);
});

check('full house compares the triple', () => {
  const low = take(deck, [['3', 'S'], ['3', 'C'], ['3', 'D'], ['4', 'S'], ['4', 'C']]);
  const high = take(deck, [['A', 'S'], ['A', 'C'], ['A', 'D'], ['6', 'S'], ['6', 'C']]);
  assert.ok(beats(identify(high, '2')[0], identify(low, '2')[0]));
  const levelTrip = take(deck, [['8', 'S'], ['8', 'C'], ['8', 'D'], ['3', 'S'], ['3', 'C']]);
  assert.ok(beats(identify(levelTrip, '8')[0], identify(high, '8')[0]));
});

check('tube and plate', () => {
  const notPlate = take(deck, [['3', 'S'], ['3', 'H'], ['4', 'S'], ['4', 'H']]);
  assert.equal(identify(notPlate, '2').length, 0);
  const plate = take(deck, [['3', 'S'], ['3', 'H'], ['3', 'C'], ['4', 'S'], ['4', 'H'], ['4', 'C']]);
  assert.equal(identify(plate, '2')[0].type, 'plate');
  const tube = take(deck, [['3', 'S'], ['3', 'H'], ['4', 'S'], ['4', 'D'], ['5', 'C'], ['5', 'S']]);
  assert.equal(identify(tube, '2')[0].type, 'tube');
  const wheelPlate = take(deck, [['A', 'S'], ['A', 'C'], ['A', 'D'], ['2', 'S'], ['2', 'C'], ['2', 'D']]);
  const lowPlate = identify(wheelPlate, '9')[0];
  assert.equal(lowPlate.type, 'plate');
  assert.ok(beats(identify(plate, '9')[0], lowPlate));
});

check('bombs and straight flush', () => {
  const five = take(deck, [['3', 'S', 0], ['3', 'H', 0], ['3', 'C', 0], ['3', 'D', 0], ['3', 'S', 1]]);
  const six = take(deck, [['4', 'S', 0], ['4', 'H', 0], ['4', 'C', 0], ['4', 'D', 0], ['4', 'S', 1], ['4', 'H', 1]]);
  const flush = take(deck, [['10', 'S'], ['J', 'S'], ['Q', 'S'], ['K', 'S'], ['A', 'S']]);
  const four = take(deck, [['A', 'S'], ['A', 'H'], ['A', 'C'], ['A', 'D']]);
  const sf = identify(flush, '2')[0];
  assert.equal(sf.type, 'straightflush');
  assert.equal(sf.suit, 'S');
  assert.ok(beats(sf, identify(five, '2')[0]));
  assert.ok(beats(sf, identify(four, '2')[0]));
  assert.ok(beats(identify(six, '2')[0], sf));
  assert.ok(beats(identify(five, '2')[0], identify(four, '2')[0]));
  const heartFlush = take(deck, [['10', 'H'], ['J', 'H'], ['Q', 'H'], ['K', 'H'], ['A', 'H']]);
  assert.ok(beats(sf, identify(heartFlush, '2')[0]));
  const eight = deck.filter((c) => c.rank === '6');
  const rockets = deck.filter((c) => c.rank === 'BJ' || c.rank === 'SJ');
  assert.ok(beats(identify(rockets, '2')[0], identify(eight, '2')[0]));
  const normalStraight = take(deck, [['10', 'D'], ['J', 'C'], ['Q', 'D'], ['K', 'C'], ['A', 'D']]);
  assert.ok(beats(sf, identify(normalStraight, '2')[0]));
});

check('follow rules', () => {
  const pair = take(deck, [['7', 'S'], ['7', 'C']]);
  const bigger = take(deck, [['8', 'S'], ['8', 'C']]);
  const single = take(deck, [['K', 'S']]);
  const current = identify(pair, '2')[0];
  assert.equal(evaluateSelection(bigger, '2', current).ok, true);
  assert.equal(evaluateSelection(single, '2', current).ok, false);
  assert.equal(evaluateSelection(pair, '2', current).ok, false);
});

check('tribute helpers', () => {
  const hand = take(deck, [['BJ', 'J'], ['A', 'S'], ['2', 'H'], ['9', 'C'], ['K', 'D']]);
  assert.equal(highestTributeCard(hand, '2').rank, 'BJ');
  const noKing = take(deck, [['A', 'S'], ['2', 'H'], ['5', 'S'], ['3', 'D']]);
  assert.equal(highestTributeCard(noKing, '2').rank, 'A');
  assert.equal(pickReturnCard(hand).rank, '9');
  const faces = take(deck, [['K', 'S'], ['SJ', 'J'], ['A', 'D']]);
  assert.equal(isWild(faces[0], '2'), false);
  assert.ok(['K', 'A'].includes(pickReturnCard(faces).rank));
});

check('plan tribute and resist', () => {
  const hands = [0, 1, 2, 3].map(() => []);
  hands[3] = take(deck, [['BJ', 'J', 0], ['9', 'S'], ['3', 'C']]);
  hands[2] = take(deck, [['A', 'S'], ['4', 'D']]);
  hands[0] = take(deck, [['5', 'S']]);
  hands[1] = take(deck, [['6', 'S']]);
  const single = planTribute(hands, [0, 1, 2, 3], '2');
  assert.equal(single.resist, false);
  assert.equal(single.gives.length, 1);
  assert.equal(single.gives[0].from, 3);
  assert.equal(single.gives[0].to, 0);
  assert.equal(single.gives[0].card.rank, 'BJ');
  const both = [0, 1, 2, 3].map(() => []);
  both[1] = take(deck, [['BJ', 'J', 0], ['8', 'S']]);
  both[3] = take(deck, [['BJ', 'J', 1], ['7', 'S']]);
  both[0] = take(deck, [['3', 'S']]);
  both[2] = take(deck, [['4', 'S']]);
  const resist = planTribute(both, [0, 1, 2, 3], '2');
  assert.equal(resist.resist, true);
  const dbl = [0, 1, 2, 3].map(() => []);
  dbl[1] = take(deck, [['K', 'S'], ['4', 'C']]);
  dbl[3] = take(deck, [['A', 'S'], ['3', 'D']]);
  dbl[0] = take(deck, [['5', 'C']]);
  dbl[2] = take(deck, [['6', 'C']]);
  const doubled = planTribute(dbl, [0, 2, 1, 3], '2');
  assert.equal(doubled.gives.length, 2);
  assert.equal(doubled.gives[0].to, 0);
  assert.equal(doubled.gives[0].card.rank, 'A');
  assert.equal(doubled.gives[1].to, 2);
});

check('upgrade ladder', () => {
  assert.equal(upgradeSteps([0, 2, 1, 3]), 3);
  assert.equal(upgradeSteps([0, 1, 2, 3]), 2);
  assert.equal(upgradeSteps([0, 1, 3, 2]), 1);
  assert.equal(advanceLevel('2', 3), '5');
  assert.equal(advanceLevel('Q', 3), 'A');
  assert.equal(advanceLevel('A', 1), 'A');
  assert.deepEqual(RANKS[0], '2');
  assert.equal(RANKS[RANKS.length - 1], 'A');
});

check('scripted ranks and wind', () => {
  const fresh = createDeck();
  const m = new Match();
  m.loadPosition({
    hands: [
      take(fresh, [['3', 'S']]),
      take(fresh, [['9', 'S'], ['9', 'C']]),
      take(fresh, [['5', 'S']]),
      take(fresh, [['8', 'S'], ['8', 'C']]),
    ],
  });
  assert.equal(m.play(0, m.seats[0].hand).ok, true);
  assert.equal(m.pass(1).ok, true);
  assert.equal(m.pass(2).ok, true);
  assert.equal(m.pass(3).ok, true);
  assert.equal(m.turn, 2);
  assert.equal(m.trick.combo, null);
  assert.ok(m.message.includes('接风'));

  const m2 = new Match();
  const d2 = createDeck();
  m2.loadPosition({
    hands: [
      take(d2, [['3', 'D']]),
      take(d2, [['4', 'D'], ['9', 'D']]),
      take(d2, [['5', 'D']]),
      take(d2, [['8', 'D'], ['7', 'D']]),
    ],
  });
  m2.play(0, [m2.seats[0].hand[0]]);
  m2.pass(1);
  assert.equal(m2.play(2, [m2.seats[2].hand[0]]).ok, true);
  assert.equal(m2.phase, 'handEnd');
  assert.equal(m2.lastSteps, 3);
  assert.equal(m2.teamLevel[0], '5');

  const m3 = new Match();
  const d3 = createDeck();
  m3.loadPosition({
    hands: [
      take(d3, [['3', 'C']]),
      take(d3, [['4', 'C']]),
      take(d3, [['6', 'C']]),
      take(d3, [['8', 'C'], ['9', 'C']]),
    ],
  });
  m3.play(0, m3.seats[0].hand.slice());
  m3.play(1, m3.seats[1].hand.slice());
  m3.play(2, m3.seats[2].hand.slice());
  assert.equal(m3.phase, 'handEnd');
  assert.equal(m3.lastSteps, 2);
  assert.equal(m3.teamLevel[0], '4');
  assert.deepEqual(m3.lastOrder, [0, 1, 2, 3]);
});

check('pass A and resist flow', () => {
  const m = new Match();
  m.loadPosition({ hands: [[], [], [], []].map(() => [createDeck()[0]]), teamLevel: ['A', 'K'] });
  m.finishOrder = [0, 2, 1, 3];
  m.endHand();
  assert.equal(m.phase, 'matchEnd');
  assert.equal(m.winner, 0);

  const stay = new Match();
  stay.loadPosition({ hands: [[], [], [], []].map(() => []), teamLevel: ['A', '5'] });
  stay.seats.forEach((s) => { s.hand = [{ id: s.id, rank: '9', suit: 'S', deck: 0 }]; });
  stay.finishOrder = [0, 1, 3, 2];
  stay.endHand();
  assert.equal(stay.phase, 'handEnd');
  assert.equal(stay.teamLevel[0], 'A');
  assert.equal(stay.level, 'A');

  const tribute = new Match();
  const d = createDeck();
  tribute.loadPosition({
    hands: [
      take(d, [['5', 'S'], ['K', 'D']]),
      [d.find((c) => c.rank === 'BJ' && c.deck === 0), ...take(d, [['8', 'S']])],
      take(d, [['6', 'S'], ['6', 'C']]),
      [d.find((c) => c.rank === 'BJ' && c.deck === 1), ...take(d, [['7', 'S']])],
    ],
  });
  tribute.lastOrder = [0, 1, 2, 3];
  tribute.openTribute();
  assert.equal(tribute.phase, 'tributeReveal');
  assert.equal(tribute.tribute.resist, true);
});

check('tribute exchange keeps 27 cards', () => {
  const cards = createDeck();
  const bosses = cards.filter((c) => c.rank === 'BJ');
  const rest = cards.filter((c) => c.rank !== 'BJ');
  const hands = [[...bosses], [], [], []];
  let seat = 0;
  for (const card of rest) {
    while (hands[seat].length >= 27) seat += 1;
    hands[seat].push(card);
  }
  assert.ok(hands.every((h) => h.length === 27));
  const m = new Match();
  m.loadPosition({ hands, level: '2' });
  m.lastOrder = [0, 1, 2, 3];
  m.openTribute();
  assert.equal(m.tribute.resist, false);
  assert.equal(m.phase, 'tributeChoice');
  assert.equal(m.tribute.waiting.kind, 'return');
  assert.equal(m.seats[0].hand.length, 28);
  assert.equal(m.seats[3].hand.length, 26);
  const card = pickReturnCard(m.seats[0].hand);
  assert.equal(m.confirmReturn(card.id).ok, true);
  assert.equal(m.phase, 'tributeReveal');
  assert.ok(m.seats.every((s) => s.hand.length === 27));
  m.ackTribute();
  assert.equal(m.phase, 'play');
  assert.equal(m.turn, 3);
});

check('generated sets are legal', () => {
  const hand = createDeck().slice(0, 27);
  for (const level of ['2', '10', 'A']) {
    for (const cards of generateCandidateSets(hand, level)) {
      const found = identify(cards, level);
      assert.ok(found.length, cardText(cards[0]));
    }
  }
});

check('ai plays legal hands', () => {
  const m = new Match();
  m.startMatch();
  let hands = 0;
  let guard = 0;
  while (hands < 6 && guard++ < 8000 && m.phase !== 'matchEnd') {
    if (m.phase === 'play') {
      const seat = m.turn;
      const before = m.seats.reduce((n, s) => n + s.hand.length, 0);
      const move = chooseMove(m.seats[seat].hand, m.level, m.trick.combo, m.aiContext(seat));
      if (!m.trick.combo) assert.ok(move, 'lead must play');
      const res = move ? m.play(seat, move.cards) : m.pass(seat);
      assert.equal(res.ok, true, res.reason);
      const after = m.seats.reduce((n, s) => n + s.hand.length, 0);
      if (move) assert.equal(before - after, move.cards.length);
      else assert.equal(before, after);
    } else if (m.phase === 'handEnd') {
      hands += 1;
      const ranks = m.lastOrder.map((id) => m.seats[id].finish);
      assert.deepEqual(ranks, [1, 2, 3, 4]);
      m.continueAfterHand();
    } else if (m.phase === 'tributeChoice') {
      const waiting = m.tribute.waiting;
      if (waiting.kind === 'give') m.confirmGive();
      else {
        const card = pickReturnCard(m.seats[0].hand);
        assert.equal(m.confirmReturn(card.id).ok, true);
      }
    } else if (m.phase === 'tributeReveal') {
      assert.ok(m.seats.every((s) => s.hand.length === 27));
      m.ackTribute();
    } else {
      throw new Error(m.phase);
    }
  }
  assert.ok(hands >= 4, `only ${hands} hands`);
});

check('card art marks level and wild', () => {
  const jack = cardSVG('J', 'S', { width: 60 });
  assert.ok(jack.includes('<svg'));
  assert.equal(jack.includes('小王'), false);
  const small = cardSVG('SJ');
  assert.ok(small.includes('小 王'));
  const big = cardSVG('BJ');
  assert.ok(big.includes('大 王'));
  const level = cardSVG('2', 'S', { level: true, width: 60 });
  assert.ok(level.includes('级'));
  const wild = cardSVG('2', 'H', { level: true, wild: true, width: 60 });
  assert.ok(wild.includes('配'));
  assert.ok(wild.includes('#F6E4D0') || wild.includes('#f6e4d0'));
  assert.equal(wild.includes('级'), false);
  const heart = cardSVG('A', 'H', { width: 66 });
  assert.ok(heart.toLowerCase().includes('#8c3a3a'));
  assert.ok(jack.toLowerCase().includes('#1c1c1c'));
  assert.equal(jack.includes('兔'), false);
  assert.equal(backSVG({ width: 30 }).includes('兔'), false);
  assert.ok(backSVG({ width: 30 }).includes('<svg'));
});

check('phone hand step', () => {
  const layout = handLayout(390, 27, 60, 0);
  assert.ok(layout.step > 11.5 && layout.step < 12.5, layout.step);
  assert.ok(layout.offset + layout.total <= 391);
  assert.equal(layout.cw, 60);
});

check('two row hand splits 27 into 14 and 13', () => {
  const phone = twoRowLayout({ width: 390, height: 844, n: 27 });
  const land = twoRowLayout({ width: 844, height: 390, n: 27 });
  const desk = twoRowLayout({ width: 1280, height: 800, n: 27 });
  const after = twoRowLayout({ width: 1280, height: 800, n: 26 });
  const few = twoRowLayout({ width: 390, height: 844, n: 10 });
  for (const layout of [phone, land, desk]) {
    assert.equal(layout.top, 14);
    assert.equal(layout.bottom, 13);
    assert.ok(layout.cw * 14 + layout.gap * 13 <= (layout === desk ? 1280 : layout === land ? 844 : 390));
  }
  assert.equal(after.top, 13);
  assert.equal(after.bottom, 13);
  assert.equal(few.bottom, 0);
  assert.equal(few.rows, 1);
  const lone = twoRowLayout({ width: 1280, height: 800, n: 1 });
  const lonePhone = twoRowLayout({ width: 390, height: 844, n: 1 });
  assert.ok(lone.ch <= 140, lone.ch);
  assert.ok(lonePhone.ch <= 110, lonePhone.ch);
  assert.equal(desk.top, 14);
});

check('card sizes', () => {
  const phone = cardMetrics(390);
  const desk = cardMetrics(1200);
  assert.ok(phone.hand >= 64 && phone.hand <= 68);
  assert.ok(phone.play >= 40 && phone.play <= 44);
  assert.ok(desk.hand >= 88 && desk.hand <= 96);
  assert.ok(desk.play >= 56 && desk.play <= 60);
});

check('unplayed pool counts hands only', () => {
  const hands = [deck.slice(0, 27), deck.slice(27, 54), deck.slice(54, 81), deck.slice(81, 108)];
  const full = unplayedPool(hands, '2');
  assert.equal(full.total, 108);
  assert.equal(full.suits.S, 26);
  assert.equal(full.ranks['2'], 8);
  assert.equal(full.sj, 2);
  assert.equal(full.bj, 2);
  assert.equal(full.wild, 2);
  assert.equal(full.levelCount, 8);
  const played = hands[1][0];
  const next = hands.map((hand, i) => (i === 1 ? hand.filter((c) => c.id !== played.id) : hand.slice()));
  const left = unplayedPool(next, '2');
  assert.equal(left.total, 107);
  assert.equal(left.ranks[played.rank], played.rank === 'SJ' || played.rank === 'BJ' ? 8 : 7);
  assert.equal(left.seatCounts[1], 26);
});

check('easy follows small, sharp yields to partner', () => {
  const cards = createDeck();
  const pair5 = take(cards, [['5', 'S'], ['5', 'H']]);
  const pair4 = take(cards, [['4', 'S'], ['4', 'C']]);
  const filler = take(cards, [['9', 'D'], ['K', 'C']]);
  const hand = [...pair5, ...filler];
  const current = identify(pair4, '2')[0];
  const base = { partnerWinning: true, opponentMin: 12, partnerLen: 20, played: [], knownElsewhere: [] };
  const easy = chooseMove(hand, '2', current, { ...base, difficulty: 'easy' });
  const balanced = chooseMove(hand, '2', current, { ...base, difficulty: 'balanced' });
  const sharp = chooseMove(hand, '2', current, { ...base, difficulty: 'sharp' });
  assert.ok(easy);
  assert.equal(easy.type, 'pair');
  assert.equal(balanced, null);
  assert.equal(sharp, null);
  const intercept = chooseMove(hand, '2', current, { ...base, difficulty: 'sharp', partnerWinning: false, opponentMin: 1 });
  assert.ok(intercept);
  assert.equal(intercept.type, 'pair');
});

check('sharp feeds a one-card partner', () => {
  const cards = createDeck();
  const hand = take(cards, [['3', 'S'], ['3', 'H'], ['8', 'D'], ['Q', 'C']]);
  const move = chooseMove(hand, '2', null, {
    difficulty: 'sharp',
    partnerWinning: false,
    opponentMin: 12,
    partnerLen: 1,
    played: [],
    knownElsewhere: [],
  });
  assert.equal(move.type, 'single');
  assert.equal(move.cards[0].rank, '3');
});

check('public cards are remembered without exposing hands', () => {
  const m = new Match();
  const cards = createDeck();
  m.setDifficulty('sharp');
  m.loadPosition({
    hands: [
      take(cards, [['6', 'S'], ['7', 'D']]),
      take(cards, [['8', 'C'], ['9', 'H']]),
      take(cards, [['10', 'S'], ['J', 'D']]),
      take(cards, [['Q', 'C'], ['K', 'S']]),
    ],
    level: '2',
    turn: 0,
  });
  const lead = m.seats[0].hand[0];
  assert.equal(m.play(0, [lead]).ok, true);
  const ctx = m.aiContext(1);
  assert.equal(ctx.difficulty, 'sharp');
  assert.ok(ctx.played.some((c) => c.id === lead.id));
  assert.equal('hands' in ctx, false);
  assert.equal(m.seats[2].hand.length, 2);
});

check('easy, balanced and sharp stay legal', () => {
  for (const difficulty of ['easy', 'balanced', 'sharp']) {
    const m = new Match();
    m.setDifficulty(difficulty);
    m.startMatch();
    let guard = 0;
    while (m.phase === 'play' && guard++ < 48) {
      const seat = m.turn;
      const move = chooseMove(m.seats[seat].hand, m.level, m.trick.combo, m.aiContext(seat));
      if (!m.trick.combo) assert.ok(move, difficulty);
      const res = move ? m.play(seat, move.cards) : m.pass(seat);
      assert.equal(res.ok, true, `${difficulty} ${res.reason}`);
    }
  }
});

check('portrait phone gate leaves landscape on two rows', () => {
  assert.equal(isPortraitPhone(390, 844), true);
  assert.equal(isPortraitPhone(600, 800), true);
  assert.equal(isPortraitPhone(844, 390), false);
  assert.equal(isPortraitPhone(667, 375), false);
  assert.equal(isPortraitPhone(1280, 800), false);
  assert.equal(isPortraitPhone(601, 900), false);
  const wide = twoRowLayout({ width: 844, height: 390, n: 27 });
  assert.equal(wide.top, 14);
  assert.equal(wide.bottom, 13);
});

check('portrait fan fits 27 cards without scroll', () => {
  const fan = portraitFanLayout(390, 27);
  assert.ok(fan.cw >= 50 && fan.cw <= 56, fan.cw);
  assert.ok(fan.ch >= 72 && fan.ch <= 82, fan.ch);
  assert.ok(fan.step >= 11 && fan.step < fan.cw, fan.step);
  assert.ok(fan.offset + fan.total <= fan.avail + 0.01, fan);
  assert.ok((fan.step / fan.cw) * 140 >= 21, '10 peek');
  const narrow = portraitFanLayout(320, 27);
  assert.ok(narrow.offset + narrow.total <= narrow.avail + 0.01);
  assert.ok((narrow.step / narrow.cw) * 140 >= 21);
  const late = portraitFanLayout(390, 6);
  assert.ok(late.step > fan.step);
  assert.equal(late.cw, 54);
  const one = zoomCardWidth(390, 1);
  const many = zoomCardWidth(390, 8);
  assert.equal(one.cw, 78);
  assert.ok(many.cw < one.cw);
  assert.ok(many.cw * 8 + many.gap * 7 <= 390);
  for (const [maxW, n, target] of [[360, 8, 46], [100, 6, 18], [390, 1, 46]]) {
    const row = packedMetrics(maxW, n, target);
    assert.ok(row.total <= row.room + 0.01, row);
  }
});

check('fan hit prefers the visible strip and magnet', () => {
  const fan = portraitFanLayout(390, 27);
  const { step, offset, cw, magnet } = fan;
  assert.equal(fanHitIndex(offset + 1, 27, step, offset, cw, magnet), 0);
  const boundary = offset + step;
  assert.equal(fanHitIndex(boundary + 1, 27, step, offset, cw, magnet), 1);
  assert.equal(fanHitIndex(boundary - 1, 27, step, offset, cw, magnet), 0);
  assert.equal(fanHitIndex(offset - 2, 27, step, offset, cw, magnet), 0);
  const lastLeft = offset + 26 * step;
  assert.equal(fanHitIndex(lastLeft + cw - 2, 27, step, offset, cw, magnet), 26);
  assert.equal(fanHitIndex(boundary + 1, 27, step, offset, cw, magnet, [0], { y: 40, cardTop: 18 }), 1);
  assert.equal(fanHitIndex(boundary + 1, 27, step, offset, cw, magnet, [0], { y: 4, cardTop: 18 }), 0);
  assert.equal(fanHitIndex(-40, 27, step, offset, cw, magnet), -1);
});

check('compose straight gap and missing rank', () => {
  const gap = take(deck, [['5', 'S'], ['6', 'H'], ['7', 'C'], ['8', 'D'], ['10', 'S']]);
  const broken = composeVerdict(gap, '9', 'straight', null);
  assert.equal(broken.canPlay, false);
  assert.equal(broken.state, 'bad');
  assert.ok(broken.text.includes('不是顺子'));
  assert.ok(broken.text.includes('5-6-7-8-10'));
  assert.ok(broken.text.includes('中间断了'), broken.text);
  const short = take(deck, [['5', 'C'], ['6', 'D'], ['7', 'S'], ['8', 'C']]);
  const miss = composeVerdict(short, '9', 'straight', null);
  assert.equal(miss.canPlay, false);
  assert.ok(miss.text.includes('顺子至少 5 张连续点数'), miss.text);
  assert.ok(miss.text.includes('缺 9'), miss.text);
  const ok = take(deck, [['5', 'D'], ['6', 'S'], ['7', 'H'], ['8', 'S'], ['9', 'C']]);
  const good = composeVerdict(ok, '2', 'straight', null);
  assert.equal(good.canPlay, true);
  assert.equal(good.state, 'ok');
  assert.ok(good.text.includes('顺子 5-9'), good.text);
  assert.ok(good.text.includes('正确，可以出牌'), good.text);
});

check('compose types, wilds and must beat', () => {
  const pair = take(deck, [['4', 'S'], ['4', 'C']]);
  const ok = composeVerdict(pair, '2', 'pair', null);
  assert.equal(ok.canPlay, true);
  assert.ok(ok.text.includes('对子 4'), ok.text);
  const bigger = identify(take(deck, [['8', 'S'], ['8', 'D']]), '2')[0];
  const lose = composeVerdict(pair, '2', 'pair', bigger);
  assert.equal(lose.canPlay, false);
  assert.equal(lose.state, 'warn');
  assert.ok(lose.text.includes('压不过'), lose.text);
  const mixed = composeVerdict(pair, '2', 'straight', null);
  assert.equal(mixed.canPlay, false);
  assert.ok(mixed.text.includes('不是顺子'), mixed.text);
  const trips = take(deck, [['K', 'S'], ['K', 'H'], ['K', 'C']]);
  assert.equal(composeVerdict(trips, '2', 'triple', null).canPlay, true);
  const full = take(deck, [['Q', 'S'], ['Q', 'H'], ['Q', 'C'], ['3', 'S'], ['3', 'D']]);
  const house = composeVerdict(full, '2', 'fullhouse', null);
  assert.equal(house.canPlay, true);
  assert.ok(house.text.includes('三带二'), house.text);
  const bomb = take(deck, [['9', 'S', 1], ['9', 'H', 1], ['9', 'C', 1], ['9', 'D', 1]]);
  assert.equal(composeVerdict(bomb, '2', 'bomb', null).canPlay, true);
  const tube = take(deck, [['5', 'S', 1], ['5', 'C', 1], ['6', 'S', 1], ['6', 'C', 1], ['7', 'S', 1], ['7', 'C', 1]]);
  const tubeHit = composeVerdict(tube, '9', 'tube', null);
  assert.equal(tubeHit.canPlay, true, tubeHit.text);
  assert.ok(tubeHit.text.includes('连对'), tubeHit.text);
  const tubeGap = take(deck, [['5', 'D', 1], ['5', 'H', 1], ['6', 'D', 1], ['6', 'H', 1], ['8', 'S', 1], ['8', 'C', 1]]);
  const tubeBad = composeVerdict(tubeGap, '9', 'tube', null);
  assert.equal(tubeBad.canPlay, false);
  assert.ok(tubeBad.text.includes('中间断了'), tubeBad.text);
  const plate = take(deck, [['8', 'S'], ['8', 'H'], ['8', 'C'], ['9', 'S'], ['9', 'H'], ['9', 'C']]);
  const plateHit = composeVerdict(plate, '2', 'plate', null);
  assert.equal(plateHit.canPlay, true, plateHit.text);
  assert.ok(plateHit.text.includes('钢板'), plateHit.text);
  const flush = take(deck, [['3', 'S'], ['4', 'S'], ['5', 'S'], ['6', 'S'], ['7', 'S']]);
  const flushHit = composeVerdict(flush, '9', 'straightflush', null);
  assert.equal(flushHit.canPlay, true, flushHit.text);
  assert.ok(flushHit.text.includes('同花顺'), flushHit.text);
  const notFlush = composeVerdict(flush, '9', 'straight', null);
  assert.equal(notFlush.canPlay, false);
  assert.ok(notFlush.text.includes('同花顺'), notFlush.text);
  const wildStraight = take(deck, [['4', 'D'], ['5', 'D'], ['6', 'C'], ['7', 'D'], ['2', 'H', 1]]);
  const wild = composeVerdict(wildStraight, '2', 'straight', null);
  assert.equal(wild.canPlay, true, wild.text);
  assert.equal(composeVerdict([], '2', 'straight', null).state, 'empty');
  const auto = composeVerdict(pair, '2', null, null);
  assert.equal(auto.canPlay, true);
  assert.ok(auto.text.includes('对子'), auto.text);
});

function policyCtx(over = {}) {
  const lengths = over.lengths || [20, 20, 20, 20];
  return {
    difficulty: 'sharp',
    seat: 0,
    partner: 2,
    downstream: 1,
    upstream: 3,
    lengths,
    myLen: lengths[0],
    partnerLen: lengths[2],
    opponentMin: Math.min(...[lengths[1], lengths[3]].filter((n) => n > 0), 99),
    partnerWinning: false,
    headDecided: false,
    headSeat: null,
    trickWinner: null,
    played: [],
    knownElsewhere: [],
    finishes: [null, null, null, null],
    ...over,
  };
}

function dealt(specs) {
  return take(createDeck(), specs);
}

check('mnemonic: stingy wild, unclear pair, straight stays at five', () => {
  for (const difficulty of ['balanced', 'sharp']) {
    const hand = dealt([
      ['8', 'S'], ['8', 'C'], ['8', 'D'],
      ['2', 'H'],
      ['4', 'S'], ['5', 'C'], ['6', 'D'], ['7', 'S'],
      ['9', 'S'], ['9', 'C'],
      ['J', 'D'],
    ]);
    const lead = chooseMove(hand, '2', null, policyCtx({ difficulty, myLen: hand.length }));
    assert.equal(lead.type, 'pair', difficulty);
    assert.ok(lead.cards.every((c) => c.rank === '9'), difficulty);
    assert.equal(lead.cards.some((c) => c.rank === '2' && c.suit === 'H'), false);

    const followHand = dealt([
      ['8', 'S'], ['8', 'C'], ['8', 'D'],
      ['2', 'H'],
      ['4', 'S'], ['4', 'C'],
      ['9', 'D'], ['K', 'S'],
    ]);
    const pair3 = identify(dealt([['3', 'S'], ['3', 'C']]), '2')[0];
    const beat = chooseMove(followHand, '2', pair3, policyCtx({
      difficulty,
      trickWinner: 1,
      lengths: [followHand.length, 18, 18, 18],
    }));
    assert.equal(beat.type, 'pair', difficulty);
    assert.equal(beat.cards.some((c) => c.suit === 'H' && c.rank === '2'), false);

    const seedOnly = dealt([
      ['7', 'S'], ['7', 'C'], ['7', 'D'],
      ['2', 'H'],
      ['5', 'D'], ['J', 'C'], ['Q', 'S'], ['K', 'D'],
    ]);
    const passed = chooseMove(seedOnly, '2', pair3, policyCtx({
      difficulty,
      trickWinner: 1,
      lengths: [seedOnly.length, 18, 18, 18],
    }));
    assert.equal(passed, null, difficulty);
  }
  const six = { type: 'straight', cards: [1, 2, 3, 4, 5, 6], rank: 8 };
  const five = { type: 'straight', cards: [1, 2, 3, 4, 5], rank: 7 };
  assert.ok(straightPlanPenalty(six) > straightPlanPenalty(five));
  assert.equal(straightPlanPenalty(six, { finishing: true }), 0);
  const run = createDeck();
  const long = take(run, [
    ['3', 'S'], ['4', 'D'], ['5', 'C'], ['6', 'S'], ['7', 'D'], ['8', 'C'],
    ['J', 'S'], ['J', 'C'],
  ]);
  const planned = chooseMove(long, '2', null, policyCtx());
  assert.equal(planned.type, 'pair');
  assert.ok(planned.cards.length <= 5);
  assert.notEqual(planned.type === 'straight' && planned.cards.length > 5, true);
});

check('mnemonic: bomb a threatening straight, not a teammate going out', () => {
  for (const difficulty of ['balanced', 'sharp']) {
    const straight = identify(dealt([['8', 'S'], ['9', 'D'], ['10', 'C'], ['J', 'S'], ['Q', 'D']]), '2')[0];
    const bombHand = () => dealt([['6', 'S'], ['6', 'H'], ['6', 'C'], ['6', 'D'], ['3', 'S'], ['4', 'D'], ['K', 'S']]);
    const fire = chooseMove(bombHand(), '2', straight, policyCtx({
      difficulty,
      trickWinner: 1,
      lengths: [12, 2, 16, 16],
    }));
    assert.equal(fire.type, 'bomb', difficulty);
    const quiet = chooseMove(bombHand(), '2', straight, policyCtx({
      difficulty,
      trickWinner: 1,
      lengths: [12, 18, 16, 16],
    }));
    assert.equal(quiet, null, difficulty);
    const spare = chooseMove(bombHand(), '2', straight, policyCtx({
      difficulty,
      partnerWinning: true,
      trickWinner: 2,
      lengths: [12, 16, 1, 16],
      partnerLen: 1,
    }));
    assert.equal(spare, null, difficulty);
  }
});

check('mnemonic: 保一争二 feeds partner once head is decided', () => {
  for (const difficulty of ['balanced', 'sharp']) {
    const strong = () => dealt([
      ['8', 'S'], ['8', 'H'], ['8', 'C'], ['8', 'D'],
      ['4', 'S'], ['4', 'C'],
      ['3', 'D'], ['9', 'S'], ['K', 'H'],
    ]);
    const chase = chooseMove(strong(), '2', null, policyCtx({
      difficulty,
      headDecided: false,
      lengths: [9, 12, 4, 12],
    }));
    assert.equal(chase.type, 'single', difficulty);
    assert.equal(chase.cards[0].rank, '3');
    const help = chooseMove(strong(), '2', null, policyCtx({
      difficulty,
      headDecided: true,
      headSeat: 1,
      lengths: [9, 12, 4, 12],
    }));
    assert.equal(help.type, 'pair', difficulty);
    assert.ok(help.cards.every((c) => c.rank === '4'));
  }
});

check('mnemonic: remaining counts top a single, bomb five, pair against seven-eight', () => {
  for (const difficulty of ['balanced', 'sharp']) {
    const single5 = identify(dealt([['5', 'S']]), '2')[0];
    const toppers = dealt([['4', 'D'], ['7', 'S'], ['K', 'H'], ['9', 'S'], ['9', 'C'], ['3', 'D'], ['J', 'S']]);
    const top = chooseMove(toppers, '2', single5, policyCtx({
      difficulty,
      trickWinner: 1,
      lengths: [10, 1, 18, 16],
    }));
    assert.equal(top.type, 'single', difficulty);
    assert.equal(top.cards[0].rank, 'K');

    const house = identify(dealt([['3', 'S'], ['3', 'H'], ['3', 'C'], ['4', 'S'], ['4', 'H']]), '2')[0];
    const armed = dealt([['6', 'S'], ['6', 'H'], ['6', 'C'], ['6', 'D'], ['8', 'D'], ['Q', 'S'], ['K', 'C']]);
    const boom = chooseMove(armed, '2', house, policyCtx({
      difficulty,
      trickWinner: 1,
      lengths: [10, 0, 18, 16],
    }));
    assert.equal(boom.type, 'bomb', difficulty);

    const holding = dealt([['7', 'S'], ['7', 'H'], ['7', 'C'], ['7', 'D'], ['4', 'C'], ['4', 'D'], ['3', 'H'], ['9', 'D']]);
    const probe = chooseMove(holding, '2', null, policyCtx({
      difficulty,
      lengths: [10, 5, 18, 16],
    }));
    assert.equal(probe.type, 'pair', difficulty);
    assert.notEqual(probe.type, 'bomb');

    const tube = identify(dealt([
      ['3', 'S'], ['3', 'D'], ['4', 'S'], ['4', 'D'], ['5', 'S'], ['5', 'D'],
    ]), '9')[0];
    assert.equal(tube.type, 'tube');
    const stopper = dealt([['9', 'S'], ['9', 'H'], ['9', 'C'], ['9', 'D'], ['8', 'S'], ['Q', 'D'], ['K', 'D']]);
    const answer = chooseMove(stopper, '9', tube, policyCtx({
      difficulty,
      trickWinner: 3,
      lengths: [12, 16, 18, 2],
    }));
    assert.equal(answer.type, 'bomb', difficulty);

    const splitter = dealt([
      ['8', 'S', 1], ['8', 'H', 1], ['8', 'C', 1], ['8', 'D', 1],
      ['3', 'C'], ['4', 'H'], ['5', 'H'], ['6', 'C'], ['7', 'H'],
      ['9', 'H'], ['9', 'C'],
    ]);
    const pairs = chooseMove(splitter, '2', null, policyCtx({
      difficulty,
      lengths: [14, 8, 18, 16],
    }));
    assert.equal(pairs.type, 'pair', difficulty);
    assert.ok(pairs.cards.every((c) => c.rank === '9'));
  }
});

check('mnemonic: upstream single is topped, memory saves a dead ace pair', () => {
  const single4 = identify(dealt([['4', 'S']]), '2')[0];
  const hand = dealt([['6', 'D'], ['8', 'C'], ['K', 'S'], ['9', 'S'], ['9', 'H'], ['3', 'C']]);
  const topped = chooseMove(hand, '2', single4, policyCtx({
    trickWinner: 3,
    lengths: [12, 16, 16, 16],
  }));
  assert.equal(topped.type, 'single');
  assert.equal(topped.cards[0].rank, 'K');

  const memoryHand = dealt([
    ['2', 'S'], ['2', 'C'],
    ['3', 'S'], ['4', 'C'], ['5', 'D'], ['6', 'S'], ['7', 'C'], ['8', 'D'],
    ['9', 'C'], ['10', 'S'], ['J', 'H'], ['Q', 'C'], ['K', 'D'], ['A', 'S'],
  ]);
  const pairA = identify(dealt([['A', 'C'], ['A', 'D']]), '2')[0];
  const played = [];
  for (const rank of ['SJ', 'BJ']) {
    played.push({ id: played.length + 1, rank, suit: 'J', deck: 0 });
    played.push({ id: played.length + 1, rank, suit: 'J', deck: 1 });
  }
  for (const suit of ['S', 'H', 'C', 'D']) {
    played.push({ id: played.length + 80, rank: '2', suit, deck: 1 });
  }
  played.push({ id: 90, rank: '2', suit: 'H', deck: 0 }, { id: 91, rank: '2', suit: 'D', deck: 0 });
  const base = {
    trickWinner: 1,
    lengths: [memoryHand.length, 20, 20, 20],
    played,
    knownElsewhere: [],
  };
  const sharp = chooseMove(memoryHand, '2', pairA, policyCtx({ ...base, difficulty: 'sharp' }));
  const balanced = chooseMove(memoryHand, '2', pairA, policyCtx({ ...base, difficulty: 'balanced' }));
  assert.equal(sharp, null);
  assert.equal(balanced.type, 'pair');
  assert.ok(balanced.cards.every((c) => c.rank === '2'));
});

check('fan ten stays in the left peek', () => {
  const ten = cardSVG('10', 'H', { fan: true, width: 54, level: true });
  assert.ok(ten.includes('textLength="18"'), ten);
  assert.ok(ten.includes('级'));
  assert.ok(ten.includes('translate(13 74)'));
  assert.equal(ten.includes('translate(118'), false);
  const wild = cardSVG('2', 'H', { fan: true, wild: true, width: 54 });
  assert.ok(wild.includes('配'));
  assert.ok(wild.includes('translate(13 74)'));
  const plain = cardSVG('10', 'S', { width: 54 });
  assert.ok(plain.includes('textLength="26"'));
  assert.ok(plain.includes('translate(118 78)') === false || plain.includes('级') === false);
});

function blocks(items) {
  const out = [];
  let cur = [];
  for (const item of items) {
    if (item.gap && cur.length) {
      out.push(cur);
      cur = [];
    }
    cur.push(item.card);
  }
  if (cur.length) out.push(cur);
  return out;
}

function sameIds(cards, ids) {
  const got = cards.map((card) => card.id).sort((a, b) => a - b);
  const want = ids.slice().sort((a, b) => a - b);
  assert.deepEqual(got, want);
}

function covers(hand, items) {
  sameIds(items.map((item) => item.card), hand.map((card) => card.id));
}

function blockOf(items, ids) {
  const want = new Set(ids);
  return blocks(items).find((block) => block.length === want.size && block.every((card) => want.has(card.id)));
}

check('arrange buttons are the three new modes', () => {
  assert.deepEqual(Object.keys(ARRANGE), ['rank', 'flush', 'hands']);
  assert.deepEqual(Object.values(ARRANGE).map((item) => item.name), ['点数', '同花顺面', '最少出牌手数']);
  assert.equal(nextArrange('rank'), 'flush');
  assert.equal(nextArrange('flush'), 'hands');
  assert.equal(nextArrange('hands'), 'rank');
});

check('rank sort is unchanged', () => {
  const mixed = take(deck, [
    ['A', 'S', 0], ['2', 'H', 0], ['K', 'D', 0], ['SJ', 'J', 0], ['5', 'H', 0], ['5', 'S', 0], ['5', 'C', 1],
  ]);
  const sorted = sortCards(mixed, '5').map((card) => card.id);
  assert.deepEqual(arrangeHand(mixed, '5', 'rank').items.map((item) => item.card.id), sorted);
  assert.ok(arrangeHand(mixed, '5', 'rank').items.every((item) => item.gap === false));
});

check('straight-flush face groups a made flush and leaves the rest', () => {
  const made = take(deck, [
    ['10', 'S', 0], ['J', 'S', 0], ['Q', 'S', 0], ['K', 'S', 0], ['A', 'S', 0],
    ['3', 'H', 0], ['4', 'C', 0],
  ]);
  const view = arrangeHand(made, '9', 'flush');
  covers(made, view.items);
  const flushIds = made.slice(0, 5).map((card) => card.id);
  const block = blockOf(view.items, flushIds);
  assert.ok(block, 'made straight flush should sit together');
  assert.deepEqual(block.map((card) => card.rank), ['10', 'J', 'Q', 'K', 'A']);
  const ev = evaluateSelection(block, '9', null);
  assert.equal(ev.ok && ev.combo.type, 'straightflush');
});

check('straight-flush face keeps a 4-card run together', () => {
  const near = take(deck, [
    ['10', 'S', 0], ['J', 'S', 0], ['Q', 'S', 0], ['K', 'S', 0],
    ['3', 'H', 0],
  ]);
  const view = arrangeHand(near, '9', 'flush');
  const block = blockOf(view.items, near.slice(0, 4).map((card) => card.id));
  assert.ok(block);
  assert.deepEqual(block.map((card) => card.rank), ['10', 'J', 'Q', 'K']);
});

check('straight-flush face does not spend jokers as fillers', () => {
  const cards = take(deck, [
    ['10', 'S', 0], ['J', 'S', 0], ['Q', 'S', 0], ['K', 'S', 0],
    ['SJ', 'J', 0], ['BJ', 'J', 0],
  ]);
  const view = arrangeHand(cards, '9', 'flush');
  const run = blockOf(view.items, cards.slice(0, 4).map((card) => card.id));
  assert.ok(run);
  assert.ok(run.every((card) => card.suit !== 'J'));
  const jokerBlock = blocks(view.items).find((block) => block.some((card) => card.suit === 'J'));
  assert.ok(jokerBlock.every((card) => card.suit === 'J'));
});

check('straight-flush face keeps a natural bomb and a joker bomb whole', () => {
  const cards = take(deck, [
    ['9', 'S', 0], ['9', 'H', 0], ['9', 'C', 0], ['9', 'D', 0],
    ['10', 'S', 0], ['J', 'S', 0], ['Q', 'S', 0], ['K', 'S', 0],
    ['SJ', 'J', 0], ['SJ', 'J', 1], ['BJ', 'J', 0], ['BJ', 'J', 1],
  ]);
  const view = arrangeHand(cards, '2', 'flush');
  covers(cards, view.items);
  const bomb = blockOf(view.items, cards.slice(0, 4).map((card) => card.id));
  assert.ok(bomb, 'natural bomb stays together');
  assert.equal(evaluateSelection(bomb, '2', null).combo.type, 'bomb');
  const run = blocks(view.items).find((block) => block.some((card) => card.rank === '10'));
  assert.ok(run);
  assert.ok(run.every((card) => card.rank !== '9' && card.suit !== 'J'));
  const kings = blockOf(view.items, cards.slice(8).map((card) => card.id));
  assert.ok(kings, 'four jokers stay a 天王炸');
  assert.equal(evaluateSelection(kings, '2', null).combo.type, 'jokerbomb');
});

check('straight-flush face may complete a flush with a wild without splitting a seed', () => {
  const cards = take(deck, [
    ['10', 'S', 0], ['J', 'S', 0], ['Q', 'S', 0], ['K', 'S', 0],
    ['9', 'H', 0],
    ['8', 'S', 0], ['8', 'C', 0], ['8', 'D', 0],
  ]);
  const view = arrangeHand(cards, '9', 'flush');
  covers(cards, view.items);
  const seed = blockOf(view.items, cards.slice(5).map((card) => card.id));
  assert.ok(seed, 'three of a kind stays together');
  assert.ok(seed.every((card) => card.rank === '8'));
  const flush = blocks(view.items).find((block) => block.some((card) => isWild(card, '9')));
  assert.ok(flush, 'wild is shown where it completes a straight flush');
  assert.equal(evaluateSelection(flush, '9', null).combo.type, 'straightflush');
  assert.ok(flush.every((card) => card.rank !== '8'));
});

check('min plays beats naive plate packing and keeps bombs and wilds', () => {
  const packed = take(deck, [
    ['3', 'S', 0], ['3', 'H', 0], ['3', 'C', 0],
    ['4', 'S', 0], ['4', 'H', 0], ['4', 'D', 0],
    ['5', 'S', 0], ['5', 'C', 0],
    ['6', 'H', 0], ['6', 'D', 0],
  ]);
  const naive = arrangeGroups(packed, '9').length;
  const plan = arrangeHand(packed, '9', 'hands');
  covers(packed, plan.items);
  assert.equal(plan.exact, true);
  assert.ok(plan.plays < naive, `plan ${plan.plays} vs naive ${naive}`);
  assert.equal(plan.plays, 2);
  assert.ok(plan.groups.every((group) => group.type === 'fullhouse'));
  for (const group of plan.groups) {
    const ev = evaluateSelection(group.cards, '9', null);
    assert.equal(ev.ok && ev.combo.type, 'fullhouse');
  }

  const bombHand = take(deck, [
    ['8', 'S', 0], ['8', 'H', 0], ['8', 'C', 0], ['8', 'D', 0],
    ['10', 'S', 0], ['J', 'S', 0], ['Q', 'S', 0], ['K', 'S', 0],
    ['3', 'S', 1], ['3', 'H', 1],
  ]);
  const kept = arrangeHand(bombHand, '9', 'hands');
  covers(bombHand, kept.items);
  const bomb = kept.groups.find((group) => group.cards.some((card) => card.rank === '8'));
  sameIds(bomb.cards, bombHand.slice(0, 4).map((card) => card.id));
  assert.equal(evaluateSelection(bomb.cards, '9', null).combo.type, 'bomb');
  assert.ok(kept.groups.every((group) => group.type !== 'straight' || group.cards.every((card) => card.rank !== '8')));

  const wildHand = take(deck, [
    ['5', 'H', 0],
    ['9', 'S', 0], ['9', 'C', 0], ['9', 'D', 0],
    ['4', 'S', 0], ['4', 'H', 0],
  ]);
  const stingy = arrangeHand(wildHand, '5', 'hands');
  covers(wildHand, stingy.items);
  assert.equal(stingy.plays, 2);
  const upgraded = stingy.groups.find((group) => group.cards.some((card) => isWild(card, '5')));
  assert.equal(upgraded.type, 'bomb');
  sameIds(upgraded.cards, wildHand.slice(0, 4).map((card) => card.id));
});

check('custom group plan accepts a legal hand and rejects a bomb split', () => {
  const hand = take(deck, [
    ['3', 'S', 0], ['3', 'H', 0], ['3', 'C', 0],
    ['4', 'S', 0], ['4', 'H', 0],
    ['5', 'S', 0], ['5', 'C', 0],
    ['6', 'H', 0], ['6', 'D', 0],
  ]);
  const ok = planCustomGroups(hand, '9', ['fullhouse', 'pair', 'pair']);
  assert.equal(ok.ok, true, ok.reason);
  covers(hand, ok.items);
  assert.equal(ok.leftovers.length, 0);
  assert.deepEqual(ok.formed.map((group) => group.type), ['fullhouse', 'pair', 'pair']);
  for (const group of ok.formed) assert.equal(evaluateSelection(group.cards, '9', null).ok, true);

  const bombHand = take(deck, [
    ['8', 'S', 0], ['8', 'H', 0], ['8', 'C', 0], ['8', 'D', 0],
    ['9', 'C', 0], ['10', 'S', 0], ['J', 'S', 0], ['Q', 'S', 0],
  ]);
  const bad = planCustomGroups(bombHand, '2', ['straight']);
  assert.equal(bad.ok, false);
  assert.equal(bad.items, null);
  assert.match(bad.reason, /炸/);
  const still = arrangeHand(bombHand, '2', 'rank');
  const eight = still.items.filter((item) => item.card.rank === '8').map((item) => item.card.id);
  assert.equal(eight.length, 4);
});

check('custom group keeps a wild off a plain straight while a bomb seed exists', () => {
  const hand = take(deck, [
    ['2', 'H', 0],
    ['9', 'S', 0], ['9', 'C', 0], ['9', 'D', 0],
    ['5', 'S', 0], ['6', 'H', 0], ['7', 'C', 0], ['8', 'D', 0],
  ]);
  const refused = planCustomGroups(hand, '2', ['straight']);
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /逢人配/);
  assert.equal(refused.items, null);

  const bombed = planCustomGroups(hand, '2', ['bomb']);
  assert.equal(bombed.ok, true, bombed.reason);
  const bomb = bombed.formed[0];
  assert.equal(bomb.type, 'bomb');
  assert.ok(bomb.cards.some((card) => isWild(card, '2')));
  assert.ok(bomb.cards.filter((card) => card.rank === '9').length === 3);

  const open = take(deck, [
    ['2', 'H', 1], ['5', 'S', 1], ['6', 'H', 0], ['7', 'C', 0], ['8', 'D', 0],
  ]);
  const allowed = planCustomGroups(open, '2', ['straight']);
  assert.equal(allowed.ok, true, allowed.reason);
  assert.ok(allowed.formed[0].cards.some((card) => isWild(card, '2')));
  assert.equal(evaluateSelection(allowed.formed[0].cards, '2', null).combo.type, 'straight');
});

check('a full hand sorts quickly and stays a partition', () => {
  let seed = 7;
  const rng = () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const south = shuffle(createDeck(), rng).slice(0, 27);
  const started = Date.now();
  const plan = arrangeHand(south, '2', 'hands');
  const elapsed = Date.now() - started;
  console.log('min hands', elapsed, 'ms', plan.plays, plan.exact ? 'exact' : 'capped');
  assert.ok(elapsed < 1500, `min hands took ${elapsed}ms`);
  covers(south, plan.items);
  for (const group of plan.groups) {
    const ev = evaluateSelection(group.cards, '2', null);
    assert.equal(ev.ok, true, group.label || group.type);
  }
  const face = arrangeHand(south, '2', 'flush');
  covers(south, face.items);
  const byRank = arrangeHand(south, '2', 'rank');
  assert.deepEqual(byRank.items.map((item) => item.card.id), sortCards(south, '2').map((card) => card.id));
});

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('all passed');
