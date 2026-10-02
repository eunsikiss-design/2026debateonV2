'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const growth=require('./services/studentGrowthService');
const {GrowthSheets,HEADERS,TABS}=require('./services/growthSheets');
const {build}=require('./tests/helpers/learning-server.cjs');
const path=require('node:path');

test('growth analyses sync as readable, scoped rows and stale analyses hide old findings',async()=>{
 const student={uid:'student-1',role:'student',schoolId:'school-a',grade:1,classId:2,studentNumber:'10201',name:'학생',onboardingComplete:true};
 const session={sessionId:'session-1',topicId:'topic-1',mode:'basic',claim:'저는 찬성합니다.',reason:'투표는 시민의 참여를 돕습니다.',createdAt:'2026-10-01T00:00:00Z'};
 const analysisByTopic={},states={},rows=new Map();let writes=0;
 const storage={
  getUsers:()=>[student,{...student,uid:'outsider',schoolId:'school-b'}],getRecordSheetConfig:school=>school==='school-a'?{spreadsheetId:'sheet-a'}:null,
  getStudentGrowthAnalyses:()=>Object.entries(analysisByTopic).map(([topicId,analysis])=>({topicId,analysis})),
  getGrowthAnalysisIndex:()=>({'student-1':Object.entries(analysisByTopic).map(([topicId,analysis])=>({topicId,analysis}))}),
  getStudentRecordEvidence:()=>({sessions:[session],messages:[],observations:[]}),getSchoolRecordDraft:()=>null,
  getGrowthSheetSync:uid=>states[uid]||null,saveGrowthSheetSync:(uid,state)=>(states[uid]=state)
 };
 const learning={drafts:{list:()=>({})},topic:()=>({title:'의무 투표제',keyConcepts:['참여']})};
 const current=growth.collect(storage,learning,student,'topic-1'),source=current.sources[0];
 analysisByTopic['topic-1']={source:'gemini-api',fingerprint:current.fingerprint,generatedAt:'2026-10-02T00:00:00Z',analyzedCount:1,notice:'학생 원문에 근거한 학습 피드백입니다.',axes:growth.AXES.map(axis=>({key:axis.key,label:axis.label,status:'observed',finding:'주장과 근거를 연결했습니다.',nextStep:'다른 관점도 검토하세요.',evidence:[{sourceId:source.id,quote:'저는 찬성합니다.'}]})),changes:[]};
 const sheets={locked:async(key,run)=>run(),ensureTab:async(id,title,headers)=>{assert.deepEqual(headers,HEADERS);return {tab:{sheetId:title===TABS.real?1:2,gridProperties:{rowCount:1000}}};},request:async(id,suffix,method,body)=>{
  if(suffix.startsWith('/values/'))return {values:[...rows.values()].map(item=>[item.values[0][0]])};
  if(suffix==='/values:batchUpdate'){for(const item of body.data){rows.set(item.range,item);writes++;}}
  return {};
 }};
 const service=new GrowthSheets(storage,learning,sheets),scope={schoolId:'school-a',grade:1,classId:2};
 assert.equal(service.status({schoolId:'school-b'}).students.length,1);
 assert.equal(service.status(scope).pendingCount,1);
 await service.syncAll(scope);assert.equal(rows.size,1);assert.equal(service.status(scope).syncedCount,1);
 let values=[...rows.values()][0].values[0];assert.equal(values[6],'분석 완료');assert.match(values[9],/원문 인용: “저는 찬성합니다.”/);assert.match(values[9],/다음 연습:/);
 await service.syncAll(scope);assert.equal(writes,1);
 session.reason='참여 방법을 다시 생각했습니다.';
 assert.equal(service.status(scope).pendingCount,1);
 await service.syncAll(scope);values=[...rows.values()][0].values[0];assert.equal(values[6],'원문 변경 · 재분석 필요');assert.equal(values[9],'');assert.match(values[15],/이전 분석 결과는 표시하지 않습니다/);
 analysisByTopic['topic-1']={...analysisByTopic['topic-1'],fingerprint:growth.collect(storage,learning,student,'topic-1').fingerprint,generatedAt:'2026-10-03T00:00:00Z'};
 await service.syncAll(scope);values=[...rows.values()][0].values[0];assert.equal(values[6],'분석 완료');assert.equal(values[7],'2026-10-03T00:00:00Z');
});

test('only teachers can inspect or retry the class-scoped growth sheet sync',async t=>{
 const storage={getUser:()=>null,getUsers:()=>[],getRecordSheetConfig:()=>null,getGrowthAnalysisIndex:()=>({})};
 const fixture=build(path.join(__dirname,'data','topics.json'),null,{storage}),server=await fixture.start();t.after(()=>server.close());
 let response=await fetch(server.origin+'/api/teacher/growth-sheets?class=1-1',{headers:{cookie:'test_role=student'}});assert.equal(response.status,403);
 response=await fetch(server.origin+'/api/teacher/growth-sheets?class=9-9',{headers:{cookie:'test_role=teacher'}});assert.equal(response.status,403);
 response=await fetch(server.origin+'/api/teacher/growth-sheets?class=1-1',{headers:{cookie:'test_role=teacher'}});assert.equal(response.status,200);let data=await response.json();assert.equal(data.connected,false);assert.equal(data.pendingCount,0);
 response=await fetch(server.origin+'/api/teacher/growth-sheets',{method:'POST',headers:{cookie:'test_role=teacher','Content-Type':'application/json'},body:JSON.stringify({class:'1-1'})});assert.equal(response.status,200);data=await response.json();assert.equal(data.syncedCount,0);
});
