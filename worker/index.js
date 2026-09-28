// q.deokgu.com 중계: 집 PC(터널)가 켜져 있으면 PC로, 꺼져 있으면 GitHub Pages로.
// 문지기(Access)는 이 앞에서 먼저 로그인을 확인한다.
const FALLBACK = 'https://bau8584.github.io/duckq-board';

export default {
  async fetch(req) {
    try {
      const r = await fetch(req);                 // 원래 목적지 = 터널(집 PC)
      if (r.status < 500) return r;               // 530/502 등 = PC 꺼짐
    } catch (e) {}
    if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('PC off', { status: 503 });
    const url = new URL(req.url);
    return fetch(FALLBACK + url.pathname + url.search, { method: req.method });
  },
};
