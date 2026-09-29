// DuckQ 재생 엔진 — 화면과 분리된 파일. 화면(app.js)은 Engine.* 만 부른다.
// 구조는 test/engine.html 0.4.7 그대로 (검증 결과가 바뀌면 이 파일만 갈아 끼운다):
//  · 짧은 곡(효과음) = 통째로 풀어 메모리(AudioBuffer) → 누르면 바로
//  · 긴 곡 = D(WebCodecs로 조금씩 풀어 1초 조각을 이어 붙임). D가 못 푸는 형식만 <audio>(A)
//  · 소리길: 조각/소스 → 페이드(재생마다) → 볼륨(패드마다) → MASTER → 스피커
//  · 홈에 다녀오면 소리 출구가 죽어 있을 수 있음 → 멈춰 있던 곡은 멈춤 표시, 다음 탭에서 출구를 새로 만든다(T8)
//  · 새 창이 열리면 옛 창은 소리를 모두 끈다(T9)
'use strict';
const Engine = (() => {
  const SFX_MAX_SEC = 30;     // 이 이하 → 메모리 적재, 초과 → D (PLAN-stage1 §3 후보 A: 2~3분으로 올릴지 미정)
  const EDGE = 0.005;         // 페이드 없음이어도 5ms로 올리고 내림(딸깍 방지)
  let ctx = null, master = null, masterVol = 1;
  let unlocked = false, paused = false, needRebuild = false, ousted = false;
  let loadedBytes = 0;
  const tracks = new Map();   // id → {id, blob, size, dur, kind, volume, loop, vol(GainNode), buffer?, d?, head?, el?, node?, v(재생 중)?}
  const ls = {};
  const emit = (ev, ...a) => (ls[ev] || []).forEach(f => { try { f(...a); } catch (e) { console.error(e); } });
  const log = (msg, lv) => emit('log', msg, lv || 'i');

  // ---------- 소리 출구 ----------
  function makeCtx() {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    master = ctx.createGain(); master.gain.value = masterVol; master.connect(ctx.destination);
    ctx.onstatechange = () => {
      emit('ctx', ctx.state);
      // 전화·시리 등으로 끊기면 알아서 다시 켠다. 일부러 멈춘(⏸) 동안은 두기.
      if (unlocked && !paused && !ousted && ctx.state !== 'running' && ctx.state !== 'closed') {
        ctx.resume().then(() => log('소리 출구 자동 복귀'), e => log('자동 복귀 실패: ' + e.message, 'w'));
      }
    };
  }
  function ensure() { if (!ctx) makeCtx(); return ctx; }
  const silent = () => { const b = ctx.createBuffer(1, 1, ctx.sampleRate), z = ctx.createBufferSource(); z.buffer = b; z.connect(ctx.destination); z.start(); };

  // 첫 손 탭(클릭) 안에서 부른다 — iOS는 이때만 소리를 열어 준다
  function unlock() {
    ensure(); unlocked = true;
    const p = ctx.resume(); silent(); claimSole();
    log(`소리 출구 열림 sr=${ctx.sampleRate}`);
    return p;
  }

  function rebuild() {
    needRebuild = false; paused = false;
    const s = performance.now();
    tracks.forEach(tr => { if (tr.v) end(tr, 'rebuild'); dropEl(tr); });
    const old = ctx; old.onstatechange = null; try { old.close(); } catch {}
    makeCtx(); ctx.resume(); silent();
    tracks.forEach(wire);
    log(`소리 출구 새로 만듦 (${(performance.now() - s).toFixed(0)}ms)`);
    emit('rebuild');
  }

  // ---------- 불러오기 ----------
  function probeDuration(blob) {
    return new Promise(res => {
      const a = new Audio(), u = URL.createObjectURL(blob);
      const done = d => { URL.revokeObjectURL(u); a.removeAttribute('src'); a.load(); res(d); };
      a.preload = 'metadata';
      a.onloadedmetadata = () => done(isFinite(a.duration) ? a.duration : 9999);
      a.onerror = () => done(-1);
      a.src = u;
    });
  }

  async function load(id, blob, opt = {}) {
    ensure();
    const had = tracks.get(id); if (had) return info(had);
    const tr = { id, blob, size: blob.size, dur: opt.dur || 0, volume: opt.volume ?? 1, loop: !!opt.loop, v: null, bytes: 0,
      start: opt.start || 0, end: opt.end || 0, pan: opt.pan || 0 };
    tracks.set(id, tr);
    wire(tr);
    try {
      if (!(tr.dur > 0)) tr.dur = await probeDuration(blob);
      if (tr.dur < 0) throw new Error('재생할 수 없는 형식');
      tr.kind = tr.dur <= SFX_MAX_SEC ? 'sfx' : 'long';
      if (tr.kind === 'sfx') {
        const buf = await ctx.decodeAudioData(await blob.arrayBuffer());
        if (tracks.get(id) !== tr) return null;
        tr.buffer = buf; tr.dur = buf.duration;
        tr.bytes = buf.length * buf.numberOfChannels * 4; loadedBytes += tr.bytes;
      } else {
        try { tr.d = await probeD(tr); } catch (e) { tr.d = null; log(`D 살펴보기 실패: ${e.message}`, 'w'); }
        if (tracks.get(id) !== tr) return null;
      }
    } catch (e) {
      if (tracks.get(id) === tr) { tracks.delete(id); try { tr.vol.disconnect(); } catch {} }
      throw e;
    }
    return info(tr);
  }
  const info = tr => ({ kind: tr.kind, dur: tr.dur, mode: tr.kind === 'sfx' ? '메모리' : tr.d ? 'D ' + tr.d.fmt : 'A' });

  // 패드마다: 볼륨 → 팬(좌우) → MASTER
  function wire(tr) {
    tr.vol = ctx.createGain(); tr.vol.gain.value = tr.volume;
    tr.pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (tr.pn) { tr.pn.pan.value = tr.pan; tr.vol.connect(tr.pn); tr.pn.connect(master); } else tr.vol.connect(master);
  }
  // 트림: 파일은 그대로 두고 틀 구간만 정한다. end 0 = 파일 끝까지.
  function seg(tr) {
    const D = tr.dur > 0 ? tr.dur : 0;
    const s = Math.min(Math.max(0, tr.start || 0), Math.max(0, D - 0.05));
    const e = tr.end > s ? Math.min(tr.end, D || tr.end) : D;
    return { s, e, L: Math.max(0.05, e - s), cut: tr.end > s && tr.end < D - 0.01 };
  }

  function unload(id) {
    const tr = tracks.get(id); if (!tr) return;
    if (tr.v) end(tr, 'unload');
    dropEl(tr); try { tr.vol.disconnect(); if (tr.pn) tr.pn.disconnect(); } catch {}
    loadedBytes -= tr.bytes; tracks.delete(id);
  }

  // ---------- 재생 ----------
  // A(<audio>)는 D가 못 푸는 형식에만, 누를 때 처음 만든다. D 곡 옆에 놀고 있는 <audio>가 있으면 소리가 튄다(3회차).
  function ensureEl(tr) {
    if (tr.el) return tr.el;
    tr.url = URL.createObjectURL(tr.blob);
    const el = new Audio(); el.preload = 'auto'; el.src = tr.url;
    el.addEventListener('ended', () => { if (tr.el === el && tr.v && tr.v.el === el) aEdge(tr); });
    el.addEventListener('error', () => log(`<audio> 오류 code=${el.error && el.error.code}`, 'e'));
    tr.el = el; tr.node = ctx.createMediaElementSource(el);
    return el;
  }
  function dropEl(tr) {
    if (!tr.el) return;
    const el = tr.el; tr.el = null;
    el.pause(); el.removeAttribute('src'); el.load();
    try { tr.node.disconnect(); } catch {}
    tr.node = null; URL.revokeObjectURL(tr.url);
  }

  // A: 구간 끝에 닿으면 반복이면 시작점으로, 아니면 끝
  function aEdge(tr) {
    const v = tr.v; if (!v || !v.el) return;
    if (tr.loop) { v.el.currentTime = seg(tr).s; v.el.play().catch(() => {}); } else end(tr, 'ended');
  }

  // opt.fadeIn: 페이드인 초 · opt.from: 구간 안에서 몇 초부터 (미리 듣기용)
  function play(id, opt = {}) {
    const tr = tracks.get(id); if (!tr || !tr.kind || ousted) return false;
    if (needRebuild) rebuild();
    if (paused) resumeAll();
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    if (tr.v) end(tr, 'restart');
    const S = seg(tr), from = Math.min(Math.max(0, opt.from || 0), S.L - 0.05);
    const rise = Math.max(EDGE, opt.fadeIn || 0), now = ctx.currentTime;
    const v = { g: ctx.createGain(), fading: false, rise, seg: S };
    v.g.gain.value = 0; v.g.connect(tr.vol); tr.v = v;
    if (tr.kind === 'sfx') {
      const src = ctx.createBufferSource(); src.buffer = tr.buffer; src.connect(v.g);
      v.g.gain.setValueAtTime(0, now); v.g.gain.linearRampToValueAtTime(1, now + rise);
      src.onended = () => { if (tr.v === v) end(tr, 'ended'); };
      if (tr.loop) { src.loop = true; src.loopStart = S.s; src.loopEnd = S.e; src.start(now, S.s + from); }
      else src.start(now, S.s + from, S.L - from);
      v.src = src; v.t0 = now - from;
    } else if (tr.d) {
      v.ds = new DStream(tr, v, from);
    } else {
      const el = ensureEl(tr); el.loop = false;
      try { tr.node.disconnect(); } catch {}
      tr.node.connect(v.g); v.el = el;
      el.currentTime = S.s + from;
      v.g.gain.setValueAtTime(0, now); v.g.gain.linearRampToValueAtTime(1, now + rise);
      el.play().catch(e => { log(`play() 거부: ${e.message}`, 'e'); if (tr.v === v) end(tr, 'error'); });
      if (S.cut) v.watch = setInterval(() => { if (tr.v === v && el.currentTime >= S.e - 0.03) aEdge(tr); }, 40);
    }
    emit('play', id);
    return true;
  }

  // sec > 0 → 그만큼 페이드아웃 후 정지, 0 → 바로 정지(5ms)
  function stop(id, sec = 0) {
    const tr = tracks.get(id); if (!tr || !tr.v) return;
    const v = tr.v;
    if (!(sec > 0) || paused) return end(tr, 'stop');
    if (v.fading) return;
    v.fading = true;
    const now = ctx.currentTime, g = v.g.gain;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + sec);
    v.fadeTimer = setTimeout(() => { if (tr.v === v) end(tr, 'faded'); }, sec * 1000 + 60);
    emit('fade', id);
  }

  function end(tr, why) {
    const v = tr.v; if (!v) return;
    tr.v = null; clearTimeout(v.fadeTimer); clearTimeout(v.cut); clearInterval(v.watch);
    const now = ctx.currentTime, at = now + EDGE + 0.005;
    try { const g = v.g.gain; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + EDGE); } catch {}
    if (v.src) { v.src.onended = null; try { v.src.stop(at); } catch {} }
    if (v.ds) v.ds.stop(at);
    if (v.el) { v.el.pause(); }
    setTimeout(() => { try { v.g.disconnect(); } catch {} }, 80);
    emit('end', tr.id, why);
  }

  function stopAll(sec = 0) {
    if (paused && !(sec > 0)) { tracks.forEach(tr => tr.v && end(tr, 'stop')); resumeAll(); return; }
    if (paused) resumeAll();
    tracks.forEach(tr => { if (tr.v) stop(tr.id, sec); });
  }

  // ⏸ 전체 일시정지 = 소리 출구 자체를 멈춤 → 모든 곡의 시계가 같이 멈추고 같이 이어진다
  function pauseAll() {
    if (!ctx || paused || !playingIds().length) return false;
    paused = true;
    tracks.forEach(tr => { if (tr.v && tr.v.fading) end(tr, 'stop'); else if (tr.v && tr.v.el) tr.v.el.pause(); });
    ctx.suspend(); emit('pause', true);
    return true;
  }
  function resumeAll() {
    if (!paused) return;
    paused = false;
    ctx.resume().catch(() => {});
    tracks.forEach(tr => { if (tr.v && tr.v.el) tr.v.el.play().catch(() => {}); });
    emit('pause', false);
  }

  function pos(id) {
    const tr = tracks.get(id); if (!tr || !tr.v || !ctx) return 0;
    const v = tr.v;
    // 구간 안에서의 위치(0 ~ 구간 길이)
    if (v.src) { const p = ctx.currentTime - v.t0; return tr.loop ? p % v.seg.L : Math.min(p, v.seg.L); }
    if (v.ds) return v.ds.pos();
    if (v.el) return Math.max(0, v.el.currentTime - v.seg.s);
    return 0;
  }

  function setVolume(id, x) {
    const tr = tracks.get(id); if (!tr) return;
    tr.volume = x; tr.vol.gain.setTargetAtTime(x, ctx.currentTime, 0.02);
  }
  function setPan(id, x) {
    const tr = tracks.get(id); if (!tr) return;
    tr.pan = x; if (tr.pn) tr.pn.pan.setTargetAtTime(x, ctx.currentTime, 0.02);
  }
  // 다음 재생부터 적용 (재생 중인 소리는 그대로)
  function setTrim(id, start, end) {
    const tr = tracks.get(id); if (!tr) return;
    tr.start = start || 0; tr.end = end || 0;
  }
  function setLoop(id, on) {
    const tr = tracks.get(id); if (!tr) return;
    const v = tr.v, rem = v ? v.seg.L - pos(id) : 0;
    tr.loop = !!on;
    // 반복을 끄면 지금 바퀴 끝에서 멈춤. 켜는 건 다음 재생부터(효과음)
    if (v && v.src && !on && v.src.loop) { v.src.loop = false; try { v.src.stop(ctx.currentTime + rem); } catch {} }
    // 긴 곡(D)은 몇 초 앞까지 미리 이어 붙여 두므로, 지금 바퀴 끝에 맞춰 끈다
    if (v && v.ds && !on) { clearTimeout(v.cut); v.cut = setTimeout(() => { if (tr.v === v && !tr.loop) end(tr, 'ended'); }, rem * 1000); }
  }
  // 파형(효과음만 — 긴 곡은 통째로 풀지 않으므로 없음)
  function peaks(id, n) {
    const tr = tracks.get(id); if (!tr || !tr.buffer) return null;
    if (tr.peaks && tr.peaks.length === n) return tr.peaks;
    const d = tr.buffer.getChannelData(0), step = Math.max(1, Math.floor(d.length / n)), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { let m = 0; for (let j = i * step, e = Math.min(d.length, j + step); j < e; j += 4) { const a = d[j] < 0 ? -d[j] : d[j]; if (a > m) m = a; } out[i] = m; }
    return (tr.peaks = out);
  }
  function setMaster(x) {
    masterVol = x;
    if (master) master.gain.setTargetAtTime(x, ctx.currentTime, 0.02);
  }
  const playingIds = () => [...tracks.values()].filter(tr => tr.v).map(tr => tr.id);

  // ---------- 홈 복귀 (0.4.7) ----------
  // 소유자 결정: 돌아오면 이어서 틀지 않는다. 뒤에서 실제로 계속 흐른 곡(A)만 그대로 두고, 멈춰 있던 곡은 멈춤 표시.
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.visibilityState === 'hidden') { tracks.forEach(tr => { tr.hidPos = tr.v && tr.v.el ? tr.v.el.currentTime : 0; }); return; }
    const alive = [], dead = [];
    tracks.forEach(tr => { if (!tr.v) return; const el = tr.v.el; (el && !el.paused && el.currentTime > (tr.hidPos || 0) + 1 ? alive : dead).push(tr); });
    dead.forEach(tr => end(tr, 'hidden'));
    if (unlocked && !alive.length) needRebuild = true;
    if (paused && !alive.length) { paused = false; emit('pause', false); }
    log(`복귀: 계속 흐른 곡 ${alive.length} · 멈춤 표시 ${dead.length}` + (needRebuild ? ' · 다음 탭에서 출구 새로' : ''));
    emit('return', { alive: alive.length, dead: dead.length });
  });

  // ---------- 한 번에 한 창만 (0.4.4) ----------
  const myId = Math.random().toString(36).slice(2, 7);
  let bc = null;
  function claimSole() {
    if (bc || !('BroadcastChannel' in window)) return;
    bc = new BroadcastChannel('duckq-board');
    bc.onmessage = e => {
      if (!e.data || e.data.type !== 'open' || e.data.id === myId) return;
      ousted = true;
      tracks.forEach(tr => tr.v && end(tr, 'ousted'));
      if (ctx) ctx.suspend();
      log('새 창이 열려서 이 창은 소리를 껐어요', 'w');
      emit('ousted');
    };
    bc.postMessage({ type: 'open', id: myId });
  }

  // ---------- D: 긴 곡 직접 풀기 (WebCodecs) — test/engine.html 0.4.7에서 그대로 ----------
  const D_START_PAD = 0.03, D_CHUNK_SEC = 1, D_FIRST_SEC = 0.2, D_AHEAD_SEC = 4, D_READ = 256 * 1024, D_HEAD = 64 * 1024;
  const str4 = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  async function readBytes(tr, s, e) {   // 파일 앞 64KB는 불러올 때 읽어 둔다 → 누를 때 저장소를 안 기다림
    if (e <= tr.head.length) return tr.head.subarray(s, e);
    return new Uint8Array(await tr.blob.slice(s, e).arrayBuffer());
  }
  async function probeD(tr) {
    tr.head = new Uint8Array(await tr.blob.slice(0, D_HEAD).arrayBuffer());
    const h = tr.head;
    if (h.length < 12) return null;
    if (str4(h, 0) === 'RIFF' && str4(h, 8) === 'WAVE') return probeWav(tr);
    if (!('AudioDecoder' in window)) return null;
    if (str4(h, 4) === 'ftyp') return probeMp4(tr);
    return probeMp3(tr);
  }

  // mp3: 프레임 머리를 읽어 한 프레임씩 자른다
  const MP3_BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const MP3_BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  function mp3Hdr(b, i) {
    if (i + 4 > b.length || b[i] !== 0xFF || (b[i + 1] & 0xE0) !== 0xE0) return null;
    const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, bi = b[i + 2] >> 4, si = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bi === 0 || bi === 15 || si === 3) return null;
    const v1 = ver === 3, sr = [44100, 48000, 32000][si] / (v1 ? 1 : ver === 2 ? 2 : 4);
    const br = (v1 ? MP3_BR1 : MP3_BR2)[bi] * 1000;
    return { sr, len: Math.floor((v1 ? 144 : 72) * br / sr) + pad, spf: v1 ? 1152 : 576, ch: (b[i + 3] >> 6) === 3 ? 1 : 2 };
  }
  function mp3Find(b, i) {
    for (; i + 4 <= b.length; i++) {
      const h = mp3Hdr(b, i); if (!h) continue;
      if (i + h.len + 4 > b.length) return i;
      const h2 = mp3Hdr(b, i + h.len); if (h2 && h2.sr === h.sr) return i;
    }
    return -1;
  }
  async function probeMp3(tr) {
    const h = tr.head; let start = 0;
    if (h[0] === 0x49 && h[1] === 0x44 && h[2] === 0x33) start = 10 + (((h[6] & 127) << 21) | ((h[7] & 127) << 14) | ((h[8] & 127) << 7) | (h[9] & 127)) + (h[5] & 0x10 ? 10 : 0);
    const b = await readBytes(tr, start, Math.min(tr.size, start + 16384));
    const i = mp3Find(b, 0); if (i < 0) return null;
    const f = mp3Hdr(b, i);
    const cfg = { codec: 'mp3', sampleRate: f.sr, numberOfChannels: f.ch };
    if (!(await AudioDecoder.isConfigSupported(cfg)).supported) return null;
    return { fmt: 'mp3', cfg, sr: f.sr, ch: f.ch, dataStart: start + i, dataEnd: tr.size, pktSec: f.spf / f.sr };
  }
  function mp3Reader(tr, d, off) {
    let pos = off > 0 ? Math.floor(d.dataStart + Math.min(1, off / tr.dur) * (d.dataEnd - d.dataStart)) : d.dataStart;
    let buf = new Uint8Array(0), bufPos = pos, resync = off > 0;
    return { async next(n) {
      const out = [];
      while (out.length < n) {
        let i = pos - bufPos;
        if (i + 4096 > buf.length && bufPos + buf.length < d.dataEnd) {
          const more = await readBytes(tr, bufPos + buf.length, Math.min(d.dataEnd, bufPos + buf.length + D_READ));
          const nb = new Uint8Array(buf.length - i + more.length); nb.set(buf.subarray(i)); nb.set(more, buf.length - i);
          buf = nb; bufPos = pos; i = 0;
        }
        let h = resync ? null : mp3Hdr(buf, i);
        if (!h) {
          const j = mp3Find(buf, i);
          if (j < 0) { pos = bufPos + buf.length; if (pos >= d.dataEnd) break; continue; }
          i = j; pos = bufPos + j; h = mp3Hdr(buf, i); resync = false;
        }
        if (i + h.len > buf.length) break;
        out.push(buf.slice(i, i + h.len)); pos += h.len;
      }
      return out;
    } };
  }

  // wav: 푸는 도구 없이 숫자만 옮긴다
  function probeWav(tr) {
    const h = tr.head, dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
    let o = 12, fmt = null;
    while (o + 8 <= h.length) {
      const id = str4(h, o), sz = dv.getUint32(o + 4, true);
      if (id === 'fmt ') {
        fmt = { tag: dv.getUint16(o + 8, true), ch: dv.getUint16(o + 10, true), sr: dv.getUint32(o + 12, true), bits: dv.getUint16(o + 22, true) };
        if (fmt.tag === 0xFFFE && sz >= 40) fmt.tag = dv.getUint16(o + 32, true);
      } else if (id === 'data') {
        if (!fmt) return null;
        const pcm = fmt.tag === 3 && fmt.bits === 32 ? 'f32' : fmt.tag === 1 && (fmt.bits === 16 || fmt.bits === 24) ? 'i' + fmt.bits : null;
        if (!pcm) return null;
        const end = sz === 0 || sz === 0xFFFFFFFF ? tr.size : Math.min(tr.size, o + 8 + sz);
        return { fmt: 'wav', pcm, sr: fmt.sr, ch: fmt.ch, dataStart: o + 8, dataEnd: end, block: fmt.ch * fmt.bits / 8 };
      }
      o += 8 + sz + (sz & 1);
    }
    return null;
  }
  function wavReader(tr, d, off) {
    let pos = d.dataStart + Math.floor(off * d.sr) * d.block;
    return { async nextPcm(frames) {
      const n = Math.floor((Math.min(d.dataEnd, pos + frames * d.block) - pos) / d.block); if (n <= 0) return null;
      const b = await readBytes(tr, pos, pos + n * d.block); pos += n * d.block;
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), bps = d.block / d.ch, out = [];
      for (let c = 0; c < d.ch; c++) out.push(new Float32Array(n));
      for (let f = 0; f < n; f++) for (let c = 0; c < d.ch; c++) {
        const o = f * d.block + c * bps;
        out[c][f] = d.pcm === 'f32' ? dv.getFloat32(o, true) : d.pcm === 'i16' ? dv.getInt16(o, true) / 32768 : ((dv.getInt8(o + 2) << 16) | (b[o + 1] << 8) | b[o]) / 8388608;
      }
      return out;
    } };
  }

  // m4a: mp4 포장에서 조각 위치표(moov)만 읽고, 조각은 그때그때 꺼낸다
  function boxes(b, s, e) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength), out = [];
    while (s + 8 <= e) {
      let sz = dv.getUint32(s), hd = 8;
      if (sz === 1) { sz = Number(dv.getBigUint64(s + 8)); hd = 16; } else if (sz === 0) sz = e - s;
      if (sz < hd) break;
      out.push({ type: str4(b, s + 4), d: s + hd, e: Math.min(e, s + sz) }); s += sz;
    }
    return out;
  }
  const kid = (b, box, type) => box ? boxes(b, box.d, box.e).find(x => x.type === type) : null;
  function esdsASC(b) {
    let i = 0;
    const rd = () => { const tag = b[i++]; let len = 0; for (let k = 0; k < 4; k++) { const c = b[i++]; len = (len << 7) | (c & 127); if (!(c & 128)) break; } return [tag, len]; };
    let [tag, len] = rd(); if (tag !== 3) return null;
    i += 2; const fl = b[i++]; if (fl & 0x80) i += 2; if (fl & 0x40) i += 1 + b[i]; if (fl & 0x20) i += 2;
    [tag] = rd(); if (tag !== 4) return null; i += 13;
    [tag, len] = rd(); if (tag !== 5) return null;
    return b.slice(i, i + len);
  }
  async function probeMp4(tr) {
    let o = 0, moov = null;
    while (o + 8 <= tr.size) {
      const h = await readBytes(tr, o, Math.min(tr.size, o + 16)), dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
      let sz = dv.getUint32(0); if (sz === 1) sz = Number(dv.getBigUint64(8)); else if (sz === 0) sz = tr.size - o;
      if (str4(h, 4) === 'moov') { moov = await readBytes(tr, o, o + sz); break; }
      if (sz < 8) return null; o += sz;
    }
    if (!moov) return null;
    const dv = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
    for (const trak of boxes(moov, 8, moov.length).filter(x => x.type === 'trak')) {
      const mdia = kid(moov, trak, 'mdia'), hdlr = kid(moov, mdia, 'hdlr');
      if (!hdlr || str4(moov, hdlr.d + 8) !== 'soun') continue;
      const mdhd = kid(moov, mdia, 'mdhd'), timescale = dv.getUint32(mdhd.d + (moov[mdhd.d] === 1 ? 20 : 12));
      const stbl = kid(moov, kid(moov, mdia, 'minf'), 'stbl'), stsd = kid(moov, stbl, 'stsd');
      const ent = stsd && boxes(moov, stsd.d + 8, stsd.e)[0];
      if (!ent || ent.type !== 'mp4a') return null;
      const qv = dv.getUint16(ent.d + 8);
      const esds = kid(moov, { d: ent.d + 28 + (qv === 1 ? 16 : qv === 2 ? 36 : 0), e: ent.e }, 'esds');
      const asc = esds && esdsASC(moov.subarray(esds.d + 4, esds.e)); if (!asc || asc.length < 2) return null;
      const aot = asc[0] >> 3, sri = ((asc[0] & 7) << 1) | (asc[1] >> 7), ach = (asc[1] >> 3) & 15;
      const sr = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350][sri] || (dv.getUint32(ent.d + 24) >>> 16);
      const cfg = { codec: 'mp4a.40.' + aot, sampleRate: sr, numberOfChannels: ach || dv.getUint16(ent.d + 16) || 2, description: asc };
      if (!(await AudioDecoder.isConfigSupported(cfg)).supported) return null;
      const stsz = kid(moov, stbl, 'stsz'), stsc = kid(moov, stbl, 'stsc'), stts = kid(moov, stbl, 'stts');
      const stco = kid(moov, stbl, 'stco') || kid(moov, stbl, 'co64'), is64 = stco.type === 'co64';
      const n = dv.getUint32(stsz.d + 8), fixed = dv.getUint32(stsz.d + 4), sizes = new Uint32Array(n);
      for (let i = 0; i < n; i++) sizes[i] = fixed || dv.getUint32(stsz.d + 12 + i * 4);
      const nc = dv.getUint32(stco.d + 4), co = new Float64Array(nc);
      for (let i = 0; i < nc; i++) co[i] = is64 ? Number(dv.getBigUint64(stco.d + 8 + i * 8)) : dv.getUint32(stco.d + 8 + i * 4);
      const ns = dv.getUint32(stsc.d + 4), sc = [];
      for (let i = 0; i < ns; i++) sc.push([dv.getUint32(stsc.d + 8 + i * 12) - 1, dv.getUint32(stsc.d + 12 + i * 12)]);
      const offs = new Float64Array(n); let si = 0;
      for (let k = 0; k < ns; k++) {
        const end = k + 1 < ns ? sc[k + 1][0] : nc;
        for (let c = sc[k][0]; c < end; c++) { let off = co[c]; for (let j = 0; j < sc[k][1] && si < n; j++) { offs[si] = off; off += sizes[si++]; } }
      }
      const delta = dv.getUint32(stts.d + 12);   // AAC는 조각마다 1024 고정 — 첫 칸만 씀
      return { fmt: 'm4a', cfg, sr, ch: cfg.numberOfChannels, offs, sizes, n, pktSec: delta / timescale };
    }
    return null;
  }
  function m4aReader(tr, d, off) {
    let i = Math.min(d.n, Math.floor(off / d.pktSec));
    return { async next(k) {
      const j = Math.min(d.n, i + k); if (i >= j) return [];
      const s = d.offs[i], e = d.offs[j - 1] + d.sizes[j - 1], out = [];
      let sum = 0; for (let x = i; x < j; x++) sum += d.sizes[x];
      if (e - s <= sum * 2) { const b = await readBytes(tr, s, e); for (let x = i; x < j; x++) out.push(b.slice(d.offs[x] - s, d.offs[x] - s + d.sizes[x])); }
      else for (let x = i; x < j; x++) out.push(await readBytes(tr, d.offs[x], d.offs[x] + d.sizes[x]));
      i = j; return out;
    } };
  }
  const makeReader = (tr, off) => (tr.d.fmt === 'mp3' ? mp3Reader : tr.d.fmt === 'wav' ? wavReader : m4aReader)(tr, tr.d, off);

  function adToPlanar(ad) {
    const n = ad.numberOfFrames, ch = ad.numberOfChannels;
    try {
      const out = [];
      for (let c = 0; c < ch; c++) { const a = new Float32Array(n); ad.copyTo(a, { planeIndex: c, format: 'f32-planar' }); out.push(a); }
      return out;
    } catch {}
    const f = ad.format || '', planar = f.endsWith('-planar'), base = f.replace('-planar', '');
    const T = { f32: Float32Array, s16: Int16Array, s32: Int32Array }[base]; if (!T) throw new Error('모르는 소리 형식 ' + f);
    const k = base === 'f32' ? 1 : base === 's16' ? 1 / 32768 : 1 / 2147483648, out = [];
    for (let c = 0; c < ch; c++) out.push(new Float32Array(n));
    if (planar) for (let c = 0; c < ch; c++) { const a = new T(n); ad.copyTo(a, { planeIndex: c }); for (let i = 0; i < n; i++) out[c][i] = a[i] * k; }
    else { const a = new T(n * ch); ad.copyTo(a, { planeIndex: 0 }); for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) out[c][i] = a[i * ch + c] * k; }
    return out;
  }

  class DStream {
    // off = 구간 시작에서 몇 초 뒤부터. 구간 끝(트림)은 풀린 소리 샘플 수로 정확히 자른다.
    constructor(tr, v, off) {
      Object.assign(this, { tr, v, d: tr.d, off, seg: v.seg, left: -1, gen: 0, alive: true, eof: false, started: false, pumping: false,
        pend: [], pendOff: 0, pendLen: 0, sr: 0, nextTime: 0, t0: 0, pkts: 0, srcs: new Set(), bytes: 0, chunks: 0, gaps: 0 });
      this.reader = makeReader(tr, v.seg.s + off);
      if (this.d.fmt !== 'wav') {
        this.dec = new AudioDecoder({ output: ad => this.onData(ad), error: e => log(`D 풀기 오류: ${e.message}`, 'e') });
        this.dec.configure(this.d.cfg);
      }
      this.timer = setInterval(() => this.pump(), 250);
      this.pump();
    }
    pos() { if (!this.started) return 0; const p = Math.max(0, ctx.currentTime - this.t0), L = this.seg.L; return this.tr.loop ? p % L : Math.min(p, L); }
    onData(ad) {
      try { if (this.alive) this.push(adToPlanar(ad), ad.sampleRate); }
      catch (e) { log(`D 변환 오류: ${e.message}`, 'e'); }
      finally { ad.close(); }
    }
    push(chs, sr) {
      if (!this.sr) this.sr = sr;
      if (this.seg.cut) {
        if (this.left < 0) this.left = Math.round((this.seg.L - this.off) * sr);
        if (this.left <= 0) return;   // 구간 끝 뒤 소리는 버림 (반복 준비 중)
        if (chs[0].length >= this.left) {
          const k = this.left; chs = chs.map(a => a.subarray(0, k)); this.left = 0;
          this.pend.push(chs); this.pendLen += k; this.segEnd();
          if (!this.eof) this.emitReady(false);
          return;
        }
        this.left -= chs[0].length;
      }
      this.pend.push(chs); this.pendLen += chs[0].length; this.emitReady(false);
    }
    segEnd() {
      if (this.tr.loop) { queueMicrotask(() => this.restart()); return; }
      this.eof = true; this.emitReady(true);
      if (this.alive && !this.srcs.size && !this.pendLen) this.finish();
    }
    // 반복: 풀던 것을 버리고 구간 시작부터 다시 읽는다. 남은 꼬리 조각(pend)은 그대로 이어 붙음
    restart() {
      if (!this.alive) return;
      this.gen++;
      if (this.dec) { try { this.dec.reset(); this.dec.configure(this.d.cfg); } catch (e) { log(`D 반복 준비 오류: ${e.message}`, 'e'); } }
      this.reader = makeReader(this.tr, this.seg.s);
      this.left = Math.round(this.seg.L * this.sr);
      this.pump();
    }
    emitReady(all) {
      while (this.alive) {
        const need = Math.round(this.sr * (this.started ? D_CHUNK_SEC : D_FIRST_SEC));
        if (this.pendLen >= need) this.emit(need); else if (all && this.pendLen) this.emit(this.pendLen); else break;
      }
    }
    emit(len) {
      const ch = this.pend[0].length, buf = ctx.createBuffer(ch, len, this.sr), dst = [];
      for (let c = 0; c < ch; c++) dst.push(buf.getChannelData(c));
      let w = 0;
      while (w < len) {
        const p = this.pend[0], k = Math.min(p[0].length - this.pendOff, len - w);
        for (let c = 0; c < ch; c++) dst[c].set((p[c] || p[0]).subarray(this.pendOff, this.pendOff + k), w);
        w += k; this.pendOff += k;
        if (this.pendOff >= p[0].length) { this.pend.shift(); this.pendOff = 0; }
      }
      this.pendLen -= len;
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(this.v.g);
      const now = ctx.currentTime;
      if (!this.started) {
        // 첫 조각은 30ms 뒤에 걸고 그때부터 소리를 올린다(시작 '지직' 방지). 페이드인이 있으면 그 길이로.
        this.started = true; this.nextTime = now + D_START_PAD; this.t0 = this.nextTime - this.off;
        if (!this.v.fading) {
          const g = this.v.g.gain; g.cancelScheduledValues(now); g.setValueAtTime(0, now); g.setValueAtTime(0, this.nextTime);
          g.linearRampToValueAtTime(1, this.nextTime + Math.max(0.01, this.v.rise));
        }
      } else if (this.nextTime < now) {
        this.gaps++; log(`D 끊김: 조각이 ${((now - this.nextTime) * 1000).toFixed(0)}ms 늦음`, 'w');
        this.t0 += now - this.nextTime; this.nextTime = now;
      }
      src.start(this.nextTime); this.nextTime += len / this.sr; this.chunks++;
      const bytes = len * ch * 4; this.bytes += bytes; loadedBytes += bytes;
      this.srcs.add(src);
      src.onended = () => {
        this.srcs.delete(src); this.bytes -= bytes; loadedBytes -= bytes;
        if (this.alive && this.eof && !this.srcs.size && !this.pendLen) this.finish();
      };
    }
    async pump() {
      if (this.pumping || !this.alive || this.eof) return;
      this.pumping = true;
      try {
        while (this.alive && !this.eof) {
          const sr = this.sr || this.d.sr;
          const ahead = (this.started ? this.nextTime - ctx.currentTime : 0) + this.pendLen / sr + (this.dec ? this.dec.decodeQueueSize * this.d.pktSec : 0);
          if (ahead >= D_AHEAD_SEC) break;
          const sec = this.started ? D_CHUNK_SEC : D_FIRST_SEC;
          let got = false; const gen = this.gen;
          if (this.d.fmt === 'wav') {
            const p = await this.reader.nextPcm(Math.round(this.d.sr * sec));
            if (!this.alive || this.eof) break;
            if (gen !== this.gen) continue;
            if (p) { this.push(p, this.d.sr); got = true; }
          } else {
            const pk = await this.reader.next(Math.ceil(sec / this.d.pktSec) + (this.started ? 0 : 4));
            if (!this.alive || this.eof) break;
            if (gen !== this.gen) continue;
            for (const data of pk) this.dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round(this.pkts++ * this.d.pktSec * 1e6), data }));
            got = pk.length > 0;
          }
          if (got) continue;
          if (this.tr.loop) {   // 반복: 구간 시작부터 다시 읽어 이어 붙임
            this.reader = makeReader(this.tr, this.seg.s);
            if (this.seg.cut && this.sr) this.left = Math.round(this.seg.L * this.sr);
            continue;
          }
          this.eof = true;
          if (this.dec) { try { await this.dec.flush(); } catch {} }
          this.emitReady(true);
          if (this.alive && !this.srcs.size) this.finish();
        }
      } catch (e) { log(`D 읽기 오류: ${e.message}`, 'e'); }
      finally { this.pumping = false; }
    }
    stop(at) {
      if (!this.alive) return;
      this.alive = false; clearInterval(this.timer);
      for (const s of this.srcs) { s.onended = null; try { s.stop(at); } catch {} }
      this.srcs.clear(); loadedBytes -= this.bytes; this.bytes = 0;
      if (this.dec && this.dec.state !== 'closed') { try { this.dec.close(); } catch {} }
      if (this.gaps) log(`D 늦은 조각 ${this.gaps}개 (조각 ${this.chunks}개 중)`, 'w');
    }
    finish() {
      const tr = this.tr; this.stop();
      if (tr.v && tr.v.ds === this) end(tr, 'ended');
    }
  }

  return {
    SFX_MAX_SEC,
    on(ev, f) { (ls[ev] || (ls[ev] = [])).push(f); },
    unlock, probeDuration, load, unload, play, stop, stopAll, pauseAll, resumeAll,
    pos, setVolume, setPan, setTrim, setLoop, setMaster, playingIds, peaks,
    isPlaying: id => !!(tracks.get(id) && tracks.get(id).v),
    isFading: id => !!(tracks.get(id) && tracks.get(id).v && tracks.get(id).v.fading),
    dur: id => { const tr = tracks.get(id); return tr ? (tr.v ? tr.v.seg.L : seg(tr).L) : 0; },   // 구간 길이
    fileDur: id => (tracks.get(id) || {}).dur || 0,
    get paused() { return paused; },
    get unlocked() { return unlocked; },
    get loadedBytes() { return loadedBytes; },
    get state() { return ctx ? ctx.state : '-'; },
  };
})();
