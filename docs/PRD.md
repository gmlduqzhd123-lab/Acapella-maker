# AcaScore AI · 제품 설계 기준

기준: 2026-10-05 대화의 전체 제품 설계와 사용자가 첨부한 **2단계 개발 지시**. 저장소는 gmlduqzhd123-lab/Acapella-maker이며 기존 구조를 확장합니다.

## 제품

- AcaScore AI
- 듣던 음악을, 부를 수 있는 악보로.
- AI가 음악을 분석하고 아카펠라 악보 초안을 만들어드립니다.
- 철학: AI가 초안을 만들고 사람이 음악을 완성한다.
- 홈 버튼: 새 악보 만들기
- 현재 Drop Zone: **분석할 음악 파일을 여기에 놓아주세요.**
- PC 우선 작업실 UI. 현재 음원·음악 분석 사용 가능, Piano Roll·악보 준비 중.

## 절대 제약

- GitHub Pages만 사용. Vercel·Supabase·Firebase·별도 백엔드·Python 서버·외부 DB 금지.
- 사용자의 음원을 외부 서버로 전송하지 않음. 실제 PCM에서 브라우저 내부 분석.
- API Key가 필요한 서비스에 의존하지 않음. mock 분석 결과 금지.
- 기존 업로드·재생·탐색·파형·오류 복구·모바일 기능 보존.
- YouTube 다운로드·음원 추출 금지. 이후 URL 기능도 참고 영상 재생으로 제한.
- Native .nwc 바이너리 역공학 금지. 이후 .nwctxt 방식 사용.
- 무거운 분석은 Worker에서 실행. WebGPU 없이 CPU 기반으로 현재 기능 실행.

## 1단계 완료

- [x] React·TypeScript·Vite 구조와 GitHub Pages 배포
- [x] WAV·MP3 로컬 선택·Drag & Drop·실제 디코딩
- [x] 원본 Audio Player·파일 정보·탐색
- [x] 전 채널 PCM 파형 Worker
- [x] 분석·음악·악보·내보내기·저장 타입 및 폴더
- [x] 기본 UI·오류 복구·회귀 검사

## 2단계 구현 범위

- [x] 모든 채널 평균·Float32 범위 보정·청크별 실행 기회를 제공하는 분석 입력
- [x] 실제 BPM 분석 (40–240, 원래 실수 분석값, confidence, 후보)
- [x] 실제 Key 분석 (전체 음원 tonal distribution, 24 major/minor 후보, confidence)
- [x] 장단조에 적절한 Sharp/Flat 이름 매핑
- [x] 분석 시작·실제 진행률 0–1·취소·완료·오류
- [x] 작업 ID·generation·AbortController·Worker terminate로 취소와 늦은 응답 방지
- [x] BPM 직접 수정·12 Root × Major/Minor 수정·각 자동값 복원
- [x] 수정한 값과 원래 자동 결과 분리, 후속 악보 입력용 effectiveResult
- [x] 무음·근거 부족은 null/추정 불가, 낮은 신뢰도 확인 안내
- [x] AnalysisResult 연결, notes는 Pitch 미구현을 뜻하는 빈 배열
- [x] 실제 PCM 클릭·코드 진행과 실제 WAV·MP3 브라우저 검증
- [x] 외부 업로드 검사를 유지하고 분석 실행에도 확장
- [x] 10분 음원 분석 중 재생·화면 응답·취소·교체·제거 검사

신뢰도는 휴리스틱 근거 강도이며 정답 확률로 표시하지 않습니다. Key 미추정·BPM 미추정이 다른 값을 가짜로 채우는 이유가 되지 않습니다. 이 때문에 AnalysisResult.bpm/key는 명시적으로 nullable로 확장했습니다.

## 다음 개발 순서

각 단계에서 구현 → TypeScript 검사 → 빌드 → GitHub Pages 호환 확인 후 진행합니다.

1. 음원 입력 ✅
2. BPM 분석 ✅
3. Key 분석 ✅
4. Basic Pitch 계열 브라우저 모델·CPU/WASM 경로
5. 실제 NoteEvent 자동 생성
6. Piano Roll 표시·음높이·시작·길이 수정·삭제·추가
7. 온음표·2분·4분·8분·16분 Quantization (복잡한 셋잇단음표는 이후)
8. 실제 악보 데이터 및 MIDI 다운로드
9. NWCTXT 생성: src/export/nwctxtExporter.ts, 버튼 “NWC 악보 받기”, 곡제목.nwctxt
10. NoteWorthy Composer에서 실제로 열어 호환성 검증
11. IndexedDB 프로젝트 저장·다시 열기
12. M4A·OGG·MP4 등 추가 포맷의 브라우저 디코딩 호환성 검증

Pitch·NoteEvent·Piano Roll·Quantization·MIDI·NWCTXT·MusicXML·IndexedDB·YouTube·추가 포맷·SATB·편곡·Source Separation·Demucs는 이번 단계에서 구현하지 않습니다. 음원부터 NoteWorthy Composer까지 MVP가 실제로 완성될 때까지 고급 AI 편곡으로 확장하지 않습니다.

## 데이터 계약

```typescript
interface NoteEvent {
  id: string;
  start: number; // seconds
  duration: number; // seconds
  midi: number; // 0–127
  velocity: number;
  confidence: number;
}
interface AnalysisInput {
  samples: Float32Array; // all-channel mean PCM, -1–1
  sampleRate: number;
  duration: number; // seconds
}
interface MusicalKey {
  tonic: number; // C=0 through B=11
  mode: "major" | "minor";
  confidence: number; // 0–1
}
```

AnalysisResult는 nullable bpm/key, bpmConfidence, 빈 notes, tempoCandidates, keyCandidates, chroma, warnings를 갖습니다. preparing → bpm → key → complete의 fraction은 전체 진행률 0–1입니다. 원래 자동값을 보존하고 effectiveResult가 사용자 수정값을 우선합니다. 후속 ScoreData 생성 시 nullable 결과를 해결한 후 생성해야 합니다.

프로젝트 저장은 최소 프로젝트명·BPM·Key·NoteEvent·수정 악보 데이터. 음원 저장은 선택 사항입니다. 원본 파일과 AudioBuffer는 음악/프로젝트 타입에 자동 포함하지 않습니다.

## 오류·성능·검증 기준

- 실제 PCM 기반 계산. 파일명이나 정해진 숫자에서 결과를 만들지 않음.
- PCM 입력 준비는 chunk/yield, FFT 테이블 재사용, transferable 전달, Key 최대 약 1,800개 전체 구간 프레임.
- 지원하지 않는 파일·디코딩 실패·메모리 부족·Worker 실패·90초 분석 제한을 사용자에게 안내.
- 취소·파일 교체·제거·unmount 시 Worker 종료, 취소를 오류로 표시하지 않음.
- 실제 PCM 클릭은 최소 60·90·120·150 BPM과 반속·배속 오선택 검증.
- 실제 코드 진행 C→F→G→C, Am→Dm→E→Am 및 추가 Key 검증.
- WAV/MP3 E2E: 디코딩 → Worker 분석 → BPM/Key 표시 → 수정 → 자동값 복원.
- JS/CSS·favicon·파형 Worker·분석 Worker가 /Acapella-maker/ 아래에서 로드되는지 확인.
- 모델/WASM은 현재 사용하지 않음. 후속 모델 로딩 실패·GPU 미지원은 해당 단계에서 처리.
- 합성 신호 결과를 다양한 실제 곡의 정확도 통계로 확대 해석하지 않음.
