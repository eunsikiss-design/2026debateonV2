'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {build}=require('./tests/helpers/learning-server.cjs');

test('a student can revisit their own topic-specific writing and speech, including drafts',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'debateon-history-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const h=build(path.join(dir,'teaching.json')),server=await h.start();t.after(server.close);
  const topicId='episode2026_1_01',otherTopic='episode2026_1_02';
  const call=async(url,role='student',method='GET',body)=>fetch(server.origin+url,{method,headers:{cookie:role?'test_role='+role:'','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  let response=await call('/api/learning/drafts/'+topicId,'student','PUT',{mode:'speech',revision:0,content:{sourceText:'말하기 준비 글',claim:'나의 주장',reason:'핵심 이유',condition:'다른 의견',transcript:'연습 중인 말',targetDurationSeconds:90}});
  assert.equal(response.status,200);
  response=await call('/api/practice/submit','student','POST',{topicId,stance:'con',claim:'고친 주장',reason:'피드백 후 다시 쓴 이유',rebuttal:'다른 사람의 걱정',attemptCount:2,evaluation:{feedback:{question:'왜 그런가요?'}}});
  assert.equal(response.status,200);
  h.sessions.push({userId:h.users.student.uid,topicId,mode:'advanced_essay',studentDraft:'완성한 논술 글',createdAt:'2026-09-26T09:00:00.000Z'});
  h.sessions.push({userId:h.users.student.uid,topicId,mode:'speech_timer',transcript:'완료한 스피치 전사문',outline:{claim:'나의 주장'},durationSeconds:47,createdAt:'2026-09-26T10:00:00.000Z'});
  h.sessions.push({userId:'another-student',topicId,mode:'basic',reason:'다른 학생의 비밀',createdAt:'2026-09-26T11:00:00.000Z'});
  h.sessions.push({userId:h.users.student.uid,topicId:otherTopic,mode:'basic',reason:'다른 주제 글',createdAt:'2026-09-26T12:00:00.000Z'});
  response=await call('/api/learning/history?topicId='+topicId);
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  const data=await response.json();assert.equal(data.entries.length,4);assert.deepEqual(new Set(data.entries.map(e=>e.mode)),new Set(['basic','advanced','speech']));
  assert.ok(data.entries.some(e=>e.kind==='record'&&e.content.reason==='피드백 후 다시 쓴 이유'));
  assert.ok(data.entries.some(e=>e.kind==='draft'&&e.content.sourceText==='말하기 준비 글'));
  assert.ok(data.entries.some(e=>e.content.transcript==='완료한 스피치 전사문'));
  assert.ok(!JSON.stringify(data).includes('다른 학생의 비밀'));assert.ok(!JSON.stringify(data).includes('다른 주제 글'));
  response=await call('/api/learning/history');assert.equal((await response.json()).entries.length,5);
  assert.equal((await call('/api/learning/history','')).status,401);
  assert.equal((await call('/api/learning/history','teacher')).status,403);
  assert.equal((await call('/api/learning/history?topicId=unknown')).status,404);
});
