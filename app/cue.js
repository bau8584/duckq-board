// 큐보드 (설정 → 일반 → 큐). 꺼져 있으면 아무 일도 안 한다 — 기존 동작·화면 그대로.
// 보드마다 큐 목록 하나: board.cues = [{id, pad, act, sec, when, wait, memo, at}] (값 없음 = 큐 없음)
//   pad: 패드 id | '*'(랜덤) · act: play|stop|fade|duck|restore · sec: 페이드 초 / 작게 비율
//   when: go(GO를 누를 때) | end(앞 소리가 끝나면) | with(앞 큐와 동시에) · wait: 기다렸다가 초 · at: 'HH:MM' 그 시각에
// 연극식 번호: GO로 나가는 줄만 번호(큐 1, 큐 2…), 따라 나가는 줄은 ↳
'use strict';
window.Cue = (() => {
  const on = () => !!S.settings.cue;
  const cues = (b = board()) => b.cues || (b.cues = []);
  const isGo = (L, i) => i === 0 || !L[i].when || L[i].when === 'go';
  const goNo = (L, i) => { let n = 0; for (let j = 0; j <= i; j++) if (isGo(L, j)) n++; return n; };
  const ACTS = { play: '▶ 재생', stop: '■ 끄기', fade: '◣ 줄이며 끄기', duck: '↓ 작게', restore: '↺ 원래 크기' };
  const WHENS = { go: 'GO를 누를 때', end: '앞 줄 소리가 끝나면', with: '앞 줄과 동시에' };
  const actTxt = c => c.act === 'fade' ? `◣ ${c.sec || 3}초 끄기` : c.act === 'duck' ? `↓ 1/${Math.round(1 / (c.sec || 0.25))}로` : (ACTS[c.act] || ACTS.play);
  const padName = c => c.pad === '*' ? '랜덤 소리' : S.pads[c.pad] ? S.pads[c.pad].label || '(이름 없음)' : '(지운 패드)';
  const cueLabel = (L, i) => isGo(L, i) ? `큐 ${goNo(L, i)}` : `큐 ${goNo(L, i)}↳`;

  // ---------- 실행 ----------
  const sb = {};               // 보드 id → '다음' 줄 번호(0부터)
  const pend = new Map();      // 큐 id → {t0, sec, timer}
  const waitEnd = new Map();   // 패드 id → [[보드, 줄]…] (그 소리가 끝나면 나갈 줄)
  const manual = new Set();    // 손으로(또는 큐로) 끈 패드 — 끝나도 '앞 소리가 끝나면' 줄을 안 부름
  const ducked = new Map();    // 패드 id → 비율
  const live = new Map();      // 큐 id → 패드 id (그 큐가 튼 소리가 울리는 중)
  let adding = false, addAct = 'play', lastGo = 0, open = true, edit = null, help = false;

  function run(b, i) {
    const L = cues(b), c = L[i]; if (!c) return;
    const tag = cueLabel(L, i);
    const act = () => {
      pend.delete(c.id);
      let pid = c.pad;
      if (pid === '*') { const r = b.pads.filter(x => status[x] === 'ready'); pid = r[Math.floor(Math.random() * r.length)]; }
      const p = S.pads[pid];
      if (!p) { logLine(`${tag} 건너뜀 (패드 없음)`, 'w'); return after(b, i, null); }
      logLine(`${tag} ${actTxt(c)} ${nm(pid)}${c.memo ? ' · ' + c.memo : ''}`);
      if (c.act === 'stop' || c.act === 'fade') { if (Engine.isPlaying(pid)) { manual.add(pid); Engine.stop(pid, c.act === 'fade' ? (c.sec || 3) : 0); } }
      else if (c.act === 'duck') { ducked.set(pid, c.sec || 0.25); Engine.setVolume(pid, p.vol * (c.sec || 0.25)); }
      else if (c.act === 'restore') { if (ducked.delete(pid)) Engine.setVolume(pid, p.vol); }
      else if (status[pid] === 'ready') {
        if (p.solo) soloOthers(pid);
        if (Engine.play(pid, playOpt(p))) { lastId = pid; p.played = true; S.lastUse = Date.now(); save(); live.set(c.id, pid); }
      }
      paintPad(pid); soon();
      after(b, i, pid);
    };
    if (c.wait > 0) {
      const e = { t0: performance.now(), sec: c.wait };
      e.timer = setTimeout(function go() { if (Engine.paused) { e.timer = setTimeout(go, 200); return; } act(); }, c.wait * 1000);
      pend.set(c.id, e); soon();
    } else act();
  }
  // 이 줄 다음이 따라 나가는 줄이면: 동시에 = 바로, 끝나면 = 이 줄 소리가 끝날 때(끄기는 바로·줄이며 끄기는 그 시간 뒤)
  function after(b, i, pid) {
    const L = cues(b), c = L[i], n = L[i + 1]; if (!n || isGo(L, i + 1)) return;
    if (n.when === 'with') return run(b, i + 1);
    if (c.act === 'play' && pid && Engine.isPlaying(pid)) { const a = waitEnd.get(pid) || []; a.push([b, i + 1]); waitEnd.set(pid, a); }
    else if (c.act === 'fade') setTimeout(() => run(b, i + 1), (c.sec || 3) * 1000);
    else run(b, i + 1);
  }
  Engine.on('play', () => soon());
  Engine.on('end', (id, why) => {
    const m = manual.delete(id);
    ducked.delete(id);
    live.forEach((pid, cid) => { if (pid === id) live.delete(cid); });
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
    sb[b.id] = Math.max(0, Math.min(i, L.length));
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
    const t = performance.now(); if (t - lastGo < 350) return;   // 연타해도 한 칸씩
    lastGo = t;
    const b = board(), L = cues(b), k = cur(b);
    if (!L.length) return toast('큐가 없어요 — 큐보드의 [+ 담기]로 넣어요');
    if (k >= L.length) { logLine('GO → 끝'); return toast('마지막 큐까지 나갔어요 · ▲ 이전이나 ⤒ 처음으로'); }
    logLine(`GO ${cueLabel(L, k)}`);
    let j = k + 1; while (j < L.length && !isGo(L, j)) j++;
    sb[b.id] = j;
    run(b, k); paint();
  }
  function cancelAll(why) {
    if (!pend.size && !waitEnd.size) return;
    logLine(`큐 대기 ${pend.size + waitEnd.size}개 취소 (${why})`);
    pend.forEach(e => clearTimeout(e.timer)); pend.clear(); waitEnd.clear(); soon();
  }
  const allOff = why => () => { if (!on()) return; Engine.playingIds().forEach(i => manual.add(i)); ducked.clear(); cancelAll(why); };
  $('btnStop').addEventListener('pointerdown', allOff('전체정지'));
  $('btnFade').addEventListener('pointerdown', allOff('전체 페이드'));
  $('btnLock').addEventListener('click', () => { if (S.lock) { adding = false; edit = null; } paint(); });

  // 패드 누름: 담는 중이면 큐로 넣고(소리 안 냄) true
  function tap(id) {
    if (!on()) return false;
    if (Engine.isPlaying(id)) manual.add(id);
    if (!adding || S.lock) return false;
    const L = cues(), c = { id: uid(), pad: id, act: addAct, when: 'go' };
    if (addAct === 'fade') c.sec = 3;
    L.push(c); save();
    logLine(`큐 담음 ${cueLabel(L, L.length - 1)} ${actTxt(c)} ${nm(id)}`); paint(true);
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
    const e = pend.get(c.id), s = [];
    if (e) s.push(`${Math.max(0, e.sec - (performance.now() - e.t0) / 1000).toFixed(1)}초 뒤 나감`);
    else if (live.has(c.id)) s.push('♪ 울리는 중');
    if (i === cur() && !e) s.push('다음 차례 — GO');
    if (!isGo(L, i)) s.push(c.when === 'with' ? '앞 줄과 동시에' : '앞 줄 소리가 끝나면');
    if (c.wait > 0 && !e) s.push(`${c.wait}초 있다가`);
    if (c.at) s.push('⏰' + c.at);
    if (c.memo) s.push(c.memo);
    return s.join(' · ');
  }
  function rowEl(b, L, i) {
    const c = L[i], k = cur(b), lock = S.lock;
    const cls = 'qrow' + (isGo(L, i) ? ' q-go' : ' q-ch') + (i === k ? ' q-sb' : '') + (i < k ? ' q-done' : '') +
      (live.has(c.id) ? ' q-run' : '') + (pend.has(c.id) ? ' q-wait' : '') + (edit === c.id ? ' q-edit' : '');
    const r = h('div', { class: cls, 'data-i': i, role: 'button', 'aria-label': `${cueLabel(L, i)} ${padName(c)} — 다음으로` },
      h('span', { class: 'qn' }, isGo(L, i) ? String(goNo(L, i)) : '↳'),
      h('span', { class: 'qmain' }, h('b', { class: 'qname' }, padName(c)), h('small', { class: 'qsub' }, subTxt(L, i, c))),
      h('span', { class: 'qact' + (c.act && c.act !== 'play' ? ' x' : '') }, actTxt(c)),
      lock ? '' : h('button', { class: 'qed', 'aria-label': '이 큐 고치기', onclick: e => { e.stopPropagation(); edit = edit === c.id ? null : c.id; paint(); } }, edit === c.id ? '✕' : '⋯'));
    r.onclick = () => { if (i !== k) setSb(i, '줄 누름'); };
    return edit === c.id && !lock ? [r, editor(b, L, i)] : [r];
  }
  function editor(b, L, i) {
    const c = L[i], ch = fn => { fn(); save(); paint(); };
    const tgt = h('select', { class: 'sel' }, h('option', { value: '*' }, '랜덤 (이 보드에서 아무거나)'),
      b.pads.map(x => h('option', { value: x }, `${String(b.pads.indexOf(x) + 1).padStart(2, '0')} ${S.pads[x].label}`)));
    tgt.value = c.pad; tgt.onchange = () => ch(() => { c.pad = tgt.value; });
    const at = h('input', { type: 'time', step: 60, class: 'txt qat', value: c.at || '' });
    at.onchange = () => ch(() => { if (at.value) c.at = at.value; else delete c.at; });
    const memo = h('input', { class: 'txt', value: c.memo || '', maxlength: 40, placeholder: '예: 2막 암전 뒤' });
    memo.onchange = () => ch(() => { const v = memo.value.trim(); if (v) c.memo = v; else delete c.memo; });
    const move = d => ch(() => { const j = i + d; if (j < 0 || j >= L.length) return; L.splice(j, 0, L.splice(i, 1)[0]); if (cur(b) === i) sb[b.id] = j; logLine(`큐 줄 옮김 ${i + 1} → ${j + 1}`); });
    const sec = t => h('div', { class: 'qsec' }, h('small', null, t));
    const box = h('div', { class: 'qedit' },
      sec('언제 나가요?'),
      i === 0 ? h('div', { class: 'qnote' }, '첫 줄은 GO를 누를 때 나가요') :
        opts(Object.entries(WHENS), c.when || 'go', v => ch(() => { c.when = v; })),
      sec('무엇을 해요?'),
      opts(Object.entries(ACTS), c.act || 'play', v => ch(() => { c.act = v; if (v === 'fade') c.sec = c.sec > 1 ? c.sec : 3; else if (v === 'duck') c.sec = 0.25; else delete c.sec; })),
      c.act === 'fade' ? opts([[1, '1초'], [3, '3초'], [5, '5초'], [10, '10초']], c.sec || 3, v => ch(() => { c.sec = v; })) : '',
      c.act === 'duck' ? opts([[0.5, '1/2'], [0.25, '1/4'], [0.1, '1/10']], c.sec || 0.25, v => ch(() => { c.sec = v; })) : '',
      sec('어떤 소리?'), tgt,
      sec('기다렸다가'), stepper(c.wait || 0, 0, 60, 0.5, v => v ? v + '초 뒤' : '바로', v => { if (v) c.wait = v; else delete c.wait; save(); }),
      sec('메모 (GO 단추에 보임)'), memo,
      sec('정한 시각에 저절로 (비우면 끔)'), at,
      h('div', { class: 'qbtns' },
        h('button', { class: 'sbtn', disabled: i === 0, onclick: () => move(-1) }, '▲ 위로'),
        h('button', { class: 'sbtn', disabled: i === L.length - 1, onclick: () => move(1) }, '▼ 아래로'),
        h('button', { class: 'sbtn', onclick: () => ch(() => { const d = { ...c, id: uid() }; L.splice(i + 1, 0, d); edit = d.id; }) }, '복제'),
        h('button', { class: 'sbtn danger', onclick: () => ch(() => { L.splice(i, 1); if (cur(b) > i) sb[b.id]--; edit = null; logLine(`큐 줄 지움 ${i + 1}`); }) }, '지우기'),
        h('button', { class: 'sbtn pri', onclick: () => { edit = null; paint(); } }, '닫기')));
    box.onclick = e => e.stopPropagation();
    return box;
  }
  const HELP = [
    ['+ 담기', '를 누르고 패드를 차례로 누르면 큐가 쌓여요 (소리는 안 나요)'],
    ['GO', '(아래 단추)를 누르면 색칠된 줄("다음")이 나가요'],
    ['줄', '을 누르면 그 줄이 "다음"이 돼요 · ▲ ▼ 로도 옮겨요'],
    ['⋯', '를 누르면 언제 나갈지 · 무엇을 할지 바꿔요'],
    ['↳', ' 줄은 GO 없이 앞 줄을 따라 저절로 나가요'],
  ];
  const helpBox = () => h('div', { class: 'qhelp' }, HELP.map(([k, t]) => h('div', null, h('b', null, k), t)),
    h('div', { class: 'qdim' }, '페달·키보드: → 스페이스 = GO · ← = 이전'));
  function list(b, box) {
    const L = cues(b);
    box.replaceChildren(...L.flatMap((c, i) => rowEl(b, L, i)));
  }
  function paint(scrollEnd) {
    stage.classList.toggle('qon', on()); stage.classList.toggle('qopen', on() && open);
    paintGo(); padTags();
    if (!on()) { panel.textContent = ''; adding = false; edit = null; document.body.classList.remove('qadding'); return; }
    if (typing(panel) || typing(tabBox)) { dirty = true; return; }
    dirty = false;
    if (tabBox && tabBox.isConnected) list(board(), tabBox); else tabBox = null;
    const b = board(), L = cues(b), k = cur(b);
    document.body.classList.toggle('qadding', adding);
    const nav = h('div', { class: 'qnav' },
      h('button', { class: 'qb', 'aria-label': '처음 큐로', disabled: !L.length, onclick: () => setSb(0, '처음') }, '⤒'),
      h('button', { class: 'qb', 'aria-label': '이전 큐로', disabled: !L.length, onclick: () => step(-1) }, '▲'),
      h('button', { class: 'qb', 'aria-label': '다음 큐로', disabled: !L.length, onclick: () => step(1) }, '▼'));
    if (!open) {
      const goRows = L.map((c, i) => i).filter(i => isGo(L, i));
      panel.replaceChildren(h('button', { class: 'qtog', 'aria-label': '큐보드 펼치기', onclick: () => { open = true; paint(); } }, '‹ 큐'), nav,
        h('div', { class: 'qstrip' }, goRows.map(i => h('button', { class: 'qn' + (i === k ? ' q-sb' : '') + (i < k ? ' q-done' : ''), onclick: () => setSb(i, '줄 누름') }, String(goNo(L, i))))));
      return;
    }
    const addB = h('button', { class: 'qadd-b' + (adding ? ' on' : ''), hidden: S.lock, onclick: () => { adding = !adding; edit = null; logLine(adding ? '큐 담기 시작' : '큐 담기 끝'); paint(); } }, adding ? '✓ 다 담음' : '+ 담기');
    const box = h('div', { class: 'qlist' });
    list(b, box);
    const next = L[k];
    panel.replaceChildren(
      h('div', { class: 'qhead' },
        h('button', { class: 'qtog', 'aria-label': '큐보드 접기', onclick: () => { open = false; paint(); } }, '큐 ›'),
        h('span', null, L.length ? `GO ${goNo(L, L.length - 1)}번` : ''),
        h('button', { class: 'qb qhelp-b' + (help ? ' on' : ''), 'aria-label': '큐 사용법', onclick: () => { help = !help; paint(); } }, '?'),
        addB),
      adding ? h('div', { class: 'qaddbar' }, h('div', null, '패드를 누르면 아래에 쌓여요 (소리 안 남) · 담을 동작:'),
        opts([['play', '▶ 재생'], ['fade', '◣ 줄이며 끄기'], ['stop', '■ 끄기']], addAct, v => { addAct = v; paint(); })) : '',
      help || !L.length ? helpBox() : '',
      box,
      h('div', { class: 'qfoot' }, nav, h('div', { class: 'qnext' }, h('small', null, '다음'), h('b', null, next ? `${cueLabel(L, k)} · ${next.memo || padName(next)}` : L.length ? '끝 — ▲로 되돌리기' : '—'))));
    const target = scrollEnd ? box.lastElementChild : box.querySelector('.qrow.q-edit') || box.querySelector('.qrow.q-sb');
    if (target) target.scrollIntoView({ block: 'nearest' });
  }
  // 패드 구석: 이 패드를 쓰는 큐 번호
  function padTags() {
    padEls.forEach(el => { const t = el.querySelector('.qtag'); if (t) t.remove(); });
    if (!on()) return;
    const L = cues(), m = new Map();
    L.forEach((c, i) => { if (!S.pads[c.pad]) return; const a = m.get(c.pad) || []; const n = goNo(L, i); if (!a.includes(n)) a.push(n); m.set(c.pad, a); });
    m.forEach((ns, id) => { const el = padEls.get(id); if (el) el.append(h('div', { class: 'qtag' }, '큐' + (ns.length > 2 ? ns.slice(0, 2).join('·') + '…' : ns.join('·')))); });
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
    goB.lastChild.textContent = !L.length ? '큐 없음' : c ? `${goNo(L, k)} ${c.memo || padName(c)}` : '끝';
  }
  setInterval(() => { if (on() && (pend.size || dirty && !typing(panel) && !typing(tabBox))) paint(); }, 200);
  new MutationObserver(() => { if (on()) { edit = null; paint(); } }).observe($('tabs'), { childList: true });
  new MutationObserver(() => { if (on()) padTags(); }).observe($('grid'), { childList: true });

  // ---------- 설정 ----------
  function settingRow() {
    return row(helpLabel('큐', '켜면 오른쪽에 큐보드, 아래에 GO 단추가 생겨요. [+ 담기] → 패드를 차례로 누르면 큐가 쌓이고, GO를 누를 때마다 차례로 나가요. 줄의 ⋯로 "앞 소리가 끝나면 저절로"·"줄이며 끄기" 등을 정해요. 끄면 전부 숨고 원래대로 — 넣은 큐는 남아 있어요.'),
      sw(on(), v => {
        S.settings.cue = v; save(); logLine(`큐 ${v ? '켬' : '끔'}`);
        if (!v) { cancelAll('큐 끔'); ducked.forEach((_, id) => S.pads[id] && Engine.setVolume(id, S.pads[id].vol)); ducked.clear(); }
        paint();
      }));
  }
  // 설정 [큐] 칸: 넓은 화면에서 같은 목록 + 한꺼번에
  function tab(body) {
    const b = board(), L = cues(b);
    tabBox = h('div', { class: 'qlist full' });
    body.append(h('div', { class: 'fbox' },
      h('div', { class: 'fbox-head' }, h('b', null, helpLabel(`${b.name}의 큐`, '보드마다 큐 목록이 하나예요. 줄의 ⋯를 눌러 고쳐요. 바꾸는 즉시 적용, 아래 [취소]로 창을 열기 전으로 되돌려요.'))),
      helpBox(),
      h('div', { class: 'trow' },
        h('button', { class: 'sbtn', onclick: () => { L.forEach(c => { c.when = 'go'; }); save(); logLine('큐 모두 GO로'); paint(); } }, '모두 GO로 나가게'),
        h('button', { class: 'sbtn danger', onclick: () => { if (!L.length || !confirm(`큐 ${L.length}줄을 모두 지울까요?`)) return; L.length = 0; sb[b.id] = 0; save(); logLine('큐 모두 지움'); paint(); } }, '모두 지우기')),
      tabBox));
    list(b, tabBox);
  }

  // ---------- 내보내기·가져오기: 큐의 패드를 번호로 ----------
  function exportFix(json, srcPads, b) {
    if (!b.cues || !b.cues.length) return;
    json.board.cues = b.cues.map(c => { const { id, pad, ...r } = c; const k = srcPads.findIndex(p => p.id === pad); return { ...r, padN: pad === '*' ? '*' : k + 1 }; }).filter(c => c.padN);
  }
  function importFix(nb, newIds, json) {
    const src = json.board && json.board.cues; if (!Array.isArray(src)) return;
    nb.cues = src.map(c => { const { padN, ...r } = c; return { ...r, id: uid(), pad: padN === '*' ? '*' : newIds[padN - 1] }; }).filter(c => c.pad);
    save();
  }

  if (on()) paint();
  return { tap, go, step, settingRow, tab, exportFix, importFix, paint: () => paint() };
})();
