# 4단계: Firebase 인증 및 권한 경계

2026-09-21, 적용 경로: D:\2026-2학기\웹앱

## 구현 완료
- 공식 `firebase-admin` SDK와 지연 초기화 인증 어댑터.
- Firebase ID token을 검증한 뒤 5일 만료 HttpOnly, SameSite=Strict 세션 쿠키로 교환.
- 운영 환경에서 Secure 쿠키 적용.
- `/api/auth/config`, `/api/auth/session`, `/api/auth/me`, `/api/auth/logout` 경로.
- 학생/교사 역할 검사와 교사의 schoolId/grade/classId 담당 학급 범위 고정.
- 학생 상세 성장 기록은 본인만 조회. 교사 관찰 메모는 학생 응답에서 제외.
- 교사 API, 동기화, 토론방 생성/종료는 교사 역할만 허용.
- 연습 제출·논술·스피치·토론 발언의 작성자 ID/이름/학번은 요청 본문이 아닌 검증된 세션에서 사용.
- 토론 발언 300자 서버 제한 및 unsafe method Origin 검사.
- 이름/학번만으로 로그인하던 레거시 경로 제거.
- 이메일/비밀번호 Firebase 로그인 화면. 데모 계정, 가짜 배지, 소셜 로그인 버튼 제거.
- Firestore 및 Realtime Database 최소 권한 규칙 초안. 기본 거부하며 클라이언트 직접 쓰기는 허용하지 않음.

## 검증
- Firebase Admin 자격증명은 서비스 요청까지 도달했으나 프로젝트가 `CONFIGURATION_NOT_FOUND`를 반환. 현재 Firebase Authentication 설정 자체가 생성되지 않은 상태.
- 서버 상태는 `firebase: admin_configured`, `authentication: firebase_setup_required`로 정직하게 보고.
- 인증 전 보호 API는 503으로 닫혀 있음.
- 보안 및 권한 테스트 16개 통과.
- 학생의 교사 API 접근 거부, 타인 성장 기록 거부, 담당 학급 쿼리 위조 무시, 학생 응답의 교사 메모 제외를 검증.
- JavaScript 문법 및 git diff whitespace 검사 통과.
- 실제 브라우저에서 미설정 로그인 요청이 Firebase 활성화 필요 메시지로 종료되는 것을 확인.

## Firebase 연결 상태
1. Firebase Console Authentication을 초기화하고 이메일/비밀번호 공급자를 사용 설정했다.
2. Firebase Web App의 apiKey, authDomain, appId를 `.env.local`의 `FIREBASE_WEB_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_APP_ID`에 연결했다.
3. 현재 Auth 사용자 수는 0명이다. 실제 계정과 `users/{uid}` 문서를 같은 uid로 만들고 role, schoolId, grade, classId를 지정해야 한다.
4. 검토 후 `firestore.rules`와 `database.rules.json`을 배포한다.
5. 로컬 JSON의 실제 수행 기록만 Firestore로 마이그레이션한다. 기존 예시 데이터는 이관하지 않는다.

## 알려진 제한
- Firebase 공급자 활성화는 완료했지만 실제 사용자 계정이 없어 사용자 화면 로그인 end-to-end 검증은 계정 생성 후 진행해야 한다.
- 데이터 저장소는 현재 local JSON이며 Firestore 전환 대기 상태다.
- `firebase-admin@14.4.0`의 전이 의존성 gaxios 6.7.1이 uuid 9를 사용해 npm audit 중간 심각도 2건이 남는다. `npm audit fix`로 해결되지 않았고 강제 메이저 override는 적용하지 않았다.

