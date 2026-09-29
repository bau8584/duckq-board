# DESIGN 조사 — 하드웨어 패드 톤 (DuckQ Board)

> 2026-09-29 · DESIGN.md를 쓰기 전 수집 자료. 결정 = 방향 A "하드웨어 패드" (가시성·실용성 1순위, 디자인은 방해 안 되는 선에서).
> 출처는 웹 검색 결과 요약 기준. 값(색·수치)은 시안에서 실제 화면으로 다시 확인한다.

## 1. 참고 앱(Soundboard Studio) 캡처에서 읽은 구조 (`docs/reference/`, git 제외)
| 관찰 | 디자인에 주는 것 |
|---|---|
| 배경 거의 검정, 패드는 한 단계 밝은 진회색 | 껍데기는 조용하게. 색은 패드 안에만 |
| 패드 위 작은 아이콘 5개(페이드인·솔로·루프·다음·페이드아웃) — **켜진 것만 밝게** | 상태 표시 = 밝기 차이. 색을 새로 쓰지 않는다 |
| 라벨 가운데 큼직, 아래 `00:00 · PLAYED · -13:55` 작게 | 위계: 라벨 ≫ 시간. 시간은 숫자 고정폭 |
| 설정 = iOS식 목록·토글 팝오버 | 설정 창은 익숙한 목록형으로. 여기에 글래스 약하게 |
| 하단: ⏸ ■ ◣ 큰 버튼 3개 오른쪽, MASTER 세로 슬라이더 오른쪽 끝 | 엄지가 닿는 자리. 버튼은 크게 |
| 보드 탭은 알약 모양, 상단 아이콘 버튼은 작음 | 편집 관련은 작게 = 공연 중 오작동 방지 |
- 사운드별 색·보드별 색 조정이 실제 앱에 있었다는 소유자 증언. SPEC엔 패드 8색만 → **보드 색 방식은 미확인**(SPEC에 추가 필요).

## 2. 조사 결과
### 2-1. 유사 앱 (Farrago·Go Button·Audio Cues)
- Farrago: 타일 격자 + **패드별 이름·색 지정**, "공연 중 색으로 위치 파악"이 가장 큰 장점으로 꼽힘. 다크 테마를 극장·스튜디오용으로 내세움. → **색은 장식이 아니라 찾기 도구**. 사용자가 고르는 색이 주인공.
- 극장용 iPad 앱들(Go Button·Audio Cues)은 리스트/큐 방식 위주. 패드 격자 + 색 고르기는 우리가 따라가는 쪽(Soundboard Studio·Farrago)과 같다.

### 2-2. 하드웨어 패드 (Push·Launchpad·MPC)
- Push 색 팔레트는 "밝은 회색 → 연한 색 → 진한 최대/중간/낮은 밝기" 묶음. 128색이 있어도 **비슷해서 구분이 어렵다**는 평. → 색 수는 적을수록 좋다(8색 유지).
- 패드 = 불투명 고무 + 아래층이 빛나는 구조. 켜짐은 **밝기 단계**로 표현. → 재생 중 = 패드가 안에서 빛나고 테두리가 밝아짐. 꺼짐 = 같은 색이 어둡게(아예 회색으로 바뀌지 않음).

### 2-3. 어두운 화면 원칙
- 순백(#FFF)은 어두운 곳에서 번지고, 순흑(#000)은 작은 글자를 번져 보이게 함 → **살짝 띄운 검정/회색**과 **살짝 눌린 흰색**.
- 그림자는 어두운 바탕에서 약하다 → **깊이는 면의 밝기 차(단계)와 위쪽 하이라이트**로 만든다.
- 글자 대비 4.5:1(작은 글씨)·3:1(큰 글씨·UI) 이상. 실제 조명 환경(무대·햇빛)에서 확인 필요.

### 2-4. 눌린 느낌(하드웨어 버튼) CSS 기법
- 볼록: 위쪽 안쪽 하이라이트 + 아래쪽 안쪽 어둠 + 바깥 접촉 그림자.
- 눌림: 그림자가 안쪽으로 뒤집히고 2px 정도만 내려감. **움직임은 작게, 빛 방향만 뒤집기.**
- **상태를 그림자로만 표시하면 안 됨**(접근성 기준). 재생 중은 테두리 밝기·진행 바·글자로도 함께 표시.

### 2-5. 사용자가 고르는 색 대응
- 8색 = SPEC 목록(회·자주·주황·초록·빨강·파랑·노랑·하늘)이 **Okabe-Ito 색각이상 안전 팔레트**와 1:1로 대응된다: 회색(검정 자리)·reddish purple·orange·bluish green·vermillion·blue·yellow·sky blue. 밝기 폭이 넓어 색이 뭉개져도 구분됨.
  값 후보: `#E69F00` `#56B4E9` `#009E73` `#F0E442` `#0072B2` `#D55E00` `#CC79A7` + 회색. (어두운 바탕용으로 시안에서 조정)
- **글자색은 색 위에서 자동 결정**: 흰/검 중 대비가 높은 쪽을 앱이 계산. CSS `contrast-color()`는 2026-04 기준 최신 사파리(26)부터라 **구형 iPad 대응은 JS 계산이 안전**. 중간 톤 배경은 흰/검 어느 쪽도 애매 → 8색은 미리 검증한 값으로 고정하고, 임의 색 선택은 후순위.
- 보드 색: 패드색과 싸우지 않게 **탭·배경 톤에 채도 낮게** 입히는 방향(미확인 사양).

## 3. DESIGN.md에 넘길 결정 후보
1. 바탕 3단계(가장 어두움 / 패드 판 / 패드 바닥) — 순흑 X.
2. 패드: 불투명, 색 8종 × 상태 3(대기·재생 중·재생됨).
3. 재생 중 표시: 테두리 밝기 + 진행 바 + 안쪽 빛. 색상 추가 없음. (강조색 노랑 여부는 패드 노랑과 겹치므로 재검토 → 흰빛 테두리 후보)
4. 글자: 라벨 큼직, 시간 고정폭 숫자, 시스템 한글 글꼴 + 굵기로 위계.
5. 껍데기(상단바·하단 컨트롤·설정): 불투명에 가까운 어두운 면, 유리는 설정 팝오버에만 약하게.
6. 눌림 반응 즉시(지연 0), 크기 변화 최소.

## 4. 출처
- [Six Colors — Farrago](https://sixcolors.com/post/2018/01/farrago-is-a-powerful-soundboard-for-podcasters-live-performers/) · [Rogue Amoeba Farrago](https://rogueamoeba.com/farrago/)
- [Ableton Forum — Push 색 팔레트](https://forum.ableton.com/viewtopic.php?t=192920) · [Sonic Bloom — Push 색 구성](https://sonicbloom.net/ableton-live-tutorial-create-your-own-colour-scheme-for-ableton-push/)
- [Uxcel — 다크모드 12원칙](https://uxcel.com/blog/12-principles-of-dark-mode-design-627) · [Acodez — 다크모드 UX](https://acodez.in/dark-mode-ui-ux-designing/)
- [Superdesign — 스큐어모피즘 CSS](https://superdesign.dev/styles/skeuomorphism) · [CodeFronts — 눌림 효과](https://codefronts.com/motion/css-button-hover-effects/modern-3d-skeuomorphic-button-press-effects/)
- [MDN — contrast-color()](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/contrast-color) · [WebAIM — 대비](https://webaim.org/articles/contrast/)
- [Okabe-Ito 팔레트](https://sci-draw.com/blog/colorblind-safe-palettes-okabe-ito-reference)
