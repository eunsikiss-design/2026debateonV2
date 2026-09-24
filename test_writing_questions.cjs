'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),os=require('node:os');
const {recommend}=require('./assets/writing-plan'),questions=require('./services/writingQuestions'),learning=require('./services/learningService'),coach=require('./services/geminiService');
const user={uid:'fixture',schoolId:'fixture-school',role:'student'};
test('length recommendation connects characters, sentences and paragraphs',()=>{
 assert.deepEqual(recommend('chars',300),{targetChars:300,targetSentences:6,targetParagraphs:2});
 assert.deepEqual(recommend('paragraphs',1),{targetChars:200,targetSentences:4,targetParagraphs:1});
 assert.deepEqual(recommend('sentences',9),{targetChars:450,targetSentences:9,targetParagraphs:3});
 assert.deepEqual(recommend('paragraphs',NaN),{targetChars:600,targetSentences:12,targetParagraphs:3});
});
test('all named protagonists appear in their story and speech has two distinct issue positions',()=>{
 for(const m of require('./data/learning-materials.json').topics){
  assert.ok(m.scenario.story.includes(m.scenario.role),m.id);
  assert.ok(m.scenario.choiceQuestion.includes(m.scenario.role),m.id);
  assert.ok(m.speechScenario.story.includes(m.scenario.role),m.id);
  assert.notEqual(m.speechScenario.story,m.scenario.story,m.id);
  assert.equal(m.speechScenario.perspectives.length,2,m.id);
  assert.notEqual(m.speechScenario.perspectives[0].reason,m.speechScenario.perspectives[1].reason,m.id);
 }
});
test('AI planning receives the actual character and plan, and rejects invented context or terms',async t=>{
 const old={apiKey:coach.apiKey,coachModel:coach.coachModel,call:coach._callGeminiAPIWithPrompt};
 t.after(()=>Object.assign(coach,{apiKey:old.apiKey,coachModel:old.coachModel,_callGeminiAPIWithPrompt:old.call}));
 coach.apiKey='fixture-only';coach.coachModel='fixture-only';
 const lesson=learning.lesson('curriculum_1_02',user),plan=recommend('chars',300);
 const valid=questions.localQuestions(lesson,plan);let received;
 coach._callGeminiAPIWithPrompt=async request=>(received=request,{paragraphs:valid.paragraphs});
 const result=await coach.planAdvancedWriting({lesson,writingPlan:plan});
 assert.equal(result.source,'gemini-api');assert.equal(result.paragraphs.length,2);
 assert.match(received.userPrompt,/박하준 청년/);assert.match(received.userPrompt,/두 달 뒤/);
 assert.match(received.userPrompt,/"targetChars":300/);assert.doesNotMatch(received.userPrompt,/"essays":|"speeches":/);
 assert.throws(()=>questions.validate({paragraphs:[{...valid.paragraphs[0],contextQuote:'자료에 없는 해외 주거 통계입니다.'},valid.paragraphs[1]]},lesson,plan));
 assert.throws(()=>questions.validate({paragraphs:[{...valid.paragraphs[0],terms:['교사가 등록하지 않은 말']},valid.paragraphs[1]]},lesson,plan));
 coach._callGeminiAPIWithPrompt=async()=>({paragraphs:[]});
 const fallback=await coach.planAdvancedWriting({lesson,writingPlan:plan});
 assert.equal(fallback.source,'lesson-guide');assert.equal(fallback.paragraphs.length,2);assert.ok(fallback.paragraphs[0].contextQuote.includes('박하준'));
});
test('planning endpoint authenticates, checks origin and uses canonical lesson data',async t=>{
 let received;
 const h=require('./tests/helpers/learning-server.cjs').build(path.join(os.tmpdir(),'unused-plan-fixture.json'),{planAdvancedWriting:async input=>(received=input,questions.localQuestions(input.lesson,input.writingPlan))});
 const server=await h.start();t.after(server.close);
 const call=(cookie,origin,body)=>fetch(server.origin+'/api/practice/advanced/plan',{method:'POST',headers:{cookie,origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await call('',server.origin,{topicId:'curriculum_1_02'})).status,401);
 assert.equal((await call('test_role=student','https://outside.invalid',{topicId:'curriculum_1_02'})).status,403);
 const r=await call('test_role=student',server.origin,{topicId:'curriculum_1_02',lesson:{scenario:{story:'forged'}},writingPlan:recommend('chars',300)});
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.match(received.lesson.scenario.story,/박하준/);
 const body=await r.json();assert.equal(body.plan.paragraphs.length,2);assert.equal(h.sessions.length,0);
 assert.equal((await call('test_role=student',server.origin,{topicId:'unknown'})).status,404);
});
