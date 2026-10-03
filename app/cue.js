// 큐보드 (설정 → 일반 → 큐). 꺼져 있으면 아무 일도 안 한다 — 기존 동작·화면 그대로.
// 보드마다 큐 목록 하나: board.cues = [{id, pad, act, sec, when, wait, memo, at}] (값 없음 = 큐 없음)
//   pad: 패드 id | '*'(랜덤) · act: play|stop|vol|duck|restore · sec: 옛 작게 비율(duck·restore는 옛 줄 — 그대로 동작, 고치면 vol로)
//   트랙대로가 기본, 다를 때만 따로(값 없음 = 트랙 설정): fin 재생 페이드인 초 · vol 재생 볼륨(1=100%) · fout 끄기(재생은 꺼질 때) 페이드아웃 초(0=바로)
//   vol 줄: vol 바꿀 볼륨(값 없음 = 원래대로, 트랙 볼륨) · ramp 걸리는 초(값 없음 = 바로)
//   duckO: 재생 줄이 나올 동안 다른 소리를 각 트랙 볼륨의 몇 배로(값 없음 = 그대로) — 이 소리가 끝나면 ramp초 동안 원래대로
//   off: 언제 꺼짐(재생만, 값 없음 = 따로 안 끔) go 다음 큐(다음 GO) 나갈 때 | 'q:큐id' 그 큐가 나갈 때 | next 다른 소리가 나오면(패드 손 누름 포함)
//   scene: 장면 제목 — 이 줄 위에 머리 줄(■ 1막 2장 — 병원)로 보임. 줄을 옮겨도 자리에 남음
//   sub: 하위 번호 단계(1 = 앞 번호의 2-1식) · 값 없음 = 1·2·3 저절로. no: 옛(0.3.59) 고정 번호 — '-'가 있으면 하위 번호로 이어받음
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
  const padName = c => c.pad === '*' ? '랜덤 소리' : S.pads[c.pad] ? S.pads[c.pad].label || '(이름 없음)' : '(지운 패드)';
  // 언제 꺼짐: 따로 안 끔(값 없음) · 큐 N 나갈 때(go = 다음 큐, 'q:id' = 고른 큐) · 다른 소리 나오면(next, 패드 손 누름 포함)
  const offTxt = (c, L = cues()) => {
    if (!c.off || c.act !== 'play') return '';
    if (c.off === 'go' || c.off === 'next') return c.off === 'go' ? '꺼짐: 다음 큐' : '꺼짐: 다른 소리';
    const j = L.findIndex(x => 'q:' + x.id === c.off);
    return j < 0 ? '' : `꺼짐: ${cueLabel(L, j)}`;
  };
  // 못 트는 줄: 패드가 없거나 파일을 못 읽음(랜덤·불러오는 중은 괜찮음)
  const badOf = c => c.pad === '*' ? '' : !S.pads[c.pad] ? '패드 없음' : status[c.pad] === 'bad' ? badWhy[c.pad] || '못 틂' : '';
  const nextGo = (L, k) => { let j = k + 1; while (j < L.length && !isGo(L, j)) j++; return j; };
  const cueLabel = (L, i) => isGo(L, i) ? `큐 ${qno(L, i)}` : `큐 ${qno(L, i)}↳`;

  // ---------- 실행 ----------
  const sb = {};               // 보드 id → '다음' 줄 번호(0부터)
  const pend = new Map();      // 큐 id → {t0, sec, timer}
  const waitEnd = new Map();   // 패드 id → [[보드, 줄]…] (그 소리가 끝나면 나갈 줄)
  const manual = new Set();    // 손으로(또는 큐로) 끈 패드 — 끝나도 '앞 소리가 끝나면' 줄을 안 부름
  const ducked = new Map();    // 패드 id → 비율
  const live = new Map();      // 큐 id → 패드 id (그 큐가 튼 소리가 울리는 중)
  const volOver = new Set();   // 이 큐만(또는 ◢ 볼륨 큐로) 볼륨을 바꾼 패드 — 끝나면 트랙 볼륨으로
  const duckBy = new Map();    // 패드 id → {list, t} 이 소리가 나올 동안 줄여 둔 다른 소리
  let pick = null;             // [소리 바꾸기]: 패드를 누르면 이 큐의 소리로
  const offs = new Map();      // 큐 id → {pid, off, seq} ('꺼질 때'를 기다리는 소리)
  let seq = 0;                 // GO 한 번(과 따라 나가는 줄) = 한 묶음 — 같은 묶음 소리끼리는 안 끔
  let lastIns = null;          // 담기: 방금 끼운 큐 id (다음은 그 뒤에)
  let sceneNext = null;        // 담기: [+ 장면]으로 적은 제목 — 다음에 담는 줄 위에 붙음
  const sceneShort = t => { const a = t.split('—')[0].trim(); return a.length > 7 ? a.slice(0, 7) + '…' : a; };
  let addAct = 'play';   // 담기 때 고른 동작 — 담기를 켤 때마다 ▶ 재생으로
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
  function run(b, i) {
    const L = cues(b), c = L[i]; if (!c) return;
    const tag = cueLabel(L, i), s = seq;
    const act = () => {
      pend.delete(c.id);
      offBy('q', null, c.id);
      let pid = c.pad;
      if (pid === '*') { const r = b.pads.filter(x => status[x] === 'ready'); pid = r[Math.floor(Math.random() * r.length)]; }
      const p = S.pads[pid];
      if (!p) { logLine(`${tag} 건너뜀 (패드 없음)`, 'w'); return after(b, i, null); }
      // 이 큐가 튼 소리가 아직 울리면 처음부터 다시 틀지 않음(공연 중 같은 줄을 또 GO = 실수, 2026-10-01 연습) — 따라 나가는 줄도 다시 안 냄
      if (c.act === 'play' && live.get(c.id) === pid && Engine.isPlaying(pid)) return logLine(`${tag} 이미 울리는 중 — 그대로 둠`, 'w');
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
      after(b, i, pid);
    };
    if (pend.has(c.id)) return logLine(`${tag} 이미 기다리는 중 — 한 번만 나감`, 'w');
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
    if (why === 'restart') { soon(); return; }   // 재생 막대 옮김·다시 누름 = 같은 소리가 이어짐 → 언제 꺼짐·끝나면 대기·볼륨·배경 낮추기는 그대로 둠
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
    sb[b.id] = Math.max(0, Math.min(i, L.length)); lastIns = null; nearSb = true;
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
    const t = performance.now(), gap = t - lastGo;   // 0.5초 안 두 번째 GO는 무시(10/03 연극: 손 떨려 다음 큐까지 나감)
    if (gap < 500) return logLine(`GO 두 번 눌림 무시 (${(gap / 1000).toFixed(2)}초)`);
    lastGo = t;
    const b = board(), L = cues(b), k = cur(b);
    if (!L.length) return toast('큐가 없어요 — 큐보드의 [+ 담기]로 넣어요');
    if (k >= L.length) { seq++; offBy('go', null, null, seq); logLine('GO → 끝'); return toast('마지막 큐까지 나갔어요 · ▲ 이전이나 ⤒ 처음으로'); }
    logLine(`GO ${cueLabel(L, k)}`);
    let j = k + 1; while (j < L.length && !isGo(L, j)) j++;
    sb[b.id] = j; lastIns = null;
    seq++; offBy('go', null, null, seq);
    center = L[k].id;
    run(b, k); paint();
  }
  function cancelAll(why) {
    if (!pend.size && !waitEnd.size) return;
    logLine(`큐 대기 ${pend.size + waitEnd.size}개 취소 (${why})`);
    pend.forEach(e => clearTimeout(e.timer)); pend.clear(); waitEnd.clear(); soon();
  }
  const allOff = why => () => { if (!on()) return; Engine.playingIds().forEach(i => manual.add(i)); ducked.clear(); duckBy.clear(); cancelAll(why); };
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
      if (i >= 0) { L[i].pad = id; save(); logLine(`큐 소리 바꿈 ${cueLabel(L, i)} → ${nm(id)}`); edit = L[i].id; }
      paint(); return true;
    }
    if (Engine.isPlaying(id)) manual.add(id);
    if (!adding || S.lock) { if (!Engine.isPlaying(id)) offBy('next', id); return false; }
    // '다음 차례' 줄(과 따라 나가는 ↳) 뒤에 끼움 — 이어서 담으면 방금 끼운 줄 뒤에
    const L = cues(), at = insAt(L);
    // 담기 막대에서 고른 동작(▶ 재생 · ■ 끄기 · ◢ 볼륨)으로 담음 — 울리는지로 짐작하지 않음(담기 중엔 소리가 안 나서 뜻이 없었음)
    const c = { id: uid(), pad: id, act: addAct, when: 'go' };
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

  // ---------- 여기부터: 앞 큐들이 만든 상태(울리는 소리·볼륨)로 (2026-10-03, docs/PLAN-여기부터.md) ----------
  // 1번부터 k 앞까지 소리 없이 계산 → 그때 울리고 있을 소리 {pid, cid, vol, duck, by, off, why, on}
  // why: stop(뒤에서 끄거나 볼륨 바꿈) · loop(계속 반복) · duck(뒤에서 다른 소리 작게 될 때 울림) · '' (애매 — 체크 없이)
  function before(b, k) {
    const L = cues(b), st = new Map(); let s = 0;
    const del = pid => { st.delete(pid); st.forEach(o => { if (o.by === pid) { o.duck = 1; o.by = null; } }); };
    for (let i = 0; i < k && i < L.length; i++) {
      const c = L[i];
      if (isGo(L, i)) { s++; st.forEach((o, pid) => { if (o.off === 'go' && o.seq !== s) del(pid); }); }
      st.forEach((o, pid) => { if (o.off === 'q:' + c.id) del(pid); });
      const pid = c.pad, p = S.pads[pid], o = st.get(pid);
      if (pid === '*' || !p) continue;
      if (c.act === 'stop') { if (o) del(pid); }
      else if (c.act === 'vol') { if (o) { o.vol = c.vol != null ? c.vol : p.vol; o.duck = 1; o.by = null; } }
      else if (c.act === 'duck') { if (o) o.vol = p.vol * (c.sec || 0.25); }
      else if (c.act === 'restore') { if (o) o.vol = p.vol; }
      else {
        if (p.solo) [...st.keys()].forEach(x => { if (x !== pid) del(x); });
        if (!o) st.forEach((x, id) => { if (x.off === 'next') del(id); });
        st.set(pid, { pid, cid: c.id, vol: c.vol != null ? c.vol : p.vol, duck: 1, by: null, off: c.off, seq: s });
        if (c.duckO != null) st.forEach((x, id) => { if (id !== pid) { x.duck = c.duckO; x.by = pid; } });
      }
    }
    const out = [...st.values()];
    out.forEach(o => {
      let why = '', j = k;
      // 고른 큐부터 이 소리가 다시 나오기 전에 끄거나 볼륨을 바꾸는 줄이 있나
      for (; j < L.length; j++) if (L[j].pad === o.pid) { if ((L[j].act || 'play') !== 'play') why = 'stop'; break; }
      if (!why && (o.off === 'go' || o.off && o.off.startsWith('q:') && L.findIndex(x => 'q:' + x.id === o.off) >= k)) why = 'stop';
      if (!why && endless(S.pads[o.pid])) why = 'loop';
      if (!why) for (let m = k; m < j && m < L.length; m++) { if (m > k && L[m].scene) break; if (L[m].duckO != null && (L[m].act || 'play') === 'play' && L[m].pad !== o.pid) { why = 'duck'; break; } }
      o.why = why; o.on = !!why;
    });
    return out;
  }
  // 버튼에 보일 수 — 공연 흐름대로 GO 해 와서 이미 그 볼륨으로 다 울리고 있으면 0(안 보임)
  const fhN = (b, k) => { const on = before(b, k).filter(o => o.on); return on.every(o => Engine.isPlaying(o.pid) && Math.abs(Engine.volume(o.pid) - o.vol * o.duck) < 0.01) ? 0 : on.length; };
  const WHY_KO = { stop: '뒤에서 끄거나 볼륨 바꿈', loop: '계속 반복', duck: '뒤에서 작아짐', '': '스스로 끝났을 수도' };
  async function fromHere(b, k) {
    const L = cues(b), list = before(b, k); if (!list.some(o => o.on)) return;
    const noisy = Engine.playingIds().length > 0;
    const rows = list.map(o => {
      const cb = h('input', { type: 'checkbox' }); cb.checked = o.on; cb.onchange = () => { o.on = cb.checked; };
      return h('label', { class: 'qfh-r' + (o.why ? '' : ' dim') }, cb, h('b', null, (S.pads[o.pid].label || '(이름 없음)')),
        h('small', null, `${Math.round(o.vol * o.duck * 100)}% · ${WHY_KO[o.why]}`));
    });
    const box = h('div', { class: 'qfh' }, ...rows,
      noisy ? h('div', { class: 'qfh-w' }, '지금 나는 소리는 멈춥니다') : '',
      h('div', { class: 'qdim' }, '손으로 누른 패드는 빠져요 · 랜덤 큐(*)는 다시 뽑아요'));
    box.value = 'ok'; box.select = () => {};   // askBox는 입력 칸처럼 다룸 — [준비]에서 이 값을 돌려줌
    logLine(`큐 여기부터 창 ${cueLabel(L, k)} · 소리 ${list.filter(o => o.on).length}/${list.length}`);
    if (!await askBox(`${cueLabel(L, k)}부터 — 앞 큐들이 만든 소리`, { ok: '준비' }, box)) return logLine('큐 여기부터 취소');
    const pick = list.filter(o => o.on && status[o.pid] === 'ready');
    Engine.playingIds().forEach(id => { manual.add(id); Engine.stop(id, 0); paintPad(id); });
    cancelAll('여기부터'); ducked.clear(); duckBy.clear(); offs.clear(); live.clear();
    seq++; const s = seq;
    setTimeout(() => {   // 멈춘 소리의 끝 처리가 먼저 지나가게
      pick.forEach(o => {
        const p = S.pads[o.pid], v = o.vol * o.duck;
        Engine.setVolume(o.pid, v);
        if (Math.abs(o.vol - p.vol) > 1e-6) volOver.add(o.pid); else volOver.delete(o.pid);
        if (o.duck !== 1) ducked.set(o.pid, o.duck);
        const op = playOpt(p); op.fadeIn = 0.3;
        if (Engine.play(o.pid, op)) { live.set(o.cid, o.pid); if (o.off) offs.set(o.cid, { pid: o.pid, off: o.off, seq: s }); }
        paintPad(o.pid);
      });
      pick.forEach(o => { const ls = pick.filter(x => x.by === o.pid).map(x => x.pid); if (ls.length) duckBy.set(o.pid, { list: ls, t: 0 }); });
      logLine(`큐 여기부터 ${cueLabel(L, k)} · ${pick.map(o => `${nm(o.pid)} ${Math.round(o.vol * o.duck * 100)}%`).join(', ') || '소리 없음'}`);
      center = L[k] && L[k].id; setSb(k, '여기부터');
    }, 80);
  }

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
  let goK = null, goAnim = 0;   // GO 안 큐 이름 밀어 올리기: 지난 상태 · 움직이는 중
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
    else if (live.has(c.id)) { const pid = live.get(c.id), p = S.pads[pid]; if (endless(p)) s.push('♪ ∞ 반복'); else { const d = playLen(p, pid), rm = Math.max(0, d - playPos(pid)); s.push(`♪ ${fmt(Math.ceil(rm))} 남음`); } }
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
  // 큐 일괄 수정(2026-10-01): 패드 일괄 수정처럼 — 손댄 항목만 고른 줄 모두에 같은 값. 첫 줄은 늘 GO라 '언제'는 그대로
  // 항목 = 말풍선과 같음(소리·번호 빼고). 재생/끄기/볼륨 줄에만 맞는 항목은 그 줄에만 들어가고, 몇 줄에 들어가는지 보임
  function bulkSel(L) {
    const cs = L.filter(c => qsel.has(c.id)); if (!cs.length) return;
    const k3 = c => { const a = c.act || 'play'; return a === 'duck' || a === 'restore' ? 'vol' : a; };
    const padOf = c => c.pad !== '*' && S.pads[c.pad];
    const wrap = h('div', { class: 'qbulk' });
    const draw = () => {
      const of = k => cs.filter(c => k3(c) === k), pl = of('play'), vl = of('vol'), fl = cs.filter(c => k3(c) !== 'vol');
      const same = (f, xs = cs) => xs.length && xs.every(c => f(c) === f(xs[0])) ? f(xs[0]) : undefined;
      // re = 창을 다시 그림(항목이 바뀌는 선택). 막대·초는 끄는 중이라 다시 안 그림
      const set = (what, fn, xs = cs, re = true) => { xs.forEach(fn); save(); paint(); logLine(`큐 일괄 수정 ${xs.length}줄 · ${what}`); if (re) draw(); };
      const mix = (f, xs) => same(f, xs) === undefined ? h('span', { class: 'sub mix' }, '지금 제각각') : null;
      const lab = (t, f, xs = cs) => h('span', null, t, xs.length < cs.length ? h('span', { class: 'sub' }, ` ${xs.length}줄에만`) : null, mix(f, xs));
      // 막대 = 패드 일괄 수정의 볼륨 줄과 똑같이(오른쪽 정렬 + ↺). def = ↺ 값(%)
      const bar = (f, xs, what, fn, def) => volRow('', volBar(xs.reduce((a, c) => a + f(c), 0) / xs.length, x => set(`${what} ${Math.round(x * 100)}%`, c => fn(c, x), xs, false), same(f, xs) === undefined), def);
      const wv = same(c => c.wait || 0), mv = same(c => c.memo || '');
      const memo = h('input', { class: 'txt', value: mv || '', maxlength: 40, placeholder: mv === undefined ? '제각각 — 쓰면 모두 같아져요' : '예: 2막 암전 뒤' });
      memo.onchange = () => { const v = memo.value.trim(); set(`메모 ${v || '없음'}`, c => { if (v) c.memo = v; else delete c.memo; }); };
      const out = [
        h('div', { class: 'row' }, h('label', null, helpLabel('일괄 수정', '모두 같은 항목은 그 값이, 서로 다른 항목은 "제각각"으로 보여요. 손댄 항목만 고른 줄 모두에 같은 값으로 들어가요. 재생·끄기·볼륨 줄에만 맞는 항목은 그 줄에만 들어가요.'))),
        row(lab('무엇을', k3), seg([['play', ACTS.play], ['stop', ACTS.stop], ['vol', ACTS.vol]], same(k3), v => set(ACTS[v], c => {
          if (k3(c) === v) return;
          const p = padOf(c);
          c.act = v; if (v !== 'play') { delete c.off; delete c.duckO; }
          delete c.fin; delete c.vol; delete c.fout; delete c.sec; delete c.ramp; if (v === 'vol') c.vol = (p ? p.vol : 1) * 0.5;
        }))),
        row(lab('언제', c => c.when || 'go'), seg(Object.entries(WHEN1), same(c => c.when || 'go'), v => set(WHEN1[v], c => { c.when = v; }))),
        row(lab('기다렸다가', c => c.wait || 0), stepper(wv === undefined ? 0 : wv, 0, 60, 0.5, x => x ? `+ ${x}초` : '바로',
          v => set(`기다림 ${v}초`, c => { if (v) c.wait = v; else delete c.wait; }, cs, false), wv === undefined))];
      if (pl.length) {
        const ok = c => c.off === 'go' || !!c.off && c.off.startsWith('q:') ? 'q' : c.off || null;
        out.push(row(lab('언제 꺼짐?', ok, pl), seg([[null, '따로 안 끔'], ['q', '다음 큐'], ['next', '다른 소리 나오면']], same(ok, pl),
          v => set(`언제 꺼짐 ${v || '안 끔'}`, c => { if (v == null) delete c.off; else if (v === 'q') c.off = 'go'; else c.off = v; }, pl))));
      }
      if (fl.length) {
        const own = c => k3(c) === 'stop' ? c.fout != null : c.fin != null || c.fout != null, ov = same(own, fl);
        out.push(row(lab('페이드', own, fl), seg([[false, '트랙대로'], [true, '따로']], ov, v => set(`페이드 ${v ? '따로' : '트랙대로'}`, c => {
          const p = padOf(c);
          if (!v) { delete c.fin; delete c.fout; }
          else if (!own(c)) { c.fout = p ? foutOf(p) : 0; if (k3(c) !== 'stop') c.fin = p && p.fin ? p.finSec : 0; }
        }, fl))));
        if (ov === true) {
          const pf = fl.filter(c => k3(c) !== 'stop'), fi = same(c => c.fin || 0, pf), fo = same(c => c.fout || 0, fl);
          out.push(fadeEnv({ fin: fi > 0, finSec: fi || 0, fout: fo > 0, foutSec: fo || 0 }, (side, s, final) => {
            (side === 'in' ? pf : fl).forEach(c => { if (side === 'in') c.fin = s; else c.fout = s; });
            if (final) { save(); paint(); logLine(`큐 일괄 수정 페이드 ${side === 'in' ? '인' : '아웃'} ${s}초`); }
          }, { outOnly: !pf.length, dim: { in: fi === undefined, out: fo === undefined } }));
        }
      }
      if (pl.length) {
        const vo = same(c => c.vol != null, pl);
        out.push(row(lab('이 소리 볼륨', c => c.vol == null ? null : c.vol, pl), seg([[false, '트랙대로'], [true, '막대로']], vo,
          v => set(`이 소리 볼륨 ${v ? '막대로' : '트랙대로'}`, c => { if (!v) delete c.vol; else if (c.vol == null) { const p = padOf(c); c.vol = p ? p.vol : 1; } }, pl))));
        if (vo === true) out.push(bar(c => c.vol, pl, '이 소리 볼륨', (c, x) => { c.vol = x; }, 100));
        const dO = same(c => c.duckO != null, pl);
        out.push(row(lab('배경 낮추기', c => c.duckO == null ? null : c.duckO, pl), seg([[false, '그대로'], [true, '막대로']], dO,
          v => set(`배경 낮추기 ${v ? '막대로' : '그대로'}`, c => { if (!v) { delete c.duckO; delete c.ramp; } else if (c.duckO == null) c.duckO = 0.5; }, pl))));
        if (dO === true) {
          out.push(bar(c => c.duckO, pl, '배경 낮추기', (c, x) => { c.duckO = x; }, 50),
            row(lab('바뀌는 데 걸리는 시간', c => c.ramp || null, pl), seg(RAMPS, same(c => c.ramp || null, pl), v => set(`배경 시간 ${v || '바로'}`, c => { if (v == null) delete c.ramp; else c.ramp = v; }, pl))));
        }
      }
      if (vl.length) {
        const tv = c => padOf(c) ? padOf(c).vol : 1;
        const toVol = c => { if (c.act !== 'vol') { if (c.act === 'duck') c.vol = tv(c) * (c.sec || 0.25); c.act = 'vol'; delete c.sec; } };
        const bk = c => c.act === 'restore' || c.act === 'vol' && c.vol == null, bv = same(bk, vl);
        out.push(row(lab('볼륨 줄', bk, vl), seg([[false, '막대로'], [true, '원래대로']], bv, v => set(`볼륨 줄 ${v ? '원래대로' : '막대로'}`, c => {
          toVol(c); if (v) delete c.vol; else if (c.vol == null) c.vol = tv(c) * 0.5;
        }, vl))));
        if (bv === false) out.push(bar(c => c.act === 'duck' ? tv(c) * (c.sec || 0.25) : c.vol, vl, '볼륨 줄', (c, x) => { toVol(c); c.vol = x; }, 50));
        out.push(row(lab('바뀌는 데 걸리는 시간', c => c.ramp || null, vl), seg(RAMPS, same(c => c.ramp || null, vl), v => set(`볼륨 시간 ${v || '바로'}`, c => { toVol(c); if (v == null) delete c.ramp; else c.ramp = v; }, vl))));
      }
      out.push(h('div', { class: 'row col' }, h('label', null, '메모', mix(c => c.memo || '')), memo));
      wrap.replaceChildren(...out);
    };
    draw();
    openSheet(`큐 ${cs.length}줄 일괄 수정`, body => body.append(wrap));
  }
  async function delSel(b, L) {
    const n = qsel.size; if (!n || !await ask(`큐 ${n}줄을 지울까요?`, { ok: '지우기', danger: true })) return;
    const kid = L[cur(b)] && L[cur(b)].id;
    [...qsel].map(id => L.findIndex(c => c.id === id)).filter(i => i >= 0).sort((a, b) => b - a).forEach(i => {
      const c = L[i]; L.splice(i, 1);
      if (c.scene && L[i] && !L[i].scene) L[i].scene = c.scene;
      L.forEach(x => { if (x.off === 'q:' + c.id) delete x.off; });
    });
    const k = L.findIndex(c => c.id === kid); if (k >= 0) sb[b.id] = k; else sb[b.id] = Math.min(sb[b.id] || 0, L.length);
    logLine(`큐 줄 지움 ${n}줄`); qsel.clear(); save(); paint(); renderSelBar();
  }
  // 꾹 눌러(트랙 편집처럼 HOLD_MS) 끌어 위아래로 — 고른 줄을 끌면 고른 줄 전부 함께, 구분 줄도 꾹 끌어 다른 줄 위로 (2026-10-01 소유자)
  let qdrag = false;
  document.addEventListener('touchmove', e => { if (qdrag) e.preventDefault(); }, { passive: false });
  function dragRow(r, b, L, i, scene) {
    let x0 = 0, y0 = 0, on = false, id = null, tm = 0, group = null;
    const c = L[i], box = () => r.closest('.qlist');
    const clear = () => box() && box().querySelectorAll('.q-over').forEach(x => x.classList.remove('q-over', 'dn'));
    const start = () => {
      tm = 0; if (id == null) return;
      on = true; qdrag = true; pressed = true;
      try { r.setPointerCapture(id); } catch {}
      r.classList.add('q-drag');
      if (!scene && qsel.has(c.id) && qsel.size > 1) {
        group = L.filter(x => qsel.has(x.id)).map(x => x.id);
        box().querySelectorAll('.qrow').forEach(x => { if (x !== r && group.includes(x.dataset.id)) x.classList.add('q-gather'); });
        r.dataset.n = group.length;
      }
    };
    r.addEventListener('pointerdown', e => {
      if (e.target.closest('.qchk') || (e.pointerType === 'mouse' && e.button !== 0)) return;
      x0 = e.clientX; y0 = e.clientY; on = false; group = null; id = e.pointerId; clearTimeout(tm); tm = setTimeout(start, HOLD_MS);
    });
    r.addEventListener('pointermove', e => {
      if (id !== e.pointerId) return;
      if (!on) { if (tm && Math.hypot(e.clientX - x0, e.clientY - y0) > MOVE_PX) { clearTimeout(tm); tm = 0; id = null; } return; }
      r.style.transform = `translateY(${e.clientY - y0}px)`;
      clear();
      const t = rowAt(box(), e.clientY), j = t ? +t.dataset.i : -1;
      if (t && t !== r) t.classList.add('q-over', ...(!scene && j > i ? ['dn'] : []));
    });
    r.addEventListener('contextmenu', e => e.preventDefault());
    const up = e => {
      if (id !== e.pointerId) return; id = null; clearTimeout(tm); tm = 0;
      if (!on) return; on = false; qdrag = false;
      const t = rowAt(box(), e.clientY); let j = t ? +t.dataset.i : -1;
      if (!scene && t && t.classList.contains('qscene') && j > i) j--;   // 아래로 끌어 구분 줄에 놓으면 = 그 구분 위
      clear(); r.classList.remove('q-drag'); r.style.transform = '';
      if (j < 0 || t === r) return paint();
      if (scene) moveScene(L, i, j); else moveRows(b, L, group || [c.id], i, j);
    };
    r.addEventListener('pointerup', up); r.addEventListener('pointercancel', up);
  }
  // 줄(여럿) 옮기기: 놓은 줄 위(위로 끌 때)·아래(아래로 끌 때)에 원래 순서대로. 구분은 자리에 남음
  function moveRows(b, L, ids, i, j) {
    if (ids.includes(L[j].id)) return paint();
    const sc = L.map(c => c.scene), k = cur(b), kid = L[k] && L[k].id;
    const items = L.filter(c => ids.includes(c.id)), rest = L.filter(c => !ids.includes(c.id));
    rest.splice(rest.indexOf(L[j]) + (j > i ? 1 : 0), 0, ...items);
    L.splice(0, L.length, ...rest);
    L.forEach((c, n) => { if (sc[n]) c.scene = sc[n]; else delete c.scene; });
    if (kid) sb[b.id] = L.findIndex(c => c.id === kid);
    logLine(ids.length > 1 ? `큐 줄 ${ids.length}개 함께 옮김 → ${L.indexOf(items[0]) + 1}` : `큐 줄 옮김 ${i + 1} → ${L.indexOf(items[0]) + 1}`);
    save(); paint();
  }
  // 구분 옮기기: 놓은 줄 위로. 거기 구분이 있으면 서로 바꿈
  function moveScene(L, i, j) {
    if (i === j) return paint();
    const a = L[i].scene, o = L[j].scene;
    L[j].scene = a; if (o) L[i].scene = o; else delete L[i].scene;
    logLine(`큐 구분 옮김 ${a} ${i + 1} → ${j + 1}줄${o ? ` (${o}와 바꿈)` : ''}`); save(); paint();
  }
  const rowAt = (box, y) => [...box.querySelectorAll('.qrow,.qscene')].find(x => { if (x.classList.contains('q-drag') || x.classList.contains('q-gather')) return false; const rr = x.getBoundingClientRect(); return y >= rr.top && y < rr.bottom; });
  async function sceneAsk(L, i) {
    const c = L[i], v = await askText('구분 이름 (이 줄 위에 구분 줄 · 비우면 없앰)', c.scene || '');
    if (v == null) return;
    if (v.trim()) c.scene = v.trim().slice(0, 30); else delete c.scene;
    logLine(`큐 구분 ${c.scene || '없앰'} (${i + 1}줄)`); save(); paint();
  }
  function rowEl(b, L, i) {
    const c = L[i], k = cur(b), lock = S.lock, ed = editing();
    // 여기부터: '다음' 줄에만, 되살릴(미리 체크) 소리가 있을 때만 — 울리는 중인 줄·담기·편집 중엔 안 보임
    const fh = i === k && i > 0 && !ed && !adding && !pick && !live.has(c.id) && !pend.has(c.id) ? fhN(b, i) : 0;
    const cls = 'qrow' + (isGo(L, i) ? ' q-go' : ' q-ch') + (i === k ? ' q-sb' : '') + (i < k ? ' q-done' : '') +
      (live.has(c.id) ? ' q-run' : '') + (pend.has(c.id) ? ' q-wait' : '') + (badOf(c) ? ' q-bad' : '') + (edit === c.id ? ' q-edit' : '') + (pick === c.id ? ' q-pick' : '') + (qsel.has(c.id) ? ' q-sel' : '');
    const selT = () => { if (qsel.has(c.id)) qsel.delete(c.id); else qsel.add(c.id); if (qsel.size && sel.size) clearSel(); paint(); renderSelBar(); };
    const r = h('div', { class: cls, 'data-i': i, 'data-id': c.id, role: 'button', 'aria-label': ed ? `${cueLabel(L, i)} ${padName(c)} — 고르기` : `${cueLabel(L, i)} ${padName(c)} — 다음으로` },
      // 왼쪽부터 [고르기(편집 중)] · 번호 · 이름/정보 · (오른쪽 끝) 동작 단추 — 자리는 cue.css grid-area (2026-10-01 소유자)
      ed ? h('button', { class: 'qed qchk' + (qsel.has(c.id) ? ' on' : ''), 'aria-label': '이 줄 고르기', onclick: e => { e.stopPropagation(); selT(); } }, '✓') : '',
      // 맨 왼쪽 칸: 작은 동작 단추 + 그 아래 꺼짐 정보 (2026-10-01 소유자)
      h('span', { class: 'qact' + (own(c) || (c.act && c.act !== 'play') ? ' x' : '') },
        h(lock || ed ? 'span' : 'button', { class: 'qact-t' + (lock || ed ? '' : ' qact-b') + (edit === c.id ? ' on' : ''),
          ...(lock || ed ? {} : { 'aria-label': '이 큐 고치기', onclick: e => { e.stopPropagation(); openEdit(edit === c.id ? null : c.id, '', r); } }) }, actTxt(c)),
        offTxt(c, L) ? h('small', { class: 'qoff' }, offTxt(c, L)) : ''),
      h('span', { class: 'qn' + (isGo(L, i) && qno(L, i).length > 3 ? ' sm' : '') }, isGo(L, i) ? qno(L, i) : '↳'),
      h('span', { class: 'qmain' }, h('b', { class: 'qname' }, padName(c)), h('small', { class: 'qsub' }, subTxt(L, i, c)),
        fh ? h('button', { class: 'qfh-b', 'aria-label': `${cueLabel(L, i)}부터 앞 소리 되살리기`, onclick: e => { e.stopPropagation(); fromHere(b, i); } }, `여기부터 · 소리 ${fh}`) : ''),
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
    const head = c.scene ? [h('div', { class: 'qscene' + (i < k ? ' q-done' : ''), 'data-i': i, role: 'button', 'aria-label': ed ? `${c.scene} 구분 이름 고치기` : `${c.scene} 구분으로`,
      onclick: () => { if (pressed) { pressed = false; return; } if (ed) return sceneAsk(L, i); lastIns = null; setSb(i, '구분 ' + c.scene); } },
      h('b', null, '■ ' + c.scene), h('small', null, ed ? '누르면 이름 · 꾹 끌면 옮기기' : '누르면 여기로'))] : [];
    if (ed && head[0]) dragRow(head[0], b, L, i, true);
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
  const volBar = (v, fn, mixed) => stepper(Math.round(v * 100), 0, 300, 5, volTxt, x => fn(x / 100), !!mixed, VOL_MAP);
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
    ['+ 담기', '(위)를 누르고 패드를 차례로 누르면 ▼ 자리에 큐가 쌓여요 — 재생·끄기·볼륨은 담기 막대에서 골라요'],
    ['GO', '(아래 단추)를 누르면 색칠된 줄("다음")이 나가요'],
    ['줄', '을 누르면 그 줄이 "다음"이 돼요 · ▲ ▼ 로도 옮겨요'],
    ['▶ 재생', ' 같은 동작 단추를 누르거나 줄을 꾹 누르면 말풍선에서 무엇을 · 언제 · 언제 꺼짐을 바꿔요'],
    ['편집', '(맨 위)을 켜면 큐 줄도 흔들려요 — 줄을 꾹 눌러 끌어 옮기고(고른 줄은 함께), 구분 줄도 꾹 끌어 옮겨요 · 왼쪽 ✓로 골라 복제·지우기·구분'],
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
  // 연결선: ▶ 줄과 그 곡을 끄는 줄(■ 또는 '언제 꺼짐'에 정한 줄)만 잇는다 — 끄는 줄이 없는 곡은 선 없음. 화면 표시만
  // (2026-10-01 소유자: 3칸 · 칸마다 고정 색 — 장면마다 패드 색을 맞춰 쓰면 패드 색으로는 곡이 안 갈림)
  const LANES = 3, LANE_C = ['#5B8DEF', '#F08C3A', '#4FBF8B'];
  function lanes(L) {
    const ivs = [], open = new Map(), warn = new Set();   // ivs = {pid, s, e}, open = 패드 id → 아직 끄는 줄을 못 찾은 ▶ 줄
    L.forEach((c, i) => {
      const pid = c.pad, act = c.act || 'play';
      if (!pid || pid === '*' || !S.pads[pid]) return;
      if (act === 'play') {
        let e = -1;
        if (c.off === 'go') e = nextGo(L, i);
        else if (c.off === 'next') e = L.findIndex((x, j) => j > i && (x.act || 'play') === 'play' && x.pad !== pid);
        else if (c.off) e = L.findIndex(x => 'q:' + x.id === c.off);
        if (e > i && e < L.length) { ivs.push({ pid, s: i, e }); open.delete(pid); } else open.set(pid, i);
      } else if (act === 'stop') {
        if (open.has(pid)) { ivs.push({ pid, s: open.get(pid), e: i }); open.delete(pid); }
        else if (!ivs.some(v => v.pid === pid && v.e === i)) warn.add(i);
      }
    });
    const end = Array(LANES).fill(-1), out = L.map(() => ({ seg: Array(LANES).fill(''), scene: Array(LANES).fill(false), extra: '' }));
    ivs.sort((a, b) => a.s - b.s || a.e - b.e).forEach(v => {
      const k = end.findIndex(x => x < v.s);
      if (k < 0) { out[v.s].extra = '+'; return; }
      end[k] = v.e;
      for (let j = v.s; j <= v.e; j++) {
        out[j].seg[k] = j === v.s ? 'start' : j === v.e ? 'end' : L[j].pad === v.pid && L[j].act !== 'stop' ? 'dot' : 'pass';
        if (j > v.s) out[j].scene[k] = true;
      }
    });
    warn.forEach(i => { out[i].extra = '!'; });
    return out;
  }
  function laneEl(r, scene) {
    if (!r) return '';
    return h('span', { class: 'qln', 'aria-hidden': 'true' }, ...r.seg.map((s, k) => {
      if (scene) s = r.scene[k] ? 'pass' : '';
      return s ? h('i', { class: 'qln-' + s, style: `right:${(LANES - 1 - k) * 6}px;--lc:${LANE_C[k]}` }) : '';
    }), !scene && r.extra ? h('b', { class: 'qln-x' + (r.extra === '!' ? ' warn' : '') }, r.extra) : '');
  }
  function list(b, box, mark) {
    const L = cues(b), ln = lanes(L), rows = L.flatMap((c, i) => {
      const els = rowEl(b, L, i), r = els[els.length - 1];
      r.prepend(laneEl(ln[i]) || '');
      if (els.length > 1) els[0].prepend(laneEl(ln[i], true) || '');
      return els;
    });
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
      h('button', { class: 'sbtn', onclick: () => bulkSel(L) }, '일괄 수정'),
      h('button', { class: 'sbtn', onclick: () => dupSel(L) }, '복제'),
      one >= 0 ? h('button', { class: 'sbtn', onclick: () => sceneAsk(L, one) }, '구분') : '',
      h('button', { class: 'sbtn', onclick: () => { qsel.clear(); paint(); renderSelBar(); } }, '고르기 해제'),
      h('button', { class: 'sbtn danger', onclick: () => delSel(b, L) }, '삭제'));
  }
  // 위 머리 줄: [+ 담기] [+ 장면] 작게 — 담는 자리는 목록 속 '▼ 여기에 담겨요' 줄로 보임 (맨 아래 두면 끝에 붙는 걸로 읽힘 — 2026-10-01)
  function addBtns() {
    if (S.lock || editing()) return [];
    const toggle = () => { adding = !adding; addAct = 'play'; edit = null; pick = null; lastIns = null; if (!adding) sceneNext = null; logLine(adding ? '큐 담기 시작' : '큐 담기 끝'); paint(); };
    return [h('button', { class: 'qb qadd-s' + (adding ? ' on' : ''), onclick: toggle }, adding ? '✓ 다 담음' : '+ 담기'),
      h('button', { class: 'qb qadd-s' + (sceneNext ? ' on' : ''), onclick: async () => {
        const v = (await askText('구분 이름 (다음에 담는 줄 위에 붙어요)', sceneNext || '') || '').trim(); sceneNext = v || null;
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
        h('div', { class: 'qstrip' }, goRows.flatMap(i => [L[i].scene ? h('button', { class: 'qn qsc', 'aria-label': `${L[i].scene} 구분으로`, onclick: () => setSb(i, '구분 ' + L[i].scene) }, sceneShort(L[i].scene)) : null, h('button', { class: 'qn' + (ns[i].length > 3 ? ' sm' : '') + (i === k ? ' q-sb' : '') + (i < k ? ' q-done' : '') + (L.slice(i, nextGo(L, i)).some(c => live.has(c.id)) ? ' q-run' : ''), onclick: () => setSb(i, '줄 누름') }, ns[i])]).filter(Boolean)), goB);
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
      pick ? h('div', { class: 'qaddbar' }, h('div', null, '바꿀 소리의 패드를 누르세요 (소리 안 남)'),
        h('button', { class: 'qc', onclick: () => { pick = null; paint(); } }, '취소')) :
      adding ? h('div', { class: 'qaddbar' },
        opts([['play', ACTS.play], ['stop', ACTS.stop], ['vol', ACTS.vol]], addAct, v => { addAct = v; logLine(`큐 담기 동작 ${ACTS[v]}`); paint(); }),
        sceneNext ? h('div', { class: 'qdim' }, `■ ${sceneNext} — 다음에 담는 줄 위에 붙어요`) : '') : '',
      help || !L.length ? helpBox() : '',
      box,
      h('div', { class: 'qfoot' }, nav, goB),
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
    if (k < L.length) L.slice(k, nextGo(L, k)).forEach(c => { const el = c.pad !== '*' && S.pads[c.pad] && padEls.get(c.pad); if (el) el.classList.add('q-next'); });
    new Set(cues().map(c => c.pad)).forEach(id => { const el = S.pads[id] && padEls.get(id); if (el) el.append(h('div', { class: 'qtag' }, '큐')); });
  }
  function paintGo() {
    if (!on()) { if (goB) { goB.remove(); goB = null; } return; }
    if (!goB) {
      goB = h('button', { class: 'cbtn qgo', 'aria-label': 'GO — 다음 큐 내보내기' }, h('b', null, 'GO'), h('span', { class: 'qgi' }, h('span', { class: 'qgl' }, h('em', null, '다음'), h('em', null, '그다음')), h('span', { class: 'qgw' }, h('span', { class: 'qgk' }))));   // 오른쪽: 다음 큐 / 그다음(옛 '다음·그다음' 줄을 합침 2026-10-03)
      goB.addEventListener('pointerdown', e => { e.preventDefault(); goB.classList.add('hit'); setTimeout(() => goB && goB.classList.remove('hit'), 90); go(); });   // 자리는 큐박스 맨 아래(paint가 붙임) — 아래 조작줄에선 재생바를 가렸음(2026-10-03)
    }
    const b = board(), L = cues(b), k = cur(b), c = L[k];
    // 기다렸다가 나가는 줄이 있으면 GO 아래에 남은 초 — 반응이 없는 줄 알고 또 누르지 않게
    let w = null; pend.forEach((e, id) => { const r = e.sec - (performance.now() - e.t0) / 1000; if (!w || r < w.r) w = { r, i: L.findIndex(x => x.id === id) }; });
    goB.classList.toggle('wait', !!w);
    const n2 = c && L[nextGo(L, k)];
    const t1 = w ? `⏳ ${Math.max(1, Math.ceil(w.r))}초 뒤 ${w.i >= 0 ? qno(L, w.i) : ''}` : !L.length ? '큐 없음' : c ? `${cueLabel(L, k)} · ${c.memo || padName(c)}` : '끝';
    const t2 = n2 ? `${cueLabel(L, nextGo(L, k))} · ${n2.memo || padName(n2)}` : c ? '끝' : '';
    const [lab, win] = goB.lastChild.children, trk = win.firstChild;
    lab.hidden = !c;
    // GO로 앞으로 나가면: 이름표는 그대로, 큐 이름만 한 칸 밀려 올라감(나간 큐는 위로 사라지고, 새 그다음이 아래에서)
    if (goAnim) return;
    const key = b.id + ':' + k, fwd = goK && goK.id === b.id && k > goK.k && !w && !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (goK && key !== goK.key && fwd && goK.t1) {
      trk.replaceChildren(h('div', { class: 'a' }, goK.t1), h('div', null, goK.t2 || t1), h('div', null, t2));
      void trk.offsetWidth; trk.classList.add('roll');
      goAnim = setTimeout(() => { goAnim = 0; trk.classList.remove('roll'); paintGo(); }, 380);
    } else trk.replaceChildren(h('div', { class: 'a' }, t1), h('div', null, t2));
    goK = { id: b.id, k, key, t1: w ? '' : t1, t2 };
  }
  setInterval(() => {
    if (!on() || !live.size) return;
    const b = board(), L = cues(b);
    live.forEach((pid, cid) => { const i = L.findIndex(c => c.id === cid); if (i < 0) return; [panel, tabBox].forEach(bx => { const el = bx && bx.querySelector(`.qrow[data-id="${cid}"] .qsub`); if (el) el.textContent = subTxt(L, i, L[i]); const bar = bx && bx.querySelector(`.qrow[data-id="${cid}"] .qbar`); if (bar) bar.style.width = prog(cid) + '%'; }); });
  }, 500);
  setInterval(() => { if (on() && (pend.size || dirty && !typing(panel) && !typing(tabBox))) paint(); }, 200);
  new MutationObserver(() => { if (on()) { edit = null; paint(); } }).observe($('tabs'), { childList: true });
  new MutationObserver(() => { if (on()) padTags(); }).observe($('grid'), { childList: true });

  // ---------- 설정 ----------
  function settingRow() {
    return row(helpLabel('큐', '켜면 오른쪽에 큐보드, 아래에 GO 단추가 생겨요. [+ 담기] → 패드를 차례로 누르면 큐가 쌓이고, GO를 누를 때마다 차례로 나가요. 끄기·볼륨은 담기 막대에서 고르고 담아요. 줄의 ⋯로 "앞 줄 소리가 끝나면 저절로" 같은 것을 정해요. 페이드·볼륨은 트랙 설정대로, 이 큐만 다르게 할 때만 ⋯에서 따로. 끄면 전부 숨고 원래대로 — 넣은 큐는 남아 있어요.'),
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
        h('button', { class: 'sbtn', onclick: async () => { if (!L.length || !await ask('큐 번호를 1부터 차례로 다시 매길까요? (하위 번호 2-1이 없어져요)', { ok: '다시 매기기' })) return; L.forEach(c => { delete c.no; delete c.sub; }); save(); logLine('큐 번호 새로 매김'); paint(); } }, '번호 새로 매기기'),
        h('button', { class: 'sbtn pri', onclick: printSheet }, '큐시트 (인쇄·PDF)'),
        h('button', { class: 'sbtn', onclick: () => { L.forEach(c => { c.when = 'go'; }); save(); logLine('큐 모두 GO로'); paint(); } }, '모두 GO로 나가게'),
        h('button', { class: 'sbtn danger', onclick: async () => { if (!L.length || !await ask(`큐 ${L.length}줄을 모두 지울까요?`, { ok: '모두 지우기', danger: true })) return; L.length = 0; sb[b.id] = 0; save(); logLine('큐 모두 지움'); paint(); } }, '모두 지우기')),
      tabBox));
    list(b, tabBox);
  }

  // ---------- 내보내기·가져오기: 큐의 패드를 번호로 ----------
  function exportFix(json, srcPads, b) {
    if (!b.cues || !b.cues.length) return;
    const ix = new Map(b.cues.map((c, i) => [c.id, i]));
    json.board.cues = b.cues.map(c => { const { id, pad, ...r } = c; if (r.off && r.off.startsWith('q:')) { if (ix.has(r.off.slice(2))) r.off = 'qi:' + ix.get(r.off.slice(2)); else delete r.off; } const k = srcPads.findIndex(p => p.id === pad); return { ...r, padN: pad === '*' ? '*' : k + 1 }; }).filter(c => c.padN);
  }
  function importFix(nb, newIds, json) {
    const src = json.board && json.board.cues; if (!Array.isArray(src)) return;
    const all = src.map(c => { const { padN, ...r } = c; return { ...r, id: uid(), pad: padN === '*' ? '*' : newIds[padN - 1] }; });
    all.forEach(c => { if (typeof c.off === 'string' && c.off.startsWith('qi:')) { const t = all[+c.off.slice(3)]; if (t) c.off = 'q:' + t.id; else delete c.off; } });
    nb.cues = all.filter(c => c.pad);
    save();
  }

  if (on()) paint();
  return { tap, go, step, settingRow, tab, exportFix, importFix, paint: () => paint(), selN: () => editing() ? qsel.size : 0, clearSel: () => { if (qsel.size) { qsel.clear(); paint(); } } };
})();
