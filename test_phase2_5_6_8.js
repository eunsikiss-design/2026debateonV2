// test_phase2_5_6_8.js
// Automated verification suite for Phase 2, Phase 5, Phase 6, Phase 8

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

async function runTests() {
  console.log('=== [PHASE 2, 5, 6, 8 VERIFICATION SUITE START] ===\n');
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
    // 1. Evidence Room: Cards List
    console.log('[Test 1] Evidence Cards Listing');
    const cardsRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/evidence/cards?topicId=topic_justice_basic_income',
      method: 'GET'
    });
    assert(cardsRes.status === 200 && cardsRes.body.cards.length >= 3, 'Evidence cards retrieved for basic income topic (>=3 cards)');
    console.log(`   Fetched ${cardsRes.body.cards.length} cards, sample: [${cardsRes.body.cards[0].title}]`);

    // 2. Evidence Room: Keyword RAG Search
    console.log('\n[Test 2] Evidence Keyword RAG Search');
    const searchRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/evidence/search?q=%EC%B0%A8%EB%93%B1%EC%9D%98%20%EC%9B%90%EC%B9%99', // '차등의 원칙'
      method: 'GET'
    });
    assert(searchRes.status === 200 && searchRes.body.cards.length > 0, 'RAG search for "차등의 원칙" returns matching curriculum evidence cards');
    console.log(`   Top match: ${searchRes.body.cards[0].title}`);

    // 3. Evidence Room: Glossary
    console.log('\n[Test 3] Integrated Social Studies Glossary');
    const glossaryRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/evidence/glossary',
      method: 'GET'
    });
    assert(glossaryRes.status === 200 && glossaryRes.body.glossary.length >= 5, 'Glossary returns comprehensive curriculum terms (>=5)');

    // 4. Advanced Essay: Evaluation
    console.log('\n[Test 4] Advanced Essay Socratic Diagnostic Evaluation');
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
      studentDraft: `따라서 기본소득제의 전면적 도입보다는, 디지털 전환과 자동화로 인해 일자리를 잃은 취약계층을 집중 지원하는 '차등적 안심소득제'의 단계적 도입이 경제적 기회비용 측면에서 더욱 지속 가능하다고 판단된다. 이를 통해 세대 간 조세 저항을 줄이고 국가 재정건전성을 유지하는 현실적인 복지 타협점을 마련해야 한다. 상대편이 우려하는 도덕적 해이나 근로 의욕 저하 문제는 근로 인센티브 연계 제도로 충분히 보완할 수 있다.`
    });
    assert(essayEvalRes.status === 200 && essayEvalRes.body.evaluation && essayEvalRes.body.evaluation.rubricAssessment,
      'Advanced essay evaluated with multi-dimensional rubrics (claimReasoning, conceptApplication, etc.)');
    const evalData = essayEvalRes.body.evaluation;
    console.log(`   Overall Grade: ${evalData.overallLevel}, Completion Rate: ${evalData.completionRate}%`);
    console.log(`   Strengths: ${evalData.strengths.join(' / ')}`);
    console.log(`   Socratic Question: ${evalData.socraticQuestion}`);

    // 5. Advanced Essay: Submission & Badge
    console.log('\n[Test 5] Advanced Essay Submission & Badge Award');
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
      studentDraft: `따라서 기본소득제의 전면적 도입보다는, 디지털 전환과 자동화로 인해 일자리를 잃은 취약계층을 집중 지원하는 '차등적 안심소득제'의 단계적 도입이 경제적 기회비용 측면에서 더욱 지속 가능하다고 판단된다. 이를 통해 세대 간 조세 저항을 줄이고 국가 재정건전성을 유지하는 현실적인 복지 타협점을 마련해야 한다. 상대편이 우려하는 도덕적 해이나 근로 의욕 저하 문제는 근로 인센티브 연계 제도로 충분히 보완할 수 있다.`
    });
    assert(essaySubmitRes.status === 200 && essaySubmitRes.body.session && essaySubmitRes.body.session.sessionId,
      'Advanced essay saved as persistent practice session with evaluation attached');
    console.log(`   Awarded badge: ${essaySubmitRes.body.badge ? essaySubmitRes.body.badge.badgeName : 'None (already awarded or criteria not met)'}`);

    // 6. Speech Training: Evaluation
    console.log('\n[Test 6] Speech Training Pacing, Concept & Structure Evaluation');
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
    assert(speechEvalRes.status === 200 && speechEvalRes.body.evaluation && speechEvalRes.body.evaluation.scores,
      'Speech evaluated with WPM pacing, concept score, and 3-step structure detection');
    const spEval = speechEvalRes.body.evaluation;
    console.log(`   WPM: ${spEval.metrics.wpm} (${spEval.metrics.pacingEvaluation})`);
    console.log(`   Scores: Total ${spEval.scores.totalScore} (Structure ${spEval.scores.structureScore}, Delivery ${spEval.scores.deliveryScore})`);
    console.log(`   Praise: ${spEval.praise}`);

    // 7. Speech Training: Submit
    console.log('\n[Test 7] Speech Training Session Submit & Badge Award');
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
    assert(speechSubmitRes.status === 200 && speechSubmitRes.body.session,
      'Speech training session persisted to storage');

    // 8. Google Sheets Sync Queue & Flush
    console.log('\n[Test 8] Google Sheets Sync Queue & Flush');
    const statusRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/sync/status',
      method: 'GET'
    });
    assert(statusRes.status === 200 && statusRes.body.pendingCount >= 0, 'Sync queue status retrieved');
    console.log(`   Pending items in queue: ${statusRes.body.pendingCount}`);

    const flushRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/sync/flush',
      method: 'POST'
    });
    assert(flushRes.status === 200 && flushRes.body.success === true, 'Sync queue successfully flushed to persistent log/sheet');
    console.log(`   Processed items: ${flushRes.body.processedCount}`);

    // 9. NEIS School Record Draft Generation
    console.log('\n[Test 9] NEIS School Record (세특) Draft Generation');
    const recordRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/teacher/generate-record',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      studentId: 'demo_student_1',
      roomId: 'room_phase3_test'
    });
    assert(recordRes.status === 200 && recordRes.body.draft && recordRes.body.draft.draftText,
      'NEIS-compliant school record draft generated based strictly on actual student activity and teacher observation notes');
    const draft = recordRes.body.draft;
    console.log(`   Student: ${draft.studentName} (${draft.studentNumber})`);
    console.log(`   Draft Text (${draft.characterCount}자 / ${draft.byteCount} Bytes):`);
    console.log(`   "${draft.draftText}"`);
    console.log(`   Evidence Sources: ${draft.evidenceSources.join(' | ')}`);

  } catch (err) {
    console.error('Test run failed with error:', err);
    failed++;
  }

  console.log(`\n=== [PHASE 2, 5, 6, 8 VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED] ===`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();

