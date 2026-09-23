# DebateOn

Node.js 22 이상이 필요합니다. `npm ci` 후 `.env.example`을 `.env.local`로 복사하고 서버 환경값을 설정하세요.

교과 원본, 실제 추출 코퍼스, 임베딩, 학생 기록, 검수 기록과 비밀키는 포함하지 않습니다. 저장소의 `data/curriculum_corpus.json`은 공개 배포가 부팅되기 위한 빈 자료실입니다. 승인된 교과 자료는 서버의 비공개 영구 볼륨에 별도로 설치하고 `KNOWLEDGE_ROOT`를 그 루트 경로로 설정하세요. 루트에는 원본 PDF/HWP를, 하위 `data`에는 `curriculum_corpus.json`, `curriculum_embeddings.json`, `embedding-model`, `evidence_reviews.json`을 둡니다. 새 자료를 추출할 때는 `npm run knowledge:ingest`, `npm run knowledge:model`, `npm run knowledge:embed`로 구성하세요. `npm start`로 실행합니다.

전체 테스트 중 교과 자료 검증 테스트는 원본과 추출 코퍼스를 별도로 설치해야 통과합니다. 최신 실제 앱의 자동 테스트 58개는 로컬에서 통과했습니다. Gemini 실응답 재검증과 실제 계정 검증은 아직 남아 있습니다.

현재 데이터 저장은 로컬 파일을 사용합니다. 배포 시 영구 디스크와 백업이 필요하며 저장소 업로드 자체가 서비스 배포 완료를 뜻하지 않습니다.

학생은 Google, 네이버 또는 카카오 계정으로 로그인한 뒤 학번·성명 확인과 개인정보 이용 동의를 완료해야 학습 기능에 접근할 수 있습니다. 네이버와 카카오는 각 개발자 콘솔에서 앱을 만든 뒤 `.env.example`의 OAuth 값을 등록하면 활성화됩니다. 교사 관리자 계정은 `ADMIN_EMAIL`과 `ADMIN_INITIAL_PASSWORD`를 환경변수로 지정하고 `npm run auth:provision-admin`으로 Firebase에 생성합니다. 초기 비밀번호는 Git에 저장하지 마세요.

학생 명단은 Git에 포함하지 않습니다. `{ "version": 1, "students": [{ "studentNumber": "10101", "name": "홍길동" }] }` 형식의 JSON을 비공개 영구 볼륨에 두고 `STUDENT_ROSTER_PATH`를 절대 경로로 설정하세요. 이름이 비어 있는 학번은 전입생 자리로 취급해 최초 가입자가 입력한 이름으로 인증합니다. 명단 원본과 변환 파일은 공개 저장소에 커밋하지 마세요.

