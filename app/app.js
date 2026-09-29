// DuckQ Board 화면. 소리는 전부 Engine(engine.js), 저장은 Store(store.js)에 맡긴다.
'use strict';
const VER = 'DuckQ Board 0.3.8 (2026-09-29)';
const COLORS = { gray: '#9AA3AF', purple: '#B57EDC', orange: '#F08C3A', green: '#4FBF8B', red: '#EF5B5B', blue: '#5B8DEF', yellow: '#F2C94C', sky: '#4FC3E0' };
const COLOR_KO = { gray: '회', purple: '자주', orange: '주황', green: '초록', red: '빨강', blue: '파랑', yellow: '노랑', sky: '하늘' };
const COLOR_KEYS = Object.keys(COLORS);
const ROWS = { 4: 3, 6: 4, 8: 5 };           // 패드 크기 = 열 수 → 한 화면에 보이는 줄 수 (넘치면 세로 스크롤)
// 새 곡 페이드 기본값은 모두 끔(PLAN-app-fix1 3번). 패드 글자 크기 s/m/l
const DEF_SETTINGS = { theme: 'dark', cols: 6, fadeSec: 2, fadeOverride: false, soloMode: 'each', labelSize: 'm', newFin: false, newFinSec: 1, newFout: false, newFoutSec: 2 };
const PLAYED_IDLE_MS = 6 * 3600 * 1000;   // 마지막 사용 6시간 뒤 PLAYED 저절로 지움
const IC = {
  fi: '<svg viewBox="0 0 24 24"><path d="M3 19L21 5v14z"/></svg>',
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
async function flushLog() {
  if (!LOG_SEND || logSent >= logTotal) return;
  const upto = logTotal, lines = LOG.slice(Math.max(0, LOG.length - (upto - logSent)));
  const head = logSent === 0 ? `\n##### 앱 세션 ${new Date().toISOString()} · ${navigator.userAgent.slice(0, 80)} #####\n` : '';
  try {
    const r = await fetch('/log-app', { method: 'POST', body: head + lines.join('\n') });
    if (r.ok) logSent = upto;
  } catch {}
}
if (LOG_SEND) {
  setInterval(flushLog, 5000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushLog(); });
}
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
let saveFail = false;
function save() {
  const ok = Store.saveState(S);
  if (!ok && !saveFail) toast('저장 공간이 부족해서 저장하지 못했어요');
  saveFail = !ok;
}
const board = () => S.boards[S.cur];
const addedAt = p => p.added || parseInt(p.id.slice(0, 8), 36) || 0;   // 옛 패드는 id 앞부분이 만든 시각
const editedAt = p => p.edited || addedAt(p);
const segLen = p => Math.max(0.05, ((p.end > (p.start || 0) ? p.end : p.dur) || 0) - (p.start || 0));   // 트림한 구간 길이
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
}
function applyBoardColor() { document.body.style.setProperty('--board', COLORS[board().color] || COLORS.sky); }

function renderTop() {
  const b = board(), total = b.pads.reduce((a, id) => a + segLen(S.pads[id]), 0);
  const t = $('total');
  if (Engine.paused) t.innerHTML = '<b>⏸ 일시정지 중</b> · ⏸를 다시 누르면 이어서';
  else if (editMode) t.innerHTML = '<b>편집 중</b> · 눌러서 여러 개 고르기 · 꾹 눌러 끌면 순서 바꾸기';
  else t.textContent = `전체 ${fmtH(total)} · 패드 ${b.pads.length}개`;
  const L = S.lock;
  $('btnLock').classList.toggle('on', L);
  $('lockTxt').textContent = '공연 모드';   // 켜짐은 버튼 강조로 (소유자 결정: 이름 '공연 모드')
  $('lockArc').setAttribute('d', L ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 8 0');
  $('btnSet').disabled = L; $('btnEdit').disabled = L; $('btnAdd').disabled = L;
  $('btnEdit').classList.toggle('on', editMode);
  $('btnSort').hidden = !editMode;
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
  if (editMode) box.append(h('button', { class: 'tab new', onclick: addBoard }, '＋ 보드'));
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
    `<div class="icons">${p.fin ? IC.fi : ''}${p.solo ? IC.so : ''}${p.loop ? IC.lp : ''}</div>` +
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
  const none = p.color === 'none', hex = none ? COLORS[board().color] : COLORS[p.color];
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
    el._rm.textContent = st === 'bad' ? (badWhy[id] || '못 틂') : (st === 'ready' ? '-' + fmt(Math.ceil(segLen(p))) : '불러오는 중');
  } else tickPad(id, el);
}
function tickPad(id, el) {
  const d = Engine.dur(id) || segLen(S.pads[id]), pos = Engine.pos(id);
  el.style.setProperty('--p', Math.min(100, pos / d * 100).toFixed(1) + '%');
  el._el.textContent = fmt(pos); el._rm.textContent = '-' + fmt(Math.ceil(d - pos));
}
function paintAll() { padEls.forEach((_, id) => paintPad(id)); }

function renderMaster() {
  const v = S.master, sl = $('mSlider');
  $('mFill').style.height = (v * 100) + '%';
  $('mKnob').style.top = ((1 - v) * 100) + '%';
  $('mVal').textContent = Math.round(v * 100) + '%';
  sl.setAttribute('aria-valuenow', Math.round(v * 100));
}

function renderScrub() {
  const box = document.querySelector('.scrub');
  const p = lastId && S.pads[lastId];
  if (!p) { $('sName').textContent = '—'; $('sFill').style.width = '0'; $('sTime').textContent = '00:00 / 00:00'; box.classList.add('idle'); return; }
  const playing = Engine.isPlaying(lastId), d = Engine.dur(lastId) || segLen(p), pos = playing ? Engine.pos(lastId) : 0;
  $('sName').textContent = p.label;
  $('sFill').style.width = playing ? Math.min(100, pos / d * 100) + '%' : '0';
  $('sTime').textContent = fmt(pos) + ' / ' + fmt(d);
  box.classList.toggle('idle', !playing);
}

function renderPause() {
  const on = Engine.paused;
  document.body.classList.toggle('paused', on);
  $('btnPause').classList.toggle('on', on);
  $('pauseIc').innerHTML = on ? '<path d="M7 5l12 7-12 7z"/>' : '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>';
  $('btnPause').setAttribute('aria-label', on ? '전체 이어서' : '전체 일시정지');
}

function renderAll() { applyTheme(); applyBoardColor(); renderTop(); renderTabs(); renderGrid(); renderMaster(); renderScrub(); renderPause(); }

// 재생 중인 패드만 1초에 4번 갱신 (DESIGN §6)
setInterval(() => {
  for (const id of Engine.playingIds()) { const el = padEls.get(id); if (el) tickPad(id, el); }
  renderScrub();
}, 250);

// ---------- 패드 누르기 ----------
function tapPad(id) {
  const p = S.pads[id]; if (!p || status[id] !== 'ready' || !started) return;
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
const playOpt = (p, from) => ({ fadeIn: p.fin ? p.finSec : 0, fadeOut: foutOf(p), from });
function soloOthers(id) {
  const m = S.settings.soloMode;
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
const MOVE_PX = 10, HOLD_MS = 250, LONG_MS = 500;
const unpress = el => setTimeout(() => el.classList.remove('press'), 60);
function cancelTouch(t) { if (t.drag || t.dead) return; t.dead = true; clearTimeout(t.timer); t.el.classList.remove('press'); }
tray.addEventListener('scroll', () => { lastScroll = performance.now(); touches.forEach(cancelTouch); }, { passive: true });
grid.addEventListener('pointerdown', e => {
  const el = e.target.closest('.pad'); if (!el || !el.dataset.id) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  // 스크롤이 미끄러지는 중에 댄 손가락은 '멈추기'로 보고 소리 안 냄
  const t = { el, id: el.dataset.id, x: e.clientX, y: e.clientY, dead: performance.now() - lastScroll < 120 };
  touches.set(e.pointerId, t);
  if (!t.dead) el.classList.add('press');
  if (editMode && !t.dead) t.timer = setTimeout(() => startDrag(t), HOLD_MS);
  else if (!t.dead && !S.lock) t.timer = setTimeout(() => { t.dead = true; t.el.classList.remove('press'); logLine(`길게 누름 → 패드 설정 ${nm(t.id)}`); openPadSheet(t.id); }, LONG_MS);
});
window.addEventListener('pointermove', e => {
  const t = touches.get(e.pointerId); if (!t) return;
  if (t.drag) { t.cx = e.clientX; t.cy = e.clientY; dragMove(t); return; }
  if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > MOVE_PX) cancelTouch(t);
});
window.addEventListener('pointerup', e => {
  const t = touches.get(e.pointerId); if (!t) return;
  touches.delete(e.pointerId); clearTimeout(t.timer);
  if (t.drag) return endDrag(t);
  unpress(t.el);
  if (t.dead) return;
  if (editMode) toggleSel(t.id); else { logLine(`짧게 누름 ${nm(t.id)}${S.lock ? ' (공연 모드)' : ''}`); tapPad(t.id); }
});
window.addEventListener('pointercancel', e => {
  const t = touches.get(e.pointerId); if (!t) return;
  touches.delete(e.pointerId); clearTimeout(t.timer);
  if (t.drag) endDrag(t); else t.el.classList.remove('press');
});
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
document.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
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
function toggleSel(id) { if (sel.has(id)) sel.delete(id); else sel.add(id); paintPad(id); renderSelBar(); }
function clearSel() { sel.clear(); paintAll(); renderSelBar(); }
const selIds = () => board().pads.filter(id => sel.has(id));   // 보드 순서대로
function renderSelBar() {
  const bar = $('selBar'), ids = selIds();
  bar.hidden = !editMode; bar.textContent = ''; if (!editMode) return;
  const b = board(), n = ids.length, dis = !n;
  const moveSel = h('select', { class: 'sel', disabled: dis }, h('option', { value: '' }, '다른 보드로…'),
    S.boards.filter(x => x !== b).map(x => h('option', { value: x.id }, x.name)));
  moveSel.onchange = () => {
    const to = S.boards.find(x => x.id === moveSel.value); if (!to) return;
    ids.forEach(id => { b.pads.splice(b.pads.indexOf(id), 1); to.pads.push(id); });
    save(); toast(`${n}개 → ${to.name}`); sel.clear(); renderTop(); renderGrid();
  };
  bar.append(...[
    h('span', { class: 'cnt' }, n ? `${n}개 고름` : '패드를 눌러 고르세요'),
    h('button', { class: 'sbtn', onclick: () => { if (n === b.pads.length) clearSel(); else { b.pads.forEach(id => sel.add(id)); paintAll(); renderSelBar(); } } }, n && n === b.pads.length ? '고르기 해제' : '전체 고르기'),
    n === 1 ? h('button', { class: 'sbtn', onclick: () => openPadSheet(ids[0]) }, '설정') : null,
    h('button', { class: 'sbtn', disabled: dis, onclick: () => openBulkSheet(ids) }, '일괄 수정'),
    h('button', { class: 'sbtn', disabled: dis, onclick: () => {
      for (const id of [...ids].reverse()) { const nid = clonePad(id); b.pads.splice(b.pads.indexOf(id) + 1, 0, nid); }
      save(); sel.clear(); renderTop(); renderGrid(); toast(`${n}개 복제했어요`);
    } }, '복제'),
    S.boards.length > 1 ? moveSel : null,
    h('button', { class: 'sbtn danger', disabled: dis, onclick: () => {
      if (!confirm(`패드 ${n}개를 지울까요?`)) return;
      ids.forEach(removePad); sel.clear(); save(); renderTop(); renderGrid();
    } }, '삭제'),
  ].filter(Boolean));
}

const nm = id => `"${(S.pads[id] || {}).label || id}"`;   // 기록용 패드 이름
// 시험 기록(PLAN-app-fix1 시험표): 무엇을 눌러 무슨 일이 났는지 로그로 남겨 PC에서 분석
const WHY = { ended: '곡 끝', faded: '페이드 끝', stop: '바로 정지', restart: '다시 시작', hidden: '홈 복귀', ousted: '다른 창', error: '오류', unload: '지움' };
const playT = {};
Engine.on('play', id => {
  const p = S.pads[id]; playT[id] = performance.now();
  if (p) logLine(`▶ ${nm(id)} 구간 ${Engine.dur(id).toFixed(1)}초 · 인 ${p.fin ? p.finSec + '초' : '끔'} · 아웃 ${foutOf(p) ? foutOf(p) + '초' : '끔'}${p.loop ? ' · 반복' : ''}`);
  paintPad(id);
});
Engine.on('fade', id => logLine(`◢ ${nm(id)} 페이드아웃 시작`));
Engine.on('end', (id, why) => {
  const p = S.pads[id], t = playT[id] ? ((performance.now() - playT[id]) / 1000).toFixed(1) : '?';
  logLine(`■ ${nm(id)} ${WHY[why] || why} · ${t}초 들림` + (why === 'ended' && p && foutOf(p) && !p.loop ? ` · 끝 페이드 ${foutOf(p)}초 걸렸어야 함` : ''));
  paintPad(id);
});
Engine.on('pause', () => { renderPause(); renderTop(); });
Engine.on('return', () => { paintAll(); renderScrub(); reqWake(); });
Engine.on('ousted', () => { $('oustOv').hidden = false; paintAll(); });
$('btnReload').onclick = () => location.reload();

// ---------- 전역 컨트롤 ----------
function hit(btn, fn) {
  btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 90); if (started) fn(); });
}
hit($('btnPause'), () => {
  if (Engine.paused) { Engine.resumeAll(); logLine('⏵ 이어서 (30ms 올림)'); }
  else if (Engine.pauseAll()) logLine(`⏸ 일시정지 (30ms 줄임) · 재생 중 ${Engine.playingIds().length}곡`);
  else toast('재생 중인 소리가 없어요');
});
hit($('btnStop'), () => { logLine(`■ 전체정지${Engine.paused ? ' (⏸ 중 — 소리 막은 채 정리)' : ''} · ${Engine.playingIds().length}곡`); Engine.stopAll(0); paintAll(); });
hit($('btnFade'), () => { logLine(`◣ 전체 페이드 ${S.settings.fadeSec}초 · ${Engine.playingIds().length}곡`); Engine.stopAll(S.settings.fadeSec); paintAll(); });

// MASTER 세로 슬라이더
(() => {
  const sl = $('mSlider'); let on = false;
  const set = e => {
    const r = sl.getBoundingClientRect();
    S.master = Math.round(Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)) * 100) / 100;
    Engine.setMaster(S.master); renderMaster();
  };
  $('master').addEventListener('pointerdown', e => { on = true; $('master').setPointerCapture(e.pointerId); set(e); });
  $('master').addEventListener('pointermove', e => { if (on) set(e); });
  const up = () => { if (on) { on = false; save(); } };
  $('master').addEventListener('pointerup', up); $('master').addEventListener('pointercancel', up);
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
  if (!S.lastUse || Date.now() - S.lastUse < PLAYED_IDLE_MS) return;
  S.lastUse = 0;
  const was = clearPlayed(); save();
  if (was.length) { paintAll(); logLine(`6시간 안 써서 PLAYED ${was.length}개 지움`); }
}
setInterval(idleClear, 60000);
$('btnAdd').onclick = () => pickFiles();
$('btnSet').onclick = () => { if (!S.lock) openSettings(); };
$('btnSort').onclick = () => { if (editMode) openSort(); };

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
    body.append(h('div', { class: 'row' }, h('div', { class: 'info' }, '지금 보드의 순서를 한 번만 바꿔요. 계속 정렬된 채로 있지 않아요.')));
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
$('files').addEventListener('change', async e => {
  const list = [...e.target.files]; e.target.value = '';
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
});

async function loadPad(id) {
  const p = S.pads[id]; if (!p) return;
  const rec = files.get(p.file);
  if (!rec) { status[id] = 'bad'; badWhy[id] = '파일 없음'; paintPad(id); return; }
  status[id] = 'wait'; paintPad(id);
  try {
    const inf = await Engine.load(id, rec.blob, { dur: p.dur, volume: p.vol, loop: p.loop, pan: p.pan || 0, start: p.start || 0, end: p.end || 0 });
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

// ---------- 설정 판(시트) ----------
let onSheetClose = null;
// anchor(선택) = 설정 대상(패드·보드 탭)을 돌려주는 함수 → 그 옆에 말풍선처럼 띄우고, 대상만 떨리고 나머지는 흐리게
let focus = null, sheetAnchor = null;   // focus = {pad:id} | {board:true}
function openSheet(title, build, anchor, fc) {
  const sh = $('sheet'); sh.textContent = '';
  onSheetClose = null;
  const body = h('div', { class: 'sh-body' });
  sh.append(h('div', { class: 'sh-head' }, h('b', null, title), h('button', { class: 'ibtn', onclick: closeSheet }, '닫기')), body);
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
function closeSheet() {
  if ($('sheetWrap').hidden) return;
  if (onSheetClose) { try { onSheetClose(); } catch {} onSheetClose = null; }
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  $('sheetWrap').hidden = true; $('sheet').textContent = '';
  focus = sheetAnchor = null; document.body.classList.remove('focusing');
  renderTop(); renderTabs(); renderGrid();
}
let sheetAt = 0;   // 길게 눌러 연 직후 손 떼는 것이 바깥 누름으로 잡혀 바로 닫히지 않게
$('sheetWrap').addEventListener('click', e => { if (e.target === $('sheetWrap') && performance.now() - sheetAt > 400) closeSheet(); });

// 페이드 줄: 윗줄 = 이름·설명 + 켬/끔, 아랫줄 = 시간 (인·아웃 모양을 똑같이)
const fadeRow = (label, sub, onCtl, secCtl) => h('div', { class: 'row col frow2' },
  h('div', { class: 'fhead2' }, h('label', null, label, sub ? h('span', { class: 'sub' }, sub) : null), onCtl), h('div', { class: 'end' }, secCtl));
const row = (label, ...ctl) => h('div', { class: 'row' }, h('label', null, label), h('div', { class: 'end' }, ...ctl));
function sw(on, onchange) {
  const b = h('button', { class: 'sw' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(!!on) });
  b.onclick = () => { on = !on; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); onchange(on); };
  return b;
}
// 슬라이더 + −/＋ (손가락으로 정확히 맞추기 어려워서)
// mixed = 여러 패드 값이 제각각 → 값 대신 '제각각'으로 보이고, 손대는 순간 그 값으로 모두 같아짐
function stepper(val, min, max, step, show, onchange, mixed) {
  const out = h('output', null, mixed ? '제각각' : show(val));
  const rng = h('input', { type: 'range', min, max, step, value: val });
  const dec = String(step).split('.')[1]?.length || 0;
  const set = v => { v = Math.min(max, Math.max(min, +(+v).toFixed(dec))); val = v; rng.value = v; out.textContent = show(v); box.classList.remove('mixed'); onchange(v); };
  rng.oninput = () => set(rng.value);
  const box = h('div', { class: 'step' + (mixed ? ' mixed' : '') }, h('button', { onclick: () => set(val - step), 'aria-label': '줄이기' }, '−'), rng, h('button', { onclick: () => set(val + step), 'aria-label': '늘리기' }, '＋'), out);
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
  const keys = withNone ? ['none', ...COLOR_KEYS] : COLOR_KEYS;
  keys.forEach(k => {
    const c = h('button', { class: 'chip' + (k === 'none' ? ' none' : '') + (k === cur ? ' sel' : ''), 'aria-label': k === 'none' ? '색 없음' : COLOR_KO[k], title: k === 'none' ? '색 없음' : COLOR_KO[k] }, k === 'none' ? '없음' : '');
    if (k !== 'none') c.style.setProperty('--c', COLORS[k]);
    c.onclick = () => { [...box.children].forEach(x => x.classList.toggle('sel', x === c)); onchange(k); };
    box.append(c);
  });
  return box;
}
const sec1 = v => v.toFixed(1) + '초';
const panTxt = v => v === 0 ? '가운데' : (v < 0 ? '왼쪽 ' : '오른쪽 ') + Math.abs(v);

// 트림: 파일은 그대로, 시작·끝 지점만 기억. 파형(효과음) 위 두 손잡이 + 0.1초/1초 단추
// [저장]을 눌러야 패드에 남는다. 저장 전에도 미리 듣기는 바꾼 구간으로 들린다.
function trimBox(id, onchange) {
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
  const commit = () => { Engine.setTrim(id, ns(), ne()); mark(); };   // 미리 듣기용으로만 적용
  const api = {
    dirty,
    save() { logLine(`트림 저장 ${nm(id)} ${ns()}~${ne() || '끝'}`); p.start = ns(); p.end = ne(); Engine.setTrim(id, p.start, p.end); touchEdit(p); save(); mark(); onchange(); },
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
  const up = () => { if (which) { which = null; commit(); } };
  bar.addEventListener('pointerup', up); bar.addEventListener('pointercancel', up);
  const nb = (label, fn) => h('button', { onclick: () => { fn(); commit(); } }, label);
  requestAnimationFrame(() => { wave(); draw(); });
  draw(); mark();
  api.el = h('div', { class: 'row col' },
    h('label', null, '구간(트림)', h('span', { class: 'sub' }, Engine.peaks(id, 8) ? '손잡이를 끌거나 단추로 맞춰요. 파일은 잘리지 않아요' : '긴 곡은 파형 없이 시간으로 맞춰요. 파일은 잘리지 않아요')),
    bar,
    h('div', { class: 'trow' }, h('span', null, '시작'), nb('−1', () => setS(s - 1)), nb('−.1', () => setS(s - 0.1)), sOut, nb('+.1', () => setS(s + 0.1)), nb('+1', () => setS(s + 1))),
    h('div', { class: 'trow' }, h('span', null, '끝'), nb('−1', () => setE(e - 1)), nb('−.1', () => setE(e - 0.1)), eOut, nb('+.1', () => setE(e + 0.1)), nb('+1', () => setE(e + 1))),
    h('div', { class: 'trow' }, lenOut, h('button', { class: 'sbtn', onclick: () => { s = 0; e = D; draw(); commit(); } }, '전체로')),
    h('div', { class: 'trow' }, stateEl, cancelB, saveB),
  );
  return api;
}

function openPadSheet(id) {
  const p = S.pads[id]; if (!p) return;
  const b = board(), rec = files.get(p.file);
  const refresh = () => { touchEdit(p); save(); const el = padEls.get(id); if (el) { const n = b.pads.indexOf(id) + 1; el.replaceWith(makePad(id, n)); } };
  // 미리 듣기: 편집 모드에선 패드를 눌러도 설정이 열리므로 여기서 듣는다
  let heard = false;
  const preview = from => {
    if (status[id] !== 'ready' || !started) return;
    if (Engine.isPlaying(id)) { Engine.stop(id, 0); return; }
    Engine.play(id, playOpt(p, from)); lastId = id; heard = true; paintPad(id);
  };
  let trim = null;
  openSheet('패드 설정', body => {
    const name = h('input', { class: 'txt', value: p.label, maxlength: 40, placeholder: '패드 이름' });
    name.oninput = () => { p.label = name.value; refresh(); };
    const fin = stepper(p.finSec, 0.1, 10, 0.1, sec1, v => { p.finSec = v; touchEdit(p); save(); });
    const fout = stepper(p.foutSec, 0.1, 10, 0.1, sec1, v => { p.foutSec = v; touchEdit(p); save(); });
    fin.classList.toggle('off', !p.fin); fout.classList.toggle('off', !p.fout);
    const moveSel = h('select', { class: 'sel' }, h('option', { value: '' }, '다른 보드로…'),
      S.boards.filter(x => x !== b).map(x => h('option', { value: x.id }, x.name)));
    moveSel.onchange = () => {
      const to = S.boards.find(x => x.id === moveSel.value); if (!to) return;
      b.pads.splice(b.pads.indexOf(id), 1); to.pads.push(id); save();
      toast(`"${p.label}" → ${to.name}`); closeSheet();
    };
    body.append(
      h('div', { class: 'row col' }, name),
      h('div', { class: 'row col' }, h('label', null, '색', h('span', { class: 'sub' }, '없음 = 평소 무채색, 재생 중엔 보드 색으로 켜짐')),
        colorChips(p.color, true, k => { p.color = k; refresh(); })),
      row('미리 듣기', h('button', { class: 'sbtn', onclick: () => preview(0) }, '▶ 처음부터'), h('button', { class: 'sbtn', onclick: () => preview(Math.max(0, Engine.dur(id) - 3)) }, '▶ 끝 3초'), h('button', { class: 'sbtn', onclick: () => Engine.stop(id, 0) }, '■')),
      (trim = trimBox(id, () => { refresh(); renderTop(); })).el,
      row('볼륨', stepper(Math.round(p.vol * 100), 0, 100, 5, v => v + '%', v => { p.vol = v / 100; Engine.setVolume(id, p.vol); touchEdit(p); save(); })),
      row(h('span', null, '팬', h('span', { class: 'sub' }, '왼쪽·오른쪽 스피커로 치우치게')), stepper(Math.round((p.pan || 0) * 100), -100, 100, 10, panTxt, v => { p.pan = v / 100; Engine.setPan(id, p.pan); touchEdit(p); save(); })),
      row('반복(루프)', sw(p.loop, on => { p.loop = on; Engine.setLoop(id, on); refresh(); })),
      row(h('span', null, '솔로', h('span', { class: 'sub' }, '이 패드를 틀면 다른 소리를 끔')), sw(p.solo, on => { p.solo = on; refresh(); })),
      fadeRow('페이드인', '누르면 이 시간 동안 서서히 커짐', sw(p.fin, on => { p.fin = on; fin.classList.toggle('off', !on); refresh(); }), fin),
      fadeRow('페이드아웃', '곡 끝에 닿을 때 + 다시 눌러 끌 때', sw(p.fout, on => { p.fout = on; fout.classList.toggle('off', !on); touchEdit(p); save(); }), fout),
      row('패드', h('button', { class: 'sbtn', onclick: () => {
        const nid = clonePad(id); b.pads.splice(b.pads.indexOf(id) + 1, 0, nid); save(); toast('복제했어요'); closeSheet();
      } }, '복제'), S.boards.length > 1 ? moveSel : null, h('button', { class: 'sbtn danger', onclick: () => {
        if (!confirm(`"${p.label}" 패드를 지울까요?`)) return;
        removePad(id); save(); closeSheet(); renderTop();
      } }, '삭제')),
      h('div', { class: 'row' }, h('div', { class: 'info' },
        h('button', { class: 'sbtn', style: 'margin-right:8px', onclick: openFadeSheet }, '페이드 설정 (보드 전체)'),
        rec ? `파일: ${rec.name} · ${fmt(p.dur)} · ${(rec.size / 1048576).toFixed(1)}MB · ${p.dur <= Engine.SFX_MAX_SEC ? '메모리에 올려 둠' : '긴 곡(조금씩 풀기)'}` : '파일이 없어요 — 지우고 다시 넣어 주세요')),
    );
  }, () => padEls.get(id), { pad: id });
  // 저장 안 한 트림은 닫을 때 묻는다. 미리 듣기로 튼 소리는 끔
  onSheetClose = () => {
    if (trim && S.pads[id] && trim.dirty()) { logLine('트림 저장 안 하고 닫음 → 물어봄'); if (confirm('구간(트림)을 바꾼 게 저장되지 않았어요.\n저장할까요? (취소 = 바꾸기 전으로)')) trim.save(); else trim.cancel(); }
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
  const set = fn => { ps.forEach(q => { fn(q); touchEdit(q); }); save(); logLine(`일괄 수정 ${ps.length}개 → ` + ps.map(q => `${q.label}(vol ${Math.round(q.vol * 100)} 인 ${q.fin ? q.finSec : '끔'} 아웃 ${q.fout ? q.foutSec : '끔'} 루프 ${q.loop ? 1 : 0} 색 ${q.color})`).join(', ')); };
  const tag = k => mixed(k) ? h('span', { class: 'sub mix' }, '지금 제각각 — 고르면 모두 같아짐') : null;
  const lab = (name, ...k) => h('span', null, name, k.some(mixed) ? h('span', { class: 'sub mix' }, '지금 제각각 — 고르면 모두 같아짐') : null);
  const onoff = (k, extra) => seg([[true, '켬'], [false, '끔']], same(k), v => { set(q => { q[k] = v; extra && extra(q, v); }); });
  const num = (k, scale, min, max, step, show, apply) =>
    stepper(Math.round((mixed(k) ? avg(k) : same(k)) * scale / step) * step, min, max, step, show, v => set(q => apply(q, v)), mixed(k));
  openSheet(`${ps.length}개 일괄 수정`, body => body.append(
    h('div', { class: 'row' }, h('div', { class: 'info' }, '모두 같은 항목은 그 값이, 서로 다른 항목은 "제각각"으로 보여요. 손댄 항목만 고른 패드 모두에 같은 값으로 들어가요.')),
    h('div', { class: 'row col' }, h('label', null, '색', tag('color')), colorChips(same('color'), true, k => set(q => { q.color = k; }))),
    row(lab('볼륨', 'vol'), num('vol', 100, 0, 100, 5, v => v + '%', (q, v) => { q.vol = v / 100; Engine.setVolume(q.id, q.vol); })),
    row(lab('팬', 'pan'), num('pan', 100, -100, 100, 10, panTxt, (q, v) => { q.pan = v / 100; Engine.setPan(q.id, q.pan); })),
    row(lab('반복(루프)', 'loop'), onoff('loop', (q, v) => Engine.setLoop(q.id, v))),
    row(lab('솔로', 'solo'), onoff('solo')),
    fadeRow('페이드인', mixed('fin') || mixed('finSec') ? '지금 제각각 — 고르면 모두 같아짐' : '', onoff('fin'), num('finSec', 1, 0.1, 10, 0.1, sec1, (q, v) => { q.finSec = v; })),
    fadeRow('페이드아웃', '곡 끝 + 끌 때' + (mixed('fout') || mixed('foutSec') ? ' · 지금 제각각' : ''), onoff('fout'), num('foutSec', 1, 0.1, 10, 0.1, sec1, (q, v) => { q.foutSec = v; })),
  ));
}

// 페이드 설정(설정의 [페이드] 칸): 보드를 골라 그 곡들의 페이드인/아웃을 한눈에. 줄마다 켬·초, 위에 목록 전체에 한 번에.
let fadeScope = null;   // 보드 id | 'all'
const openFadeSheet = () => openSettings('fade');
function fadeTab(body) {
  const st = S.settings;
  if (fadeScope !== 'all' && !S.boards.some(b => b.id === fadeScope)) fadeScope = board().id;
  const STEP = 0.2;
  const clamp = v => Math.min(10, Math.max(STEP, +(+v).toFixed(1)));
  const mini = (on, sec, setOn, setSec) => {
    const o = h('output', null, sec1(sec));
    const box = h('div', { class: 'mini' + (on ? '' : ' off') });
    const s = sw(on, v => { box.classList.toggle('off', !v); setOn(v); });
    const bump = d => { sec = clamp(sec + d); o.textContent = sec1(sec); setSec(sec); };
    box.append(s, h('button', { onclick: () => bump(-STEP), 'aria-label': '줄이기' }, '−'), o, h('button', { onclick: () => bump(STEP), 'aria-label': '늘리기' }, '＋'));
    return box;
  };
  const ids = () => fadeScope === 'all' ? S.boards.flatMap(b => b.pads) : (S.boards.find(b => b.id === fadeScope) || board()).pads;
  const scopeName = () => fadeScope === 'all' ? '모든 보드' : (S.boards.find(b => b.id === fadeScope) || board()).name;
  const list = h('div', { class: 'flist' }), title = h('label');
  const draw = () => {
    const L = ids(); list.textContent = '';
    title.textContent = `${scopeName()}의 곡 ${L.length}개`;
    list.append(h('div', { class: 'frow fhead' }, h('span', null, '곡'), h('span', null, '페이드인'), h('span', null, '페이드아웃')));
    L.forEach(id => { const p = S.pads[id]; list.append(h('div', { class: 'frow' },
      h('span', { class: 'fname' }, p.label || '(이름 없음)'),
      mini(p.fin, p.finSec, v => { p.fin = v; touchEdit(p); save(); }, v => { p.finSec = v; touchEdit(p); save(); }),
      mini(p.fout, p.foutSec, v => { p.fout = v; touchEdit(p); save(); }, v => { p.foutSec = v; touchEdit(p); save(); }))); });
    if (!L.length) list.append(h('div', { class: 'info' }, '곡이 없어요'));
  };
  // 목록 전체에 한 번에 — 곡마다 따로 맞춘 값이 사라지므로 8초 안에 되돌리기
  const all = (what, fn) => {
    const L = ids(), before = L.map(id => { const p = S.pads[id]; return [id, p.fin, p.finSec, p.fout, p.foutSec]; });
    L.forEach(id => { fn(S.pads[id]); touchEdit(S.pads[id]); }); save(); draw();
    logLine(`페이드 한 번에(${scopeName()}) ${what} → ` + L.map(id => { const p = S.pads[id]; return `${p.label}(인 ${p.fin ? p.finSec : '끔'} 아웃 ${p.fout ? p.foutSec : '끔'})`; }).join(', '));
    toast(`${L.length}곡 ${what}`, 8000, { label: '되돌리기', fn: () => {
      before.forEach(([id, a, b, c, d]) => { const p = S.pads[id]; if (p) Object.assign(p, { fin: a, finSec: b, fout: c, foutSec: d }); });
      save(); draw(); logLine(`페이드 한 번에 되돌리기 ${before.length}곡`);
    } });
  };
  const bulk = (label, onK, secK) => {
    let n = onK === 'fin' ? 1 : 2; const o = h('output', null, sec1(n));
    return h('div', { class: 'bulk' }, h('b', null, label),
      h('div', { class: 'trow' },
        h('button', { onclick: () => all(`${label} 모두 켬`, p => { p[onK] = true; }) }, '모두 켬'),
        h('button', { onclick: () => all(`${label} 모두 끔`, p => { p[onK] = false; }) }, '모두 끔'),
        h('span', { class: 'gap' }),
        h('button', { onclick: () => { n = clamp(n - STEP); o.textContent = sec1(n); } }, '−'), o,
        h('button', { onclick: () => { n = clamp(n + STEP); o.textContent = sec1(n); } }, '＋'),
        h('button', { class: 'pri', onclick: () => all(`${label} 모두 ${sec1(n)}`, p => { p[onK] = true; p[secK] = n; }) }, '모두 이 시간으로')));
  };
  const chips = h('div', { class: 'seg' });
  const scopes = [...S.boards.map(b => [b.id, b.name]), ['all', '모든 보드']];
  chips.append(...scopes.map(([v, name]) => h('button', { class: v === fadeScope ? 'on' : '', onclick: e => {
    fadeScope = v; [...chips.children].forEach(x => x.classList.toggle('on', x === e.currentTarget)); draw();
  } }, name)));
  draw();
  body.append(
    h('div', { class: 'row col' }, h('label', null, '새로 넣는 곡의 기본값'),
      h('div', { class: 'frow fhead' }, h('span'), h('span', null, '페이드인'), h('span', null, '페이드아웃')),
      h('div', { class: 'frow' }, h('span', { class: 'fname' }, '새 곡'),
        mini(st.newFin, st.newFinSec, v => { st.newFin = v; save(); }, v => { st.newFinSec = v; save(); }),
        mini(st.newFout, st.newFoutSec, v => { st.newFout = v; save(); }, v => { st.newFoutSec = v; save(); }))),
    row(h('span', null, '◣ 버튼 페이드 시간', h('span', { class: 'sub' }, '◣를 누르면 모든 소리가 이 시간에 걸쳐 꺼짐')), stepper(st.fadeSec, 0.1, 10, 0.1, sec1, v => { st.fadeSec = v; save(); })),
    // 옛 설정: 켜 둔 사람만 보임(끌 수 있게)
    st.fadeOverride ? row(h('span', null, '모든 패드에 ◣ 시간 쓰기', h('span', { class: 'sub' }, '옛 설정 — 끄면 곡별 페이드를 따름')), sw(true, on => { st.fadeOverride = on; save(); })) : '',
    h('div', { class: 'row col' }, h('label', null, '솔로 켠 패드를 틀면, 울리던 다른 소리는', h('span', { class: 'sub' }, '패드 설정에서 "솔로"를 켠 곡만 해당')),
      seg([['each', '곡별 페이드로'], ['fade', '◣ 시간으로'], ['stop', '바로 정지']], st.soloMode, v => { st.soloMode = v; save(); })),
    // 곡별 페이드: 보드 고르기·한 번에 바꾸기·목록이 한 설정임을 상자 하나로 묶어 보여 줌
    h('div', { class: 'fbox' },
      h('div', { class: 'fbox-head' }, h('b', null, '곡별 페이드'), h('span', { class: 'sub' }, '페이드아웃은 곡 끝에 닿을 때와 다시 눌러 끌 때 둘 다 걸려요. 반복 곡은 끌 때만.')),
      chips, title, bulk('페이드인', 'fin', 'finSec'), bulk('페이드아웃', 'fout', 'foutSec'), list),
  );
}

function openBoardSheet() {
  const b = board();
  openSheet('보드 설정', body => {
    const name = h('input', { class: 'txt', value: b.name, maxlength: 20, placeholder: '보드 이름' });
    name.oninput = () => { b.name = name.value || '보드'; save(); renderTabs(); };
    body.append(
      h('div', { class: 'row col' }, name),
      h('div', { class: 'row col' }, h('label', null, '보드 색', h('span', { class: 'sub' }, '탭·판 테두리·뒷 배경, 색 없는 패드의 재생 색')),
        colorChips(b.color, false, k => { b.color = k; save(); applyBoardColor(); renderTabs(); paintAll(); })),
      row('페이드', h('button', { class: 'sbtn', onclick: () => { fadeScope = b.id; openFadeSheet(); } }, '이 보드 페이드 설정')),
      row('보드', h('button', { class: 'sbtn', onclick: () => {
        const nb = { id: uid(), name: b.name + ' 복사', color: b.color, pads: b.pads.map(id => clonePad(id)) };
        S.boards.splice(S.cur + 1, 0, nb); S.cur++; save(); applyBoardColor(); closeSheet(); toast('보드를 복제했어요');
      } }, '복제'), h('button', { class: 'sbtn danger', disabled: S.boards.length < 2, onclick: () => {
        if (!confirm(`"${b.name}" 보드와 패드 ${b.pads.length}개를 지울까요?`)) return;
        [...b.pads].forEach(id => removePad(id)); S.boards.splice(S.cur, 1); S.cur = Math.max(0, S.cur - 1); save(); applyBoardColor(); closeSheet();
      } }, '삭제')),
    );
  }, () => $('tabs').querySelector('.tab.on'), { board: true });
}

// 설정 = [일반] [페이드] 두 칸
function openSettings(tab = 'general') {
  openSheet('설정', body => {
    body.append(h('div', { class: 'row' }, seg([['general', '일반'], ['fade', '페이드']], tab, v => openSettings(v))));
    if (tab === 'fade') return fadeTab(body);
    const st = S.settings;
    const logBox = h('div', { class: 'logbox', hidden: true });
    body.append(
      row('화면', seg([['dark', '다크'], ['light', '화이트']], st.theme, v => { st.theme = v; save(); applyTheme(); })),
      row('패드 크기', seg([[8, '작게'], [6, '보통'], [4, '크게']], st.cols, v => { st.cols = v; save(); renderGrid(); })),
      row('패드 글자', seg([['s', '작게'], ['m', '보통'], ['l', '크게']], st.labelSize, v => { st.labelSize = v; save(); renderGrid(); })),
      row(h('span', null, 'PLAYED 표시', h('span', { class: 'sub' }, '공연 모드를 켤 때와 6시간 안 쓰면 저절로 지워져요')), h('button', { class: 'sbtn', onclick: () => {
        clearPlayed(); save(); paintAll(); toast('PLAYED 표시를 모두 지웠어요');
      } }, '모두 지우기')),
      h('div', { class: 'row col' }, h('div', { class: 'info', id: 'memInfo' }, `${VER} · 올려 둔 소리 ${(Engine.loadedBytes / 1048576).toFixed(1)}MB · 소리 출구 ${Engine.state}`),
        h('div', { style: 'display:flex;gap:8px' },
          h('button', { class: 'sbtn', onclick: () => { const m = prompt('기록에 남길 메모 (예: A3 지직 없음)'); if (m) { logLine('📝 ' + m); flushLog(); toast('메모를 남겼어요'); } } }, '메모 남기기'),
          h('button', { class: 'sbtn', onclick: () => { logBox.hidden = !logBox.hidden; logBox.textContent = LOG.join('\n') || '(기록 없음)'; } }, '최근 기록'),
          h('button', { class: 'sbtn', onclick: async () => { try { await navigator.clipboard.writeText(LOG.join('\n')); toast('기록을 복사했어요'); } catch { toast('복사 실패 — 기록을 길게 눌러 선택'); } } }, '기록 복사')),
        logBox),
    );
    if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => {
      const m = $('memInfo'); if (m) m.textContent += ` · 저장 ${(e.usage / 1048576).toFixed(0)}MB / ${(e.quota / 1073741824).toFixed(1)}GB`;
    });
  });
}

// ---------- 알림 (act = {label, fn} 이면 단추 하나) ----------
let toastT = 0;
function toast(msg, ms = 1800, act) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  if (act) t.append(h('button', { class: 'tact', onclick: () => { t.hidden = true; act.fn(); } }, act.label));
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------- 화면 꺼짐 방지 ----------
async function reqWake() {
  if (!started || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { await navigator.wakeLock.request('screen'); } catch (e) { logLine('화면 꺼짐 방지 실패: ' + e.message, 'w'); }
}

// ---------- 시작 ----------
// 판은 바로 그리고(3초 안 복원), 파일은 뒤에서 불러온다. 소리는 [▶ 시작] 탭(손 제스처)에서 연다.
$('btnStart').onclick = () => {
  Engine.unlock().catch(e => logLine('소리 출구 열기 실패: ' + e.message, 'e'));
  Engine.setMaster(S.master);
  started = true; $('startOv').hidden = true;
  reqWake();
};

async function boot() {
  const t0 = performance.now();
  renderAll();
  logLine(VER);
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
