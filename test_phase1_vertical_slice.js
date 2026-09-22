/**
 * test_phase1_vertical_slice.js
 * 
 * 예시고 통합사회2 토론·논술 AI 코치 플랫폼 ('디베이트온')
 * Phase 1 Vertical Slice 종단간(End-to-End) 자동 검증 스위트
 * (개발지시서 제96조, 제98조, 제105조 학생 A / 교사 흐름)
 */

const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runPhase1VerticalSliceTest() {
  console.log('===============================================================');
  console.log(' [PHASE 1 VERTICAL SLICE: 9-STEP END-TO-END VERIFICATION] ');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, stepName, details) {
    if (condition) {
      console.log(`✅ [PASS] ${stepName}`);
      if (details) console.log(`   ↳ ${details}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${stepName}`);
      if (details) console.error(`   ↳ ${details}`);
      failed++;
    }
  }

  try {
    // -------------------------------------------------------------
    // [STEP 1] 학생 로그인 및 세션 생성
    // -------------------------------------------------------------
    console.log('--- [Step 1] 학생 로그인 (예시학생1 / 10001 / 예시고 1-3반) ---');
    const loginRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name: '예시학생1',
      studentNumber: '10001',
      schoolId: 'demo-school',
      grade: 1,
      classId: 3,
      role: 'student'
    });

    assert(loginRes.status === 200 && loginRes.body.success, 'Step 1: 로그인 성공 및 사용자 세션 확인', 
      `UID: ${loginRes.body.user?.uid}, 이름: ${loginRes.body.user?.name}, 학번: ${loginRes.body.user?.studentNumber}`);
    const studentUid = loginRes.body.user?.uid || 'demo_student_1';

    // -------------------------------------------------------------
    // [STEP 2] 통합사회2 2단원 교과 연계 논제 목록 조회
    // -------------------------------------------------------------
    console.log('\n--- [Step 2] 교과 연계 논제 조회 ---');
    const topicsRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/topics',
      method: 'GET'
    });

    assert(topicsRes.status === 200 && topicsRes.body.topics.length >= 3, 'Step 2: 미래엔 2단원 토론 논제 3종 조회',
      `논제 수: ${topicsRes.body.topics.length}개, 1번 논제: "${topicsRes.body.topics[0]?.title}"`);
    const selectedTopic = topicsRes.body.topics[0];

    // -------------------------------------------------------------
    // [STEP 3 & 4] 학생 1회차 2~3문장 작성 및 소크라테스식 AI 진단
    // -------------------------------------------------------------
    console.log('\n--- [Step 3 & 4] 학생 1회차 작성 및 Socratic AI 진단 요청 ---');
    const claim1 = '기본소득제는 모든 국민의 실질적 자유를 보장하고 사회 불평등을 완화하기 위해 반드시 도입되어야 한다.';
    const reason1 = '인공지능과 자동화로 일자리가 불안정해지는 상황에서, 롤스의 차등의 원칙처럼 사회적 최소 수혜자의 인간다운 삶을 지키는 것이 진정한 분배적 정의이기 때문이다.';
    
    const evalRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/practice/evaluate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      topic: selectedTopic,
      stance: 'pro',
      claim: claim1,
      reason: reason1,
      rebuttal: '',
      currentScaffoldLevel: 1,
      attemptCount: 1
    });

    const ev = evalRes.body.evaluation;
    assert(evalRes.status === 200 && ev, 'Step 4-1: Socratic AI 피드백 응답 수신', 
      `비계 레벨: Level ${ev?.scaffold?.recommendedLevel || 1}`);

    // 지시서 13대 절대 규칙 검증: 완성본이나 모범답안을 절대 학생에게 제공하지 않음
    const hasMockAnswer = ev?.mockAnswer || ev?.modelEssay || ev?.fullText;
    assert(!hasMockAnswer, 'Step 4-2: 13대 절대 규칙 준수 - 완성본/모범답안 미제공', 
      'AI가 학생 대신 답을 작성하지 않음 확인 (Pass)');

    // 피드백 구조 검증: 칭찬 1~2개, 보완 과제 1개, 생각 질문 1개
    assert(ev?.feedback?.praise && ev?.feedback?.nextChallenge && ev?.feedback?.question,
      'Step 4-3: 칭찬 + 집중 보완 과제 + 생각 촉진 질문 세트 확인',
      `칭찬: "${ev?.feedback?.praise}" | 질문: "${ev?.feedback?.question}"`);

    // -------------------------------------------------------------
    // [STEP 5 & 6] 학생 2회차 재도전(재작성) 및 뱃지 획득
    // -------------------------------------------------------------
    console.log('\n--- [Step 5 & 6] 학생 2회차 재도전 및 뱃지 수여 검증 ---');
    const rebuttal2 = '물론 막대한 국가 재정 부담이라는 반론이 제기될 수 있으나, 불필요한 선별 복지 행정 비용을 줄이고 탄소세와 로봇세를 도입함으로써 충분히 극복할 수 있다.';

    const submitRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/practice/submit',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      userId: studentUid,
      topicId: selectedTopic.topicId,
      stance: 'pro',
      claim: claim1,
      reason: reason1,
      rebuttal: rebuttal2,
      scaffoldLevel: 1,
      evaluation: ev,
      attemptCount: 2
    });

    assert(submitRes.status === 200 && submitRes.body.success, 'Step 6-1: 2회차 작성본 영속 스토어 저장 완료',
      `세션 ID: ${submitRes.body.session?.sessionId}`);

    assert(submitRes.body.badgeAwarded && submitRes.body.badge?.badgeType === 'badge_reasoning',
      'Step 6-2: 재도전 완수 후 [주장-근거 연결 뱃지] 수여 확인',
      `획득 뱃지명: "${submitRes.body.badge?.badgeName}" (${submitRes.body.badge?.description})`);

    // -------------------------------------------------------------
    // [STEP 7] 개인 성장 리포트 & 배틀룸 참가 준비도 확인
    // -------------------------------------------------------------
    console.log('\n--- [Step 7] 개인 역량 리포트 & 배틀룸 준비도 검증 ---');
    const growthRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: `/api/growth/student/${studentUid}`,
      method: 'GET'
    });

    const growth = growthRes.body;
    assert(growthRes.status === 200 && growth.success, 'Step 7-1: 성장 리포트 데이터 로드 성공',
      `학생: ${growth.user?.name}, 총 획득 뱃지: ${growth.badges?.length}개`);

    assert(growth.readiness && growth.readiness.earnedBadges >= 1,
      'Step 7-2: 지시서 제18조 배틀룸 참가 준비도 위젯 규격 검증',
      `달성도: ${growth.readiness?.earnedBadges} / ${growth.readiness?.requiredBadges} (진행률: ${growth.readiness?.progressPercent}%, 참가 가능: ${growth.readiness?.isBattleReady})`);

    // -------------------------------------------------------------
    // [STEP 8] 교사 학급 관리: 배틀룸 기준 변경 (1개 -> 3개 -> 1개)
    // -------------------------------------------------------------
    console.log('\n--- [Step 8] 교사 배틀룸 참가 뱃지 기준 설정 ---');
    
    // 교사가 기준을 3개로 상향
    const setReq3Res = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/teacher/class-settings',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      schoolId: 'demo-school',
      grade: 1,
      classId: 3,
      teacherUid: 'demo_teacher',
      requiredBadgeCount: 3
    });

    assert(setReq3Res.status === 200 && setReq3Res.body.settings?.requiredBadgeCount === 3,
      'Step 8-1: 교사가 1학년 3반 배틀룸 기준 뱃지 3개로 상향 조정',
      `변경 후 설정값: ${setReq3Res.body.settings?.requiredBadgeCount}개 필요`);

    // 교사가 다시 1개로 복구
    const setReq1Res = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/teacher/class-settings',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      schoolId: 'demo-school',
      grade: 1,
      classId: 3,
      teacherUid: 'demo_teacher',
      requiredBadgeCount: 1
    });

    assert(setReq1Res.status === 200 && setReq1Res.body.settings?.requiredBadgeCount === 1,
      'Step 8-2: 교사가 배틀룸 기준 뱃지 1개로 정상 복구',
      `현재 설정값: ${setReq1Res.body.settings?.requiredBadgeCount}개 필요`);

    // -------------------------------------------------------------
    // [STEP 9] 교사 콘솔: 실시간 학급 학생 준비도 명단 확인
    // -------------------------------------------------------------
    console.log('\n--- [Step 9] 교사용 실시간 학급 학생 준비도 명단 조회 ---');
    const rosterRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/teacher/students-status?grade=1&classId=3',
      method: 'GET'
    });

    assert(rosterRes.status === 200 && rosterRes.body.students?.length >= 2,
      'Step 9-1: 1학년 3반 학생 실시간 배틀룸 준비도 명단 조회 성공',
      `조회된 학생 수: ${rosterRes.body.students?.length}명`);

    const kimStudent = rosterRes.body.students?.find(s => s.studentNumber === 10001 || s.name === '예시학생1');
    assert(kimStudent && kimStudent.isBattleReady,
      'Step 9-2: 예시학생1 학생 배틀룸 참가 자격 획득 상태 (isBattleReady: true)',
      `예시학생1: 뱃지 ${kimStudent?.badgeCount}개 보유 / ${kimStudent?.requiredBadges}개 필요 -> 입장 승인 ✓`);

    console.log('\n===============================================================');
    console.log(` [PHASE 1 VERTICAL SLICE 검증 완료] 통과: ${passed}개, 실패: ${failed}개`);
    console.log('===============================================================\n');

  } catch (err) {
    console.error('Test execution error:', err);
  }
}

runPhase1VerticalSliceTest();

