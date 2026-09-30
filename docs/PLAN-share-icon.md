# 공유 설명과 홈 화면 아이콘

## 된 것 (2026-09-30 배포, deploy-2026-09-30)
- 공유 문구: 제목 "DuckQ · 무료 공연 사운드보드" / 설명 "프로·아마추어 공연용 사운드보드. 설치 없이 폰·태블릿·노트북 어디서나."
- 그림은 **임시**: 덕구랩 뀨 스티커(눈 반짝) + 헤드폰·빨간 버튼·뒤집힌 Q·앞발을 합성. 정면 구도.
  파일: `app/og.png`(1200×630) · `icon-512/192.png` · `apple-touch-icon.png`(180) · `manifest.webmanifest`
- 만든 스크립트는 세션 임시 폴더에만 있었음. 다시 만들 땐 원본 그림 한 장에서 크기별로 잘라 내면 됨.

## 진짜 그림으로 교체 (2026-09-30, dev)
- 안티그래비티 그림 `docs/art/kkyu-cue-1024.png`(원본은 deokgu-lab/stickers/_ref/받은그림/큐버튼.png). 크기별 자르기는 `docs/art/make-icons.py`.
- 새 이름으로 교체(카톡 옛 미리보기 기억 때문): `og-kkyu.png` · `icon-kkyu-192/512.png` · `icon-kkyu-maskable.png`(원 모양용, 80%로 줄이고 가장자리 흐리게) · `apple-touch-icon-kkyu.png`. 임시 그림 4장은 지움.
- 남은 것: 배포 후 카톡·폰 확인. 그 다음 이 PLAN 완료.
