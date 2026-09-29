// 저장: 음원 파일은 IndexedDB('duckq-board'), 판(보드·패드·설정)은 localStorage 한 칸.
// 판 데이터엔 색 값이 아니라 색 이름만 넣는다(DESIGN §2) → 색 세트를 바꿔도 데이터는 그대로.
'use strict';
const Store = (() => {
  const KEY = 'duckq-board-v1';
  let db = null;
  function open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('duckq-board', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' });
      r.onsuccess = () => { db = r.result; res(db); };
      r.onerror = () => rej(r.error);
    });
  }
  function tx(mode, fn) {
    return new Promise((res, rej) => {
      const t = db.transaction('files', mode), req = fn(t.objectStore('files'));
      t.oncomplete = () => res(req && req.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  return {
    open,
    putFile: rec => tx('readwrite', s => s.put(rec)),
    allFiles: () => tx('readonly', s => s.getAll()),
    delFile: id => tx('readwrite', s => s.delete(id)),
    loadState() { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } },
    saveState(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; } },
  };
})();
