# DuckQ Board

극단용 사운드보드 웹앱. 지금은 **0단계 = 재생 엔진 검증** 중.

## 검증 페이지
- `test/engine.html` — 한 장짜리. 빌드 없음, 그대로 열면 됨.
- 계획·합격 기준: `docs/PLAN-engine-test.md`
- 기능 원본(관찰 사양): `docs/SPEC-observed.md`

## 기기에서 열기
1. GitHub Pages 켜기 (저장소 Settings → Pages → main / root)
2. `https://<계정>.github.io/duckq-board/test/engine.html` 열기
3. 사파리: 공유 → 홈화면에 추가. 안드로이드 크롬: 메뉴 → 홈 화면에 추가

## 로컬에서 보기
```
python -m http.server 8765
```
→ http://localhost:8765/test/engine.html

## 테스트 순서
1. ▶ 시작 → 파일 넣기(긴 곡 3개 + 효과음 20개 정도)
2. "마크 찍기"로 `T1 시작` 같은 표시 남기고 각 테스트 진행
3. 끝나면 "로그 저장" → `docs/engine-test-YYYY-MM-DD.md`에 붙이기
