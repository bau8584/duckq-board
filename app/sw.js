// 오프라인 저장: 앱 화면 파일을 아이패드에 담아 두고, 인터넷이 없어도 담아 둔 걸로 연다.
// 새 버전은 저절로 안 바뀐다 — 설정 [업데이트]를 눌러야 받는다(공연 중 갑자기 바뀌지 않게).
const PRE = 'duckq-app-';
const HOME = new URL('./', self.registration.scope).href;

// index.html을 새로 받아 그 안의 ?v= 파일들까지 전부 받은 뒤에만 새 상자로 바꾼다(반쯤 받은 채로 안 바뀜)
async function fill() {
  const r = await fetch(HOME, { cache: 'reload' });
  if (!r.ok) throw new Error('index ' + r.status);
  const html = await r.text();
  const ver = (html.match(/\?v=([\w.]+)/) || [])[1] || 'x';
  const urls = [...new Set([...html.matchAll(/(?:src|href)="([^"]+\?v=[^"]+)"/g)].map(m => new URL(m[1], HOME).href))];
  const got = await Promise.all(urls.map(async u => { const x = await fetch(u, { cache: 'reload' }); if (!x.ok) throw new Error(u + ' ' + x.status); return [u, x]; }));
  const name = PRE + ver, c = await caches.open(name);
  const page = () => new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  await c.put(HOME, page()); await c.put(HOME + 'index.html', page());
  for (const [u, x] of got) await c.put(u, x);
  for (const k of await caches.keys()) if (k.startsWith(PRE) && k !== name) await caches.delete(k);
  return { ver, n: got.length + 1 };
}

self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(fill().catch(() => {})); });
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('message', e => {
  if (e.data !== 'update') return;
  fill().then(r => e.source.postMessage({ update: true, ok: true, ...r }), err => e.source.postMessage({ update: true, ok: false, msg: String(err.message || err) }));
});

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.searchParams.has('fresh')) return;   // 기록 보내기·새 버전 확인은 그대로 인터넷으로
  e.respondWith((async () => {
    const hit = await caches.match(e.request) || (e.request.mode === 'navigate' ? await caches.match(HOME) : null);
    return hit || fetch(e.request);
  })());
});
