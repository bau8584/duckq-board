// 보드 내보내기·가져오기용 zip. 압축은 안 하고 담기만(소리 파일은 이미 압축돼 있어 줄지 않고 메모리만 씀).
// 파일 이름은 UTF-8(한글 그대로). 외부 라이브러리 없음 → 오프라인에서도 됨.
'use strict';
const Zip = (() => {
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc32 = u8 => { let c = -1; for (let i = 0; i < u8.length; i++) c = T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const enc = new TextEncoder(), dec = new TextDecoder();
  function dosTime(d) {
    return { t: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), d: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
  }
  // entries = [{name, blob}] → Blob(zip). 한 파일씩 읽어 CRC만 재고 버린다(최종 Blob은 원본을 가리킴)
  async function make(entries, onStep) {
    const parts = [], cen = [], now = dosTime(new Date());
    let off = 0;
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i], nm = enc.encode(e.name), size = e.blob.size;
      const crc = crc32(new Uint8Array(await e.blob.arrayBuffer()));
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, now.t, true); lh.setUint16(12, now.d, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, nm.length, true); lh.setUint16(28, 0, true);
      parts.push(lh.buffer, nm, e.blob);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, now.t, true); ch.setUint16(14, now.d, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, nm.length, true);
      ch.setUint32(42, off, true);
      cen.push(ch.buffer, nm);
      off += 30 + nm.length + size;
      onStep && onStep(i + 1, entries.length);
    }
    const cenSize = cen.reduce((a, b) => a + b.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, cenSize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...cen, end.buffer], { type: 'application/zip' });
  }
  // zip 파일 → Map(이름 → Blob). 담기만 한 zip만 읽는다. 내용은 통째로 안 읽고 잘라 가리키기만(메모리 적게)
  async function read(file) {
    const tailLen = Math.min(file.size, 65557);
    const tail = new DataView(await file.slice(file.size - tailLen).arrayBuffer());
    let p = -1;
    for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { p = i; break; }
    if (p < 0) throw new Error('zip 파일이 아니에요');
    const n = tail.getUint16(p + 10, true), cs = tail.getUint32(p + 12, true), co = tail.getUint32(p + 16, true);
    const cd = new DataView(await file.slice(co, co + cs).arrayBuffer());
    const out = new Map();
    for (let i = 0, q = 0; i < n; i++) {
      if (cd.getUint32(q, true) !== 0x02014b50) throw new Error('zip 목록이 깨졌어요');
      const method = cd.getUint16(q + 10, true), size = cd.getUint32(q + 20, true);
      const nl = cd.getUint16(q + 28, true), xl = cd.getUint16(q + 30, true), cl = cd.getUint16(q + 32, true), lo = cd.getUint32(q + 42, true);
      const name = dec.decode(new Uint8Array(cd.buffer, q + 46, nl));
      q += 46 + nl + xl + cl;
      if (name.endsWith('/')) continue;
      if (method !== 0) throw new Error('DuckQ에서 내보낸 파일이 아니에요(압축된 zip)');
      const lh = new DataView(await file.slice(lo, lo + 30).arrayBuffer());
      const start = lo + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
      out.set(name, file.slice(start, start + size));
    }
    return out;
  }
  return { make, read };
})();
