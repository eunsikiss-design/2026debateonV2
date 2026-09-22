import assert from 'assert';
import http from 'http';

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, rawBody: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

async function testPhase4AnalyticsSuite() {
  console.log('=== Phase 4 Automated Verification Test Suite ===\n');

  // Test 1: Fetch Class Analytics via API Endpoint
  console.log('[Test 1] Testing GET /api/teacher/class-analytics');
  const analyticsRes = await makeRequest({
    hostname: '127.0.0.1',
    port: 3000,
    path: '/api/teacher/class-analytics?schoolId=ansan_gangseo&grade=1&classId=3',
    method: 'GET'
  });

  assert.strictEqual(analyticsRes.status, 200, 'Endpoint should return HTTP 200 OK');
  assert.strictEqual(analyticsRes.body.success, true, 'Response success should be true');
  assert.ok(analyticsRes.body.analytics, 'Analytics payload should be present');

  const analytics = analyticsRes.body.analytics;

  // Test 2: 5-Competency Average Diagnostics
  console.log('[Test 2] Verifying 5-Competency Average Breakdown');
  const comp = analytics.averageCompetencies;
  assert.ok(comp, 'Competencies object should exist');
  assert.strictEqual(typeof comp.concept, 'number', 'Concept score should be a number');
  assert.strictEqual(typeof comp.claim, 'number', 'Claim score should be a number');
  assert.strictEqual(typeof comp.reasoning, 'number', 'Reasoning score should be a number');
  assert.strictEqual(typeof comp.rebuttal, 'number', 'Rebuttal score should be a number');
  assert.strictEqual(typeof comp.expression, 'number', 'Expression score should be a number');

  console.log(` -> Concept: ${comp.concept}, Claim: ${comp.claim}, Reasoning: ${comp.reasoning}, Rebuttal: ${comp.rebuttal}, Expression: ${comp.expression}`);

  // Test 3: AI Weak Area Diagnosis & Next Lesson Recommendation
  console.log('[Test 3] Verifying AI Recommendation based on Weak Area');
  assert.ok(analytics.weakestCompetency, 'Weakest competency should be identified');
  assert.strictEqual(analytics.weakestCompetency, 'rebuttal', 'Weakest area should be accurately calculated as rebuttal');
  assert.ok(analytics.recommendedTopic, 'Recommended topic should exist');
  const topicId = analytics.recommendedTopic.id || analytics.recommendedTopic.topicId;
  assert.strictEqual(topicId, 'topic_affirmative_action', 'AI should recommend topic matching weakest competency');
  assert.ok(analytics.recommendedTopic.reason.includes('반론 대응'), 'Recommendation reason should highlight weak area');

  console.log(` -> Weakest Area: ${analytics.weakestCompetency}`);
  console.log(` -> Recommended Topic: ${analytics.recommendedTopic.title}`);
  console.log(` -> Rationale: ${analytics.recommendedTopic.reason}`);

  // Test 4: Live Student Observation Feed
  console.log('[Test 4] Verifying Live Student Observation Feed');
  assert.ok(Array.isArray(analytics.recentObservations), 'Recent observations should be an array');
  assert.ok(analytics.recentObservations.length > 0, 'Should have recent student observation notes');
  const obs = analytics.recentObservations[0];
  assert.ok(obs.studentName, 'Student name should be populated');
  assert.ok(obs.note, 'Observation note should be populated');

  console.log(` -> Live Feed sample: [${obs.studentName}] ${obs.note}`);

  console.log('\n✅ All Phase 4 Automated Verification Tests PASSED (4/4 assertions clean)!');
}

testPhase4AnalyticsSuite().catch(err => {
  console.error('\n❌ Phase 4 Test Suite Failed:', err);
  process.exit(1);
});

