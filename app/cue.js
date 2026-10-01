// 큐보드 (설정 → 일반 → 큐). 꺼져 있으면 아무 일도 안 한다 — 기존 동작·화면 그대로.
// 보드마다 큐 목록 하나: board.cues = [{id, pad, act, sec, when, wait, memo, at}] (값 없음 = 큐 없음)
//   pad: 패드 id | '*'(랜덤) · act: play|stop|vol|duck|restore · sec: 옛 작게 비율(duck·restore는 옛 줄 — 그대로 동작, 고치면 vol로)
//   트랙대로가 기본, 다를 때만 따로(값 없음 = 트랙 설정): fin 재생 페이드인 초 · vol 재생 볼륨(1=100%) · fout 끄기(재생은 꺼질 때) 페이드아웃 초(0=바로)
//   vol 줄: vol 바꿀 볼륨(값 없음 = 원래대로, 트랙 볼륨) · ramp 걸리는 초(값 없음 = 바로)
//   duckO: 재생 줄이 나올 동안 다른 소리를 각 트랙 볼륨의 몇 배로(값 없음 = 그대로) — 이 소리가 끝나면 ramp초 동안 원래대로
//   off: 언제 꺼짐(재생만, 값 없음 = 따로 안 끔) go 다음 큐(다음 GO) 나갈 때 | 'q:큐id' 그 큐가 나갈 때 | next 다른 소리가 나오면(패드 손 누름 포함)
//   scene: 장면 제목 — 이 줄 위에 머리 줄(■ 1막 2장 — 병원)로 보임. 줄을 옮겨도 자리에 남음
//   sub: 하위 번호 단계(1 = 앞 번호의 2-1식) · 값 없음 = 1·2·3 저절로. no: 옛(0.3.59) 고정 번호 — '-'가 있으면 하위 번호로 이어받음
//   alt: 번갈아 — 더 트는 패드 id 목록 · rep: 몇 바퀴(값 없음 = 1). GO마다 [pad, ...alt]의 다음 트랙, 다 돌면 다음 줄(값 없음 = 지금 동작)
//   when: go(GO를 누를 때) | end(앞 소리가 끝나면) | with(앞 큐와 동시에) · wait: 기다렸다가 초 · at: 'HH:MM' 그 시각에
// 연극식 번호: GO로 나가는 줄만 번호(큐 1, 큐 2…), 따라 나가는 줄은 ↳
'use strict';
window.Cue = (() => {
  const on = () => !!S.settings.cue;
  // 옛 '◣ N초 끄기'(act fade) → '■ 끄기 · 따로 N초'
  const fix = c => { if (c.act === 'fade') { c.act = 'stop'; c.fout = c.sec || 3; delete c.sec; } return c; };
  const cues = (b = board()) => { const L = b.cues || (b.cues = []); L.forEach(fix); return L; };
  // 번호 = 1·2·3 저절로(끼우면 뒤가 밀림). 줄마다 [하위 번호로] 고르면(sub) 앞 번호의 2-1식.
  // 옛 목록(0.3.59 no 저장)은 '2-1' 같은 값만 하위 번호로 이어받음 — 2-1-1이면 두 단계
  const subOf = c => c.sub != null ? c.sub : c.no ? String(c.no).split('-').length - 1 : 0;
  function nos(L) {
    const out = []; let last = null;
    L.forEach((c, i) => {
      if (!isGo(L, i)) return;
      const d = last ? Math.min(subOf(c), last.length) : 0;
      if (!d) last = [(last ? last[0] : 0) + 1];
      else if (last.length > d) { last = last.slice(0, d + 1); last[d]++; }
      else last = [...last, 1];
      out[i] = last.join('-');
    });
    return out;
  }
  const isGo = (L, i) => i === 0 || !L[i].when || L[i].when === 'go';
  const qno = (L, i) => { let j = i; while (j > 0 && !isGo(L, j)) j--; return L[j] ? nos(L)[j] : ''; };
  const goNo = (L, i) => { let n = 0; for (let j = 0; j <= i; j++) if (isGo(L, j)) n++; return n; };
  const ACTS = { play: '▶ 재생', stop: '■ 끄기', vol: '◢ 볼륨', duck: '↓ 작게', restore: '↺ 원래 크기' };
  const WHENS = { go: 'GO를 누를 때', end: '앞 줄 소리가 끝나면', with: '앞 줄과 동시에' };
  const own = c => c.fin != null || c.vol != null || c.fout != null || c.duckO != null;   // 이 큐만 따로 정한 값이 있나
  const actTxt = c => c.act === 'duck' ? `↓ 1/${Math.round(1 / (c.sec || 0.25))}로` :
    c.act === 'stop' ? '■ 끄기' + (c.fout == null ? '' : c.fout ? ` ${c.fout}초` : ' 바로') :
    c.act === 'restore' ? ACTS.restore :
    c.act === 'vol' ? (c.vol != null ? `◢ ${Math.round(c.vol * 100)}%` : '◢ 원래 볼륨') + (c.ramp ? ` ${c.ramp}초` : '') :
    ACTS.play + (c.fin ? ` 인${c.fin}초` : '') + (c.vol != null ? ` ${Math.round(c.vol * 100)}%` : '');
  const fadeOutOf = (c, p) => c.fout != null ? c.fout : foutOf(p);   // 끄기: 따로 없으면 패드를 다시 눌러 끌 때와 같게
  // 번갈아: 트랙 목록·전체 GO 수
  const trks = c => !c.act || c.act === 'play' ? [c.pad, ...(c.alt || [])] : [c.pad];
  const total = c => (!c.act || c.act === 'play') && (c.alt && c.alt.length || c.rep > 1) ? trks(c).length * (c.rep || 1) : 1;
  const nm1 = id => id === '*' ? '랜덤 소리' : S.pads[id] ? S.pads[id].label || '(이름 없음)' : '(지운 패드)';
  const padName = c => total(c) > 1 ? trks(c).map(nm1).join(' ↔ ') + ` ×${c.rep || 1}` : nm1(c.pad);
  // 언제 꺼짐: 따로 안 끔(값 없음) · 큐 N 나갈 때(go = 다음 큐, 'q:id' = 고른 큐) · 다른 소리 나오면(next, 패드 손 누름 포함)
  const offTxt = (c, L = cues()) => {
    if (!c.off || c.act !== 'play') return '';
    if (c.off === 'go' || c.off === 'next') return c.off === 'go' ? '꺼짐: 다음 큐' : '꺼짐: 다른 소리';
    const j = L.findIndex(x => 'q:' + x.id === c.off);
    return j < 0 ? '' : `꺼짐: ${cueLabel(L, j)}`;
  };
  // 못 트는 줄: 패드가 없거나 파일을 못 읽음(랜덤·불러오는 중은 괜찮음)
  const bad1 = id => id === '*' ? '' : !S.pads[id] ? '패드 없음' : status[id] === 'bad' ? badWhy[id] || '못 틂' : '';
  const badOf = c => trks(c).map(bad1).find(Boolean) || '';
  const nextGo = (L, k) => { let j = k + 1; while (j < L.length && !isGo(L, j)) j++; return j; };
  const cueLabel = (L, i) => isGo(L, i) ? `큐 ${qno(L, i)}` : `큐 ${qno(L, i)}↳`;

  // ---------- 실행 ----------
  const pos = new Map();       // 큐 id → 번갈아 몇 번 나갔나
  const sb = {};               // 보드 id → '다음' 줄 번호(0부터)
  const pend = new Map();      // 큐 id → {t0, sec, timer}
  const waitEnd = new Map();   // 패드 id → [[보드, 줄]…] (그 소리가 끝나면 나갈 줄)
  const manual = new Set();    // 손으로(또는 큐로) 끈 패드 — 끝나도 '앞 소리가 끝나면' 줄을 안 부름
  const ducked = new Map();    // 패드 id → 비율
  const live = new Map();      // 큐 id → 패드 id (그 큐가 튼 소리가 울리는 중)
  const volOver = new Set();   // 이 큐만(또는 ◢ 볼륨 큐로) 볼륨을 바꾼 패드 — 끝나면 트랙 볼륨으로
  const duckBy = new Map();    // 패드 id → {list, t} 이 소리가 나올 동안 줄여 둔 다른 소리
  let pick = null, pickAlt = false;             // [소리 바꾸기]: 패드를 누르면 이 큐의 소리로
  const offs = new Map();      // 큐 id → {pid, off, seq} ('꺼질 때'를 기다리는 소리)
  let seq = 0;                 // GO 한 번(과 따라 나가는 줄) = 한 묶음 — 같은 묶음 소리끼리는 안 끔
  let lastIns = null;          // 담기: 방금 끼운 큐 id (다음은 그 뒤에)
  let sceneNext = null;        // 담기: [+ 장면]으로 적은 제목 — 다음에 담는 줄 위에 붙음
  const sceneShort = t => { const a = t.split('—')[0].trim(); return a.length > 7 ? a.slice(0, 7) + '…' : a; };
  let adding = false, lastGo = 0, open = true, edit = null, help = false;
  // 편집 = 위쪽 전체 [편집](패드와 함께 큐 줄도 흔들림) — 줄 끌어 옮기기 · 오른쪽 칸 골라 복제·지우기
  const editing = () => typeof editMode !== 'undefined' && editMode && !S.lock;
  const qsel = new Set();

  function offNow(cid, why) {
    const o = offs.get(cid); if (!o) return; offs.delete(cid);
    if (!Engine.isPlaying(o.pid)) return;
    manual.add(o.pid); Engine.stop(o.pid, o.fout != null ? o.fout : foutOf(S.pads[o.pid] || {}));
    logLine(`큐 꺼짐 ${nm(o.pid)} (${why})`); paintPad(o.pid);
  }
  // kind: go | next(pid = 새로 나오는 소리) | q(cid = 지금 나가는 큐)
  function offBy(kind, pid, cid, s = -1) {
    offs.forEach((o, id) => {
      if (kind === 'q' ? o.off === 'q:' + cid : o.off === kind && o.seq !== s && (kind !== 'next' || o.pid !== pid))
        offNow(id, kind === 'go' ? '다음 GO' : kind === 'next' ? '다음 소리' : '큐 나감');
    });
  }
  function run(b, i, padO, last = true) {
    const L = cues(b), c = L[i]; if (!c) return;
    const tag = cueLabel(L, i), s = seq;
    const act = () => {
      pend.delete(c.id);
      offBy('q', null, c.id);
      let pid = padO || c.pad;
      if (pid === '*') { const r = b.pads.filter(x => status[x] === 'ready'); pid = r[Math.floor(Math.random() * r.length)]; }
      const p = S.pads[pid];
      if (!p) { logLine(`${tag} 건너뜀 (패드 없음)`, 'w'); if (last) after(b, i, null); return; }
      logLine(`${tag} ${actTxt(c)} ${nm(pid)}${c.memo ? ' · ' + c.memo : ''}`);
      if (c.act === 'stop') { if (Engine.isPlaying(pid)) { manual.add(pid); Engine.stop(pid, fadeOutOf(c, p)); } }
      else if (c.act === 'vol') {
        ducked.delete(pid);
        if (c.vol != null) volOver.add(pid); else volOver.delete(pid);
        Engine.setVolume(pid, c.vol != null ? c.vol : p.vol, c.ramp || 0);
      }
      else if (c.act === 'duck') { ducked.set(pid, c.sec || 0.25); Engine.setVolume(pid, p.vol * (c.sec || 0.25)); }
      else if (c.act === 'restore') { if (ducked.delete(pid)) Engine.setVolume(pid, p.vol); }
      else if (status[pid] === 'ready') {
        if (p.solo) soloOthers(pid);
        if (!Engine.isPlaying(pid)) offBy('next', pid, null, s);
        const o = playOpt(p); if (c.fin != null) o.fadeIn = c.fin; if (c.fout != null) o.fadeOut = c.fout;
        if (c.vol != null) { Engine.setVolume(pid, c.vol); volOver.add(pid); } else if (volOver.delete(pid)) Engine.setVolume(pid, p.vol);
        if (Engine.play(pid, o)) { lastId = pid; p.played = true; S.lastUse = Date.now(); save(); live.set(c.id, pid); if (c.off) offs.set(c.id, { pid, off: c.off, seq: s, fout: c.fout }); if (c.duckO != null) duckOthers(c, pid); }
      }
      paintPad(pid); soon();
      if (last) after(b, i, pid);
    };
    if (c.wait > 0) {
      const e = { t0: performance.now(), sec: c.wait };
      e.timer = setTimeout(function go() { if (Engine.paused) { e.timer = setTimeout(go, 200); return; } act(); }, c.wait * 1000);
      pend.set(c.id, e); soon();
    } else act();
  }
  // 나올 동안 다른 소리: 지금 울리는 다른 소리를 각 트랙 볼륨의 duckO배로, 이 소리가 끝나면 원래대로
  function duckOthers(c, pid) {
    const t = c.ramp || 0, list = Engine.playingIds().filter(o => o !== pid && S.pads[o]);
    list.forEach(o => { ducked.set(o, c.duckO); Engine.setVolume(o, S.pads[o].vol * c.duckO, t); });
    if (list.length) { duckBy.set(pid, { list, t }); logLine(`큐 다른 소리 ${Math.round(c.duckO * 100)}% ${list.length}개`); }
  }
  // 이 줄 다음이 따라 나가는 줄이면: 동시에 = 바로, 끝나면 = 이 줄 소리가 끝날 때(끄기는 바로·줄이며 끄기는 그 시간 뒤)
  function after(b, i, pid) {
    const L = cues(b), c = L[i], n = L[i + 1]; if (!n || isGo(L, i + 1)) return;
    if (n.when === 'with') return run(b, i + 1);
    if (c.act === 'play' && pid && Engine.isPlaying(pid)) { const a = waitEnd.get(pid) || []; a.push([b, i + 1]); waitEnd.set(pid, a); }
    else if (c.act === 'stop' && pid && S.pads[pid] && fadeOutOf(c, S.pads[pid]) > 0) setTimeout(() => run(b, i + 1), fadeOutOf(c, S.pads[pid]) * 1000);
    else run(b, i + 1);
  }
  Engine.on('play', () => soon());
  Engine.on('end', (id, why) => {
    const m = manual.delete(id);
    ducked.delete(id);
    const d = duckBy.get(id);
    if (d) { duckBy.delete(id); d.list.forEach(o => { if (ducked.delete(o) && S.pads[o]) { volOver.delete(o); Engine.setVolume(o, S.pads[o].vol, d.t); } }); if (d.list.length) logLine(`큐 다른 소리 원래대로`); }
    if (volOver.delete(id) && S.pads[id]) Engine.setVolume(id, S.pads[id].vol);
    live.forEach((pid, cid) => { if (pid === id) live.delete(cid); });
    offs.forEach((o, cid) => { if (o.pid === id) offs.delete(cid); });
    soon();
    const w = waitEnd.get(id); if (!w) return;
    waitEnd.delete(id);
    if (!on() || m || !(why === 'ended' || why === 'faded')) return;
    w.forEach(([b, k]) => run(b, k));
  });

  // '다음' 줄 옮기기
  const cur = (b = board()) => Math.min(sb[b.id] || 0, cues(b).length);
  function setSb(i, why) {
    const b = board(), L = cues(b);
    sb[b.id] = Math.max(0, Math.min(i, L.length)); lastIns = null; nearSb = true; pos.clear();
    logLine(`큐 다음 → ${sb[b.id] < L.length ? cueLabel(L, sb[b.id]) : '끝'}${why ? ' (' + why + ')' : ''}`);
    paint();
  }
  function step(d) {
    const L = cues(); let i = cur();
    if (d < 0) { i--; while (i > 0 && !isGo(L, i)) i--; }
    else { if (i >= L.length) return; i++; while (i < L.length && !isGo(L, i)) i++; }
    setSb(Math.max(0, i), d < 0 ? '이전' : '다음');
  }
  function go() {
    if (!on() || !started) return;
    if (editing()) return toast('편집 중이에요 — 위쪽 [편집]을 다시 누르면 GO가 돼요');
    const t = performance.now(); if (t - lastGo < 350) return;   // 연타해도 한 칸씩
    lastGo = t;
    const b = board(), L = cues(b), k = cur(b);
    if (!L.length) return toast('큐가 없어요 — 큐보드의 [+ 담기]로 넣어요');
    if (k >= L.length) { seq++; offBy('go', null, null, seq); logLine('GO → 끝'); return toast('마지막 큐까지 나갔어요 · ▲ 이전이나 ⤒ 처음으로'); }
    // 번갈아: GO마다 다음 트랙, 다 돌아야 다음 줄로(↳ 줄은 마지막 GO에 따라 나감)
    const c = L[k], n = total(c), at = pos.get(c.id) || 0, T = trks(c), done = at + 1 >= n;
    logLine(`GO ${cueLabel(L, k)}${n > 1 ? ` (${at + 1}/${n})` : ''}`);
    if (done) { pos.delete(c.id); let j = k + 1; while (j < L.length && !isGo(L, j)) j++; sb[b.id] = j; } else pos.set(c.id, at + 1);
    lastIns = null;
    seq++; offBy('go', null, null, seq);
    center = c.id;
    run(b, k, n > 1 ? T[at % T.length] : null, done); paint();
  }
  function cancelAll(why) {
    if (!pend.size && !waitEnd.size) return;
    logLine(`큐 대기 ${pend.size + waitEnd.size}개 취소 (${why})`);
    pend.forEach(e => clearTimeout(e.timer)); pend.clear(); waitEnd.clear(); soon();
  }
  const allOff = why => () => { if (!on()) return; pos.clear(); Engine.playingIds().forEach(i => manual.add(i)); ducked.clear(); duckBy.clear(); cancelAll(why); };
  $('btnStop').addEventListener('pointerdown', allOff('전체정지'));
  $('btnFade').addEventListener('pointerdown', allOff('전체 페이드'));
  $('btnLock').addEventListener('click', () => {
    if (S.lock) {
      adding = false; edit = null; qsel.clear(); pick = null;
      const n = on() ? cues().filter(badOf).length : 0;
      if (n) { logLine(`공연 모드: 못 트는 큐 ${n}개`, 'w'); toast(`⚠ 못 트는 큐 ${n}개 — 큐보드에서 ⚠ 줄을 확인해요`, 5000); }
    }
    paint();
  });

  // 패드 누름: 담는 중이면 큐로 넣고(소리 안 냄) true
  function tap(id) {
    if (!on()) return false;
    if (pick && !S.lock) {
      const L = cues(), i = L.findIndex(x => x.id === pick); pick = null;
      if (i >= 0 && pickAlt) { const c = L[i]; (c.alt || (c.alt = [])).push(id); if (!c.off) c.off = 'next'; pos.delete(c.id); save(); logLine(`큐 번갈아 더함 ${cueLabel(L, i)} + ${nm(id)}`); edit = c.id; }
      else if (i >= 0) { L[i].pad = id; save(); logLine(`큐 소리 바꿈 ${cueLabel(L, i)} → ${nm(id)}`); edit = L[i].id; }
      pickAlt = false;
      paint(); return true;
    }
    if (Engine.isPlaying(id)) manual.add(id);
    if (!adding || S.lock) { if (!Engine.isPlaying(id)) offBy('next', id); return false; }
    // '다음 차례' 줄(과 따라 나가는 ↳) 뒤에 끼움 — 이어서 담으면 방금 끼운 줄 뒤에
    const L = cues(), at = insAt(L);
    // 기본은 ▶ 재생. 지금 울리고 있는 소리를 누를 때만 ■ 끄기 (목록 앞 줄로 짐작하지 않음 — 0.3.66, 연습 로그: 켜야 할 줄이 끄기로 담김)
    const c = { id: uid(), pad: id, act: Engine.isPlaying(id) ? 'stop' : 'play', when: 'go' };
    if (sceneNext) { c.scene = sceneNext; sceneNext = null; logLine(`큐 구분 ${c.scene}`); }
    L.splice(at, 0, c); lastIns = c.id; save();
    logLine(`큐 담음 ${cueLabel(L, at)} ${actTxt(c)} ${nm(id)}${at < L.length - 1 ? ' (끼움)' : ''}`); paint('qins');
    const el = padEls.get(id); if (el) { el.classList.add('qadd'); setTimeout(() => el.classList.remove('qadd'), 250); }
    return true;
  }

  // ---------- 정한 시각에 ----------
  const firedAt = {};
  setInterval(() => {
    if (!on() || !started) return;
    const d = new Date(), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), day = d.toDateString();
    S.boards.forEach(b => (b.cues || []).forEach((c, i) => { if (c.at === hm && firedAt[c.id] !== day) { firedAt[c.id] = day; logLine(`큐 ⏰ ${hm} ${cueLabel(cues(b), i)}`); run(b, i); } }));
  }, 1000);

  // ---------- 페달·키보드: 앞으로 = GO, 뒤로 = 이전 ----------
  document.addEventListener('keydown', e => {
    if (!on() || !started || !$('sheetWrap').hidden || e.repeat) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
    if ([' ', 'Enter', 'PageDown', 'ArrowRight', 'ArrowDown'].includes(e.key)) { e.preventDefault(); go(); }
    else if (['PageUp', 'ArrowLeft', 'ArrowUp'].includes(e.key)) { e.preventDefault(); step(-1); }
  });

  // ---------- 큐보드 화면 (오른쪽, 펼침/접힘) ----------
  const panel = h('div', { class: 'qpanel' });
  const stage = document.querySelector('.stage');
  stage.insertBefore(panel, stage.querySelector('.side'));
  let goB = null, tabBox = null, dirty = false, raf = 0;
  const soon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };
  // 입력 칸에 글자를 쓰는 중이면 다시 그리지 않고, 손 뗀 뒤에 그림
  const typing = box => { const a = document.activeElement; return box && a && box.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName); };
  const refocus = () => setTimeout(() => { if (dirty || !typing(panel)) paint(); }, 30);
  panel.addEventListener('focusout', refocus);
  document.addEventListener('focusout', e => { if (tabBox && tabBox.contains(e.target)) refocus(); });

  const opts = (list, cur, fn) => h('div', { class: 'qopts' }, list.map(([v, t]) => h('button', { class: 'qc' + (v === cur ? ' on' : ''), onclick: e => { e.stopPropagation(); fn(v); } }, t)));
  function subTxt(L, i, c) {
    const e = pend.get(c.id), s = [], bad = badOf(c);
    if (bad) s.push('⚠ ' + bad);
    if (e) s.push(`${Math.max(0, e.sec - (performance.now() - e.t0) / 1000).toFixed(1)}초 뒤 나감`);
    else if (live.has(c.id)) { const pid = live.get(c.id), d = playLen(S.pads[pid], pid), rm = Math.max(0, d - playPos(pid)); s.push(`♪ ${fmt(Math.ceil(rm))} 남음`); }
    if (total(c) > 1) { const n = total(c), a = pos.get(c.id) || 0; s.push(n <= 12 ? '●'.repeat(a) + '○'.repeat(n - a) : `${a}/${n}`); }
    if (i === cur() && !e) s.push('다음 차례 — GO');
    if (!isGo(L, i)) s.push(WHEN1[c.when] || WHEN1.end);
    if (c.wait > 0 && !e) s.push(`+ ${c.wait}초`);
    if (c.at) s.push('⏰' + c.at);
    if (c.memo) s.push(c.memo);
    return s.join(' · ');
  }
  // 편집 줄 손질: 끌어 옮기기 · 골라서 복제·지우기·장면 제목. 장면 제목은 자리에 남음
  function moveTo(b, L, i, j) {
    if (j === i || j < 0 || j >= L.length) return;
    const sc = L.map(c => c.scene), k = cur(b), kid = L[k] && L[k].id;
    L.splice(j, 0, L.splice(i, 1)[0]);
    L.forEach((c, n) => { if (sc[n]) c.scene = sc[n]; else delete c.scene; });
    if (kid) sb[b.id] = L.findIndex(c => c.id === kid);
    logLine(`큐 줄 옮김 ${i + 1} → ${j + 1}`); save(); paint();
  }
  function dupSel(L) {
    [...qsel].map(id => L.findIndex(c => c.id === id)).filter(i => i >= 0).sort((a, b) => b - a).forEach(i => {
      const d = { ...L[i], id: uid() }; delete d.no; delete d.sub; delete d.scene; L.splice(i + 1, 0, d);
    });
    logLine(`큐 줄 복제 ${qsel.size}줄`); qsel.clear(); save(); paint(); renderSelBar();
  }
  function delSel(b, L) {
    const n = qsel.size; if (!n || !confirm(`큐 ${n}줄을 지울까요?`)) return;
    const kid = L[cur(b)] && L[cur(b)].id;
    [...qsel].map(id => L.findIndex(c => c.id === id)).filter(i => i >= 0).sort((a, b) => b - a).forEach(i => {
      const c = L[i]; L.splice(i, 1);
      if (c.scene && L[i] && !L[i].scene) L[i].scene = c.scene;
      L.forEach(x => { if (x.off === 'q:' + c.id) delete x.off; });
    });
    const k = L.findIndex(c => c.id === kid); if (k >= 0) sb[b.id] = k; else sb[b.id] = Math.min(sb[b.id] || 0, L.length);
    logLine(`큐 줄 지움 ${n}줄`); qsel.clear(); save(); paint(); renderSelBar();
  }
  // 줄을 끌어 위아래로: 6px 넘게 움직이면 끌기 시작, 손 뗀 줄 자리로
  function dragRow(r, b, L, i) {
    let y0 = 0, on = false, id = null;
    r.addEventListener('pointerdown', e => { if (e.target.closest('.qchk')) return; y0 = e.clientY; on = false; id = e.pointerId; });
    r.addEventListener('pointermove', e => {
      if (id !== e.pointerId) return;
      if (!on && Math.abs(e.clientY - y0) > 6) { on = true; pressed = true; r.setPointerCapture(id); r.classList.add('q-drag'); }
      if (!on) return;
      r.style.transform = `translateY(${e.clientY - y0}px)`;
      const box = r.closest('.qlist'); box.querySelectorAll('.q-over').forEach(x => x.classList.remove('q-over', 'dn'));
      const t = rowAt(box, e.clientY); if (t && t !== r) t.classList.add('q-over', ...(+t.dataset.i > i ? ['dn'] : []));
    });
    const up = e => {
      if (id !== e.pointerId) return; id = null;
      if (!on) return; on = false;
      const box = r.closest('.qlist'), t = rowAt(box, e.clientY);
      r.classList.remove('q-drag'); r.style.transform = '';
      if (t && t !== r) moveTo(b, L, i, +t.dataset.i); else paint();
    };
    r.addEventListener('pointerup', up); r.addEventListener('pointercancel', up);
  }
  const rowAt = (box, y) => [...box.querySelectorAll('.qrow')].find(x => { if (x.classList.contains('q-drag')) return false; const rr = x.getBoundingClientRect(); return y >= rr.top && y < rr.bottom; });
  function sceneAsk(L, i) {
    const c = L[i], v = prompt('구분 이름 (이 줄 위에 구분 줄 · 비우면 없앰)', c.scene || '');
    if (v == null) return;
    if (v.trim()) c.scene = v.trim().slice(0, 30); else delete c.scene;
    logLine(`큐 구분 ${c.scene || '없앰'} (${i + 1}줄)`); save(); paint();
  }
  function rowEl(b, L, i) {
    const c = L[i], k = cur(b), lock = S.lock, ed = editing();
    const cls = 'qrow' + (isGo(L, i) ? ' q-go' : ' q-ch') + (i === k ? ' q-sb' : '') + (i < k ? ' q-done' : '') +
      (live.has(c.id) ? ' q-run' : '') + (pend.has(c.id) ? ' q-wait' : '') + (badOf(c) ? ' q-bad' : '') + (edit === c.id ? ' q-edit' : '') + (pick === c.id ? ' q-pick' : '') + (qsel.has(c.id) ? ' q-sel' : '');
    const selT = () => { if (qsel.has(c.id)) qsel.delete(c.id); else qsel.add(c.id); if (qsel.size && sel.size) clearSel(); paint(); renderSelBar(); };
    const r = h('div', { class: cls, 'data-i': i, 'data-id': c.id, role: 'button', 'aria-label': ed ? `${cueLabel(L, i)} ${padName(c)} — 고르기` : `${cueLabel(L, i)} ${padName(c)} — 다음으로` },
      // 왼쪽부터 [고르기(편집 중)] · 동작 단추(누르면 말풍선 — 옛 ⋯) · 번호 · 이름/정보 (2026-10-01 소유자)
      ed ? h('button', { class: 'qed qchk' + (qsel.has(c.id) ? ' on' : ''), 'aria-label': '이 줄 고르기', onclick: e => { e.stopPropagation(); selT(); } }, '✓') : '',
      // 맨 왼쪽 칸: 작은 동작 단추 + 그 아래 꺼짐 정보 (2026-10-01 소유자)
      h('span', { class: 'qact' + (own(c) || (c.act && c.act !== 'play') ? ' x' : '') },
        h(lock || ed ? 'span' : 'button', { class: 'qact-t' + (lock || ed ? '' : ' qact-b') + (edit === c.id ? ' on' : ''),
          ...(lock || ed ? {} : { 'aria-label': '이 큐 고치기', onclick: e => { e.stopPropagation(); openEdit(edit === c.id ? null : c.id, '', r); } }) }, actTxt(c)),
        offTxt(c, L) ? h('small', { class: 'qoff' }, offTxt(c, L)) : ''),
      h('span', { class: 'qn' + (isGo(L, i) && qno(L, i).length > 3 ? ' sm' : '') }, isGo(L, i) ? qno(L, i) : '↳'),
      h('span', { class: 'qmain' }, h('b', { class: 'qname' }, padName(c)), h('small', { class: 'qsub' }, subTxt(L, i, c))),
      live.has(c.id) ? h('i', { class: 'qbar', style: `width:${prog(c.id)}%` }) : '');
    r.onclick = () => { if (pressed) { pressed = false; return; } if (ed) return selT(); lastIns = null; if (i !== k) setSb(i, '줄 누름'); };
    if (ed) dragRow(r, b, L, i);
    // 꾹 누르면 말풍선 (0.5초)
    if (!lock && !ed) {
      let t = 0, x0 = 0, y0 = 0;
      const stop = () => { clearTimeout(t); t = 0; };
      r.addEventListener('pointerdown', e => { if (e.target.closest('.qact-b')) return; x0 = e.clientX; y0 = e.clientY; stop(); t = setTimeout(() => { t = 0; pressed = true; openEdit(c.id, '꾹', r); }, 500); });
      r.addEventListener('pointermove', e => { if (t && Math.hypot(e.clientX - x0, e.clientY - y0) > 10) stop(); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(n => r.addEventListener(n, stop));
      r.addEventListener('contextmenu', e => e.preventDefault());
    }
    const head = c.scene ? [h('div', { class: 'qscene' + (i < k ? ' q-done' : ''), role: 'button', 'aria-label': ed ? `${c.scene} 구분 이름 고치기` : `${c.scene} 구분으로`,
      onclick: () => { if (ed) return sceneAsk(L, i); lastIns = null; setSb(i, '구분 ' + c.scene); } },
      h('b', null, '■ ' + c.scene), h('small', null, ed ? '누르면 이름 고치기' : '누르면 여기로'))] : [];
    return [...head, r];
  }
  // 울리는 줄의 진행(%)
  const prog = cid => { const pid = live.get(cid), d = pid && playLen(S.pads[pid], pid); return d ? Math.min(100, Math.max(0, playPos(pid) / d * 100)) : 0; };
  let pressed = false, more = false, editIn = null;
  function openEdit(id, how, el) {
    edit = id; more = false;
    editIn = id && el && el.closest('.qlist.full') ? 'tab' : 'panel';
    if (id) { const L = cues(), i = L.findIndex(c => c.id === id); if (i >= 0) logLine(`큐 말풍선 ${cueLabel(L, i)}${how ? ' (' + how + ')' : ''}`); }
    paint();
  }
  const sec = (t, note) => h('div', { class: 'qsec' }, h('small', null, t), note ? h('small', { class: 'qtrack' }, note) : '');
  const tsec = v => v ? `${v}초` : '바로';
  const RAMPS = [[null, '바로'], [1, '1초'], [3, '3초'], [5, '5초']];
  // 볼륨 막대 = 패드·트랙 설정과 같은 막대(가운데 100%, 오른쪽 반 100~300%)
  const volBar = (v, fn) => stepper(Math.round(v * 100), 0, 300, 5, volTxt, x => fn(x / 100), false, VOL_MAP);
  // 페이드 [트랙대로 / 따로] — 따로면 트랙 설정과 같은 페이드 막대(재생 = 인·아웃, 끄기 = 아웃만). 0초 = 없음
  function fadeEd(c, p, ch) {
    const stop = c.act === 'stop', own = stop ? c.fout != null : c.fin != null || c.fout != null;
    const tin = p && p.fin ? p.finSec : 0, tout = p ? foutOf(p) : 0;
    const out = [sec('페이드', p ? `트랙대로 = ${stop ? '아웃 ' + tsec(tout) : `인 ${tin ? tin + '초' : '없음'} · 아웃 ${tout ? tout + '초' : '없음'}`}` : '랜덤 소리는 각 트랙대로'),
      opts([[null, '트랙대로'], ['own', '따로']], own ? 'own' : null, v => ch(() => {
        if (v == null) { delete c.fin; delete c.fout; }
        else if (!own) { c.fout = tout; if (!stop) c.fin = tin; }
      }))];
    if (own) {
      const fi = c.fin || 0, fo = c.fout || 0;
      out.push(fadeEnv({ fin: fi > 0, finSec: fi, fout: fo > 0, foutSec: fo }, (side, s, final) => {
        if (side === 'in') c.fin = s; else c.fout = s;
        if (final) { save(); logLine(`큐 페이드 ${side === 'in' ? '인' : '아웃'} ${s}초`); paint(); }
      }, { outOnly: stop }));
    }
    return out;
  }
  // ◢ 볼륨 큐: 막대 + 걸리는 시간 + [원래대로]. 옛 ↓ 작게(비율)·↺ 원래 크기 줄은 여기서 막대 값·원래대로로 보이고, 고치면 ◢ 볼륨이 됨
  function volEd(c, p, ch) {
    const tv = p ? p.vol : 1, back = c.act === 'restore' || c.act === 'vol' && c.vol == null;
    const cv = c.act === 'duck' ? tv * (c.sec || 0.25) : c.vol != null ? c.vol : tv;
    const toVol = () => { if (c.act !== 'vol') { c.act = 'vol'; if (!back) c.vol = cv; delete c.sec; } };
    return [sec('볼륨', p ? `트랙 = ${Math.round(tv * 100)}%` : '랜덤 소리는 각 트랙'),
      opts([['set', '막대로'], ['back', '원래대로 (트랙 볼륨)']], back ? 'back' : 'set', v => ch(() => { toVol(); if (v === 'back') delete c.vol; else if (back) c.vol = tv * 0.5; })),
      back ? '' : volBar(cv, x => ch(() => { toVol(); c.vol = x; })),
      sec('바뀌는 데 걸리는 시간'),
      opts(RAMPS, c.ramp || null, v => ch(() => { toVol(); if (v == null) delete c.ramp; else c.ramp = v; }))];
  }
  // 재생 큐 [더 보기]: 이 소리 볼륨 · 배경 낮추기
  function playMore(c, p, ch) {
    const out = [sec('이 소리 볼륨', p ? `트랙대로 = ${Math.round(p.vol * 100)}%` : '랜덤 소리는 각 트랙대로'),
      opts([[null, '트랙대로'], ['own', '막대로']], c.vol == null ? null : 'own', v => ch(() => { if (v == null) delete c.vol; else if (c.vol == null) c.vol = p ? p.vol : 1; }))];
    if (c.vol != null) out.push(volBar(c.vol, x => ch(() => { c.vol = x; })));
    out.push(h('div', { class: 'qsec' }, h('small', null, helpLabel('배경 낮추기', '이 트랙이 재생될 때 다른 트랙 소리를 줄여요. 이 트랙이 끝나면 원래대로 돌아와요.'))),
      opts([[null, '그대로'], ['own', '막대로']], c.duckO == null ? null : 'own', v => ch(() => { if (v == null) { delete c.duckO; delete c.ramp; } else if (c.duckO == null) c.duckO = 0.5; })));
    if (c.duckO != null) out.push(h('small', { class: 'qtrack' }, '다른 트랙 볼륨의 몇 %로'), volBar(c.duckO, x => ch(() => { c.duckO = x; })),
      sec('바뀌는 데 걸리는 시간'), opts(RAMPS, c.ramp || null, v => ch(() => { if (v == null) delete c.ramp; else c.ramp = v; })));
    return out;
  }
  // 언제 꺼짐? — 따로 안 끔(기본) · 큐 N 나갈 때(처음엔 다음 큐 = 옛 '다음 GO 때') · 다른 소리 나오면
  function offEd(L, i, c, ch) {
    const q = c.off === 'go' || !!c.off && c.off.startsWith('q:');
    const out = [opts([[null, '따로 안 끔'], ['q', '큐 나갈 때'], ['next', '다른 소리 나오면']], q ? 'q' : c.off || null,
      v => ch(() => { if (v == null) delete c.off; else if (v === 'q') { if (!q) c.off = 'go'; } else c.off = v; }))];
    if (q) {
      const sel = h('select', { class: 'sel' }, h('option', { value: 'go' }, '다음 큐 (다음 GO 때)'),
        L.map((x, j) => j > i ? h('option', { value: 'q:' + x.id }, `${cueLabel(L, j)} ${padName(x)}`) : null));
      sel.value = c.off; sel.onchange = () => ch(() => { c.off = sel.value; });
      out.push(sel);
    }
    if (c.off === 'next') out.push(h('small', { class: 'qtrack' }, '다른 큐 소리든 패드를 손으로 눌렀든'));
    return out;
  }
  // 번갈아: 트랙 목록(✕로 빼기) + [+ 트랙] + 몇 바퀴. 트랙 1개 + ×N = 같은 소리를 GO마다 다시
  function altEd(L, i, c, ch) {
    const T = trks(c), rep = c.rep || 1;
    const setRep = v => ch(() => { v = Math.max(1, Math.min(20, v)); if (v > 1) c.rep = v; else delete c.rep; if (!c.off && total(c) > 1) c.off = 'next'; pos.delete(c.id); });
    return [h('div', { class: 'qopts' }, T.map((id, j) => h('button', { class: 'qc on', 'aria-label': j ? `${nm1(id)} 빼기` : nm1(id), onclick: () => { if (!j) return; ch(() => { c.alt.splice(j - 1, 1); if (!c.alt.length) delete c.alt; pos.delete(c.id); }); } }, nm1(id) + (j ? ' ✕' : ''))),
        h('button', { class: 'qc', onclick: () => { pick = c.id; pickAlt = true; edit = null; adding = false; logLine(`큐 번갈아 트랙 고르기 ${cueLabel(L, i)}`); paint(); } }, '+ 트랙')),
      h('div', { class: 'qwait' }, h('small', null, '몇 바퀴'),
        h('button', { class: 'qc', 'aria-label': '한 바퀴 덜', onclick: () => setRep(rep - 1) }, '−'),
        h('b', null, `×${rep}`),
        h('button', { class: 'qc', 'aria-label': '한 바퀴 더', onclick: () => setRep(rep + 1) }, '+')),
      total(c) > 1 ? h('small', { class: 'qtrack' }, `GO ${total(c)}번 나간 뒤 다음 줄로`) : ''];
  }
  const ASK = { play: '언제 재생?', stop: '언제 끄기?', vol: '언제 조절?' };
  const box = (t, ...kids) => h('div', { class: 'qbox' }, t ? h('b', { class: 'qbox-t' }, t) : '', ...kids);
  // 말풍선: ① 무엇을(▶ ■ ◢) ② 언제 ③ 언제 꺼짐(재생만) ④ 더 보기(접힘): 페이드·볼륨·배경 낮추기·하위 번호·소리·메모
  function editor(b, L, i) {
    const c = L[i], ch = fn => { fn(); save(); paint(); };
    const p = c.pad !== '*' && S.pads[c.pad];
    const act = c.act || 'play', isVol = act === 'vol' || act === 'duck' || act === 'restore', k3 = isVol ? 'vol' : act;
    const setAct = v => ch(() => { if (v === k3) return; c.act = v; if (v !== 'play') { delete c.off; delete c.duckO; } delete c.fin; delete c.vol; delete c.fout; delete c.sec; delete c.ramp; if (v === 'vol') c.vol = (p ? p.vol : 1) * 0.5; logLine(`큐 무엇을 ${cueLabel(L, i)} → ${ACTS[v]}`); });
    const memo = h('input', { class: 'txt', value: c.memo || '', maxlength: 40, placeholder: '예: 2막 암전 뒤' });
    memo.onchange = () => ch(() => { const v = memo.value.trim(); if (v) c.memo = v; else delete c.memo; });
    const wait = c.wait || 0, setWait = v => ch(() => { v = Math.max(0, Math.min(60, Math.round(v * 2) / 2)); if (v) c.wait = v; else delete c.wait; });
    // 하위 번호: GO 줄이면서 첫 GO 줄이 아닐 때만
    const goIdx = L.map((x, j) => j).filter(j => isGo(L, j)), canSub = isGo(L, i) && goIdx[0] !== i;
    const subPreview = () => { const was = c.sub; c.sub = subOf(c) ? 0 : 1; const n = nos(L)[i]; if (was == null) delete c.sub; else c.sub = was; return n; };
    const big = opts([['play', ACTS.play], ['stop', ACTS.stop], ['vol', ACTS.vol]], k3, setAct); big.classList.add('big');
    const pop = h('div', { class: 'qpop' + (editIn === 'tab' ? ' below' : '') },
      h('div', { class: 'qpop-h' }, h('b', null, `${cueLabel(L, i)} · ${padName(c)}`), h('button', { class: 'qed', 'aria-label': '닫기', onclick: () => openEdit(null) }, '✕')),
      box('', big, ...(isVol ? volEd(c, p, ch) : [])),
      box(ASK[k3],
        i === 0 ? h('div', { class: 'qnote' }, '첫 줄은 GO를 누를 때 나가요') :
          opts(Object.entries(WHEN1), c.when || 'go', v => ch(() => { c.when = v; })),
        h('div', { class: 'qwait' }, h('small', null, '기다렸다가'),
          h('button', { class: 'qc', 'aria-label': '덜 기다리기', onclick: () => setWait(wait - (wait > 10 ? 5 : wait > 3 ? 1 : 0.5)) }, '−'),
          h('b', null, wait ? `+ ${wait}초` : '바로'),
          h('button', { class: 'qc', 'aria-label': '더 기다리기', onclick: () => setWait(wait + (wait >= 10 ? 5 : wait >= 3 ? 1 : 0.5)) }, '+'))),
      act === 'play' ? box('번갈아 (GO마다 다음 트랙)', ...altEd(L, i, c, ch)) : '',
      act === 'play' ? box('언제 꺼짐?', ...offEd(L, i, c, ch)) : '',
      h('div', { class: 'qbox more' + (more ? ' open' : '') },
        h('button', { class: 'qmore', onclick: () => { more = !more; paint(); } }, more ? '더 보기 ▴' : `더 보기 ▾ (${isVol ? '' : '페이드·'}${act === 'play' ? '볼륨·' : ''}번호·소리·메모)`),
        ...(more ? [
          ...(isVol ? [] : fadeEd(c, p, ch)),
          ...(act === 'play' ? playMore(c, p, ch) : []),
          canSub ? sec('번호') : '',
          canSub ? h('div', { class: 'qopts' }, h('button', { class: 'qc' + (subOf(c) ? ' on' : ''), onclick: () => ch(() => { c.sub = subOf(c) ? 0 : 1; delete c.no; logLine(`큐 번호 ${c.sub ? '하위' : '본'} → ${nos(L)[i]}`); }) },
            subOf(c) ? `하위 번호 ${nos(L)[i]} → 본 번호 ${subPreview()}로` : `하위 번호로 (${subPreview()})`)) : '',
          sec('어떤 소리?', padName(c)),
          h('div', { class: 'qopts' },
            h('button', { class: 'qc', onclick: () => { pick = c.id; edit = null; adding = false; logLine(`큐 소리 바꾸기 ${cueLabel(L, i)}`); paint(); } }, '소리 바꾸기 (패드 누르기)'),
            c.pad === '*' ? '' : h('button', { class: 'qc', onclick: () => ch(() => { c.pad = '*'; }) }, '랜덤')),
          sec('메모 (GO 단추에 보임)'), memo] : [])));
    pop.onclick = e => e.stopPropagation();
    return pop;
  }
  const WHEN1 = { go: 'GO 때', with: '앞 줄과 같이', end: '앞 줄 끝나고' };
  const HELP = [
    ['+ 담기', '(위)를 누르고 패드를 차례로 누르면 ▼ 자리에 큐가 쌓여요 (켜 둔 소리를 또 누르면 끄기)'],
    ['GO', '(아래 단추)를 누르면 색칠된 줄("다음")이 나가요'],
    ['줄', '을 누르면 그 줄이 "다음"이 돼요 · ▲ ▼ 로도 옮겨요'],
    ['▶ 재생', ' 같은 동작 단추를 누르거나 줄을 꾹 누르면 말풍선에서 무엇을 · 언제 · 언제 꺼짐을 바꿔요'],
    ['편집', '(맨 위)을 켜면 큐 줄도 흔들려요 — 줄을 끌어 옮기고, 왼쪽 동그라미로 골라 복제·지우기·구분'],
    ['↳', ' 줄은 GO 없이 앞 줄을 따라 저절로 나가요'],
  ];
  const helpBox = () => h('div', { class: 'qhelp' }, HELP.map(([k, t]) => h('div', null, h('b', null, k), t)),
    h('div', { class: 'qdim' }, '페달·키보드: → 스페이스 = GO · ← = 이전'));
  // 담을 자리: '다음 차례' 줄(과 따라 나가는 ↳) 뒤 — 이어서 담으면 방금 끼운 줄 뒤
  function insAt(L, b) {
    let at = L.findIndex(x => x.id === lastIns) + 1;
    if (!at) { const k = cur(b); if (k >= L.length) at = L.length; else { at = k + 1; while (at < L.length && !isGo(L, at)) at++; } }
    return at;
  }
  function list(b, box, mark) {
    const L = cues(b), rows = L.flatMap((c, i) => rowEl(b, L, i));
    if (mark) { const at = insAt(L, b), r = h('div', { class: 'qins', 'data-id': 'qins' }, '▼ 여기에 담겨요');
      const before = at < L.length && rows.find(e => e.dataset && e.dataset.id === L[at].id);
      const j = before ? rows.indexOf(before) : rows.length;
      // 장면 제목 줄이 그 줄 앞에 붙어 있으면 그 앞에
      rows.splice(j > 0 && rows[j - 1].classList.contains('qscene') ? j - 1 : j, 0, r); }
    box.replaceChildren(...rows);
  }
  // 위쪽 [편집]을 켜고 끌 때: 말풍선·담기를 닫고 고른 줄을 비움
  $('btnEdit').addEventListener('click', () => { if (!on()) return; edit = null; adding = false; pick = null; sceneNext = null; qsel.clear(); paint(); });
  // 편집 중 고른 줄: 큐 팝업 — 패드 팝업(.selbar)과 같은 모양, 큐 목록 아래에 뜸. 고른 줄이 없으면 안 뜸(2026-10-01)
  function selBar(b, L) {
    if (!editing() || !qsel.size) return '';
    const one = qsel.size === 1 ? L.findIndex(c => qsel.has(c.id)) : -1;
    return h('div', { class: 'selbar qsbar' },
      h('span', { class: 'cnt' }, `${qsel.size}줄 고름`),
      h('button', { class: 'sbtn', onclick: () => dupSel(L) }, '복제'),
      one >= 0 ? h('button', { class: 'sbtn', onclick: () => sceneAsk(L, one) }, '구분') : '',
      h('button', { class: 'sbtn', onclick: () => { qsel.clear(); paint(); renderSelBar(); } }, '고르기 해제'),
      h('button', { class: 'sbtn danger', onclick: () => delSel(b, L) }, '삭제'));
  }
  // 위 머리 줄: [+ 담기] [+ 장면] 작게 — 담는 자리는 목록 속 '▼ 여기에 담겨요' 줄로 보임 (맨 아래 두면 끝에 붙는 걸로 읽힘 — 2026-10-01)
  function addBtns() {
    if (S.lock || editing()) return [];
    const toggle = () => { adding = !adding; edit = null; pick = null; lastIns = null; if (!adding) sceneNext = null; logLine(adding ? '큐 담기 시작' : '큐 담기 끝'); paint(); };
    return [h('button', { class: 'qb qadd-s' + (adding ? ' on' : ''), onclick: toggle }, adding ? '✓ 다 담음' : '+ 담기'),
      h('button', { class: 'qb qadd-s' + (sceneNext ? ' on' : ''), onclick: () => {
        const v = (prompt('구분 이름 (다음에 담는 줄 위에 붙어요)', sceneNext || '') || '').trim(); sceneNext = v || null;
        if (sceneNext && !adding) { adding = true; edit = null; lastIns = null; logLine('큐 담기 시작'); }
        paint();
      } }, sceneNext ? `■ ${sceneShort(sceneNext)}` : '+ 구분')];
  }
  // 말풍선(몸에 붙여 띄움): 큐보드 줄이면 줄 왼쪽(패드 위)에 화살표로, 설정 [큐] 칸이면 줄 아래에
  const pop = h('div', { class: 'qpop-w', hidden: true });
  document.body.append(pop);
  pop.addEventListener('focusout', () => refocus());
  function paintPop() {
    const box = editIn === 'tab' ? tabBox : panel;
    const row = edit && !S.lock && box && box.isConnected && box.querySelector(`.qrow[data-id="${edit}"]`);
    if (!row) { pop.hidden = true; pop.textContent = ''; if (edit && !cues().some(c => c.id === edit)) edit = null; return; }
    const b = board(), L = cues(b), i = L.findIndex(c => c.id === edit);
    const st = pop.firstChild ? pop.firstChild.scrollTop : 0;
    pop.replaceChildren(editor(b, L, i), h('i', { class: 'qpop-arrow' }));
    pop.hidden = false; pop.firstChild.scrollTop = st;
    const rr = row.getBoundingClientRect(), W = Math.min(320, innerWidth - 16), H = pop.firstChild.offsetHeight, vh = innerHeight;
    const side = editIn !== 'tab' && rr.left - W - 14 > 4;
    pop.classList.toggle('side', side);
    let x, y;
    if (side) { x = rr.left - W - 14; y = Math.max(8, Math.min(rr.top + rr.height / 2 - 40, vh - H - 8)); }
    else { x = Math.max(8, Math.min(rr.left + 30, innerWidth - W - 8)); y = rr.bottom + 8; if (y + H > vh - 8) y = Math.max(8, rr.top - H - 8); }
    pop.style.cssText = `left:${x}px;top:${y}px;width:${W}px`;
    pop.lastChild.style.top = side ? `${Math.max(12, Math.min(H - 24, rr.top + rr.height / 2 - y - 8))}px` : '';
  }
  // 말풍선 밖을 누르면 닫음 — 그 누름은 패드 등에 전하지 않음(잘못 울리지 않게)
  let swallow = false;
  document.addEventListener('pointerdown', e => {
    if (pop.hidden || pop.contains(e.target)) return;
    const row = e.target.closest && e.target.closest('.qrow');
    if (row && row.dataset.id === edit) return;   // 같은 줄의 ⋯·꾹은 그대로
    e.stopPropagation(); e.preventDefault(); swallow = true;
    edit = null; paint();
  }, true);
  document.addEventListener('click', e => { if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);
  let center = null, nearSb = true;   // GO: 울리는 줄을 가운데로 (한 번만 — 그 뒤 손으로 스크롤해도 끌어당기지 않음)
  function paint(scrollId) {
    stage.classList.toggle('qon', on()); stage.classList.toggle('qopen', on() && open);
    paintGo(); padTags(); requestAnimationFrame(placeSelBar);
    if (!on()) { panel.textContent = ''; adding = false; edit = null; qsel.clear(); pick = null; pop.hidden = true; document.body.classList.remove('qadding'); return; }
    if (typing(panel) || typing(tabBox) || typing(pop)) { dirty = true; return; }
    dirty = false;
    if (tabBox && tabBox.isConnected) list(board(), tabBox); else tabBox = null;
    const b = board(), L = cues(b), k = cur(b);
    document.body.classList.toggle('qadding', adding || !!pick);
    const nav = h('div', { class: 'qnav' },
      h('button', { class: 'qb', 'aria-label': '처음 큐로', disabled: !L.length, onclick: () => setSb(0, '처음') }, '⤒'),
      h('button', { class: 'qb', 'aria-label': '이전 큐로', disabled: !L.length, onclick: () => step(-1) }, '▲'),
      h('button', { class: 'qb', 'aria-label': '다음 큐로', disabled: !L.length, onclick: () => step(1) }, '▼'));
    if (!open) {
      const goRows = L.map((c, i) => i).filter(i => isGo(L, i)), ns = nos(L);
      panel.replaceChildren(h('button', { class: 'qtog', 'aria-label': '큐보드 펼치기', onclick: () => { open = true; paint(); } }, '‹ 큐'), nav,
        h('div', { class: 'qstrip' }, goRows.flatMap(i => [L[i].scene ? h('button', { class: 'qn qsc', 'aria-label': `${L[i].scene} 구분으로`, onclick: () => setSb(i, '구분 ' + L[i].scene) }, sceneShort(L[i].scene)) : null, h('button', { class: 'qn' + (ns[i].length > 3 ? ' sm' : '') + (i === k ? ' q-sb' : '') + (i < k ? ' q-done' : '') + (L.slice(i, nextGo(L, i)).some(c => live.has(c.id)) ? ' q-run' : ''), onclick: () => setSb(i, '줄 누름') }, ns[i])]).filter(Boolean)));
      paintPop();
      return;
    }
    const old = panel.querySelector('.qlist'), top = old ? old.scrollTop : 0;
    const box = h('div', { class: 'qlist' });
    list(b, box, adding && !editing() && !S.lock);
    const next = L[k];
    panel.replaceChildren(
      h('div', { class: 'qhead' },
        h('button', { class: 'qtog', 'aria-label': '큐보드 접기', onclick: () => { open = false; paint(); } }, '큐 ›'),
        h('span', null, L.length ? `GO ${goNo(L, L.length - 1)}개` : ''),
        ...addBtns(),
        h('button', { class: 'qb qhelp-b' + (help ? ' on' : ''), 'aria-label': '큐 사용법', onclick: () => { help = !help; paint(); } }, '?')),
      pick ? h('div', { class: 'qaddbar' }, h('div', null, pickAlt ? '번갈아 틀 트랙의 패드를 누르세요 (소리 안 남)' : '바꿀 소리의 패드를 누르세요 (소리 안 남)'),
        h('button', { class: 'qc', onclick: () => { pick = null; pickAlt = false; paint(); } }, '취소')) :
      adding ? h('div', { class: 'qaddbar' }, h('div', null, '패드를 누르면 ▼ 자리에 쌓여요 (소리 안 남)'),
        h('div', { class: 'qdim' }, '한 번 누르면 ▶ 재생, 켜 둔 소리를 또 누르면 ■ 끄기로 담겨요'),
        sceneNext ? h('div', { class: 'qdim' }, `■ ${sceneNext} — 다음에 담는 줄 위에 붙어요`) : '') : '',
      help || !L.length ? helpBox() : '',
      box,
      h('div', { class: 'qfoot' }, nav, h('div', { class: 'qnext' }, h('small', null, '다음'), h('b', null, next ? `${cueLabel(L, k)} · ${next.memo || padName(next)}` : L.length ? '끝 — ▲로 되돌리기' : '—')),
        next && L[nextGo(L, k)] ? h('div', { class: 'qnext q2' }, h('small', null, '그다음'), h('span', null, `${cueLabel(L, nextGo(L, k))} · ${L[nextGo(L, k)].memo || padName(L[nextGo(L, k)])}`)) : ''),
      selBar(b, L));
    box.scrollTop = top;   // 다시 그려도 손으로 둔 자리 그대로
    if (center) {
      const el = box.querySelector(`.qrow[data-id="${center}"]`); center = null;
      if (el) box.scrollTop = el.offsetTop - (box.clientHeight - el.offsetHeight) / 2;   // 부드럽게 하면 곧 다시 그릴 때 끊김
    } else {
      const target = typeof scrollId === 'string' && box.querySelector(`[data-id="${scrollId}"]`) || nearSb && box.querySelector('.qrow.q-sb');
      if (target) target.scrollIntoView({ block: 'nearest' });
    }
    nearSb = false;
    paintPop();
  }
  // 패드 구석(페이드아웃 아래): 큐에 쓰이면 '큐' — 번호는 잘려서 뺌(소유자 2026-10-01)
  function padTags() {
    padEls.forEach(el => { const t = el.querySelector('.qtag'); if (t) t.remove(); el.classList.remove('q-next'); });
    if (!on()) return;
    // 다음 차례 큐(+ 따라 나가는 ↳ 줄)의 패드에 테두리 — GO 누르면 무엇이 나가는지 패드판에서도 보이게 (랜덤은 뺌, 2026-10-01)
    const L = cues(), k = cur();
    if (k < L.length) L.slice(k, nextGo(L, k)).forEach(c => { const T = trks(c), id = total(c) > 1 ? T[(pos.get(c.id) || 0) % T.length] : c.pad; const el = id !== '*' && S.pads[id] && padEls.get(id); if (el) el.classList.add('q-next'); });
    new Set(cues().flatMap(trks)).forEach(id => { const el = S.pads[id] && padEls.get(id); if (el) el.append(h('div', { class: 'qtag' }, '큐')); });
  }
  function paintGo() {
    const ctl = document.querySelector('.bottom .ctl');
    if (!on()) { if (goB) { goB.remove(); goB = null; } return; }
    if (!goB) {
      goB = h('button', { class: 'cbtn qgo', 'aria-label': 'GO — 다음 큐 내보내기' }, h('b', null, 'GO'), h('small'));
      goB.addEventListener('pointerdown', e => { e.preventDefault(); goB.classList.add('hit'); setTimeout(() => goB && goB.classList.remove('hit'), 90); go(); });
      ctl.prepend(goB);
    }
    const b = board(), L = cues(b), k = cur(b), c = L[k];
    const a = c ? pos.get(c.id) || 0 : 0;
    goB.lastChild.textContent = !L.length ? '큐 없음' : c ? `${qno(L, k)} ${c.memo || (total(c) > 1 ? `${nm1(trks(c)[a % trks(c).length])} ${a + 1}/${total(c)}` : padName(c))}` : '끝';
  }
  setInterval(() => {
    if (!on() || !live.size) return;
    const b = board(), L = cues(b);
    live.forEach((pid, cid) => { const i = L.findIndex(c => c.id === cid); if (i < 0) return; [panel, tabBox].forEach(bx => { const el = bx && bx.querySelector(`.qrow[data-id="${cid}"] .qsub`); if (el) el.textContent = subTxt(L, i, L[i]); const bar = bx && bx.querySelector(`.qrow[data-id="${cid}"] .qbar`); if (bar) bar.style.width = prog(cid) + '%'; }); });
  }, 500);
  setInterval(() => { if (on() && (pend.size || dirty && !typing(panel) && !typing(tabBox))) paint(); }, 200);
  new MutationObserver(() => { if (on()) { edit = null; pos.clear(); paint(); } }).observe($('tabs'), { childList: true });
  new MutationObserver(() => { if (on()) padTags(); }).observe($('grid'), { childList: true });

  // ---------- 설정 ----------
  function settingRow() {
    return row(helpLabel('큐', '켜면 오른쪽에 큐보드, 아래에 GO 단추가 생겨요. [+ 담기] → 패드를 차례로 누르면 큐가 쌓이고, GO를 누를 때마다 차례로 나가요. 켜 둔 소리를 또 누르면 끄기로 담겨요. 줄의 ⋯로 "앞 줄 소리가 끝나면 저절로" 같은 것을 정해요. 페이드·볼륨은 트랙 설정대로, 이 큐만 다르게 할 때만 ⋯에서 따로. 끄면 전부 숨고 원래대로 — 넣은 큐는 남아 있어요.'),
      sw(on(), v => {
        S.settings.cue = v; save(); logLine(`큐 ${v ? '켬' : '끔'}`);
        if (!v) { cancelAll('큐 끔'); ducked.forEach((_, id) => S.pads[id] && Engine.setVolume(id, S.pads[id].vol)); ducked.clear(); }
        paint();
      }));
  }
  // ---------- 큐시트: 한 장만 읽어도 공연 흐름을 아는 표 → 인쇄·PDF로 저장 (보기 전용, 가져오기는 보드 내보내기로) ----------
  function sheetAct(c) {
    const p = c.pad !== '*' && S.pads[c.pad], a = [];
    const sec = v => v ? `${v}초` : '바로';
    if (c.act === 'stop') { a.push('■ 끄기'); const f = p ? fadeOutOf(c, p) : c.fout; if (f) a.push(`아웃 ${f}초`); }
    else if (c.act === 'vol') a.push(c.vol != null ? `◢ 볼륨 ${Math.round(c.vol * 100)}%` : '◢ 원래 볼륨', ...(c.ramp ? [`${c.ramp}초 동안`] : []));
    else if (c.act === 'duck') a.push(`↓ 1/${Math.round(1 / (c.sec || 0.25))}로 작게`);
    else if (c.act === 'restore') a.push('↺ 원래 크기로');
    else {
      a.push('▶ 재생');
      const fin = c.fin != null ? c.fin : p && p.fin ? p.finSec : 0; if (fin) a.push(`인 ${fin}초`);
      if (c.vol != null) a.push(`볼륨 ${Math.round(c.vol * 100)}%`);
      if (c.duckO != null) a.push(`배경 낮추기 ${Math.round(c.duckO * 100)}%`);
      a.push(offTxt(c) || '꺼짐: 따로 안 끔');
      const fo = c.fout != null ? c.fout : p ? foutOf(p) : 0;
      if (c.off && (fo || c.fout != null)) a.push(`아웃 ${sec(fo)}`);
    }
    if (c.at) a.push(`⏰ ${c.at}`);
    return a.join(' · ');
  }
  function printSheet() {
    const b = board(), L = cues(b);
    if (!L.length) return toast('큐가 없어요');
    const d = new Date(), day = `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
    const rows = [];
    L.forEach((c, i) => {
      if (c.scene) rows.push(h('tr', { class: 'qs-scene' }, h('td', { colspan: 4 }, '■ ' + c.scene)));
      const cue = isGo(L, i);
      const sig = [cue ? '' : WHEN1[c.when] || WHEN1.end, c.wait > 0 ? `+ ${c.wait}초` : '', c.memo || ''].filter(Boolean).join(' · ');
      rows.push(h('tr', { class: cue ? '' : 'qs-ch' }, h('td', { class: 'qs-no' }, cue ? qno(L, i) : '↳'), h('td', null, sig), h('td', { class: 'qs-snd' }, padName(c)), h('td', null, sheetAct(c))));
    });
    const sh = h('div', { id: 'qsheet' },
      h('div', { class: 'qs-head' }, h('b', null, `${b.name} — 큐시트`), h('span', null, `큐 ${goNo(L, L.length - 1)}개 · ${day} · DuckQ`)),
      h('table', null, h('colgroup', null, h('col', { style: 'width:9%' }), h('col', { style: 'width:27%' }), h('col', { style: 'width:22%' }), h('col', { style: 'width:42%' })),
        h('thead', null, h('tr', null, ['번호', '언제', '소리', '무엇을 · 언제 꺼짐'].map(t => h('th', null, t)))), h('tbody', null, rows)));
    const old = $('qsheet'); if (old) old.remove();
    document.body.append(sh); document.body.classList.add('qprint');
    const done = () => { document.body.classList.remove('qprint'); sh.remove(); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    logLine(`큐시트 인쇄 ${L.length}줄`);
    setTimeout(() => window.print(), 50);
  }
  // 설정 [큐] 칸: 넓은 화면에서 같은 목록 + 한꺼번에
  function tab(body) {
    const b = board(), L = cues(b);
    tabBox = h('div', { class: 'qlist full' });
    body.append(h('div', { class: 'fbox' },
      h('div', { class: 'fbox-head' }, h('b', null, helpLabel(`${b.name}의 큐`, '보드마다 큐 목록이 하나예요. 줄의 ⋯를 눌러 고쳐요. 옮기기·복제·지우기는 맨 위 [편집]을 켜고. 바꾸는 즉시 적용, 아래 [취소]로 창을 열기 전으로 되돌려요.'))),
      helpBox(),
      h('div', { class: 'trow' },
        h('button', { class: 'sbtn', onclick: () => { if (!L.length || !confirm('큐 번호를 1부터 차례로 다시 매길까요? (하위 번호 2-1이 없어져요)')) return; L.forEach(c => { delete c.no; delete c.sub; }); save(); logLine('큐 번호 새로 매김'); paint(); } }, '번호 새로 매기기'),
        h('button', { class: 'sbtn pri', onclick: printSheet }, '큐시트 (인쇄·PDF)'),
        h('button', { class: 'sbtn', onclick: () => { L.forEach(c => { c.when = 'go'; }); save(); logLine('큐 모두 GO로'); paint(); } }, '모두 GO로 나가게'),
        h('button', { class: 'sbtn danger', onclick: () => { if (!L.length || !confirm(`큐 ${L.length}줄을 모두 지울까요?`)) return; L.length = 0; sb[b.id] = 0; save(); logLine('큐 모두 지움'); paint(); } }, '모두 지우기')),
      tabBox));
    list(b, tabBox);
  }

  // ---------- 내보내기·가져오기: 큐의 패드를 번호로 ----------
  function exportFix(json, srcPads, b) {
    if (!b.cues || !b.cues.length) return;
    const ix = new Map(b.cues.map((c, i) => [c.id, i]));
    json.board.cues = b.cues.map(c => { const { id, pad, ...r } = c; if (r.off && r.off.startsWith('q:')) { if (ix.has(r.off.slice(2))) r.off = 'qi:' + ix.get(r.off.slice(2)); else delete r.off; } const k = srcPads.findIndex(p => p.id === pad); if (r.alt) r.alt = r.alt.map(a => a === '*' ? '*' : srcPads.findIndex(p => p.id === a) + 1).filter(Boolean); return { ...r, padN: pad === '*' ? '*' : k + 1 }; }).filter(c => c.padN);
  }
  function importFix(nb, newIds, json) {
    const src = json.board && json.board.cues; if (!Array.isArray(src)) return;
    const all = src.map(c => { const { padN, ...r } = c; if (Array.isArray(r.alt)) { r.alt = r.alt.map(n => n === '*' ? '*' : newIds[n - 1]).filter(Boolean); if (!r.alt.length) delete r.alt; } return { ...r, id: uid(), pad: padN === '*' ? '*' : newIds[padN - 1] }; });
    all.forEach(c => { if (typeof c.off === 'string' && c.off.startsWith('qi:')) { const t = all[+c.off.slice(3)]; if (t) c.off = 'q:' + t.id; else delete c.off; } });
    nb.cues = all.filter(c => c.pad);
    save();
  }

  if (on()) paint();
  return { tap, go, step, settingRow, tab, exportFix, importFix, paint: () => paint(), selN: () => editing() ? qsel.size : 0, clearSel: () => { if (qsel.size) { qsel.clear(); paint(); } } };
})();
