'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'growth-export-'));process.env.DATA_STORE_PATH=path.join(dir,'store.json');
const storage=require('./services/storageService'),growth=require('./services/studentGrowthService'),exporter=require('./services/studentGrowthReport'),{build}=require('./tests/helpers/learning-server.cjs');
test.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'growth-export-'));fs.rmSync(dir,{recursive:true,force:true});});
const base={schoolId:'export-school',grade:1,classId:13,onboardingComplete:true,dataOrigin:'verified'},users={student:{...base,uid:'export-one',role:'student',name:'시험학생',studentNumber:'11301',isTestAccount:true},other:{...base,uid:'export-other',role:'student'},teacher:{...base,uid:'export-teacher',role:'teacher'},outside:{...base,uid:'export-outside',schoolId:'other-school',role:'teacher'}};
Object.values(users).forEach(u=>storage.saveUser(u));
test('student PDF contains scoped sources and current analysis, enforces access and view freshness without invoking AI',async()=>{
 const h=build(path.join(dir,'learning.json'),{analyzeStudentGrowth(){throw Error('Export must not call AI');}},{users,storage});
 storage.savePracticeSession({userId:users.student.uid,topicId:'episode2026_1_01',claim:'투표는 권리입니다.',reason:'참정권과 참여하지 않을 자유를 함께 존중해야 합니다.'});
 storage.savePracticeSession({userId:users.student.uid,topicId:'episode2026_1_02',claim:'다른 주제 원문',reason:'선택한 주제의 PDF에는 포함하지 않습니다.'});
 storage.saveSchoolRecordAnalysis(users.student.uid,{draftText:'교사 비공개 세특'});
 const r=growth.collect(storage,h.learning,users.student,'episode2026_1_01'),source=r.sources[0];
 const analysis={...growth.validate({axes:growth.AXES.map(a=>({...a,status:'observed',finding:'원문을 살펴보는 피드백입니다.',nextStep:'다른 입장의 이유도 연결해 보세요.',evidence:[{sourceId:source.id,quote:source.text.slice(0,10)}]})),changes:[]},r),fingerprint:r.fingerprint,generatedAt:'2026-09-28T00:00:00Z',analyzedCount:1,excludedCount:0};
 storage.saveStudentGrowthAnalysis(users.student,r.topicId,analysis);
 const document=exporter.build(r,analysis);assert.equal(document.sources.length,1);assert.match(JSON.stringify(document),/참정권/);assert.doesNotMatch(JSON.stringify(document),/교사 비공개|다른 주제 원문/);assert.match(exporter.filename(document),/^DebateOn_11301_역량분석_/);
 const stale=exporter.build(r,{...analysis,fingerprint:'old'});assert.match(JSON.stringify(stale.sections),/분석이 저장되지 않았습니다/);assert.doesNotMatch(JSON.stringify(stale.sections),/원문을 살펴보는 피드백입니다/);
 assert.throws(()=>exporter.build({...r,sources:[]},null),{status:400});
 const app=await h.start(),url='/api/growth/student/'+users.student.uid+'/report.pdf?topic='+r.topicId+'&fingerprint='+r.fingerprint+'&analysisAt='+encodeURIComponent(analysis.generatedAt);
 const request=(suffix=url,who='student')=>fetch(app.origin+suffix,{headers:{cookie:'test_uid='+who}});
 try{
  for(const asset of ['/assets/growth-export.js','/assets/growth-live.js'])assert.equal((await fetch(app.origin+asset)).status,200);
  assert.equal((await fetch(app.origin+url)).status,401);assert.equal((await request(url,'other')).status,403);assert.equal((await request(url,'outside')).status,403);
  assert.equal((await request(url.replace(r.fingerprint,'outdated'))).status,409);
  assert.equal((await request(url.replace(encodeURIComponent(analysis.generatedAt),'old-analysis'))).status,409);
  for(const who of ['student','teacher']){const result=await request(url,who);assert.equal(result.status,200);assert.equal(result.headers.get('content-type'),'application/pdf');assert.match(result.headers.get('content-disposition'),/attachment.*filename\*=UTF-8/);assert.match(result.headers.get('cache-control'),/no-store/);const bytes=Buffer.from(await result.arrayBuffer());assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(bytes.length>10000);}
 }finally{await app.close();}
});

function ui({supported=true,shareError,fetcher}={}){
 const nodes=new Map(),events=[];function node(){return {disabled:false,textContent:'',append(){},remove(){},click(){events.push('download');}};}
 const document={getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node,body:{append(){}}};
 let report={topicId:'one',fingerprint:'first',analysis:{generatedAt:'today'},summary:{recordCount:1}},busy=false,requests=0,shares=0;
 const navigator=supported?{canShare:()=>true,share:async payload=>{shares++;assert.equal(payload.files.length,1);assert.equal(payload.url,undefined);if(shareError)throw Object.assign(Error(),{name:shareError});}}:{};
 const context={window:{},document,navigator,File,URLSearchParams,URL:{createObjectURL:()=> 'blob:private-pdf',revokeObjectURL(){}},setTimeout(){},fetch:async()=>{requests++;if(fetcher)return fetcher();return {ok:true,headers:new Headers({'content-type':'application/pdf','content-disposition':"attachment; filename*=UTF-8''report.pdf"}),blob:async()=>new Blob(['%PDF-example'],{type:'application/pdf'})};}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'assets/growth-export.js'),'utf8'),context);
 const controls=context.window.GrowthExport.mount({getReport:()=>report,getUser:()=>({uid:'me'}),isBusy:()=>busy});
 return {nodes,events,controls,get requests(){return requests;},get shares(){return shares;},setReport:r=>{report=r;controls.update();},setBusy:value=>{busy=value;controls.update();}};
}
test('file share is explicit after preparation, sends the PDF only, and cancels without downloading',async()=>{
 const app=ui({shareError:'AbortError'}),share=app.nodes.get('growth-share');await share.onclick();assert.equal(app.requests,1);assert.equal(app.shares,0);assert.equal(share.textContent,'공유창 열기');
 await share.onclick();assert.equal(app.shares,1);assert.match(app.nodes.get('growth-export-status').textContent,/취소/);assert.equal(app.events.length,0);
 await app.nodes.get('growth-download').onclick();assert.equal(app.events.length,1);assert.equal(app.requests,1);
 app.setReport({topicId:'two',fingerprint:'second',analysis:null,summary:{recordCount:1}});await share.onclick();assert.equal(app.requests,2);assert.equal(app.shares,1);
});
test('unsupported sharing retains download and does not send a link or open a destination',async()=>{
 const app=ui({supported:false});await app.nodes.get('growth-share').onclick();assert.equal(app.requests,0);assert.equal(app.shares,0);assert.match(app.nodes.get('growth-export-status').textContent,/지원하지 않습니다/);await app.nodes.get('growth-download').onclick();assert.equal(app.events.length,1);
 app.setBusy(true);assert.equal(app.nodes.get('growth-download').disabled,true);
});
test('failed or superseded PDF generation never shares or downloads another topic',async()=>{
 let finish;const app=ui({fetcher:()=>new Promise(r=>finish=r)});const request=app.nodes.get('growth-download').onclick();
 app.setReport({topicId:'two',fingerprint:'second',analysis:null,summary:{recordCount:1}});finish({ok:true,headers:new Headers({'content-type':'application/pdf'}),blob:async()=>new Blob(['pdf'])});await request;
 assert.equal(app.events.length,0);assert.equal(app.shares,0);assert.match(app.nodes.get('growth-export-status').textContent,/기록이 변경/);
 const failure=ui({fetcher:async()=>({ok:false,json:async()=>({message:'기록을 새로고침하세요.'})})});await failure.nodes.get('growth-download').onclick();assert.equal(failure.events.length,0);assert.match(failure.nodes.get('growth-export-status').textContent,/새로고침/);
});
