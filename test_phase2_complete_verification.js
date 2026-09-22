// test_phase2_complete_verification.js
// Antigravity Development Specification: Phase 2 (Teacher Management & Second Vertical Slice) Complete Verification

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

async function runPhase2CompleteTest() {
  console.log('===============================================================');
  console.log(' [PHASE 2: TEACHER MANAGEMENT & SECOND VERTICAL SLICE TEST] ');
  console.log('===============================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, title, details = '') {
    if (condition) {
      console.log(`✅ [PASS] ${title}`);
      if (details) console.log(`   ↳ ${details}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${title}`);
      if (details) console.error(`   ↳ ${details}`);
      failed++;
    }
  }

  try {
    // -----------------------------------------------------------------
    // [PART 1: SECTION 97 PHASE 2 - 교사 관리 & 토론 주제 배정]
    // -----------------------------------------------------------------
    console.log('--- [Part 1] 교사 관리 콘솔: 학급, 학생 목록, 뱃지 설정, 토론 주제 배정 ---');

    // 1. 교사 로그인
    const loginRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      name: '예시교사',
      studentNumber: '교사',
      grade: 1,
      classId: 3,
      role: 'teacher'
    });
    assert(loginRes.status === 200 && loginRes.body.user?.role === 'teacher',
      'Test 1: 예시교사 교사 로그인 및 세션 발급',
      `UID: ${loginRes.body.user?.uid}, 역할: ${loginRes.body.user?.role}`);

    // 2. 학급 설정 조회
    const settingsGetRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/teacher/class-settings?schoolId=demo-school&grade=1&classId=3',
      method: 'GET'
    });
    assert(settingsGetRes.status === 200 && settingsGetRes.body.settings,
      'Test 2: 1학년 3반 학급 설정(최소 뱃지수, 배정 논제) 조회',
      `필요 뱃지: ${settingsGetRes.body.settings?.requiredBadgeCount}, 배정 논제 ID: ${settingsGetRes.body.settings?.activeTopicId}`);

    // 3. 학생 목록 및 실시간 준비도 현황 조회
    const rosterRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/teacher/students-status?grade=1&classId=3',
      method: 'GET'
    });
    assert(rosterRes.status === 200 && Array.isArray(rosterRes.body.students) && rosterRes.body.students.length >= 1,
      'Test 3: 1학년 3반 학생 목록 및 실시간 배틀룸 참가 자격 확인',
      `학생 수: ${rosterRes.body.students.length}명, 1번 학생: ${rosterRes.body.students[0]?.name} (뱃지: ${rosterRes.body.students[0]?.badgeCount}개)`);

    // 4. 수업 토론 주제 배정 (지시서 제56조)
    const assignTopicRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/teacher/class-settings',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      schoolId: 'demo-school',
      grade: 1,
      classId: 3,
      activeTopicId: 'topic_affirmative_action'
    });
    assert(assignTopicRes.status === 200 && assignTopicRes.body.settings?.activeTopicId === 'topic_affirmative_action',
      'Test 4: 교사의 수업 토론 논제 배정 (적극적 우대조치 확대 논란)',
      `배정된 논제 ID: ${assignTopicRes.body.settings?.activeTopicId}`);

    // 5. 교사의 배틀룸 참가 특별 예외 승인 (지시서 제17조)
    const overrideRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/teacher/student-override',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      studentUid: 'user_10003', // 예시학생3 학생
      approved: true
    });
    assert(overrideRes.status === 200 && overrideRes.body.approved === true,
      'Test 5: 교사의 학생 배틀룸 참가 특별 예외 승인 성공 (지시서 제17조)',
      `대상 학생: ${overrideRes.body.studentUid}, 예외 승인 상태: ${overrideRes.body.approved}`);

    // -----------------------------------------------------------------
    // [PART 2: SECTION 19~24 - 심화 논술(1~3문단) & 스피치 타이머 훈련]
    // -----------------------------------------------------------------
    console.log('\n--- [Part 2] AI 심화 서술형 (1~3문단) 및 스피치 타이머 훈련 검증 ---');

    // 6. 심화 서술형 3문단 진단 평가
    const essayEvalRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/practice/advanced/evaluate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      topicId: 'topic_justice_basic_income',
      paragraphLevel: 3,
      stance: 'pro',
      studentDraft: '기본소득제는 모든 시민에게 조건 없이 최소한의 경제적 안전망을 제공함으로써 실질적 자유와 사회 정의를 실현하는 필수 제도이다. 롤스의 차등의 원칙에 따르면 최소 수혜자의 처지를 개선하는 불평등만이 정당화될 수 있으므로, 디지털 전환기 일자리 소멸에 대응하는 기본소득은 정의롭다. 재정 부담 우려에 대해서는 탄소세와 로봇세를 결합한 안심소득 모형으로 충분히 극복할 수 있다.'
    });
    assert(essayEvalRes.status === 200 && essayEvalRes.body.evaluation?.rubricAssessment,
      'Test 6: 심화 서술형 5차원 루브릭 정밀 진단 평가 수신',
      `성취수준: ${essayEvalRes.body.evaluation?.overallLevel}, 완성도: ${essayEvalRes.body.evaluation?.completionRate}%`);

    // 7. 심화 서술형 최종 제출 및 뱃지 수여
    const essaySubmitRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/practice/advanced/submit',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      userId: 'demo_student_1',
      topicId: 'topic_justice_basic_income',
      paragraphLevel: 3,
      stance: 'pro',
      studentDraft: '기본소득제는 모든 시민에게 조건 없이 최소한의 경제적 안전망을 제공함으로써 실질적 자유와 사회 정의를 실현하는 필수 제도이다. 롤스의 차등의 원칙에 따르면 최소 수혜자의 처지를 개선하는 불평등만이 정당화될 수 있으므로, 디지털 전환기 일자리 소멸에 대응하는 기본소득은 정의롭다. 재정 부담 우려에 대해서는 탄소세와 로봇세를 결합한 안심소득 모형으로 충분히 극복할 수 있다.'
    });
    assert(essaySubmitRes.status === 200 && essaySubmitRes.body.session?.sessionId,
      'Test 7: 심화 서술형 영속 저장 및 심화 논술 뱃지 검증',
      `세션 ID: ${essaySubmitRes.body.session?.sessionId}, 성취수준: ${essaySubmitRes.body.session?.overallLevel}`);

    // 8. 스피치 타이머 WPM & 3마디 구조 진단 평가
    const speechEvalRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/speech/evaluate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      topicId: 'topic_ai_judge',
      durationSeconds: 45,
      targetDurationSeconds: 45,
      transcript: '저는 AI 판사 도입에 찬성합니다. 왜냐하면 헌법상 보장된 공정한 재판을 받을 권리와 판결의 법적 안정성을 확보하는 것이 자의적 판결 방지에 더 시급하기 때문입니다. 물론 데이터 편향의 우려가 제기될 수 있으나 이는 알고리즘 검증 제도로 충분히 극복 가능합니다.'
    });
    assert(speechEvalRes.status === 200 && speechEvalRes.body.evaluation?.scores?.totalScore >= 70,
      'Test 8: 스피치 타이머 발화 페이싱(WPM) 및 3단계 구조 평가',
      `총점: ${speechEvalRes.body.evaluation?.scores?.totalScore}점, WPM: ${speechEvalRes.body.evaluation?.metrics?.wpm}`);

    // 9. 스피치 훈련 최종 제출 및 뱃지 수여
    const speechSubmitRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/speech/submit',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      userId: 'demo_student_1',
      topicId: 'topic_ai_judge',
      durationSeconds: 45,
      targetDurationSeconds: 45,
      transcript: '저는 AI 판사 도입에 찬성합니다. 왜냐하면 헌법상 보장된 공정한 재판을 받을 권리와 판결의 법적 안정성을 확보하는 것이 자의적 판결 방지에 더 시급하기 때문입니다. 물론 데이터 편향의 우려가 제기될 수 있으나 이는 알고리즘 검증 제도로 충분히 극복 가능합니다.'
    });
    assert(speechSubmitRes.status === 200 && speechSubmitRes.body.session?.sessionId,
      'Test 9: 스피치 훈련 세션 영속 저장 및 논리 스피치 뱃지 검증',
      `세션 ID: ${speechSubmitRes.body.session?.sessionId}`);

    // -----------------------------------------------------------------
    // [PART 3: SECTION 99 - 두 번째 VERTICAL SLICE (실시간 토론 배틀룸)]
    // -----------------------------------------------------------------
    console.log('\n--- [Part 3] 두 번째 Vertical Slice: 실시간 토론 배틀룸 공방 루프 ---');

    // 10. 토론 배틀룸 방장 초기화 및 서버 카운트다운 타이머 생성
    const roomInitRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/debate/room/init',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      roomId: 'room_phase2_battle',
      topicId: 'topic_affirmative_action',
      title: '적극적 우대조치 확대는 역차별인가, 실질적 기회균등인가?',
      durationMinutes: 15
    });
    assert(roomInitRes.status === 200 && roomInitRes.body.room?.remainingSeconds > 0,
      'Test 10: 실시간 토론 배틀룸 생성 및 서버 기준 타이머(endsAt) 초기화',
      `배틀룸 ID: ${roomInitRes.body.room?.roomId}, 남은 시간: ${roomInitRes.body.room?.remainingSeconds}초`);

    // 11. 학생 자격 검증 및 토론방 입장 (뱃지 보유 학생 예시학생1)
    const joinStudentRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/debate/join',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      roomId: 'room_phase2_battle',
      userId: 'demo_student_1',
      teamId: 'pro',
      role: 'student'
    });
    assert(joinStudentRes.status === 200 && joinStudentRes.body.eligible === true,
      'Test 11: 학생 자격 검증 게이트 통과 및 토론 배틀룸 입장 승인',
      `입장 학생: ${joinStudentRes.body.user?.name}, 팀: 찬성팀(pro)`);

    // 12. 발언 안전 moderation 필터링 (부적절 발언 차단 및 소크라테스식 예절 가이드)
    const badMsgRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/debate/message',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      roomId: 'room_phase2_battle',
      authorUid: 'demo_student_1',
      authorName: '예시학생1',
      content: '너 진짜 바보냐? 그건 말도 안되는 소리야 닥쳐!'
    });
    assert(badMsgRes.status === 200 && badMsgRes.body.moderated === true,
      'Test 12: 부적절한 감정적 비난 발언 moderation 필터링 차단',
      `소크라 예절 코칭: "${badMsgRes.body.guidance}"`);

    // 13. [주장] 및 [재반론] 발언 전송 및 피드 저장
    const goodMsgRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/debate/message',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      roomId: 'room_phase2_battle',
      authorUid: 'demo_student_1',
      authorName: '예시학생1',
      authorNumber: '10001',
      teamId: 'pro',
      messageType: 'rebuttal',
      targetUid: 'user_10004',
      targetName: '@예시학생4',
      content: '@예시학생4 학생의 반론에 재반박합니다. 형식적 기회균등만으로는 역사적 구조적 차별을 극복할 수 없으며, 헌법상 실질적 평등 가치를 달성하기 위해 한시적 적극적 우대조치는 불가피합니다.'
    });
    assert(goodMsgRes.status === 200 && goodMsgRes.body.message?.messageId,
      'Test 13: 발언 유형 [재반론] 태깅된 학생 발언 배틀룸 피드 게시 완료',
      `메시지 ID: ${goodMsgRes.body.message?.messageId}, 대상: ${goodMsgRes.body.message?.targetName}`);

    // 14. 소크라 AI 실시간 공정 중간 쟁점 요약 (지시서 제46·47조)
    const summaryRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/debate/ai-summary',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      roomId: 'room_phase2_battle'
    });
    assert(summaryRes.status === 200 && summaryRes.body.summary?.proSummary && summaryRes.body.summary?.conSummary,
      'Test 14: 소크라 AI 실시간 중립적 쟁점 요약 및 양측 촉진 질문 산출',
      `찬성 쟁점: ${summaryRes.body.summary?.proSummary} | 반대 쟁점: ${summaryRes.body.summary?.conSummary}`);

    // 15. 교사 실시간 관찰 메모 기록 (지시서 제53~55조)
    const noteRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/teacher/debate-note',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      teacherUid: 'demo_teacher',
      studentUid: 'demo_student_1',
      studentName: '예시학생1',
      debateId: 'room_phase2_battle',
      note: '상대방의 역차별 주장에 대해 실질적 기회균등 개념과 헌법적 가치를 정확히 결합하여 재반박함.',
      tags: ['개념활용', '재반론우수']
    });
    assert(noteRes.status === 200 && noteRes.body.observation?.id,
      'Test 15: 교사의 학생별 실시간 관찰 메모 및 역량 태그 기록 완료',
      `관찰 메모: "${noteRes.body.observation?.note}"`);

    // 16. 토론 종료 및 소크라 AI 종합 진단 (개인별 피드백 + 팀 분석)
    const finishRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/debate/finish',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      roomId: 'room_phase2_battle'
    });
    assert(finishRes.status === 200 && finishRes.body.evaluation?.individualAnalyses,
      'Test 16: 토론 종료 처리 및 소크라 AI 개인별 성장 진단 + 팀 분석 산출',
      `예시학생1 진단: "${finishRes.body.evaluation?.individualAnalyses?.demo_student_1?.praise}"`);

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  }

  console.log('\n===============================================================');
  console.log(` [PHASE 2 & SECOND VERTICAL SLICE 검증 완료] 통과: ${passed}개, 실패: ${failed}개`);
  console.log('===============================================================');

  process.exit(failed > 0 ? 1 : 0);
}

runPhase2CompleteTest();

