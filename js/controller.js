import {
  FINISH_NAME,
  advanceLevel,
  cardText,
  createDeck,
  evaluateSelection,
  isJoker,
  isReturnable,
  pickReturnCard,
  planTribute,
  shuffle,
  typeLabel,
  upgradeSteps,
  isBombType,
} from './engine.js?v=2';

const NAMES = ['你', '下家', '对家', '上家'];
const STAMPS = ['我', '下', '对', '上'];

function makeSeat(id, hand) {
  return {
    id,
    name: NAMES[id],
    stamp: STAMPS[id],
    team: id % 2 === 0 ? 0 : 1,
    hand,
    finish: null,
    passed: false,
    shown: null,
  };
}

export class Match {
  constructor() {
    this.reset();
  }

  reset() {
    this.teamLevel = ['2', '2'];
    this.level = '2';
    this.levelOwner = null;
    this.handNo = 0;
    this.phase = 'start';
    this.seats = [0, 1, 2, 3].map((id) => makeSeat(id, []));
    this.turn = 0;
    this.trick = null;
    this.finishOrder = [];
    this.lastOrder = null;
    this.lastSteps = 0;
    this.lastWinTeam = null;
    this.lastBefore = '2';
    this.winner = null;
    this.tribute = null;
    this.message = '四人掼蛋，从二打到 A';
    this.sfx = '';
    this.sfxSeq = 0;
  }

  ping(kind) {
    this.sfx = kind;
    this.sfxSeq += 1;
  }

  startMatch() {
    this.teamLevel = ['2', '2'];
    this.level = '2';
    this.levelOwner = null;
    this.handNo = 1;
    this.winner = null;
    this.lastOrder = null;
    this.finishOrder = [];
    this.tribute = null;
    this.deal();
    this.beginPlay(0);
    this.message = '第一局打 2，由你先出';
    this.ping('deal');
  }

  deal() {
    const deck = shuffle(createDeck());
    this.seats = [0, 1, 2, 3].map((id) => makeSeat(id, deck.slice(id * 27, id * 27 + 27)));
    this.finishOrder = [];
  }

  beginPlay(leader) {
    this.phase = 'play';
    this.beginTrick(leader, leader === 0 ? '轮到你领出' : `${this.seats[leader].name}领出`);
  }

  beginTrick(lead, note) {
    this.trick = { combo: null, winner: null, passed: new Set(), lead };
    this.turn = lead;
    for (const seat of this.seats) {
      seat.passed = false;
      seat.shown = null;
    }
    this.message = note || (lead === 0 ? '轮到你领出' : `${this.seats[lead].name}领出`);
    if (note && note.includes('接风')) this.ping('wind');
    else if (lead === 0) this.ping('yourTurn');
  }

  nextWithCards(from) {
    for (let k = 1; k <= 4; k++) {
      const i = (from + k) % 4;
      if (this.seats[i].hand.length > 0) return i;
    }
    return from;
  }

  trickClosed() {
    for (let i = 0; i < 4; i++) {
      if (i === this.trick.winner) continue;
      if (this.seats[i].hand.length === 0) continue;
      if (!this.trick.passed.has(i)) return false;
    }
    return true;
  }

  shouldEnd() {
    if (this.finishOrder.length >= 3) return true;
    if (this.finishOrder.length === 2 && this.finishOrder[0] % 2 === this.finishOrder[1] % 2) return true;
    return false;
  }

  play(seat, cards) {
    if (this.phase !== 'play') return { ok: false, reason: '现在不能出牌' };
    if (seat !== this.turn) return { ok: false, reason: '还没轮到你' };
    const hand = this.seats[seat].hand;
    const chosen = [];
    for (const card of cards) {
      const found = hand.find((c) => c.id === card.id);
      if (!found) return { ok: false, reason: '手里没有这张牌' };
      if (chosen.some((c) => c.id === found.id)) return { ok: false, reason: '牌选重了' };
      chosen.push(found);
    }
    const ev = evaluateSelection(chosen, this.level, this.trick.combo);
    if (!ev.ok) return ev;
    const ids = new Set(chosen.map((c) => c.id));
    this.seats[seat].hand = hand.filter((c) => !ids.has(c.id));
    this.seats[seat].shown = { cards: ev.combo.cards, combo: ev.combo, pass: false };
    this.trick.combo = ev.combo;
    this.trick.winner = seat;
    this.trick.passed = new Set();
    for (const s of this.seats) s.passed = false;
    this.message = `${this.seats[seat].name}出了${typeLabel(ev.combo)}`;
    this.ping(ev.combo.type === 'jokerbomb' ? 'jokerbomb' : isBombType(ev.combo) ? 'bomb' : 'play');
    if (this.seats[seat].hand.length === 0) {
      this.finishOrder.push(seat);
      this.seats[seat].finish = this.finishOrder.length;
      this.message = `${this.seats[seat].name}是${FINISH_NAME[this.seats[seat].finish]}`;
    }
    if (this.shouldEnd()) {
      this.endHand();
      return { ok: true, combo: ev.combo };
    }
    this.turn = this.nextWithCards(seat);
    if (this.turn === 0) this.ping('yourTurn');
    return { ok: true, combo: ev.combo };
  }

  pass(seat) {
    if (this.phase !== 'play') return { ok: false, reason: '现在不能不出' };
    if (seat !== this.turn) return { ok: false, reason: '还没轮到你' };
    if (!this.trick?.combo) return { ok: false, reason: '领出时必须出牌' };
    this.seats[seat].passed = true;
    this.seats[seat].shown = { pass: true };
    this.trick.passed.add(seat);
    this.message = `${this.seats[seat].name}不出`;
    this.ping('pass');
    if (this.trickClosed()) {
      const winner = this.trick.winner;
      let lead = winner;
      let note = `${this.seats[lead].name}继续领出`;
      if (this.seats[lead].hand.length === 0) {
        const partner = (lead + 2) % 4;
        if (this.seats[partner].hand.length > 0) {
          lead = partner;
          note = `${this.seats[partner].name}接风`;
        } else {
          lead = this.nextWithCards(lead);
          note = `${this.seats[lead].name}领出`;
        }
      }
      this.beginTrick(lead, note);
    } else {
      this.turn = this.nextWithCards(seat);
      if (this.turn === 0) this.ping('yourTurn');
    }
    return { ok: true };
  }

  endHand() {
    const rest = [0, 1, 2, 3].filter((id) => !this.finishOrder.includes(id));
    if (this.finishOrder.length === 2) {
      const after = this.finishOrder[1];
      rest.sort((a, b) => {
        const d = this.seats[a].hand.length - this.seats[b].hand.length;
        if (d) return d;
        return ((a - after + 4) % 4) - ((b - after + 4) % 4);
      });
      this.finishOrder.push(rest[0], rest[1]);
    } else if (this.finishOrder.length === 3 && rest.length) {
      this.finishOrder.push(rest[0]);
    }
    this.finishOrder.forEach((id, i) => {
      this.seats[id].finish = i + 1;
    });
    const order = this.finishOrder.slice();
    const steps = upgradeSteps(order);
    const winTeam = order[0] % 2 === 0 ? 0 : 1;
    const before = this.teamLevel[winTeam];
    let matchWin = false;
    if (before === 'A' && steps >= 2) matchWin = true;
    else if (before !== 'A') this.teamLevel[winTeam] = advanceLevel(before, steps);
    this.lastOrder = order;
    this.lastSteps = steps;
    this.lastWinTeam = winTeam;
    this.lastBefore = before;
    this.level = this.teamLevel[winTeam];
    this.levelOwner = winTeam;
    if (matchWin) {
      this.phase = 'matchEnd';
      this.winner = winTeam;
      this.message = `${winTeam === 0 ? '我方' : '对方'}过 A 获胜`;
      this.ping(winTeam === 0 ? 'win' : 'lose');
    } else {
      this.phase = 'handEnd';
      this.message = '本局结束';
      this.ping('hand');
    }
  }

  continueAfterHand() {
    if (this.phase !== 'handEnd') return;
    this.handNo += 1;
    this.deal();
    this.openTribute();
  }

  openTribute() {
    if (!this.lastOrder) {
      this.beginPlay(0);
      return;
    }
    const hands = this.seats.map((s) => s.hand);
    const plan = planTribute(hands, this.lastOrder, this.level);
    if (plan.resist) {
      this.tribute = {
        resist: true,
        doubleDown: plan.doubleDown,
        gives: [],
        returns: [],
        leader: plan.leader,
        lines: ['抗贡：进贡方有两张大王', `由${this.seats[plan.leader].name}先出`],
        waiting: null,
      };
      this.phase = 'tributeReveal';
      this.message = '抗贡';
      this.ping('tribute');
      return;
    }
    const gives = plan.gives.map((g) => ({ ...g, done: false }));
    const returns = gives.map((g) => ({ from: g.to, to: g.from, card: null, done: false }));
    this.tribute = {
      resist: false,
      doubleDown: plan.doubleDown,
      gives,
      returns,
      leader: plan.leader,
      lines: [],
      waiting: null,
    };
    this.phase = 'tributeChoice';
    this.pumpTribute();
  }

  applyTransfer(from, to, card) {
    this.seats[from].hand = this.seats[from].hand.filter((c) => c.id !== card.id);
    this.seats[to].hand.push(card);
  }

  pumpTribute() {
    const tribute = this.tribute;
    for (const give of tribute.gives) {
      if (give.done) continue;
      if (give.from === 0) {
        tribute.waiting = { kind: 'give', action: give };
        this.phase = 'tributeChoice';
        this.message = `请把 ${cardText(give.card)} 进贡给${this.seats[give.to].name}`;
        return;
      }
      this.applyTransfer(give.from, give.to, give.card);
      give.done = true;
      tribute.lines.push(`${this.seats[give.from].name}进贡 ${cardText(give.card)} 给${this.seats[give.to].name}`);
    }
    for (const back of tribute.returns) {
      if (back.done) continue;
      if (back.from === 0) {
        tribute.waiting = { kind: 'return', action: back };
        this.phase = 'tributeChoice';
        this.message = `请选择一张牌面 ≤10 的牌还给${this.seats[back.to].name}`;
        return;
      }
      back.card = pickReturnCard(this.seats[back.from].hand);
      this.applyTransfer(back.from, back.to, back.card);
      back.done = true;
      tribute.lines.push(`${this.seats[back.from].name}还贡 ${cardText(back.card)} 给${this.seats[back.to].name}`);
    }
    tribute.waiting = null;
    tribute.lines.push(`由${this.seats[tribute.leader].name}先出`);
    this.phase = 'tributeReveal';
    this.message = '进贡完成';
    this.ping('tribute');
  }

  confirmGive() {
    const waiting = this.tribute?.waiting;
    if (!waiting || waiting.kind !== 'give') return { ok: false, reason: '现在不用进贡' };
    const give = waiting.action;
    this.applyTransfer(give.from, give.to, give.card);
    give.done = true;
    this.tribute.lines.push(`你进贡 ${cardText(give.card)} 给${this.seats[give.to].name}`);
    this.pumpTribute();
    return { ok: true };
  }

  confirmReturn(cardId) {
    const waiting = this.tribute?.waiting;
    if (!waiting || waiting.kind !== 'return') return { ok: false, reason: '现在不用还贡' };
    const card = this.seats[0].hand.find((c) => c.id === cardId);
    if (!card) return { ok: false, reason: '请选择要还的牌' };
    const hasSmall = this.seats[0].hand.some((c) => isReturnable(c));
    if (hasSmall && !isReturnable(card)) return { ok: false, reason: '还贡只能是牌面 ≤10 的牌' };
    if (!hasSmall && isJoker(card) && this.seats[0].hand.some((c) => !isJoker(c))) {
      return { ok: false, reason: '请还一张非王的牌' };
    }
    waiting.action.card = card;
    this.applyTransfer(0, waiting.action.to, card);
    waiting.action.done = true;
    this.tribute.lines.push(`你还贡 ${cardText(card)} 给${this.seats[waiting.action.to].name}`);
    this.pumpTribute();
    return { ok: true };
  }

  ackTribute() {
    if (this.phase !== 'tributeReveal') return;
    const leader = this.tribute.leader;
    this.beginPlay(leader);
  }

  aiContext(seat) {
    const partner = (seat + 2) % 4;
    const foes = [(seat + 1) % 4, (seat + 3) % 4]
      .map((id) => this.seats[id].hand.length)
      .filter((n) => n > 0);
    return {
      partnerWinning: this.trick?.winner === partner,
      opponentMin: foes.length ? Math.min(...foes) : 99,
    };
  }

  loadPosition({ hands, level = '2', turn = 0, teamLevel = ['2', '2'] }) {
    this.teamLevel = teamLevel.slice();
    this.level = level;
    this.levelOwner = null;
    this.handNo = 1;
    this.winner = null;
    this.lastOrder = null;
    this.tribute = null;
    this.finishOrder = [];
    this.seats = [0, 1, 2, 3].map((id) => makeSeat(id, hands[id].slice()));
    this.phase = 'play';
    this.beginTrick(turn);
  }
}
