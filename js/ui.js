import { unplayedPool } from './controller.js?v=11';
import {
  FINISH_NAME,
  SUIT_SYMBOL,
  cardText,
  evaluateSelection,
  isJoker,
  isReturnable,
  isWild,
  pickReturnCard,
  sortCards,
  typeLabel,
} from './engine.js?v=11';
import { chooseMove, listSuggestions } from './ai.js?v=11';
import { arrangeHand, nextArrange, planCustomGroups } from './arrange.js?v=11';
import { playOpening, prepareOpeningArt, shouldPlayOpening } from './opening.js?v=11';
import {
  COMPOSE_TYPES,
  chipTypeForCombo,
  composeVerdict,
  fanHitIndex,
  isPortraitPhone,
  packedMetrics,
  portraitFanLayout,
  zoomCardWidth,
} from './portrait.js?v=11';

const STEP_LABEL = ['', '头游 + 末游，升 1 级', '头游 + 三游，升 2 级', '头游 + 二游，升 3 级'];
const COMPASS = ['南', '东', '北', '西'];
const TONE = ['gold', 'cinnabar', 'bamboo', 'slate'];
export const DIFFS = [
  ['easy', '轻松', '合法跟牌，偏出小牌。'],
  ['balanced', '均衡', '尽量出小牌型、留炸弹，队友大牌一般不压。'],
  ['sharp', '精算', '记公开牌，配合让牌与拦截，残局算手数。'],
];
export const ARRANGE = {
  rank: {
    name: '点数',
    now: '当前：按点数理牌',
    body: '按本局单张大小排列：2 最小，级牌仅次于王，同点按花色。',
  },
  flush: {
    name: '同花顺面',
    now: '当前：按同花顺面理牌',
    body: '已成同花顺、差一张的同花顺面靠前，同花按点数排开。逢人配只补同花顺，不拆炸弹和天王炸。',
  },
  hands: {
    name: '最少出牌手数',
    now: '当前：按最少出牌手数理牌',
    body: '按整手最少手数分组。优先三带二，顺子不轻易组，逢人配留给炸弹和同花顺，不拆炸弹。',
  },
};
const PATTERN = {
  single: '单张：按本局大小，大王 > 小王 > 级牌 > A > K > … > 2。',
  pair: '对子：两张同点。级牌仅次于王，逢人配可补成对。',
  triple: '三张：三张同点。级牌仅次于王，逢人配可补。',
  fullhouse: '三带二：三张带一对，只比三张的点数，不比对子。',
  straight: '顺子：固定 5 张，按牌面点数衔接，级牌不另算。A2345 最小，10JQKA 最大。',
  tube: '木板：三连对，按牌面点数衔接，级牌不另算。可含 A23。',
  plate: '钢板：两连三张，按牌面点数衔接，级牌不另算。可含 A2。',
  straightflush: '同花顺：五张同花，按牌面点数衔接，级牌不另算。大于四炸、五炸，小于六炸及以上。',
  jokerbomb: '天王炸：四张王，全场最大。',
  bomb: '炸弹：四张及以上同点。张数多为大；同张数比点数，级牌最大。',
};

const DIFF_KEY = 'guandan-ink-difficulty';

export function cardMetrics(width) {
  if (width >= 1100) return { hand: 92, play: 58 };
  if (width >= 800) return { hand: 80, play: 50 };
  return { hand: 66, play: 42 };
}

export function splitHandRows(n) {
  if (n <= 14) return [n, 0];
  const top = Math.ceil(n / 2);
  return [top, n - top];
}

export function twoRowLayout({ width, height = 800, n = 0, extra = 0 }) {
  const [top, bottom] = splitHandRows(Math.max(0, n));
  const longest = Math.max(top, bottom, 1);
  const rows = bottom > 0 ? 2 : 1;
  const short = height > 0 && height < 520;
  const narrow = width < 800;
  const gap = short || narrow ? 2 : 5;
  const rowGap = short ? 4 : 6;
  const sidePad = width >= 1100 ? 24 : 10;
  const availW = Math.max(80, width - sidePad);
  const header = short ? 52 : (narrow ? 96 : 54);
  const rule = short ? 42 : 66;
  const buttons = short ? 48 : 56;
  const matMin = short ? 100 : (width >= 1100 ? 168 : 132);
  const spare = Math.max(rows * 28, height - header - rule - buttons - matMin - 10);
  const chByH = Math.floor((spare - (rows - 1) * rowGap) / rows);
  const cwByW = Math.floor((availW - Math.max(0, longest - 1) * gap - extra) / longest);
  const cwByH = Math.floor(chByH * 0.7);
  // 张数少时不能把剩余高度全给手牌，否则出牌区会被挤到最小高度后裁掉。
  const maxCw = width >= 1100 ? 96 : short ? 58 : 72;
  const cw = Math.max(16, Math.min(cwByW, cwByH, maxCw));
  const ch = Math.round(cw / 0.7);
  return { top, bottom, cw, ch, gap, rowGap, rows };
}

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

function loadDifficulty() {
  try {
    const value = localStorage.getItem(DIFF_KEY);
    if (value === 'easy' || value === 'balanced' || value === 'sharp') return value;
  } catch {
    /* 隐私模式没有本地存储时用均衡。 */
  }
  return 'balanced';
}

function saveDifficulty(value) {
  try {
    localStorage.setItem(DIFF_KEY, value);
  } catch {
    /* 忽略写不进本地存储的情况。 */
  }
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[ch]));
}

function cardsApi() {
  return globalThis.GuanDanCards;
}

function svgCard(card, level, opts = {}) {
  const api = cardsApi();
  if (!api) return '';
  if (!card) return api.backSVG({ width: opts.width });
  const wild = isWild(card, level);
  const levelCard = !isJoker(card) && card.rank === level;
  return api.cardSVG(card.rank, card.suit, {
    level: levelCard,
    wild,
    selected: !!opts.selected,
    width: opts.width,
    fan: !!opts.fan,
  });
}

/** Card face used by the table, the fan, the zoom tray, and the 逢人配 chip. */
export function renderCard(card, level, opts = {}) {
  return svgCard(card, level, opts);
}

function faceRow(cards, level, width, maxW) {
  if (!cards?.length) return '';
  const n = cards.length;
  let step = Math.round(width * 0.46);
  if (n > 1 && maxW) {
    const fit = Math.floor((maxW - 8 - width) / (n - 1));
    if (fit < step) step = Math.max(14, fit);
  }
  return `<div class="mini-row">${cards.map((card, i) => `
    <div class="mini" style="width:${width}px;margin-left:${i ? step - width : 0}px;z-index:${i}">
      ${svgCard(card, level, { width })}
    </div>`).join('')}</div>`;
}

function packedRow(cards, level, maxW, targetW) {
  if (!cards?.length) return '';
  const n = cards.length;
  const { cw, step } = packedMetrics(maxW, n, targetW);
  return `<div class="mini-row packed">${cards.map((card, i) => `
    <div class="mini" style="width:${cw}px;margin-left:${i ? step - cw : 0}px;z-index:${i}">
      ${svgCard(card, level, { width: cw })}
    </div>`).join('')}</div>`;
}

function handItems(view) {
  return view?.items || [];
}

function washSvg() {
  return `<svg class="wash" viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <path fill="#1C1C1C" opacity=".05" d="M0 500 C140 450 200 390 300 430 C400 360 470 460 590 410 C720 340 790 470 930 400 C1040 340 1120 430 1200 380 V800 H0Z"/>
    <path fill="#1C1C1C" opacity=".07" d="M0 600 C180 540 250 630 400 560 C530 500 600 610 760 540 C920 460 1020 600 1200 520 V800 H0Z"/>
    <g fill="none" stroke="#1C1C1C" stroke-linecap="round" opacity=".16">
      <path d="M1088 800 V150" stroke-width="4"/>
      <path d="M1088 230 H1036 M1088 320 H1140 M1088 420 H1048 M1088 530 H1132" stroke-width="2"/>
      <path d="M1148 800 V240" stroke-width="3"/>
      <path d="M1148 330 H1190 M1148 450 H1104" stroke-width="2"/>
      <path d="M1088 170 C1130 120 1180 160 1164 210" stroke="#5B7268" stroke-width="2"/>
    </g>
    <g fill="none" stroke="#1C1C1C" stroke-linecap="round" opacity=".1">
      <path d="M64 800 V280" stroke-width="3"/>
      <path d="M64 360 H24 M64 470 H104" stroke-width="2"/>
    </g>
  </svg>`;
}

function ensoSvg() {
  return `<div class="enso" aria-hidden="true">
    <svg class="enso-svg" viewBox="0 0 160 160">
      <path d="M80 18 C122 20 144 52 142 88 C140 128 108 148 74 146 C38 144 16 116 20 80 C24 42 50 20 86 24" fill="none" stroke="#1C1C1C" stroke-width="7" stroke-linecap="round" opacity=".72"/>
    </svg>
    <span class="seal"><i>掼</i><i>蛋</i></span>
  </div>`;
}

export const OPENING_COLUMN = 430;

/** Size of the table that fades in at 3130ms: the real window, not the 430px column. */
export function fadedTableBox(appWidth, appHeight) {
  const width = Math.max(0, Math.round(Number(appWidth) || 0));
  const height = Math.max(0, Math.round(Number(appHeight) || 0));
  return { width, height, portrait: isPortraitPhone(width, height) };
}

export function stageWidthBeforeReveal(appWidth) {
  const width = Math.max(0, Number(appWidth) || 0);
  return Math.min(width, OPENING_COLUMN);
}

export function stageWidthAfterReveal(appWidth) {
  return Math.max(0, Number(appWidth) || 0);
}

export function mount(app, game) {
  prepareOpeningArt();
  const ui = new UI(app, game);
  app.addEventListener('click', (event) => ui.onClick(event));
  const relayout = () => ui.paint();
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', relayout);
  const mq = window.matchMedia?.('(orientation: portrait) and (max-width: 600px)');
  if (mq?.addEventListener) mq.addEventListener('change', relayout);
  else if (mq?.addListener) mq.addListener(relayout);
  ui.paint({ live: true });
  return ui;
}

class UI {
  constructor(app, game) {
    this.app = app;
    this.game = game;
    this.selected = new Set();
    this.arrange = 'rank';
    this.grouping = false;
    this.groupTypes = [];
    this.groupResult = null;
    this.groupKey = '';
    this.view = null;
    this.savedCompose = null;
    this.rules = false;
    this.settings = false;
    this.muted = false;
    this.toastMsg = '';
    this.toastT = 0;
    this.heard = 0;
    this.aiT = 0;
    this.selKey = '';
    this.hintIndex = -1;
    this.counterPin = null;
    this.counterSheet = false;
    this.seenHand = null;
    this.composeType = null;
    this.ruleOpen = false;
    this.difficulty = loadDifficulty();
    this.opening = false;
    game.setDifficulty(this.difficulty);
  }

  width() {
    if (this.stageBox) return this.stageBox.width;
    return this.app.clientWidth || window.innerWidth || 390;
  }

  isDesktop() {
    return this.width() >= 1100;
  }

  portrait() {
    const width = this.width();
    const height = this.stageBox?.height || this.app.clientHeight || window.innerHeight || 0;
    return isPortraitPhone(width, height);
  }

  onClick(event) {
    const act = event.target.closest('[data-act]');
    if (act) {
      event.preventDefault();
      this.action(act.dataset.act);
      return;
    }
    const fan = event.target.closest('.fan-zone');
    if (fan) {
      const id = this.fanPick(event, fan);
      if (id != null) this.onCard(id);
      return;
    }
    const card = event.target.closest('[data-cid]');
    if (card) this.onCard(Number(card.dataset.cid));
  }

  fanPick(event, fan) {
    const row = fan.querySelector('.fan-row');
    if (!row) return null;
    const rect = row.getBoundingClientRect();
    const selected = [...row.querySelectorAll('.fc.selected')].map((node) => Number(node.dataset.index));
    const ch = Number(row.dataset.ch);
    const index = fanHitIndex(
      event.clientX - rect.left,
      Number(row.dataset.n),
      Number(row.dataset.step),
      Number(row.dataset.offset),
      Number(row.dataset.cw),
      Number(row.dataset.magnet),
      selected,
      { y: event.clientY - rect.top, cardTop: rect.height - ch },
    );
    if (index < 0) return null;
    const ids = (row.dataset.ids || '').split(',').map(Number);
    return Number.isFinite(ids[index]) ? ids[index] : null;
  }

  onKey(event) {
    if (event.key === 'Escape' && (this.rules || this.settings || this.counterSheet)) {
      this.rules = false;
      this.settings = false;
      this.counterSheet = false;
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
      this.settings = false;
      this.paint();
      return;
    }
    if (name === 'close-rules') {
      this.rules = false;
      this.paint();
      return;
    }
    if (name === 'settings') {
      this.settings = true;
      this.rules = false;
      this.paint();
      return;
    }
    if (name === 'close-settings') {
      this.settings = false;
      this.paint();
      return;
    }
    if (name === 'mute') {
      this.muted = !this.muted;
      this.paint();
      return;
    }
    if (name.startsWith('diff-')) {
      const difficulty = name.slice(5);
      if (difficulty === 'easy' || difficulty === 'balanced' || difficulty === 'sharp') {
        this.difficulty = difficulty;
        game.setDifficulty(difficulty);
        saveDifficulty(difficulty);
      }
      this.paint();
      return;
    }
    if (name === 'counter-close') {
      this.counterPin = false;
      this.counterSheet = false;
      this.paint();
      return;
    }
    if (name === 'counter-open' || name === 'counter-toggle') {
      const open = this.counterVisible() && this.counterSheet;
      if (name === 'counter-toggle' && open) {
        this.counterPin = false;
        this.counterSheet = false;
      } else {
        this.counterPin = true;
        this.counterSheet = true;
      }
      this.paint();
      return;
    }
    if (name === 'start' || name === 'restart') {
      if (name === 'start' && this.opening) return;
      this.selected.clear();
      this.hintIndex = -1;
      this.selKey = '';
      this.composeType = null;
      game.setDifficulty(this.difficulty);
      if (!shouldPlayOpening(name)) {
        game.startMatch();
        this.paint({ live: true });
        return;
      }
      this.opening = true;
      this.app.classList.add('staging');
      game.startMatch();
      this.heard = game.sfxSeq;
      playOpening(this.app, {
        sound: !this.muted,
        onReveal: () => this.mountTableUnderOpening(),
      }).then(() => {
        if (!this.opening) return;
        this.opening = false;
        const width = this.app.clientWidth || 0;
        const same = this.stageBox && Math.abs(width - this.stageBox.width) <= 2;
        this.stageBox = null;
        if (same) this.adoptOpenedTable();
        else this.paint({ live: true });
      });
      return;
    }
    if (name === 'arrange') {
      this.arrange = nextArrange(this.arrange);
      this.paint();
      return;
    }
    if (name.startsWith('mode-')) {
      const mode = name.slice(5);
      if (ARRANGE[mode]) this.arrange = mode;
      this.paint();
      return;
    }
    if (name === 'group-toggle') {
      this.grouping = !this.grouping;
      if (this.grouping) {
        this.savedCompose = this.composeType;
        this.composeType = null;
      } else {
        this.composeType = this.savedCompose;
      }
      this.paint();
      return;
    }
    if (name === 'group-undo') {
      this.groupTypes.pop();
      this.paint();
      return;
    }
    if (name === 'group-clear') {
      this.groupTypes = [];
      this.paint();
      return;
    }
    if (name.startsWith('type-')) {
      const type = name.slice(5);
      if (!COMPOSE_TYPES.some(([id]) => id === type)) return;
      if (this.grouping) this.groupTypes.push(type);
      else this.composeType = type;
      this.paint();
      return;
    }
    if (name === 'rule-toggle') {
      this.ruleOpen = !this.ruleOpen;
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
    const chip = chipTypeForCombo(move);
    if (chip && !this.grouping) this.composeType = chip;
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
    this.composeType = null;
    if (game.phase === 'tributeChoice' && game.tribute?.waiting?.kind === 'return') {
      const card = pickReturnCard(game.seats[0].hand);
      if (card) this.selected.add(card.id);
    }
  }

  syncHand() {
    const handNo = this.game.handNo;
    if (this.seenHand === handNo) return;
    this.seenHand = handNo;
    this.counterPin = null;
    this.counterSheet = false;
  }

  tightenHand() {
    const root = this.app;
    const rows = root.querySelector('.hand-rows');
    const buttons = root.querySelector('.btns');
    if (!rows || !buttons) return;
    for (let pass = 0; pass < 8; pass++) {
      const cards = [...rows.querySelectorAll('.hc')];
      if (!cards.length) return;
      const cw = cards[0].getBoundingClientRect().width;
      const tooWide = root.scrollWidth > root.clientWidth + 1
        || rows.scrollWidth > rows.clientWidth + 1
        || [...rows.querySelectorAll('.hand-row')].some((row) => row.scrollWidth > row.clientWidth + 1);
      const tooTall = buttons.getBoundingClientRect().bottom > root.clientHeight + 1;
      if (!tooWide && !tooTall) return;
      const next = Math.max(16, Math.floor(cw - 1));
      if (next >= cw) return;
      const ch = Math.round(next / 0.7);
      for (const card of cards) {
        card.style.width = `${next}px`;
        card.style.height = `${ch}px`;
      }
    }
  }

  counterVisible() {
    if (this.game.phase === 'start') return false;
    if (this.counterPin === true) return true;
    if (this.counterPin === false) return false;
    return this.game.seats.some((seat) => seat.hand.length < 10);
  }

  refreshPlans() {
    const hand = this.game.seats[0]?.hand || [];
    const level = this.game.level || '2';
    if (this.grouping && this.groupTypes.length) {
      const key = `${level}|${this.groupTypes.join('.')}|${hand.map((card) => card.id).sort((a, b) => a - b).join(',')}`;
      if (key !== this.groupKey) {
        this.groupKey = key;
        this.groupResult = planCustomGroups(hand, level, this.groupTypes);
      }
    } else {
      this.groupResult = null;
      this.groupKey = '';
    }
    this.view = this.groupResult?.ok ? this.groupResult : arrangeHand(hand, level, this.arrange);
  }

  arrangeInfo() {
    const info = ARRANGE[this.arrange] || ARRANGE.rank;
    if (this.arrange === 'hands' && this.view && this.view.plays != null && !this.groupResult?.ok) {
      return { ...info, now: `${info.now} · ${this.view.plays}手` };
    }
    return info;
  }

  modeButtons() {
    return Object.entries(ARRANGE).map(([id, item]) => `
      <button type="button" class="mode-chip${this.arrange === id ? ' on' : ''}" data-act="mode-${id}" aria-pressed="${this.arrange === id}">${item.name}</button>`).join('');
  }

  groupBoxHtml(withCompose) {
    const toggle = `<button type="button" class="type-chip group-toggle${this.grouping ? ' on' : ''}" data-act="group-toggle" aria-pressed="${this.grouping}">组牌</button>`;
    let chips = '';
    if (this.grouping) {
      chips = COMPOSE_TYPES.map(([id, name]) => {
        const count = this.groupTypes.filter((type) => type === id).length;
        return `<button type="button" class="type-chip${count ? ' picked' : ''}" data-act="type-${id}" aria-pressed="${count > 0}">${name}${count ? `<i>${count}</i>` : ''}</button>`;
      }).join('');
    } else if (withCompose) {
      chips = COMPOSE_TYPES.map(([id, name]) => `
        <button type="button" class="type-chip${this.composeType === id ? ' on' : ''}" data-act="type-${id}" aria-pressed="${this.composeType === id}">${name}</button>`).join('');
    }
    const actions = this.grouping && this.groupTypes.length
      ? `<button type="button" class="text-btn slim" data-act="group-undo">撤销</button><button type="button" class="text-btn slim" data-act="group-clear">清空</button>`
      : '';
    let note = '';
    let tone = 'idle';
    if (this.grouping) {
      if (!this.groupTypes.length) note = '点选牌型，验证这一手能不能组成';
      else if (this.groupResult?.ok) {
        note = this.groupResult.summary;
        tone = 'ok';
      } else {
        note = `组不成：${this.groupResult?.reason || '牌型对不上'}。手牌保持原样`;
        tone = 'bad';
      }
    }
    const noteHtml = note
      ? `<div class="group-note ${tone}">${actions}<span>${esc(note)}</span></div>`
      : '';
    return `<div class="group-box"><div class="type-row">${toggle}${chips}</div>${noteHtml}</div>`;
  }

  mountTableUnderOpening() {
    const stage = this.app.querySelector('.deux-stage');
    const slot = stage?.querySelector('.table-slot');
    const layer = this.app.querySelector('.deux-opening');
    if (!stage || !slot || slot.dataset.ready) return;
    slot.dataset.ready = '1';
    layer?.classList.add('reveal');
    const box = fadedTableBox(
      this.app.clientWidth || window.innerWidth || 390,
      this.app.clientHeight || window.innerHeight || 800,
    );
    this.stageBox = { width: box.width, height: box.height };
    this.syncHand();
    this.syncSelection();
    this.refreshPlans();
    const portrait = this.portrait();
    if (portrait && this.counterPin !== false && this.counterVisible()) this.counterSheet = true;
    this.app.classList.toggle('portrait', portrait);
    slot.style.left = '50%';
    slot.style.right = 'auto';
    slot.style.top = '0';
    slot.style.bottom = '0';
    slot.style.width = `${box.width}px`;
    slot.style.height = `${box.height}px`;
    slot.style.marginLeft = `${-Math.round(box.width / 2)}px`;
    slot.innerHTML = this.html();
    if (!portrait) this.tightenHand();
    this.bindSheet();
    void slot.offsetWidth;
    slot.classList.add('show');
  }

  adoptOpenedTable() {
    const slot = this.app.querySelector('.table-slot');
    if (!slot) {
      this.paint({ live: true });
      return;
    }
    const portrait = this.app.classList.contains('portrait');
    const frag = document.createDocumentFragment();
    while (slot.firstChild) frag.appendChild(slot.firstChild);
    this.app.classList.remove('staging');
    this.app.innerHTML = '';
    this.app.classList.toggle('portrait', portrait);
    this.app.appendChild(frag);
    this.bindSheet();
  }

  paint({ live = false } = {}) {
    if (this.opening) return;
    this.syncHand();
    this.syncSelection();
    this.refreshPlans();
    const portrait = this.portrait();
    if (portrait && this.counterPin !== false && this.counterVisible()) this.counterSheet = true;
    this.app.classList.toggle('portrait', portrait);
    this.app.classList.toggle('staging', this.game.phase === 'start' || this.opening);
    this.app.innerHTML = this.html();
    if (!portrait) this.tightenHand();
    this.bindSheet();
    if (live) {
      this.playSfx();
      this.queueAI();
    }
  }

  bindSheet() {
    const sheet = this.app.querySelector('.p-sheet');
    const handle = sheet?.querySelector('.sheet-handle');
    if (!sheet || !handle) return;
    let startY = 0;
    let dy = 0;
    let dragging = false;
    handle.addEventListener('pointerdown', (event) => {
      dragging = true;
      startY = event.clientY;
      dy = 0;
      handle.setPointerCapture?.(event.pointerId);
    });
    handle.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      dy = event.clientY - startY;
      sheet.style.transform = dy > 0 ? `translateY(${Math.min(dy, 180)}px)` : '';
    });
    const finish = () => {
      if (!dragging) return;
      dragging = false;
      if (dy > 48) this.action('counter-close');
      else sheet.style.transform = '';
    };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }

  playSfx() {
    const game = this.game;
    if (game.sfxSeq === this.heard) return;
    this.heard = game.sfxSeq;
    if (this.muted) return;
    blip(game.sfx);
  }

  aiDelay(bomb) {
    const narrow = this.width() < 800;
    if (narrow) return bomb ? 520 : 400;
    if (this.game.difficulty === 'sharp') return bomb ? 780 : 620;
    return bomb ? 860 : 640;
  }

  queueAI() {
    clearTimeout(this.aiT);
    const game = this.game;
    if (game.phase === 'play' && game.turn !== 0) {
      const bomb = game.trick?.combo && (game.trick.combo.type === 'bomb' || game.trick.combo.type === 'straightflush' || game.trick.combo.type === 'jokerbomb');
      this.aiT = setTimeout(() => this.aiStep(), this.aiDelay(bomb));
    } else if (game.phase === 'tributeReveal') {
      this.aiT = setTimeout(() => {
        if (this.game.phase !== 'tributeReveal') return;
        this.game.ackTribute();
        this.paint({ live: true });
      }, 1600);
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
    const counter = this.portrait() ? '' : this.counterSheetHtml();
    return `${this.tableHtml()}${counter}${this.overlayHtml()}${this.settingsHtml()}${this.rulesHtml()}${this.toastHtml()}`;
  }

  diffGrid() {
    return `<div class="diff-grid">${DIFFS.map(([id, name, text]) => `
      <button type="button" class="diff-card${this.difficulty === id ? ' on' : ''}" data-act="diff-${id}" aria-pressed="${this.difficulty === id}">
        <b>${name}</b><span>${text}</span>
      </button>`).join('')}</div>`;
  }

  startHtml() {
    return `
      <section class="start">
        <div class="start-wave" aria-hidden="true"></div>
        <p class="kicker">DEUX · 四人分组</p>
        <h1>掼蛋</h1>
        <p class="lead">从二打到 A。你和对家一队，先过 A 的一边获胜。</p>
        <div class="home-fan" aria-hidden="true">
          <div class="home-mini a">
            <div class="idx">A</div>
            <div class="pip">♠</div>
          </div>
          <div class="home-mini b">
            <div class="idx red">2</div>
            <div class="pip red">♥</div>
          </div>
          <div class="home-mini c">
            <div class="idx">王</div>
            <div class="joker-mark"></div>
            <div class="cn">大王</div>
          </div>
        </div>
        <p class="diff-head">电脑难度</p>
        ${this.diffGrid()}
        <p class="diff-note">三家电脑同一难度，对局中可在设置里更改</p>
        <div class="start-actions">
          <button type="button" class="btn ghost" data-act="rules">规则说明</button>
          <button type="button" class="btn play" data-act="start">开始对局</button>
        </div>
      </section>`;
  }

  tableHtml() {
    if (this.portrait()) return this.portraitHtml();
    const game = this.game;
    const width = this.width();
    const metrics = cardMetrics(width);
    const mine = game.turn === 0 && game.phase === 'play';
    const items = handItems(this.view);
    const height = this.app.clientHeight || window.innerHeight || 800;
    const draft = twoRowLayout({ width, height, n: items.length });
    const topGaps = items.slice(0, draft.top).filter((item) => item.gap).length;
    const bottomGaps = items.slice(draft.top).filter((item) => item.gap).length;
    const layout = twoRowLayout({
      width,
      height,
      n: items.length,
      extra: Math.max(topGaps, bottomGaps) * 8,
    });
    const sideMax = Math.max(96, Math.floor((width - 28) / 3) - 8);
    const wideMax = Math.max(120, Math.floor(width * 0.34));
    const playW = height < 520 ? Math.min(metrics.play, 24) : metrics.play;
    const wild = svgCard({ rank: game.level, suit: 'H' }, game.level, { width: 26 });
    const returning = game.phase === 'tributeChoice' && game.tribute?.waiting?.kind === 'return';
    const hand = this.handRowsHtml(items, layout, returning);
    const owner = game.levelOwner == null ? '' : game.levelOwner === 0 ? ' · 我方' : ' · 对方';
    const short = game.seats.filter((seat) => seat.hand.length < 10).map((seat) => seat.name);
    const banner = this.counterVisible() && !this.counterSheet && short.length
      ? `<button type="button" class="counter-banner" data-act="counter-open">${esc(short.join('、'))}手牌 &lt; 10，记牌器已开启</button>`
      : '';
    const counterOpen = this.counterVisible();

    return `
      <header class="top">
        <div class="brand">掼蛋</div>
        <div class="meta">
          <span class="chip">我方 ${esc(game.teamLevel[0])} · 对方 ${esc(game.teamLevel[1])}</span>
          <span class="chip">第 ${game.handNo} 局 · 打 ${esc(game.level)}${esc(owner)}</span>
          <span class="wild-pill">逢人配 ${wild}</span>
        </div>
        <button type="button" class="text-btn" data-act="rules">规则</button>
        <button type="button" class="text-btn" data-act="settings">设置</button>
        <button type="button" class="text-btn${counterOpen ? ' on' : ''}" data-act="counter-toggle">记牌</button>
      </header>
      <div class="stage">
        ${washSvg()}
        <div class="mat">
          <div class="plays">
            ${this.seatBlock(3, playW, sideMax, 'west')}
            <div class="plays-mid">
              ${this.seatBlock(2, playW, wideMax, 'north')}
              ${this.seatBlock(0, playW, wideMax, 'south')}
            </div>
            ${this.seatBlock(1, playW, sideMax, 'east')}
          </div>
          <p class="status">${esc(game.message || '')}</p>
        </div>
          ${this.tributeBar()}
          ${this.ruleBarHtml()}
          ${this.groupBoxHtml(false)}
        <div class="hand-zone">
          <div class="hand-rows" style="gap:${layout.rowGap}px">${hand}</div>
        </div>
        ${banner}
        ${this.buttonsHtml(mine)}
      </div>`;
  }

  portraitHtml() {
    const game = this.game;
    const width = this.width();
    const mine = game.turn === 0 && game.phase === 'play';
    const items = handItems(this.view);
    const returning = game.phase === 'tributeChoice' && game.tribute?.waiting?.kind === 'return';
    const selected = items.filter((item) => this.selected.has(item.card.id)).map((item) => item.card);
    const current = game.phase === 'play' ? (game.trick?.combo || null) : null;
    const verdict = game.phase === 'play'
      ? composeVerdict(selected, game.level, this.composeType, current)
      : { state: 'empty', text: '', canPlay: false };
    const owner = game.levelOwner == null ? '' : game.levelOwner === 0 ? ' · 我方' : ' · 对方';
    const counterOn = this.counterVisible() && this.counterSheet;
    return `
      <div class="portrait-root">
        <header class="top p-top">
          <div class="brand">掼蛋</div>
          <div class="meta">
            <span class="chip">打 ${esc(game.level)}${esc(owner)}</span>
            <span class="wild-pill">逢人配 ${SUIT_SYMBOL.H}${esc(game.level)}</span>
          </div>
          <button type="button" class="text-btn${counterOn ? ' on' : ''}" data-act="counter-toggle">记牌</button>
        </header>
        <div class="stage p-stage">
          ${washSvg()}
          <div class="opp-row">
            ${this.oppChip(3, width)}
            ${this.oppChip(2, width)}
            ${this.oppChip(1, width)}
          </div>
          ${this.playWellHtml(width)}
          ${this.tributeBar()}
          ${this.portraitSheetHtml()}
          ${this.portraitToolsHtml(verdict)}
          ${this.zoomTrayHtml(selected, width)}
          ${this.fanHtml(items, width, returning)}
          ${this.portraitButtons(mine, verdict.canPlay)}
        </div>
      </div>`;
  }

  oppChip(id, width) {
    const game = this.game;
    const seat = game.seats[id];
    const hot = game.turn === id && game.phase === 'play';
    const count = seat.finish && seat.hand.length === 0 ? FINISH_NAME[seat.finish] : `${seat.hand.length} 张`;
    const thinking = game.turn === id && game.phase === 'play' && !seat.shown;
    const chipW = Math.max(64, Math.floor((width - 40) / 3) - 12);
    let last = '<span class="opp-pass">—</span>';
    if (thinking) last = '<span class="opp-pass">思考</span>';
    else if (seat.shown?.pass) last = '<span class="opp-pass">不出</span>';
    else if (seat.shown?.cards?.length) last = packedRow(seat.shown.cards, game.level, chipW, 18);
    return `
      <section class="opp ${TONE[id]}${hot ? ' turn' : ''}">
        <div class="opp-h"><b>${esc(seat.name)}</b><span>${esc(count)}</span></div>
        <div class="opp-last">${last}</div>
      </section>`;
  }

  playWellHtml(width) {
    const game = this.game;
    const winner = game.trick?.winner;
    const seat = winner == null ? null : game.seats[winner];
    const shown = seat?.shown && !seat.shown.pass ? seat.shown : null;
    const playedName = shown?.combo?.type === 'tube' ? '连对' : (shown ? typeLabel(shown.combo) : '');
    const cards = shown
      ? `<div class="play-label">${esc(seat.name)} · ${esc(playedName)}</div>${packedRow(shown.cards, game.level, Math.max(120, width - 28), 46)}`
      : '';
    return `
      <div class="play-well">
        ${cards}
        <p class="status">${esc(game.message || '')}</p>
      </div>`;
  }

  portraitSheetHtml() {
    if (!this.counterVisible() || !this.counterSheet) return '';
    return `<div class="p-sheet"><button type="button" class="sheet-handle" aria-label="下滑收起记牌器"></button>${this.counterHtml()}</div>`;
  }

  portraitToolsHtml(verdict) {
    const info = this.arrangeInfo();
    const modes = this.modeButtons();
    const banner = verdict.state === 'empty' ? '' : `<p class="compose-banner ${esc(verdict.state)}">${esc(verdict.text)}</p>`;
    const rule = this.ruleOpen
      ? `<p class="rule-now"><span><b>${esc(info.now)}</b>${esc(info.body)}</span></p>`
      : '';
    return `
      <section class="p-tools">
        <div class="tool-line">
          <div class="modes">${modes}</div>
          <button type="button" class="text-btn slim" data-act="rule-toggle" aria-expanded="${this.ruleOpen}">理牌说明</button>
          <button type="button" class="text-btn slim" data-act="rules">规则</button>
          <button type="button" class="text-btn slim" data-act="settings">设置</button>
        </div>
        ${rule}
        ${this.groupBoxHtml(true)}
        ${banner}
      </section>`;
  }

  zoomTrayHtml(cards, width) {
    const caption = '<p class="zoom-caption">点击手牌后放大查看完整牌面 · 再点即可收回</p>';
    if (!cards.length) return `<div class="zoom-tray">${caption}</div>`;
    const size = zoomCardWidth(width, cards.length);
    const faces = cards.map((card) => `
      <button type="button" class="zc" data-cid="${card.id}" style="width:${size.cw}px" aria-label="${esc(cardText(card))}">
        ${svgCard(card, this.game.level, { selected: true, width: size.cw })}
      </button>`).join('');
    return `<div class="zoom-tray">${caption}<div class="zoom-row" style="gap:${size.gap}px">${faces}</div></div>`;
  }

  fanHtml(items, width, returning) {
    if (!items.length) return '<div class="fan-zone"><p class="empty-hand">牌已出完</p></div>';
    const layout = portraitFanLayout(width, items.length);
    const game = this.game;
    const cards = items.map((item, i) => {
      const selected = this.selected.has(item.card.id);
      const dim = returning && game.seats[0].hand.some(isReturnable) && !isReturnable(item.card);
      const left = layout.offset + i * layout.step;
      return `
        <button type="button" class="fc${selected ? ' selected' : ''}${dim ? ' dim' : ''}" data-cid="${item.card.id}" data-index="${i}"
          style="left:${left.toFixed(2)}px;width:${layout.cw}px;height:${layout.ch}px;z-index:${selected ? 40 + i : i}"
          aria-label="${esc(cardText(item.card))}" aria-pressed="${selected}">
          ${svgCard(item.card, game.level, { selected, width: layout.cw, fan: true })}
        </button>`;
    }).join('');
    return `
      <div class="fan-zone">
        <div class="fan-row" style="height:${layout.ch + 18}px"
          data-n="${items.length}" data-step="${layout.step}" data-offset="${layout.offset}"
          data-cw="${layout.cw}" data-ch="${layout.ch}" data-magnet="${layout.magnet}" data-ids="${items.map((item) => item.card.id).join(',')}">
          ${cards}
        </div>
      </div>`;
  }

  portraitButtons(mine, canPlay) {
    const playOn = mine && canPlay;
    return `
      <div class="btns p-btns">
        <button type="button" class="btn ghost" data-act="hint" ${mine ? '' : 'disabled'}>提示</button>
        <button type="button" class="btn pass" data-act="pass" ${mine ? '' : 'disabled'}>不出</button>
        <button type="button" class="btn play" data-act="play" ${playOn ? '' : 'disabled'}>出牌</button>
      </div>`;
  }

  handRowsHtml(items, layout, returning) {
    if (!items.length) return '<p class="empty-hand">牌已出完</p>';
    const game = this.game;
    const slices = [items.slice(0, layout.top), items.slice(layout.top)].filter((row) => row.length);
    return slices.map((row) => {
      const cards = row.map((item) => {
        const selected = this.selected.has(item.card.id);
        const dim = returning && game.seats[0].hand.some(isReturnable) && !isReturnable(item.card);
        const gap = item.gap ? `margin-left:${layout.gap + 8}px;` : '';
        return `
          <button type="button" class="hc${selected ? ' selected' : ''}${dim ? ' dim' : ''}" data-cid="${item.card.id}"
            style="width:${layout.cw}px;height:${layout.ch}px;${gap}"
            aria-label="${esc(cardText(item.card))}" aria-pressed="${selected}">
            ${svgCard(item.card, game.level, { selected, width: layout.cw })}
          </button>`;
      }).join('');
      return `<div class="hand-row" data-count="${row.length}" style="gap:${layout.gap}px">${cards}</div>`;
    }).join('');
  }

  seatBlock(id, cardW, maxW, extra) {
    const seat = this.game.seats[id];
    const hot = this.game.turn === id && this.game.phase === 'play';
    const count = seat.finish ? FINISH_NAME[seat.finish] : `剩余 ${seat.hand.length} 张`;
    return `
      <section class="seat ${TONE[id]}${hot ? ' turn' : ''} ${extra || ''}">
        <div class="seat-h"><b>${COMPASS[id]} · ${esc(seat.name)}</b><span>${esc(count)}</span></div>
        ${this.pileHtml(id, cardW, maxW)}
      </section>`;
  }

  pileHtml(id, cardW, maxW) {
    const game = this.game;
    const seat = game.seats[id];
    const thinking = game.turn === id && game.phase === 'play' && !seat.shown;
    if (!seat.shown) return thinking && id !== 0 ? `<p class="think">思考</p>` : '';
    if (seat.shown.pass) {
      return `<div class="pass-mark"><svg viewBox="0 0 86 18" aria-hidden="true"><path d="M4 12 Q 32 2 82 11" fill="none" stroke="#1C1C1C" stroke-width="2.6" stroke-linecap="round"/></svg><span>${esc(seat.name)} · 不出</span></div>`;
    }
    const hot = game.trick?.winner === id;
    return `
      <div class="pile${hot ? ' hot' : ''}">
        <div class="pile-label">${esc(seat.name)} · ${esc(typeLabel(seat.shown.combo))}</div>
        ${faceRow(seat.shown.cards, game.level, cardW, maxW)}
        ${hot ? '<span class="max-badge">最大</span>' : ''}
      </div>`;
  }

  ruleBarHtml() {
    const info = this.arrangeInfo();
    const pattern = this.patternLine();
    return `
      <section class="rulebar" aria-live="polite">
        <div class="modes">${this.modeButtons()}</div>
        <p class="rule-now"><span class="rule-seal">规则</span><span><b>${esc(info.now)}</b>${esc(info.body)}</span></p>
        ${pattern ? `<p class="pattern-line">${esc(pattern)}</p>` : ''}
      </section>`;
  }

  patternLine() {
    const game = this.game;
    if (game.phase === 'tributeChoice' && game.tribute?.waiting?.kind === 'return') {
      return '还贡：还一张牌面 ≤10 的牌。没有小牌时还最小的非王牌。';
    }
    if (game.phase !== 'play') return '';
    const cards = game.seats[0].hand.filter((card) => this.selected.has(card.id));
    if (!cards.length) return '';
    const shape = evaluateSelection(cards, game.level, null);
    if (!shape.ok) return shape.reason;
    const rule = PATTERN[shape.combo.type] || typeLabel(shape.combo);
    if (game.turn !== 0 || !game.trick?.combo) return rule;
    const beat = evaluateSelection(cards, game.level, game.trick.combo);
    if (!beat.ok) return `${rule} ${beat.reason}`;
    return rule;
  }

  buttonsHtml(mine) {
    return `
      <div class="btns">
        <button type="button" class="btn ghost" data-act="arrange">理牌</button>
        <button type="button" class="btn ghost" data-act="hint" ${mine ? '' : 'disabled'}>提示</button>
        <button type="button" class="btn pass" data-act="pass" ${mine ? '' : 'disabled'}>不出</button>
        <button type="button" class="btn play" data-act="play" ${mine ? '' : 'disabled'}>出牌</button>
      </div>`;
  }

  counterHtml() {
    const game = this.game;
    const pool = unplayedPool(game.seats.map((seat) => seat.hand), game.level);
    const rows = game.seats.map((seat, id) => {
      const count = seat.finish && seat.hand.length === 0 ? FINISH_NAME[seat.finish] : `${seat.hand.length} 张`;
      return `<li class="who-row ${TONE[id]}"><i></i><span>${COMPASS[id]} · ${esc(seat.name)}</span><b>${esc(count)}</b></li>`;
    }).join('');
    const suits = [
      ['S', '黑桃', '♠', ''],
      ['H', '红桃', '♥', 'red'],
      ['C', '梅花', '♣', ''],
      ['D', '方块', '♦', 'red'],
    ].map(([id, name, symbol, tone]) => `
      <div class="suit-cell ${tone}"><span>${symbol}</span><small>${name}</small><b>${pool.suits[id]}</b></div>`).join('');
    const cells = (ranks) => ranks.map((rank) => {
      const n = pool.ranks[rank];
      return `<div class="rank-cell${n ? '' : ' out'}"><b>${rank}</b><em>${n || '出完'}</em></div>`;
    }).join('');
    return `
      <section class="counter">
        <header class="counter-h">
          <h2>记牌器</h2>
          <p class="fine">手牌 &lt; 10 自动开启</p>
          <p class="fine">只统计未出牌池与各家张数，不看别人手牌。</p>
        </header>
        <h3>各家剩余</h3>
        <ul class="who-list">${rows}</ul>
        <h3>花色剩余</h3>
        <div class="suit-row">${suits}</div>
        <h3>点数剩余</h3>
        <div class="rank-grid">${cells(['2', '3', '4', '5', '6', '7', '8'])}</div>
        <div class="rank-grid six">${cells(['9', '10', 'J', 'Q', 'K', 'A'])}</div>
        <div class="joker-row">
          <div><b>逢人配</b><em>${pool.wild}</em></div>
          <div><b>小王</b><em>${pool.sj}</em></div>
          <div><b>大王</b><em>${pool.bj}</em></div>
        </div>
        <p class="level-left">级牌 ${esc(game.level)} 还剩 ${pool.levelCount} 张</p>
        <button type="button" class="btn ghost wide" data-act="counter-close">收起记牌器</button>
        <p class="fine">任一家低于 10 张时自动开启，可手动关闭</p>
      </section>`;
  }

  counterSheetHtml() {
    if (!this.counterVisible() || !this.counterSheet) return '';
    return `<div class="overlay counter-overlay"><div class="sheet counter-sheet">${this.counterHtml()}</div></div>`;
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
            <p>${esc(game.message)}</p>
          </div>
          <button type="button" class="btn play" data-act="give">确认进贡</button>
        </div>`;
    }
    return `
      <div class="banner">
        <div>
          <b>还贡</b>
          <p>${esc(game.message)}</p>
        </div>
        <button type="button" class="btn play" data-act="return">确认还贡</button>
      </div>`;
  }

  overlayHtml() {
    const game = this.game;
    if (game.phase === 'handEnd') return this.sheet(this.handEndInner(), '<button type="button" class="btn play" data-act="continue">继续</button>');
    if (game.phase === 'tributeReveal') {
      const lines = (game.tribute?.lines || []).map((line) => `<li>${esc(line)}</li>`).join('');
      return this.sheet(`<h2>${game.tribute?.resist ? '抗贡' : '进贡'}</h2><ul class="rank-list">${lines}</ul>`, '<button type="button" class="btn play" data-act="ack">开始出牌</button>');
    }
    if (game.phase === 'matchEnd') {
      const win = game.winner === 0;
      return this.sheet(`
        <h2>${win ? '我方过 A' : '对方过 A'}</h2>
        <p class="lead-ink">${win ? '这局搭档配合赢下了整场。' : '对方先过了 A。再来一局可以从头打。'}</p>
        ${this.rankList()}
        <p class="level-line">我方 ${esc(game.teamLevel[0])} · 对方 ${esc(game.teamLevel[1])}</p>
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
      <p class="level-line">${esc(upgrade)}</p>
      <p class="level-line">下一局打 ${esc(game.level)}，逢人配 ${SUIT_SYMBOL.H}${esc(game.level)}</p>`;
  }

  rankList() {
    const game = this.game;
    const order = game.lastOrder || [];
    if (!order.length) return '';
    return `<ol class="rank-list">${order.map((id, i) => `<li><b>${FINISH_NAME[i + 1]}</b> ${esc(game.seats[id].name)}</li>`).join('')}</ol>`;
  }

  sheet(inner, actions) {
    return `<div class="overlay"><div class="sheet">${inner}<div class="sheet-actions">${actions}</div></div></div>`;
  }

  settingsHtml() {
    if (!this.settings) return '';
    return `
      <div class="overlay">
        <div class="sheet">
          <h2>设置</h2>
          <p>三家电脑同一难度，下一手就生效。</p>
          ${this.diffGrid()}
          <div class="sheet-actions">
            <button type="button" class="btn ghost" data-act="mute">${this.muted ? '打开声音' : '关闭声音'}</button>
            <button type="button" class="btn play" data-act="close-settings">完成</button>
          </div>
        </div>
      </div>`;
  }

  rulesHtml() {
    if (!this.rules) return '';
    return `
      <div class="overlay">
        <div class="sheet rules">
          <h2>怎么打</h2>
          <p>你坐南家，对家是队友，西是上家，东是下家。两副牌 108 张，每人 27 张。从 2 打到 A，先过 A 的一队获胜。</p>
          <h3>级牌和逢人配</h3>
          <p>每一局只打一个级数，就是上一局赢家升级后的级数（第一局打 2）。这个点数是级牌，单张、对子、三张、三带二和炸弹里，级牌只比王小。红桃级牌是逢人配，可以当成任意非王牌。</p>
          <h3>牌型</h3>
          <p>单张、对子、三张、三带二（三张带一对）、顺子（必须 5 张）、木板（三连对）、钢板（两连三张）、炸弹（4 张及以上同点）、同花顺、天王炸（四张王）。</p>
          <p>顺子、木板、钢板按自然点数衔接，级牌回到原来的位置，不另算。A2345 最小，10JQKA 最大，不能绕回。木板可以 A23，钢板可以 A2，这里 A 当最小。三带二只比三张，不比对子。</p>
          <h3>大小</h3>
          <p>普通牌型必须同型更大。炸弹可以压任何非炸弹。张数多的炸弹更大；同张数比点数，级牌最大。同花顺大于四炸和五炸，小于六炸及以上；同样的同花顺比花色，黑桃 &gt; 红桃 &gt; 梅花 &gt; 方块。天王炸最大。</p>
          <h3>一轮和接风</h3>
          <p>有人领出后，其余人出更大的同型牌、炸弹，或者不出。其余还有牌的人都不出，这一轮结束，刚才最大的那家继续领出。如果那家已经出完，由对家接风；对家也出完了，就轮到下一家还有牌的人。</p>
          <p>有人出完就是一名。头游和二游是同一队（双上），或者已经有三人出完，这一局就结束，剩下的人按名次排好。</p>
          <h3>升级、进贡、过 A</h3>
          <p>赢家：头游 + 二游升 3 级，头游 + 三游升 2 级，头游 + 末游升 1 级。级数到 A 为止。下一局打赢家当前的级数。</p>
          <p>新的一局发牌后进贡。末游把最大的一张交给头游（逢人配不交）。若是双下，三游和末游都交，较大的给头游，较小的给二游。收到贡牌的人还一张牌面 ≤10 的牌。还完由进贡给头游的那家先出。进贡方手里有两张大王则抗贡，改由头游先出。没有 ≤10 的牌时，还最小的非王牌。</p>
          <p>已经打到 A 的一队，这一局必须头游并且队友不是末游，才算过 A。如果只是头游 + 末游，停在 A 继续打。</p>
          <h3>理牌和记牌</h3>
          <p>理牌有点数、同花顺面、最少出牌手数。点数按本局大小排。同花顺面把已成或只差一张的同花顺排在一起，逢人配只补同花顺，不拆炸弹和天王炸。最少出牌手数按整手最少的合法出牌次数分组，优先三带二，不轻易组顺，逢人配留给炸弹和同花顺。横屏和电脑上，规则条下面有「组牌」：点选若干牌型，能组成就把整手按这个计划排开，组不成会说明原因并保持原来的排法。竖屏手机上，组牌和出牌用的牌型条分开，出牌仍然是点一种牌型再自由组合。选中手牌时，条上写出这种牌型怎么比。竖屏手牌叠成一排，点一下会抬起，并在上方放大看清牌面。不合这种牌型或压不过时不能出牌。</p>
          <p>记牌器在任一家手牌少于 10 张时自动打开，也可以随时点「记牌」。它只显示四家剩余张数，以及还没打出的花色和点数，不亮别人的具体手牌。收起之后可以再打开。</p>
          <h3>电脑难度</h3>
          <p>开局选定轻松、均衡或精算，三家电脑同一档，设置里可以改。轻松合法跟牌、偏出小牌。均衡和精算按实战口诀选牌：惜用逢人配，残局按对手张数防，炸弹留给能决定一局的那一手。精算还会记已经打出的王、二、级牌和缺门。</p>
          <div class="sheet-actions"><button type="button" class="btn ghost" data-act="close-rules">知道了</button></div>
        </div>
      </div>`;
  }

  toastHtml() {
    if (!this.toastMsg) return '';
    return `<div class="toast">${esc(this.toastMsg)}</div>`;
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
