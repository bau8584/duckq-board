// 내보낼 때 안 쓰는 앞뒤를 잘라 담는다. 소리를 풀거나 다시 변환하지 않고 조각(프레임) 단위로 골라 담는다 → 음질 그대로·빠름·메모리 적게.
// wav = 샘플 단위, mp3 = 프레임 단위, m4a/mp4 = 샘플 조각 + 목차(moov) 새로 쓰기. 모르는 모양이면 null(원본 그대로 담음).
// 돌려주는 cut0 = 잘린 파일의 0초가 원본 재생 시각으로 몇 초였나(트림 위치를 이만큼 당긴다), len = 잘린 파일 길이(초).
'use strict';
const Cut = (() => {
  let why = '';   // 못 자른 이유(로그용)
  const no = w => { why = w; return null; };
  const str = (dv, o, n) => { let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(dv.getUint8(o + i)); return s; };
  const head = async (blob, n) => new DataView(await blob.slice(0, Math.min(blob.size, n)).arrayBuffer());

  // ---------- wav ----------
  async function wav(blob, t0, t1) {
    const dv = await head(blob, 1 << 16);
    let p = 12, fmt = null, dataOff = -1, dataLen = 0;
    while (p + 8 <= dv.byteLength) {
      const id = str(dv, p, 4), len = dv.getUint32(p + 4, true);
      if (id === 'fmt ') fmt = { off: p, len: 8 + len };
      if (id === 'data') { dataOff = p + 8; dataLen = Math.min(len, blob.size - dataOff); break; }
      p += 8 + len + (len & 1);
    }
    if (!fmt || dataOff < 0) return null;
    const sr = dv.getUint32(fmt.off + 12, true), ba = dv.getUint16(fmt.off + 20, true);
    if (!sr || !ba) return null;
    const total = Math.floor(dataLen / ba), f0 = Math.max(0, Math.floor(t0 * sr)), f1 = Math.min(total, Math.ceil(t1 * sr));
    if (f1 <= f0) return null;
    const n = (f1 - f0) * ba, fmtBytes = new Uint8Array(dv.buffer.slice(fmt.off, fmt.off + fmt.len));
    const h = new DataView(new ArrayBuffer(12)), d = new DataView(new ArrayBuffer(8));
    [...'RIFF'].forEach((c, i) => h.setUint8(i, c.charCodeAt(0))); h.setUint32(4, 4 + fmt.len + 8 + n, true); [...'WAVE'].forEach((c, i) => h.setUint8(8 + i, c.charCodeAt(0)));
    [...'data'].forEach((c, i) => d.setUint8(i, c.charCodeAt(0))); d.setUint32(4, n, true);
    return { blob: new Blob([h.buffer, fmtBytes, d.buffer, blob.slice(dataOff + f0 * ba, dataOff + f1 * ba)], { type: blob.type || 'audio/wav' }), cut0: f0 / sr, len: (f1 - f0) / sr };
  }

  // ---------- mp3 ----------
  const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const SR = [44100, 48000, 32000];
  function frameAt(u, p) {
    if (p + 4 > u.length || u[p] !== 0xFF || (u[p + 1] & 0xE0) !== 0xE0) return null;
    const ver = (u[p + 1] >> 3) & 3, layer = (u[p + 1] >> 1) & 3, bi = u[p + 2] >> 4, si = (u[p + 2] >> 2) & 3, pad = (u[p + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || bi === 0 || bi === 15 || si === 3) return null;   // Layer III만
    const m1 = ver === 3, sr = SR[si] / (m1 ? 1 : ver === 2 ? 2 : 4), br = (m1 ? BR1 : BR2)[bi];
    return { len: Math.floor((m1 ? 144 : 72) * br * 1000 / sr) + pad, spf: m1 ? 1152 : 576, sr, m1, mono: (u[p + 3] >> 6) === 3 };
  }
  // ---------- AAC 날것(ADTS) — 이름이 .mp3·.aac인데 속이 이것인 파일이 흔하다 ----------
  const ASR = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  function adtsAt(u, p) {
    if (p + 7 > u.length || u[p] !== 0xFF || (u[p + 1] & 0xF6) !== 0xF0) return null;
    const len = ((u[p + 3] & 3) << 11) | (u[p + 4] << 3) | (u[p + 5] >> 5), sr = ASR[(u[p + 2] >> 2) & 15];
    return len >= 7 && sr ? { len, sr, spf: 1024 * ((u[p + 6] & 3) + 1) } : null;
  }
  // 프레임을 끝까지 훑어 t0 직전·t1 직후 경계를 찾는다. 깨진 곳은 뒤 64KB 안에서 다음 프레임 둘이 이어지는 자리를 찾아 계속
  function walk(u, p, at, sr, t0, t1, kind) {
    const first = p, g0 = t0 * sr, g1 = t1 * sr;
    let n = 0, s0 = first, c0 = 0, e = -1, f, skip = 0;
    while (p < u.length) {
      f = at(u, p);
      if (!f || p + f.len > u.length) {
        let q = p + 1; const lim = Math.min(u.length - 4, p + 65536);
        while (q < lim && !((f = at(u, q)) && at(u, q + f.len))) q++;
        if (q >= lim) break;
        skip++; p = q; continue;
      }
      if (n <= g0) { s0 = p; c0 = n; }
      if (n >= g1) { e = p; break; }
      n += f.spf; p += f.len;
    }
    if (e < 0) e = p;
    if (e <= s0 || (s0 === first && e >= u.length)) return no(`${kind} 자를 구간 없음 · ${(n / sr).toFixed(0)}초·${(p / 1048576).toFixed(1)}/${(u.length / 1048576).toFixed(1)}MB까지 읽음 · 구간 ${t0.toFixed(0)}~${t1.toFixed(0)}초 · 건너뛴 곳 ${skip}`);
    return { s0, e, c0, len: (n - c0) / sr };
  }
  function adts(blob, u, p, t0, t1) {
    const f = adtsAt(u, p), w = walk(u, p, adtsAt, f.sr, t0, t1, 'AAC');
    return w && { blob: blob.slice(w.s0, w.e, blob.type || 'audio/aac'), cut0: w.c0 / f.sr, len: w.len };
  }
  const id3End = u => u[0] === 0x49 && u[1] === 0x44 && u[2] === 0x33 ? 10 + ((u[6] & 127) << 21 | (u[7] & 127) << 14 | (u[8] & 127) << 7 | (u[9] & 127)) + (u[5] & 16 ? 10 : 0) : 0;
  async function mp3(blob, t0, t1) {
    const u = new Uint8Array(await blob.arrayBuffer());
    let p = id3End(u);
    // ID3 뒤가 mp4면 그쪽으로, AAC 날것이면 그쪽으로
    if (p + 8 < u.length && String.fromCharCode(...u.subarray(p + 4, p + 8)) === 'ftyp') return mp4(p ? blob.slice(p, blob.size, blob.type) : blob, t0, t1);
    for (let q = p, lim = Math.min(u.length, p + 65536); q < lim; q++) {
      if (u[q] !== 0xFF) continue;
      const a = adtsAt(u, q); if (a && adtsAt(u, q + a.len)) return adts(blob, u, q, t0, t1);
      const m = frameAt(u, q); if (m && frameAt(u, q + m.len)) break;
    }
    let f = null;
    for (const lim = Math.min(u.length, p + 65536); p < lim; p++) if ((f = frameAt(u, p)) && frameAt(u, p + f.len)) break;
    if (!f || p >= u.length) return no('mp3 프레임 못 찾음');
    // 첫 프레임이 Xing/Info(길이 정보)면 뺀다 — 자른 뒤엔 틀린 길이가 되므로
    const side = f.m1 ? (f.mono ? 17 : 32) : (f.mono ? 9 : 17), tag = String.fromCharCode(...u.subarray(p + 4 + side, p + 8 + side));
    // LAME 태그의 인코더 지연: 원본은 이만큼 앞을 건너뛰고 재생되지만 자른 파일은 안 건너뜀 → cut0에서 뺀다
    let delay = 0;
    if (tag === 'Xing' || tag === 'Info') {
      const x = p + 4 + side;
      if (String.fromCharCode(...u.subarray(x + 120, x + 124)) .match(/^(LAME|Lavc|Lavf)/)) delay = ((u[x + 141] << 4) | (u[x + 142] >> 4)) + 529;   // + 디코더 지연
      p += f.len;
    }
    const sr = f.sr, w = walk(u, p, frameAt, sr, t0, t1, 'mp3');
    if (!w) return null;
    const { s0, e, c0, len } = w;
    return { blob: blob.slice(s0, e, blob.type || 'audio/mpeg'), cut0: (c0 - delay) / sr, len, delay };
  }

  // ---------- m4a / mp4 (소리 트랙 하나일 때만) ----------
  const CONT = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'edts', 'dinf']);
  function parseBoxes(dv, s, e) {
    const out = [];
    while (s + 8 <= e) {
      let size = dv.getUint32(s), hl = 8;
      const type = str(dv, s + 4, 4);
      if (size === 1) { size = Number(dv.getBigUint64(s + 8)); hl = 16; } else if (size === 0) size = e - s;
      if (size < hl || s + size > e) throw new Error('box');
      const b = { type };
      if (CONT.has(type)) b.kids = parseBoxes(dv, s + hl, s + size);
      else b.data = new Uint8Array(dv.buffer, dv.byteOffset + s + hl, size - hl);
      out.push(b); s += size;
    }
    return out;
  }
  const find = (bs, t) => bs && bs.find(b => b.type === t);
  const path = (b, ...ts) => ts.reduce((x, t) => x && find(x.kids, t), b);
  const boxLen = b => 8 + (b.kids ? b.kids.reduce((a, k) => a + boxLen(k), 0) : b.data.length);
  function writeBox(b, out, o) {
    const dv = new DataView(out.buffer, out.byteOffset);
    dv.setUint32(o, boxLen(b)); for (let i = 0; i < 4; i++) out[o + 4 + i] = b.type.charCodeAt(i);
    o += 8;
    if (b.kids) for (const k of b.kids) o = writeBox(k, out, o); else { out.set(b.data, o); o += b.data.length; }
    return o;
  }
  // 최상위 상자 목록만 훑는다(큰 mdat은 안 읽음)
  async function topBoxes(blob) {
    const list = [];
    for (let s = 0; s + 8 <= blob.size;) {
      const dv = new DataView(await blob.slice(s, s + 16).arrayBuffer());
      let size = dv.getUint32(0); const type = str(dv, 4, 4);
      if (size === 1) size = Number(dv.getBigUint64(8)); else if (size === 0) size = blob.size - s;
      if (size < 8) throw new Error('top');
      list.push({ type, s, size }); s += size;
    }
    return list;
  }
  async function mp4(blob, t0, t1) {
    const tops = await topBoxes(blob);
    const ftyp = tops.find(b => b.type === 'ftyp'), mv = tops.find(b => b.type === 'moov');
    if (!ftyp || !mv) return no('mp4 moov 없음'); if (tops.some(b => b.type === 'moof')) return no('조각 mp4');   // 조각 mp4(녹음 앱 일부)는 그대로
    const mvBuf = await blob.slice(mv.s, mv.s + mv.size).arrayBuffer();
    const moov = parseBoxes(new DataView(mvBuf), 0, mv.size)[0];
    const traks = moov.kids.filter(k => k.type === 'trak');
    const isSoun = t => { const h = path(t, 'mdia', 'hdlr'); return h && str(new DataView(h.data.buffer, h.data.byteOffset), 8, 4) === 'soun'; };
    const trak = traks.find(isSoun);
    if (!trak) return no(`mp4 소리 트랙 없음(트랙 ${traks.length})`);
    moov.kids = moov.kids.filter(k => k.type !== 'trak' || k === trak);   // 표지·영상 등 다른 트랙은 뺀다
    const mdia = find(trak.kids, 'mdia'), stbl = path(mdia, 'minf', 'stbl');
    if (!stbl) return no('mp4 stbl 없음');
    const V = b => new DataView(b.data.buffer, b.data.byteOffset, b.data.length);
    const mdhd = V(find(mdia.kids, 'mdhd')), ts = mdhd.getUint32(mdhd.getUint8(0) ? 20 : 12);
    const stts = V(find(stbl.kids, 'stts')), stsc = V(find(stbl.kids, 'stsc')), stsz = V(find(stbl.kids, 'stsz'));
    const coB = find(stbl.kids, 'stco') || find(stbl.kids, 'co64'), co = V(coB), c64 = coB.type === 'co64';
    // 샘플별 크기·위치·시각
    const N = stsz.getUint32(8), fixed = stsz.getUint32(4);
    const size = new Uint32Array(N), off = new Float64Array(N), time = new Float64Array(N + 1);
    for (let i = 0; i < N; i++) size[i] = fixed || stsz.getUint32(12 + 4 * i);
    for (let i = 0, k = 0, n = stts.getUint32(4); i < n; i++) {
      const cnt = stts.getUint32(8 + 8 * i), d = stts.getUint32(12 + 8 * i);
      for (let j = 0; j < cnt && k < N; j++, k++) time[k + 1] = time[k] + d;
    }
    const nc = co.getUint32(4), ns = stsc.getUint32(4);
    for (let c = 0, si = 0, e = 0; c < nc; c++) {
      while (e + 1 < ns && stsc.getUint32(8 + 12 * (e + 1)) <= c + 1) e++;
      const spc = stsc.getUint32(12 + 12 * e);
      let o = c64 ? Number(co.getBigUint64(8 + 8 * c)) : co.getUint32(8 + 4 * c);
      for (let j = 0; j < spc && si < N; j++, si++) { off[si] = o; o += size[si]; }
    }
    // 앞 무음(priming) — 재생 시각 = 미디어 시각 − 이 값
    let prime = 0;
    const elst = path(trak, 'edts', 'elst');
    if (elst) {
      const ev = V(elst), v1 = ev.getUint8(0), n = ev.getUint32(4);
      for (let i = 0; i < n; i++) {
        const mt = v1 ? Number(ev.getBigInt64(8 + 20 * i + 8)) : ev.getInt32(8 + 12 * i + 4);
        if (mt >= 0) { prime = mt; break; }
      }
    }
    const g0 = t0 * ts + prime, g1 = t1 * ts + prime;
    let a = 0; while (a + 1 < N && time[a + 1] <= g0) a++;
    let b = a; while (b < N && time[b] < g1) b++;
    if (b <= a || (a === 0 && b === N)) return no(`mp4 자를 구간 없음 · 샘플 ${N} · 길이 ${(time[N] / ts).toFixed(0)}초 · 구간 ${t0.toFixed(0)}~${t1.toFixed(0)}초`);
    const n = b - a;
    // 새 표
    const sttsRuns = [];
    for (let i = a; i < b; i++) { const d = time[i + 1] - time[i]; const r = sttsRuns[sttsRuns.length - 1]; if (r && r[1] === d) r[0]++; else sttsRuns.push([1, d]); }
    const mk = (type, len, fill) => { const data = new Uint8Array(len); fill(new DataView(data.buffer)); return { type, data }; };
    const nStts = mk('stts', 8 + 8 * sttsRuns.length, d => { d.setUint32(4, sttsRuns.length); sttsRuns.forEach((r, i) => { d.setUint32(8 + 8 * i, r[0]); d.setUint32(12 + 8 * i, r[1]); }); });
    const nStsc = mk('stsc', 20, d => { d.setUint32(4, 1); d.setUint32(8, 1); d.setUint32(12, 1); d.setUint32(16, 1); });
    const nStsz = mk('stsz', 12 + 4 * n, d => { d.setUint32(8, n); for (let i = 0; i < n; i++) d.setUint32(12 + 4 * i, size[a + i]); });
    const nStco = mk('stco', 8 + 4 * n, () => {});
    stbl.kids = stbl.kids.filter(k => !['stts', 'stsc', 'stsz', 'stz2', 'stco', 'co64', 'stss', 'ctts', 'sdtp', 'sbgp', 'sgpd'].includes(k.type)).concat(nStts, nStsc, nStsz, nStco);
    trak.kids = trak.kids.filter(k => k.type !== 'edts');
    // 길이 고치기
    const durMedia = time[b] - time[a];
    const mvhd = V(find(moov.kids, 'mvhd')), mts = mvhd.getUint32(mvhd.getUint8(0) ? 20 : 12), durMovie = Math.round(durMedia / ts * mts);
    const setD = (dv, v, o32, o64) => dv.getUint8(0) ? dv.setBigUint64(o64, BigInt(v)) : dv.setUint32(o32, v);
    setD(mvhd, durMovie, 16, 24); setD(V(find(trak.kids, 'tkhd')), durMovie, 20, 28); setD(V(find(mdia.kids, 'mdhd')), durMedia, 16, 24);
    // 소리 조각: 이어진 것끼리 묶어 원본에서 잘라 가리킨다
    const runs = [];
    for (let i = a; i < b; i++) { const r = runs[runs.length - 1]; if (r && r[0] + r[1] === off[i]) r[1] += size[i]; else runs.push([off[i], size[i]]); }
    const dataLen = runs.reduce((x, r) => x + r[1], 0);
    const ftypBuf = await blob.slice(ftyp.s, ftyp.s + ftyp.size).arrayBuffer();
    const moovLen = boxLen(moov), big = ftyp.size + moovLen + 16 + dataLen > 0xFFFFFFFF;
    if (big) return no('4GB 넘음');
    const base = ftyp.size + moovLen + 8;
    { const d = new DataView(nStco.data.buffer); d.setUint32(4, n); for (let i = 0, o = base; i < n; i++) { d.setUint32(8 + 4 * i, o); o += size[a + i]; } }
    const moovOut = new Uint8Array(moovLen); writeBox(moov, moovOut, 0);
    const mdatH = new DataView(new ArrayBuffer(8)); mdatH.setUint32(0, 8 + dataLen); [...'mdat'].forEach((c, i) => mdatH.setUint8(4 + i, c.charCodeAt(0)));
    const parts = [ftypBuf, moovOut, mdatH.buffer, ...runs.map(r => blob.slice(r[0], r[0] + r[1]))];
    return { blob: new Blob(parts, { type: blob.type || 'audio/mp4' }), cut0: (time[a] - prime) / ts, len: durMedia / ts };
  }

  // 형식은 이름이 아니라 파일 앞머리로 알아낸다
  async function run(blob, t0, t1) {
    why = '';
    const dv = await head(blob, 12);
    if (dv.byteLength < 12) return no('파일이 너무 짧음');
    const a = str(dv, 0, 4), b = str(dv, 4, 4), c = str(dv, 8, 4);
    if (a === 'RIFF' && c === 'WAVE') return (await wav(blob, t0, t1)) || no(why || 'wav 모양 모름');
    if (b === 'ftyp') return mp4(blob, t0, t1);
    if (a.startsWith('ID3') || dv.getUint8(0) === 0xFF) return mp3(blob, t0, t1);
    return no('모르는 형식 · 앞머리 ' + [...new Uint8Array(dv.buffer)].map(x => x.toString(16).padStart(2, '0')).join(' '));
  }
  return { run, why: () => why };
})();
