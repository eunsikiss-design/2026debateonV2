const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'debate-insights-'));process.env.DATA_STORE_PATH=path.join(dir,'store.json');
const storage=require('./services/storageService'),{build}=require('./tests/helpers/learning-server.cjs');
const insights=require('./services/debateInsights');

test('AI summaries reject invented citations and unsupported winners',()=>{
 const room={messages:[{messageId:'p1',authorUid:'one',teamId:'pro',messageType:'claim',content:'찬성 이유',dataOrigin:'verified',moderationStatus:'approved'},{messageId:'c1',authorUid:'two',teamId:'con',messageType:'question',content:'반대 질문',dataOrigin:'verified',moderationStatus:'approved'}]};
 const evidence=insights.evidence(room),raw={issues:[{title:'쟁점',pro:'찬성 이유',con:'반대 질문',proIds:['p1'],conIds:['c1']}],pro:{summary:'찬성 이유',messageIds:['p1']},con:{summary:'반대 질문',messageIds:['c1']},comparison:{betterSide:'pro',reason:'찬성이 더 낫다',proIds:['p1'],conIds:['c1']},students:[{speaker:'P1',strength:'이유를 밝혔다',advice:'근거를 더해 보세요',messageIds:['p1']},{speaker:'P2',strength:'질문을 했다',advice:'반론도 해 보세요',messageIds:['c1']}]};
 assert.throws(()=>insights.validate(raw,room,'final',evidence),/Not enough evidence/);
 raw.comparison.betterSide='insufficient';raw.issues[0].proIds=['invented'];assert.throws(()=>insights.validate(raw,room,'final',evidence),/Unverified issue/);
});

test('random teams, timed extension, cited AI feedback, moderation and finished-room re-entry',async()=>{
 const base={schoolId:'fixture-school',grade:1,classId:1,onboardingComplete:true};
 const users={teacher:{...base,uid:'teacher',role:'teacher',name:'교사'}};
 for(let i=1;i<=4;i++)users['s'+i]={...base,uid:'s'+i,role:'student',name:'학생'+i,studentNumber:'1010'+i};
 for(const user of Object.values(users))storage.saveUser(user);
 for(let i=1;i<=4;i++)storage.awardBadge('s'+i,{badgeType:'fixture'});
 const seenPrompts=[];
 const coach={apiKey:'test-key',analysisModel:'fixture-model',_callGeminiAPIWithPrompt:async({userPrompt})=>{
   seenPrompts.push(userPrompt);const input=JSON.parse(userPrompt),pro=input.messages.filter(m=>m.side==='pro'),con=input.messages.filter(m=>m.side==='con');
   return {issues:[{title:'핵심 쟁점',pro:'찬성 발언의 이유',con:'반대 발언의 이유',proIds:[pro[0].id],conIds:[con[0].id]}],pro:{summary:'찬성의 주장과 이유',messageIds:[pro[0].id]},con:{summary:'반대의 주장과 이유',messageIds:[con[0].id]},comparison:{betterSide:pro.length>=2&&con.length>=2?'tie':'insufficient',reason:'양쪽의 이유와 응답을 함께 살펴보았습니다.',proIds:[pro[0].id],conIds:[con[0].id]},students:[...new Set(input.messages.map(m=>m.speaker))].map(speaker=>({speaker,strength:'자신의 이유를 밝혔습니다.',advice:'상대 근거에 답해 보세요.',messageIds:[input.messages.find(m=>m.speaker===speaker).id]}))};
 }};
 const app=await build(path.join(dir,'teaching.json'),coach,{users,storage}).start();
 const call=async(url,id,body)=>{const response=await fetch(app.origin+url,{method:body===undefined?'GET':'POST',headers:{cookie:'test_uid='+id,origin:app.origin,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
 const waitFor=async(predicate)=>{for(let i=0;i<50;i++){const value=await predicate();if(value)return value;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Timed out waiting for AI result');};
 try{
   const topicId='episode2026_1_01';
   const planned=await call('/api/teacher/battle-plan','teacher',{topicId,mode:'random',capacity:4,assignments:[]});assert.equal(planned.status,200);
   const created=await call('/api/debate/room/init','teacher',{topicId,durationMinutes:10});assert.equal(created.status,200);const roomId=created.data.room.roomId;
   assert.equal((await call('/api/debate/extend','teacher',{roomId,minutes:10})).status,409);
   assert.equal((await call('/api/debate/extend','s1',{roomId,minutes:10})).status,403);
   for(let i=1;i<=4;i++){const joined=await call('/api/debate/join','s'+i,{roomId,teamId:'pro'});assert.equal(joined.status,200);}
   let room=storage.getDebateRoom(roomId);assert.equal(room.plan.mode,'random');assert.equal(room.participants.teamA.length,2);assert.equal(room.participants.teamB.length,2);
   const assigned=Object.fromEntries([...room.participants.teamA,...room.participants.teamB].map(p=>[p.uid,p.team]));
   const retry=await call('/api/debate/join','s1',{roomId,teamId:assigned.s1==='pro'?'con':'pro'});assert.equal(retry.status,200);assert.equal([...retry.data.room.participants.teamA,...retry.data.room.participants.teamB].find(p=>p.uid==='s1').team,assigned.s1);
   assert.equal((await call('/api/debate/message','s1',{roomId,messageType:'claim',content:'씨발 너는 틀렸어'})).data.moderated,true);assert.equal(storage.getDebateRoom(roomId).messages.length,0);
   assert.equal((await call('/api/debate/message','s1',{roomId,messageType:'invented',content:'알 수 없는 유형'})).status,400);
   const pro=Object.keys(assigned).filter(uid=>assigned[uid]==='pro'),con=Object.keys(assigned).filter(uid=>assigned[uid]==='con');
   await call('/api/debate/message',pro[0],{roomId,messageType:'claim',content:'찬성 측의 첫째 이유입니다.'});
   await call('/api/debate/message',con[0],{roomId,messageType:'question',content:'그 이유를 뒷받침하는 근거는 무엇입니까?'});
   const live=await waitFor(async()=>{const r=(await call('/api/debate/room/'+roomId,'teacher')).data.room;return r.aiSummary?.status==='ready'?r:null;});
   assert.equal(live.aiSummary.pro.messageIds.length,1);assert.equal(live.aiSummary.con.messageIds.length,1);
   assert.equal(live.statistics.byTeam.pro.types.claim,1);assert.equal(live.statistics.byTeam.con.types.question,1);
   await call('/api/debate/message',pro[1],{roomId,messageType:'counter',content:'반대측의 질문에 답하는 반론입니다.'});
   await call('/api/debate/message',con[1],{roomId,messageType:'final',content:'마지막으로 근거를 재검토해야 합니다.'});
   storage.updateDebateRoom(roomId,{endsAt:new Date(Date.now()+4*60000).toISOString()});
   const extended=await call('/api/debate/extend','teacher',{roomId,minutes:5});assert.equal(extended.status,200);assert.equal(extended.data.room.extensionHistory.length,1);
   assert.equal((await call('/api/debate/extend','teacher',{roomId,minutes:5})).status,409);
   const finished=await call('/api/debate/finish','teacher',{roomId});assert.equal(finished.status,200);assert.equal(finished.data.evaluation.statistics.total,4);
   const final=await waitFor(async()=>{const r=(await call('/api/debate/room/'+roomId,'teacher')).data.room;return r.aiReview?.status==='ready'?r:null;});
   assert.equal(final.aiReview.comparison.betterSide,'tie');assert.equal(Object.keys(final.aiReview.students).length,4);
   const studentView=(await call('/api/debate/room/'+roomId,pro[0])).data.room;assert.deepEqual(Object.keys(studentView.aiReview.students),[pro[0]]);
   const list=(await call('/api/debate/available?summary=1&includeFinished=1',pro[0])).data.rooms;assert.ok(list.some(r=>r.roomId===roomId&&r.status==='completed'));
   assert.equal((await call('/api/debate/join',pro[0],{roomId})).status,409);
   const next=(await call('/api/debate/room/init','teacher',{topicId:'episode2026_1_02',durationMinutes:1})).data.room.roomId;
   await call('/api/debate/join','s1',{roomId:next,teamId:'pro'});await call('/api/debate/join','s2',{roomId:next,teamId:'con'});
   await call('/api/debate/message','s1',{roomId:next,messageType:'claim',content:'또 다른 논제의 찬성 이유'});
   await call('/api/debate/message','s2',{roomId:next,messageType:'question',content:'다른 논제의 반대 질문'});
   storage.updateDebateRoom(next,{endsAt:new Date(Date.now()-1000).toISOString()});
   const expired=(await call('/api/debate/available?summary=1&includeFinished=1','teacher')).data.rooms.find(r=>r.roomId===next);assert.equal(expired.status,'completed');
   assert.equal((await call('/api/debate/room/'+next,'s1')).data.room.status,'completed');
   assert.ok(seenPrompts.length>=2);assert.ok(seenPrompts.every(prompt=>!prompt.includes('학생1')&&!prompt.includes('10101')));
 }finally{await app.close();fs.rmSync(dir,{recursive:true,force:true});}
});
