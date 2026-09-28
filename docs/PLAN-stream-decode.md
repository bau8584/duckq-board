# PLAN — 긴 곡 '직접 풀기' 재생 (엔진 검증 0단계 안)

> ✅ **완료 2026-09-29** — 끝 기준 3개 통과(0.4.2). 결과·결론: `docs/engine-test-2026-09-28.md` 3회차. 남은 것 = hq 세션 판정.

> 2026-09-29 · 이전 세션 `[DuckQ] 엔진검증: T1 기록·로그 연결`에서 넘김
> 1단계(실제 앱) 코드 아님. **테스트 페이지(`test/engine.html`)에만** 넣는다. 판정은 hq 세션.

## 왜
iPad에서 긴 곡(스트림 = `<audio>` + 저장 파일 blob + Web Audio 연결)이 **시작 3.5~25초, 누르면 페이지가 1.5~6초 얼음**, play() 취소 반복. 0.3MB 곡도 같음 → 크기 아닌 방식 문제.
효과음(메모리 AudioBuffer)은 소리 6~7ms · 화면 반영 33~54ms로 문제없음.
기록: `docs/engine-test-2026-09-28.md` 2회차.

## 할 것
긴 곡을 `<audio>` 없이 **WebCodecs AudioDecoder로 조금씩 풀어** 작은 AudioBuffer 조각을 Web Audio 시간표에 이어 붙여 튼다. 페이드는 GainNode(효과음과 같은 길).
- iPad 지원(0.3.1 확인): mp3 ⭕ · aac(m4a) ⭕ · wav(pcm) ⭕ · opus ⭕ · flac ❌ · vorbis ❌
- 순서: **mp3 → wav → m4a**(m4a는 mp4 포장 풀기 도구 필요, 예: mp4box.js — cdnjs/jsdelivr만)
- 지원 안 되는 형식은 지금 `<audio>` 방식 그대로(느려도 틀리긴 함)
- 저장소 Blob을 `slice()`로 조금씩 읽기 → mp3 프레임 단위로 잘라 EncodedAudioChunk → 풀린 소리는 몇 초 앞서 예약, 메모리는 곡당 앞뒤 몇십 초만
- 테스트 페이지에 **방식 A(지금)/D(직접 풀기)** 를 골라 비교할 수 있게. 미션 T2가 두 방식을 각각 20회
- 이음새 확인용 **손 미션** 추가(귀로 "틱"·끊김)

## 끝 기준 (아이패드 화면으로 확인)
1. 긴 곡 패드 → **0.1초 안에 소리, 화면 안 멈춤** (T2 자동 20회, 화면 반영·메인스레드 멈춤 수치)
2. 50분 곡을 틀어도 **적재 표시가 곡당 수십 MB 이내**
3. 조각 이음새에서 **틱·끊김 없음** (손 미션 느낌 = 좋음)

## 버린 방법 (다시 꺼내지 말 것)
| 방법 | 버린 이유 |
|---|---|
| 긴 곡도 통째로 메모리(decodeAudioData) | 1분 ≈ 23MB, 50분 ≈ 1.1GB → 튕김. 300MB 경고선 |
| `<audio>` 볼륨으로 페이드 | iOS는 volume 읽기 전용(항상 1) |
| 사용자에게 mp3로 변환해서 넣게 | 관리자 손 늘어남(제작 철학 반대) |
| 넣을 때 앱 안에서 변환 | 긴 곡 변환에 몇 분 + 메모리 큼 |
| decodeAudioData로 30초씩 잘라 풀기(C안) | 가능하지만 조각마다 앞뒤 무음(인코더 지연)으로 이음새 문제. WebCodecs가 있으니 후순위. D가 막히면 여기로 |

D도 막히면: 쉬운 우회(`<source>` 자식으로 blob 넣기 · 미리 load()·canplay 대기 · Web Audio 연결 빼고 비교) → 그래도 안 되면 계획서의 Capacitor.

## 조사 출처
- Safari 26 WebCodecs AudioDecoder: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- iOS blob URL 로드 10초 제한·mediaplaybackd: https://github.com/WebKit/WebKit/pull/74641
- createMediaElementSource iOS 버그: https://bugs.webkit.org/show_bug.cgi?id=203435 · https://bugs.webkit.org/show_bug.cgi?id=211394
- blob URL 재생 문제(iOS 17.4.1, `<source>` 우회): https://developer.apple.com/forums/thread/751063
- iOS volume 읽기 전용: https://github.com/mdn/browser-compat-data/issues/13554
- 통째 풀기 메모리 튕김: https://github.com/goldfire/howler.js/issues/1151

## 환경 (이미 되어 있음)
- 아이패드는 **`https://q.deokgu.com/test/engine.html`** (문지기 "소유자만" 뒤, 이메일 코드 로그인) → 집 PC `test/log-server.py`(8765)가 화면을 내주고 로그를 **`logs/engine-YYYY-MM-DD.txt`에 자동 저장**. 로그 읽기는 이 파일로.
  - PC에서 서버 켜기: `.claude/launch.json`의 `static`(= `python test/log-server.py`) · 터널은 `C:\srv\local-backend` Docker(`q.deokgu.com → host.docker.internal:8765`)
- 테스트 페이지 0.3.1: 미션 판(T1~T12, 마크 자동·느낌 버튼), 화면 반영·끊긴 프레임 측정, 형식 지원 로그
- 남은 곁일: `worker/`(PC 꺼지면 GitHub Pages로 넘기는 중계) **아직 안 올림** — 올리기 전 소유자 승인 필요. GitHub Pages는 main이라 0.1 페이지가 뜸
