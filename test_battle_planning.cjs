'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {StudentRoster}=require('./services/studentRoster');
const {build}=require('./tests/helpers/learning-server.cjs');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'debate-planning-'));process.env.DATA_STORE_PATH=path.join(dir,'store.json');
const storage=require('./services/storageService');

test('test class has 99 free-name numbers while other roster entries keep exact names',()=>{
 const file=path.join(dir,'roster.json');fs.writeFileSync(file,JSON.stringify({version:1,students:[{studentNumber:'10326',name:'유관순'},{studentNumber:'11301',name:'이전이름'}]}));
 const roster=new StudentRoster(file,true);
 assert.equal(roster.students.filter(item=>item.classId===13).length,99);
 assert.equal(roster.verify('11301','테스트1').verifiedName,'테스트1');
 assert.equal(roster.verify('11399','A').testSlot,true);
 assert.throws(()=>roster.verify('10326','다른이름'),error=>error.code==='ROSTER_NAME_MISMATCH');
});

test('teacher plans per topic and server enforces assignment, team, capacity and class scope',async()=>{
 const rosterFile=path.join(dir,'plan-roster.json');fs.writeFileSync(rosterFile,JSON.stringify({version:1,students:[{studentNumber:'11301',name:null},{studentNumber:'11302',name:null}]}));
 const roster=new StudentRoster(rosterFile),schoolId='plan-school',base={schoolId,grade:1,classId:13,onboardingComplete:true,dataOrigin:'verified'};
 const users={teacher:{uid:'teacher',name:'교사',role:'teacher',schoolId,grade:1,classId:3,onboardingComplete:true},one:{...base,uid:'one',name:'학생1',studentNumber:'11301',role:'student'},two:{...base,uid:'two',name:'학생2',studentNumber:'11302',role:'student'},outsider:{...base,uid:'outsider',name:'외부',studentNumber:'11303',classId:12,role:'student'}};
 for(const item of Object.values(users))storage.saveUser(item);
 const app=await build(path.join(dir,'learning.json'),null,{users,storage,studentRoster:roster}).start();
 const call=async(url,id,body)=>{const result=await fetch(app.origin+url,{method:body===undefined?'GET':'POST',headers:{cookie:'test_uid='+id,origin:app.origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:result.status,data:await result.json()};};
 try{
  const assigned=await call('/api/teacher/battle-plan','teacher',{class:'1-13',topicId:'episode2026_1_01',mode:'assigned',capacity:1,assignments:[{studentNumber:'11301',team:'con'}]});assert.equal(assigned.status,200);
  assert.equal((await call('/api/teacher/battle-plan','one',{class:'1-13',topicId:'episode2026_1_01',mode:'open',capacity:2})).status,403);
  const first=await call('/api/debate/room/init','teacher',{class:'1-13',topicId:'episode2026_1_01',durationMinutes:5});assert.equal(first.status,200);const firstId=first.data.room.roomId;
  assert.equal((await call('/api/debate/join','one',{roomId:firstId,teamId:'pro'})).status,403);
  assert.equal((await call('/api/debate/join','two',{roomId:firstId,teamId:'con'})).status,403);
  assert.equal((await call('/api/debate/join','one',{roomId:firstId,teamId:'con'})).status,200);
  assert.equal((await call('/api/debate/join','outsider',{roomId:firstId,teamId:'con'})).status,403);
  const open=await call('/api/teacher/battle-plan','teacher',{class:'1-13',topicId:'episode2026_1_02',mode:'open',capacity:1,assignments:[]});assert.equal(open.status,200);
  const second=await call('/api/debate/room/init','teacher',{class:'1-13',topicId:'episode2026_1_02',durationMinutes:5});assert.equal(second.status,200);const secondId=second.data.room.roomId;
  assert.equal((await call('/api/debate/join','two',{roomId:secondId,teamId:'pro'})).status,200);
  assert.equal((await call('/api/debate/join','one',{roomId:secondId,teamId:'con'})).status,409);
  assert.equal((await call('/api/debate/available','one')).data.rooms.length,2);
  const visible=await call('/api/teacher/battle-roster?class=1-13','teacher');assert.equal(visible.status,200);assert.equal(visible.data.students.length,2);assert.equal(visible.data.students[0].isBattleReady,true);
 }finally{await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('only the primary teacher can issue the ten named accounts',async()=>{
 const root={uid:'root',email:'owner@example.test',role:'teacher',schoolId:'plan-school',grade:1,classId:3,onboardingComplete:true},other={...root,uid:'other',email:'other@example.test'},student={...root,uid:'student',role:'student',email:'student@example.test'};
 let calls=0;
 const auth={isConfigured:()=>true,serverConfigured:()=>true,clientConfigured:()=>true,authenticate:async req=>({root,other,student})[/test_uid=(root|other|student)/.exec(req.headers.cookie||'')?.[1]],safeProfile:item=>item,sameClass:()=>true,provisionTeacherBatch:async password=>{calls++;assert.equal(password,'tkghlrhk');return Array.from({length:10},(_,i)=>`admin${String(i+1).padStart(2,'0')}`);}};
 const app=await build(path.join(dir,'admin-learning.json'),null,{users:{teacher:root,student},firebaseAuth:auth,env:{ADMIN_EMAIL:'owner@example.test'}}).start();
 const issue=async uid=>{const result=await fetch(app.origin+'/api/teacher/provision-test-admins',{method:'POST',headers:{cookie:'test_uid='+uid,origin:app.origin,'Content-Type':'application/json'},body:JSON.stringify({password:'tkghlrhk'})});return {status:result.status,body:await result.json()};};
 try{assert.equal((await issue('student')).status,403);assert.equal((await issue('other')).status,403);const issued=await issue('root');assert.equal(issued.status,200);assert.equal(issued.body.accounts.length,10);assert.equal(calls,1);}finally{await app.close();}
});
