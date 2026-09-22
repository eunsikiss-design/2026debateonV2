// test_phase3_suite.js
// Automated verification suite for Phase 3: Real-time Debate Battle Room & Teacher Observer View

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

async function runPhase3Tests() {
  console.log('=== [PHASE 3 VERIFICATION SUITE START] ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Check Topic List
    console.log('[Test 1] Fetch topics and select basic income topic');
    const topicsRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/topics',
      method: 'GET'
    });
    assert(topicsRes.status === 200 && topicsRes.body.topics.length >= 3, 'Topics API returns >= 3 curriculum-aligned topics');
    const targetTopic = topicsRes.body.topics[0];
    const targetTopicId = targetTopic.topicId || targetTopic.id;
    console.log(`   Selected topic: [${targetTopicId}] ${targetTopic.title}`);

    // 2. Initialize Debate Room
    console.log('\n[Test 2] Initialize Debate Room');
    const initRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/debate/room/init',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      roomId: 'room_phase3_test',
      topicId: targetTopicId,
      durationMinutes: 20
    });
    const room = initRes.body.room;
    const roomId = room ? (room.roomId || room.id) : null;
    assert(initRes.status === 200 && room && roomId, 'Debate room initialized with server-synced endsAt');
    console.log(`   Room ID: ${roomId}, endsAt: ${room?.endsAt}`);

    // 3. Test Join Debate: Unqualified student (0 badges when requirement is 1) vs Qualified student (1+ badge)
    console.log('\n[Test 3] Test Badge Eligibility Gate for Debate Join');
    // First, verify class settings
    const settingsRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/teacher/class-settings',
      method: 'GET'
    });
    const requiredBadges = settingsRes.body.settings.requiredBadgeCount || 1;
    console.log(`   Current required badges for battle: ${requiredBadges}`);

    // Test unqualified user
    const unqualifiedRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/debate/join',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      roomId: roomId,
      userId: 'user_unqualified_test',
      userName: '미이수학생',
      role: 'student',
      stance: 'pro'
    });
    assert(unqualifiedRes.status === 403 && unqualifiedRes.body.success === false,
      'Unqualified student without required badges is safely rejected by eligibility gate (403)');

    // Test qualified user (예시학생1 - has 1 badge from Phase 1)
    const qualifiedRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/debate/join',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      roomId: roomId,
      userId: 'demo_student_1',
      userName: '예시학생1',
      role: 'student',
      stance: 'pro'
    });
    assert(qualifiedRes.status === 200 && qualifiedRes.body.room, 'Qualified student (예시학생1, 1+ badge) successfully joins debate room');

    // Test teacher observer join (bypasses student badge check)
    const teacherJoinRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/debate/join',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      roomId: roomId,
      userId: 'teacher_001',
      userName: '예시교사 선생님',
      role: 'teacher',
      stance: 'observer'
    });
    assert(teacherJoinRes.status === 200 && teacherJoinRes.body.room, 'Teacher successfully joins debate room as observer');

    // 4. Test Student Valid Speech Message
    console.log('\n[Test 4] Post Valid Debate Speech Message with Speech Type');
    const speechRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/debate/message',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      roomId: roomId,
      userId: 'demo_student_1',
      userName: '예시학생1',
      speechType: '주장',
      targetUser: '전체',
      stance: 'pro',
      content: '기본소득제는 롤스의 차등 원칙에 따라 최소 수혜자에게 실질적인 인간다운 삶을 보장하므로 사회 정의에 부합합니다.'
    });
    assert(speechRes.status === 200 && speechRes.body.message && (speechRes.body.message.speechType === '주장' || speechRes.body.message.messageType === 'claim'),
      'Valid student speech with [주장] tag posted and appended to room');

    // 5. Test Moderation Filter (Profanity / Abuse / Personal Attack)
    console.log('\n[Test 5] Test Moderation Filter and Socratic Civility Guidance');
    const toxicRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/debate/message',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      roomId: roomId,
      userId: 'demo_student_1',
      userName: '예시학생1',
      speechType: '반론',
      targetUser: '이도윤',
      stance: 'pro',
      content: '너 바보냐? 그따위 말도 안 되는 헛소리는 쓰레기 주장이다 멍청아.'
    });
    assert(toxicRes.body.moderated === true && toxicRes.body.guidance,
      'Offensive/uncivil language blocked by moderation filter with Socratic civility guidance');
    console.log(`   Coach Guidance: "${toxicRes.body.guidance}"`);

    // 6. Test AI Socratic Mid-Debate Summary
    console.log('\n[Test 6] Socratic Mid-Debate Summary Generation');
    const summaryRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/debate/ai-summary',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      roomId: roomId
    });
    assert(summaryRes.status === 200 && summaryRes.body.summary, 'Socratic mid-debate summary generated');
    const sum = summaryRes.body.summary;
    const hasNeutral = !JSON.stringify(sum).includes('찬성이 이기고') && !JSON.stringify(sum).includes('반대가 이기고');
    assert(hasNeutral, 'Summary is strictly neutral and does not declare any team as winning');
    console.log(`   Pro Summary: ${sum.proPoints ? sum.proPoints[0] : 'N/A'}`);
    console.log(`   Con Summary: ${sum.conPoints ? sum.conPoints[0] : 'N/A'}`);
    console.log(`   Socratic Next Question: ${sum.socraticChallenge}`);

    // 7. Test Teacher Observation Note
    console.log('\n[Test 7] Teacher Observer Note Recording');
    const noteRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/teacher/debate-note',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      roomId: roomId,
      teacherId: 'teacher_001',
      studentId: 'demo_student_1',
      studentName: '예시학생1',
      speechType: '주장',
      competency: '비판적사고/논리구성',
      rating: '우수',
      note: '롤스의 차등 원칙 개념을 적절히 인용하여 최소 수혜자 보장의 관점에서 주장을 정연하게 제시함.'
    });
    assert(noteRes.status === 200 && noteRes.body.observation && noteRes.body.observation.id,
      'Teacher observation note recorded and linked to student');

    // 8. Test Finish Debate & Comprehensive Socratic Evaluation
    console.log('\n[Test 8] Finish Debate and Generate Comprehensive Socratic Evaluation');
    const finishRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/debate/finish',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      roomId: roomId
    });
    assert(finishRes.status === 200 && finishRes.body.evaluation,
      'Debate finished and comprehensive Socratic evaluation returned');
    const evalData = finishRes.body.evaluation;
    assert(evalData.studentEvaluations && evalData.studentEvaluations.length > 0,
      'Individual student evaluations included with strengths and next growth challenges');
    const studentEval = evalData.studentEvaluations[0];
    console.log(`   Student: ${studentEval.userName}`);
    console.log(`   Strengths: ${studentEval.strengths?.join(', ')}`);
    console.log(`   Next Growth Challenge: ${studentEval.nextGrowthChallenge}`);
    console.log(`   Evidence Trace: ${JSON.stringify(studentEval.evidenceTrace)}`);

    // 9. Verify Final Room State
    console.log('\n[Test 9] Verify Persisted Debate Room State');
    const roomStateRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: `/api/debate/room/${roomId}`,
      method: 'GET'
    });
    assert(roomStateRes.status === 200 && roomStateRes.body.room.status === 'completed',
      'Debate room status transitioned to "completed" in persisted storage');

  } catch (err) {
    console.error('Unexpected test error:', err);
    failed++;
  }

  console.log(`\n=== [PHASE 3 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED] ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runPhase3Tests();

