# AcaScore AI

듣던 음악을, 부를 수 있는 악보로.

React · TypeScript · Vite 기반 GitHub Pages 전용 정적 웹앱입니다. 현재 릴리스는 **0.5.0: Piano Roll Quantization**입니다. AI가 초안을 만들고 사람이 음악을 완성합니다.

## 실제 구현 상태

- WAV·MP3 선택 및 Drag & Drop, Web Audio API 디코딩
- 파일명·재생 시간·크기·포맷·채널 표시
- 원본 재생·일시정지·탐색·음량, Worker 기반 실제 PCM 파형
- 모든 채널을 평균한 mono 분석 입력 (청크마다 UI 실행 기회 제공)
- 전용 Worker에서 실제 BPM·Key 분석, 진행률, 신뢰도, BPM 후보
- BPM 40–240 사용자 수정, 12 Root × Major/Minor 수정, 각각 자동값 복원
- 공식 Spotify Basic Pitch 1.0.1·TensorFlow.js 3.21.0 모델로 실제 NoteEvent 생성
- 모델과 AI 코드 지연 로딩, 같은 사이트의 모델 GET, WebGL Worker·CPU 대체 실행
- 음표 개수·음역·평균 AI 음표 강도와 첫 30개 음표 확인
- 재분석 시 BPM/Key 사용자 수정값 유지, 정상 완료된 모델 재사용
- 분석 취소, 다른 파일 선택·제거·unmount 시 작업 정리, 이전 작업 결과 차단
- 무음·단일음·근거 부족은 “추정 불가” 표시와 직접 입력 안내
- 오류 복구·모바일 UI·GitHub Pages 하위 경로

**아직 구현하지 않은 기능:** 악보 렌더링·MIDI·NWCTXT·MusicXML 내보내기, SATB 성부 분리·자동 편곡·Source Separation, IndexedDB, YouTube, M4A·OGG·MP4 지원. Basic Pitch는 SATB 분리기가 아니며 모든 감지 음표는 하나의 polyphonic note cloud입니다.

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
3. **음악 분석 시작**을 누릅니다. 음원 준비 → BPM → Key → AI 모델 → Pitch → 음표 정리 진행률을 표시합니다. 초기 화면에서는 모델을 미리 받지 않습니다.
4. 왼쪽 **자동 분석 결과**의 BPM 또는 Key를 눌러 편집하고 적용합니다.
5. **자동값으로 되돌리기**로 각 분석값을 복원합니다. 재분석에도 사용자 수정값은 유지합니다. 새 파일이 성공적으로 준비되거나 제거될 때 초기화합니다.
6. 분석 취소 버튼으로 Worker를 종료합니다. 이미 완료된 결과가 있다면 취소·실패 시 그 결과는 유지합니다. 새로운 파일이 성공적으로 준비되면 결과·수정값을 초기화합니다.

## 분석 방식과 데이터 계약

- **BPM:** 로그 스펙트럼의 양의 변화량인 spectral flux로 onset novelty 생성 → 국소 평균 제거 → 정규화 자기상관 → onset 간격·회귀를 함께 비교합니다. 분석 범위는 40–240 BPM이며 후보를 유지합니다. 자동 분석의 원래 실수 값은 저장하고, UI에서는 소수점 한 자리로 표시합니다.
- **Key:** Hann window → 자체 radix-2 FFT → 보간한 스펙트럼 피크 → pitch class/Chroma를 음원 전체에 걸쳐 누적 → Krumhansl–Kessler 장·단조 프로파일 24개와 Pearson 상관을 비교합니다. 짧은 인트로의 단일 주파수만으로 조성을 결정하지 않습니다.
- **신뢰도:** BPM 주기·간격 일치도, Key 프로파일 일치도·차순위 차이·음계 정보량을 이용한 0–1 휴리스틱입니다. 보정된 정답 확률이 아닙니다. 0.55 미만이거나 추정 불가일 때 확인 안내를 표시합니다.
- **경로:** LoadedAudio.buffer → createAnalysisInput → analysis.worker (BPM/Key, PCM 반환) → pitch.worker (모델/추론/음표) → AnalysisResult → effectiveResult. mono PCM은 transferable로 이어 전달하며 중복 resampling하지 않습니다. 후속 악보는 effectiveResult의 수정된 BPM/Key와 editor.notes(WorkingNotes)를 사용합니다. AnalysisResult.notes는 AI 원본입니다.
- **명시적 부재:** AnalysisResult의 필드명은 유지하되 bpm/key를 nullable로 확장했습니다. null은 실제 PCM에서 근거를 찾지 못했다는 뜻입니다. 가짜 기본 BPM/Key를 반환하지 않습니다.
- **수정값의 신뢰도:** 원래 자동 신뢰도는 별도 유지하며, 수동으로 선택한 Key를 자동으로 검증했다고 표시하지 않습니다.
- **취소:** 준비 단계는 AbortSignal, 실행 중인 Worker는 terminate로 즉시 중단합니다. 작업 ID와 generation 검사로 늦은 응답을 무시합니다. Basic Pitch의 자체 Abort API에 의존하지 않습니다. 정상 완료 후 idle Pitch Worker를 재사용하며, 추론 취소·실패 후에는 새 Worker와 모델이 필요합니다. unmount 시 idle 모델도 정리합니다.
- **성능:** FFT 테이블 재사용, 청크 단위 준비, mono 버퍼 transferable 전달, Key 최대 약 1,800개 프레임으로 전체 구간을 고르게 분석합니다.

설계 참고: [템포의 자기상관](https://musicinformationretrieval.com/content/4_rhythm_tempo_beat/tempo_estimation.html), [music21 Krumhansl–Schmuckler](https://music21.org/music21docs/moduleReference/moduleAnalysisDiscrete.html), [Essentia KeyExtractor의 tonal 특징 설명](https://essentia.upf.edu/reference/std_KeyExtractor.html). 이 도구들의 코드를 가져오거나 런타임에 호출하지 않습니다.

## 외부 라이브러리와 라이선스

FFT·템포·Chroma·Key 프로파일 매칭은 프로젝트 내부 구현입니다. Pitch에만 공식 Basic Pitch·TensorFlow.js를 추가했습니다. [공식 Basic Pitch](https://github.com/spotify/basic-pitch-ts)와 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)를 참고하세요.

| 라이브러리                 | 용도                               | 라이선스                    |
| -------------------------- | ---------------------------------- | --------------------------- |
| React / React DOM          | 앱 UI                              | MIT                         |
| Vite                       | 개발·정적 번들                     | MIT                         |
| TypeScript                 | 타입 검사                          | Apache-2.0                  |
| Playwright                 | 개발용 브라우저 검사               | Apache-2.0                  |
| lamejs                     | 테스트 PCM을 실제 MP3로 인코딩     | LGPL-3.0 (package metadata) |
| @spotify/basic-pitch 1.0.1 | 공식 모델·다성 추론·공식 음표 변환 | Apache-2.0                  |
| @tensorflow/tfjs 3.21.0    | WebGL·CPU 브라우저 추론            | Apache-2.0                  |
| @tonejs/midi 2.0.28        | Basic Pitch의 전이 의존성          | MIT                         |

lamejs와 테스트 신호는 앱 번들에 포함되지 않습니다. API Key·외부 분석 서비스·WebGPU가 필요하지 않습니다. 공식 모델 파일만 현재 사이트에서 GET으로 내려받습니다. GPU가 없으면 CPU Worker를 사용합니다.

## Basic Pitch 구현과 호환성

- 공식 모델을 public/models/basic-pitch/model.json (174,537 bytes), group1-shard1of1.bin (742,392 bytes)에 동기화합니다. 합계 916,929 bytes. 생성 파일은 Git에서 제외하고 predev/prebuild가 설치된 고정 버전 패키지에서 복사합니다. npm ci 후 npm run dev/build로 재현됩니다.
- import.meta.env.BASE_URL을 사용하여 /Acapella-maker/models/basic-pitch/model.json URL을 생성합니다. 모델과 shard는 같은 origin에서만 GET하며 redirect와 외부 요청을 거부합니다.
- Pitch Worker가 만들어져 model 단계에 진입한 뒤 dynamic import('@spotify/basic-pitch')와 dynamic import('@tensorflow/tfjs')를 실행합니다. AI chunk는 초기 HTML의 script/modulepreload에 포함되지 않습니다.
- OffscreenCanvas WebGL을 우선 사용하고 지원되지 않으면 CPU로 실행합니다. WebGPU·WASM·외부 CDN이 필요하지 않습니다. TensorFlow.js 3.21 Browser Platform의 타이머가 Worker에서 window를 참조하는 문제는 공개 env().setPlatform API의 Worker 타이머·fetch 어댑터로 해결했습니다. 패키지를 수정하지 않습니다.
- mono Float32Array, 22,050 Hz, finite -1~1 PCM과 길이를 추론 전에 검증합니다. 전체 채널 평균을 재사용합니다.
- evaluateModel → outputToNotesPoly → noteFramesToTime의 공식 API를 사용합니다. onset 0.5, frame 0.3, 최소 5 frames. Pitch bends는 이번 버전에서 계산하지 않습니다.
- 30초 core와 양쪽 0.5초 context로 실행하고, 프레임·onset은 구간별 처리합니다. contours는 저장하지 않습니다. 공식 evaluator의 임시 tensor를 구간별 engine scope로 정리하며 모델 가중치는 유지합니다. 경계에서 잘린 같은 음은 이어 붙입니다. 긴 지속음이나 경계의 반복 공격은 분절/병합 오차가 생길 수 있습니다.
- startTimeSeconds→start, durationSeconds→duration, pitchMidi→midi. amplitude를 0~1로 clamp하여 confidence에 보존하고 velocity=round(amplitude×127)로 변환합니다. **AI 음표 강도는 보정된 정답 확률이 아닙니다.**
- 비정상 수치·MIDI·시간은 제외하고 작은 경계 오차를 clip합니다. 시작순·MIDI순으로 정렬하여 bp-000001 형태의 안정적인 ID를 만듭니다.
- 모델 실패 시 재시도가 가능하며 BPM/Key 중간 결과와 원본 재생은 유지합니다. 완료된 notes가 빈 배열이면 실제 추론에서 뚜렷한 음표를 찾지 못한 것입니다. pitch metadata가 없으면 추론이 완료되지 않은 중간 결과입니다.
- 빌드 참고: 초기 JS 약 252 KB, TensorFlow lazy chunk 약 1.83 MB, Basic Pitch lazy chunk 약 37 KB, Pitch Worker 약 4.7 KB (비압축). 실제 asset 이름과 수치는 빌드 출력으로 확인합니다.

## 테스트의 범위

tests/musicSignals.ts에서 실제 클릭 PCM(40·60·90·120·150·180·240 BPM)과 C Major·A Minor·G Major·E♭ Major·D♭ Major 코드 진행을 생성합니다. tests/fixtures.ts는 실제 MP3 파일을 인코딩합니다. 단위 검사 허용 오차는 ±2 BPM이며, 구체적인 결과는 테스트 출력에 기록됩니다.

Playwright는 실제 WAV/MP3 선택·디코딩·Worker 분석·수정·복원, 외부 HTTP 전송 부재, 10분 음원 분석 중 rAF 응답성·진행률·취소·교체·제거, 무음과 Worker 실패를 검증합니다. 기존 업로드·재생·일시정지·탐색·Drag & Drop·파형·오류·모바일·새로고침 검사를 유지했습니다.

Pitch 검사는 attack/decay/harmonics가 있는 직접 생성한 C4→E4→G4→C5 melody와 C4/E4/G4 동시 화음, 실제 WAV·MP3를 공식 모델에 입력합니다. 무음, 30·60·180초 추론, tensor 수, rAF·재생·스크롤·진행률, CPU 대체 실행, 모델 실패 후 재시도, 수정값 유지와 모델 재사용, Pitch 중 취소·교체·제거를 확인합니다. 추론 시간과 실제 검출 MIDI는 테스트 출력에 기록합니다. 상용 음원은 커밋하지 않습니다.

이 검사는 알고리즘의 합성 신호·파일 처리 근거입니다. 다양한 상용 곡에 대한 정확도 벤치마크를 의미하지 않습니다.

### 2026-10-05 로컬 Edge 참고 측정

이 컴퓨터의 headless Edge·WebGL에서 직접 만든 음악 신호를 실제 모델에 입력한 결과입니다. 시간은 Pitch 추론만이며 업로드·디코딩·BPM/Key·음표 정리를 제외합니다. 브라우저·GPU·컴파일 캐시에 따라 크게 달라집니다. 초기 별도 검증의 첫 추론은 7.50초였습니다.

| 입력             | Pitch 시간 | 음표 | 실제 검출                  |
| ---------------- | ---------: | ---: | -------------------------- |
| 10초 WAV melody  |    1.202초 |    5 | MIDI 60,64,67,72,60        |
| 10초 MP3 melody  |    1.043초 |    5 | MIDI 60,64,67,72,60        |
| 같은 WAV 재분석  |    0.273초 |    5 | 동일, 모델 GET 없음        |
| 6초 C Major 화음 |    0.926초 |   12 | 60,64,67 외 86 오검출 포함 |
| 30초 melody      |    1.587초 |   15 | 합성 melody 반복           |
| 60초 melody      |    1.715초 |   30 | 합성 melody 반복           |
| 180초 melody     |    4.652초 |   90 | 합성 melody 반복           |

10초 WAV/MP3 두 검사 평균 Pitch 시간은 1.123초, 평균 첫 모델 준비(dynamic import 포함)는 약 118 ms입니다. 구간 처리 전후 tensor 수는 245개로 동일했습니다. 분석 중 최대 rAF 간격은 30·60·180초 검사에서 각각 약 67·83·50 ms였습니다. 이것은 텐서 수·화면 응답성 근거이며 최대 RAM/VRAM 사용량 측정은 아닙니다. 무음 검출은 0개, CPU 대체 실행도 실제 추론으로 검증했습니다. 화음의 추가 MIDI 86처럼 불필요한 음표가 나올 수 있습니다.

GitHub headless Chromium의 WebGL 측정에서는 동일한 10초 WAV/MP3 추론이 각각 18.99·18.98초였습니다. 검출 MIDI·음표 수·tensor 수는 동일했습니다. 환경에 따른 시간 차이를 반영해 기존 BPM/Key 회귀의 전체 추론 대기시간은 120초, 3분 검사 대기시간은 480초로 조정했습니다. 실제 검출·시간 범위·메모리·화면 응답성·진행률·네트워크 assertion은 그대로 유지합니다.

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
- BPM/Key Worker는 90초 한도입니다. Pitch는 CPU 실행을 고려해 max(120초, 음원 길이×20) 한도를 두며 언제든 취소할 수 있습니다.
- Pitch는 우선 3분 이내를 권장합니다. 업로드 10분 제한은 유지하지만 10분 전체 Pitch 추론의 속도·정확도·브라우저별 최대 메모리는 아직 검증하지 않았습니다. 10분 BPM/Key 중 취소 검사는 별도 회귀 검사입니다.

## 모듈

```text
src/
  audio/       로컬 검증·디코딩·메타데이터
  analysis/    PCM 준비·FFT·BPM·Key·Worker 실행·수정값 계약
  pitch/       공식 모델 로더·구간별 추론·NoteEvent mapper·캐시 Worker client
  music/       NoteEvent·MusicalKey·일반적인 조표 이름
  editor/      AI 원본과 WorkingNotes 분리·history·편집 범위 보호
  quantization/ PPQ·초/tick·박자표·grid·음가·tie·preview·issues·Snap
  score/       후속 ScoreData 계약
  export/      후속 ScoreExporter 계약
  storage/     후속 ProjectData 계약
  workers/     파형·BPM/Key·Pitch Worker
  components/  기존 오디오 UI 및 분석 컨트롤·편집 UI
tests/         실제 PCM·WAV·MP3 검사
docs/          설계 기준·현재 구현 및 다음 단계
```

다음 단계는 WorkingNotes와 유효한 박자 정리 결과를 입력으로 MIDI/NWCTXT를 구현하는 것입니다. 악보 렌더링·성부 분리·내보내기는 현재 구현하지 않습니다.

## 4단계 Piano Roll Editor (0.4.0)

✅ WAV / MP3 · BPM · Key · Basic Pitch · NoteEvent · Piano Roll · Note Select · Pitch Edit · Timing Edit · Duration Edit · Add/Delete · Undo/Redo

4단계 당시 미구현: Quantization · MIDI · NWCTXT · 악보 렌더링 · SATB · 자동 편곡. Quantization은 아래 5단계에서 추가했습니다.

- 분석 완료 후 Piano Roll 탭에서 편집합니다. 초 단위 자유 편집을 유지하며 5단계의 Snap은 기본 OFF입니다.
- `AnalysisResult.notes`는 AI 원본입니다. `useNoteEditor`가 깊이 복제한 정렬된 `notes`가 WorkingNotes입니다. 후속 단계는 WorkingNotes를 소비해야 합니다.
- `metadata[id]`에 origin(ai/manual), edited를 분리합니다. 직접 추가한 음표는 NoteEvent 계약상 confidence=1이지만 UI에서는 ‘직접 추가’로 표시합니다. AI 정답 확률로 표현하지 않습니다.
- CSS 반복 배경으로 그리드, 현재 viewport의 건반/눈금/음표만 DOM 렌더링합니다. 선택 음표 한 개는 화면 밖에서도 유지해 pointer capture와 selection을 보호합니다. 전체 음역 0–127로 세로 탐색 가능하며 PC에는 최소 두 옥타브가 보입니다.
- 음표 몸통을 드래그하면 시간/반음 이동, 양쪽 handle로 길이 조절합니다. 드래그 중 로컬 preview만 표시하고 pointerup 한 번에 history 1개를 저장합니다. Escape/pointercancel은 미리보기를 버립니다. Pointer capture로 영역 밖에서도 gesture를 마칩니다.
- Inspector에서 MIDI/시작/길이를 즉시 입력합니다. 모든 편집은 MIDI 0–127, 시작≥0, 끝≤원본 음원 길이를 지킵니다. 길이 변경 최소 0.03초. 기존 AI의 짧은 음표는 원래 길이로 보존합니다.
- 빈 공간을 음표 추가 모드로 클릭하면 기본 0.5초 음표 생성, manual-000001부터 단조 증가하며 삭제/Undo/AI 복원으로 ID를 재사용하지 않습니다. 새 파일/새 분석에서는 새 편집 세션이 시작됩니다.
- Delete/Backspace로 선택 음표 삭제, Ctrl/Cmd+Z 및 Ctrl/Cmd+Shift+Z로 Undo/Redo. 입력/select/textarea/dialog에서는 편집기 단축키를 가로채지 않습니다. 한 번의 드래그는 한 기록, history는 최대 50개 immutable snapshot입니다.
- AI 분석본 복원과 dirty 상태의 재분석에는 디자인에 맞는 native dialog를 사용합니다. 취소하면 편집본 유지, 재분석 성공 시 새 결과로 초기화합니다. 재분석 취소/실패 시 편집본 유지. BPM/Key 수정값은 기존 정책대로 보존합니다.
- 시간 확대/축소, 음원 전체 길이와 현재 음역에 맞추는 전체 보기(건반 높이 자동 조절), 낮은 AI 음표 강도 표시 필터(30/50/70% 미만)를 제공합니다. 필터는 삭제가 아니며 직접 추가한 음표에는 AI 필터를 적용하지 않습니다.
- AudioPlayer의 native audio element를 작은 transport API로 연결합니다. 원본 재생 중 requestAnimationFrame으로 currentTime/playing을 공유하고 seeked/timeupdate/pause/ended도 반영합니다. Timeline/빈 공간 클릭과 좌우 방향키로 원본 음원 seek, playhead 동기화. 따라가기는 기본 OFF이며 사용자가 wheel/pointer로 탐색하면 3초간 강제 follow를 억제합니다.
- 모바일은 두 방향 스크롤, 음표 선택, 숫자 입력 중심입니다. touch drag는 명시적으로 사용하지 않으며 PC 정밀 편집을 권장합니다. 세로 확대/oscillator 미리듣기는 후속 기능입니다.
- 편집 결과는 현재 탭 이동 중 유지하지만 새로고침 후 저장되지 않습니다. IndexedDB와 export는 아직 미구현입니다.
- 2,000개 합성 NoteEvent의 UI 성능 검사는 테스트 전용 Worker 응답 fixture입니다. WAV/MP3 실제 Basic Pitch → Piano Roll 검사는 별도로 실제 추론을 수행하며 기존 모든 AI/BPM/Key 회귀를 유지합니다. 성능 검사는 DOM/선택 반응의 기본 검사이며 정확한 FPS나 peak RAM benchmark가 아닙니다.

## 5단계 Quantization (0.5.0)

✅ WAV / MP3 · BPM · Key · Basic Pitch · NoteEvent · Piano Roll · 선택/이동/양쪽 Resize · Inspector · 추가/삭제 · Undo/Redo · Quantization

❌ MIDI · NWCTXT · MusicXML · 오선보 · SATB · Lead 추출 · 자동 편곡 · Demucs · IndexedDB · YouTube

### 사용 순서

1. 실제 음원 분석 후 Piano Roll을 엽니다. 자동 BPM이 추정 불가이면 왼쪽 BPM을 직접 입력합니다. 임의의 120 BPM으로 대체하지 않습니다.
2. 박자표(4/4·3/4·6/8)와 **1마디 1박 위치**를 정합니다. 초 단위 입력, 원본 재생의 현재 위치, ±10/50ms 조정이 가능합니다. 6/8의 BPM 기준은 기본 점4분음표이며 4분음표로 바꿀 수 있습니다. 자동 BPM 분석 자체는 바꾸지 않습니다.
3. 최소 단위(4·8·16·32분음표, 기본 16분)와 강도를 고르고 **Quantization 미리보기**를 누릅니다. 약하게는 시작/끝을 목표 grid까지 50% 이동, 표준은 100%, 강하게는 100% 정렬에 짧은 AI 음표의 삭제 후보 제안을 추가합니다. 어떤 강도도 음표를 자동 삭제하지 않습니다.
4. 테두리 ghost와 통계·경고를 확인합니다. ghost 색은 시작 위치 이동량 <50ms / 50–100ms / ≥100ms입니다. 미리보기는 WorkingNotes와 history를 변경하지 않습니다. 취소하거나 BPM·박자표·BPM 기준·origin·단위·강도·WorkingNotes를 바꾸면 이전 미리보기는 무효화됩니다.
5. **Quantization 적용**은 같은 ID의 WorkingNotes 시간을 일괄 교체하며 Undo 한 번으로 전부 복원합니다. Redo로 재적용합니다. AI 원본 `AnalysisResult.notes`는 그대로 유지합니다.
6. Snap은 별도 설정이며 기본 OFF입니다. 1/4·1/8·1/16·1/32를 선택하면 이후 몸통 이동과 양쪽 Resize만 grid에 맞춥니다. Inspector는 정확한 초 단위 입력을 유지하고 기존 음표는 자동 변경하지 않습니다.

### 음악 데이터와 수학

- `PPQ=960`. 4분음표 기준 `quarterSeconds=60/BPM`, 6/8 점4분 기준 `quarterSeconds=(60/BPM)/1.5`. `tick=(seconds-origin)/quarterSeconds*960`, 역변환은 `seconds=origin+tick/960*quarterSeconds`입니다. 변환 자체는 실수를 보존하고 박자 정리 결과는 정수 tick입니다.
- 박자표는 numerator/denominator로 해석합니다. 마디 길이는 `numerator*960*4/denominator`: 4/4=3840, 3/4=2880, 6/8=2880 tick. beat는 분모 음표 기준으로 1부터 셉니다(6/8은 6개의 8분박).
- origin 이전 실제 음표는 음원 내의 양수 seconds와 음수 musical tick을 함께 유지합니다. floor 나눗셈으로 measure 0/-1을 표현하고 pickup 표시를 붙입니다. 근접한 음수가 0으로 스냅되어 pickup이 사라지는 경우도 보호합니다.
- 시작과 끝을 각각 최근접 grid에 정렬하고 길이는 최소 한 grid입니다. 정확한 중간값은 0에서 먼 방향으로 정렬합니다. 음원 경계에서는 실제 재생 범위를 우선하여 tick/grid가 잘릴 수 있으며 경고합니다. 음원이 한 grid보다 짧아도 음표를 삭제하지 않습니다.
- `QuantizedNote`는 ID·MIDI·원본 초·결과 초·startTick·durationTicks·measure·beat·tickInMeasure·pickup·origin·edited·movementMs를 갖습니다. `QuantizationResult`는 이 음표, 동일 ID의 적용용 NoteEvent[], segments, issues, stats를 함께 반환합니다.
- 음가: 온음표3840, 2분1920, 4분960, 8분480, 16분240, 32분120, 점2분2880, 점4분1440, 점8분720 tick. 약한 정렬의 임의 길이는 custom으로 남깁니다. 복잡한 셋잇단음표·음가 분해는 구현하지 않습니다.
- `splitNotesAcrossMeasures`는 마디선을 넘는 표기용 NoteSegment에 sourceNoteId와 tieFromPrevious/tieToNext를 생성합니다. 실제 WorkingNotes를 자르거나 바꾸지 않습니다. `findGaps`는 명시적인 단성 입력 전용이며 겹치는 다성 입력을 거부합니다. 전체 polyphonic collection에서 쉼표/성부를 자동 추정하지 않습니다.
- 같은 시작의 화음을 병합하지 않습니다. 같은 음높이 겹침·짧은 음표·0 길이·경계·한 grid의 과도한 시작점·마디선 근접을 검토 대상으로 계산합니다. 정상 입력은 양수 길이를 강제하고 비정상 입력은 오류로 안내합니다. 전체 음표/변경/유지/평균·최대 시작 이동량/검토/짧은 음표/겹침 통계를 제공합니다.

### 렌더링·성능·제한

- 초 단위 기존 좌표 위에 현재 viewport의 마디/박/세분선을 표시합니다. grid mark는 최대 402개, ghost는 화면 안의 음표만, 표·경고 목록은 처음 30개만 DOM 렌더링합니다. 박자선 toggle은 음악 grid를 제어하며 기존 초 단위 배경과 눈금은 유지합니다. 공유 audio currentTime에서 마디/박 playhead 위치를 계산합니다.
- 엔진은 main thread의 순수 함수입니다. 2,000/10,000개 단위 성능 검사와 2,000개 UI 미리보기 응답/DOM 검사를 제공합니다. 10,000개 **UI**나 장시간 최악 입력, 정확한 FPS/최대 RAM은 벤치마크하지 않았습니다.
- 같은 박자표·BPM을 곡 전체에 적용합니다. 변박·변속·swing·triplet·rubato 추정, 자동 첫 박 찾기, Tap은 후속 기능입니다. Snap 경계/최소 길이 보호가 grid 정렬보다 우선할 수 있습니다.
- 정리된 짧은 음표는 이동·pitch 수정에서 길이를 유지합니다. 자유 Resize/직접 길이 입력은 기존 최소 0.03초 정책이며 Snap Resize는 한 grid를 사용합니다.
- 미리보기/적용 데이터는 앱 세션에만 존재합니다. 설정 변경이나 WorkingNotes 수정 후에는 미리보기를 다시 생성해야 합니다. 다음 exporter는 현재 유효한 WorkingNotes·effective BPM·박자표·origin 및 정리 결과를 입력받도록 연결할 수 있습니다.
- 37개 단위 검사와 기존 21개 E2E + 실제 Basic Pitch→Quantization E2E를 실행합니다. 기존 AI 검출·MP3·CPU fallback·취소·stale result·tensor·BPM/Key 검사를 삭제하거나 mock으로 대체하지 않았습니다. 2,000개 **성능 fixture만** 합성 응답을 사용합니다. 모바일 390px에서 설정·preview·touch apply와 가로 overflow를 검사합니다.
