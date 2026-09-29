// 큐 기능 (설정 → 일반 → 큐). 꺼져 있으면 아무 일도 안 한다 — 기존 동작·화면 그대로.
// 패드 칸(값 없음 = 지금 동작): qNext 다음 패드 id('*' = 랜덤) · qWhen 'end'|'with' · qDelay 늦게 시작 초
//   qXfade 넘기기 초(이 패드가 울리면 앞 큐를 줄임) · qDuck 낮추기(0.5·0.25·0.1) · qAt 'HH:MM' 시각 예약 · qMemo 큐 메모
'use strict';
window.Cue = (() => {
  const on = () => !!S.settings.cue;
  const pend = new Map();      // id → {t0, sec, timer}
  const manual = new Set();    // 손으로(또는 넘기기로) 끈 패드 — 끝나도 '이어 재생' 안 함
  const duck = new Map();      // 낮추는 중인 패드 id → 비율
  const ducked = new Set();    // 지금 작게 만든 패드
  const goPos = {};            // 보드 id → GO 다음 순번
  let curGroup = [], prevGroup = [], lastGo = 0, depth = 0;
  const has = p => p && (p.qNext || p.qDelay > 0 || p.qXfade > 0 || p.qDuck || p.qAt || p.qMemo);
  const num = id => { const k = board().pads.indexOf(id); return k < 0 ? '··' : String(k + 1).padStart(2, '0'); };

  // ---------- 울리기 ----------
  const resolve = (p, from) => {
    if (p.qNext !== '*') return S.pads[p.qNext] ? p.qNext : null;
    const b = S.boards.find(x => x.pads.includes(from)) || board();
    const c = b.pads.filter(x => x !== from && status[x] === 'ready');
    return c.length ? c[Math.floor(Math.random() * c.length)] : null;
  };
  function fire(id, via) {
    const p = S.pads[id];
    if (!p || status[id] !== 'ready') { logLine(`큐 건너뜀 ${nm(id)} (준비 안 됨)`, 'w'); return; }
    if (p.qDelay > 0) {
      cancel(id);
      const e = { t0: performance.now(), sec: p.qDelay };
      e.timer = setTimeout(function go() {
        if (Engine.paused) { e.timer = setTimeout(go, 200); return; }   // ⏸ 중엔 기다렸다가
        pend.delete(id); paintQ(id); start(id, via);
      }, p.qDelay * 1000);
      pend.set(id, e); paintQ(id);
      logLine(`큐 ⏱ ${nm(id)} ${p.qDelay}초 뒤 (${via})`);
      return;
    }
    start(id, via);
  }
  function start(id, via) {
    const p = S.pads[id]; if (!p || depth > 20) return;
    if (p.solo) soloOthers(id);
    if (p.qXfade > 0) (via === 'with' ? prevGroup : curGroup).forEach(o => {
      if (o !== id && Engine.isPlaying(o)) { manual.add(o); Engine.stop(o, p.qXfade); paintPad(o); }
    });
    if (!Engine.play(id, playOpt(p))) return;
    if (via === 'with') curGroup.push(id); else { prevGroup = curGroup; curGroup = [id]; }
    lastId = id; p.played = true; S.lastUse = Date.now(); save(); paintPad(id);
    logLine(`큐 ▶ ${nm(id)} (${via})${p.qMemo ? ' · ' + p.qMemo : ''}`);
    if (p.qDuck) { duck.set(id, p.qDuck); applyDuck(); }
    setGo(id);
    if (p.qNext && p.qWhen === 'with') { const n = resolve(p, id); if (n && n !== id) { depth++; try { fire(n, 'with'); } finally { depth--; } } }
  }
  function cancel(id) {
    const e = pend.get(id); if (!e) return false;
    clearTimeout(e.timer); pend.delete(id); paintQ(id);
    return true;
  }
  function cancelAll(why) {
    if (!pend.size) return;
    logLine(`큐 대기 ${pend.size}개 취소 (${why})`);
    [...pend.keys()].forEach(cancel);
  }

  // 패드 누름: 큐가 할 일이면 true(원래 동작 건너뜀), 아니면 false(원래 동작 그대로)
  function tap(id) {
    if (!on() || !started || status[id] !== 'ready') return false;
    if (cancel(id)) { logLine(`큐 ⏱ 취소 ${nm(id)} (다시 누름)`); return true; }
    if (Engine.isPlaying(id)) { manual.add(id); return false; }
    const p = S.pads[id];
    if (!has(p) || !(p.qNext || p.qDelay > 0 || p.qXfade > 0 || p.qDuck)) { setGo(id); return false; }
    fire(id, 'tap');
    return true;
  }

  Engine.on('play', () => { if (duck.size) applyDuck(); });
  Engine.on('end', (id, why) => {
    const m = manual.delete(id);
    if (duck.delete(id) || ducked.has(id)) applyDuck();
    if (!on()) return;
    const p = S.pads[id];
    if (!p || !p.qNext || p.qWhen === 'with' || m) return;
    const natural = why === 'ended' || (why === 'faded' && p.loop && p.loopBy);
    if (!natural) return;
    const n = resolve(p, id);
    if (n) fire(n, 'end');
  });

  // 소리 낮추기: 낮추는 패드가 울리는 동안 다른 패드를 그 비율로
  function applyDuck() {
    const act = [...duck.keys()].filter(id => Engine.isPlaying(id));
    for (const id of [...duck.keys()]) if (!act.includes(id)) duck.delete(id);
    for (const o of Engine.playingIds().concat([...ducked])) {
      const q = S.pads[o]; if (!q) continue;
      const f = Math.min(1, ...act.filter(d => d !== o).map(d => duck.get(d)));
      if (f < 1) { Engine.setVolume(o, q.vol * f); ducked.add(o); }
      else if (ducked.delete(o)) Engine.setVolume(o, q.vol);
    }
  }

  // ---------- GO (순서대로 다음) ----------
  // 순서 = 보드 순서. 다른 패드가 '다음'으로 부르는 패드는 저절로 울리니 건너뜀
  const goList = () => {
    const ids = board().pads, called = new Set(ids.map(i => S.pads[i]).filter(p => p && p.qNext && p.qNext !== '*').map(p => p.qNext));
    return ids.filter(i => !called.has(i));
  };
  function setGo(id) {
    const L = goList(), k = L.indexOf(id);
    if (k >= 0) { goPos[board().id] = k + 1; paintGo(); }
  }
  function go() {
    if (!on() || !started) return;
    const t = performance.now(); if (t - lastGo < 350) return;   // 연타해도 한 칸씩
    lastGo = t;
    const L = goList(), k = goPos[board().id] || 0;
    if (!L.length) return toast('이 보드엔 패드가 없어요');
    if (k >= L.length) { logLine('GO → 끝'); return toast('마지막 큐까지 갔어요 · [다음] 칸을 누르면 처음으로'); }
    const id = L[k];
    goPos[board().id] = k + 1;
    logLine(`GO ${k + 1}/${L.length} ${nm(id)}`);
    const p = S.pads[id];
    if (p.qMemo) toast(`${num(id)} ${p.label} — ${p.qMemo}`, 2500);
    fire(id, 'go'); paintGo();
  }
  let goB = null;
  function paintGo() {
    const ctl = document.querySelector('.bottom .ctl');
    if (!on()) { if (goB) { goB.remove(); goB = null; } return; }
    if (!goB) {
      const nx = h('small', { class: 'qnx' });
      goB = h('button', { class: 'cbtn qgo', 'aria-label': 'GO — 다음 큐' }, h('b', null, 'GO'), nx);
      goB.addEventListener('pointerdown', e => {
        e.preventDefault(); goB.classList.add('hit'); setTimeout(() => goB && goB.classList.remove('hit'), 90);
        if (e.target === nx && (goPos[board().id] || 0) >= goList().length) { goPos[board().id] = 0; logLine('GO 처음으로'); paintGo(); return; }
        go();
      });
      ctl.prepend(goB);
    }
    const L = goList(), k = goPos[board().id] || 0, id = L[k], p = id && S.pads[id];
    goB.lastChild.textContent = !L.length ? '—' : p ? `${num(id)} ${p.qMemo || p.label}` : '끝 ↺';
  }

  // ---------- 화면: 패드 구석 표시 · 대기 ----------
  function tags(p) {
    const t = [];
    if (p.qNext) t.push((p.qWhen === 'with' ? '+' : '→') + (p.qNext === '*' ? '?' : num(p.qNext)));
    if (p.qDelay > 0) t.push('⏱' + p.qDelay);
    if (p.qXfade > 0) t.push('⤳');
    if (p.qDuck) t.push('↓');
    if (p.qAt) t.push('⏰' + p.qAt);
    return t.join(' ');
  }
  function decorate(el, p) {
    if (!on()) return;
    const t = tags(p); if (!t && !pend.has(p.id)) return;
    el.append(h('div', { class: 'qtag' }, h('span', null, t), h('b', { class: 'qcnt' })));
    paintQ(p.id);
  }
  function paintQ(id) {
    const el = padEls.get(id); if (!el) return;
    const e = pend.get(id);
    el.classList.toggle('qwait', !!e);
    let tg = el.querySelector('.qtag');
    if (e && !tg) { tg = h('div', { class: 'qtag' }, h('span'), h('b', { class: 'qcnt' })); el.append(tg); }
    if (tg) tg.lastChild.textContent = e ? Math.max(0, e.sec - (performance.now() - e.t0) / 1000).toFixed(1) : '';
    if (e) el.style.setProperty('--qw', Math.min(100, (performance.now() - e.t0) / 10 / e.sec).toFixed(1) + '%');
  }
  setInterval(() => { pend.forEach((_, id) => paintQ(id)); }, 100);

  // ---------- 시각 예약 ----------
  const firedAt = {};
  setInterval(() => {
    if (!on() || !started) return;
    const d = new Date(), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), day = d.toDateString();
    for (const id in S.pads) {
      const p = S.pads[id];
      if (p.qAt === hm && firedAt[id] !== day) { firedAt[id] = day; logLine(`큐 ⏰ ${hm} ${nm(id)}`); fire(id, 'at'); }
    }
  }, 1000);

  // ---------- 페달·키보드 = GO ----------
  document.addEventListener('keydown', e => {
    if (!on() || !started || !$('sheetWrap').hidden || e.repeat) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
    if ([' ', 'Enter', 'PageDown', 'ArrowRight', 'ArrowDown'].includes(e.key)) { e.preventDefault(); go(); }
  });

  // 전체 정지·◣ = 대기 중인 큐도 모두 취소, 울리던 건 '이어 재생' 안 함
  const allOff = why => () => { if (!on()) return; Engine.playingIds().forEach(i => manual.add(i)); cancelAll(why); };
  $('btnStop').addEventListener('pointerdown', allOff('전체정지'));
  $('btnFade').addEventListener('pointerdown', allOff('전체 페이드'));

  // ---------- 설정 ----------
  function settingRow() {
    return row(helpLabel('큐', '켜면 패드 설정에 [큐] 칸(이어 재생·늦게 시작·함께 재생·넘기기·낮추기·시각·메모)과 아래 GO 단추가 생겨요. 페달·키보드(스페이스·엔터·→·↓·PageDown)도 GO. 끄면 전부 숨고 원래대로 — 넣어 둔 큐 값은 남아 있어요.'),
      sw(on(), v => {
        S.settings.cue = v; save(); logLine(`큐 ${v ? '켬' : '끔'}`);
        if (!v) { cancelAll('큐 끔'); duck.clear(); applyDuck(); }
        paintGo(); renderGrid();
      }));
  }
  // 이어지는 고리(A→B→A)는 막는다
  const loops = (from, to) => { const seen = new Set([from]); let c = to; while (c && c !== '*' && S.pads[c]) { if (seen.has(c)) return true; seen.add(c); c = S.pads[c].qNext; } return false; };
  const set = (p, k, v, refresh) => { if (v == null || v === '' || v === 0 || v === false) delete p[k]; else p[k] = v; refresh(); paintGo(); };
  function padRows(p, refresh) {
    if (!on()) return null;
    const b = board(), box = h('div', { class: 'fbox qbox' });
    const draw = () => {
      box.textContent = '';
      const nextSel = h('select', { class: 'sel' }, h('option', { value: '' }, '없음'), h('option', { value: '*' }, '랜덤 (이 보드)'),
        b.pads.filter(i => i !== p.id).map(i => h('option', { value: i }, `${num(i)} ${S.pads[i].label}`)));
      nextSel.value = p.qNext || '';
      nextSel.onchange = () => {
        const v = nextSel.value;
        if (v && v !== '*' && loops(p.id, v)) { nextSel.value = p.qNext || ''; return toast('서로 부르는 고리가 돼서 못 넣어요'); }
        set(p, 'qNext', v, refresh); if (v && !p.qWhen) p.qWhen = 'end'; logLine(`큐 ${nm(p.id)} 다음 → ${v === '*' ? '랜덤' : v ? nm(v) : '없음'}`); draw();
      };
      const at = h('input', { type: 'time', step: 60, class: 'txt qat', value: p.qAt || '' });
      at.onchange = () => set(p, 'qAt', at.value, refresh);
      const memo = h('input', { class: 'txt', value: p.qMemo || '', maxlength: 40, placeholder: '예: 2막 암전 뒤' });
      memo.oninput = () => set(p, 'qMemo', memo.value.trim(), refresh);
      box.append(
        h('div', { class: 'fbox-head' }, h('b', null, helpLabel('큐', '이 패드가 울린 뒤 무엇을 할지. 비워 두면 보통 패드와 똑같아요.'))),
        row(helpLabel('다음', '이 패드 다음에 울릴 패드. 랜덤 = 이 보드에서 아무거나.'), nextSel),
        p.qNext ? row(helpLabel('언제', '끝나면 = 이 패드가 끝까지 울리면(손으로 끄면 안 이어짐). 동시에 = 누르는 순간 같이.'),
          seg([['end', '끝나면'], ['with', '동시에']], p.qWhen || 'end', v => set(p, 'qWhen', v, refresh))) : null,
        row(helpLabel('늦게 시작', '누르거나 불리고 나서 이만큼 기다렸다 울려요. 기다리는 중에 패드를 다시 누르면 취소.'),
          stepper(p.qDelay || 0, 0, 60, 0.5, v => v ? v + '초' : '없음', v => set(p, 'qDelay', v, refresh))),
        row(helpLabel('넘기기', '이 패드가 울릴 때 바로 앞 큐(GO·누름으로 튼 것)를 이 시간에 걸쳐 줄여 꺼요.'),
          stepper(p.qXfade || 0, 0, 10, 0.5, v => v ? v + '초' : '없음', v => set(p, 'qXfade', v, refresh))),
        row(helpLabel('낮추기', '이 패드가 울리는 동안 다른 소리를 작게. 끝나면 원래대로.'),
          seg([[0, '끔'], [0.5, '반'], [0.25, '1/4'], [0.1, '1/10']], p.qDuck || 0, v => set(p, 'qDuck', v, refresh))),
        row(helpLabel('시각', '앱이 켜져 있으면 이 시각에 저절로 울려요(하루 한 번). 지우면 끔.'), at, h('button', { class: 'rst', onclick: () => { at.value = ''; set(p, 'qAt', '', refresh); } }, '↺')),
        h('div', { class: 'row col' }, h('label', null, helpLabel('메모', 'GO를 누를 때 잠깐 보이고, GO 단추에 다음 큐로 보여요.')), memo),
      );
    };
    draw();
    return box;
  }

  // ---------- 내보내기·가져오기: '다음'을 번호로 바꿔 담았다가 새 id로 ----------
  function exportFix(jsonPads, srcPads) {
    srcPads.forEach((p, i) => {
      const j = jsonPads[i]; if (!j || !j.qNext) return;
      delete j.qNext;
      if (p.qNext === '*') j.qNext = '*';
      else { const k = srcPads.findIndex(q => q.id === p.qNext); if (k >= 0) j.qNextN = k + 1; }
    });
  }
  function importFix(newIds) {
    newIds.forEach(id => {
      const p = id && S.pads[id]; if (!p) return;
      if (p.qNextN) { const t = newIds[p.qNextN - 1]; if (t) p.qNext = t; delete p.qNextN; }
      else if (p.qNext && p.qNext !== '*' && !S.pads[p.qNext]) delete p.qNext;
    });
    save();
  }

  // 보드를 바꾸면 GO 표시도
  new MutationObserver(() => paintGo()).observe($('tabs'), { childList: true });
  if (on()) { paintGo(); renderGrid(); }
  return { tap, go, decorate, settingRow, padRows, exportFix, importFix };
})();
