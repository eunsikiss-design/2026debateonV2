'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LearningDraftStore}=require('./services/learningDraftStore');
const {ActivitySheets}=require('./services/activitySheets');
const records=require('./services/schoolRecordService');
test('persistent drafts, versions and completed work survive a reopened store and reach teacher and Sheets without duplication',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'debateon-audit-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const user={uid:'audit',schoolId:'school-a',grade:1,classId:3,studentNumber:'10301',name:'시험학생',role:'student',onboardingComplete:true};
 const file=path.join(root,'drafts.json'),drafts=new LearningDraftStore(file),topic='episode2026_1_01';
 let d=drafts.save(user,topic,{mode:'basic',revision:0,snapshot:true,content:{claim:'입장',reason:'첫 번째 이유',rebuttal:'',stance:'pro'}});
 d=drafts.save(user,topic,{mode:'basic',revision:d.revision,snapshot:true,content:{claim:'입장',reason:'다듬은 이유',rebuttal:'다른 의견도 반영',stance:'pro'}});
 const reopened=new LearningDraftStore(file);assert.equal(reopened.get(user,topic).basic.versions.length,2);
 assert.equal(reopened.get({...user,uid:'other'},topic).basic,undefined);
 let syncState=null;const sessions=[{sessionId:'completed',userId:user.uid,topicId:topic,mode:'basic',claim:'입장',reason:'다시 쓴 글 완료',evaluation:{feedback:'교과 개념과 연결'},createdAt:'2026-09-26T10:00:00Z'}];
 const storage={getUsers:()=>[user],getRecordSheetConfig:()=>({spreadsheetId:'sheet-a'}),getStudentPracticeSessions:()=>sessions,getStudentRecordEvidence:()=>({sessions,messages:[],observations:[]}),getSchoolRecordDraft:()=>null,getActivitySheetSync:()=>syncState,saveActivitySheetSync:(uid,s)=>{syncState=s;}};
 const rows=new Map();let fail=false,writes=0;const sheets={locked:async(k,fn)=>fn(),ensureTab:async()=>({tab:{sheetId:1,gridProperties:{rowCount:1000}}}),request:async(id,suffix,method,body)=>{
  if(suffix.startsWith('/values/'))return {values:[...rows.values()].map(r=>[r[0]])};
  if(suffix==='/values:batchUpdate'){if(fail)throw Error('network unavailable');for(const item of body.data){rows.set(item.range,item.values[0]);writes++;}}
  return {};
 }};
 const svc=new ActivitySheets(storage,{drafts:reopened,topic:()=>({title:'의무 투표제'})},sheets);
 const portfolio=records.portfolio(storage,user,()=>({title:'의무 투표제'}),reopened.list(user));
 assert.ok(portfolio.sources.some(s=>s.text.includes('첫 번째 이유')));assert.ok(portfolio.sources.some(s=>s.text.includes('다시 쓴 글 완료')));
 assert.equal(svc.status({schoolId:'other'}).students.length,0);
 assert.equal(svc.status({schoolId:'school-a'}).pendingCount,1);
 await svc.syncAll({schoolId:'school-a'});assert.equal(rows.size,4);assert.equal(svc.status({schoolId:'school-a'}).pendingCount,0);
 const oldWrites=writes;await new ActivitySheets(storage,{drafts:new LearningDraftStore(file),topic:()=>({title:'의무 투표제'})},sheets).syncAll({schoolId:'school-a'});assert.equal(writes,oldWrites);
 const next={...d.content,reason:'오프라인 중 새 저장본'};reopened.save(user,topic,{mode:'basic',content:next,revision:d.revision,snapshot:true});
 fail=true;await svc.syncAll({schoolId:'school-a'});assert.equal(svc.status({schoolId:'school-a'}).pendingCount,1);assert.equal(reopened.get(user,topic).basic.versions.length,3);
 fail=false;await svc.syncAll({schoolId:'school-a'});assert.equal(rows.size,5);assert.equal(svc.status({schoolId:'school-a'}).pendingCount,0);assert.ok([...rows.values()].some(r=>r[9].includes('오프라인 중 새 저장본')));
});

test('advanced draft without a writing plan can be saved',t=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'debateon-plan-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const drafts=new LearningDraftStore(path.join(root,'drafts.json'));const d=drafts.save({uid:'test',schoolId:'school'},'topic',{mode:'advanced',revision:0,snapshot:true,content:{paragraphs:['작성한 글'],writingPlan:null}});assert.equal(d.versions[0].content.paragraphs[0],'작성한 글');assert.equal(d.content.writingPlan.targetParagraphs,3);});

test('one deployment uses one school for students and teachers even with conflicting legacy settings',()=>{const school=require('./services/appSchool');assert.equal(school.id({}), 'default-school');assert.equal(school.id({ADMIN_SCHOOL_ID:'our-school',STUDENT_SCHOOL_ID:'old-school'}),'our-school');});
