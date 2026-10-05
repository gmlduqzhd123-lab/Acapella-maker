# AcaScore AI

듣던 음악을, 부를 수 있는 악보로.

React · TypeScript · Vite 기반 GitHub Pages 전용 정적 웹앱입니다. 현재 릴리스는 **0.2.0: 실제 BPM·Key 자동 분석**입니다. AI가 초안을 만들고 사람이 음악을 완성합니다.

## 실제 구현 상태

- WAV·MP3 선택 및 Drag & Drop, Web Audio API 디코딩
- 파일명·재생 시간·크기·포맷·채널 표시
- 원본 재생·일시정지·탐색·음량, Worker 기반 실제 PCM 파형
- 모든 채널을 평균한 mono 분석 입력 (청크마다 UI 실행 기회 제공)
- 전용 Worker에서 실제 BPM·Key 분석, 진행률, 신뢰도, BPM 후보
- BPM 40–240 사용자 수정, 12 Root × Major/Minor 수정, 각각 자동값 복원
- 분석 취소, 다른 파일 선택·제거·unmount 시 작업 정리, 이전 작업 결과 차단
- 무음·단일음·근거 부족은 “추정 불가” 표시와 직접 입력 안내
- 오류 복구·모바일 UI·GitHub Pages 하위 경로

**아직 구현하지 않은 기능:** Pitch Detection/Basic Pitch, NoteEvent 자동 생성, Piano Roll, Quantization, 악보 생성·MIDI·NWCTXT·MusicXML 내보내기, IndexedDB, YouTube, M4A·OGG·MP4 지원. 분석 결과의 notes는 아직 음표 분석을 하지 않았다는 뜻의 빈 배열입니다.

## 로컬 실행과 검사

Node.js 22.12 이상 또는 24 LTS.

```sh
npm ci
npm run dev
```

표시한 주소의 /Acapella-maker/ 경로에 접속합니다.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run preview
```

Windows의 설치된 Edge로 실행하려면:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
```

제품에는 별도 서버가 없습니다. Vite 서버는 개발·정적 빌드 미리보기에만 사용합니다. ES modules/Worker를 사용하므로 file:// 실행은 지원하지 않습니다.

## 사용 방법

1. WAV 또는 MP3를 선택하거나 파일을 놓습니다.
2. 원본 음원을 재생하여 확인합니다.
3. **음악 분석 시작**을 누릅니다. 음원 준비 → BPM → Key 진행률을 표시합니다.
4. 왼쪽 **자동 분석 결과**의 BPM 또는 Key를 눌러 편집하고 적용합니다.
5. **자동값으로 되돌리기**로 각 분석값을 복원합니다. 재분석은 새 자동 결과가 완료될 때 기존 수정값을 초기화합니다.
6. 분석 취소 버튼으로 Worker를 종료합니다. 이미 완료된 결과가 있다면 취소·실패 시 그 결과는 유지합니다. 새로운 파일이 성공적으로 준비되면 결과·수정값을 초기화합니다.

## 분석 방식과 데이터 계약

- **BPM:** 로그 스펙트럼의 양의 변화량인 spectral flux로 onset novelty 생성 → 국소 평균 제거 → 정규화 자기상관 → onset 간격·회귀를 함께 비교합니다. 분석 범위는 40–240 BPM이며 후보를 유지합니다. 자동 분석의 원래 실수 값은 저장하고, UI에서는 소수점 한 자리로 표시합니다.
- **Key:** Hann window → 자체 radix-2 FFT → 보간한 스펙트럼 피크 → pitch class/Chroma를 음원 전체에 걸쳐 누적 → Krumhansl–Kessler 장·단조 프로파일 24개와 Pearson 상관을 비교합니다. 짧은 인트로의 단일 주파수만으로 조성을 결정하지 않습니다.
- **신뢰도:** BPM 주기·간격 일치도, Key 프로파일 일치도·차순위 차이·음계 정보량을 이용한 0–1 휴리스틱입니다. 보정된 정답 확률이 아닙니다. 0.55 미만이거나 추정 불가일 때 확인 안내를 표시합니다.
- **경로:** LoadedAudio.buffer → createAnalysisInput → analysis.worker → AnalysisResult → effectiveResult. 이후 악보 단계에서는 effectiveResult의 수정된 BPM/Key를 사용합니다.
- **명시적 부재:** AnalysisResult의 필드명은 유지하되 bpm/key를 nullable로 확장했습니다. null은 실제 PCM에서 근거를 찾지 못했다는 뜻입니다. 가짜 기본 BPM/Key를 반환하지 않습니다.
- **수정값의 신뢰도:** 원래 자동 신뢰도는 별도 유지하며, 수동으로 선택한 Key를 자동으로 검증했다고 표시하지 않습니다.
- **취소:** 준비 단계는 AbortSignal, 실행 중인 Worker는 terminate로 중단합니다. 작업 ID와 generation 검사로 늦은 응답을 무시합니다.
- **성능:** FFT 테이블 재사용, 청크 단위 준비, mono 버퍼 transferable 전달, Key 최대 약 1,800개 프레임으로 전체 구간을 고르게 분석합니다.

설계 참고: [템포의 자기상관](https://musicinformationretrieval.com/content/4_rhythm_tempo_beat/tempo_estimation.html), [music21 Krumhansl–Schmuckler](https://music21.org/music21docs/moduleReference/moduleAnalysisDiscrete.html), [Essentia KeyExtractor의 tonal 특징 설명](https://essentia.upf.edu/reference/std_KeyExtractor.html). 이 도구들의 코드를 가져오거나 런타임에 호출하지 않습니다.

## 외부 라이브러리와 라이선스

새 DSP·AI·WASM 런타임 라이브러리는 추가하지 않았습니다. FFT·템포·Chroma·프로파일 매칭은 프로젝트 내부 구현입니다.

| 라이브러리        | 용도                           | 라이선스                    |
| ----------------- | ------------------------------ | --------------------------- |
| React / React DOM | 앱 UI                          | MIT                         |
| Vite              | 개발·정적 번들                 | MIT                         |
| TypeScript        | 타입 검사                      | Apache-2.0                  |
| Playwright        | 개발용 브라우저 검사           | Apache-2.0                  |
| lamejs            | 테스트 PCM을 실제 MP3로 인코딩 | LGPL-3.0 (package metadata) |

lamejs와 테스트 신호는 앱 번들에 포함되지 않습니다. 모델 다운로드·API Key·GPU·외부 분석 서비스가 필요하지 않습니다.

## 테스트의 범위

tests/musicSignals.ts에서 실제 클릭 PCM(40·60·90·120·150·180·240 BPM)과 C Major·A Minor·G Major·E♭ Major·D♭ Major 코드 진행을 생성합니다. tests/fixtures.ts는 실제 MP3 파일을 인코딩합니다. 단위 검사 허용 오차는 ±2 BPM이며, 구체적인 결과는 테스트 출력에 기록됩니다.

Playwright는 실제 WAV/MP3 선택·디코딩·Worker 분석·수정·복원, 외부 HTTP 전송 부재, 10분 음원 분석 중 rAF 응답성·진행률·취소·교체·제거, 무음과 Worker 실패를 검증합니다. 기존 업로드·재생·일시정지·탐색·Drag & Drop·파형·오류·모바일·새로고침 검사를 유지했습니다.

이 검사는 알고리즘의 합성 신호·파일 처리 근거입니다. 다양한 상용 곡에 대한 정확도 벤치마크를 의미하지 않습니다.

## GitHub Pages 배포

[저장소](https://github.com/gmlduqzhd123-lab/Acapella-maker) · [서비스](https://gmlduqzhd123-lab.github.io/Acapella-maker/)

Settings → Pages → Source: **GitHub Actions**. main push 후 .github/workflows/pages.yml이 린트·타입 검사·단위 검사·빌드·Chromium E2E 검사 후 dist를 GitHub Pages에 배포합니다.

vite.config.ts는 configure-pages의 base_path를 사용하고, 기본 경로는 /Acapella-maker/ 입니다. JS/CSS·favicon·파형 Worker·분석 Worker를 이 경로 아래에서 로드합니다. 사용자 사이트·사용자 정의 도메인은 PAGES_BASE_PATH=/ 로 빌드할 수 있습니다. 라우터를 쓰지 않아 루트 화면 새로고침 시 별도 404 처리가 필요하지 않습니다.

[공식 Vite Pages 설정 문서](https://vite.dev/guide/static-deploy.html#github-pages).

## 현재 제한

- 50 MiB·10분, 디코딩 PCM 128 MiB. 22,050 Hz 분석 PCM을 유지하며 원본 오디오는 그대로 재생합니다.
- 음악 파일은 메모리와 object URL에서만 처리합니다. 외부 서버로 전송하지 않으며 새로고침 후 다시 선택해야 합니다.
- 박자 없는 음원, 강한 세분박, 변박·템포 변화에는 대표 BPM/반속·배속 오류가 발생할 수 있습니다.
- 전조·모호한 장단조·조성 밖 음악·강한 잡음·비표준 튜닝에서는 Key가 불명확할 수 있습니다. 단일 global Key이며 구간별 전조 분석을 하지 않습니다.
- 채널 평균으로 mono를 만들므로 역상 스테레오에서는 일부 소리가 상쇄될 수 있습니다.
- PC Chrome/Edge 우선. 시스템 차원의 메모리 강제 종료까지 복구를 보장할 수는 없습니다.
- Worker 실행 시간은 90초 한도로 관리하며 오류 후 재시도할 수 있습니다.

## 모듈

```text
src/
  audio/       로컬 검증·디코딩·메타데이터
  analysis/    PCM 준비·FFT·BPM·Key·Worker 실행·수정값 계약
  music/       NoteEvent·MusicalKey·일반적인 조표 이름
  score/       후속 ScoreData 계약
  export/      후속 ScoreExporter 계약
  storage/     후속 ProjectData 계약
  workers/     파형 및 BPM/Key 분석 Worker
  components/  기존 오디오 UI 및 분석 컨트롤·편집 UI
tests/         실제 PCM·WAV·MP3 검사
docs/          설계 기준·현재 구현 및 다음 단계
```

다음 Basic Pitch 단계는 같은 AnalysisInput을 이용하고 AnalysisResult.notes를 실제 결과로 채울 수 있습니다. 원본 AudioBuffer가 유지되므로 transfer된 mono 입력을 다시 만들 수 있습니다. 모델·추론·NoteEvent 생성은 아직 구현하지 않았습니다.
