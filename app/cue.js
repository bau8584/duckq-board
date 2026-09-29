// 큐보드 (설정 → 일반 → 큐). 꺼져 있으면 아무 일도 안 한다 — 기존 동작·화면 그대로.
// 보드마다 큐 목록 하나: board.cues = [{id, pad, act, sec, when, wait, memo, at}] (값 없음 = 큐 없음)
//   pad: 패드 id | '*'(랜덤) · act: play|stop|fade|duck|restore · sec: 페이드 초 / 낮추기 비율
//   when: go(GO로) | end(앞 큐 소리가 끝나면) | with(앞 큐와 같이) · wait: 기다림 초 · at: 'HH:MM' 시각에 이 큐부터
'use strict';
window.Cue = (() => {
  const on = () => !!S.settings.cue;
  const cues = (b = board()) => b.cues || (b.cues = []);
  const ACT = { play: '재생', stop: '끄기', fade: '페이드', duck: '낮추기', restore: '원래 크기' };
  const WHEN = { go: 'GO', end: '끝나면', with: '같이' };
  const ACTS = [['play', 0, '재생'], ['stop', 0, '끄기'], ['fade', 1, '페이드 1초'], ['fade', 3, '페이드 3초'], ['fade', 5, '페이드 5초'], ['fade', 10, '페이드 10초'],
    ['duck', 0.5, '낮추기 1/2'], ['duck', 0.25, '낮추기 1/4'], ['duck', 0.1, '낮추기 1/10'], ['restore', 0, '원래 크기']];
  const actTxt = c => c.act === 'fade' ? `페이드 ${c.sec || 3}초` : c.act === 'duck' ? `낮추기 1/${Math.round(1 / (c.sec || 0.25))}` : ACT[c.act] || '재생';
  const padName = c => c.pad === '*' ? '랜덤' : S.pads[c.pad] ? S.pads[c.pad].label : '(지운 패드)';

  // ---------- 실행 ----------
  const sb = {};               // 보드 id → 대기 줄 번호
  const pend = new Map();      // 큐 id → {t0, sec, timer, pad}
  const waitEnd = new Map();   // 패드 id → [다음 큐 번호…] (그 소리가 끝나면)
  const manual = new Set();    // 손으로 끈 패드(끝나면 이음 안 함)
  const ducked = new Map();    // 패드 id → 비율
  const running = new Set();   // 방금 나간 큐 id (목록에 굵게)
  let adding = false, lastGo = 0, open = true, expand = null, menu = null;

  function run(b, i) {
    const L = cues(b), c = L[i]; if (!c) return;
    const act = () => {
      pend.delete(c.id);
      let pid = c.pad;
      if (pid === '*') { const r = b.pads.filter(x => status[x] === 'ready'); pid = r[Math.floor(Math.random() * r.length)]; }
      const p = S.pads[pid];
      if (!p) { logLine(`큐 ${i + 1} 건너뜀 (패드 없음)`, 'w'); return next(b, i, null); }
      running.add(c.id); setTimeout(() => { running.delete(c.id); paint(); }, 1500);
      logLine(`큐 ${i + 1} ${actTxt(c)} ${nm(pid)}${c.memo ? ' · ' + c.memo : ''}`);
      if (c.act === 'stop' || c.act === 'fade') { if (Engine.isPlaying(pid)) { manual.add(pid); Engine.stop(pid, c.act === 'fade' ? (c.sec || 3) : 0); } }
      else if (c.act === 'duck') { if (S.pads[pid]) { ducked.set(pid, c.sec || 0.25); Engine.setVolume(pid, p.vol * (c.sec || 0.25)); } }
      else if (c.act === 'restore') { if (ducked.delete(pid)) Engine.setVolume(pid, p.vol); }
      else if (status[pid] === 'ready') {
        if (p.solo) soloOthers(pid);
        if (Engine.play(pid, playOpt(p))) { lastId = pid; p.played = true; S.lastUse = Date.now(); save(); }
      }
      paintPad(pid); paint();
      next(b, i, pid);
    };
    if (c.wait > 0) {
      const e = { t0: performance.now(), sec: c.wait, pad: c.pad };
      e.timer = setTimeout(function go() { if (Engine.paused) { e.timer = setTimeout(go, 200); return; } act(); }, c.wait * 1000);
      pend.set(c.id, e); paint();
    } else act();
  }
  // 이 큐 다음 줄: 같이 = 바로, 끝나면 = 이 큐의 소리가 끝날 때(재생 아니면 바로·페이드면 그 시간 뒤)
  function next(b, i, pid) {
    const c = cues(b)[i], n = cues(b)[i + 1]; if (!n || n.when === 'go' || !n.when) return;
    if (n.when === 'with') return run(b, i + 1);
    if (c.act === 'play' && pid && Engine.isPlaying(pid)) { const a = waitEnd.get(pid) || []; a.push([b, i + 1]); waitEnd.set(pid, a); }
    else if (c.act === 'fade') setTimeout(() => run(b, i + 1), (c.sec || 3) * 1000);
    else run(b, i + 1);
  }
  Engine.on('end', (id, why) => {
    const m = manual.delete(id);
    if (ducked.delete(id)) {}
    const w = waitEnd.get(id); if (!w) return;
    waitEnd.delete(id);
    if (!on() || m || !(why === 'ended' || why === 'faded')) return;
    w.forEach(([b, k]) => run(b, k));
  });
  function go() {
    if (!on() || !started) return;
    const t = performance.now(); if (t - lastGo < 350) return;   // 연타해도 한 칸씩
    lastGo = t;
    const b = board(), L = cues(b), k = sb[b.id] || 0;
    if (!L.length) return toast('큐보드가 비어 있어요 — [+ 담기]로 넣어요');
    if (k >= L.length) { logLine('GO → 끝'); return toast('마지막 큐까지 갔어요 · 번호를 누르면 거기부터'); }
    logLine(`GO 큐 ${k + 1}/${L.length}`);
    // 다음 대기 = 이 줄 뒤의 첫 GO 줄
    let j = k + 1; while (j < L.length && L[j].when && L[j].when !== 'go') j++;
    sb[b.id] = j;
    run(b, k); paint();
  }
  function cancelAll(why) {
    if (!pend.size && !waitEnd.size) return;
    logLine(`큐 대기 ${pend.size + waitEnd.size}개 취소 (${why})`);
    pend.forEach(e => clearTimeout(e.timer)); pend.clear(); waitEnd.clear(); paint();
  }
  const allOff = why => () => { if (!on()) return; Engine.playingIds().forEach(i => manual.add(i)); ducked.clear(); cancelAll(why); };
  $('btnStop').addEventListener('pointerdown', allOff('전체정지'));
  $('btnFade').addEventListener('pointerdown', allOff('전체 페이드'));

  // 패드 누름: 담는 중이면 큐로 넣고(소리 안 냄) true
  function tap(id) {
    if (!on()) return false;
    if (Engine.isPlaying(id)) manual.add(id);
    if (!adding || S.lock) return false;
    const L = cues(); L.push({ id: uid(), pad: id, act: 'play', when: 'go' });
    save(); logLine(`큐 담음 ${L.length} ${nm(id)}`); paint(true);
    const el = padEls.get(id); if (el) { el.classList.add('qadd'); setTimeout(() => el.classList.remove('qadd'), 250); }
    return true;
  }

  // ---------- 시각 ----------
  const firedAt = {};
  setInterval(() => {
    if (!on() || !started) return;
    const d = new Date(), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'), day = d.toDateString();
    S.boards.forEach(b => (b.cues || []).forEach((c, i) => { if (c.at === hm && firedAt[c.id] !== day) { firedAt[c.id] = day; logLine(`큐 ⏰ ${hm} 큐 ${i + 1}`); run(b, i); } }));
  }, 1000);

  // ---------- 페달·키보드 = GO ----------
  document.addEventListener('keydown', e => {
    if (!on() || !started || !$('sheetWrap').hidden || e.repeat) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
    if ([' ', 'Enter', 'PageDown', 'ArrowRight', 'ArrowDown'].includes(e.key)) { e.preventDefault(); go(); }
  });

  // ---------- 큐보드 화면 (오른쪽, 펼침/접힘) ----------
  const panel = h('div', { class: 'qpanel' });
  const stage = document.querySelector('.stage');
  stage.insertBefore(panel, stage.querySelector('.side'));
  let goB = null;
  function rowEl(b, c, i, full) {
    const L = cues(b), lock = S.lock && !full;
    const cls = 'qrow' + (i === (sb[b.id] || 0) ? ' sb' : '') + (running.has(c.id) ? ' run' : '') + (pend.has(c.id) ? ' wait' : '') + (expand === c.id || full ? ' open' : '');
    const numB = h('button', { class: 'qn', 'aria-label': `큐 ${i + 1} 대기로` }, String(i + 1));
    numB.onclick = () => { sb[b.id] = i; logLine(`큐 대기 → ${i + 1}`); rerender(); };
    if (!lock) dragH(numB, b, i);
    const whenB = h('button', { class: 'qc', disabled: lock || i === 0 && false }, WHEN[c.when || 'go']);
    whenB.onclick = () => { c.when = { go: 'end', end: 'with', with: 'go' }[c.when || 'go']; save(); rerender(); };
    const actB = h('button', { class: 'qc a', disabled: lock }, actTxt(c));
    actB.onclick = () => { menu = menu === c.id ? null : c.id; expand = c.id; rerender(); };
    const e = pend.get(c.id);
    const waitT = e ? `⏱${Math.max(0, e.sec - (performance.now() - e.t0) / 1000).toFixed(1)}` : c.wait > 0 ? `⏱${c.wait}` : '';
    const name = h('span', { class: 'qname' }, padName(c));
    name.onclick = () => { if (lock) { sb[b.id] = i; rerender(); return; } expand = expand === c.id ? null : c.id; menu = null; rerender(); };
    const r = h('div', { class: cls, 'data-i': i }, numB, whenB, h('span', { class: 'qmid' }, name, actB), h('span', { class: 'qw' }, waitT, c.at ? ' ⏰' : ''));
    if (!(expand === c.id || full) || lock) return r;
    const box = h('div', { class: 'qmore' });
    if (menu === c.id || full) box.append(h('div', { class: 'qacts' }, ACTS.map(([a, s, t]) => h('button', { class: 'qc' + (c.act === a && (!s || c.sec === s) ? ' on' : ''), onclick: () => {
      c.act = a; if (s) c.sec = s; else delete c.sec; menu = null; save(); rerender();
    } }, t))));
    const tgt = h('select', { class: 'sel' }, h('option', { value: '*' }, '랜덤 (이 보드)'), b.pads.map(x => h('option', { value: x }, `${String(b.pads.indexOf(x) + 1).padStart(2, '0')} ${S.pads[x].label}`)));
    tgt.value = c.pad; tgt.onchange = () => { c.pad = tgt.value; save(); rerender(); };
    const at = h('input', { type: 'time', step: 60, class: 'txt qat', value: c.at || '' });
    at.onchange = () => { if (at.value) c.at = at.value; else delete c.at; save(); rerender(); };
    const memo = h('input', { class: 'txt', value: c.memo || '', maxlength: 40, placeholder: '메모 (예: 2막 암전 뒤)' });
    memo.onchange = () => { const v = memo.value.trim(); if (v) c.memo = v; else delete c.memo; save(); rerender(); };
    box.append(
      h('div', { class: 'qline' }, h('small', null, '소리'), tgt),
      h('div', { class: 'qline' }, h('small', null, '기다림'), stepper(c.wait || 0, 0, 60, 0.5, v => v ? v + '초' : '없음', v => { if (v) c.wait = v; else delete c.wait; save(); })),
      h('div', { class: 'qline' }, h('small', null, '시각'), at),
      h('div', { class: 'qline' }, memo),
      h('div', { class: 'qline' }, h('button', { class: 'sbtn', onclick: () => { L.splice(i + 1, 0, { ...c, id: uid() }); save(); rerender(); } }, '복제'),
        h('button', { class: 'sbtn danger', onclick: () => { L.splice(i, 1); if ((sb[b.id] || 0) > i) sb[b.id]--; expand = null; save(); logLine(`큐 ${i + 1} 지움`); rerender(); } }, '지우기')));
    return h('div', { class: 'qwrap' }, r, box);
  }
  // 번호를 꾹(0.25초) 누른 채 끌면 순서 바꾸기
  function dragH(el, b, i) {
    let tm = 0, d = null;
    el.addEventListener('pointerdown', e => { tm = setTimeout(() => { d = { y: e.clientY }; el.setPointerCapture(e.pointerId); el.closest('.qrow').classList.add('lift'); }, 250); });
    el.addEventListener('pointermove', e => { if (!d) return; d.y = e.clientY; });
    const up = e => {
      clearTimeout(tm); if (!d) return;
      const hit = [...panel.querySelectorAll('.qrow')].find(r => { const x = r.getBoundingClientRect(); return d.y >= x.top && d.y <= x.bottom; });
      d = null; if (!hit) return rerender();
      const to = +hit.dataset.i, L = cues(b); if (to === i) return rerender();
      L.splice(to, 0, L.splice(i, 1)[0]); save(); logLine(`큐 ${i + 1} → ${to + 1}`); rerender();
      el.onclick = null; setTimeout(() => { el.onclick = () => { sb[b.id] = i; rerender(); }; });
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  function paint(scrollEnd) {
    stage.classList.toggle('qon', on()); stage.classList.toggle('qopen', on() && open);
    paintGo(); padTags();
    if (!on()) { panel.textContent = ''; adding = false; document.body.classList.remove('qadding'); return; }
    const b = board(), L = cues(b);
    document.body.classList.toggle('qadding', adding);
    if (!open) {
      panel.replaceChildren(h('button', { class: 'qtog', 'aria-label': '큐보드 펼치기', onclick: () => { open = true; paint(); } }, '‹ 큐'),
        h('div', { class: 'qstrip' }, L.map((c, i) => h('button', { class: 'qn' + (i === (sb[b.id] || 0) ? ' sb' : '') + (running.has(c.id) ? ' run' : '') + (pend.has(c.id) ? ' wait' : ''), onclick: () => { sb[b.id] = i; paint(); } }, String(i + 1)))));
      return;
    }
    const addB = h('button', { class: 'qadd-b' + (adding ? ' on' : ''), disabled: S.lock, onclick: () => { adding = !adding; logLine(adding ? '큐 담기 시작' : '큐 담기 끝'); paint(); } }, adding ? '✓ 담기 끝' : '+ 담기');
    const list = h('div', { class: 'qlist' }, L.map((c, i) => rowEl(b, c, i)),
      !L.length ? h('div', { class: 'qempty' }, '[+ 담기]를 누르고 패드를 순서대로 누르면 큐가 쌓여요') : '');
    panel.replaceChildren(
      h('div', { class: 'qhead' }, h('button', { class: 'qtog', 'aria-label': '큐보드 접기', onclick: () => { open = false; paint(); } }, '큐 ›'), h('span', null, `${L.length}개`), addB),
      adding ? h('div', { class: 'qhint' }, '패드를 누르면 여기 쌓여요 (소리 안 남)') : '',
      list);
    if (scrollEnd) list.scrollTop = list.scrollHeight;
    else { const s = list.querySelector('.qrow.sb'); if (s) s.scrollIntoView({ block: 'nearest' }); }
  }
  // 패드 구석: 이 패드를 쓰는 큐 번호 (Q1·Q4)
  function padTags() {
    padEls.forEach(el => { const t = el.querySelector('.qtag'); if (t) t.remove(); });
    if (!on()) return;
    const L = cues(), m = new Map();
    L.forEach((c, i) => { if (S.pads[c.pad]) (m.get(c.pad) || m.set(c.pad, []).get(c.pad)).push(i + 1); });
    m.forEach((ns, id) => { const el = padEls.get(id); if (el) el.append(h('div', { class: 'qtag' }, 'Q' + (ns.length > 3 ? ns.slice(0, 3).join('·') + '…' : ns.join('·')))); });
  }
  function paintGo() {
    const ctl = document.querySelector('.bottom .ctl');
    if (!on()) { if (goB) { goB.remove(); goB = null; } return; }
    if (!goB) {
      goB = h('button', { class: 'cbtn qgo', 'aria-label': 'GO — 다음 큐' }, h('b', null, 'GO'), h('small'));
      goB.addEventListener('pointerdown', e => { e.preventDefault(); goB.classList.add('hit'); setTimeout(() => goB && goB.classList.remove('hit'), 90); go(); });
      ctl.prepend(goB);
    }
    const b = board(), L = cues(b), k = sb[b.id] || 0, c = L[k];
    goB.lastChild.textContent = !L.length ? '—' : c ? `${k + 1} ${c.memo || padName(c)}` : '끝';
  }
  setInterval(() => { if (on() && pend.size) paint(); }, 200);
  new MutationObserver(() => { if (on()) paint(); }).observe($('tabs'), { childList: true });
  new MutationObserver(() => { if (on()) padTags(); }).observe($('grid'), { childList: true });

  // ---------- 설정 ----------
  function settingRow() {
    return row(helpLabel('큐', '켜면 오른쪽에 큐보드와 아래 GO 단추가 생겨요. [+ 담기] → 패드를 순서대로 누르면 큐가 쌓이고, 줄의 칩을 눌러 이음(GO·끝나면·같이)과 동작(재생·끄기·페이드·낮추기)을 바꿔요. 페달·키보드(스페이스·엔터·→·↓)도 GO. 끄면 전부 숨고 원래대로 — 넣은 큐는 남아 있어요.'),
      sw(on(), v => {
        S.settings.cue = v; save(); logLine(`큐 ${v ? '켬' : '끔'}`);
        if (!v) { cancelAll('큐 끔'); ducked.forEach((_, id) => S.pads[id] && Engine.setVolume(id, S.pads[id].vol)); ducked.clear(); }
        paint();
      }));
  }
  // 설정 [큐] 칸: 모든 줄을 펼친 채로 한꺼번에 손보기
  function tab(body) {
    const b = board(), L = cues(b);
    const box = h('div', { class: 'qlist full' });
    const draw = () => { box.replaceChildren(...L.map((c, i) => rowEl(b, c, i, true)), !L.length ? h('div', { class: 'qempty' }, '큐가 없어요 — 큐보드의 [+ 담기]로 넣어요') : ''); };
    body.append(h('div', { class: 'fbox' },
      h('div', { class: 'fbox-head' }, h('b', null, helpLabel(`${b.name}의 큐 ${L.length}개`, '보드마다 큐 목록이 하나예요. 여기선 모든 줄이 펼쳐져 있어요. 바꾸는 즉시 적용, [취소]로 되돌림.'))),
      h('div', { class: 'trow' },
        h('button', { class: 'sbtn', disabled: !L.length, onclick: () => { L.forEach(c => { c.when = 'go'; }); save(); draw(); paint(); } }, '모두 GO로'),
        h('button', { class: 'sbtn danger', disabled: !L.length, onclick: () => { if (!confirm(`큐 ${L.length}개를 모두 지울까요?`)) return; L.length = 0; sb[b.id] = 0; save(); draw(); paint(); } }, '모두 지우기')),
      box));
    draw();
    tabDraw = () => { if (box.isConnected) draw(); else tabDraw = null; };
  }
  let tabDraw = null;
  function rerender() { paint(); if (tabDraw) tabDraw(); }

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
  return { tap, go, settingRow, tab, exportFix, importFix, paint: rerender };
})();
