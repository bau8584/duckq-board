// DuckQ Board 화면. 소리는 전부 Engine(engine.js), 저장은 Store(store.js)에 맡긴다.
'use strict';
const VER = 'DuckQ Board 0.3.114 (2026-10-09)';
const COLORS = { gray: '#9AA3AF', purple: '#B57EDC', orange: '#F08C3A', green: '#4FBF8B', red: '#EF5B5B', blue: '#5B8DEF', yellow: '#F2C94C', sky: '#4FC3E0' };
const COLOR_KO = { gray: '회', purple: '자주', orange: '주황', green: '초록', red: '빨강', blue: '파랑', yellow: '노랑', sky: '하늘' };
const COLOR_KEYS = Object.keys(COLORS);
// '투명'(색 없음) 패드: 평소 중립, 재생 중엔 이 밝은 무채색으로 — 다른 색과 같은 규칙(보드 색 안 씀, 소유자 결정 2026-09-29)
// 화이트 화면에선 흰 패드 위에서 안 보이므로 반대로 짙은 먹색으로 켜짐
const CLEAR_LIT = { dark: '#E4E8EF', light: '#2E343D' };
const padHex = p => p.color === 'none' || !COLORS[p.color] ? CLEAR_LIT[S.settings.theme === 'light' ? 'light' : 'dark'] : COLORS[p.color];
const ROWS = { 4: 3, 6: 4, 8: 5 };           // 패드 크기 = 열 수 → 한 화면에 보이는 줄 수 (넘치면 세로 스크롤)
// 새 곡 페이드 기본값은 모두 끔(PLAN-app-fix1 3번). 패드 글자 크기 s/m/l
const DEF_SETTINGS = { theme: 'dark', cols: 6, fadeSec: 2, fadeOverride: false, soloMode: 'each', labelSize: 'm', newFin: false, newFinSec: 1, newFout: false, newFoutSec: 2, fadeMax: 10 };
const PLAYED_IDLE_MS = 6 * 3600 * 1000;   // 마지막 사용 6시간 뒤 PLAYED 저절로 지움
const IC = {
  fi: '<svg viewBox="0 0 24 24"><path d="M3 19L21 5v14z"/></svg>',
  fo: '<svg viewBox="0 0 24 24"><path d="M3 5v14h18z"/></svg>',
  so: '<svg viewBox="0 0 24 24"><path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/></svg>',
  lp: '<svg viewBox="0 0 24 24"><path d="M17 3l3 3-3 3"/><path d="M4 11V9a3 3 0 0 1 3-3h13"/><path d="M7 21l-3-3 3-3"/><path d="M20 13v2a3 3 0 0 1-3 3H4"/></svg>',
};
const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const fmtH = s => { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 3600) + ':' + String(Math.floor(s / 60) % 60).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const fmtT = s => { s = Math.max(0, s || 0); return Math.floor(s / 60) + ':' + (s % 60).toFixed(1).padStart(4, '0'); };   // 0:05.3
// 색 위 글자: 흰/검 중 대비가 큰 쪽 (CSS contrast-color는 구형 사파리 미지원)
const ink = hex => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  const L = .2126 * r + .7152 * g + .0722 * b;
  return (1.05 / (L + .05)) > ((L + .05) / .05) ? '#ffffff' : '#0b0c0e';
};
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'html') el.innerHTML = v;
    else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

// ---------- 기록 (설정 → 최근 기록에서 봄) ----------
const LOG = [];
function logLine(msg, lv) {
  LOG.push(`${new Date().toTimeString().slice(0, 8)} ${lv === 'e' ? '✖ ' : lv === 'w' ? '! ' : ''}${msg}`);
  logTotal++;
  if (LOG.length > 300) LOG.shift();
}
// PC로 자동 전송: q.deokgu.com(또는 PC의 log-server)에서 열었을 때만, 5초마다 → logs/app-날짜.txt. PC가 꺼져 있으면 밀린 것까지 다음에.
let logTotal = 0, logSent = 0;
const LOG_SEND = location.hostname === 'q.deokgu.com' || location.port === '8765';
// 실험실(PLAN-실험실): 선생님 서버에서 열었을 때만. 공개 주소(github.io)에선 칸도 안 보이고 서버에 묻지도 않음
const LAB = LOG_SEND;
let flushing = false;   // 5초 타이머와 화면 숨김이 겹치면 같은 줄을 두 번 보냈음
async function flushLog() {
  if (!LOG_SEND || logSent >= logTotal || flushing) return;
  flushing = true;
  const upto = logTotal, lines = LOG.slice(Math.max(0, LOG.length - (upto - logSent)));
  const head = logSent === 0 ? `\n##### 앱 세션 ${new Date().toISOString()} · ${navigator.userAgent.slice(0, 80)} #####\n` : '';
  try {
    const r = await fetch('/log-app', { method: 'POST', body: head + lines.join('\n') });
    if (r.ok) logSent = upto;
  } catch {}
  flushing = false;
}
// 인터넷 없이 쓴 기록은 아이패드에 남겨 두었다가 다음에 연결될 때 보낸다
const LOG_KEEP = 'duckq-log-pending';
function keepLog() {
  if (!LOG_SEND || (logSent >= logTotal && !kept)) return;
  const now = logSent < logTotal ? LOG.slice(Math.max(0, LOG.length - (logTotal - logSent))).join('\n') : '';
  try { localStorage.setItem(LOG_KEEP, [kept, now].filter(Boolean).join('\n')); } catch {}
}
// 지난번 열었을 때 못 보낸 기록(연 순간 한 번 꺼내 둠 — 이번 기록과 섞이지 않게)
let kept = ''; try { kept = localStorage.getItem(LOG_KEEP) || ''; localStorage.removeItem(LOG_KEEP); } catch {}
async function sendKept() {
  if (!kept) return;
  try { const r = await fetch('/log-app', { method: 'POST', body: `\n##### 지난번 인터넷 없을 때 남은 기록 #####\n${kept}` }); if (r.ok) kept = ''; } catch {}
}
if (LOG_SEND) {
  setInterval(() => { sendKept(); flushLog().then(() => { try { logSent >= logTotal && !kept ? localStorage.removeItem(LOG_KEEP) : keepLog(); } catch {} }); }, 5000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') { keepLog(); flushLog(); } });
}

// ---------- 오프라인 저장 (sw.js) ----------
// 한 번 열면 앱 화면이 아이패드에 담긴다. 새 버전은 설정 [업데이트]로만 받는다.
const APP_VER = (VER.match(/\d+\.\d+\.\d+/) || [''])[0];
const Off = {
  ok: 'serviceWorker' in navigator && isSecureContext,
  saved: '', latest: '',
  async check() {   // 담긴 버전 · 서버 최신 버전
    try { const k = (await caches.keys()).find(n => n.startsWith('duckq-app-')); this.saved = k ? k.slice(10) : ''; } catch { this.saved = ''; }
    this.latest = '';
    if (navigator.onLine) try {
      const t = await (await fetch('index.html?fresh=1', { cache: 'no-store' })).text();
      this.latest = (t.match(/\?v=([\w.]+)/) || [])[1] || '';
    } catch {}
  },
  update() {
    return new Promise((res, rej) => {
      const sw = navigator.serviceWorker.controller; if (!sw) return rej(new Error('아직 준비 안 됨 — 한 번 새로고침'));
      const on = e => { if (!e.data || !e.data.update) return; navigator.serviceWorker.removeEventListener('message', on); e.data.ok ? res(e.data) : rej(new Error(e.data.msg)); };
      navigator.serviceWorker.addEventListener('message', on);
      sw.postMessage('update');
    });
  },
};
if (Off.ok) navigator.serviceWorker.register('sw.js').catch(e => logLine('오프라인 저장 등록 실패: ' + e.message, 'w'));
window.addEventListener('online', () => logLine('인터넷 연결됨'));
window.addEventListener('offline', () => logLine('인터넷 끊김 — 담아 둔 앱으로 계속', 'w'));
window.addEventListener('error', e => logLine('오류: ' + e.message + ' @' + e.lineno, 'e'));
window.addEventListener('unhandledrejection', e => logLine('오류: ' + (e.reason && e.reason.message || e.reason), 'e'));
Engine.on('log', (m, lv) => logLine(m, lv));

// ---------- 판 상태 ----------
// S = { boards:[{id,name,color,pads:[padId]}], cur, pads:{id:{...}}, master, lock, settings }
// 패드: label color vol pan loop solo fin finSec fout foutSec start end(0=끝까지) played added edited
const freshState = () => ({ v: 1, boards: [{ id: uid(), name: '보드 1', color: 'sky', pads: [] }], cur: 0, pads: {}, master: 1, lock: false, settings: { ...DEF_SETTINGS } });
const newPad = (file, label, dur) => {
  const t = Date.now(), st = S.settings;
  return { id: uid(), file, label, dur, color: 'none', vol: 1, pan: 0, loop: false, solo: false, fin: !!st.newFin, finSec: st.newFinSec, fout: !!st.newFout, foutSec: st.newFoutSec, start: 0, end: 0, played: false, added: t, edited: t };
};
let S = Store.loadState();
if (!S || !Array.isArray(S.boards) || !S.boards.length) S = freshState();
S.settings = { ...DEF_SETTINGS, ...(S.settings || {}) };
S.pads = S.pads || {};
if (!(S.cur >= 0 && S.cur < S.boards.length)) S.cur = 0;
{ // 어느 보드에도 없는 패드·없는 패드를 가리키는 칸 정리
  const inBoard = new Set();
  S.boards.forEach(b => { b.pads = (b.pads || []).filter(id => S.pads[id] && !inBoard.has(id) && inBoard.add(id)); });
  Object.keys(S.pads).forEach(id => { if (!inBoard.has(id)) delete S.pads[id]; });
}
// 창이 둘이면 나중에 연 창만 저장 — 옛 창이 낡은 판으로 덮어쓰지 않게 (10/1 리허설: 옛 창이 PLAYED 지우고 덮어씀)
let asleep = false;
const winCh = 'BroadcastChannel' in window ? new BroadcastChannel('duckq-board-win') : null;
if (winCh) {
  winCh.onmessage = e => {
    if (e.data !== 'hi' || asleep) return;
    asleep = true; $('sleepOv').hidden = false; $('startOv').hidden = true;
    logLine('다른 창이 열려서 이 창은 쉼 (저장 안 함)', 'w');
  };
  winCh.postMessage('hi');
}
let saveFail = false;
function save() {
  if (asleep) return;
  const ok = Store.saveState(S);
  if (!ok && !saveFail) toast('저장 공간이 부족해서 저장하지 못했어요');
  saveFail = !ok;
}
const board = () => S.boards[S.cur];
const addedAt = p => p.added || parseInt(p.id.slice(0, 8), 36) || 0;   // 옛 패드는 id 앞부분이 만든 시각
const editedAt = p => p.edited || addedAt(p);
const segLen = p => Math.max(0.05, ((p.end > (p.start || 0) ? p.end : p.dur) || 0) - (p.start || 0)) / (p.rate || 1);   // 트림한 구간 길이(배속 적용한 실제 초)
const touchEdit = p => { p.edited = Date.now(); };

// 실행 중에만 쓰는 것
const status = {};          // padId → 'wait' | 'ready' | 'bad'
const badWhy = {};
let files = new Map();      // fileId → {id,name,size,type,blob}
let editMode = false, lastId = null, started = false;
const sel = new Set();      // 편집 모드에서 고른 패드
const padEls = new Map();   // padId → 화면의 패드 버튼
const grid = $('grid'), tray = $('tray');

// ---------- 그리기 ----------
function applyTheme() {
  document.documentElement.dataset.theme = S.settings.theme;
  document.querySelector('meta[name=theme-color]').content = S.settings.theme === 'light' ? '#e9edf4' : '#0d1017';
  paintAll(); if (typeof renderPlays === 'function') renderPlays();   // 투명 패드의 켜짐 색이 화면에 따라 다름
}
function applyBoardColor() { document.body.style.setProperty('--board', COLORS[board().color] || COLORS.sky); }

function renderTop() {
  const b = board(), total = b.pads.reduce((a, id) => a + segLen(S.pads[id]), 0);
  const t = $('total');
  // 오른쪽 칸 위: 평소엔 전체 시간·패드 수, 일시정지·편집 중엔 상태
  t.classList.toggle('state', Engine.paused || editMode);
  if (Engine.paused) t.innerHTML = '<b>⏸</b><span>일시<br>정지</span>';
  else if (editMode) t.innerHTML = '<b>✎</b><span>편집<br>중</span>';
  else t.innerHTML = `<span>전체</span><b>${fmtH(total)}</b><i></i><span>패드</span><b>${b.pads.length}개</b>`;
  const L = S.lock;
  $('btnLock').classList.toggle('on', L);
  $('lockTxt').textContent = '공연 모드';   // 켜짐은 버튼 강조로 (소유자 결정: 이름 '공연 모드')
  $('lockArc').setAttribute('d', L ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 8 0');
  $('btnSet').disabled = L; $('btnEdit').disabled = L; $('btnAdd').disabled = L;
  $('btnEdit').classList.toggle('on', editMode);
  document.body.classList.toggle('editing', editMode);
  renderSelBar();
}

function renderTabs() {
  const box = $('tabs'); box.textContent = '';
  S.boards.forEach((b, i) => {
    const t = h('button', { class: 'tab' + (i === S.cur ? ' on' : '') + (i === S.cur && focus && focus.board ? ' focus' : ''), onclick: () => { if (!t._long) onTab(i); t._long = false; } }, b.name);
    longPress(t, () => { if (S.lock) return; t._long = true; if (i !== S.cur) onTab(i); logLine(`길게 누름 → 보드 설정 "${b.name}"`); openBoardSheet(); });
    t.style.setProperty('--c', COLORS[b.color]);
    box.append(t);
  });
  if (!S.lock) box.append(h('button', { class: 'tab new', onclick: addBoard, 'aria-label': '보드 추가', title: '보드 추가' }, '＋'));   // 마지막 보드 옆 작은 ＋ (공연 모드엔 숨김)
  const on = box.querySelector('.tab.on');
  if (on) box.scrollLeft = Math.max(0, on.offsetLeft - 40);
}

// 한 화면에 cols × rows 칸이 딱 맞게 줄 높이를 정하고, 넘치면 세로 스크롤
function sizeRows() {
  const rows = ROWS[S.settings.cols] || 4, gap = 10;
  const H = tray.clientHeight - 24 - 8;
  grid.style.setProperty('--rowh', Math.max(64, (H - gap * (rows - 1)) / rows) + 'px');
}
new ResizeObserver(sizeRows).observe(tray);

function renderGrid() {
  const cols = S.settings.cols, ids = board().pads;
  grid.style.setProperty('--cols', cols); grid.dataset.cols = cols; grid.dataset.ls = S.settings.labelSize; sizeRows();
  for (const id of sel) if (!ids.includes(id)) sel.delete(id);
  grid.textContent = ''; padEls.clear();
  ids.forEach((id, k) => grid.append(makePad(id, k + 1)));
  if (!S.lock) grid.append(h('button', { class: 'pad add', onclick: pickFiles }, h('big', null, '＋'), ids.length ? '파일 넣기' : '소리 파일 넣기'));
  if (S.lock && !ids.length) grid.append(h('div', { class: 'empty' }, '이 보드엔 패드가 없어요'));
}

function makePad(id, n) {
  const p = S.pads[id];
  const el = h('button', { class: 'pad', 'data-id': id, html:
    // 자리 고정: 인 · 루프 · (번호) · 솔로 · 아웃 (꺼진 건 빈자리로 남김 — 패드마다 같은 자리에 보이게)
    `<div class="icons">${[['fin', 'fi'], ['loop', 'lp'], ['solo', 'so'], ['fout', 'fo']].map(([k, ic]) => `<i class="slot">${p[k] ? IC[ic] : ''}${k === 'loop' && loopTag(p) ? `<small class="lpn">${loopTag(p)}</small>` : ''}${k === 'fin' && Math.round(p.vol * 100) !== 100 ? `<small class="vln">${Math.round(p.vol * 100)}%</small>` : ''}</i>`).join('')}</div>` +
    `<div class="idx">${String(n).padStart(2, '0')}</div><div class="eq"><i></i><i></i><i></i></div><div class="edit">✓</div>` +
    `<div class="label"></div><div class="meta"><span>00:00</span><b>PLAYED</b><span></span></div>` });
  el.querySelector('.label').textContent = p.label || '(이름 없음)';
  el._el = el.querySelector('.meta span:first-child'); el._rm = el.querySelector('.meta span:last-child');
  padEls.set(id, el);
  paintPad(id);
  return el;
}

function paintPad(id) {
  const el = padEls.get(id), p = S.pads[id]; if (!el || !p) return;
  const none = p.color === 'none', hex = padHex(p);
  const playing = Engine.isPlaying(id), st = status[id];
  el.style.setProperty('--h', hex); el.style.setProperty('--ink', ink(hex));
  el.classList.toggle('none', none);
  el.classList.toggle('playing', playing);
  el.classList.toggle('played', !!p.played && !playing);
  el.classList.toggle('wait', st === 'wait' || st == null);
  el.classList.toggle('bad', st === 'bad');
  el.classList.toggle('sel', editMode && sel.has(id));
  el.classList.toggle('focus', !!(focus && focus.pad === id));
  if (!playing) {
    el.style.setProperty('--p', '0%');
    el._el.textContent = '00:00';
    el._rm.textContent = st === 'bad' ? (badWhy[id] || '못 틂') : (st === 'ready' ? (endless(p) ? '∞' : '-' + fmt(Math.ceil(playLen(p)))) : '불러오는 중');
  } else tickPad(id, el);
}
function tickPad(id, el) {
  const d = playLen(S.pads[id], id), pos = playPos(id);
  el.style.setProperty('--p', Math.min(100, pos / d * 100).toFixed(1) + '%');
  el._el.textContent = fmt(pos); el._rm.textContent = endless(S.pads[id]) ? '∞' : '-' + fmt(Math.ceil(d - pos));
}
function paintAll() { padEls.forEach((_, id) => paintPad(id)); }

function renderMaster() {
  const v = S.master, sl = $('mSlider');
  const y = Math.sqrt(v);   // 막대 높이 = 귀 기준(배 = 높이²)
  $('mFill').style.height = (y * 100) + '%';
  $('mKnob').style.top = ((1 - y) * 100) + '%';
  const bst = S.settings.masterBoost || 1;
  const pct = Math.round(v * bst * 100);
  $('mVal').textContent = (pct === 100 ? '' : '↺') + (pct / 100).toFixed(2) + '배';   // ↺ = 숫자 누르면 1.00배로 · 패드 볼륨(%)과 헷갈리지 않게 '배'
  const over = v * bst > 1.001;   // 실제 100%를 넘으면 막대·숫자 색이 바뀐다
  $('mVal').classList.toggle('boost', over);
  $('master').classList.toggle('over', over);
  sl.setAttribute('aria-valuenow', Math.round(v * 100));
}

// ---------- 아래 재생 줄 (최대 3줄, 넘치면 '+N 더') ----------
// 최근에 튼 것이 맨 위. 줄마다 막대를 누르거나 끌어 위치 옮기기(손 뗄 때 그 자리부터).
const PLAY_ROWS = 3;
let seek = null, playsOpen = false;   // seek = {id, f(0~1)}
const playRows = new Map();           // id → 줄
function playRow(id) {
  let r = playRows.get(id);
  if (!r) {
    // 끝의 ◣ = 이 트랙만 끄기(그 트랙의 페이드아웃대로)
    const stopB = h('button', { class: 'pstop', 'aria-label': '이 트랙 끄기', onclick: () => {
      const p = S.pads[id]; if (!p || !Engine.isPlaying(id)) return;
      // ◣는 곡 자기 페이드가 아니라 ◣ 버튼 시간(설정)으로 — 긴 페이드 곡을 빨리 끝내려고 누르는 버튼
      const sec = Math.min(foutOf(p) || S.settings.fadeSec, S.settings.fadeSec);
      logLine(`◣ 줄에서 끔 ${nm(id)} · ${sec}초`); Engine.stop(id, sec); paintPad(id);
    } }, '◣');
    r = h('div', { class: 'prow', 'data-id': id }, h('i', { class: 'pdot' }), h('span', { class: 'pname' }), h('div', { class: 'ptrack' }, h('i')), h('span', { class: 'ptime' }), stopB);
    playRows.set(id, r);
  }
  return r;
}
function renderPlays() {
  const box = $('plays');
  const ids = Engine.playingIds().sort((a, b) => (playT[b] || 0) - (playT[a] || 0));
  for (const id of playRows.keys()) if (!ids.includes(id)) playRows.delete(id);
  if (ids.length <= PLAY_ROWS) playsOpen = false;
  const shown = playsOpen || ids.length <= PLAY_ROWS ? ids : ids.slice(0, PLAY_ROWS - 1);
  const kids = shown.map(id => {
    const r = playRow(id), p = S.pads[id] || {}, d = playLen(p, id), pos = seek && seek.id === id ? seek.f * d : playPos(id);
    r.firstChild.style.background = padHex(p);
    const vp = Math.round((Engine.volume(id) ?? p.vol ?? 1) * 100);   // 지금 송출 볼륨(MASTER 빼고) — 100%면 안 보임
    r.children[1].textContent = p.label || '';
    r.children[2].firstChild.style.width = Math.min(100, pos / d * 100) + '%';
    r.children[3].replaceChildren(...(vp === 100 ? [] : [h('b', { class: 'pvol' }, vp + '%')]), fmt(pos) + ' / ' + (endless(p) ? '∞' : fmt(d)));
    return r;
  });
  if (!ids.length) {   // 아무것도 안 울릴 때: 마지막 트랙 이름만 흐리게
    const p = lastId && S.pads[lastId];
    kids.push(h('div', { class: 'prow idle' }, h('i', { class: 'pdot' }), h('span', { class: 'pname' }, p ? p.label : '—'), h('div', { class: 'ptrack' }, h('i')), h('span', { class: 'ptime' }, ''), h('span')));
  }
  if (ids.length > PLAY_ROWS) kids.push(h('button', { class: 'pmore', onclick: () => { playsOpen = !playsOpen; renderPlays(); } }, playsOpen ? '접기' : `+${ids.length - shown.length}개 더`));
  box.classList.toggle('open', playsOpen);
  if (kids.length !== box.children.length || kids.some((k, n) => box.children[n] !== k)) box.replaceChildren(...kids);
}
(() => {
  const box = $('plays');
  const frac = (tr, e) => { const r = tr.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)); };
  let tr = null;
  box.addEventListener('pointerdown', e => {
    const t = e.target.closest('.ptrack'), row = t && t.closest('.prow[data-id]');
    if (!row || !started || !Engine.isPlaying(row.dataset.id)) return;
    tr = t; tr.setPointerCapture(e.pointerId); row.classList.add('drag');
    seek = { id: row.dataset.id, f: frac(tr, e) }; renderPlays();
  });
  box.addEventListener('pointermove', e => { if (tr && seek) { seek.f = frac(tr, e); renderPlays(); } });
  const end = (e, ok) => {
    if (!tr || !seek) return;
    const id = seek.id, f = ok ? frac(tr, e) : null; tr.closest('.prow').classList.remove('drag'); tr = null; seek = null;
    const p = S.pads[id];
    if (ok && p && Engine.isPlaying(id)) {
      // 횟수·초 반복이면 막대 = 전체 길이: 몇 바퀴째 어디인지로 나눠 틀고, 멈출 때까지 남은 시간은 그대로
      const L = Engine.dur(id), T = playLen(p, id), t = Math.min(f * T, Math.max(0, T - 0.1)), k = loopStop(p) ? Math.floor(t / L) : 0, from = Math.min(t - k * L, Math.max(0, L - 0.1));
      logLine(`재생 위치 옮김 ${nm(id)} → ${fmt(t)}`);
      Engine.play(id, { fadeIn: 0.08, fadeOut: foutOf(p), from, stopAt: loopStop(p) ? T - t + from : 0 }); lap[id] = { n: k, pos: from }; paintPad(id);   // 옮긴 자리는 0.08초 올리며 시작 — "뚝" 대신 "슥"
    }
    renderPlays();
  };
  box.addEventListener('pointerup', e => end(e, true));
  box.addEventListener('pointercancel', e => end(e, false));
})()

function renderPause() {
  const on = Engine.paused;
  document.body.classList.toggle('paused', on);
  $('btnPause').classList.toggle('on', on);
  $('pauseIc').innerHTML = on ? '<path d="M7 5l12 7-12 7z"/>' : '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>';
  $('btnPause').setAttribute('aria-label', on ? '전체 이어서' : '전체 일시정지');
}

function renderAll() { applyTheme(); applyBoardColor(); renderTop(); renderTabs(); renderGrid(); renderMaster(); renderPlays(); renderPause(); }

// 재생 중인 패드만 1초에 4번 갱신 (DESIGN §6)
setInterval(() => {
  for (const id of Engine.playingIds()) { const el = padEls.get(id); if (el) tickPad(id, el); }
  renderPlays();
}, 250);

// ---------- 패드 누르기 ----------
function tapPad(id) {
  const p = S.pads[id]; if (!p || status[id] !== 'ready' || !started) return;
  if (window.Cue && Cue.tap(id)) return paintPad(id);   // 큐(설정에서 켰을 때만)
  if (Engine.isPlaying(id)) {
    if (Engine.isFading(id)) return;   // 페이드 중 탭은 무시 (0단계와 같음)
    Engine.stop(id, foutOf(p));
  } else {
    if (p.solo) soloOthers(id);
    if (Engine.play(id, playOpt(p))) {
      lastId = id; p.played = true; S.lastUse = Date.now(); save();
    }
  }
  paintPad(id);
}
// 페이드아웃은 값 하나: 곡 끝에 닿을 때 + 다시 눌러 끌 때 (소유자 결정 2026-09-29)
const foutOf = p => S.settings.fadeOverride ? S.settings.fadeSec : p.fout ? p.foutSec : 0;
const playOpt = (p, from) => ({ fadeIn: p.fin ? p.finSec : 0, fadeOut: foutOf(p), from, stopAt: loopStop(p) });
function soloOthers(id) {
  const m = (S.pads[id] && S.pads[id].soloMode) || S.settings.soloMode;   // 트랙마다, 없으면 예전 전체 설정
  for (const o of Engine.playingIds()) {
    if (o === id) continue;
    const q = S.pads[o];
    Engine.stop(o, m === 'stop' ? 0 : m === 'fade' ? S.settings.fadeSec : (q && q.fout ? q.foutSec : 0));
    paintPad(o);
  }
}

// 손가락 한 개 = 한 기록. 소리는 '손 뗄 때'(소유자 결정 2026-09-29) — 움직이면 스크롤로 보고 안 울림.
// 평소: 0.5초 누르고 안 움직이면 소리 대신 패드 설정(잠금 중엔 안 열림).
// 편집 모드: 짧게 누르면 고르기(여러 개), 꾹(0.25초) 누른 채 끌면 순서 바꾸기.
const touches = new Map();
let lastScroll = 0, drag = null;
const MOVE_PX = 10, HOLD_MS = 250, LONG_MS = 500, RENAME_MS = 400, GHOST_MS = 50;
// 패드 이름 바로 고치기: 이름 자리에 입력 칸을 띄움. 완료(Enter)·바깥 누름 = 저장, Esc = 취소
// 이름 칸 오른쪽 작은 × — 누르면 이름을 다 지우고 바로 새로 쓰게(입력 칸에서 손이 안 떠나게 pointerdown에서 막음)
function clearable(inp, cls = 'clr') {
  const x = h('button', { class: 'clrx', type: 'button', 'aria-label': '이름 지우기', tabindex: -1 }, '×');
  x.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); });
  x.addEventListener('mousedown', e => e.preventDefault());
  x.onclick = e => { e.stopPropagation(); inp.value = ''; inp.dispatchEvent(new Event('input')); inp.focus(); };
  return h('span', { class: cls }, inp, x);
}
function renamePad(id) {
  const el = padEls.get(id), p = S.pads[id]; if (!el || !p) return;
  const r = el.querySelector('.label').getBoundingClientRect(), pr = el.getBoundingClientRect();
  const inp = h('input', { class: 'rn-in', value: p.label, maxlength: 40, enterkeyhint: 'done' });
  const box = clearable(inp, 'clr rn-box');
  box.style.cssText = `left:${pr.left + 6}px;top:${r.top + r.height / 2 - 24}px;width:${pr.width - 12}px`;
  document.body.append(box); inp.focus(); inp.select();
  let done = false;
  const finish = ok => {
    if (done) return; done = true;
    const v = inp.value.trim(); box.remove();
    if (ok && v && v !== p.label) { logLine(`이름 바꿈 ${nm(id)} → "${v}"`); p.label = v; touchEdit(p); save(); const n = board().pads.indexOf(id) + 1; el.replaceWith(makePad(id, n)); }
  };
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') finish(false); });
  const t0 = performance.now();   // 손 뗀 직후 따라오는 누름이 입력 칸을 빼앗아도 다시 잡음
  inp.addEventListener('blur', () => { if (performance.now() - t0 < 400) return setTimeout(() => inp.isConnected && inp.focus()); finish(true); });
}
const unpress = el => setTimeout(() => el.classList.remove('press'), 60);
function cancelTouch(t) { if (t.drag || t.dead) return; t.dead = true; t.rename = false; t.el.classList.remove('rn'); clearTimeout(t.timer); t.el.classList.remove('press'); }
tray.addEventListener('scroll', () => { lastScroll = performance.now(); touches.forEach(cancelTouch); }, { passive: true });
grid.addEventListener('pointerdown', e => {
  const el = e.target.closest('.pad'); if (!el || !el.dataset.id) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  // 스크롤이 미끄러지는 중에 댄 손가락은 '멈추기'로 보고 소리 안 냄
  const t = { el, id: el.dataset.id, x: e.clientX, y: e.clientY, dead: performance.now() - lastScroll < 120,
    t0: performance.now(), pt: e.pointerType, w: Math.round(e.width || 0), pid: e.pointerId, tr: e.isTrusted };   // 유령 터치 추적용(로그에만)
  touches.set(e.pointerId, t);
  if (!t.dead) el.classList.add('press');
  // 편집 모드: 이름(밑줄)을 꾹 → 손 떼면 바로 이름 고치기 / 이름 밖을 꾹 → 끌어 옮기기
  if (editMode && !t.dead && e.target.closest('.label')) t.timer = setTimeout(() => { t.rename = true; el.classList.remove('press'); el.classList.add('rn'); }, RENAME_MS);
  else if (editMode && !t.dead) t.timer = setTimeout(() => startDrag(t), HOLD_MS);
  else if (!t.dead && !S.lock) t.timer = setTimeout(() => { t.dead = true; t.el.classList.remove('press'); logLine(`길게 누름 → 패드 설정 ${nm(t.id)}`); openPadSheet(t.id); }, LONG_MS);
});
window.addEventListener('pointermove', e => {
  const t = touches.get(e.pointerId); if (!t) return;
  if (t.drag) { t.cx = e.clientX; t.cy = e.clientY; dragMove(t); return; }
  if (t.brush) return brushOver(t, e);
  const dx = e.clientX - t.x, dy = e.clientY - t.y;
  // 편집 모드에서 옆으로 쓸면 = 지나가는 패드를 고르기(첫 패드가 이미 골라져 있으면 빼기). 위아래로 쓸면 스크롤
  if (editMode && !t.dead && !t.rename && Math.abs(dx) > MOVE_PX && Math.abs(dx) > Math.abs(dy)) return startBrush(t, e);
  if (Math.hypot(dx, dy) > MOVE_PX) cancelTouch(t);
});
window.addEventListener('pointerup', e => {
  const t = touches.get(e.pointerId); if (!t) return;
  touches.delete(e.pointerId); clearTimeout(t.timer);
  if (t.drag) return endDrag(t);
  if (t.brush) { brush = null; logLine(`쓸어서 고르기 → ${sel.size}개`); return; }
  unpress(t.el); t.el.classList.remove('rn');
  if (t.dead) return;
  if (t.rename) return renamePad(t.id);   // 손 뗄 때(사용자 동작 안) 열어야 아이패드 자판이 뜬다
  const why = ` [${((performance.now() - t.t0) / 1000).toFixed(2)}초 · ${t.pt}${t.tr ? '' : ' 가짜'} · 굵기 ${t.w} · 이동 ${Math.round(Math.hypot(e.clientX - t.x, e.clientY - t.y))}px · id ${t.pid} · 동시 ${touches.size + 1} · 뗀 곳 ${(e.target && (e.target.closest && e.target.closest('[id],.pad,.qrow') || e.target).id || e.target.className || '?')}]`;
  // 0.05초 무시는 진짜 빠른 탭까지 막아 끔(2026-10-09). 유령 터치 가를 근거를 모으려고 짧은 터치 표시만 남김
  const quick = performance.now() - t.t0 < GHOST_MS ? ' (0.05초 미만)' : '';
  if (editMode) toggleSel(t.id); else { logLine(`짧게 누름 ${nm(t.id)}${quick}${S.lock ? ' (공연 모드)' : ''}${why}`); tapPad(t.id); }
});
window.addEventListener('pointercancel', e => {
  const t = touches.get(e.pointerId); if (!t) return;
  touches.delete(e.pointerId); clearTimeout(t.timer);
  if (t.drag) endDrag(t); else t.el.classList.remove('press');
  brush = null;
});
// 쓸어서 고르기: 지나간 패드를 모두 같은 쪽(고름/뺌)으로
let brush = null;
function startBrush(t, e) {
  clearTimeout(t.timer); t.el.classList.remove('press');
  t.brush = true; brush = t; t.add = !sel.has(t.id); t.seen = new Set();
  t.lx = t.x; t.ly = t.y; brushAt(t, t.x, t.y); brushOver(t, e);
}
// 빨리 쓸어도 건너뛰지 않게 지난 자리와 지금 자리 사이를 12px 간격으로 훑음
function brushOver(t, e) {
  const x = e.clientX, y = e.clientY, n = Math.max(1, Math.ceil(Math.hypot(x - t.lx, y - t.ly) / 12));
  for (let i = 1; i <= n; i++) brushAt(t, t.lx + (x - t.lx) * i / n, t.ly + (y - t.ly) * i / n);
  t.lx = x; t.ly = y;
}
function brushAt(t, x, y) {
  const hit = document.elementFromPoint(x, y), el = hit && hit.closest('.pad[data-id]');
  if (!el || !grid.contains(el) || t.seen.has(el.dataset.id)) return;
  const id = el.dataset.id; t.seen.add(id);
  if (t.add) sel.add(id); else sel.delete(id);
  paintPad(id); renderSelBar();
}
// 보드 탭 길게 누르기(0.5초) → 보드 설정
function longPress(el, fn) {
  let tm = 0, x = 0, y = 0;
  const off = () => clearTimeout(tm);
  el.addEventListener('pointerdown', e => { x = e.clientX; y = e.clientY; off(); tm = setTimeout(fn, LONG_MS); });
  el.addEventListener('pointermove', e => { if (Math.hypot(e.clientX - x, e.clientY - y) > MOVE_PX) off(); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => el.addEventListener(ev, off));
  el.addEventListener('contextmenu', e => e.preventDefault());
}
// 끄는 중엔 화면이 같이 스크롤되지 않게
document.addEventListener('touchmove', e => { if (drag || brush) e.preventDefault(); }, { passive: false });
['gesturestart', 'dblclick'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));

// ---------- 흔들며 순서 바꾸기 (편집 모드) ----------
function startDrag(t) {
  if (t.dead || !editMode || drag) return;
  t.drag = true; drag = t; t.cx = t.x; t.cy = t.y;
  const g = grid.getBoundingClientRect();
  t.gx = t.x - (g.left + t.el.offsetLeft); t.gy = t.y - (g.top + t.el.offsetTop);
  t.el.classList.remove('press'); t.el.classList.add('lift');
  // 고른 패드를 끌면 고른 것 전부가 함께 옮겨짐(아이폰처럼 한데 모임)
  if (sel.has(t.id) && sel.size > 1) {
    t.group = selIds();
    t.group.forEach(id => { if (id !== t.id) padEls.get(id)?.classList.add('gathered'); });
    t.el.dataset.n = t.group.length;
  }
  place(t);
  const tick = () => {   // 가장자리에 대고 있으면 저절로 스크롤
    if (drag !== t) return;
    const r = tray.getBoundingClientRect(), edge = 70;
    const v = t.cy < r.top + edge ? -Math.ceil((r.top + edge - t.cy) / 6) : t.cy > r.bottom - edge ? Math.ceil((t.cy - r.bottom + edge) / 6) : 0;
    if (v) { tray.scrollTop += v; dragMove(t); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function place(t) {
  const g = grid.getBoundingClientRect();
  t.el.style.transform = `translate(${t.cx - t.gx - g.left - t.el.offsetLeft}px,${t.cy - t.gy - g.top - t.el.offsetTop}px) scale(1.08)`;
}
function dragMove(t) {
  const hit = document.elementFromPoint(t.cx, t.cy), under = hit && hit.closest('.pad[data-id]');
  if (under && under !== t.el && under !== t.lastUnder && grid.contains(under)) {
    const pads = [...grid.querySelectorAll('.pad[data-id]')];
    grid.insertBefore(t.el, pads.indexOf(t.el) < pads.indexOf(under) ? under.nextSibling : under);
  }
  t.lastUnder = under;
  place(t);
}
function endDrag(t) {
  drag = null;
  t.el.classList.remove('lift'); t.el.style.transform = '';
  let order = [...grid.querySelectorAll('.pad[data-id]')].map(x => x.dataset.id);
  if (t.group) {   // 끈 패드 자리에 고른 것들을 원래 순서대로
    order = order.filter(id => id === t.id || !t.group.includes(id));
    order.splice(order.indexOf(t.id), 1, ...t.group);
    logLine(`${t.group.length}개 함께 옮김`);
  }
  const b = board();
  if (order.join() !== b.pads.join()) { b.pads = order; save(); }
  renderGrid();
}

// ---------- 여러 개 고르기 (편집 모드) ----------
function toggleSel(id) { if (sel.has(id)) sel.delete(id); else sel.add(id); if (window.Cue) Cue.clearSel(); paintPad(id); renderSelBar(); }
function clearSel() { sel.clear(); paintAll(); renderSelBar(); }
const selIds = () => board().pads.filter(id => sel.has(id));   // 보드 순서대로
// 패드 팝업은 패드판 가운데에 (큐 목록이 열리고 닫혀도 따라감)
function placeSelBar() { const bar = $('selBar'); if (bar.hidden) return; const g = grid.getBoundingClientRect(); bar.style.left = g.width ? `${g.left + g.width / 2}px` : ''; bar.style.maxWidth = g.width ? `${g.width - 16}px` : ''; }
addEventListener('resize', placeSelBar);
function renderSelBar() {
  const bar = $('selBar'), ids = selIds();
  // 큐 줄을 고르는 중이면 패드 팝업은 숨김 — 큐 팝업만(2026-10-01)
  bar.hidden = !editMode || !!(window.Cue && Cue.selN()); bar.textContent = ''; if (bar.hidden) return;
  placeSelBar();
  const b = board(), n = ids.length, dis = !n;
  const moveSel = h('select', { class: 'sel', disabled: dis }, h('option', { value: '' }, '보드 이동'),
    S.boards.filter(x => x !== b).map(x => h('option', { value: x.id }, x.name)));
  moveSel.onchange = () => {
    const to = S.boards.find(x => x.id === moveSel.value); if (!to) return;
    ids.forEach(id => { b.pads.splice(b.pads.indexOf(id), 1); to.pads.push(id); });
    save(); toast(`${n}개 → ${to.name}`); sel.clear(); renderTop(); renderGrid();
  };
  bar.append(...[
    h('span', { class: 'cnt' }, n ? `${n}개 고름` : '패드 고르기'),
    h('button', { class: 'sbtn', 'aria-label': '패드 편집 설명', onclick: () => toast('눌러서 고르기 · 꾹 끌면 옮기기 · 이름 꾹 → 이름 바꾸기') }, '?'),
    h('button', { class: 'sbtn', onclick: openSort }, '정렬'),
    h('button', { class: 'sbtn', onclick: () => { if (n === b.pads.length) clearSel(); else { b.pads.forEach(id => sel.add(id)); paintAll(); renderSelBar(); } } }, n && n === b.pads.length ? '고르기 해제' : '전체 고르기'),
    n === 1 ? h('button', { class: 'sbtn', onclick: () => openPadSheet(ids[0]) }, '설정') : null,
    h('button', { class: 'sbtn', disabled: dis, onclick: () => openBulkSheet(ids) }, '일괄 수정'),
    h('button', { class: 'sbtn', disabled: dis, onclick: () => {
      for (const id of [...ids].reverse()) { const nid = clonePad(id); b.pads.splice(b.pads.indexOf(id) + 1, 0, nid); }
      save(); sel.clear(); renderTop(); renderGrid(); toast(`${n}개 복제했어요`);
    } }, '복제'),
    S.boards.length > 1 ? moveSel : null,
    h('button', { class: 'sbtn danger', disabled: dis, onclick: async () => {
      if (!await ask(`패드 ${n}개를 지울까요?`, { ok: '지우기', danger: true })) return;
      ids.forEach(removePad); sel.clear(); save(); renderTop(); renderGrid();
    } }, '삭제'),
  ].filter(Boolean));
}

const nm = id => `"${(S.pads[id] || {}).label || id}"`;   // 기록용 패드 이름
// 시험 기록(PLAN-app-fix1 시험표): 무엇을 눌러 무슨 일이 났는지 로그로 남겨 PC에서 분석
const WHY = { ended: '트랙 끝', faded: '페이드 끝', stop: '바로 정지', restart: '다시 시작', hidden: '홈 복귀', ousted: '다른 창', error: '오류', unload: '지움' };
var playT = {};   // id → 튼 시각(재생 줄 순서)
Engine.on('play', id => {
  const p = S.pads[id]; playT[id] = performance.now(); lap[id] = { n: 0, pos: 0 };
  if (p) logLine(`▶ ${nm(id)} 구간 ${Engine.dur(id).toFixed(1)}초${p.rate ? ' · ' + p.rate + '배' : ''} · 인 ${p.fin ? p.finSec + '초' : '끔'} · 아웃 ${foutOf(p) ? foutOf(p) + '초' : '끔'}${p.loop ? ' · 반복' + (loopTag(p) ? ' ' + loopTag(p) + ` (${loopStop(p).toFixed(1)}초에 멈춤)` : '') : ''}`);
  paintPad(id);
});
Engine.on('fade', id => logLine(`◢ ${nm(id)} 페이드아웃 시작`));
Engine.on('end', (id, why) => {
  const p = S.pads[id], t = playT[id] ? ((performance.now() - playT[id]) / 1000).toFixed(1) : '?';
  logLine(`■ ${nm(id)} ${WHY[why] || why} · ${t}초 들림` + (why === 'ended' && p && foutOf(p) && !p.loop ? ` · 끝 페이드 ${foutOf(p)}초` : ''));
  paintPad(id);
});
Engine.on('pause', () => { renderPause(); renderTop(); });
Engine.on('return', () => { paintAll(); renderPlays(); reqWake(); });
Engine.on('ousted', () => { $('oustOv').hidden = false; paintAll(); });
$('btnReload').onclick = () => location.reload();

// ---------- 전역 컨트롤 ----------
function hit(btn, fn) {
  btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 90); if (started) fn(); });
}
hit($('btnPause'), () => {
  if (Engine.paused) { Engine.resumeAll(); logLine('⏵ 이어서 (30ms 올림)'); }
  else if (Engine.pauseAll()) logLine(`⏸ 일시정지 (30ms 줄임) · 재생 중 ${Engine.playingIds().length}개 트랙`);
  else toast('재생 중인 소리가 없어요');
});
hit($('btnStop'), () => { logLine(`■ 전체정지${Engine.paused ? ' (⏸ 중 — 소리 막은 채 정리)' : ''} · ${Engine.playingIds().length}개 트랙`); Engine.stopAll(0); paintAll(); });
hit($('btnFade'), () => { logLine(`◣ 전체 페이드 ${S.settings.fadeSec}초 · ${Engine.playingIds().length}개 트랙`); Engine.stopAll(S.settings.fadeSec); paintAll(); });

// MASTER 세로 슬라이더
(() => {
  const sl = $('mSlider'); let on = false;
  const set = e => {
    const r = sl.getBoundingClientRect();
    const y = Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height));
    let v = Math.round(y * y * 100) / 100;   // 귀 기준: 가운데 = 0.25배
    // 키웠을 때 100% 자리 근처(막대 길이 ±5%)면 딱 100%에 붙는다 — 배율과 상관없이 손 느낌 같게
    const bst = S.settings.masterBoost || 1;
    if (bst > 1 && Math.abs(y - Math.sqrt(1 / bst)) <= 0.05) v = 1 / bst;
    S.master = v;
    Engine.setMaster(S.master); renderMaster();
  };
  $('master').addEventListener('pointerdown', e => { on = true; $('master').setPointerCapture(e.pointerId); set(e); });
  $('master').addEventListener('pointermove', e => { if (on) set(e); });
  const up = () => { if (on) { on = false; save(); } };
  $('master').addEventListener('pointerup', up); $('master').addEventListener('pointercancel', up);
  // 숫자 누르기 = 원래 소리 100%로(키우기 배율과 상관없이)
  $('mVal').addEventListener('pointerdown', e => {
    e.stopPropagation(); const bst = S.settings.masterBoost || 1;
    if (Math.round(S.master * bst * 100) === 100) return;
    S.master = 1 / bst; Engine.setMaster(S.master); renderMaster(); save(); logLine('MASTER ↺ 100%');
  });
  sl.setAttribute('role', 'slider'); sl.setAttribute('aria-label', 'MASTER 볼륨');
})();

// 전체화면 (홈화면 앱으로 열면 이미 전체라 버튼을 숨김)
(() => {
  const d = document, root = d.documentElement;
  const can = (d.fullscreenEnabled || d.webkitFullscreenEnabled) && !(navigator.standalone || matchMedia('(display-mode: standalone)').matches);
  if (!can) { $('btnFull').style.visibility = 'hidden'; return; }
  $('btnFull').onclick = () => {
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
  };
})();

// ---------- 위 버튼 ----------
$('btnLock').onclick = () => {
  S.lock = !S.lock;
  if (S.lock) { editMode = false; sel.clear(); closeSheet(); }
  // 잠금 켤 때 = 공연 준비 끝 → PLAYED 지움(8초 안에 되돌리기)
  const was = S.lock ? clearPlayed() : [];
  save(); renderTop(); renderTabs(); renderGrid();
  logLine(S.lock ? `공연 모드 켬 · PLAYED ${was.length}개 지움` : '공연 모드 끔');
  if (!S.lock) toast('공연 모드를 껐어요 — 편집할 수 있어요');
  else if (!was.length) toast('공연 모드 — 패드·재생 버튼만 눌려요');
  else toast(`공연 모드 — 패드·재생 버튼만 · PLAYED ${was.length}개 지움`, 8000, { label: '되돌리기', fn: () => { logLine(`PLAYED 되돌리기 ${was.length}개`); was.forEach(id => { if (S.pads[id]) S.pads[id].played = true; }); save(); paintAll(); } });
};
$('btnEdit').onclick = () => { if (S.lock) return; editMode = !editMode; sel.clear(); renderTop(); renderTabs(); paintAll(); };
// PLAYED 지우기 → 지운 패드 id 목록(되돌리기용)
function clearPlayed() {
  const was = Object.keys(S.pads).filter(id => S.pads[id].played);
  was.forEach(id => { S.pads[id].played = false; });
  return was;
}
// 마지막 사용 6시간 뒤 저절로 지움 (다음 날 공연에 어제 표시가 남지 않게)
function idleClear() {
  if (asleep || !S.lastUse || Date.now() - S.lastUse < PLAYED_IDLE_MS) return;
  S.lastUse = 0;
  const was = clearPlayed(); save();
  if (was.length) { paintAll(); logLine(`6시간 안 써서 PLAYED ${was.length}개 지움`); }
}
setInterval(idleClear, 60000);
$('btnAdd').onclick = () => openAddMenu();
$('btnSet').onclick = () => { if (!S.lock) openSettings(); };

function onTab(i) {
  if (i === S.cur) { if (editMode && !S.lock) openBoardSheet(); return; }
  S.cur = i; save();
  applyBoardColor(); renderTop(); renderTabs(); renderGrid(); tray.scrollTop = 0;
}

// ---------- 정렬 (한 번만 — 누른 뒤 새로 넣는 패드는 그냥 맨 뒤) ----------
const SORTS = [
  ['name', '이름순', '가나다', (a, b) => a.label.localeCompare(b.label, 'ko', { numeric: true })],
  ['added', '추가한 순', '먼저 넣은 것부터', (a, b) => addedAt(a) - addedAt(b)],
  ['edited', '최근 수정한 순', '방금 고친 것부터', (a, b) => editedAt(b) - editedAt(a)],
  ['len', '길이순', '짧은 것부터', (a, b) => segLen(a) - segLen(b)],
];
function openSort() {
  openSheet('정렬', body => {
    body.append(h('div', { class: 'row' }, h('label', null, helpLabel('정렬', '지금 보드의 순서를 한 번만 바꿔요. 계속 정렬된 채로 있지 않아요. 누른 뒤 8초 안에 되돌릴 수 있어요.'))));
    SORTS.forEach(([, name, sub, cmp]) => body.append(h('div', { class: 'row' },
      h('label', null, name, h('span', { class: 'sub' }, sub)),
      h('button', { class: 'sbtn', onclick: () => sortBoard(name, cmp) }, '이 순서로'))));
  });
}
function sortBoard(name, cmp) {
  const b = board(), before = [...b.pads];
  b.pads.sort((x, y) => cmp(S.pads[x], S.pads[y]) || before.indexOf(x) - before.indexOf(y));
  save(); closeSheet(); tray.scrollTop = 0;
  toast(`${name}으로 바꿨어요`, 8000, { label: '되돌리기', fn: () => {
    if ([...before].sort().join() !== [...b.pads].sort().join()) return toast('그사이 패드가 바뀌어 되돌릴 수 없어요');
    b.pads = before; save(); renderGrid();
  } });
}

// ---------- 파일 넣기 ----------
function pickFiles() { if (S.lock) return; $('files').click(); }
$('files').addEventListener('change', e => { const list = [...e.target.files]; e.target.value = ''; addFiles(list); });
async function addFiles(list) {
  if (!list.length) return;
  const b = board(), bad = [];
  toast(`${list.length}개 넣는 중…`, 60000);
  for (const f of list) {
    const dur = await Engine.probeDuration(f);
    if (dur < 0) { bad.push(f.name); continue; }
    const rec = { id: uid(), name: f.name, size: f.size, type: f.type, blob: f };
    try { await Store.putFile(rec); } catch (err) { bad.push(f.name); logLine(`파일 저장 실패 "${f.name}": ${err && err.message}`, 'e'); continue; }
    files.set(rec.id, rec);
    const p = newPad(rec.id, f.name.replace(/\.[^.]+$/, ''), dur);
    S.pads[p.id] = p; b.pads.push(p.id); save();
    renderTop(); renderGrid();
    padEls.get(p.id)?.scrollIntoView({ block: 'nearest' });
    await loadPad(p.id);
  }
  toast(bad.length ? `못 넣은 파일 ${bad.length}개: ${bad.join(', ')}` : `${list.length - bad.length}개 넣었어요`, bad.length ? 6000 : 1800);
}

// ---------- 보드에서 바로 녹음 (PLAN-record, B안: 화면을 덮는 녹음 창) ----------
// ＋ 추가 → [파일 넣기 / 녹음하기]. 브라우저 잡음 억제·에코 제거를 켜고 녹음 → WAV로 바꿔 새 패드로(파일 넣기와 같은 길).
function openAddMenu() {
  if (S.lock) return;
  const old = document.querySelector('.add-pop'); if (old) return old._close();
  const r = $('btnAdd').getBoundingClientRect();
  const pop = h('div', { class: 'add-pop' },
    h('button', { onclick: () => { close(); pickFiles(); } }, '📁 파일 넣기'),
    h('button', { onclick: () => { close(); startRecord(); } }, '🎙 녹음하기'),
    LAB && S.settings.drawer ? h('button', { onclick: () => { close(); openDrawer(); } }, '🗄 음원 서랍') : null);
  pop.style.top = (r.bottom + 10) + 'px'; pop.style.right = Math.max(8, innerWidth - r.right) + 'px';
  const out = e => { if (!pop.contains(e.target) && e.target !== $('btnAdd')) close(); };
  function close() { pop.remove(); document.removeEventListener('pointerdown', out, true); }
  pop._close = close;
  document.body.append(pop);
  setTimeout(() => document.addEventListener('pointerdown', out, true));
}
// ---------- 음원 서랍 (실험실): PC에 모아 둔 음원을 어느 아이패드에서든 골라 패드로 ----------
const DRAWER_URL = new URL('/drawer/', location.href).href;
const mb = n => (n / 1048576).toFixed(1) + 'MB';
async function openDrawer() {
  if (!LAB || S.lock) return;
  let list;
  try { const r = await fetch(DRAWER_URL + 'list', { cache: 'no-store' }); if (!r.ok) throw new Error(r.status); list = await r.json(); }
  catch (e) { logLine(`서랍 목록 못 받음: ${e && e.message}`, 'e'); return toast('서랍에 못 들어갔어요 — PC가 꺼졌거나 로그인이 풀렸어요(새로고침)', 6000); }
  openSheet('음원 서랍', body => {
    const up = h('input', { type: 'file', multiple: true, accept: 'audio/*,video/*,.m4a,.mp3,.wav,.aac,.ogg', class: 'vh' });
    up.onchange = () => { const f = [...up.files]; up.value = ''; drawerUpload(f); };
    body.append(up, row(helpLabel('서랍에 올리기', '이 아이패드의 음원 파일을 PC 서랍에 올려요. 다른 아이패드에서도 여기서 골라 쓸 수 있어요'),
      h('button', { class: 'sbtn', onclick: () => up.click() }, '파일 고르기')));
    if (!list.length) return body.append(h('div', { class: 'row' }, h('span', { class: 'plab' }, '서랍이 비었어요')));
    list.forEach(it => body.append(row(h('span', null, it.name.replace(/\.[^.]+$/, ''), h('span', { class: 'sub' }, ` ${mb(it.size)}`)),
      h('button', { class: 'sbtn', onclick: () => drawerTake(it) }, '넣기'))));
  });
}
async function drawerTake(it) {
  closeSheet();
  toast(`"${it.name}" 받는 중…`, 60000);
  try {
    const r = await fetch(DRAWER_URL + 'f/' + encodeURIComponent(it.name));
    if (!r.ok) throw new Error(r.status);
    const b = await r.blob();
    logLine(`서랍에서 넣기 "${it.name}" ${mb(b.size)}`);
    await addFiles([new File([b], it.name, { type: b.type })]);
  } catch (e) { logLine(`서랍 받기 실패 "${it.name}": ${e && e.message}`, 'e'); toast('서랍에서 못 받았어요 — 다시 해 보세요', 5000); }
}
async function drawerUpload(list) {
  let ok = 0;
  for (const f of list) {
    toast(`"${f.name}" 올리는 중… (${ok + 1}/${list.length})`, 120000);
    try {
      const r = await fetch(DRAWER_URL + 'up?name=' + encodeURIComponent(f.name), { method: 'POST', body: f });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status);
      ok++; logLine(`서랍에 올림 "${j.name}" ${mb(f.size)}`);
    } catch (e) { logLine(`서랍 올리기 실패 "${f.name}": ${e && e.message}`, 'e'); toast(`"${f.name}" 못 올렸어요: ${e && e.message}`, 6000); }
  }
  if (ok) { toast(`${ok}개 서랍에 올렸어요`, 1800); openDrawer(); }
}

let recNow = null;
async function startRecord() {
  if (S.lock || recNow) return;
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast(isSecureContext ? '이 기기·브라우저는 녹음을 못 해요' : '녹음은 https 주소(q.deokgu.com)에서만 돼요', 6000);
  recNow = {};
  // 0.3.102에서 소리 종류를 '재생'으로 둬서(무음 스위치 무시) 아이패드가 마이크를 막음(InvalidStateError) → 녹음하는 동안만 '재생+녹음'
  const AS = navigator.audioSession, setAS = t => { try { if (AS && AS.type !== t) { AS.type = t; logLine(`소리 종류: ${t}`); } } catch {} };
  setAS('play-and-record');
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: false } }); }
  catch (e) {
    logLine(`마이크(잡음 억제) 못 씀: ${e.name} ${e.message}`, 'w');
    if (e.name !== 'NotAllowedError') try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch (e2) { e = e2; logLine(`마이크(기본) 못 씀: ${e.name} ${e.message}`, 'e'); }
    if (!stream) {
      recNow = null; setAS('playback');
      const why = { NotAllowedError: '마이크 허용이 필요해요 (설정 → 사파리 → 마이크)', NotFoundError: '마이크를 찾지 못했어요 (마이크가 연결돼 있나요?)', NotReadableError: '다른 앱이 마이크를 쓰고 있어요 — 그 앱을 닫고 다시' }[e.name];
      return toast(why || `마이크를 켤 수 없어요 (${e.name})`, 6000);
    }
  }
  const tr = stream.getAudioTracks()[0], st = tr.getSettings ? tr.getSettings() : {};
  logLine(`녹음 시작 · 잡음 억제 ${st.noiseSuppression ?? '?'} · 에코 제거 ${st.echoCancellation ?? '?'}`);
  const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find(t => MediaRecorder.isTypeSupported?.(t)) || '';
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [];
  mr.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  // 소리 크기 막대
  const ac = new (window.AudioContext || window.webkitAudioContext)(), an = ac.createAnalyser(); an.fftSize = 512;
  ac.createMediaStreamSource(stream).connect(an);
  const buf = new Uint8Array(an.fftSize);
  const time = h('b', { class: 'rec-time' }, '0:00'), fill = h('i'), stopBtn = h('button', { class: 'rec-stop' }, '■ 멈춤');
  const cancelBtn = h('button', { class: 'sbtn' }, '취소');
  const dnBox = h('input', { type: 'checkbox' }); dnBox.checked = S.settings.recDenoise !== false;   // 값 없음 = 켬
  dnBox.onchange = () => { S.settings.recDenoise = dnBox.checked; save(); };
  if (S.settings.recDenoise !== false) Denoise.load().catch(() => {});   // 미리 불러 둠
  const ov = h('div', { class: 'rec-ov' }, h('div', { class: 'rec-box' },
    h('div', { class: 'rec-head' }, h('span', { class: 'rec-dot' }), '녹음 중', time),
    h('div', { class: 'rec-lv' }, fill), h('div', { class: 'rec-sub' }, '말할 때 초록 막대가 움직이면 잘 잡혀요'),
    h('label', { class: 'rec-dn' }, dnBox, ' 잡음 거르기'),
    stopBtn, cancelBtn));
  document.body.append(ov);
  const t0 = performance.now(); let raf;
  const tick = () => {
    const s = Math.floor((performance.now() - t0) / 1000); time.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128));
    fill.style.width = Math.min(100, m / 128 * 160) + '%';
    raf = requestAnimationFrame(tick);
  };
  tick();
  const finish = () => new Promise(res => { if (mr.state === 'inactive') return res(); mr.onstop = res; mr.stop(); });
  const end = async keep => {
    if (!recNow) return; recNow = null;
    cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onHide);
    await finish(); stream.getTracks().forEach(t => t.stop()); ac.close().catch(() => {}); ov.remove(); setAS('playback');
    if (!keep) { logLine('녹음 취소'); return; }
    if (!chunks.length) return toast('녹음된 소리가 없어요', 3000);
    try {
      const dn = dnBox.checked;
      if (dn) toast('잡음 거르는 중…', 60000);
      const wav = await toWav(new Blob(chunks, { type: mr.mimeType || mime || 'audio/mp4' }), dn);
      const d = new Date(), p2 = n => String(n).padStart(2, '0');
      const name = `녹음 ${d.getMonth() + 1}-${d.getDate()} ${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.wav`;
      logLine(`녹음 저장 "${name}" ${(wav.size / 1024).toFixed(0)}KB · 잡음 거르기 ${dn ? '켬' : '끔'}`);
      await addFiles([new File([wav], name, { type: 'audio/wav' })]);
    } catch (e) { logLine(`녹음 저장 실패: ${e.message}`, 'e'); toast('녹음을 저장하지 못했어요', 4000); }
  };
  // 앱을 벗어나면(홈 버튼 등) 거기까지 저장
  const onHide = () => { if (document.visibilityState === 'hidden') { end(true); toast('앱을 벗어나 녹음을 멈췄어요 — 거기까지 저장했어요', 6000); } };
  document.addEventListener('visibilitychange', onHide);
  stopBtn.onclick = () => end(true); cancelBtn.onclick = () => end(false);
  recNow = { end };
  try { mr.start(250); } catch (e) { logLine(`녹음 시작 실패: ${e.message}`, 'e'); await end(false); toast('녹음을 시작하지 못했어요 — 다시 눌러 보세요', 4000); }
}
// 녹음 잡음 거르기: ① 80Hz 아래(웅~ 울림) 자르기 → ② RNNoise(AI, 말소리만 남김). 48kHz 모노로 맞춰서.
// 라이브러리: Jitsi rnnoise-wasm 0.2.1 (Apache-2.0, app/rnnoise.js·wasm). index.html에 미리 받기 줄이 있어 오프라인에도 담김.
const Denoise = (() => {
  let mod = null;
  const url = f => new URL(`${f}?v=${APP_VER}`, location.href).href;
  async function load() {
    if (mod) return mod;
    const make = (await import(url('rnnoise.js'))).default;
    return (mod = await make({ locateFile: f => url(f) }));
  }
  async function run(ab) {
    const t0 = performance.now(), m = await load();
    const off = new OfflineAudioContext(1, Math.ceil(ab.duration * 48000), 48000);
    const src = off.createBufferSource(), hp = off.createBiquadFilter();
    src.buffer = ab; hp.type = 'highpass'; hp.frequency.value = 80;
    src.connect(hp).connect(off.destination); src.start();
    const x = (await off.startRendering()).getChannelData(0), N = 480, y = new Float32Array(x.length);
    const st = m._rnnoise_create(), p = m._malloc(N * 4);
    try {
      for (let i = 0; i < x.length; i += N) {
        const f = m.HEAPF32.subarray(p >> 2, (p >> 2) + N);
        for (let k = 0; k < N; k++) f[k] = (x[i + k] || 0) * 32768;
        m._rnnoise_process_frame(st, p, p);
        const g = m.HEAPF32.subarray(p >> 2, (p >> 2) + N);
        for (let k = 0; k < N && i + k < y.length; k++) y[i + k] = g[k] / 32768;
      }
    } finally { m._rnnoise_destroy(st); m._free(p); }
    logLine(`잡음 거르기 ${ab.duration.toFixed(1)}초 · ${((performance.now() - t0) / 1000).toFixed(2)}초 걸림`);
    return { rate: 48000, data: [y] };
  }
  return { load, run };
})();
// 녹음본(mp4/webm) → 16비트 WAV. 길이가 정확히 잡히고 어느 기기에서나 열린다.
async function toWav(blob, dn) {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const raw = await blob.arrayBuffer();
    const ab = await new Promise((ok, no) => ac.decodeAudioData(raw, ok, no));
    let rate = ab.sampleRate, data = [...Array(Math.min(ab.numberOfChannels, 2))].map((_, c) => ab.getChannelData(c));
    if (dn) try { ({ rate, data } = await Denoise.run(ab)); } catch (e) { logLine(`잡음 거르기 실패 → 원본으로: ${e.message}`, 'e'); }
    return encWav(rate, data);
  } finally { ac.close().catch(() => {}); }
}
// 16비트 WAV로 묶기(녹음·목소리 바꾸기가 같이 씀)
function encWav(rate, data) {
  const ch = data.length, n = data[0].length;
  const out = new DataView(new ArrayBuffer(44 + n * ch * 2)), w = (o, t) => [...t].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); out.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true);
  out.setUint16(22, ch, true); out.setUint32(24, rate, true); out.setUint32(28, rate * ch * 2, true); out.setUint16(32, ch * 2, true); out.setUint16(34, 16, true);
  w(36, 'data'); out.setUint32(40, n * ch * 2, true);
  for (let i = 0, o = 44; i < n; i++) for (let c = 0; c < ch; c++, o += 2) { const v = Math.max(-1, Math.min(1, data[c][i])); out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
  return new Blob([out], { type: 'audio/wav' });
}

// ---------- 목소리 바꾸기 (PLAN-목소리효과): 패드 소리에 효과를 구워 새 패드로. 원본은 그대로 ----------
// 브라우저 기본 소리 기능 + 직접 짠 음높이 바꾸기(WSOLA)만 씀 — 새 라이브러리 없음, 인터넷 없어도 됨.
const VOICES = [['mic', '🎤', '마이크'], ['phone', '📞', '전화'], ['monster', '👹', '괴물'], ['echo', '⛰', '메아리'], ['robot', '🤖', '로봇'], ['chip', '🐿', '다람쥐']];
const VOICE_MAX = 120;   // 초. 목소리용이라 그 이상은 앞 2분만
const Voice = (() => {
  const R = 48000;
  // 파일 → 48kHz 모노, 패드에 트림한 구간만
  async function decode(blob, from, to) {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    let ab; try { const raw = await blob.arrayBuffer(); ab = await new Promise((ok, no) => ac.decodeAudioData(raw, ok, no)); } finally { ac.close().catch(() => {}); }
    const a = Math.min(from || 0, ab.duration), b = Math.min(to > a ? to : ab.duration, a + VOICE_MAX);
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil((b - a) * R)), R), src = off.createBufferSource();
    src.buffer = ab; src.connect(off.destination); src.start(0, a, b - a);
    return (await off.startRendering()).getChannelData(0);
  }
  // 소리 연결망을 오프라인으로 돌림. len = 결과 길이(샘플), build(off, src) → src에서 destination까지 잇는다
  async function graph(x, len, build, rate = 1) {
    const off = new OfflineAudioContext(1, Math.max(1, len), R), buf = off.createBuffer(1, x.length, R);
    buf.getChannelData(0).set(x);
    const src = off.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    build(off, src); src.start();
    return (await off.startRendering()).getChannelData(0);
  }
  const bq = (off, type, f, g = 0, q = 0.7) => { const n = off.createBiquadFilter(); n.type = type; n.frequency.value = f; n.gain.value = g; n.Q.value = q; return n; };
  const chain = (src, ...ns) => ns.reduce((a, n) => a.connect(n), src);
  // 길이만 바꾸기(음높이 그대로) — WSOLA: 겹치는 조각을 앞 조각과 가장 잘 이어지는 자리에서 골라 붙임
  function stretch(x, n) {
    const N = 1536, Hs = N / 2, S = 384, Ha = (x.length - N) / Math.max(1, n - N) * Hs;
    const w = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    const y = new Float32Array(n + N), nm = new Float32Array(n + N);
    let prev = 0;
    for (let k = 0, o = 0; o < n; k++, o += Hs) {
      const c = Math.round(k * Ha); let best = Math.max(0, Math.min(c, x.length - N));
      if (k) {
        const t = prev + Hs; let bv = -Infinity;
        for (let d = -S; d <= S; d += 4) {
          const s = c + d; if (s < 0 || s + N > x.length) continue;
          let v = 0; for (let i = 0; i < N; i += 8) v += x[s + i] * (x[t + i] || 0);
          if (v > bv) { bv = v; best = s; }
        }
      }
      prev = best;
      for (let i = 0; i < N; i++) { y[o + i] += (x[best + i] || 0) * w[i]; nm[o + i] += w[i]; }
    }
    for (let i = 0; i < n; i++) if (nm[i] > 1e-3) y[i] /= nm[i];
    return y.subarray(0, n);
  }
  async function pitch(x, f) {   // f < 1 = 낮게. 늘어지게 틀어 음을 바꾼 뒤 원래 길이로 되돌림
    const r = await graph(x, Math.ceil(x.length / f), (off, src) => src.connect(off.destination), f);
    return stretch(r, x.length);
  }
  const FX = {
    mic: x => graph(x, x.length, (off, src) => {
      const c = off.createDynamicsCompressor(); c.threshold.value = -26; c.ratio.value = 4; c.attack.value = 0.005; c.release.value = 0.2;
      chain(src, bq(off, 'highpass', 120), bq(off, 'peaking', 3000, 5, 1), bq(off, 'highshelf', 8000, 2), c, off.destination);
    }),
    phone: x => graph(x, x.length, (off, src) => {
      const ws = off.createWaveShaper(); ws.curve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh(3 * (i / 511.5 - 1)) / Math.tanh(3));
      chain(src, bq(off, 'highpass', 400), bq(off, 'highpass', 400), bq(off, 'lowpass', 3000), bq(off, 'lowpass', 3000), bq(off, 'peaking', 1500, 6, 1), ws, off.destination);
    }),
    monster: async x => graph(await pitch(x, 0.68), x.length, (off, src) => chain(src, bq(off, 'lowshelf', 180, 5), off.destination)),
    echo: x => graph(x, x.length + Math.round(2.5 * R), (off, src) => {
      const d = off.createDelay(1), fb = off.createGain(), wet = off.createGain();
      d.delayTime.value = 0.32; fb.gain.value = 0.45; wet.gain.value = 0.6;
      src.connect(off.destination);
      chain(src, d, fb, bq(off, 'lowpass', 2500), d); d.connect(wet).connect(off.destination);
    }),
    robot: async x => {   // 낮은 떨림을 곱하고(링 변조) 10ms 짧은 울림을 겹침 — 쇳소리
      const y = new Float32Array(x.length), D = Math.round(0.01 * R), k = 2 * Math.PI * 55 / R;
      for (let i = 0; i < x.length; i++) y[i] = x[i] * (Math.sin(k * i) * 0.8 + 0.2) + (i >= D ? 0.5 * y[i - D] : 0);
      return y;
    },
    chip: x => graph(x, Math.ceil(x.length / 1.5), (off, src) => src.connect(off.destination), 1.5),
  };
  // 가장 큰 소리를 0.89로 맞춤(효과마다 크기가 들쭉날쭉하지 않게)
  function norm(y) { let m = 0; for (const v of y) m = Math.max(m, Math.abs(v)); if (m > 1e-4) { const g = 0.89 / m; for (let i = 0; i < y.length; i++) y[i] *= g; } return y; }
  async function make(x, kind) {
    const t0 = performance.now(), y = norm(Float32Array.from(await FX[kind](x)));
    logLine(`목소리 바꾸기 ${kind} ${(x.length / R).toFixed(1)}초 · ${((performance.now() - t0) / 1000).toFixed(2)}초 걸림`);
    return y;
  }
  return { R, decode, make };
})();
function openVoiceSheet(id) {
  const p = S.pads[id], rec = p && files.get(p.file); if (!rec) return toast('파일이 없어요', 3000);
  const b = board(), got = {};   // 효과 → 바꾼 소리(한 번 만든 건 다시 안 만듦)
  let src = null, x = null, pick = null, busy = false;
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  const stop = () => { if (src) { try { src.stop(); } catch {} src = null; } };
  const play = y => { stop(); const ab = ac.createBuffer(1, y.length, Voice.R); ab.getChannelData(0).set(y); src = ac.createBufferSource(); src.buffer = ab; src.connect(ac.destination); src.start(); };
  const saveBtn = h('button', { class: 'sbtn pri', disabled: true }, '새 패드로 저장');
  const btns = VOICES.map(([k, ic, ko]) => h('button', { class: 'sbtn vx', onclick: () => tap(k) }, `${ic} ${ko}`));
  const btnOrig = h('button', { class: 'sbtn vx', onclick: () => tap('') }, '원래 소리');
  async function tap(k) {
    if (busy) return;
    ac.resume().catch(() => {});
    if (pick === k && src) return stop();   // 같은 걸 다시 누르면 멈춤
    busy = true; stop();
    try {
      if (!x) { toast('소리 여는 중…', 60000); x = await Voice.decode(rec.blob, p.start || 0, p.end || 0); }
      if (k && !got[k]) { toast('목소리 바꾸는 중…', 60000); got[k] = await Voice.make(x, k); }
      toast('목소리 미리 듣는 중 — 다시 누르면 멈춰요', 1500);
      pick = k; [...btns, btnOrig].forEach(el => el.classList.remove('on'));
      (k ? btns[VOICES.findIndex(v => v[0] === k)] : btnOrig).classList.add('on');
      saveBtn.disabled = !k;
      play(k ? got[k] : x);
    } catch (e) { logLine(`목소리 바꾸기 실패 "${p.label}": ${e.message}`, 'e'); toast('이 소리는 바꾸지 못했어요', 4000); }
    busy = false;
  }
  saveBtn.onclick = async () => {
    if (!pick || busy) return; busy = true; stop();
    const label = `${p.label}(${VOICES.find(v => v[0] === pick)[2]})`;
    try {
      const f = new File([encWav(Voice.R, [got[pick]])], label + '.wav', { type: 'audio/wav' });
      const r = { id: uid(), name: f.name, size: f.size, type: f.type, blob: f };
      await Store.putFile(r); files.set(r.id, r);
      const q = newPad(r.id, label, got[pick].length / Voice.R);
      q.color = p.color; q.vol = p.vol;
      S.pads[q.id] = q; b.pads.splice(b.pads.indexOf(id) + 1, 0, q.id); save();
      logLine(`목소리 바꿔 새 패드 "${label}" ${(f.size / 1024).toFixed(0)}KB`);
      closeSheet(); renderTop(); renderGrid(); await loadPad(q.id);
      toast(`"${label}" 패드를 만들었어요`);
    } catch (e) { logLine(`목소리 패드 저장 실패: ${e.message}`, 'e'); toast('저장하지 못했어요', 4000); busy = false; }
  };
  const long = ((p.end || p.dur) - (p.start || 0)) > VOICE_MAX;
  openSheet('목소리 바꾸기', body => {
    body.append(
      h('div', { class: 'row col' }, h('label', null, helpLabel('효과', `눌러서 들어 보고 마음에 들면 저장 — 옆에 새 패드가 생겨요. 원래 패드는 그대로예요. 트림한 구간만 바꿔요.${long ? ` 긴 소리는 앞 ${VOICE_MAX / 60}분만.` : ''}`)),
        h('div', { class: 'vx-grid' }, ...btns, btnOrig)),
      h('div', { class: 'row' }, h('span', { class: 'plab' }, `"${p.label}" → 새 패드`), h('div', { class: 'end' }, saveBtn)));
  }, () => padEls.get(id), { pad: id });
  onSheetClose = () => { stop(); ac.close().catch(() => {}); };
}

async function loadPad(id) {
  const p = S.pads[id]; if (!p) return;
  const rec = files.get(p.file);
  if (!rec) { status[id] = 'bad'; badWhy[id] = '파일 없음'; paintPad(id); return; }
  status[id] = 'wait'; paintPad(id);
  try {
    const inf = await Engine.load(id, rec.blob, { dur: p.dur, volume: p.vol, loop: p.loop, pan: p.pan || 0, start: p.start || 0, end: p.end || 0, rate: p.rate || 1 });
    if (!S.pads[id] || !inf) return;
    status[id] = 'ready';
    if (inf.dur > 0 && Math.abs(inf.dur - p.dur) > 0.3) { p.dur = inf.dur; save(); renderTop(); }
  } catch (e) {
    status[id] = 'bad'; badWhy[id] = '못 틂';
    logLine(`불러오기 실패 "${p.label}": ${e.message}`, 'e');
  }
  paintPad(id);
}

// 파일을 더 쓰는 패드가 없으면 저장소에서도 지운다
function dropFileIfUnused(fileId) {
  if (Object.values(S.pads).some(p => p.file === fileId)) return;
  files.delete(fileId); Store.delFile(fileId).catch(() => {});
}
function removePad(id) {
  const p = S.pads[id]; if (!p) return;
  Engine.unload(id);
  S.boards.forEach(b => { const k = b.pads.indexOf(id); if (k >= 0) b.pads.splice(k, 1); });
  delete S.pads[id]; delete status[id];
  if (lastId === id) lastId = null;
  dropFileIfUnused(p.file);
}
function clonePad(id) {
  const t = Date.now(), q = { ...S.pads[id], id: uid(), played: false, added: t, edited: t };
  S.pads[q.id] = q; loadPad(q.id);
  return q.id;
}

// ---------- 보드 ----------
function addBoard() {
  const used = S.boards.map(b => b.color), color = COLOR_KEYS.find(c => !used.includes(c)) || 'sky';
  S.boards.push({ id: uid(), name: '보드 ' + (S.boards.length + 1), color, pads: [] });
  S.cur = S.boards.length - 1; save();
  applyBoardColor(); renderTop(); renderTabs(); renderGrid();
  openBoardSheet();
}

// ---------- 보드 내보내기·가져오기 (zip: 패드이름.확장자 + board.json) ----------
// 원본 형식 그대로 담고 이름만 패드 이름으로. 가져오기는 늘 새 보드로 더한다(기존 판은 안 건드림).
const BIG_MB = 300, CUT_PAD = 180;   // 트림 앞뒤로 3분 남기고 자름
const MIME = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', mov: 'video/quicktime', flac: 'audio/flac' };
const safeName = s => (s || '소리').normalize('NFC').replace(/[\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 80) || '소리';
async function exportBoard(b) {
  const pads = b.pads.map(id => S.pads[id]).filter(Boolean);
  const names = new Map(), used = new Set(), entries = [], miss = [];
  for (const p of pads) {
    if (names.has(p.file)) continue;
    const rec = files.get(p.file); if (!rec) { miss.push(p.label); continue; }
    const ext = ((rec.name || '').match(/\.([^.\/]+)$/) || [])[1] || (MIME_EXT[rec.type] || 'mp3');
    let base = safeName(p.label), nm = `${base}.${ext}`;
    for (let k = 2; used.has(nm.toLowerCase()); k++) nm = `${base} (${k}).${ext}`;
    used.add(nm.toLowerCase()); names.set(p.file, nm); entries.push({ name: nm, blob: rec.blob, fid: p.file });
  }
  // 트림한 긴 곡은 안 쓰는 앞뒤를 잘라 담는다(같은 파일을 쓰는 패드들의 구간을 모두 덮게)
  const cut0 = new Map(), cutLen = new Map();
  for (const e of entries) {
    const ps = pads.filter(p => p.file === e.fid), dur = Math.max(...ps.map(p => p.dur || 0));
    const t0 = Math.min(...ps.map(p => p.start || 0)) - CUT_PAD, t1 = Math.max(...ps.map(p => p.end > 0 ? p.end : dur)) + CUT_PAD;
    if (!(dur > 0) || e.blob.size < 4 * 1048576) continue;   // 작은 파일은 그대로(재생 안 되는 꼬리가 붙은 파일이 있어 길이만 보고 건너뛰지 않음)
    toast(`긴 곡 자르는 중… ${e.name}`, 600000);
    try {
      const r = await Cut.run(e.blob, Math.max(0, t0), t1);
      if (!r || r.blob.size > e.blob.size * 0.9) { logLine(`자르기 건너뜀 "${e.name}" (${r ? '별로 안 줄어듦' : Cut.why() || '이유 모름'})`); continue; }
      logLine(`잘라 담음 "${e.name}" ${(e.blob.size / 1048576).toFixed(1)}MB → ${(r.blob.size / 1048576).toFixed(1)}MB · ${r.cut0.toFixed(2)}초부터`);
      e.blob = r.blob; cut0.set(e.fid, r.cut0); cutLen.set(e.fid, r.len);
    } catch (err) { logLine(`자르기 실패 "${e.name}" → 원본 그대로: ${err && err.message}`, 'w'); }
  }
  const mb = entries.reduce((a, e) => a + e.blob.size, 0) / 1048576;
  if (mb > BIG_MB && !await ask(`소리가 ${mb.toFixed(0)}MB예요. 아이패드에서 오래 걸리거나 실패할 수 있어요. 계속할까요?`, { ok: '계속' })) return;
  const json = { app: 'duckq-board', v: 1, ver: APP_VER, settings: { ...S.settings }, master: S.master, board: (({ id, pads, cues, ...r }) => r)(b),   // 보드 설정도 있는 것 전부(큐는 Cue가 따로)
    pads: pads.filter(p => names.has(p.file)).map(p => {
      const { id, file, played, ...rest } = p, c = cut0.get(file) || 0, L = cutLen.get(file);
      if (cutLen.has(file)) Object.assign(rest, { start: Math.max(0, (p.start || 0) - c), end: p.end > 0 ? p.end - c : 0, dur: Math.max(0, Math.min((p.dur || 0) - c, L || Infinity)) });   // 잘린 파일 길이로 — 가져온 쪽이 없는 소리를 가리키지 않게
      return { ...rest, file: names.get(file) };
    }) };
  if (window.Cue) Cue.exportFix(json, pads.filter(p => names.has(p.file)), b);   // 큐보드
  { // 원본 패드 ↔ 담을 설정 항목마다 비교(잘라 담은 곡의 시각은 당긴 만큼 되돌려 비교)
    const src = pads.filter(p => names.has(p.file)), bad = [], kinds = new Set();
    json.pads.forEach((jp, i) => {
      const o = src[i], c = cut0.get(o.file) || 0;
      Object.keys(o).forEach(k => {
        if (k === 'id' || k === 'file' || k === 'played') return;
        kinds.add(k);
        if (!(k in jp)) { bad.push(`${o.label}.${k} 빠짐`); return; }
        let v = jp[k];
        if (cutLen.has(o.file) && (k === 'start' || (k === 'end' && o.end > 0))) v += c;
        if (k === 'dur' && cutLen.has(o.file)) return;   // 길이는 잘린 길이로 바뀌는 게 맞음
        if (typeof v === 'number' && typeof o[k] === 'number' ? Math.abs(v - o[k]) > 0.06 : JSON.stringify(v) !== JSON.stringify(o[k])) bad.push(`${o.label}.${k} ${JSON.stringify(o[k])}→${JSON.stringify(v)}`);
      });
    });
    const sk = Object.keys(S.settings).filter(k => !(k in json.settings)).map(k => '설정.' + k + ' 빠짐')
      .concat(Object.keys(b).filter(k => !['id', 'pads', 'cues'].includes(k) && JSON.stringify(b[k]) !== JSON.stringify(json.board[k])).map(k => '보드.' + k + ' 빠짐'));
    logLine(`설정 담음: 패드 ${json.pads.length} · 항목 ${kinds.size}종 · 앱 설정 ${Object.keys(json.settings).length}개 · 큐 ${(json.board.cues || []).length}개 · ${bad.length || sk.length ? '✖ 다름 ' + bad.concat(sk).slice(0, 12).join(', ') : '전부 같음'}`, bad.length || sk.length ? 'e' : 'i');
  }
  entries.forEach(e => delete e.fid);
  entries.unshift({ name: 'board.json', blob: new Blob([JSON.stringify(json, null, 1)], { type: 'application/json' }) });
  const t0 = performance.now();
  logLine(`내보내기 시작 "${b.name}" · 패드 ${pads.length}개 · 파일 ${entries.length - 1}개 · ${mb.toFixed(1)}MB${miss.length ? ' · 파일 없음 ' + miss.length : ''}`);
  let zip;
  try { zip = await Zip.make(entries, (i, n) => toast(`내보내는 중… ${i}/${n} — 앱을 닫지 마세요`, 600000)); }
  catch (e) { logLine('내보내기 실패: ' + (e && e.message), 'e'); toast('내보내기 실패 — ' + (e && e.message), 5000); return; }
  const fname = `${safeName(b.name)}.duckq.zip`;
  logLine(`내보내기 만듦 ${fname} · ${(zip.size / 1048576).toFixed(1)}MB · ${((performance.now() - t0) / 1000).toFixed(1)}초`);
  // 아이패드는 손가락 누름 직후에만 공유 창이 열려서, 다 만든 뒤 [저장] 한 번 더 누르게 한다
  toast(`준비됐어요 (${(zip.size / 1048576).toFixed(0)}MB)${miss.length ? ` · 파일 없는 패드 ${miss.length}개 뺌` : ''}`, 600000, { label: '저장', fn: () => saveBlob(zip, fname) });
}
const MIME_EXT = Object.fromEntries(Object.entries(MIME).map(([k, v]) => [v, k]));
async function saveBlob(blob, fname) {
  toast(`저장 창 여는 중… 큰 파일은 오래 걸려요 (${(blob.size / 1048576).toFixed(0)}MB)`, 600000);
  const t0 = performance.now(), done = m => { $('toast').hidden = true; logLine(`${m} · ${((performance.now() - t0) / 1000).toFixed(1)}초`); };
  const file = new File([blob], fname, { type: 'application/zip' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); done('내보내기 공유 창 완료'); return; }
    catch (e) { if (e.name === 'AbortError') { done('내보내기 공유 창 닫음'); return; } logLine(`공유 창 실패(${e.name}) → 다운로드로`, 'w'); }
  } else logLine('공유 창 없음 → 다운로드로');
  const a = h('a', { href: URL.createObjectURL(file), download: fname });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  done('내보내기 다운로드 시작');
}
// 가져온 파일의 앱 전체 설정: 다르면 한 번 묻고, 기본은 지금 설정 그대로(기존 판을 안 바꾸는 약속)
const SET_KO = { recDenoise: '녹음 잡음 거르기', theme: '화면', cols: '패드 크기', labelSize: '패드 글자', fadeSec: '페이드 초', fadeOverride: '페이드 덮어쓰기', fadeMax: '페이드 최대', soloMode: '솔로 방식',
  newFin: '새 곡 페이드인', newFinSec: '새 곡 페이드인 초', newFout: '새 곡 페이드아웃', newFoutSec: '새 곡 페이드아웃 초', masterBoost: 'MASTER 키우기', cue: '큐', drawer: '음원 서랍' };
async function importSettings(json) {
  const inc = json.settings && typeof json.settings === 'object' ? json.settings : null;
  if (!inc) return;
  const keys = Object.keys(inc).filter(k => JSON.stringify(inc[k]) !== JSON.stringify(S.settings[k] ?? DEF_SETTINGS[k]));   // 앱 설정도 있는 것 전부(이름표 없으면 키 그대로 보임)
  const mst = typeof json.master === 'number' && Math.abs(json.master - S.master) > 0.005;
  if (!keys.length && !mst) return;
  const names = keys.map(k => SET_KO[k] || k).concat(mst ? ['MASTER 볼륨'] : []);
  if (!await ask(`패드 설정(트림·볼륨·페이드·루프·솔로 등)과 큐는 모두 들어왔어요.

앱 전체 설정 중 이 아이패드와 다른 것도 파일대로 바꿀까요?
다른 것: ${names.join(', ')}`, { ok: '파일대로', no: '지금 설정 그대로' })) { logLine(`가져온 설정 안 씀 (다른 것: ${names.join(', ')})`); return; }
  keys.forEach(k => { S.settings[k] = inc[k]; });
  if (mst) S.master = json.master;
  save(); Engine.setBoost(S.settings.masterBoost || 1); Engine.setMaster(S.master); renderAll();
  if (window.Cue) Cue.paint();
  logLine(`가져온 설정 적용: ${names.join(', ')}`);
}
function pickImport() { if (S.lock) return; $('zipIn').click(); }
$('zipIn').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  const t0 = performance.now();
  logLine(`가져오기 시작 "${f.name}" · ${(f.size / 1048576).toFixed(1)}MB`);
  toast('파일 읽는 중…', 600000);
  if (navigator.storage && navigator.storage.estimate) try { const e = await navigator.storage.estimate(); logLine(`저장 공간 ${(e.usage / 1048576).toFixed(0)}MB / ${(e.quota / 1048576).toFixed(0)}MB`); } catch {}
  let map, json;
  try {
    map = await Zip.read(f);
    const j = map.get('board.json'); if (!j) throw new Error('DuckQ 보드 파일이 아니에요(board.json 없음)');
    json = JSON.parse(await j.text());
    if (json.app !== 'duckq-board' || !Array.isArray(json.pads)) throw new Error('DuckQ 보드 파일이 아니에요');
  } catch (err) { logLine('가져오기 실패: ' + err.message, 'e'); toast('가져오기 실패 — ' + err.message, 5000); return; }
  closeSheet();
  const src = json.board || {};
  const { cues: _q, pads: _p, id: _i, ...srcRest } = src;
  const nb = { ...srcRest, id: uid(), name: String(src.name || '가져온 보드').slice(0, 20), color: COLORS[src.color] ? src.color : 'sky', pads: [] };   // 보드 설정도 있는 것 전부
  const fileIds = new Map(), bad = [], qIds = [];
  S.boards.push(nb); S.cur = S.boards.length - 1; save();
  applyBoardColor(); renderTop(); renderTabs(); renderGrid();
  for (let i = 0; i < json.pads.length; i++) {
    const jp = json.pads[i], blob = map.get(jp.file);
    toast(`가져오는 중… ${i + 1}/${json.pads.length} — 앱을 닫지 마세요`, 600000);
    if (!blob) { bad.push(jp.label || jp.file); continue; }
    let fid = fileIds.get(jp.file);
    if (fid === null) { bad.push(jp.label || jp.file); continue; }   // 같은 파일이 앞에서 실패
    if (!fid) {
      const ext = (jp.file.match(/\.([^.]+)$/) || [])[1] || '';
      const type = MIME[ext.toLowerCase()] || '';
      let rec;
      try {
        // zip의 조각을 그대로 저장하면 사파리가 zip 전체를 저장해 공간이 넘친다 → 소리 크기만큼 복사해서 저장
        const own = new File([await blob.arrayBuffer()], jp.file, { type });
        rec = { id: uid(), name: jp.file, size: own.size, type, blob: own };
        await Store.putFile(rec);
      } catch (err) {
        bad.push(jp.label || jp.file); fileIds.set(jp.file, null);
        logLine(`파일 저장 실패 "${jp.file}": ${err ? (err.name || '') + ' ' + (err.message || '') : '이유 모름'}`, 'e');
        continue;
      }
      files.set(rec.id, rec); fid = rec.id; fileIds.set(jp.file, fid);
    }
    const base = newPad(fid, String(jp.label || '소리'), +jp.dur || 0);
    const p = { ...base, ...jp, id: base.id, file: fid, played: false, added: jp.added || base.added };   // 추가 시각도 원본 그대로(추가순 정렬 유지)
    S.pads[p.id] = p; nb.pads.push(p.id); qIds[i] = p.id; save();
    renderTop(); renderGrid();
    await loadPad(p.id);
  }
  if (window.Cue) Cue.importFix(nb, qIds, json);   // 큐보드
  { // 파일의 설정 ↔ 새 패드 항목마다 비교
    const bad = [];
    json.pads.forEach((jp, i) => {
      const q = S.pads[qIds[i]]; if (!q) return;
      Object.keys(jp).forEach(k => {
        if (k === 'file' || k === 'dur') return;   // 파일은 새 id, 길이는 소리를 읽으며 맞춰짐
        if (JSON.stringify(jp[k]) !== JSON.stringify(q[k])) bad.push(`${jp.label}.${k}`);
      });
    });
    Object.keys(srcRest).forEach(k => { if (k !== 'name' && k !== 'color' && JSON.stringify(srcRest[k]) !== JSON.stringify(nb[k])) bad.push('보드.' + k); });
    const cues = (json.board && json.board.cues || []).length, got = (nb.cues || []).length;
    if (window.Cue && cues !== got) bad.push(`큐 ${cues}→${got}`);
    logLine(`설정 비교: 패드 ${qIds.filter(Boolean).length}/${json.pads.length} · ${bad.length ? '✖ 다름 ' + bad.slice(0, 12).join(', ') : '전부 같음'}${json.settings ? '' : ' · (옛 파일: 앱 설정 없음)'}`, bad.length ? 'e' : 'i');
  }
  await importSettings(json);
  logLine(`가져오기 완료 "${nb.name}" · 패드 ${nb.pads.length}개${bad.length ? ' · 못 가져옴 ' + bad.length : ''} · ${((performance.now() - t0) / 1000).toFixed(1)}초`);
  toast(bad.length ? `못 가져온 패드 ${bad.length}개: ${bad.join(', ')}` : `"${nb.name}" 보드로 ${nb.pads.length}개 가져왔어요`, bad.length ? 6000 : 2500);
});

// ---------- 설정 판(시트) ----------
let onSheetClose = null;
// anchor(선택) = 설정 대상(패드·보드 탭)을 돌려주는 함수 → 그 옆에 말풍선처럼 띄우고, 대상만 떨리고 나머지는 흐리게
let focus = null, sheetAnchor = null;   // focus = {pad:id} | {board:true}
// 편집 창은 바꾸는 즉시 적용되고(소리·화면에 바로), 아래 [취소]는 이 창을 열기 전 상태로, [완료]는 그대로 닫기.
// (소유자 결정 2026-09-29 A안) keep = 같은 창 안에서 칸만 바꿀 때 처음 상태를 그대로 둠
let snap = null;
function openSheet(title, build, anchor, fc, keep) {
  const sh = $('sheet'); sh.textContent = '';
  onSheetClose = null;
  if (!keep || !snap) snap = JSON.stringify({ boards: S.boards, pads: S.pads, settings: S.settings, cur: S.cur });
  const body = h('div', { class: 'sh-body' });
  sh.append(h('div', { class: 'sh-head' }, h('b', null, title), h('button', { class: 'ibtn', onclick: closeSheet }, '닫기')), body,
    h('div', { class: 'sh-foot' }, h('button', { class: 'sbtn', onclick: cancelSheet }, '취소'), h('button', { class: 'sbtn pri', onclick: closeSheet }, '완료')));
  build(body);
  focus = fc || null; sheetAnchor = anchor || null;
  document.body.classList.toggle('focusing', !!focus);
  paintAll(); renderTabs();
  $('sheetWrap').hidden = false; sh.scrollTop = 0; sheetAt = performance.now();
  placeSheet();
}
function placeSheet() {
  const wrap = $('sheetWrap'), sh = $('sheet'), arw = $('sheetArw');
  const a = sheetAnchor && sheetAnchor(), r = a && a.isConnected && a.getBoundingClientRect();
  const vw = innerWidth, vh = innerHeight, M = 16, GAP = 14;
  const reset = () => { wrap.classList.remove('anc'); sh.style.cssText = ''; arw.hidden = true; };
  if (!r || !r.width) return reset();
  let w, left, top, ax, ay, dir;
  if (focus && focus.board) {   // 보드 탭: 아래로
    w = Math.min(560, vw - 2 * M); left = Math.min(Math.max(M, r.left + r.width / 2 - w / 2), vw - w - M);
    top = r.bottom + GAP; ax = r.left + r.width / 2; ay = r.bottom + GAP; dir = 'up';
  } else {                      // 패드: 빈 자리가 넓은 옆으로
    const L = r.left - GAP - M, Rt = vw - r.right - GAP - M, right = Rt >= L;
    w = Math.min(480, right ? Rt : L);
    if (w < 340) return reset();   // 좁은 화면이면 가운데(떨림·흐림은 그대로)
    left = right ? r.right + GAP : r.left - GAP - w; top = M;
    ax = right ? r.right + GAP : r.left - GAP; ay = Math.min(Math.max(r.top + r.height / 2, 40), vh - 40); dir = right ? 'left' : 'right';
  }
  wrap.classList.add('anc');
  sh.style.cssText = `left:${left}px;top:${top}px;width:${w}px;max-height:${vh - top - M}px`;
  if (!(focus && focus.board)) {   // 패드 높이 근처로 내리되 화면 안에
    const hgt = sh.offsetHeight; sh.style.top = Math.min(Math.max(M, ay - 60), vh - M - hgt) + 'px';
  }
  arw.hidden = false; arw.className = 'arw ' + dir; arw.style.left = ax + 'px'; arw.style.top = ay + 'px';
}
addEventListener('resize', () => { if (!$('sheetWrap').hidden) placeSheet(); });
function cancelSheet() {
  const o = snap && JSON.parse(snap); if (!o) return closeSheet();
  onSheetClose = null;   // 되돌릴 거라 트림 확인 등은 건너뜀
  const keepPlayed = id => S.pads[id] && S.pads[id].played;
  for (const id in o.pads) o.pads[id].played = keepPlayed(id) ?? o.pads[id].played;
  Object.assign(S, { boards: o.boards, pads: o.pads, settings: o.settings, cur: Math.min(o.cur, o.boards.length - 1) });
  for (const id in S.pads) { const p = S.pads[id]; Engine.setVolume(id, p.vol); Engine.setPan(id, p.pan || 0); Engine.setLoop(id, p.loop); Engine.setTrim(id, p.start || 0, p.end || 0); Engine.setRate(id, p.rate || 1); }
  Engine.setBoost(S.settings.masterBoost || 1); renderMaster();
  save(); logLine('설정 창 취소 → 열기 전으로');
  closeSheet(); applyTheme(); applyBoardColor(); renderAll();
  if (window.Cue) Cue.paint();
}
function closeSheet() {
  if ($('sheetWrap').hidden) return;
  snap = null;
  if (onSheetClose) { try { onSheetClose(); } catch {} onSheetClose = null; }
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  $('sheetWrap').hidden = true; $('sheet').textContent = '';
  focus = sheetAnchor = null; document.body.classList.remove('focusing');
  renderTop(); renderTabs(); renderGrid();
}
let sheetAt = 0;   // 길게 눌러 연 직후 손 떼는 것이 바깥 누름으로 잡혀 바로 닫히지 않게
$('sheetWrap').addEventListener('click', e => { if (e.target === $('sheetWrap') && performance.now() - sheetAt > 400) closeSheet(); });

// 페이드 줄: 윗줄 = 이름·설명 + 켬/끔, 아랫줄 = 시간 (인·아웃 모양을 똑같이)
const fadeRow = (label, sub, onCtl, secCtl, help) => h('div', { class: 'row col frow2' },
  h('div', { class: 'fhead2' }, h('label', null, help ? helpLabel(label, help) : label, sub ? h('span', { class: 'sub mix' }, sub) : null), onCtl), h('div', { class: 'end' }, secCtl));
const row = (label, ...ctl) => h('div', { class: 'row' }, h('label', null, label), h('div', { class: 'end' }, ...ctl));
function sw(on, onchange) {
  const b = h('button', { class: 'sw' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(!!on) });
  b.onclick = () => { on = !on; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); onchange(on); };
  return b;
}
// 슬라이더 + −/＋ (손가락으로 정확히 맞추기 어려워서)
// mixed = 여러 패드 값이 제각각 → 값 대신 '제각각'으로 보이고, 손대는 순간 그 값으로 모두 같아짐
// map = {to(값→슬라이더 자리), from(자리→값), min, max} : 슬라이더 눈금을 값과 다르게(볼륨: 100%를 가운데에)
function stepper(val, min, max, step, show, onchange, mixed, map) {
  const out = h('output', null, mixed ? '제각각' : show(val));
  const to = map ? map.to : v => v, from = map ? map.from : v => v;
  const rng = h('input', { type: 'range', min: map ? map.min : min, max: map ? map.max : max, step: map ? 'any' : step, value: to(val) });
  const dec = String(step).split('.')[1]?.length || 0;
  const set = v => { v = Math.min(max, Math.max(min, +(+v).toFixed(dec))); val = v; rng.value = to(v); out.textContent = show(v); box.classList.remove('mixed'); onchange(v); };
  rng.oninput = () => set(map && map.snap ? map.snap(from(+rng.value)) : Math.round(from(+rng.value) / step) * step);
  const box = h('div', { class: 'step' + (mixed ? ' mixed' : '') }, h('button', { onclick: () => set(val - step), 'aria-label': '줄이기' }, '−'), rng, h('button', { onclick: () => set(val + step), 'aria-label': '늘리기' }, '＋'), out);
  box.set = set;
  return box;
}
function seg(opts, cur, onchange) {
  const box = h('div', { class: 'seg' });
  opts.forEach(([v, label]) => box.append(h('button', { class: v === cur ? 'on' : '', onclick: e => {
    [...box.children].forEach(x => x.classList.toggle('on', x === e.currentTarget)); onchange(v);
  } }, label)));
  return box;
}
function colorChips(cur, withNone, onchange) {
  const box = h('div', { class: 'chips' });
  // 트랙 색: 투명 + 7색(회색은 투명과 구분이 안 돼 뺌 — 이미 회색인 트랙은 그대로 보임). 보드 색은 8색
  const keys = withNone ? ['none', ...COLOR_KEYS.filter(k => k !== 'gray' || cur === 'gray')] : COLOR_KEYS;
  keys.forEach(k => {
    const c = h('button', { class: 'chip' + (k === 'none' ? ' none' : '') + (k === cur ? ' sel' : ''), 'aria-label': k === 'none' ? '투명' : COLOR_KO[k], title: k === 'none' ? '투명' : COLOR_KO[k] }, k === 'none' ? '투명' : '');
    if (k !== 'none') c.style.setProperty('--c', COLORS[k]);
    c.onclick = () => { [...box.children].forEach(x => x.classList.toggle('sel', x === c)); onchange(k); };
    box.append(c);
  });
  return box;
}
const sec1 = v => v.toFixed(1) + '초';
const volTxt = v => v + '%' + (v > 100 ? ' ↑' : '');   // 볼륨 0~300%, 슬라이더 가운데 = 100%(원래 소리)
// 막대 위치 ↔ % : 100% 아래는 귀 기준(% = 위치²) — 가운데 = 25%(−12dB, 귀로 절반). 20% 아래는 1%씩, 그 위는 5%씩 붙는다
const VOL_MAP = { min: 0, max: 200, to: v => v <= 100 ? Math.sqrt(v / 100) * 100 : 100 + (v - 100) / 2, from: x => x <= 100 ? x * x / 100 : 100 + (x - 100) * 2,
  snap: v => v < 20 ? Math.round(v) : Math.round(v / 5) * 5 };
// 이름 옆 [?]: 누르면 설명 말풍선
function helpLabel(name, text) {
  const tip = h('span', { class: 'tip', hidden: true }, text);
  const q = h('button', { class: 'qbtn', 'aria-label': name + ' 설명' }, '?');
  const toggle = e => { e.stopPropagation(); const was = tip.hidden; document.querySelectorAll('.tip').forEach(t => { t.hidden = true; }); tip.hidden = !was; };
  q.onclick = toggle;
  const nm = h('span', { class: 'hname' }, name); nm.onclick = toggle;
  return h('span', { class: 'hl' }, nm, q, tip);
}
document.addEventListener('click', () => document.querySelectorAll('.tip').forEach(t => { t.hidden = true; }));   // 다른 곳 누르면 말풍선 닫힘
// 루프: 끔 · 계속 · N번 · N초. loopBy 값 없음 = 계속(예전 패드는 그대로)
const loopMode = p => !p.loop ? 'off' : p.loopBy || 'on';
function applyLoop(q, o) {
  q.loop = o.mode !== 'off';
  if (o.mode === 'on' || o.mode === 'off') delete q.loopBy; else q.loopBy = o.mode;
  if (o.n != null) q.loopN = o.n;
  if (o.s != null) q.loopSec = o.s;
  Engine.setLoop(q.id, q.loop);
}
// 멈출 때까지 걸리는 초(끝 페이드 포함) — 계속이면 0
// 재생 길이: 횟수·초 반복이면 다 도는 전체 길이(3초 × 3번 = 9초). 계속 반복은 한 바퀴
function playLen(p, id) { return loopStop(p) || (id && Engine.dur(id)) || segLen(p); }
// 재생 위치: 엔진은 한 바퀴 안 위치만 알려 주니, 되감기면 바퀴를 세어 전체 위치로
var lap = {};
function playPos(id) {
  const pos = Engine.pos(id), p = S.pads[id], o = lap[id] || (lap[id] = { n: 0, pos: 0 });
  if (pos + 0.05 < o.pos) o.n++;
  o.pos = pos;
  return p && loopStop(p) ? Math.min(loopStop(p), o.n * (Engine.dur(id) || segLen(p)) + pos) : pos;
}
const loopStop = p => !p.loop || !p.loopBy ? 0 : p.loopBy === 'n' ? (p.loopN || 3) * segLen(p) : (p.loopSec || 30);
const endless = p => !!(p && p.loop && !p.loopBy);   // 끝없이 반복 — 남은 시간·전체 길이 대신 ∞
const loopTag = p => !p.loop || !p.loopBy ? '' : p.loopBy === 'n' ? '×' + (p.loopN || 3) : fmt(p.loopSec || 30);
function loopCtl(cur, n, s, mixedAny, onchange) {
  const box = h('div', { style: 'display:contents' });
  const draw = () => {
    box.textContent = '';
    box.append(row(h('span', null, helpLabel('반복(루프)', '계속 = 누를 때까지 돌아요. 번 = 정한 횟수만 돌고 멈춰요. 초 = 정한 시간 동안 돌고 이 트랙의 페이드아웃대로 줄어들며 멈춰요(페이드 포함해서 그 시간).'),
      mixedAny ? h('span', { class: 'sub mix' }, '지금 제각각') : null),
      seg([['off', '끔'], ['on', '계속'], ['n', '번'], ['s', '초']], cur, v => { cur = v; mixedAny = false; onchange({ mode: v, n: v === 'n' ? n : null, s: v === 's' ? s : null }); draw(); })));
    if (cur === 'n') box.append(row('몇 번', stepper(n, 1, 50, 1, v => v + '번', v => { n = v; onchange({ mode: 'n', n: v }); })));
    if (cur === 's') box.append(row('몇 초', stepper(s, 5, 600, 5, v => fmt(v), v => { s = v; onchange({ mode: 's', s: v }); })));
  };
  draw();
  return box;
}

const HELP = {
  vol: '이 트랙만의 크기예요. 100% = 파일 원래 소리. 100%보다 키우면 원래보다 커지고(최대 300%), 너무 키우면 소리가 찌그러질 수 있어요. 전체 크기는 오른쪽 MASTER로.',
  pan: '소리를 왼쪽·오른쪽 스피커 중 어디로 보낼지예요. 가운데 = 양쪽 똑같이. 왼쪽 100 = 왼쪽 스피커에서만. 스피커가 하나면 차이가 없어요.',
};
// 볼륨·팬 한 줄: [?] 설명 + 조절 + [원래대로]
const resetBtn = fn => h('button', { class: 'rst', onclick: fn, 'aria-label': '원래대로', title: '원래대로' }, '↺');   // 원래대로
const volRow = (label, stp, def) => h('div', { class: 'row col' }, h('label', null, label), h('div', { class: 'end' }, stp, resetBtn(() => stp.set(def))));
// 배속: 막대(50~200%) + 자주 쓰는 단계 단추. 막대는 단계 근처에 붙는다. 음정은 그대로(긴 트랙), 효과음은 음정도 같이 바뀜
const RATE_STEPS = [0.75, 1, 1.25, 1.5];
const RATE_MAP = { min: 50, max: 200, to: v => v, from: x => x, snap: v => { const k = [50, 75, 90, 100, 110, 125, 150, 175, 200].find(q => Math.abs(q - v) <= 3); return k ?? Math.round(v / 5) * 5; } };
function rateRow(cur, onchange, mixed) {
  const chips = h('div', { class: 'seg' });
  const mark = r => [...chips.children].forEach((b, i) => b.classList.toggle('on', RATE_STEPS[i] === r));
  const stp = stepper(Math.round(cur * 100), 50, 200, 5, v => (v / 100) + '배', v => { const r = v / 100; mark(r); onchange(r); }, mixed, RATE_MAP);
  RATE_STEPS.forEach(r => chips.append(h('button', { onclick: () => stp.set(r * 100) }, r + '배')));
  if (!mixed) mark(cur);
  return h('div', { class: 'row col' }, h('label', null, helpLabel('배속', '빠르기를 바꿔요. 1배 = 원래. 다음에 틀 때부터 바뀌어요. 긴 트랙은 음 높이 그대로 빠르기만, 짧은 효과음은 음 높이도 같이 바뀌어요.'), mixed ? h('span', { class: 'sub mix' }, '지금 제각각') : null),
    chips, h('div', { class: 'end' }, stp, resetBtn(() => stp.set(100))));
}
const panTxt = v => v === 0 ? '가운데' : (v < 0 ? '왼쪽 ' : '오른쪽 ') + Math.abs(v);

// 트림: 파일은 그대로, 시작·끝 지점만 기억. 파형(효과음) 위 두 손잡이 + 0.1초/1초 단추
// 트림: 막대 양 끝 아래에 [◀ 시간 ▶] (누르면 0.1초, 누르고 있으면 점점 빠르게). 미리 듣기도 여기서.
function trimBox(id, onchange, preview) {
  const p = S.pads[id], D = Engine.fileDur(id) || p.dur || 0;
  let s = p.start || 0, e = p.end > s ? Math.min(p.end, D) : D;
  const cv = h('canvas', { class: 'wave' }), sel = h('div', { class: 'tsel' });
  const hs = h('div', { class: 'th' }), he = h('div', { class: 'th' });
  const bar = h('div', { class: 'tbar' }, cv, sel, hs, he);
  const sOut = h('output'), eOut = h('output'), lenOut = h('span', { class: 'sub' });
  const draw = () => {
    const a = D ? s / D * 100 : 0, b = D ? e / D * 100 : 100;
    sel.style.left = a + '%'; sel.style.width = (b - a) + '%';
    hs.style.left = a + '%'; he.style.left = b + '%';
    sOut.textContent = fmtT(s); eOut.textContent = fmtT(e);
    lenOut.textContent = `틀 길이 ${fmtT(e - s)} / 전체 ${fmtT(D)}`;
  };
  const ns = () => +s.toFixed(2), ne = () => e >= D - 0.05 ? 0 : +e.toFixed(2);
  const dirty = () => ns() !== +(p.start || 0) || ne() !== +(p.end || 0);
  const stateEl = h('span', { class: 'sub' });
  const saveB = h('button', { class: 'sbtn pri', onclick: () => api.save() }, '저장'), cancelB = h('button', { class: 'sbtn', onclick: () => api.cancel() }, '취소');
  const mark = () => { const d = dirty(); saveB.disabled = cancelB.disabled = !d; stateEl.textContent = d ? '저장 안 됨' : ''; };
  // 바로 적용(창의 [취소]로 되돌림) + 바꾼 쪽을 바로 3초 들려줌(시작 = 그 자리부터, 끝 = 끝 3초 전부터)
  const commit = side => { if (!dirty()) return; api.save(); if (side) preview(side === 's' ? 0 : Math.max(0, Engine.dur(id) - 3), 3); };
  const api = {
    dirty,
    save() { logLine(`트림  ${nm(id)} ${ns()}~${ne() || '끝'}`); p.start = ns(); p.end = ne(); Engine.setTrim(id, p.start, p.end); touchEdit(p); save(); mark(); onchange(); },
    cancel() { logLine(`트림 취소 ${nm(id)}`); s = p.start || 0; e = p.end > s ? Math.min(p.end, D) : D; Engine.setTrim(id, p.start || 0, p.end || 0); draw(); mark(); },
  };
  const setS = v => { s = Math.min(Math.max(0, v), e - 0.1); draw(); };
  const setE = v => { e = Math.max(Math.min(D, v), s + 0.1); draw(); };
  const wave = () => {
    const r = bar.getBoundingClientRect(), dpr = devicePixelRatio || 1; if (!r.width) return;
    cv.width = r.width * dpr; cv.height = r.height * dpr;
    const c = cv.getContext('2d'), pk = Engine.peaks(id, Math.floor(r.width / 3)), mid = cv.height / 2;
    c.fillStyle = getComputedStyle(bar).color;
    if (!pk) { c.fillRect(0, mid - dpr, cv.width, 2 * dpr); return; }
    const w = cv.width / pk.length;
    pk.forEach((v, i) => { const hh = Math.max(dpr, v * mid * 0.95); c.fillRect(i * w, mid - hh, Math.max(dpr, w - dpr), hh * 2); });
  };
  let which = null;
  bar.addEventListener('pointerdown', ev => {
    const r = bar.getBoundingClientRect(), t = (ev.clientX - r.left) / r.width * D;
    which = Math.abs(t - s) <= Math.abs(t - e) ? 's' : 'e';
    bar.setPointerCapture(ev.pointerId); (which === 's' ? setS : setE)(t);
  });
  bar.addEventListener('pointermove', ev => { if (!which) return; const r = bar.getBoundingClientRect(); (which === 's' ? setS : setE)((ev.clientX - r.left) / r.width * D); });
  const up = () => { if (which) { const w = which; which = null; commit(w); } };
  bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
  // ◀▶: 한 번 = 0.1초, 누르고 있으면 반복하며 점점 크게(0.1 → 1초)
  const nb = (label, side, fn) => {
    const b = h('button', { class: 'nud', 'aria-label': label }, label); let tm = 0, n = 0;
    const stop = () => { if (!tm) return; clearTimeout(tm); tm = 0; commit(side); };
    const go = () => { fn(n < 8 ? 0.1 : n < 20 ? 0.5 : 1); n++; tm = setTimeout(go, n === 1 ? 400 : 90); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); n = 0; go(); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop));
    return b;
  };
  requestAnimationFrame(() => { wave(); draw(); });
  draw(); mark();
  api.el = h('div', { class: 'row col' },
    h('label', null, helpLabel('구간(트림)', (Engine.peaks(id, 8) ? '막대의 손잡이를 끌거나' : '긴 트랙은 파형 없이 막대로. 손잡이를 끌거나') + ' 아래 ◀▶로 시작·끝을 맞춰요(누르고 있으면 빨라짐). ↺ = 트랙 전체로. 파일은 잘리지 않아요. 시작·끝을 바꾸면 그 자리를 바로 3초 들려줘요.')),
    bar,
    h('div', { class: 'tends' },
      h('div', { class: 'tend' }, nb('◀', 's', d => setS(s - d)), h('span', null, h('small', null, '시작'), sOut), nb('▶', 's', d => setS(s + d))),
      h('div', { class: 'tend' }, nb('◀', 'e', d => setE(e - d)), h('span', null, h('small', null, '끝'), eOut), nb('▶', 'e', d => setE(e + d)))),
    h('div', { class: 'trow' }, lenOut, resetBtn(() => { s = 0; e = D; draw(); commit(); })),
    h('div', { class: 'trow' }, h('small', { class: 'plab' }, '미리 듣기'),
      h('button', { class: 'sbtn', onclick: () => preview(0) }, '▶ 처음부터'), h('button', { class: 'sbtn', onclick: () => preview(Math.max(0, Engine.dur(id) - 3)) }, '▶ 끝 3초'), h('button', { class: 'sbtn', onclick: () => Engine.stop(id, 0) }, '■')),
  );
  return api;
}

function openPadSheet(id) {
  const p = S.pads[id]; if (!p) return;
  const b = board(), rec = files.get(p.file);
  const refresh = () => { touchEdit(p); save(); const el = padEls.get(id); if (el) { const n = b.pads.indexOf(id) + 1; el.replaceWith(makePad(id, n)); } };
  // 미리 듣기: 편집 모드에선 패드를 눌러도 설정이 열리므로 여기서 듣는다
  let heard = false;
  // sec 있음 = 트림을 바꿔 자동으로 듣기(울리던 건 끊고 다시, sec초 뒤 정지). 없음 = 단추(누르면 켜고/끄기)
  let auTm = 0;
  const preview = (from, sec) => {
    if (status[id] !== 'ready' || !started) return;
    clearTimeout(auTm);
    if (Engine.isPlaying(id)) { Engine.stop(id, 0); if (!sec) return; }
    Engine.play(id, playOpt(p, from)); lastId = id; heard = true; paintPad(id);
    if (sec) auTm = setTimeout(() => { if (Engine.isPlaying(id)) Engine.stop(id, 0.15); }, sec * 1000);
  };
  let trim = null;
  openSheet('패드 설정', body => {
    const name = h('input', { class: 'txt', value: p.label, maxlength: 40, placeholder: '패드 이름' });
    name.oninput = () => { p.label = name.value; refresh(); };
    const moveSel = h('select', { class: 'sel' }, h('option', { value: '' }, '보드 이동'),
      S.boards.filter(x => x !== b).map(x => h('option', { value: x.id }, x.name)));
    moveSel.onchange = () => {
      const to = S.boards.find(x => x.id === moveSel.value); if (!to) return;
      b.pads.splice(b.pads.indexOf(id), 1); to.pads.push(id); save();
      toast(`"${p.label}" → ${to.name}`); closeSheet();
    };
    // 솔로를 켰을 때만: 이 솔로 트랙이 다른 트랙을 끄는 법(값 없음 = 예전 전체 설정 따름)
    const soloBox = h('div', { class: 'row col', hidden: !p.solo }, h('label', null, helpLabel('이 솔로 트랙이 다른 트랙을 끄는 법', '다른 트랙들을 어떻게 끌지 — 각자 정한 페이드아웃으로 / ◣ 버튼 시간으로 / 바로 뚝.')),
      seg([['each', '트랙별 페이드로'], ['fade', '◣ 시간으로'], ['stop', '바로 정지']], p.soloMode || S.settings.soloMode, v => { p.soloMode = v; touchEdit(p); save(); }));
    const act = h('div', { class: 'hact' }, h('button', { class: 'sbtn', onclick: () => {
        const nid = clonePad(id); b.pads.splice(b.pads.indexOf(id) + 1, 0, nid); save(); toast('복제했어요'); closeSheet();
      } }, '복제'), h('button', { class: 'sbtn', onclick: () => openVoiceSheet(id) }, '목소리'), S.boards.length > 1 ? moveSel : null, h('button', { class: 'sbtn danger', onclick: async () => {
        if (!await ask(`"${p.label}" 패드를 지울까요?`, { ok: '지우기', danger: true })) return;
        removePad(id); save(); closeSheet(); renderTop();
      } }, '삭제'));
    const head = body.previousSibling; head.insertBefore(act, head.lastChild);   // 닫기 왼쪽
    body.append(
      h('div', { class: 'row col' }, clearable(name)),
      h('div', { class: 'row col' }, h('label', null, helpLabel('색', '평소엔 어둡고 탁하게, 재생 중엔 밝게 켜져요. 투명 = 무채색(재생 중 밝은 회백색)')),
        colorChips(p.color, true, k => { p.color = k; refresh(); })),
      (trim = trimBox(id, () => { refresh(); renderTop(); }, preview)).el,
      volRow(helpLabel('볼륨', HELP.vol), stepper(Math.round(p.vol * 100), 0, 300, 5, volTxt, v => { p.vol = v / 100; Engine.setVolume(id, p.vol); touchEdit(p); save(); }, false, VOL_MAP), 100),
      volRow(helpLabel('팬', HELP.pan), stepper(Math.round((p.pan || 0) * 100), -100, 100, 10, panTxt, v => { p.pan = v / 100; Engine.setPan(id, p.pan); touchEdit(p); save(); }), 0),
      rateRow(p.rate || 1, r => { if (r === 1) delete p.rate; else p.rate = r; Engine.setRate(id, r); refresh(); renderTop(); }),
      loopCtl(loopMode(p), p.loopN || 3, p.loopSec || 30, false, o => { applyLoop(p, o); refresh(); }),
      row(helpLabel('솔로', '이 트랙을 틀면 이미 울리던 다른 트랙을 끕니다.'), sw(p.solo, on => { p.solo = on; soloBox.hidden = !on; refresh(); })),
      soloBox,
      h('div', { class: 'row col' }, h('label', null, helpLabel('페이드', '비탈 손잡이를 끌어요 · 끝까지 밀면 없음 · 아웃은 트랙 끝 + 다시 눌러 끌 때')),
        fadeEnv(p, (side, sec, final) => { envApply(p, side, sec); if (final) refresh(); })),
      h('div', { class: 'row' }, h('div', { class: 'info' },
        h('button', { class: 'sbtn', style: 'margin-right:8px', onclick: openFadeSheet }, '페이드 설정 (보드 전체)'),
        rec ? `파일: ${rec.name} · ${fmt(p.dur)} · ${(rec.size / 1048576).toFixed(1)}MB · ${p.dur <= Engine.SFX_MAX_SEC ? '메모리에 올려 둠' : '긴 트랙(조금씩 풀기)'}` : '파일이 없어요 — 지우고 다시 넣어 주세요')),
    );
  }, () => padEls.get(id), { pad: id });
  // 저장 안 한 트림은 닫을 때 묻는다. 미리 듣기로 튼 소리는 끔
  onSheetClose = () => {
    clearTimeout(auTm);
    if (heard && Engine.isPlaying(id)) Engine.stop(id, 0);
  };
}

// 여러 패드를 같은 값으로 — 바꾸는 항목만 모두에게 바로 적용
// 여러 패드를 같은 값으로. 모두 같은 항목은 그 값, 다른 항목은 '제각각'(아무것도 안 골라진 상태)으로 보이고
// 손댄 항목만 모두에게 같은 값으로 들어간다.
function openBulkSheet(ids) {
  const ps = ids.map(id => S.pads[id]).filter(Boolean); if (!ps.length) return;
  const same = k => ps.every(q => q[k] === ps[0][k]) ? ps[0][k] : undefined;
  const mixed = k => same(k) === undefined;
  const avg = k => ps.reduce((a, q) => a + (q[k] || 0), 0) / ps.length;
  const set = fn => { ps.forEach(q => { fn(q); touchEdit(q); }); save(); logLine(`일괄 수정 ${ps.length}개 → ` + ps.map(q => `${q.label}(vol ${Math.round(q.vol * 100)} 인 ${q.fin ? q.finSec : '끔'} 아웃 ${q.fout ? q.foutSec : '끔'} 루프 ${q.loop ? 1 : 0} 배속 ${q.rate || 1} 색 ${q.color})`).join(', ')); };
  const tag = k => mixed(k) ? h('span', { class: 'sub mix' }, '지금 제각각') : null;
  const lab = (name, ...k) => h('span', null, name, k.some(mixed) ? h('span', { class: 'sub mix' }, '지금 제각각') : null);
  const onoff = (k, extra) => seg([[true, '켬'], [false, '끔']], same(k), v => { set(q => { q[k] = v; extra && extra(q, v); }); });
  const num = (k, scale, min, max, step, show, apply, map) =>
    stepper(Math.round((mixed(k) ? avg(k) : same(k)) * scale / step) * step, min, max, step, show, v => set(q => apply(q, v)), mixed(k), map);
  openSheet(`${ps.length}개 일괄 수정`, body => body.append(
    h('div', { class: 'row' }, h('label', null, helpLabel('일괄 수정', '모두 같은 항목은 그 값이, 서로 다른 항목은 "제각각"으로 보여요. 손댄 항목만 고른 패드 모두에 같은 값으로 들어가요.'))),
    h('div', { class: 'row col' }, h('label', null, '색', tag('color')), colorChips(same('color'), true, k => set(q => { q.color = k; }))),
    volRow(h('span', null, helpLabel('볼륨', HELP.vol), mixed('vol') ? h('span', { class: 'sub mix' }, '지금 제각각') : null), num('vol', 100, 0, 300, 5, volTxt, (q, v) => { q.vol = v / 100; Engine.setVolume(q.id, q.vol); }, VOL_MAP), 100),
    volRow(h('span', null, helpLabel('팬', HELP.pan), mixed('pan') ? h('span', { class: 'sub mix' }, '지금 제각각') : null), num('pan', 100, -100, 100, 10, panTxt, (q, v) => { q.pan = v / 100; Engine.setPan(q.id, q.pan); }), 0),
    rateRow(ps[0].rate || 1, r => { set(q => { if (r === 1) delete q.rate; else q.rate = r; Engine.setRate(q.id, r); }); renderTop(); renderGrid(); }, ps.some(q => (q.rate || 1) !== (ps[0].rate || 1))),
    loopCtl(ps.every(q => loopMode(q) === loopMode(ps[0])) ? loopMode(ps[0]) : undefined, same('loopN') || 3, same('loopSec') || 30,
      ['loop', 'loopBy', 'loopN', 'loopSec'].some(mixed), o => set(q => applyLoop(q, o))),
    row(lab('솔로', 'solo'), onoff('solo')),
    fadeRow('페이드인', mixed('fin') || mixed('finSec') ? '지금 제각각' : '', onoff('fin'), num('finSec', 1, 0.1, fadeMax(), 0.1, sec1, (q, v) => { q.finSec = v; })),
    fadeRow('페이드아웃', mixed('fout') || mixed('foutSec') ? '지금 제각각' : '', onoff('fout'), num('foutSec', 1, 0.1, fadeMax(), 0.1, sec1, (q, v) => { q.foutSec = v; }), '트랙 끝에 닿을 때와 재생 중 다시 눌러 끌 때 둘 다 이 시간으로 줄어들어요.'),
  ));
}

// ---------- 페이드 모양 막대 ----------
// 편집 프로그램의 페이드 손잡이처럼: 왼쪽 비탈 = 페이드인, 오른쪽 비탈 = 페이드아웃. 끌어서 길이를 정하고, 끝까지 밀면 0초 = 끔.
// v = {fin, finSec, fout, foutSec} · onchange(side 'in'|'out', sec(0=끔), final) · opt.dim = {in:true} 이면 그쪽을 흐리게(아직 안 정함)
// 한쪽 비탈 최대 = 설정의 '최대 페이드 시간'(10·20·30초), 막대 폭의 46%까지(한쪽만 쓰는 막대는 92%)
const fadeMax = () => S.settings.fadeMax || 10;
const envX = (sec, half = 46) => Math.sqrt(Math.min(fadeMax(), sec) / fadeMax()) * half;   // 짧은 시간을 세밀하게(제곱근 눈금)
const envSec = (pct, half = 46) => Math.round(fadeMax() * (Math.max(0, Math.min(half, pct)) / half) ** 2 * 10) / 10;
// opt.outOnly = 페이드아웃 비탈 하나만(◣ 버튼 시간)
function fadeEnv(v, onchange, opt = {}) {
  let si = v.fin ? v.finSec : 0, so = v.fout ? v.foutSec : 0;
  const one = !!opt.outOnly, HO = one ? 92 : 46;
  const dim = { in: !!(opt.dim && opt.dim.in), out: !!(opt.dim && opt.dim.out) };
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 100 40'); svg.setAttribute('preserveAspectRatio', 'none');
  const poly = document.createElementNS(NS, 'polygon'); svg.append(poly);
  const hi = h('i', { class: 'eh' }), ho = h('i', { class: 'eh' });
  const li = h('span', { class: 'el in' }), lo = h('span', { class: 'el out' });
  const box = h('div', { class: 'env' + (opt.small ? ' small' : '') + (one ? ' one' : '') }, svg, hi, ho, li, lo);
  const draw = () => {
    const xi = one ? 0 : envX(si), xo = 100 - envX(so, HO);
    poly.setAttribute('points', `0,40 ${xi},3 ${xo},3 100,40`);
    hi.style.left = xi + '%'; ho.style.left = xo + '%';
    li.textContent = dim.in ? '인 —' : si ? `인 ${si.toFixed(1)}초` : '인 없음';
    lo.textContent = dim.out ? '아웃 —' : so ? `${one ? '' : '아웃 '}${so.toFixed(1)}초` : '아웃 없음';
    box.classList.toggle('dim-in', dim.in); box.classList.toggle('dim-out', dim.out);
  };
  let side = null;
  const at = e => { const r = box.getBoundingClientRect(); return (e.clientX - r.left) / r.width * 100; };
  const set = (e, final) => {
    const x = at(e);
    if (side === 'in') { si = envSec(x); dim.in = false; } else { so = envSec(100 - x, HO); dim.out = false; }
    draw(); onchange(side, side === 'in' ? si : so, final);
  };
  box.addEventListener('pointerdown', e => {
    const x = at(e);   // 가까운 손잡이 쪽
    side = !one && Math.abs(x - envX(si)) <= Math.abs(x - (100 - envX(so, HO))) ? 'in' : 'out';
    box.setPointerCapture(e.pointerId); box.classList.add('drag'); set(e, false);
  });
  box.addEventListener('pointermove', e => { if (side) set(e, false); });
  const up = e => { if (!side) return; set(e, true); side = null; box.classList.remove('drag'); };
  box.addEventListener('pointerup', up); box.addEventListener('pointercancel', () => { side = null; box.classList.remove('drag'); });
  box.update = nv => { si = nv.fin ? nv.finSec : 0; so = nv.fout ? nv.foutSec : 0; draw(); };
  draw();
  return box;
}
// 패드에 넣기: 0초 = 끔(시간 값은 남겨 둠)
const envApply = (p, side, sec) => {
  if (side === 'in') { p.fin = sec > 0; if (sec > 0) p.finSec = sec; }
  else { p.fout = sec > 0; if (sec > 0) p.foutSec = sec; }
};

// 페이드 설정(설정의 [페이드] 칸)
let fadeScope = null;   // 보드 id | 'all'
const openFadeSheet = () => openSettings('fade');
function fadeTab(body) {
  const st = S.settings;
  if (fadeScope !== 'all' && !S.boards.some(b => b.id === fadeScope)) fadeScope = board().id;
  let lastBoard = fadeScope === 'all' ? board().id : fadeScope;
  const ids = () => fadeScope === 'all' ? S.boards.flatMap(b => b.pads) : (S.boards.find(b => b.id === fadeScope) || board()).pads;
  const scopeName = () => fadeScope === 'all' ? '모든 보드' : (S.boards.find(b => b.id === fadeScope) || board()).name;
  const list = h('div', { class: 'flist' }), title = h('label');
  const picked = new Set();   // [선택 변경]에 쓸 곡(줄 앞 체크)
  const chk = (on, fn) => { const c = h('button', { class: 'chk' + (on ? ' on' : ''), 'aria-label': '고르기' }, '✓'); c.onclick = () => { on = !on; c.classList.toggle('on', on); fn(on); }; return c; };
  let selB = null;
  const markSel = () => { if (selB) { selB.disabled = !picked.size || !touched(); selB.textContent = picked.size ? `선택 변경 (${picked.size})` : '선택 변경'; } };
  const draw = () => {
    const L = ids(); list.textContent = '';
    for (const id of picked) if (!L.includes(id)) picked.delete(id);
    title.textContent = `${scopeName()}의 트랙 ${L.length}개`;
    list.append(h('div', { class: 'frow fhead ck' }, chk(L.length && L.every(id => picked.has(id)), on => { L.forEach(id => on ? picked.add(id) : picked.delete(id)); draw(); }),
      h('span', null, '트랙'), h('span', { class: 'ehead' }, h('span', null, '◢ 페이드인'), h('span', null, '페이드아웃 ◣'))));
    L.forEach(id => { const p = S.pads[id]; list.append(h('div', { class: 'frow ck' },
      chk(picked.has(id), on => { on ? picked.add(id) : picked.delete(id); markSel(); }),
      h('span', { class: 'fname' }, p.label || '(이름 없음)'),
      fadeEnv(p, (side, sec, final) => { envApply(p, side, sec); if (final) { touchEdit(p); save(); logLine(`트랙별 페이드 ${nm(id)} ${side === 'in' ? '인' : '아웃'} ${sec ? sec + '초' : '끔'}`); } }, { small: true }))); });
    if (!L.length) list.append(h('div', { class: 'info' }, '트랙이 없어요'));
    markSel();
  };
  // 한 번에 바꾸기: 위 막대에서 끌어 정한 쪽(인/아웃)만 넣는다. 곡마다 맞춘 값이 사라지므로 8초 안에 되돌리기
  const want = { in: null, out: null };   // null = 안 건드림
  const touched = () => want.in !== null || want.out !== null;
  const all = only => {
    const L = only ? ids().filter(id => picked.has(id)) : ids(), before = L.map(id => { const p = S.pads[id]; return [id, p.fin, p.finSec, p.fout, p.foutSec]; });
    const what = [want.in !== null ? `인 ${want.in ? want.in + '초' : '끔'}` : '', want.out !== null ? `아웃 ${want.out ? want.out + '초' : '끔'}` : ''].filter(Boolean).join(' · ');
    L.forEach(id => { const p = S.pads[id]; if (want.in !== null) envApply(p, 'in', want.in); if (want.out !== null) envApply(p, 'out', want.out); touchEdit(p); }); save(); draw();
    logLine(`페이드 한 번에(${scopeName()}${only ? ' 선택' : ''}) ${what} → ${L.map(id => S.pads[id].label).join(', ')}`);
    toast(`${L.length}개 트랙 ${what}`, 8000, { label: '되돌리기', fn: () => {
      before.forEach(([id, a, b, c, d]) => { const p = S.pads[id]; if (p) Object.assign(p, { fin: a, finSec: b, fout: c, foutSec: d }); });
      save(); draw(); logLine(`페이드 한 번에 되돌리기 ${before.length}개 트랙`);
    } });
  };
  const allB = h('button', { disabled: true, onclick: () => all(false) }, '전체 변경');
  selB = h('button', { class: 'pri', disabled: true, onclick: () => all(true) }, '선택 변경');
  const bulkEnv = fadeEnv({ fin: true, finSec: 1, fout: true, foutSec: 2 }, (side, sec) => { want[side] = sec; allB.disabled = false; markSel(); }, { dim: { in: true, out: true } });
  const bulk = h('div', { class: 'bulk' },
    h('div', null, helpLabel('한 번에 바꾸기', '막대를 끌어 정한 쪽(인/아웃)만 들어가요. 안 건드린 쪽은 트랙마다 그대로. [전체 변경] = 목록 전부, [선택 변경] = 체크한 트랙만. 8초 안에 되돌리기.')), bulkEnv,
    h('div', { class: 'trow' }, allB, selB));
  // 보기: [보드별 | 모든 보드] → 보드별이면 아래에 보드 칩
  const boardChips = h('div', { class: 'seg sm' });
  const drawChips = () => {
    boardChips.textContent = ''; boardChips.hidden = fadeScope === 'all';
    boardChips.append(...S.boards.map(b => h('button', { class: b.id === fadeScope ? 'on' : '', onclick: () => { fadeScope = lastBoard = b.id; drawChips(); draw(); } }, b.name)));
  };
  const mode = seg([['board', '보드별'], ['all', '모든 보드']], fadeScope === 'all' ? 'all' : 'board', v => { fadeScope = v === 'all' ? 'all' : lastBoard; drawChips(); draw(); });
  drawChips(); draw();
  body.append(
    h('div', { class: 'fbox' },
      h('div', { class: 'fbox-head' }, h('b', null, helpLabel('새로 넣는 트랙의 기본값', '파일을 새로 넣을 때 이 페이드로 들어가요'))),
      fadeEnv({ fin: st.newFin, finSec: st.newFinSec, fout: st.newFout, foutSec: st.newFoutSec }, (side, sec, final) => {
        if (side === 'in') { st.newFin = sec > 0; if (sec > 0) st.newFinSec = sec; } else { st.newFout = sec > 0; if (sec > 0) st.newFoutSec = sec; }
        if (final) save();
      })),
    row(helpLabel('최대 페이드 시간', '페이드 막대 한쪽 끝까지 밀었을 때의 길이예요. 길게 늘이는 트랙이 있으면 20·30초로. 짧을수록 막대를 세밀하게 맞추기 쉬워요.'),
      seg([[10, '10초'], [20, '20초'], [30, '30초']], fadeMax(), v => { st.fadeMax = v; save(); openSettings('fade', true); })),
    h('div', { class: 'row col' }, h('label', null, helpLabel('◣ 버튼 페이드', '아래 ◣를 누르면 울리는 모든 소리가 이 시간에 걸쳐 꺼져요. 막대 오른쪽 손잡이를 끌어요.')),
      fadeEnv({ fout: st.fadeSec > 0, foutSec: st.fadeSec }, (side, sec, final) => { st.fadeSec = Math.max(0.1, sec); if (final) save(); }, { outOnly: true })),
    // 옛 설정: 켜 둔 사람만 보임(끌 수 있게)
    st.fadeOverride ? row(helpLabel('모든 패드에 ◣ 시간 쓰기', '옛 설정 — 끄면 트랙별 페이드를 따름'), sw(true, on => { st.fadeOverride = on; save(); })) : '',
    // 곡별 페이드: 보기 고르기·한 번에 바꾸기·목록이 한 설정임을 상자 하나로
    h('div', { class: 'fbox' },
      h('div', { class: 'fbox-head' }, h('b', null, helpLabel('트랙별 페이드', '비탈 손잡이를 좌우로 끌어요. 끝까지 밀면 페이드 없음. 페이드아웃은 트랙 끝과 다시 눌러 끌 때 둘 다 걸려요.'))),
      mode, boardChips, title, bulk, list),
  );
}

// 볼륨 설정(설정의 [볼륨] 칸) — 페이드 칸과 같은 모양: 보기 고르기 + 체크 + 트랙 목록. 보기(보드)는 페이드 칸과 같이 씀
function volTab(body) {
  if (fadeScope !== 'all' && !S.boards.some(b => b.id === fadeScope)) fadeScope = board().id;
  let lastBoard = fadeScope === 'all' ? board().id : fadeScope;
  const ids = () => fadeScope === 'all' ? S.boards.flatMap(b => b.pads) : (S.boards.find(b => b.id === fadeScope) || board()).pads;
  const scopeName = () => fadeScope === 'all' ? '모든 보드' : (S.boards.find(b => b.id === fadeScope) || board()).name;
  const list = h('div', { class: 'flist' }), title = h('label');
  const picked = new Set();
  const chk = (on, fn) => { const c = h('button', { class: 'chk' + (on ? ' on' : ''), 'aria-label': '고르기' }, '✓'); c.onclick = () => { on = !on; c.classList.toggle('on', on); fn(on); }; return c; };
  const setVol = (p, v) => { p.vol = v / 100; Engine.setVolume(p.id, p.vol); touchEdit(p); };
  let decB, incB;
  const markSel = () => { const n = picked.size; decB.disabled = incB.disabled = !n; decB.textContent = `선택 −10%${n ? ` (${n})` : ''}`; incB.textContent = `선택 ＋10%${n ? ` (${n})` : ''}`; };
  const draw = () => {
    const L = ids(); list.textContent = '';
    for (const id of picked) if (!L.includes(id)) picked.delete(id);
    title.textContent = `${scopeName()}의 트랙 ${L.length}개`;
    list.append(h('div', { class: 'frow fhead ck' }, chk(L.length && L.every(id => picked.has(id)), on => { L.forEach(id => on ? picked.add(id) : picked.delete(id)); draw(); }),
      h('span', null, '트랙'), h('span', null, '볼륨')));
    L.forEach(id => { const p = S.pads[id]; list.append(h('div', { class: 'frow ck vrow' },
      chk(picked.has(id), on => { on ? picked.add(id) : picked.delete(id); markSel(); }),
      h('span', { class: 'fname' }, p.label || '(이름 없음)'),
      stepper(Math.round(p.vol * 100), 0, 300, 5, volTxt, v => { setVol(p, v); save(); }, false, VOL_MAP))); });
    if (!L.length) list.append(h('div', { class: 'info' }, '트랙이 없어요'));
    markSel();
  };
  // 고른 트랙을 같이 올리고 내리기(각자 비율은 그대로, 0~300% 안에서). 8초 안에 되돌리기
  const nudge = d => {
    const L = ids().filter(id => picked.has(id)), before = L.map(id => [id, S.pads[id].vol]);
    L.forEach(id => { const p = S.pads[id]; setVol(p, Math.min(300, Math.max(0, Math.round(p.vol * 100) + d))); }); save(); draw();
    logLine(`볼륨 한 번에(${scopeName()} 선택) ${d > 0 ? '+' : ''}${d}% → ${L.map(id => `${S.pads[id].label} ${Math.round(S.pads[id].vol * 100)}`).join(', ')}`);
    toast(`${L.length}개 트랙 ${d > 0 ? '+' : ''}${d}%`, 8000, { label: '되돌리기', fn: () => {
      before.forEach(([id, v]) => { const p = S.pads[id]; if (p) { p.vol = v; Engine.setVolume(id, v); } });
      save(); draw(); logLine(`볼륨 한 번에 되돌리기 ${before.length}개 트랙`);
    } });
  };
  decB = h('button', { disabled: true, onclick: () => nudge(-10) });
  incB = h('button', { class: 'pri', disabled: true, onclick: () => nudge(10) });
  const bulk = h('div', { class: 'bulk' },
    h('div', null, helpLabel('한 번에 바꾸기', '체크한 트랙을 모두 10%씩 올리거나 내려요. 트랙끼리 크기 차이는 그대로. 0~300% 안에서 멈춰요. 8초 안에 되돌리기.')),
    h('div', { class: 'trow' }, decB, incB));
  const boardChips = h('div', { class: 'seg sm' });
  const drawChips = () => {
    boardChips.textContent = ''; boardChips.hidden = fadeScope === 'all';
    boardChips.append(...S.boards.map(b => h('button', { class: b.id === fadeScope ? 'on' : '', onclick: () => { fadeScope = lastBoard = b.id; drawChips(); draw(); } }, b.name)));
  };
  const mode = seg([['board', '보드별'], ['all', '모든 보드']], fadeScope === 'all' ? 'all' : 'board', v => { fadeScope = v === 'all' ? 'all' : lastBoard; drawChips(); draw(); });
  drawChips(); draw();
  body.append(h('div', { class: 'fbox' },
    h('div', { class: 'fbox-head' }, h('b', null, helpLabel('트랙별 볼륨', HELP.vol))),
    mode, boardChips, title, bulk, list));
}

function openBoardSheet() {
  const b = board();
  openSheet('보드 설정', body => {
    const name = h('input', { class: 'txt', value: b.name, maxlength: 20, placeholder: '보드 이름' });
    name.oninput = () => { b.name = name.value || '보드'; save(); renderTabs(); };
    body.append(
      h('div', { class: 'row col' }, clearable(name)),
      h('div', { class: 'row col' }, h('label', null, helpLabel('보드 색', '보드 탭·판 테두리·뒷 배경에 쓰여요')),
        colorChips(b.color, false, k => { b.color = k; save(); applyBoardColor(); renderTabs(); paintAll(); })),
      row('페이드', h('button', { class: 'sbtn', onclick: () => { fadeScope = b.id; openFadeSheet(); } }, '이 보드 페이드 설정')),
      row('보드', h('button', { class: 'sbtn', onclick: () => {
        const nb = { id: uid(), name: b.name + ' 복사', color: b.color, pads: b.pads.map(id => clonePad(id)) };
        S.boards.splice(S.cur + 1, 0, nb); S.cur++; save(); applyBoardColor(); closeSheet(); toast('보드를 복제했어요');
      } }, '복제'), h('button', { class: 'sbtn danger', disabled: S.boards.length < 2, onclick: async () => {
        if (!await ask(`"${b.name}" 보드와 패드 ${b.pads.length}개를 지울까요?`, { ok: '지우기', danger: true })) return;
        [...b.pads].forEach(id => removePad(id)); S.boards.splice(S.cur, 1); S.cur = Math.max(0, S.cur - 1); save(); applyBoardColor(); closeSheet();
      } }, '삭제')),
    );
  }, () => $('tabs').querySelector('.tab.on'), { board: true });
}

// 설정 = [일반] [페이드] 두 칸
function openSettings(tab = 'general', keep) {
  openSheet('설정', body => {
    body.append(h('div', { class: 'row' }, seg([['general', '일반'], ['fade', '페이드'], ['vol', '볼륨']].concat(window.Cue && S.settings.cue ? [['cue', '큐']] : []), tab, v => openSettings(v, true))));
    if (tab === 'fade') return fadeTab(body);
    if (tab === 'vol') return volTab(body);
    if (tab === 'cue' && window.Cue) return Cue.tab(body);   // 큐보드
    const st = S.settings;
    const logBox = h('div', { class: 'logbox', hidden: true });
    body.append(...[
      row('화면', seg([['dark', '다크'], ['light', '화이트']], st.theme, v => { st.theme = v; save(); applyTheme(); })),
      row('패드 크기', seg([[8, '작게'], [6, '보통'], [4, '크게']], st.cols, v => { st.cols = v; save(); renderGrid(); })),
      row('패드 글자', seg([['s', '작게'], ['m', '보통'], ['l', '크게']], st.labelSize, v => { st.labelSize = v; save(); renderGrid(); })),
      row(helpLabel('MASTER 키우기', '공연장에서 소리가 작게 나올 때. MASTER 막대 전체가 이만큼 커져요(막대 숫자도 실제 크기로). 넘치는 소리는 저절로 눌러 찌그러짐을 막아요. 켜 두면 MASTER 숫자가 주황색'),
        seg([[1, '끔'], [1.5, '1.5배'], [2, '2배'], [3, '3배']], st.masterBoost || 1, v => {
          // 배율을 바꿔도 지금 들리는 크기는 그대로: 막대 위치를 반대로 옮긴다(넘치면 맨 위)
          S.master = Math.min(1, S.master * (st.masterBoost || 1) / v); Engine.setMaster(S.master);
          st.masterBoost = v; save(); Engine.setBoost(v); renderMaster(); logLine(`MASTER 키우기 ${v}배`);
        })),
      row(helpLabel('PLAYED 표시', '공연 모드를 켤 때와 6시간 안 쓰면 저절로 지워져요'), h('button', { class: 'sbtn', onclick: () => {
        clearPlayed(); save(); paintAll(); toast('PLAYED 표시를 모두 지웠어요');
      } }, '모두 지우기')),
      window.Cue ? Cue.settingRow() : null,
      LAB ? row(helpLabel('음원 서랍', '선생님 서버에서만 보여요. 켜면 ＋ 추가에 [음원 서랍]이 생겨 PC에 모아 둔 음원을 골라 넣을 수 있어요'),
        sw(!!st.drawer, v => { st.drawer = v; save(); logLine(`음원 서랍 ${v ? '켬' : '끔'}`); })) : null,
      fileRow(),
      offRow(),
      h('div', { class: 'row col' }, h('div', { class: 'info', id: 'memInfo' }, `${VER} · 올려 둔 소리 ${(Engine.loadedBytes / 1048576).toFixed(1)}MB · 소리 출구 ${Engine.state}`),
        h('div', { style: 'display:flex;gap:8px' },
          h('button', { class: 'sbtn', onclick: async () => { const m = (await askText('기록에 남길 메모 (예: A3 지직 없음)')) || ''; if (m.trim()) { logLine('📝 ' + m); flushLog(); toast('메모를 남겼어요'); } } }, '메모 남기기'),
          h('button', { class: 'sbtn', onclick: () => { logBox.hidden = !logBox.hidden; logBox.textContent = LOG.join('\n') || '(기록 없음)'; } }, '최근 기록'),
          h('button', { class: 'sbtn', onclick: async () => { try { await navigator.clipboard.writeText(LOG.join('\n')); toast('기록을 복사했어요'); } catch { toast('복사 실패 — 기록을 길게 눌러 선택'); } } }, '기록 복사')),
        logBox),
    ].filter(Boolean));   // 실험실이 아니면 null — append는 null을 글자로 찍음
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => {
      const m = $('memInfo'); if (m) m.textContent += ` · 저장 ${(e.usage / 1048576).toFixed(0)}MB / ${(e.quota / 1073741824).toFixed(1)}GB`;
    });
  }, null, null, keep);
}

// 설정: 보드 하나를 zip으로 내보내기 · zip을 새 보드로 가져오기
function fileRow() {
  const pick = h('select', { class: 'sel' }, S.boards.map(x => h('option', { value: x.id, selected: x === board() }, `${x.name} (${x.pads.length})`)));
  const exp = h('button', { class: 'sbtn', onclick: () => { const b = S.boards.find(x => x.id === pick.value); if (b && b.pads.length) exportBoard(b); else toast('패드가 없는 보드예요'); } }, '내보내기');
  return row(helpLabel('보드 파일', '고른 보드를 zip 파일 하나로 저장해요. 안의 소리 이름은 패드 이름, 형식은 원본 그대로(긴 곡은 트림 앞뒤 3분만). [가져오기]하면 늘 새 보드로 더해져요 — 있던 보드는 그대로'),
    h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, pick, exp, h('button', { class: 'sbtn', disabled: S.lock, onclick: pickImport }, '가져오기')));
}

// 설정: 오프라인 저장 상태 + [업데이트]
function offRow() {
  const txt = h('span', { class: 'plab' }, '확인 중…');
  const btn = h('button', { class: 'sbtn', hidden: true }, '업데이트');
  const paint = () => {
    const up = navigator.onLine && !!Off.latest;   // 서버에서 버전을 받아 와야 '연결됨'
    // 인터넷은 있는데 버전을 못 받았으면 '인터넷 없음'이 아님 — 서버가 꺼졌거나 로그인이 풀린 것(2026-10-01)
    const net = up ? '인터넷 연결됨' : navigator.onLine ? '새 버전 확인 못 함 (서버 꺼짐·로그인 풀림 — 새로고침)' : '인터넷 없음';
    if (!Off.ok) { txt.textContent = `${net} · 이 주소에선 오프라인 저장 안 됨`; return; }
    const saved = Off.saved ? `${Off.saved} 담김 — 인터넷 없어도 켜져요` : '아직 안 담김 — 인터넷 없으면 안 켜져요';
    const news = Off.latest && Off.latest !== APP_VER ? ` · 새 버전 ${Off.latest} 있음` : Off.latest ? ' · 최신' : '';
    txt.textContent = `${net} · ${saved}${news}`;
    btn.hidden = !up;
    btn.textContent = news.includes('새') ? `${Off.latest}로 업데이트` : '다시 받기';
  };
  btn.onclick = async () => {
    if (Engine.playingIds().length && !await ask('재생 중인 소리가 멈춰요. 업데이트할까요?', { ok: '업데이트' })) return;
    btn.disabled = true; txt.textContent = '기록 보내고 받는 중…';
    logLine(`업데이트 시작 ${APP_VER} → ${Off.latest || '?'}`);
    keepLog(); await sendKept(); await flushLog();
    try { const r = await Off.update(); logLine(`업데이트 받음 ${r.ver} · 파일 ${r.n}개`); await flushLog(); location.reload(); }
    catch (e) { logLine('업데이트 실패: ' + e.message, 'w'); flushLog(); txt.textContent = '업데이트 실패 — ' + e.message; btn.disabled = false; }
  };
  Off.check().then(paint);
  return row(helpLabel('오프라인', '한 번 열면 앱이 아이패드에 담겨 인터넷 없이도 켜져요. 새 버전은 [업데이트]를 눌러야 바뀌어요(공연 중 갑자기 안 바뀌게). 누를 때 기록도 PC로 보내요.'), h('div', { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap' }, txt, btn));
}

// ---------- 알림 (act = {label, fn} 이면 단추 하나) ----------
let toastT = 0;
function toast(msg, ms = 1800, act) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  if (act) t.append(h('button', { class: 'tact', onclick: () => { t.hidden = true; act.fn(); } }, act.label));
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------- 묻기 창 — 기본 confirm/prompt는 iOS가 앱 전체(소리 포함)를 멈춰서 쓰지 않는다 ----------
// ask(글, {ok, no, danger}) → true/false · askText(글, 처음값) → 글자 또는 null(취소)
function askBox(msg, o, input) {
  return new Promise(res => {
    const prev = document.activeElement;
    const fin = v => { document.removeEventListener('keydown', key, true); w.remove(); if (prev && prev.focus) try { prev.focus({ preventScroll: true }); } catch {} res(v); };
    const yes = () => fin(input ? input.value : true), no = () => fin(input ? null : false);
    const key = e => { e.stopPropagation();   // 창이 떠 있는 동안 GO 등 단축키 막기
      if (e.key === 'Escape') { e.preventDefault(); no(); } else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); yes(); } };
    const okB = h('button', { class: 'sbtn ' + (o.danger ? 'danger' : 'pri'), onclick: yes }, o.ok || '확인');
    const w = h('div', { class: 'ask-wrap', onclick: e => { if (e.target === w) no(); } },
      h('div', { class: 'ask', role: 'dialog', 'aria-modal': 'true' },
        h('p', null, msg), input,
        h('div', { class: 'ask-btns' }, h('button', { class: 'sbtn', onclick: no }, o.no || '취소'), okB)));
    document.addEventListener('keydown', key, true);
    document.body.append(w);
    (input || okB).focus({ preventScroll: true }); if (input) input.select();
  });
}
const ask = (msg, o = {}) => askBox(msg, o);
const askText = (msg, def = '', o = {}) => askBox(msg, o, h('input', { class: 'ask-in', type: 'text', value: def, maxlength: 60 }));

// ---------- 화면 꺼짐 방지 ----------
async function reqWake() {
  if (!started || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { await navigator.wakeLock.request('screen'); } catch (e) { logLine('화면 꺼짐 방지 실패: ' + e.message, 'w'); }
}

// ---------- 시작 ----------
// 판은 바로 그리고(3초 안 복원), 파일은 뒤에서 불러온다. 소리는 [▶ 시작] 탭(손 제스처)에서 연다.
// 웹 탭으로 열었으면 시작 창에 "앱으로 담기" 안내(탭 저장은 지워질 수 있음). 앱으로 열면 안 보임.
const Inst = (() => {
  const app = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (app) return;
  const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const mac = !ios && /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|Chromium|Edg|Firefox/.test(ua);
  const tip = ios ? '사파리 아래(또는 위) 공유 □↑ → "홈 화면에 추가". 탭으로만 쓰면 보드가 지워질 수 있어요.'
    : mac ? '메뉴 파일 → "Dock에 추가". 탭으로만 쓰면 보드가 지워질 수 있어요.'
    : /SamsungBrowser/.test(ua) ? '아래 ≡ → "현재 페이지 추가" → "홈 화면". 탭으로만 쓰면 보드가 지워질 수 있어요.'
    : /Android/.test(ua) ? '오른쪽 위 ⋮ → "홈 화면에 추가" 또는 "앱 설치". 탭으로만 쓰면 보드가 지워질 수 있어요.'
    : /Chrome|Edg/.test(ua) ? '주소창 오른쪽 설치 아이콘(⊕ 모니터 모양)을 누르세요. 탭으로만 쓰면 보드가 지워질 수 있어요.'
    : '크롬·엣지·사파리에서 열면 앱으로 담을 수 있어요. 탭으로만 쓰면 보드가 지워질 수 있어요.';
  $('instTxt').textContent = tip; $('instBox').hidden = false;
  if (ios) { $('instTxt').textContent = '탭으로만 쓰면 보드가 지워질 수 있어요.'; $('instSteps').hidden = false; }
  $('btnStart').textContent = '▶ 그냥 시작';
  let ev = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); ev = e; $('btnInst').hidden = false; $('instTxt').textContent = '버튼 한 번이면 끝. 탭으로만 쓰면 보드가 지워질 수 있어요.'; });
  addEventListener('appinstalled', () => { $('instBox').hidden = true; logLine('앱으로 설치됨'); });
  $('btnInst').onclick = async () => { if (!ev) return; ev.prompt(); const r = await ev.userChoice; logLine('앱 설치: ' + r.outcome); ev = null; $('btnInst').hidden = true; };
})();

$('btnStart').onclick = () => {
  Engine.unlock().catch(e => logLine('소리 출구 열기 실패: ' + e.message, 'e'));
  Engine.setMaster(S.master); Engine.setBoost(S.settings.masterBoost || 1);
  started = true; $('startOv').hidden = true;
  reqWake();
};

async function boot() {
  const t0 = performance.now();
  renderAll();
  logLine(VER);
  if (Off.ok) Off.check().then(() => logLine(`오프라인: ${!navigator.onLine ? '인터넷 없음' : Off.latest ? '연결됨' : '버전 확인 못 함'} · 담긴 ${Off.saved || '없음'}${Off.latest && Off.latest !== APP_VER ? ' · 새 버전 ' + Off.latest : ''}`));
  idleClear();
  try { await Store.open(); } catch (e) { toast('저장소를 열 수 없어요'); logLine('저장소 열기 실패: ' + (e && e.message), 'e'); return; }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(ok => logLine('영구 저장 ' + (ok ? '허용' : '거부'), ok ? 'i' : 'w'));
  const recs = await Store.allFiles();
  files = new Map(recs.map(r => [r.id, r]));
  recs.forEach(r => dropFileIfUnused(r.id));   // 넣다가 꺼진 파일 정리
  // 지금 보드 먼저, 나머지 보드는 뒤에
  const order = [...board().pads, ...S.boards.flatMap((b, i) => i === S.cur ? [] : b.pads)];
  for (const id of order) await loadPad(id);
  logLine(`복원 완료: 패드 ${order.length}개 · ${((performance.now() - t0) / 1000).toFixed(2)}초 · 올려 둔 소리 ${(Engine.loadedBytes / 1048576).toFixed(1)}MB`);
}
boot();

// ---------- 폰 화면 (세로: 폭 600px 이하 · 가로: 높이 500px 이하 · 아이패드는 그대로) ----------
// 아래 탭 [큐]/[패드] — 큐 탭 = 큐 목록 + 큰 GO, 패드 탭 = 패드 판. 큐보드를 꺼 두면 탭 없이 패드만.
(() => {
  const app = $('app'), mq = matchMedia('(max-width:600px),(max-height:500px)');
  const set = v => {
    app.dataset.pv = v;
    $('ptabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    if (v === 'cue' && mq.matches && window.Cue) Cue.open();
    requestAnimationFrame(() => { sizeRows(); placeSelBar(); });
  };
  $('ptabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) set(b.dataset.v); });
  addEventListener('load', () => set(app.dataset.pv || 'cue'));
  mq.addEventListener('change', () => set(app.dataset.pv || 'cue'));
})();
