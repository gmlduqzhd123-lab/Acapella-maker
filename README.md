# AcaScore AI

듣던 음악을, 부를 수 있는 악보로.

React · TypeScript · Vite 기반 GitHub Pages 전용 정적 웹앱입니다. 현재 릴리스는 **1차 구현: 음원 준비**입니다.

## 현재 동작하는 기능

- WAV·MP3 파일 선택 및 Drag & Drop (한 번에 한 파일)
- Web Audio API로 실제 로컬 파일 디코딩
- 파일명, 재생 시간, 파일 크기, 포맷, 채널 표시
- 원본 음원 재생·일시정지·탐색·음량 조절
- Web Worker에서 실제 PCM 파형 생성, 파형 클릭으로 재생 위치 이동
- 파일 교체·제거, 오류 후 재시도, 모바일 대응
- 이후 음악 분석·악보·프로젝트 저장을 위한 타입과 모듈 구분

**BPM·Key·Pitch 분석, 음표 편집, 악보 내보내기, IndexedDB 저장은 아직 구현하지 않았습니다.** 화면에서 준비 중임을 표시하며, 분석 결과를 흉내 내는 데이터를 사용하지 않습니다.

## 로컬 실행

Node.js 22.12 이상 또는 24 LTS를 권장합니다.

~~~sh
npm ci
npm run dev
~~~

기본 경로는 /Acapella-maker/ 입니다. 터미널에서 표시한 주소에 해당 경로를 붙여 접속합니다.

~~~sh
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
~~~

정적 빌드 결과는 dist/ 입니다. 개발 및 미리보기용 Vite 서버만 사용하며, 제품에는 별도 백엔드가 없습니다. 파일을 더블 클릭하는 file:// 실행은 ES modules/Worker 제약으로 지원하지 않습니다.

## 브라우저 검증

~~~sh
npx playwright install chromium
npm run build
npm run test:e2e
~~~

Windows에서 설치된 Edge로 검사할 수도 있습니다.

~~~powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm run test:e2e
~~~

tests/fixtures.ts는 검증용 실제 PCM WAV·MP3 신호를 생성합니다. 앱 번들에는 이 코드와 MP3 인코더가 포함되지 않습니다. 테스트는 실제 디코딩, 재생, Drag & Drop, 스테레오 파형, 파일 교체, 오류 복구, 모바일 화면, 외부 업로드 요청 부재를 확인합니다.

## GitHub Pages 배포

저장소: [gmlduqzhd123-lab/Acapella-maker](https://github.com/gmlduqzhd123-lab/Acapella-maker)

서비스 주소: [AcaScore AI](https://gmlduqzhd123-lab.github.io/Acapella-maker/)

1. GitHub 저장소 Settings → Pages → Source를 **GitHub Actions**로 설정합니다.
2. main 브랜치에 커밋을 push합니다.
3. .github/workflows/pages.yml이 설치 → 린트 → 타입 검사 → 단위 테스트 → 빌드 → 실제 브라우저 테스트 → GitHub Pages 배포를 실행합니다.

vite.config.ts는 GitHub Pages의 실제 base_path를 최우선으로 사용합니다. 기본 로컬 경로는 /Acapella-maker/ 이며, GITHUB_REPOSITORY 설정으로 다른 프로젝트 저장소 경로를 계산할 수 있습니다. 사용자 사이트·사용자 정의 도메인은 PAGES_BASE_PATH=/ 로 빌드합니다. 페이지 이동 라우터를 사용하지 않아 루트 화면을 새로고침할 때 별도 404 라우팅 처리가 필요하지 않습니다.

설정은 [Vite 공식 GitHub Pages 배포 문서](https://vite.dev/guide/static-deploy.html#github-pages)를 기준으로 구성했습니다.

## 로컬 처리와 제한

- 음악 파일은 object URL과 메모리의 AudioBuffer로만 처리합니다. 외부 서버로 업로드하거나 파일을 저장하지 않습니다.
- 파형 계산은 전 채널의 실제 샘플을 이용하며 Worker에서 실행합니다.
- 원본 재생은 브라우저 오디오 플레이어가 담당합니다. 분석 준비용 PCM만 22,050 Hz로 디코딩해 메모리 사용량을 낮춥니다.
- 업로드 한도는 50 MiB, 재생 시간은 10분, 디코딩 PCM 한도는 128 MiB입니다. 긴 압축 음원은 디코딩 전에 재생 시간을 검사합니다. 브라우저 강제 종료 등 시스템 수준의 메모리 고갈까지 보장할 수는 없습니다.
- 손상된 파일·지원하지 않는 형식·Worker 실패는 이해할 수 있는 오류로 안내합니다.
- WebGPU·AI 모델·외부 API Key는 현재 단계에서 필요하지 않습니다.
- 새로고침하면 음원을 다시 선택해야 합니다. IndexedDB 프로젝트 저장은 후속 단계입니다.
- YouTube 재생·다운로드·음원 추출 기능은 현재 구현하지 않았습니다. 이후 URL 지원도 참고 영상 재생으로만 제한합니다.

## 구조

~~~text
src/
  audio/       로컬 파일 검증·디코딩·메타데이터
  analysis/    AnalysisInput·AnalysisResult 계약
  music/       NoteEvent·MusicalKey·Quantization 타입
  score/       ScoreData 타입
  export/      ScoreExporter 타입
  storage/     ProjectData 타입
  workers/     실제 PCM 파형 Worker
  components/  업로드·플레이어·파일 정보 UI
config/        GitHub Pages base 계산
tests/         단위 검사·실제 브라우저 검사
docs/          설계 기준·후속 구현 순서
~~~

전체 설계 기준과 다음 단계는 [docs/PRD.md](docs/PRD.md)를 참고하세요.
