const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'battle-membership-'));process.env.DATA_STORE_PATH=path.join(dir,'store.json');
const storage=require('./services/storageService'),{build}=require('./tests/helpers/learning-server.cjs');
test('concurrent entry, stance balance, capacity, leave and retained evidence use server authority',async()=>{
 const base={schoolId:'membership-school',grade:1,classId:13,onboardingComplete:true};
 const users={teacher:{...base,uid:'teacher',role:'teacher',name:'교사'}};
 for(let i=1;i<=12;i++){const id='s'+i;users[id]={...base,uid:id,studentNumber:'113'+String(i).padStart(2,'0'),role:'student',name:'검증학생'+i};}
 for(const u of Object.values(users))storage.saveUser(u);
 const app=await build(path.join(dir,'learning.json'),null,{users,storage}).start();
 const call=async(url,id,body)=>{const r=await fetch(app.origin+url,{method:body===undefined?'GET':'POST',headers:{cookie:'test_uid='+id,origin:app.origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json()};};
 try{
  assert.throws(()=>storage.saveBattlePlan(base.schoolId,1,13,'episode2026_1_01',{mode:'open',capacity:1},'teacher'),{status:400});
  assert.throws(()=>storage.saveBattlePlan(base.schoolId,1,13,'episode2026_1_01',{mode:'assigned',capacity:2,assignments:[{studentNumber:'11301',team:'pro'},{studentNumber:'11302',team:'pro'}]},'teacher'),{status:400});
  storage.saveBattlePlan(base.schoolId,1,13,'episode2026_1_01',{mode:'open',capacity:2},'teacher');
  const opened=await call('/api/debate/room/init','teacher',{topicId:'episode2026_1_01'});assert.equal(opened.status,200);const roomId=opened.data.room.roomId;
  assert.equal((await call('/api/debate/join','teacher',{roomId,teamId:'pro'})).status,400);
  const attempts=await Promise.all(Array.from({length:10},(_,i)=>call('/api/debate/join','s'+(i+1),{roomId,teamId:'pro'})));
  assert.equal(attempts.filter(r=>r.status===200).length,1);assert.equal(attempts.filter(r=>r.status===409).length,9);
  const winner=storage.getDebateRoom(roomId).participants.teamA[0].uid;
  assert.equal((await call('/api/debate/join','s11',{roomId,teamId:'con'})).status,200);
  assert.equal((await call('/api/debate/join','s12',{roomId,teamId:'pro'})).status,409);
  assert.equal((await call('/api/debate/join',winner,{roomId,teamId:'con'})).status,409);
  assert.equal((await call('/api/debate/message',winner,{roomId,content:'검증용 주장과 근거입니다.',messageType:'claim'})).status,200);
  assert.equal((await call('/api/debate/leave',winner,{roomId})).status,200);
  assert.equal((await call('/api/debate/leave',winner,{roomId})).status,200);
  const after=storage.getDebateRoom(roomId);assert.equal(after.messages.length,1);assert.equal(after.participationHistory.length,1);assert.equal(after.participants.teamA.length,0);
  assert.equal(storage.getStudentRecordEvidence(users[winner]).messages.length,1);
  assert.equal((await call('/api/debate/message',winner,{roomId,content:'퇴장 후 메시지'})).status,403);
  assert.equal((await call('/api/debate/message','s11',{roomId,targetUid:winner,content:'퇴장 전 남긴 주장에 답변합니다.',messageType:'answer'})).status,200);
  assert.equal((await call('/api/debate/join','s12',{roomId,teamId:'con'})).status,409);
  assert.equal((await call('/api/debate/join','s12',{roomId,teamId:'pro'})).status,200);
  const summary=(await call('/api/debate/available?summary=1','teacher')).data.rooms[0];assert.equal(summary.messageCount,2);assert.equal(summary.messages,undefined);
  storage.updateDebateRoom(roomId,{endsAt:new Date(Date.now()-1000).toISOString()});
  assert.equal((await call('/api/debate/join',winner,{roomId,teamId:'pro'})).status,409);
  assert.equal((await call('/api/debate/leave','s12',{roomId})).status,200);
 }finally{await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
