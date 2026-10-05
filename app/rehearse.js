// 리허설 기록 (PLAN-리허설 ①). 큐보드 위 [● 리허설]로 켜고 끈다. 켜져 있을 때만 마이크를 쓴다.
// 마이크 소리는 녹음하지 않는다 — 0.1초마다 소리 크기(dB) 숫자만 이 기기 메모리에서 계산하고, GO 순간의 요약만 남긴다.
// 남기는 자리: 큐마다 c.rh = [{at, n, t, gap, loud, quiet, lv}] (보드의 큐 안 → 내보내기·가져오기에 저절로 담김, 값 없음 = 기록 없음)
//   at 리허설 시작 시각(ms, 한 번 리허설 = 같은 at) · n 그 리허설에서 몇 번째 GO · t 시작부터 초 · gap 앞 GO에서 +초(첫 GO는 없음)
//   loud 직전 큰 소리(박수 등)가 끝나고 몇 초(30초 안에 없으면 없음) · quiet 직전 조용했던 초 · lv 직전 10초 크기 막대(0.5초마다 '0'~'9')
// 리허설은 보드마다 최근 3번만 — 4번째를 시작하면 가장 옛것을 지운다.
'use strict';
window.Reh = (() => {
  const KEEP = 3, HZ = 10, HIST = 30 * HZ;
  let now = null;   // {b, at, t0, last, n, stream, ac, an, buf, timer, db:[], floor}

  const sessions = b => [...new Set((b.cues || []).flatMap(c => (c.rh || []).map(r => r.at)))].sort((a, z) => z - a);

  async function start() {
    if (now) return;
    if (!navigator.mediaDevices?.getUserMedia) return toast(isSecureContext ? '이 기기·브라우저는 마이크를 못 써요' : '리허설 기록은 https 주소에서만 돼요', 6000);
    const b = board();
    if (!(b.cues || []).length) return toast('큐가 없어요 — 큐를 먼저 담아요');
    const old = sessions(b);
    if (old.length >= KEEP && !await ask(`리허설 기록은 ${KEEP}번까지 남아요. 가장 옛것(${fmtAt(old[old.length - 1])})을 지우고 시작할까요?`, { ok: '시작' })) return;
    const AS = navigator.audioSession;
    try { if (AS) AS.type = 'play-and-record'; } catch {}
    let stream;
    // 박수가 깎이지 않게 잡음 억제는 끄고, 이 앱이 내는 소리는 빼도록 에코 제거는 켬
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: false, echoCancellation: true, autoGainControl: false } }); }
    catch (e) {
      try { if (AS) AS.type = 'playback'; } catch {}
      logLine(`리허설 마이크 못 씀: ${e.name} ${e.message}`, 'w');
      return toast({ NotAllowedError: '마이크 허용이 필요해요 (설정 → 사파리 → 마이크)', NotFoundError: '마이크를 찾지 못했어요', NotReadableError: '다른 앱이 마이크를 쓰고 있어요' }[e.name] || `마이크를 켤 수 없어요 (${e.name})`, 6000);
    }
    old.slice(KEEP - 1).forEach(at => b.cues.forEach(c => { if (c.rh) { c.rh = c.rh.filter(r => r.at !== at); if (!c.rh.length) delete c.rh; } }));
    const ac = new (window.AudioContext || window.webkitAudioContext)(), an = ac.createAnalyser(); an.fftSize = 2048;
    ac.createMediaStreamSource(stream).connect(an);
    now = { b, at: Date.now(), t0: performance.now(), last: null, n: 0, stream, ac, an, buf: new Float32Array(an.fftSize), db: [] };
    now.timer = setInterval(tick, 1000 / HZ);
    save(); logLine('리허설 기록 시작 (마이크: 소리 크기만, 녹음 안 함)');
    toast('● 리허설 기록 중 — GO를 누르면 그 순간이 기록돼요', 3000);
    Cue.paint();
  }
  function tick() {
    now.an.getFloatTimeDomainData(now.buf);
    let s = 0; for (const x of now.buf) s += x * x;
    now.db.push(Math.max(-90, 10 * Math.log10(s / now.buf.length || 1e-12)));
    if (now.db.length > HIST) now.db.shift();
  }
  // 바닥(평소 조용할 때) = 지난 30초의 아래 10% · 큰 소리 = 바닥 +18dB 넘음 · 조용 = 바닥 +6dB 아래
  function sum() {
    const d = now.db; if (d.length < HZ) return {};
    const floor = [...d].sort((a, z) => a - z)[Math.floor(d.length * 0.1)];
    const big = d.map(x => x > floor + 18);
    let i = d.length - 1, quiet = 0; while (i >= 0 && d[i] < floor + 6) { quiet++; i--; }
    // 큰 소리 뭉치: 0.3초 넘게 이어진 것만(물건 떨어지는 '탁'은 뺌), 끝난 지 몇 초
    let loud = null;
    for (let j = d.length - 1, run = 0; j >= -1; j--) {
      if (j >= 0 && big[j]) { run++; continue; }
      if (run >= 3) { loud = (d.length - 1 - (j + run)) / HZ; break; }
      run = 0;
    }
    const lv = []; for (let k = Math.max(0, d.length - 10 * HZ); k < d.length; k += HZ / 2) lv.push(Math.max(0, Math.min(9, Math.round((Math.max(...d.slice(k, k + HZ / 2)) - floor) / 4))));
    return { loud, quiet: quiet / HZ, lv: lv.join('') };
  }
  // Cue.go가 큐를 내보낼 때 부름
  function mark(b, c, label) {
    if (!now || b !== now.b) return;
    const t = (performance.now() - now.t0) / 1000, r = { at: now.at, n: ++now.n, t: +t.toFixed(1) };
    if (now.last != null) r.gap = +(t - now.last).toFixed(1);
    now.last = t;
    const s = sum();
    if (s.loud != null) r.loud = s.loud;
    if (s.quiet != null) r.quiet = s.quiet;
    if (s.lv) r.lv = s.lv;
    (c.rh || (c.rh = [])).push(r);
    save();
    logLine(`리허설 ${label}: ${r.gap != null ? '+' + r.gap + '초' : '첫 GO'}${r.loud != null ? ' · 큰 소리 ' + r.loud + '초 전' : ''}${r.quiet ? ' · 조용 ' + r.quiet + '초' : ''}`);
  }
  function stop(show = true) {
    if (!now) return;
    const o = now; now = null;
    clearInterval(o.timer); o.stream.getTracks().forEach(t => t.stop()); o.ac.close().catch(() => {});
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
    logLine(`리허설 기록 끝 · GO ${o.n}번`);
    Cue.paint();
    if (show && o.n) report(o.b, o.at);
  }

  const fmtAt = at => { const d = new Date(at); return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const BARS = '▁▂▃▄▅▆▇██▉';
  function report(b = board(), at) {
    const L = b.cues || [], all = sessions(b);
    if (!all.length) return toast('리허설 기록이 없어요 — 큐보드 위 [● 리허설]로 기록해요');
    let sel = at || all[0];
    const body = h('div', { class: 'rh-body' });
    const draw = () => {
      const rows = L.map((c, i) => [c, i, (c.rh || []).find(r => r.at === sel)]).filter(x => x[2]).sort((a, z) => a[2].n - z[2].n);
      body.replaceChildren(
        all.length > 1 ? h('div', { class: 'rh-tabs' }, all.map(a => h('button', { class: 'sbtn' + (a === sel ? ' pri' : ''), onclick: () => { sel = a; draw(); } }, fmtAt(a)))) : h('div', { class: 'qdim' }, fmtAt(sel)),
        h('table', { class: 'rh-t' },
          h('tr', null, h('th', null, '큐'), h('th', null, '앞 큐에서'), h('th', null, '직전 소리'), h('th', null, '직전 10초')),
          rows.map(([c, i, r]) => h('tr', null,
            h('td', null, Cue.label(L, i)),
            h('td', null, r.gap != null ? `+${fmtS(r.gap)}` : '첫 GO'),
            h('td', null, [r.loud != null ? `큰 소리 끝나고 ${fmtS(r.loud)}` : '', r.quiet >= 1 ? `조용 ${fmtS(r.quiet)}` : ''].filter(Boolean).join(' · ') || '—'),
            h('td', { class: 'rh-lv' }, (r.lv || '').split('').map(x => BARS[+x]).join(''))))),
        h('div', { class: 'qdim' }, `GO ${rows.length}번 · 큰 소리 = 박수·함성처럼 0.3초 넘게 이어진 큰 소리 · 녹음은 안 했어요(소리 크기 숫자만)`));
    };
    draw();
    const w = h('div', { class: 'ask-wrap', onclick: e => { if (e.target === w) w.remove(); } },
      h('div', { class: 'ask rh', role: 'dialog', 'aria-modal': 'true' }, h('b', null, `${b.name} 리허설 보고`), body,
        h('div', { class: 'ask-btns' }, h('button', { class: 'sbtn pri', onclick: () => w.remove() }, '닫기'))));
    document.body.append(w);
  }
  const fmtS = s => s >= 60 ? `${Math.floor(s / 60)}분 ${Math.round(s % 60)}초` : `${s}초`;

  return { start, stop, mark, report, on: () => !!now, has: b => sessions(b).length > 0 };
})();
