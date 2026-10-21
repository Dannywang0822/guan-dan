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
  upgradeSteps,
} from '../js/engine.js?v=2';
import { chooseMove } from '../js/ai.js?v=2';
import { Match } from '../js/controller.js?v=2';
import { handLayout } from '../js/ui.js?v=2';

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
  assert.ok(wild.includes('#FBE7CF') || wild.includes('#fbe7cf'));
  assert.ok(backSVG({ width: 30 }).includes('<svg'));
});

check('phone hand step', () => {
  const layout = handLayout(390, 27, 60, 0);
  assert.ok(layout.step > 11.5 && layout.step < 12.5, layout.step);
  assert.ok(layout.offset + layout.total <= 391);
  assert.equal(layout.cw, 60);
});

if (failed) {
  console.error(`${failed} failed`);
  process.exit(1);
}
console.log('all passed');
