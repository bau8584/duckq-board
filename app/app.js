// DuckQ Board 화면. 소리는 전부 Engine(engine.js), 저장은 Store(store.js)에 맡긴다.
'use strict';
const VER = 'DuckQ Board 0.2.1 (2026-09-29)';
const COLORS = { gray: '#9AA3AF', purple: '#B57EDC', orange: '#F08C3A', green: '#4FBF8B', red: '#EF5B5B', blue: '#5B8DEF', yellow: '#F2C94C', sky: '#4FC3E0' };
const COLOR_KO = { gray: '회', purple: '자주', orange: '주황', green: '초록', red: '빨강', blue: '파랑', yellow: '노랑', sky: '하늘' };
const COLOR_KEYS = Object.keys(COLORS);
const ROWS = { 4: 3, 6: 4, 8: 5 };           // 패드 크기 = 열 수 → 한 화면에 보이는 줄 수 (넘치면 세로 스크롤)
const DEF_SETTINGS = { theme: 'dark', cols: 6, fadeSec: 2, fadeOverride: false, soloMode: 'each' };
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
  if (LOG.length > 300) LOG.shift();
}
window.addEventListener('error', e => logLine('오류: ' + e.message + ' @' + e.lineno, 'e'));
window.addEventListener('unhandledrejection', e => logLine('오류: ' + (e.reason && e.reason.message || e.reason), 'e'));
Engine.on('log', (m, lv) => logLine(m, lv));

// ---------- 판 상태 ----------
// S = { boards:[{id,name,color,pads:[padId]}], cur, pads:{id:{...}}, master, lock, settings }
// 패드: label color vol pan loop solo fin finSec fout foutSec start end(0=끝까지) played added edited
const freshState = () => ({ v: 1, boards: [{ id: uid(), name: '보드 1', color: 'sky', pads: [] }], cur: 0, pads: {}, master: 1, lock: false, settings: { ...DEF_SETTINGS } });
const newPad = (file, label, dur) => { const t = Date.now(); return { id: uid(), file, label, dur, color: 'none', vol: 1, pan: 0, loop: false, solo: false, fin: false, finSec: 1, fout: true, foutSec: 2, start: 0, end: 0, played: false, added: t, edited: t }; };
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
  else if (editMode) t.innerHTML = '<b>편집 중</b> · 누르면 설정 · 꾹 눌러 끌면 순서 바꾸기';
  else t.textContent = `전체 ${fmtH(total)} · 패드 ${b.pads.length}개`;
  const L = S.lock;
  $('btnLock').classList.toggle('on', L);
  $('lockTxt').textContent = L ? '잠김' : '잠금';
  $('lockArc').setAttribute('d', L ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 8 0');
  $('btnSet').disabled = L; $('btnEdit').disabled = L; $('btnAdd').disabled = L;
  $('btnEdit').classList.toggle('on', editMode);
  $('btnSort').hidden = !editMode;
  document.body.classList.toggle('editing', editMode);
}

function renderTabs() {
  const box = $('tabs'); box.textContent = '';
  S.boards.forEach((b, i) => {
    const t = h('button', { class: 'tab' + (i === S.cur ? ' on' : ''), onclick: () => onTab(i) }, b.name);
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
  grid.style.setProperty('--cols', cols); grid.dataset.cols = cols; sizeRows();
  grid.textContent = ''; padEls.clear();
  ids.forEach((id, k) => grid.append(makePad(id, k + 1)));
  if (!S.lock) grid.append(h('button', { class: 'pad add', onclick: pickFiles }, h('big', null, '＋'), ids.length ? '파일 넣기' : '소리 파일 넣기'));
  if (S.lock && !ids.length) grid.append(h('div', { class: 'empty' }, '이 보드엔 패드가 없어요'));
}

function makePad(id, n) {
  const p = S.pads[id];
  const el = h('button', { class: 'pad', 'data-id': id, html:
    `<div class="icons">${p.fin ? IC.fi : ''}${p.solo ? IC.so : ''}${p.loop ? IC.lp : ''}</div>` +
    `<div class="idx">${String(n).padStart(2, '0')}</div><div class="eq"><i></i><i></i><i></i></div><div class="edit">✎</div>` +
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
    Engine.stop(id, S.settings.fadeOverride ? S.settings.fadeSec : p.fout ? p.foutSec : 0);
  } else {
    if (p.solo) soloOthers(id);
    if (Engine.play(id, { fadeIn: p.fin ? p.finSec : 0 })) {
      lastId = id;
      if (!p.played) { p.played = true; save(); }
    }
  }
  paintPad(id);
}
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
// 편집 모드: 짧게 누르고 떼면 설정, 꾹(0.25초) 누른 채 끌면 순서 바꾸기.
const touches = new Map();
let lastScroll = 0, drag = null;
const MOVE_PX = 10, HOLD_MS = 250;
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
  if (editMode) openPadSheet(t.id); else tapPad(t.id);
});
window.addEventListener('pointercancel', e => {
  const t = touches.get(e.pointerId); if (!t) return;
  touches.delete(e.pointerId); clearTimeout(t.timer);
  if (t.drag) endDrag(t); else t.el.classList.remove('press');
});
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
  const order = [...grid.querySelectorAll('.pad[data-id]')].map(x => x.dataset.id);
  const b = board();
  if (order.join() !== b.pads.join()) { b.pads = order; save(); }
  renderGrid();
}

Engine.on('play', id => paintPad(id));
Engine.on('end', id => paintPad(id));
Engine.on('pause', () => { renderPause(); renderTop(); });
Engine.on('return', () => { paintAll(); renderScrub(); reqWake(); });
Engine.on('ousted', () => { $('oustOv').hidden = false; paintAll(); });
$('btnReload').onclick = () => location.reload();

// ---------- 전역 컨트롤 ----------
function hit(btn, fn) {
  btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.classList.add('hit'); setTimeout(() => btn.classList.remove('hit'), 90); if (started) fn(); });
}
hit($('btnPause'), () => { if (Engine.paused) Engine.resumeAll(); else if (!Engine.pauseAll()) toast('재생 중인 소리가 없어요'); });
hit($('btnStop'), () => { Engine.stopAll(0); paintAll(); });
hit($('btnFade'), () => { Engine.stopAll(S.settings.fadeSec); paintAll(); });

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
  if (S.lock) { editMode = false; closeSheet(); }
  save(); renderTop(); renderTabs(); renderGrid();
  toast(S.lock ? '잠갔어요 — 패드·재생 버튼만 눌려요' : '잠금을 풀었어요');
};
$('btnEdit').onclick = () => { if (S.lock) return; editMode = !editMode; renderTop(); renderTabs(); };
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
function openSheet(title, build) {
  const sh = $('sheet'); sh.textContent = '';
  onSheetClose = null;
  const body = h('div', { class: 'sh-body' });
  sh.append(h('div', { class: 'sh-head' }, h('b', null, title), h('button', { class: 'ibtn', onclick: closeSheet }, '닫기')), body);
  build(body);
  $('sheetWrap').hidden = false; sh.scrollTop = 0;
}
function closeSheet() {
  if ($('sheetWrap').hidden) return;
  if (onSheetClose) { try { onSheetClose(); } catch {} onSheetClose = null; }
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  $('sheetWrap').hidden = true; $('sheet').textContent = '';
  renderTop(); renderTabs(); renderGrid();
}
$('sheetWrap').addEventListener('click', e => { if (e.target === $('sheetWrap')) closeSheet(); });

const row = (label, ...ctl) => h('div', { class: 'row' }, h('label', null, label), h('div', { class: 'end' }, ...ctl));
function sw(on, onchange) {
  const b = h('button', { class: 'sw' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(!!on) });
  b.onclick = () => { on = !on; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); onchange(on); };
  return b;
}
// 슬라이더 + −/＋ (손가락으로 정확히 맞추기 어려워서)
function stepper(val, min, max, step, show, onchange) {
  const out = h('output', null, show(val));
  const rng = h('input', { type: 'range', min, max, step, value: val });
  const dec = String(step).split('.')[1]?.length || 0;
  const set = v => { v = Math.min(max, Math.max(min, +(+v).toFixed(dec))); val = v; rng.value = v; out.textContent = show(v); onchange(v); };
  rng.oninput = () => set(rng.value);
  return h('div', { class: 'step' }, h('button', { onclick: () => set(val - step), 'aria-label': '줄이기' }, '−'), rng, h('button', { onclick: () => set(val + step), 'aria-label': '늘리기' }, '＋'), out);
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
  const commit = () => { p.start = +s.toFixed(2); p.end = e >= D - 0.05 ? 0 : +e.toFixed(2); Engine.setTrim(id, p.start, p.end); touchEdit(p); save(); onchange(); };
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
  draw();
  return h('div', { class: 'row col' },
    h('label', null, '구간(트림)', h('span', { class: 'sub' }, Engine.peaks(id, 8) ? '손잡이를 끌거나 단추로 맞춰요. 파일은 잘리지 않아요' : '긴 곡은 파형 없이 시간으로 맞춰요. 파일은 잘리지 않아요')),
    bar,
    h('div', { class: 'trow' }, h('span', null, '시작'), nb('−1', () => setS(s - 1)), nb('−.1', () => setS(s - 0.1)), sOut, nb('+.1', () => setS(s + 0.1)), nb('+1', () => setS(s + 1))),
    h('div', { class: 'trow' }, h('span', null, '끝'), nb('−1', () => setE(e - 1)), nb('−.1', () => setE(e - 0.1)), eOut, nb('+.1', () => setE(e + 0.1)), nb('+1', () => setE(e + 1))),
    h('div', { class: 'trow' }, lenOut, h('button', { class: 'sbtn', onclick: () => { s = 0; e = D; draw(); commit(); } }, '전체로')),
  );
}

function openPadSheet(id) {
  const p = S.pads[id]; if (!p) return;
  const b = board(), rec = files.get(p.file);
  const refresh = () => { touchEdit(p); save(); const el = padEls.get(id); if (el) { const n = b.pads.indexOf(id) + 1; el.replaceWith(makePad(id, n)); } };
  // 미리 듣기: 편집 모드에선 패드를 눌러도 설정이 열리므로 여기서 듣는다
  const preview = (from, btn) => {
    if (status[id] !== 'ready' || !started) return;
    if (Engine.isPlaying(id)) { Engine.stop(id, 0); return; }
    Engine.play(id, { fadeIn: p.fin ? p.finSec : 0, from }); lastId = id; paintPad(id);
  };
  onSheetClose = () => { if (Engine.isPlaying(id) && editMode) Engine.stop(id, 0); };
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
    const L = () => segLen(p);
    body.append(
      h('div', { class: 'row col' }, name),
      h('div', { class: 'row col' }, h('label', null, '색', h('span', { class: 'sub' }, '없음 = 평소 무채색, 재생 중엔 보드 색으로 켜짐')),
        colorChips(p.color, true, k => { p.color = k; refresh(); })),
      row('미리 듣기', h('button', { class: 'sbtn', onclick: () => preview(0) }, '▶ 처음부터'), h('button', { class: 'sbtn', onclick: () => preview(Math.max(0, L() - 3)) }, '▶ 끝 3초'), h('button', { class: 'sbtn', onclick: () => Engine.stop(id, 0) }, '■')),
      trimBox(id, () => { refresh(); renderTop(); }),
      row('볼륨', stepper(Math.round(p.vol * 100), 0, 100, 5, v => v + '%', v => { p.vol = v / 100; Engine.setVolume(id, p.vol); touchEdit(p); save(); })),
      row(h('span', null, '팬', h('span', { class: 'sub' }, '왼쪽·오른쪽 스피커로 치우치게')), stepper(Math.round((p.pan || 0) * 100), -100, 100, 10, panTxt, v => { p.pan = v / 100; Engine.setPan(id, p.pan); touchEdit(p); save(); })),
      row('반복(루프)', sw(p.loop, on => { p.loop = on; Engine.setLoop(id, on); refresh(); })),
      row(h('span', null, '솔로', h('span', { class: 'sub' }, '이 패드를 틀면 다른 소리를 끔')), sw(p.solo, on => { p.solo = on; refresh(); })),
      row('페이드인', sw(p.fin, on => { p.fin = on; fin.classList.toggle('off', !on); refresh(); }), fin),
      row(h('span', null, '페이드아웃', h('span', { class: 'sub' }, '재생 중 다시 누를 때')), sw(p.fout, on => { p.fout = on; fout.classList.toggle('off', !on); touchEdit(p); save(); }), fout),
      row('패드', h('button', { class: 'sbtn', onclick: () => {
        const nid = clonePad(id); b.pads.splice(b.pads.indexOf(id) + 1, 0, nid); save(); toast('복제했어요'); closeSheet();
      } }, '복제'), S.boards.length > 1 ? moveSel : null, h('button', { class: 'sbtn danger', onclick: () => {
        if (!confirm(`"${p.label}" 패드를 지울까요?`)) return;
        removePad(id); save(); closeSheet(); renderTop();
      } }, '삭제')),
      h('div', { class: 'row' }, h('div', { class: 'info' },
        rec ? `파일: ${rec.name} · ${fmt(p.dur)} · ${(rec.size / 1048576).toFixed(1)}MB · ${p.dur <= Engine.SFX_MAX_SEC ? '메모리에 올려 둠' : '긴 곡(조금씩 풀기)'}` : '파일이 없어요 — 지우고 다시 넣어 주세요')),
    );
  });
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
      row('보드', h('button', { class: 'sbtn', onclick: () => {
        const nb = { id: uid(), name: b.name + ' 복사', color: b.color, pads: b.pads.map(id => clonePad(id)) };
        S.boards.splice(S.cur + 1, 0, nb); S.cur++; save(); applyBoardColor(); closeSheet(); toast('보드를 복제했어요');
      } }, '복제'), h('button', { class: 'sbtn danger', disabled: S.boards.length < 2, onclick: () => {
        if (!confirm(`"${b.name}" 보드와 패드 ${b.pads.length}개를 지울까요?`)) return;
        [...b.pads].forEach(id => removePad(id)); S.boards.splice(S.cur, 1); S.cur = Math.max(0, S.cur - 1); save(); applyBoardColor(); closeSheet();
      } }, '삭제')),
    );
  });
}

function openSettings() {
  openSheet('설정', body => {
    const st = S.settings;
    const logBox = h('div', { class: 'logbox', hidden: true });
    body.append(
      row('화면', seg([['dark', '다크'], ['light', '화이트']], st.theme, v => { st.theme = v; save(); applyTheme(); })),
      row('패드 크기', seg([[8, '작게'], [6, '보통'], [4, '크게']], st.cols, v => { st.cols = v; save(); renderGrid(); })),
      row(h('span', null, '전체 페이드 시간', h('span', { class: 'sub' }, '◣ 버튼')), stepper(st.fadeSec, 0.1, 10, 0.1, sec1, v => { st.fadeSec = v; save(); })),
      row(h('span', null, '모든 패드에 이 시간 쓰기', h('span', { class: 'sub' }, '켜면 패드를 끌 때도 위 시간으로 페이드')), sw(st.fadeOverride, on => { st.fadeOverride = on; save(); })),
      h('div', { class: 'row col' }, h('label', null, '솔로 패드를 틀 때 다른 소리'),
        seg([['each', '각자 페이드값으로'], ['fade', '전체 페이드 시간으로'], ['stop', '바로 정지']], st.soloMode, v => { st.soloMode = v; save(); })),
      row(h('span', null, 'PLAYED 표시', h('span', { class: 'sub' }, '모든 보드의 "틀었음" 표시를 지움')), h('button', { class: 'sbtn', onclick: () => {
        Object.values(S.pads).forEach(p => { p.played = false; }); save(); paintAll(); toast('PLAYED 표시를 모두 지웠어요');
      } }, '모두 지우기')),
      h('div', { class: 'row col' }, h('div', { class: 'info', id: 'memInfo' }, `${VER} · 올려 둔 소리 ${(Engine.loadedBytes / 1048576).toFixed(1)}MB · 소리 출구 ${Engine.state}`),
        h('div', { style: 'display:flex;gap:8px' },
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
