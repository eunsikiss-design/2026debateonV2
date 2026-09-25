const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'debate-battle-'));process.env.DATA_STORE_PATH=path.join(dir,'store.json');
const storage=require('./services/storageService'),{build}=require('./tests/helpers/learning-server.cjs');
test('two students receive live messages; room scope, membership, team and finish are enforced',async()=>{
 const base={schoolId:'test-school',grade:1,classId:3,onboardingComplete:true};
 const users={teacher:{...base,uid:'teacher',role:'teacher',name:'테스트 교사'},unbadged:{...base,uid:'unbadged',role:'student',name:'연습 전 학생'},one:{...base,uid:'one',role:'student',name:'가상학생1'},two:{...base,uid:'two',role:'student',name:'가상학생2'},outsider:{...base,schoolId:'other-school',uid:'outsider',role:'student',name:'다른 학교'}};
 for(const user of Object.values(users))storage.saveUser(user);for(const id of ['one','two','outsider'])storage.awardBadge(id,{badgeType:'fixture'});
 const app=await build(path.join(dir,'teaching.json'),null,{users,storage}).start();const abort=new AbortController();let reader;
 const call=async(url,id,body)=>{const res=await fetch(app.origin+url,{method:body===undefined?'GET':'POST',headers:{cookie:'test_uid='+id,origin:app.origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,data:await res.json()};};
 try{
  assert.equal((await call('/api/debate/current','one')).data.room,null);
  assert.equal((await call('/api/debate/room/init','one',{topicId:'episode2026_1_01'})).status,403);
  const created=await call('/api/debate/room/init','teacher',{topicId:'episode2026_1_01',durationMinutes:10});assert.equal(created.status,200);const roomId=created.data.room.roomId;
  assert.equal((await call('/api/debate/room/init','teacher',{topicId:'episode2026_1_01'})).status,409);
  assert.equal((await call('/api/debate/room/'+roomId,'outsider')).status,403);
  assert.equal((await call('/api/debate/join','outsider',{roomId})).status,403);
  assert.equal((await call('/api/debate/join','unbadged',{roomId,teamId:'pro'})).data.eligible,false);
  assert.equal((await call('/api/debate/message','one',{roomId,content:'입장 전'})).status,403);
  assert.equal((await call('/api/debate/join','one',{roomId,teamId:'pro'})).status,200);
  assert.equal((await call('/api/debate/join','two',{roomId,teamId:'con'})).status,200);
  const response=await fetch(app.origin+'/api/debate/stream/'+roomId,{headers:{cookie:'test_uid=two'},signal:abort.signal});assert.equal(response.status,200);reader=response.body.getReader();await reader.read();
  const sent=await call('/api/debate/message','one',{roomId,teamId:'con',authorName:'위조',messageType:'claim',content:'피해와 기록의 가치를 함께 살펴야 합니다.'});assert.equal(sent.status,200);assert.equal(sent.data.message.teamId,'pro');assert.equal(sent.data.message.authorName,'가상학생1');
  const received=await Promise.race([reader.read(),new Promise((_,reject)=>setTimeout(()=>reject(Error('No SSE message')),1500))]);assert.match(new TextDecoder().decode(received.value),/event: message/);
  assert.equal((await call('/api/debate/ai-summary','one',{roomId})).data.code,'DEBATE_SUMMARY_NOT_READY');
  assert.equal((await call('/api/debate/finish','one',{roomId})).status,403);
  assert.equal((await call('/api/debate/finish','teacher',{roomId})).status,200);
  assert.equal((await call('/api/debate/message','one',{roomId,content:'종료 후'})).status,409);
  assert.equal((await call('/api/debate/current','one')).data.room.messages.length,1);
 }finally{abort.abort();await reader?.cancel().catch(()=>{});await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
