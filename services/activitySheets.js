'use strict';
const crypto=require('node:crypto');
const {hasDraftContent}=require('./learningDraftStore');
const HEADERS=['연동 키','학년','반','학번','이름','주제','활동','기록 종류','저장 버전','학생 원문','피드백·분석','저장 시각','연동 시각'];
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const modeLabel={basic:'기초 연습',advanced:'심화 논술',speech:'스피치',debate:'토론 발언',observation:'교사 관찰'};
function activities(storage,student,drafts){
 const entries=[];
 for(const [topicId,modes] of Object.entries(drafts||{}))for(const mode of ['basic','advanced','speech']){
  const latest=modes[mode];
  for(const d of [...(latest?.versions||[]),latest]){
   if(!d||!hasDraftContent(mode,d.content))continue;
   const c=d.content,text=mode==='basic'?[c.claim,c.reason,c.rebuttal].filter(Boolean).join('\n\n'):mode==='advanced'?c.paragraphs.join('\n\n'):[c.sourceText&&'준비 글: '+c.sourceText,[c.claim,c.reason,c.condition].filter(Boolean).join('\n'),c.transcript&&'전사문: '+c.transcript].filter(Boolean).join('\n\n');
   entries.push({id:`${topicId}:${mode}:${d.version?'snapshot:'+d.version:'draft'}`,topicId,mode,kind:d.version?'저장본':'자동 저장 초안',version:d.version||d.revision,text,feedback:'',updatedAt:d.updatedAt});
  }
 }
 for(const s of storage.getStudentPracticeSessions(student.uid)){
  const mode=s.mode==='advanced_essay'?'advanced':s.mode==='speech_timer'?'speech':'basic';
  const text=mode==='advanced'?s.studentDraft:mode==='speech'?s.transcript:[s.claim,s.reason,s.rebuttal].filter(Boolean).join('\n\n');
  if(!text?.trim())continue;
  entries.push({id:'record:'+s.sessionId,topicId:s.topicId,mode,kind:'활동 완료',version:s.attemptCount||1,text,feedback:JSON.stringify(s.evaluation||{analysis:s.analysis||{},diagnosis:s.diagnosis||{},feedback:s.feedback||{}}),updatedAt:s.createdAt||s.submittedAt});
 }
 const evidence=storage.getStudentRecordEvidence(student);
 for(const m of evidence.messages||[])entries.push({id:'debate:'+m.roomId+':'+m.messageId,topicId:m.topicId,mode:'debate',kind:'토론 발언',text:m.content,updatedAt:m.createdAt||m.timestamp});
 for(const o of evidence.observations||[])entries.push({id:'observation:'+o.id,topicId:'',mode:'observation',kind:'교사 관찰',text:o.note,updatedAt:o.timestamp});
 return entries.sort((a,b)=>a.id.localeCompare(b.id));
}
class ActivitySheets{
 constructor(storage,learning,sheets){this.storage=storage;this.learning=learning;this.sheets=sheets;this.running=null;}
 entries(student){return activities(this.storage,student,this.learning.drafts.list(student));}
 students(scope){return this.storage.getUsers().filter(u=>u.role==='student'&&u.onboardingComplete&&u.schoolId===scope.schoolId&&(!scope.grade||Number(u.grade)===Number(scope.grade))&&(!scope.classId||Number(u.classId)===Number(scope.classId)));}
 status(scope){
  const config=this.storage.getRecordSheetConfig(scope.schoolId);
  const students=this.students(scope).map(u=>{const rows=this.entries(u),saved=this.storage.getActivitySheetSync(u.uid),fingerprint=hash(rows),synced=rows.length>0&&saved?.fingerprint===fingerprint&&saved?.spreadsheetId===config?.spreadsheetId&&saved?.status==='synced';return {uid:u.uid,name:u.name,studentNumber:u.studentNumber,entryCount:rows.length,status:!rows.length?'empty':synced?'synced':'pending',syncedAt:saved?.syncedAt||null,message:saved?.status==='pending'?saved.message:null};});
  return {connected:Boolean(config),spreadsheetUrl:config?`https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`:null,students,pendingCount:students.filter(s=>s.status==='pending').length,syncedCount:students.filter(s=>s.status==='synced').length};
 }
 async syncStudent(student){
  const config=this.storage.getRecordSheetConfig(student.schoolId);if(!config)return;
  const entries=this.entries(student),fingerprint=hash(entries),prior=this.storage.getActivitySheetSync(student.uid);
  if(!entries.length||prior?.status==='synced'&&prior.fingerprint===fingerprint&&prior.spreadsheetId===config.spreadsheetId)return;
  return this.sheets.locked(config.spreadsheetId,async()=>{
   try{
    const title=student.isTestAccount||student.authProvider==='simulation'||/^sim-/.test(student.uid)?'DebateOn_활동시험':'DebateOn_학생활동';
    const {tab}=await this.sheets.ensureTab(config.spreadsheetId,title,HEADERS);
    const old=await this.sheets.request(config.spreadsheetId,`/values/${encodeURIComponent(`'${title}'!A2:A${tab.gridProperties.rowCount}`)}`);
    const keys=(old.values||[]).map(row=>row[0]),now=new Date().toISOString(),data=[];
    for(const entry of entries){
     let topicTitle=entry.topicId;try{topicTitle=this.learning.topic(entry.topicId,student).title;}catch{}
     const text=String(entry.text||''),feedback=String(entry.feedback||''),parts=Math.max(1,Math.ceil(text.length/40000),Math.ceil(feedback.length/40000));
     for(let part=0;part<parts;part++){
      const key=hash([student.schoolId,student.uid,entry.id,part]);
      if(keys.filter(k=>k===key).length>1)throw Error('활동 연동 키가 중복되었습니다. 시트의 중복 행을 확인하세요.');
      let index=keys.indexOf(key);if(index<0){index=keys.length;keys.push(key);}
      data.push({range:`'${title}'!A${index+2}:M${index+2}`,values:[[key,student.grade,student.classId,String(student.studentNumber||''),student.name||'',topicTitle||'',modeLabel[entry.mode]||entry.mode,entry.kind+(parts>1?` (${part+1}/${parts})`:''),entry.version||'',text.slice(part*40000,(part+1)*40000),feedback.slice(part*40000,(part+1)*40000),entry.updatedAt||'',now]]});
     }
    }
    if(keys.length+1>tab.gridProperties.rowCount)await this.sheets.request(config.spreadsheetId,':batchUpdate','POST',{requests:[{appendDimension:{sheetId:tab.sheetId,dimension:'ROWS',length:keys.length+501-tab.gridProperties.rowCount}}]});
    for(let i=0;i<data.length;i+=100)await this.sheets.request(config.spreadsheetId,'/values:batchUpdate','POST',{valueInputOption:'RAW',data:data.slice(i,i+100)});
    this.storage.saveActivitySheetSync(student.uid,{status:'synced',spreadsheetId:config.spreadsheetId,fingerprint,syncedAt:now,entryCount:entries.length});
   }catch(error){this.storage.saveActivitySheetSync(student.uid,{status:'pending',spreadsheetId:config.spreadsheetId,message:error.status?error.message:'학생 활동 시트 전송에 실패했습니다. 원문은 앱에 보존되며 다시 전송합니다.'});throw error;}
  });
 }
 async syncAll(scope){
  if(this.running){await this.running;}
  this.running=(async()=>{for(const u of this.students(scope))try{await this.syncStudent(u);}catch{}return this.status(scope);})();
  try{return await this.running;}finally{this.running=null;}
 }
 async tick(){for(const schoolId of new Set(this.storage.getUsers().filter(u=>u.role==='student'&&u.onboardingComplete).map(u=>u.schoolId)))if(this.storage.getRecordSheetConfig(schoolId))await this.syncAll({schoolId});}
}
module.exports={ActivitySheets,activities,HEADERS};
