// DuckQ Board 화면. 소리는 전부 Engine(engine.js), 저장은 Store(store.js)에 맡긴다.
'use strict';
const VER = 'DuckQ Board 0.1.0 (2026-09-29)';
const COLORS = { gray: '#9AA3AF', purple: '#B57EDC', orange: '#F08C3A', green: '#4FBF8B', red: '#EF5B5B', blue: '#5B8DEF', yellow: '#F2C94C', sky: '#4FC3E0' };
const COLOR_KO = { gray: '회', purple: '자주', orange: '주황', green: '초록', red: '빨강', blue: '파랑', yellow: '노랑', sky: '하늘' };
const COLOR_KEYS = Object.keys(COLORS);
const ROWS = { 4: 3, 6: 4, 8: 5 };           // 패드 크기 = 열 수 → 한 쪽에 들어가는 줄 수
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
const freshState = () => ({ v: 1, boards: [{ id: uid(), name: '보드 1', color: 'sky', pads: [] }], cur: 0, pads: {}, master: 1, lock: false, settings: { ...DEF_SETTINGS } });
const newPad = (file, label, dur) => ({ id: uid(), file, label, dur, color: 'none', vol: 1, loop: false, solo: false, fin: false, finSec: 1, fout: true, foutSec: 2, played: false });
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

// 실행 중에만 쓰는 것
const status = {};          // padId → 'wait' | 'ready' | 'bad'
const badWhy = {};
let files = new Map();      // fileId → {id,name,size,type,blob}
let editMode = false, page = 0, lastId = null, started = false;
const padEls = new Map();   // padId → 화면의 패드 버튼

// ---------- 그리기 ----------
function applyTheme() {
  document.documentElement.dataset.theme = S.settings.theme;
  document.querySelector('meta[name=theme-color]').content = S.settings.theme === 'light' ? '#e9edf4' : '#0d1017';
}
function applyBoardColor() { document.body.style.setProperty('--board', COLORS[board().color] || COLORS.sky); }

function renderTop() {
  const b = board(), total = b.pads.reduce((a, id) => a + (S.pads[id].dur || 0), 0);
  const t = $('total');
  if (Engine.paused) t.innerHTML = '<b>⏸ 일시정지 중</b> · ⏸를 다시 누르면 이어서';
  else if (editMode) t.innerHTML = '<b>편집 중</b> · 패드를 누르면 설정 · 보드 탭을 누르면 보드 설정';
  else t.textContent = `전체 ${fmtH(total)} · 패드 ${b.pads.length}개`;
  const L = S.lock;
  $('btnLock').classList.toggle('on', L);
  $('lockTxt').textContent = L ? '잠김' : '잠금';
  $('lockArc').setAttribute('d', L ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 8 0');
  $('btnSet').disabled = L; $('btnEdit').disabled = L; $('btnAdd').disabled = L;
  $('btnEdit').classList.toggle('on', editMode);
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
  box.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function pageInfo() {
  const cols = S.settings.cols, rows = ROWS[cols] || 4, per = cols * rows;
  const n = board().pads.length + (S.lock ? 0 : 1);
  return { cols, rows, per, pages: Math.max(1, Math.ceil(n / per)) };
}
function renderPager() {
  const { pages } = pageInfo(), box = $('pager'); box.textContent = '';
  if (pages <= 1) return;
  box.append(
    h('button', { onclick: () => { page--; renderGrid(); }, disabled: page === 0, 'aria-label': '앞 쪽' }, '‹'),
    h('span', null, `${page + 1} / ${pages}`),
    h('button', { onclick: () => { page++; renderGrid(); }, disabled: page >= pages - 1, 'aria-label': '다음 쪽' }, '›'));
}

function renderGrid() {
  const { cols, rows, per, pages } = pageInfo(), g = $('grid'), ids = board().pads;
  if (page >= pages) page = pages - 1;
  g.style.setProperty('--cols', cols); g.style.setProperty('--rows', rows); g.dataset.cols = cols;
  g.textContent = ''; padEls.clear();
  const start = page * per, end = Math.min(start + per, ids.length);
  for (let k = start; k < end; k++) g.append(makePad(ids[k], k + 1));
  if (!S.lock && ids.length >= start && ids.length < start + per) {
    g.append(h('button', { class: 'pad add', onclick: pickFiles }, h('big', null, '＋'), ids.length ? '파일 넣기' : '소리 파일 넣기'));
  }
  if (S.lock && !ids.length) g.append(h('div', { class: 'empty' }, '이 보드엔 패드가 없어요'));
  renderPager();
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
    el._rm.textContent = st === 'bad' ? (badWhy[id] || '못 틂') : (st === 'ready' ? '-' + fmt(p.dur) : '불러오는 중');
  } else tickPad(id, el);
}
function tickPad(id, el) {
  const p = S.pads[id], d = Engine.dur(id) || p.dur || 1, pos = Engine.pos(id);
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
  const playing = Engine.isPlaying(lastId), d = Engine.dur(lastId) || p.dur, pos = playing ? Engine.pos(lastId) : 0;
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

const grid = $('grid');
grid.addEventListener('pointerdown', e => {
  const el = e.target.closest('.pad'); if (!el || !el.dataset.id) return;
  el.classList.add('press');
  if (editMode) return;
  e.preventDefault();
  tapPad(el.dataset.id);   // 손 닿는 순간 바로 (떼는 걸 기다리지 않음)
});
const unpress = e => { const el = e.target.closest && e.target.closest('.pad'); if (el) setTimeout(() => el.classList.remove('press'), 60); };
grid.addEventListener('pointerup', unpress); grid.addEventListener('pointercancel', unpress); grid.addEventListener('pointerleave', unpress, true);
grid.addEventListener('click', e => {
  const el = e.target.closest('.pad'); if (!el || !el.dataset.id || !editMode) return;
  openPadSheet(el.dataset.id);
});
['gesturestart', 'dblclick'].forEach(ev => document.addEventListener(ev, e => e.preventDefault(), { passive: false }));

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
  const sl = $('mSlider'); let drag = false;
  const set = e => {
    const r = sl.getBoundingClientRect();
    S.master = Math.round(Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)) * 100) / 100;
    Engine.setMaster(S.master); renderMaster();
  };
  $('master').addEventListener('pointerdown', e => { drag = true; $('master').setPointerCapture(e.pointerId); set(e); });
  $('master').addEventListener('pointermove', e => { if (drag) set(e); });
  const up = () => { if (drag) { drag = false; save(); } };
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

function onTab(i) {
  if (i === S.cur) { if (editMode && !S.lock) openBoardSheet(); return; }
  S.cur = i; page = 0; save();
  applyBoardColor(); renderTop(); renderTabs(); renderGrid();
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
    page = Math.floor((b.pads.length - 1) / pageInfo().per);
    renderTop(); renderGrid();
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
    const inf = await Engine.load(id, rec.blob, { dur: p.dur, volume: p.vol, loop: p.loop });
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
  const q = { ...S.pads[id], id: uid(), played: false };
  S.pads[q.id] = q; loadPad(q.id);
  return q.id;
}

// ---------- 보드 ----------
function addBoard() {
  const used = S.boards.map(b => b.color), color = COLOR_KEYS.find(c => !used.includes(c)) || 'sky';
  S.boards.push({ id: uid(), name: '보드 ' + (S.boards.length + 1), color, pads: [] });
  S.cur = S.boards.length - 1; page = 0; save();
  applyBoardColor(); renderTop(); renderTabs(); renderGrid();
  openBoardSheet();
}

// ---------- 설정 판(시트) ----------
function openSheet(title, build) {
  const sh = $('sheet'); sh.textContent = '';
  const body = h('div', { class: 'sh-body' });
  sh.append(h('div', { class: 'sh-head' }, h('b', null, title), h('button', { class: 'ibtn', onclick: closeSheet }, '닫기')), body);
  build(body);
  $('sheetWrap').hidden = false; sh.scrollTop = 0;
}
function closeSheet() {
  if ($('sheetWrap').hidden) return;
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

function openPadSheet(id) {
  const p = S.pads[id]; if (!p) return;
  const b = board(), rec = files.get(p.file);
  const refresh = () => { save(); const el = padEls.get(id); if (el) { const n = b.pads.indexOf(id) + 1; el.replaceWith(makePad(id, n)); } };
  openSheet('패드 설정', body => {
    const name = h('input', { class: 'txt', value: p.label, maxlength: 40, placeholder: '패드 이름' });
    name.oninput = () => { p.label = name.value; refresh(); };
    const fin = stepper(p.finSec, 0.1, 10, 0.1, sec1, v => { p.finSec = v; save(); });
    const fout = stepper(p.foutSec, 0.1, 10, 0.1, sec1, v => { p.foutSec = v; save(); });
    fin.classList.toggle('off', !p.fin); fout.classList.toggle('off', !p.fout);
    const moveSel = h('select', { class: 'sel' }, h('option', { value: '' }, '다른 보드로…'),
      S.boards.filter(x => x !== b).map(x => h('option', { value: x.id }, x.name)));
    moveSel.onchange = () => {
      const to = S.boards.find(x => x.id === moveSel.value); if (!to) return;
      b.pads.splice(b.pads.indexOf(id), 1); to.pads.push(id); save();
      toast(`"${p.label}" → ${to.name}`); closeSheet();
    };
    const order = d => {
      const k = b.pads.indexOf(id), j = k + d; if (j < 0 || j >= b.pads.length) return;
      [b.pads[k], b.pads[j]] = [b.pads[j], b.pads[k]]; save();
      page = Math.floor(j / pageInfo().per); renderGrid();
    };
    body.append(
      h('div', { class: 'row col' }, name),
      h('div', { class: 'row col' }, h('label', null, '색', h('span', { class: 'sub' }, '없음 = 평소 무채색, 재생 중엔 보드 색으로 켜짐')),
        colorChips(p.color, true, k => { p.color = k; refresh(); })),
      row('볼륨', stepper(Math.round(p.vol * 100), 0, 100, 5, v => v + '%', v => { p.vol = v / 100; Engine.setVolume(id, p.vol); save(); })),
      row('반복(루프)', sw(p.loop, on => { p.loop = on; Engine.setLoop(id, on); refresh(); })),
      row(h('span', null, '솔로', h('span', { class: 'sub' }, '이 패드를 틀면 다른 소리를 끔')), sw(p.solo, on => { p.solo = on; refresh(); })),
      row('페이드인', sw(p.fin, on => { p.fin = on; fin.classList.toggle('off', !on); refresh(); }), fin),
      row(h('span', null, '페이드아웃', h('span', { class: 'sub' }, '재생 중 다시 누를 때')), sw(p.fout, on => { p.fout = on; fout.classList.toggle('off', !on); save(); }), fout),
      row('순서', h('button', { class: 'sbtn', onclick: () => order(-1) }, '◀ 앞으로'), h('button', { class: 'sbtn', onclick: () => order(1) }, '뒤로 ▶')),
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
        const nb = { id: uid(), name: b.name + ' 복사', color: b.color, pads: b.pads.map(clonePad) };
        S.boards.splice(S.cur + 1, 0, nb); S.cur++; page = 0; save(); applyBoardColor(); closeSheet(); toast('보드를 복제했어요');
      } }, '복제'), h('button', { class: 'sbtn danger', disabled: S.boards.length < 2, onclick: () => {
        if (!confirm(`"${b.name}" 보드와 패드 ${b.pads.length}개를 지울까요?`)) return;
        [...b.pads].forEach(removePad); S.boards.splice(S.cur, 1); S.cur = Math.max(0, S.cur - 1); page = 0; save(); applyBoardColor(); closeSheet();
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
      row('패드 크기', seg([[8, '작게'], [6, '보통'], [4, '크게']], st.cols, v => { st.cols = v; page = 0; save(); renderGrid(); })),
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

// ---------- 알림 ----------
let toastT = 0;
function toast(msg, ms = 1800) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms);
}

// ---------- 화면 꺼짐 방지 ----------
let wake = null;
async function reqWake() {
  if (!started || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  try { wake = await navigator.wakeLock.request('screen'); } catch (e) { logLine('화면 꺼짐 방지 실패: ' + e.message, 'w'); }
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
  const used = new Set(Object.values(S.pads).map(p => p.file));
  recs.forEach(r => { if (!used.has(r.id)) dropFileIfUnused(r.id); });   // 넣다가 꺼진 파일 정리
  // 지금 보드 먼저, 나머지 보드는 뒤에
  const order = [...board().pads, ...S.boards.flatMap((b, i) => i === S.cur ? [] : b.pads)];
  for (const id of order) await loadPad(id);
  logLine(`복원 완료: 패드 ${order.length}개 · ${((performance.now() - t0) / 1000).toFixed(2)}초 · 올려 둔 소리 ${(Engine.loadedBytes / 1048576).toFixed(1)}MB`);
}
boot();
