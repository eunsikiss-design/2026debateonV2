'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'student-growth-'));process.env.DATA_STORE_PATH=path.join(dir,'store.json');
const storage=require('./services/storageService'),growth=require('./services/studentGrowthService'),{build}=require('./tests/helpers/learning-server.cjs');
test.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'student-growth-'));fs.rmSync(dir,{recursive:true,force:true});});
const topic='episode2026_1_01';
function setup(tag,coach){const base={schoolId:'growth-school',grade:1,classId:13,onboardingComplete:true};const users={student:{...base,uid:tag,studentNumber:'11301',name:'검증학생',role:'student'},other:{...base,uid:tag+'-other',role:'student'},teacher:{...base,uid:tag+'-teacher',role:'teacher'},outsider:{...base,schoolId:'other-school',uid:tag+'-outsider',role:'teacher'}};Object.values(users).forEach(u=>storage.saveUser(u));return build(path.join(dir,tag+'.json'),coach,{storage,users});}
async function call(app,uid,who='student',body,query=''){const r=await fetch(app.origin+'/api/growth/student/'+uid+(body?'/analyze':'')+query,{method:body?'POST':'GET',headers:{cookie:'test_uid='+who,origin:app.origin,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json(),cache:r.headers.get('cache-control')};}
function valid(report){const s=report.sources[0];return {axes:growth.AXES.map((a,i)=>({key:a.key,status:i===0?'observed':'insufficient',finding:i===0?'원문에서 개념을 사용하고 있습니다.':'이 원문만으로는 추가 확인이 필요합니다.',nextStep:'개념의 뜻과 주장을 연결하여 설명해 보세요.',evidence:i===0?[{sourceId:s.id,quote:s.text.slice(0,20)}]:[]})),changes:[]};}
test('empty and one saved draft show truthful counts, no invented scores, scoped own records',async()=>{
 const h=setup('empty'),app=await h.start();try{
  for(const asset of ['/assets/growth-live.js','/assets/growth.css','/stitch_screens/07_competency_report.html'])assert.equal((await fetch(app.origin+asset)).status,200,asset);
  let r=await call(app,'empty');assert.equal(r.status,200);assert.equal(r.data.summary.recordCount,0);assert.equal(r.data.analysis,null);assert.equal(r.data.competencies,undefined);assert.match(r.cache,/no-store/);assert.equal(r.data.readiness.requiredBadges,0);
  assert.equal((await call(app,'empty','student',{})).status,400);assert.equal((await call(app,'empty','other')).status,403);assert.equal((await call(app,'empty','outsider')).status,403);assert.equal((await call(app,'empty','teacher')).status,200);
  h.learning.drafts.save(h.users.student,topic,{mode:'basic',revision:0,snapshot:true,content:{claim:'투표는 권리입니다.',reason:'참정권을 보장하되 참여하지 않을 자유도 존중해야 합니다.',rebuttal:''}});
  r=await call(app,'empty');assert.equal(r.data.summary.recordCount,1);assert.equal(r.data.summary.savedCount,1);assert.equal(r.data.comparisons.length,0);assert.match(r.data.sources[0].text,/참정권/);assert.doesNotMatch(JSON.stringify(r.data),/overallScore|draftText|privacyConsent/);
 }finally{await app.close();}
});
test('all activity types connect; duplicate saves, empty outlines, teacher private notes and other authors do not inflate analysis',()=>{
 const h=setup('sources'),s=h.users.student;
 for(const [i,text] of ['참정권 보장이 필요합니다.','참정권 보장이 필요합니다.','참정권을 보장하면서 불참의 자유도 존중해야 합니다.'].entries())storage.savePracticeSession({userId:s.uid,topicId:topic,mode:'basic',claim:'투표는 권리입니다.',reason:text,createdAt:`2026-09-${20+i}T01:00:00Z`});
 storage.savePracticeSession({userId:s.uid,topicId:topic,mode:'advanced_essay',studentDraft:'대표성과 개인의 자유를 조화시키는 대안을 검토합니다.'});
 storage.savePracticeSession({userId:s.uid,topicId:topic,mode:'speech_timer',transcript:'투표 참여를 돕는 교육과 정보 제공을 제안합니다.'});
 storage.savePracticeSession({userId:s.uid,topicId:topic,mode:'speech_timer',outline:'스피치 개요만 존재'});
 storage.savePracticeSession({userId:h.users.other.uid,topicId:topic,reason:'다른 학생 비공개 글'});
 const room=storage.initDebateRoom({schoolId:s.schoolId,grade:1,classId:13,topicId:topic});storage.addDebateMessage(room.roomId,{authorUid:s.uid,content:'공동체 참여를 강제해야 하는지 질문합니다.'});storage.addDebateMessage(room.roomId,{authorUid:h.users.other.uid,content:'상대 학생 비공개 발언'});storage.addTeacherObservation({debateId:room.roomId,studentUid:s.uid,note:'비공개 교사 관찰'});
 storage.saveSchoolRecordAnalysis(s.uid,{draftText:'비공개 세특 초안'});
 const r=growth.collect(storage,h.learning,s);assert.deepEqual(r.summary.counts,{basic:2,advanced:1,speech:1,debate:1});assert.equal(r.comparisons.length,1);assert.doesNotMatch(JSON.stringify(r),/비공개|스피치 개요만/);assert.equal(growth.collect(storage,h.learning,s,'episode2026_1_02').summary.recordCount,0);
 // Returning to the original text must not misreport the intermediate rewrite as latest growth.
 storage.savePracticeSession({userId:s.uid,topicId:topic,mode:'basic',claim:'투표는 권리입니다.',reason:'참정권 보장이 필요합니다.',createdAt:'2026-09-24T01:00:00Z'});
 assert.equal(growth.collect(storage,h.learning,s).comparisons.length,0);
});
test('AI citations must be verbatim and changes must cite both verified versions',()=>{
 const sources=[{id:'before',text:'참정권은 국민의 권리입니다.'},{id:'after',text:'참정권을 보장하면서 대표성을 높이는 조건도 검토합니다.'}],pair={beforeId:'before',afterId:'after'},r={sources,comparisons:[pair]},result=valid(r);
 assert.equal(growth.validate(result,r).axes.length,5);
 const unverified=growth.validate({...result,axes:result.axes.map((a,i)=>i? a:{...a,evidence:[{sourceId:'someone-else',quote:'참정권은 국민의 권리입니다.'}]})},r);
 assert.equal(unverified.source,'gemini-partial');assert.equal(unverified.axes[0].status,'insufficient');assert.deepEqual(unverified.axes[0].evidence,[]);
 const change={...pair,finding:'조건을 추가했습니다.',nextStep:'조건을 구체화해 보세요.',evidence:[{sourceId:'before',quote:sources[0].text}]};
 assert.deepEqual(growth.validate({...result,changes:[change]},r).changes,[]);change.evidence.push({sourceId:'after',quote:sources[1].text});assert.equal(growth.validate({...result,changes:[change]},r).changes.length,1);
 assert.deepEqual(growth.validate({...result,changes:[{...change,beforeId:'other'}]},r).changes,[]);
 const lineBreak={sources:[{id:'before',text:'참정권은\n국민의 권리입니다.'}],comparisons:[]};
 const normalized=valid(lineBreak);normalized.axes[0].evidence[0].quote='참정권은 국민의 권리입니다.';
 const repaired=growth.validate(normalized,lineBreak);
 assert.equal(repaired.axes[0].evidence[0].quote,'참정권은\n국민의 권리입니다.');
});

test('student growth uses the responsive coach model before the lighter fallback',async()=>{
 const service=require('./services/geminiService'),prior={key:service.apiKey,analysis:service.analysisModel,coach:service.coachModel,light:service.lightModel,call:service._callGeminiAPIWithPrompt};
 const report={sources:[{id:'one',kind:'basic',text:'학생이 직접 쓴 주장과 이유입니다.'}],comparisons:[]};
 try{
  service.apiKey='fixture';service.analysisModel='slow-analysis';service.coachModel='responsive-coach';service.lightModel='light-fallback';
  service._callGeminiAPIWithPrompt=async input=>{assert.equal(input.modelName,'responsive-coach');assert.equal(input.fallbackModel,'light-fallback');return valid(report);};
  assert.equal((await service.analyzeStudentGrowth(report)).source,'gemini-api');
 }finally{Object.assign(service,{apiKey:prior.key,analysisModel:prior.analysis,coachModel:prior.coach,lightModel:prior.light, _callGeminiAPIWithPrompt:prior.call});}
});
test('analysis persists across sessions, is cached, and invalidates when source content changes',async()=>{
 let calls=0;const h=setup('persist',{analyzeStudentGrowth:async r=>{calls++;return growth.validate(valid(r),r);}}),s=h.users.student;
 storage.savePracticeSession({userId:s.uid,topicId:topic,claim:'투표는 권리입니다.',reason:'참정권을 보장하면서 대표성을 높일 방법을 검토합니다.'});const app=await h.start();
 try{let r=await call(app,s.uid,'student',{});assert.equal(r.status,200);assert.equal(r.data.analysis.source,'gemini-api');assert.equal(calls,1);
  r=await call(app,s.uid,'student',{});assert.equal(calls,1);assert.ok(r.data.analysis.generatedAt);
  const restored=growth.collect(storage,h.learning,s);assert.equal(storage.getStudentGrowthAnalysis(s).fingerprint,restored.fingerprint);
  const newApp=await build(path.join(dir,'persist.json'),null,{storage,users:h.users}).start();try{const fresh=await call(newApp,s.uid);assert.equal(fresh.data.analysis.source,'gemini-api');assert.equal(fresh.data.analysis.generatedAt,r.data.analysis.generatedAt);}finally{await newApp.close();}
  storage.savePracticeSession({userId:s.uid,topicId:'episode2026_1_02',reason:'영업의 자유와 평등권의 관계를 설명합니다.'});r=await call(app,s.uid);assert.equal(r.data.analysis,null);assert.equal(r.data.analysisStale,true);assert.equal(r.data.summary.recordCount,2);
 }finally{await app.close();}
});
test('unavailable AI keeps actual source records and identifies fallback; source changes during analysis reject stale results',async()=>{
 const service=require('./services/geminiService'),prior={key:service.apiKey,model:service.analysisModel,coach:service.coachModel,call:service._callGeminiAPIWithPrompt};
 const report={sources:[{id:'one',kind:'basic',text:'학생이 직접 쓴 주장과 이유입니다.'}],comparisons:[]};
 try{service.apiKey='test';service.analysisModel='fixture';service._callGeminiAPIWithPrompt=async input=>{assert.doesNotMatch(input.userPrompt,/studentNumber|email|uid/);return {axes:[]};};assert.equal((await service.analyzeStudentGrowth(report)).source,'source-review');}finally{Object.assign(service,{apiKey:prior.key,analysisModel:prior.model,coachModel:prior.coach,_callGeminiAPIWithPrompt:prior.call});}
 let h;h=setup('changed',{analyzeStudentGrowth:async r=>{storage.savePracticeSession({userId:'changed',topicId:topic,reason:'분석 중 새로 저장한 다른 글입니다.'});return growth.fallback(r);}});storage.savePracticeSession({userId:'changed',topicId:topic,reason:'분석하기 전 저장한 학생 원문입니다.'});const app=await h.start();try{const r=await call(app,'changed','student',{});assert.equal(r.status,409);assert.equal(storage.getStudentGrowthAnalysis(h.users.student),null);}finally{await app.close();}
});
