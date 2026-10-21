import {
  FINISH_NAME,
  SUIT_SYMBOL,
  arrangeGroups,
  cardText,
  evaluateSelection,
  isJoker,
  isReturnable,
  isWild,
  pickReturnCard,
  sortBySuit,
  sortCards,
  typeLabel,
} from './engine.js?v=2';
import { chooseMove, listSuggestions } from './ai.js?v=2';

const STEP_LABEL = ['', '头游 + 末游，升 1 级', '头游 + 三游，升 2 级', '头游 + 二游，升 3 级'];

export function handLayout(width, n, cardW = 60, extra = 0) {
  const cw = cardW;
  let step = n <= 1 ? 0 : (width - 16 - cw - extra) / Math.max(1, n - 1);
  const maxStep = cw * 0.78;
  if (step > maxStep) step = maxStep;
  if (n > 1 && step < 10) step = 10;
  const total = cw + Math.max(0, n - 1) * step + extra;
  let offset = (width - total) / 2;
  if (offset < 8) offset = 8;
  return { cw, ch: Math.round(cw / 0.7), step, offset, total };
}

function cardsApi() {
  return window.GuanDanCards;
}

function svgCard(card, level, opts = {}) {
  const api = cardsApi();
  if (!api) return '';
  if (!card) return api.backSVG({ width: opts.width });
  const wild = isWild(card, level);
  const levelCard = !isJoker(card) && card.rank === level;
  return api.cardSVG(card.rank, card.suit, {
    level: levelCard || wild,
    wild,
    selected: !!opts.selected,
    width: opts.width,
  });
}

function faceRow(cards, level, width) {
  if (!cards?.length) return '';
  const overlap = Math.round(width * 0.46);
  return `<div class="mini-row">${cards.map((card, i) => `
    <div class="mini" style="width:${width}px;margin-left:${i ? -overlap : 0}px;z-index:${i}">
      ${svgCard(card, level, { width })}
    </div>`).join('')}</div>`;
}

function orderedHand(hand, level, mode) {
  if (mode === 'suit') return sortBySuit(hand, level).map((card) => ({ card, gap: false }));
  if (mode === 'group') {
    const flat = [];
    arrangeGroups(hand, level).forEach((group, gi) => {
      group.cards.forEach((card, i) => flat.push({ card, gap: gi > 0 && i === 0 }));
    });
    return flat;
  }
  return sortCards(hand, level).map((card) => ({ card, gap: false }));
}

export function mount(app, game) {
  const ui = new UI(app, game);
  app.addEventListener('click', (event) => ui.onClick(event));
  window.addEventListener('resize', () => ui.paint());
  window.addEventListener('keydown', (event) => ui.onKey(event));
  ui.paint({ live: true });
  return ui;
}

class UI {
  constructor(app, game) {
    this.app = app;
    this.game = game;
    this.selected = new Set();
    this.arrange = 'rank';
    this.rules = false;
    this.muted = false;
    this.toastMsg = '';
    this.toastT = 0;
    this.heard = 0;
    this.aiT = 0;
    this.selKey = '';
    this.hintIndex = -1;
  }

  onClick(event) {
    const act = event.target.closest('[data-act]');
    if (act) {
      event.preventDefault();
      this.action(act.dataset.act);
      return;
    }
    const card = event.target.closest('[data-cid]');
    if (card) this.onCard(Number(card.dataset.cid));
  }

  onKey(event) {
    if (event.key === 'Escape' && this.rules) {
      this.rules = false;
      this.paint();
    } else if (event.key === 'Enter') {
      const phase = this.game.phase;
      if (phase === 'start') this.action('start');
      else if (phase === 'play') this.action('play');
      else if (phase === 'handEnd') this.action('continue');
      else if (phase === 'tributeReveal') this.action('ack');
      else if (phase === 'tributeChoice') {
        this.action(this.game.tribute?.waiting?.kind === 'give' ? 'give' : 'return');
      } else if (phase === 'matchEnd') this.action('restart');
    }
  }

  action(name) {
    const game = this.game;
    if (name === 'rules') {
      this.rules = true;
      this.paint();
      return;
    }
    if (name === 'close-rules') {
      this.rules = false;
      this.paint();
      return;
    }
    if (name === 'mute') {
      this.muted = !this.muted;
      this.paint();
      return;
    }
    if (name === 'start' || name === 'restart') {
      this.selected.clear();
      this.hintIndex = -1;
      this.selKey = '';
      game.startMatch();
      this.paint({ live: true });
      return;
    }
    if (name === 'arrange') {
      this.arrange = this.arrange === 'rank' ? 'suit' : this.arrange === 'suit' ? 'group' : 'rank';
      const label = { rank: '点数', suit: '花色', group: '分组' }[this.arrange];
      this.setToast(`已按${label}理牌`);
      this.paint();
      return;
    }
    if (name === 'hint') {
      this.hint();
      return;
    }
    if (name === 'pass') {
      if (game.phase !== 'play' || game.turn !== 0) {
        this.setToast('还没轮到你');
        this.paint();
        return;
      }
      const res = game.pass(0);
      if (!res.ok) this.setToast(res.reason);
      else this.selected.clear();
      this.paint({ live: true });
      return;
    }
    if (name === 'play') {
      if (game.phase !== 'play' || game.turn !== 0) {
        this.setToast('还没轮到你');
        this.paint();
        return;
      }
      const cards = game.seats[0].hand.filter((c) => this.selected.has(c.id));
      const res = game.play(0, cards);
      if (!res.ok) this.setToast(res.reason);
      else this.selected.clear();
      this.paint({ live: true });
      return;
    }
    if (name === 'continue') {
      game.continueAfterHand();
      this.selKey = '';
      this.paint({ live: true });
      return;
    }
    if (name === 'ack') {
      game.ackTribute();
      this.selKey = '';
      this.paint({ live: true });
      return;
    }
    if (name === 'give') {
      const res = game.confirmGive();
      if (!res.ok) this.setToast(res.reason);
      this.selKey = '';
      this.paint({ live: true });
      return;
    }
    if (name === 'return') {
      const id = [...this.selected][0];
      const res = game.confirmReturn(id);
      if (!res.ok) this.setToast(res.reason);
      this.selKey = '';
      this.paint({ live: true });
      return;
    }
  }

  hint() {
    const game = this.game;
    if (game.phase !== 'play' || game.turn !== 0) {
      this.setToast('还没轮到你');
      this.paint();
      return;
    }
    const list = listSuggestions(game.seats[0].hand, game.level, game.trick?.combo || null, game.aiContext(0));
    if (!list.length) {
      this.selected.clear();
      this.setToast(game.trick?.combo ? '建议不出' : '没有可出的牌');
      this.paint();
      return;
    }
    this.hintIndex = (this.hintIndex + 1) % list.length;
    const move = list[this.hintIndex];
    this.selected = new Set(move.cards.map((c) => c.id));
    this.setToast(`提示：${typeLabel(move)}`);
    this.paint();
  }

  onCard(id) {
    const game = this.game;
    if (game.phase === 'tributeChoice' && game.tribute?.waiting?.kind === 'give') {
      this.setToast('进贡要交最大的非逢人配');
      this.paint();
      return;
    }
    if (game.phase === 'tributeChoice' && game.tribute?.waiting?.kind === 'return') {
      const card = game.seats[0].hand.find((c) => c.id === id);
      const hasSmall = game.seats[0].hand.some((c) => isReturnable(c));
      if (card && hasSmall && !isReturnable(card)) {
        this.setToast('还贡只能是牌面 ≤10 的牌');
        this.paint();
        return;
      }
      this.selected = new Set([id]);
      this.paint();
      return;
    }
    if (game.phase !== 'play' || game.turn !== 0) {
      this.setToast('还没轮到你');
      this.paint();
      return;
    }
    if (this.selected.has(id)) this.selected.delete(id);
    else this.selected.add(id);
    this.paint();
  }

  setToast(msg) {
    this.toastMsg = msg;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => {
      this.toastMsg = '';
      this.paint();
    }, 1600);
  }

  syncSelection() {
    const game = this.game;
    const key = `${game.phase}:${game.turn}:${game.handNo}:${game.tribute?.waiting?.kind || ''}`;
    if (key === this.selKey) return;
    this.selKey = key;
    this.selected.clear();
    this.hintIndex = -1;
    if (game.phase === 'tributeChoice' && game.tribute?.waiting?.kind === 'return') {
      const card = pickReturnCard(game.seats[0].hand);
      if (card) this.selected.add(card.id);
    }
  }

  paint({ live = false } = {}) {
    this.syncSelection();
    this.app.innerHTML = this.html();
    if (live) {
      this.playSfx();
      this.queueAI();
    }
  }

  playSfx() {
    const game = this.game;
    if (game.sfxSeq === this.heard) return;
    this.heard = game.sfxSeq;
    if (this.muted) return;
    blip(game.sfx);
  }

  queueAI() {
    clearTimeout(this.aiT);
    const game = this.game;
    if (game.phase === 'play' && game.turn !== 0) {
      const bomb = game.trick?.combo && (game.trick.combo.type === 'bomb' || game.trick.combo.type === 'straightflush' || game.trick.combo.type === 'jokerbomb');
      this.aiT = setTimeout(() => this.aiStep(), bomb ? 900 : 680);
    } else if (game.phase === 'tributeReveal') {
      this.aiT = setTimeout(() => {
        if (this.game.phase !== 'tributeReveal') return;
        this.game.ackTribute();
        this.paint({ live: true });
      }, 1800);
    }
  }

  aiStep() {
    const game = this.game;
    if (game.phase !== 'play' || game.turn === 0) return;
    const seat = game.turn;
    const move = chooseMove(game.seats[seat].hand, game.level, game.trick?.combo || null, game.aiContext(seat));
    if (!move) {
      const res = game.pass(seat);
      if (!res.ok && !game.trick?.combo) {
        const low = sortCards(game.seats[seat].hand, game.level)[0];
        if (low) game.play(seat, [low]);
      }
    } else {
      const res = game.play(seat, move.cards);
      if (!res.ok) {
        if (!game.trick?.combo) {
          const low = sortCards(game.seats[seat].hand, game.level)[0];
          if (low) game.play(seat, [low]);
        } else game.pass(seat);
      }
    }
    this.paint({ live: true });
  }

  html() {
    if (this.game.phase === 'start') return `${this.startHtml()}${this.rulesHtml()}${this.toastHtml()}`;
    return `${this.tableHtml()}${this.overlayHtml()}${this.rulesHtml()}${this.toastHtml()}`;
  }

  startHtml() {
    const api = cardsApi();
    const fan = api ? `
      <div class="fan">
        <div class="fan-card tilt-l">${api.cardSVG('A', 'S', { width: 78 })}</div>
        <div class="fan-card">${api.cardSVG('2', 'H', { level: true, wild: true, width: 86 })}</div>
        <div class="fan-card tilt-r">${api.cardSVG('BJ', 'J', { width: 78 })}</div>
      </div>` : '';
    return `
      <section class="start">
        <p class="brand-kicker">兔镖局</p>
        <h1>掼蛋</h1>
        <p class="lead">四人分组，从二打到 A。你和对家一队，先过 A 的一边获胜。</p>
        ${fan}
        <ul class="brief">
          <li>两副牌，每人 27 张。红桃级牌是逢人配。</li>
          <li>点牌出牌，再点取消。可出同牌型更大的，或炸弹。</li>
          <li>头游 + 二游升 3 级，头游 + 三游升 2 级，头游 + 末游升 1 级。</li>
        </ul>
        <div class="start-actions">
          <button type="button" class="btn play" data-act="start">开始游戏</button>
          <button type="button" class="btn hint" data-act="rules">规则说明</button>
        </div>
      </section>`;
  }

  tableHtml() {
    const game = this.game;
    const mine = game.turn === 0 && game.phase === 'play';
    const width = this.app.clientWidth || window.innerWidth || 390;
    const cardW = width >= 1100 ? 78 : width >= 800 ? 68 : 60;
    const items = orderedHand(game.seats[0].hand, game.level, this.arrange);
    const gapCount = items.filter((item) => item.gap).length;
    const gapW = gapCount && width < 800 ? 4 : 8;
    const layout = handLayout(width, Math.max(1, items.length), cardW, gapCount * gapW);
    const wild = svgCard({ rank: game.level, suit: 'H' }, game.level, { width: 28 });
    const returning = game.phase === 'tributeChoice' && game.tribute?.waiting?.kind === 'return';
    let x = layout.offset;
    const hand = items.map((item, i) => {
      if (item.gap) x += gapW;
      const selected = this.selected.has(item.card.id);
      const dim = returning && game.seats[0].hand.some(isReturnable) && !isReturnable(item.card);
      const top = selected ? 2 : 16;
      const html = `
        <button type="button" class="hc${selected ? ' selected' : ''}${dim ? ' dim' : ''}" data-cid="${item.card.id}"
          style="left:${x}px;top:${top}px;width:${layout.cw}px;z-index:${selected ? 60 : i + 1}"
          aria-label="${cardText(item.card)}">
          ${svgCard(item.card, game.level, { selected, width: layout.cw })}
        </button>`;
      x += layout.step;
      return html;
    }).join('');

    return `
      <header class="top">
        <button type="button" class="text-btn" data-act="rules">规则</button>
        <div class="brand">掼蛋</div>
        <div class="lv">我方 ${game.teamLevel[0]} · 对方 ${game.teamLevel[1]}</div>
        <button type="button" class="text-btn" data-act="mute">${this.muted ? '静音' : '声音'}</button>
      </header>
      <div class="subbar">
        <span>第 ${game.handNo} 局</span>
        <span>打 ${game.level}${game.levelOwner == null ? '' : game.levelOwner === 0 ? ' · 我方' : ' · 对方'}</span>
        <span class="wild-pill">逢人配 ${wild}</span>
      </div>
      <main class="felt">
        ${this.seatStrip(2)}
        <section class="mid">
          ${this.sideSeat(3)}
          <div class="center">
            <div class="slot">${this.slot(2)}</div>
            <div class="slot-row">
              <div class="slot">${this.slot(3)}</div>
              <div class="slot">${this.slot(1)}</div>
            </div>
            <div class="slot">${this.slot(0)}</div>
            <p class="status">${game.message || ''}</p>
          </div>
          ${this.sideSeat(1)}
        </section>
        <section class="me-zone">
          ${this.tributeBar()}
          <div class="me-bar">
            <div class="who">
              <div class="av me">我</div>
              <div>
                <b>你</b>
                <span>${game.seats[0].finish ? FINISH_NAME[game.seats[0].finish] : `${game.seats[0].hand.length} 张`}</span>
              </div>
            </div>
            <div class="btns">
              <button type="button" class="btn hint" data-act="arrange">理牌</button>
              <button type="button" class="btn hint" data-act="hint" ${mine ? '' : 'disabled'}>提示</button>
              <button type="button" class="btn pass" data-act="pass" ${mine ? '' : 'disabled'}>不出</button>
              <button type="button" class="btn play" data-act="play" ${mine ? '' : 'disabled'}>出牌</button>
            </div>
          </div>
          <p class="pick">${this.selectionNote()}</p>
          <div class="hand" style="height:${layout.ch + 20}px">${items.length ? hand : '<p class="empty-hand">牌已出完</p>'}</div>
        </section>
      </main>`;
  }

  seatStrip(id) {
    const seat = this.game.seats[id];
    return `
      <section class="zone partner">
        <div class="who">
          <div class="av ally">${seat.stamp}</div>
          <div>
            <b>${seat.name} · 队友</b>
            <span>${seat.finish ? FINISH_NAME[seat.finish] : `${seat.hand.length} 张`}</span>
          </div>
        </div>
      </section>`;
  }

  sideSeat(id) {
    const seat = this.game.seats[id];
    return `
      <section class="zone side">
        <div class="av foe">${seat.stamp}</div>
        <b>${seat.name}</b>
        <span>${seat.finish ? FINISH_NAME[seat.finish] : `${seat.hand.length} 张`}</span>
      </section>`;
  }

  slot(id) {
    const game = this.game;
    const seat = game.seats[id];
    const hot = game.trick?.winner === id;
    if (!seat.shown) {
      return `<div class="slot-empty${game.turn === id && game.phase === 'play' ? ' turn' : ''}">${game.turn === id && game.phase === 'play' ? '思考' : ''}</div>`;
    }
    if (seat.shown.pass) return `<div class="pass-pill">${seat.name}不出</div>`;
    const w = window.innerWidth >= 800 ? 46 : 34;
    return `
      <div class="trick${hot ? ' hot' : ''}">
        <span class="tag">${seat.name} · ${typeLabel(seat.shown.combo)}</span>
        ${faceRow(seat.shown.cards, game.level, w)}
      </div>`;
  }

  selectionNote() {
    const game = this.game;
    if (game.phase === 'tributeChoice') return game.message;
    if (game.phase !== 'play' || game.turn !== 0) {
      return game.phase === 'play' ? `${game.seats[game.turn].name}出牌` : '';
    }
    const cards = game.seats[0].hand.filter((c) => this.selected.has(c.id));
    if (!cards.length) return game.trick?.combo ? `要大过 ${typeLabel(game.trick.combo)}，或出炸弹` : '选牌后点出牌';
    const ev = evaluateSelection(cards, game.level, game.trick?.combo || null);
    if (!ev.ok) return `${cards.length} 张 · ${ev.reason}`;
    return `${cards.length} 张 · ${typeLabel(ev.combo)}`;
  }

  tributeBar() {
    const game = this.game;
    if (game.phase !== 'tributeChoice' || !game.tribute?.waiting) return '';
    const waiting = game.tribute.waiting;
    if (waiting.kind === 'give') {
      return `
        <div class="banner">
          <div class="banner-card">${svgCard(waiting.action.card, game.level, { width: 48 })}</div>
          <div>
            <b>进贡</b>
            <p>${game.message}</p>
          </div>
          <button type="button" class="btn play" data-act="give">确认进贡</button>
        </div>`;
    }
    return `
      <div class="banner">
        <div>
          <b>还贡</b>
          <p>${game.message}</p>
        </div>
        <button type="button" class="btn play" data-act="return">确认还贡</button>
      </div>`;
  }

  overlayHtml() {
    const game = this.game;
    if (game.phase === 'handEnd') return this.sheet(this.handEndInner(), '<button type="button" class="btn play" data-act="continue">继续</button>');
    if (game.phase === 'tributeReveal') {
      const lines = (game.tribute?.lines || []).map((line) => `<li>${line}</li>`).join('');
      return this.sheet(`<h2>${game.tribute?.resist ? '抗贡' : '进贡'}</h2><ul class="rank-list">${lines}</ul>`, '<button type="button" class="btn play" data-act="ack">开始出牌</button>');
    }
    if (game.phase === 'matchEnd') {
      const win = game.winner === 0;
      return this.sheet(`
        <h2>${win ? '我方过 A' : '对方过 A'}</h2>
        <p class="lead-ink">${win ? '这局搭档配合赢下了整场。' : '对方先过了 A。再来一局可以从头打。'}</p>
        ${this.rankList()}
        <p class="level-line">我方 ${game.teamLevel[0]} · 对方 ${game.teamLevel[1]}</p>
      `, '<button type="button" class="btn play" data-act="restart">再来一局</button>');
    }
    return '';
  }

  handEndInner() {
    const game = this.game;
    const team = game.lastWinTeam === 0 ? '我方' : '对方';
    const after = game.teamLevel[game.lastWinTeam];
    let upgrade;
    if (game.lastBefore === 'A' && game.lastSteps < 2) {
      upgrade = `${team}已经是 A。头游的队友是末游，不能过 A，继续打 A。`;
    } else {
      upgrade = `${team} ${game.lastBefore} → ${after}（${STEP_LABEL[game.lastSteps]}）`;
    }
    return `
      <h2>本局结束</h2>
      ${this.rankList()}
      <p class="level-line">${upgrade}</p>
      <p class="level-line">下一局打 ${game.level}，逢人配 ${SUIT_SYMBOL.H}${game.level}</p>`;
  }

  rankList() {
    const game = this.game;
    const order = game.lastOrder || [];
    if (!order.length) return '';
    return `<ol class="rank-list">${order.map((id, i) => `<li><b>${FINISH_NAME[i + 1]}</b> ${game.seats[id].name}</li>`).join('')}</ol>`;
  }

  sheet(inner, actions) {
    return `<div class="overlay"><div class="sheet">${inner}<div class="sheet-actions">${actions}</div></div></div>`;
  }

  rulesHtml() {
    if (!this.rules) return '';
    return `
      <div class="overlay">
        <div class="sheet rules">
          <h2>怎么打</h2>
          <p>你坐下方，对家是队友，上家和下家是对方。两副牌 108 张，每人 27 张。从 2 打到 A，先过 A 的一队获胜。</p>
          <h3>级牌和逢人配</h3>
          <p>每一局只打一个级数，就是上一局赢家升级后的级数（第一局打 2）。这个点数是级牌，单张、对子、三张、三带二和炸弹里，级牌只比王小。红桃级牌是逢人配，可以当成任意非王牌。</p>
          <h3>牌型</h3>
          <p>单张、对子、三张、三带二（三张带一对）、顺子（必须 5 张）、木板（三连对）、钢板（两连三张）、炸弹（4 张及以上同点）、同花顺、天王炸（四张王）。</p>
          <p>顺子、木板、钢板按自然点数衔接，级牌回到原来的位置。A2345 最小，10JQKA 最大，不能绕回。木板可以 A23，钢板可以 A2，这里 A 当最小。三带二只比三张，不比对子。</p>
          <h3>大小</h3>
          <p>普通牌型必须同型更大。炸弹可以压任何非炸弹。张数多的炸弹更大；同张数比点数，级牌最大。同花顺大于四炸和五炸，小于六炸及以上；同样的同花顺比花色，黑桃 &gt; 红桃 &gt; 梅花 &gt; 方块。天王炸最大。</p>
          <h3>一轮和接风</h3>
          <p>有人领出后，其余人出更大的同型牌、炸弹，或者不出。其余还有牌的人都不出，这一轮结束，刚才最大的那家继续领出。如果那家已经出完，由对家接风；对家也出完了，就轮到下一家还有牌的人。</p>
          <p>有人出完就是一名。头游和二游是同一队（双上），或者已经有三人出完，这一局就结束，剩下的人按名次排好。</p>
          <h3>升级、进贡、过 A</h3>
          <p>赢家：头游 + 二游升 3 级，头游 + 三游升 2 级，头游 + 末游升 1 级。级数到 A 为止。下一局打赢家当前的级数。</p>
          <p>新的一局发牌后进贡。末游把最大的一张交给头游（逢人配不交）。若是双下，三游和末游都交，较大的给头游，较小的给二游。收到贡牌的人还一张牌面 ≤10 的牌。还完由进贡给头游的那家先出。进贡方手里有两张大王则抗贡，改由头游先出。没有 ≤10 的牌时，还最小的非王牌。</p>
          <p>已经打到 A 的一队，这一局必须头游并且队友不是末游，才算过 A。如果只是头游 + 末游，停在 A 继续打。</p>
          <h3>操作</h3>
          <p>手牌点一下选中，再点取消。出牌、不出、提示、理牌。第一局由你先出。三家是启发式电脑：尽量出小牌，炸弹留着，队友的大牌一般不压。</p>
          <div class="sheet-actions"><button type="button" class="btn hint" data-act="close-rules">知道了</button></div>
        </div>
      </div>`;
  }

  toastHtml() {
    if (!this.toastMsg) return '';
    return `<div class="toast">${this.toastMsg}</div>`;
  }
}

function blip(kind) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!blip.ctx) blip.ctx = new AC();
  const ctx = blip.ctx;
  const beep = (freq, at, dur, gain = 0.04, type = 'sine') => {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.value = gain;
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(at);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.stop(at + dur);
  };
  const t = ctx.currentTime;
  if (kind === 'play' || kind === 'deal') beep(540, t, 0.07);
  else if (kind === 'pass') beep(180, t, 0.08, 0.03, 'triangle');
  else if (kind === 'bomb') {
    beep(130, t, 0.18, 0.05, 'sawtooth');
    beep(420, t + 0.06, 0.12, 0.04);
    if (navigator.vibrate) navigator.vibrate(30);
  } else if (kind === 'jokerbomb') {
    [220, 440, 880].forEach((f, i) => beep(f, t + i * 0.1, 0.18, 0.05));
    if (navigator.vibrate) navigator.vibrate(50);
  } else if (kind === 'yourTurn') beep(680, t, 0.06, 0.03);
  else if (kind === 'wind' || kind === 'tribute') beep(490, t, 0.08, 0.03);
  else if (kind === 'win') [523, 659, 784, 1046].forEach((f, i) => beep(f, t + i * 0.09, 0.16, 0.04));
  else if (kind === 'lose') beep(196, t, 0.24, 0.04, 'triangle');
}
