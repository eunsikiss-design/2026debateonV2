'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'school-records-'));process.env.DATA_STORE_PATH=path.join(dir,'store.json');
const storage=require('./services/storageService'),records=require('./services/schoolRecordService'),{build}=require('./tests/helpers/learning-server.cjs');
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
test('portfolio excludes other authors and schools, outline-only speech, AI scores and badges; no evidence means no draft',()=>{
 const student={uid:'one',name:'학생',studentNumber:'10101',role:'student',schoolId:'test',grade:1,classId:1};storage.saveUser(student);
 storage.savePracticeSession({sessionId:'basic-1',userId:'one',topicId:'episode2026_1_01',claim:'참정권은 권리입니다.',reason:'참여하지 않을 자유도 고려해야 합니다.',analysis:{claim:99}});
 storage.savePracticeSession({sessionId:'other',userId:'two',claim:'다른 학생의 비공개 글'});
 storage.savePracticeSession({sessionId:'outline',userId:'one',mode:'speech_timer',outline:'개요만 있음',evaluation:{praise:'탁월함'}});
 for(const [roomId,schoolId] of [['own-room','test'],['other-room','other']]){
  storage.initDebateRoom({roomId,schoolId,grade:1,classId:1,topicId:'episode2026_1_01'});
  storage.addDebateMessage(roomId,{authorUid:'one',content:roomId==='own-room'?'자유와 책임을 함께 고려해야 합니다.':'타학교 방의 발언'});
  storage.addDebateMessage(roomId,{authorUid:'two',content:'다른 학생 발언'});
  storage.addTeacherObservation({debateId:roomId,studentUid:'two',note:'다른 학생 관찰'});
 }
 const p=records.portfolio(storage,student,id=>storage.getTopic(id));assert.equal(p.sources.length,2);assert.ok(p.sources.every(s=>!s.text.includes('다른 학생')&&!s.text.includes('타학교')));
 assert.throws(()=>records.selection(p,[]),/선택/);assert.throws(()=>records.selection(p,['other']),/이 학생/);assert.throws(()=>records.selection(p,[p.sources[0].id,p.sources[0].id]),/서로 다른/);
 const draft=records.localDraft(p.sources);assert.equal(draft.source,'evidence-extract');assert.doesNotMatch(draft.draftText,/탁월|성장|99/);
});
test('AI output needs exact citations for each claim; invalid output falls back without fabricated evaluation',async()=>{
 const sources=[{id:'own',kind:'debate',label:'토론 발언',title:'의무 투표제',text:'투표에 참여하지 않을 자유도 고려해야 합니다.',concepts:['자유']}];
 const valid={analysis:[{competency:'다른 관점 이해',finding:'불참의 자유를 검토할 필요를 제시합니다.',evidence:[{sourceId:'own',quote:'참여하지 않을 자유도 고려해야'}]}],sentences:[{text:'투표 불참의 자유를 고려해야 한다는 관점을 제시함.',evidence:[{sourceId:'own',quote:'투표에 참여하지 않을 자유도 고려해야 합니다.'}]}]};
 assert.equal(records.validateAI(valid,sources).source,'gemini-api');
 const perspectives=['시간적 관점','공간적 관점','사회적 관점','윤리적 관점'].map(perspective=>({perspective,status:'insufficient',finding:'',nextStep:'사례와 비교하여 추가로 확인해 보세요.',evidence:[]}));
 assert.equal(records.validateAI({...valid,integratedThinking:perspectives},sources).integratedThinking.length,4);
 assert.throws(()=>records.validateAI({...valid,integratedThinking:[{...perspectives[0],status:'observed'}]},sources));
 assert.throws(()=>records.validateAI({...valid,sentences:[{...valid.sentences[0],evidence:[{sourceId:'other',quote:'타인의 글'}]}]},sources));
 assert.throws(()=>records.validateAI({...valid,analysis:[{...valid.analysis[0],evidence:[{sourceId:'own',quote:'훌륭한 리더십'}]}]},sources));
 const service=require('./services/geminiService'),prior={key:service.apiKey,model:service.analysisModel,call:service._callGeminiAPIWithPrompt};
 service.apiKey='test-only';service.analysisModel='fixture';service._callGeminiAPIWithPrompt=async input=>{assert.doesNotMatch(input.userPrompt,/studentNumber|email|uid/);return valid;};
 try{assert.equal((await service.generateSchoolRecordDraft({sources})).source,'gemini-api');service._callGeminiAPIWithPrompt=async()=>({analysis:[],sentences:[]});const fallback=await service.generateSchoolRecordDraft({sources});assert.equal(fallback.source,'evidence-extract');assert.match(fallback.notice,/AI 의미 분석/);}finally{service.apiKey=prior.key;service.analysisModel=prior.model;service._callGeminiAPIWithPrompt=prior.call;}
});
test('teacher flow scopes selected class, generates, edits, persists, rejects stale writes and test approval',async()=>{
 const base={schoolId:'test',grade:1,classId:1,onboardingComplete:true};const users={teacher:{...base,uid:'teacher',role:'teacher'},student:{...base,uid:'one',role:'student'},other:{...base,uid:'outsider',schoolId:'other',role:'student'}};
 const second={...base,uid:'second',studentNumber:'10201',name:'둘째 학생',classId:2,role:'student'};storage.saveUser(second);storage.saveUser(users.other);
 storage.savePracticeSession({sessionId:'essay',userId:'second',mode:'advanced_essay',topicId:'episode2026_1_01',studentDraft:'참정권은 권리입니다. 다만 정치적 대표성을 높일 대안도 필요합니다.'});
 const coach={generateSchoolRecordDraft:async({sources})=>records.localDraft(sources)},roster={students:[{grade:1,classId:2}],registrationStatus:()=>[]};
 const app=await build(path.join(dir,'teaching.json'),coach,{storage,users,studentRoster:roster}).start();
 const call=async(url,who='teacher',body,method)=>{const r=await fetch(app.origin+url,{method:method||(body?'POST':'GET'),headers:{cookie:'test_uid='+who,origin:app.origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cache:r.headers.get('cache-control')};};
 try{
  assert.equal((await call('/api/teacher/student-record?studentId=second','student')).status,403);
  assert.equal((await call('/api/teacher/student-record?studentId=outsider')).status,403);
  let fetched=await call('/api/teacher/student-record?studentId=second');assert.equal(fetched.status,200);assert.match(fetched.cache,/no-store/);
  const ids=fetched.data.sources.map(s=>s.id);const gen=await call('/api/teacher/generate-record','teacher',{studentId:'second',evidenceIds:ids});assert.equal(gen.status,200);
  assert.equal(storage.getSchoolRecordDraft('second'),null,'generation must not overwrite saved teacher text');
  const input={studentId:'second',revision:0,evidenceIds:ids,evidenceFingerprint:gen.data.draft.evidenceFingerprint,generationId:gen.data.draft.generationId,draftText:'교사가 근거를 대조하여 수정한 초안임.',reviewed:true};
  const saved=await call('/api/teacher/student-record','teacher',input,'PUT');assert.equal(saved.status,200);assert.equal(saved.data.saved.status,'teacher-reviewed');assert.equal(saved.data.saved.revision,1);
  fetched=await call('/api/teacher/student-record?studentId=second');assert.equal(fetched.data.saved.draftText,input.draftText);assert.equal(fetched.data.saved.generated.source,'evidence-extract');
  assert.equal((await call('/api/teacher/student-record','teacher',input,'PUT')).status,409);
  assert.equal((await call('/api/teacher/student-record','teacher',{...input,revision:1,evidenceFingerprint:'old'},'PUT')).status,409);
  storage.saveUser({...second,isTestAccount:true});assert.equal((await call('/api/teacher/student-record','teacher',{...input,revision:1},'PUT')).status,400);
  assert.equal((await call('/api/teacher/student-record','teacher',{...input,revision:1,reviewed:false},'PUT')).status,200);
  assert.equal(storage.getSchoolRecordDraft('second').status,'test-draft');
  storage.saveUser({...second,uid:'unlisted',classId:12});assert.equal((await call('/api/teacher/student-record?studentId=unlisted')).status,403);
 }finally{await app.close();}
});
