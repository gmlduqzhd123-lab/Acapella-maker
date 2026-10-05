# AcaScore AI · 제품 설계 기준

기준: 사용자가 2026-10-05 대화에 제공한 제품 요구사항. 별도 PRD 문서 첨부는 현재 확인되지 않았습니다. 이후 첨부한 이미지에서는 gmlduqzhd123-lab/Acapella-maker 저장소를 확인했습니다.

## 제품

- 이름: AcaScore AI
- 슬로건: 듣던 음악을, 부를 수 있는 악보로.
- 설명: AI가 음악을 분석하고 아카펠라 악보 초안을 만들어드립니다.
- 홈 버튼: 새 악보 만들기
- Drop Zone: 분석할 음악 또는 영상을 여기에 놓아주세요.
- PC 우선 음악 작업실 UI: 왼쪽 프로젝트·분석, 가운데 편집, 오른쪽 선택 음표, 상단 재생·분석 컨트롤. 현재 첫 단계의 오른쪽 영역은 개발 순서를 안내합니다.

## 절대 제약

- 배포는 GitHub Pages만 사용.
- Vercel·Supabase·Firebase·별도 백엔드·Python 서버·DB 서버 금지.
- 음악 파일을 외부 서버로 전송하지 않음. 가능한 분석은 사용자의 브라우저에서 처리.
- 외부 API Key가 필요한 서비스에 의존하지 않음.
- YouTube 다운로드·음원 추출 금지. URL은 참고 영상 재생에만 사용.
- 실제 분석은 사용자가 직접 제공한 음원을 사용.
- Native .nwc 바이너리를 역공학하지 않음. NoteWorthy Composer에서 열 수 있는 .nwctxt 생성.
- UI가 멈추지 않도록 무거운 작업은 가능한 Web Worker에서 처리.
- 가짜 분석 결과·mock 데이터로 실제 기능처럼 표시하지 않음.

## 이번 구현 범위

- [x] 프로젝트 구조 생성 (React·TypeScript·Vite)
- [x] GitHub Pages 배포 설정과 저장소 경로에 맞춘 base
- [x] 기본 UI
- [x] WAV·MP3 로컬 업로드 (선택·Drag & Drop)
- [x] 실제 Audio Player
- [x] 파일명·재생 시간·파일 크기·포맷 표시
- [x] 분석용 기본 데이터 구조 및 요청된 폴더 생성
- [x] 타입 검사·빌드·경로·브라우저 동작 점검
- [x] 추가: Worker 기반 실제 PCM 파형과 탐색

## 후속 MVP 구현 순서

각 단계에서 구현 → TypeScript 검사 → 빌드 → GitHub Pages 호환 확인 후 다음 단계로 이동합니다.

1. M4A·OGG 지원 및 MP4 등 영상 컨테이너의 브라우저 디코딩 호환성 검증.
2. 실제 BPM 분석, 숫자 표시 및 사용자 수정.
3. 실제 Key 분석 (예: E♭ Major, C Minor), 사용자 수정.
4. 브라우저에서 작동하는 Basic Pitch 계열 구현체 검토 및 Pitch 분석. API Key 없는 로컬 모델, CPU/WASM 대체 실행을 확보.
5. 분석 결과를 NoteEvent로 변환.
6. Piano Roll 표시 및 음높이·시작 위치·길이 변경·음표 삭제·추가.
7. 온음표·2분·4분·8분·16분 기준 Quantization. 복잡한 셋잇단음표는 후속 범위.
8. 실제 악보 데이터 생성.
9. 실제 .mid 다운로드. 버튼: MIDI 다운로드.
10. src/export/nwctxtExporter.ts 구현. 버튼: NWC 악보 받기. 파일명: 곡제목.nwctxt.
11. NoteWorthy Composer에서 실제로 열어 .nwctxt 호환성 검증.
12. IndexedDB 프로젝트 저장·다시 열기. 최소 프로젝트명·BPM·Key·NoteEvent·수정 악보 데이터. 음원 저장은 선택 사항.

음원 업로드 → 재생 → BPM → Key → Pitch → NoteEvent → Piano Roll → Quantization → 악보 데이터 → MIDI → NWCTXT → NoteWorthy Composer 흐름이 실제로 완성될 때까지 SATB 자동 편곡과 고급 AI 기능을 구현하지 않습니다.

## 음악 데이터 계약

~~~typescript
interface NoteEvent {
  id: string;
  start: number;       // seconds
  duration: number;    // seconds
  midi: number;       // 0–127
  velocity: number;
  confidence: number;
}
~~~

velocity·confidence의 수치 범위는 후속 분석기와 내보내기 구현 시 명시하고 검사합니다. 단순 음악 타입과 프로젝트 저장 데이터에는 원본 파일·AudioBuffer를 포함하지 않습니다.

## 오류와 검증 기준

- 음원 디코딩 실패·미지원 형식·메모리 부족을 안내하고 재시도를 허용.
- 분석 모델 로딩 실패·WebGPU 미지원도 후속 분석 단계에서 복구 가능한 오류로 처리.
- WebGPU가 없어도 CPU/WASM 기반 기본 분석 경로 제공.
- UI, Worker, favicon, JS/CSS가 저장소 하위 경로에서 로드되는지 확인.
- 실제 WAV·MP3 입력으로 디코딩 및 재생 확인.
- 실제 음악 분석 정확도는 후속 단계에서 별도 데이터와 음악적 판단으로 검증. 현재 재생 테스트는 음악 분석 정확도의 증거가 아님.
