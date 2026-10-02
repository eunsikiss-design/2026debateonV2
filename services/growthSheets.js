'use strict';
const crypto=require('node:crypto');
const growth=require('./studentGrowthService');

const HEADERS=['연동 키','학년','반','학번','이름','분석 범위','상태','분석 시각','분석 원문 수','개념 활용','논거 타당성','논리 구조화','반론 대응','전달 및 표현','확인된 변화','분석 안내','연동 시각'];
const TABS={real:'DebateOn_역량분석',test:'DebateOn_역량시험'};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const quoteText=refs=>(refs||[]).map(ref=>'원문 인용: “'+String(ref.quote||'').trim()+'”').filter(line=>line!=='원문 인용: “”').join('\n');
function axisText(axis){
 if(!axis)return '';
 return [axis.status==='observed'?'원문 근거 확인':'추가 확인 필요',axis.finding&&'분석: '+axis.finding,axis.nextStep&&'다음 연습: '+axis.nextStep,quoteText(axis.evidence)].filter(Boolean).join('\n');
}
function changeText(changes){return (changes||[]).map(change=>[change.title||'원문 비교',change.finding&&'확인된 변화: '+change.finding,change.nextStep&&'다음 연습: '+change.nextStep,quoteText(change.evidence)].filter(Boolean).join('\n')).join('\n\n');}
function entry(storage,learning,student,topicId,analysis){
 const report=growth.collect(storage,learning,student,topicId),stale=analysis.fingerprint!==report.fingerprint;
 let title='전체 주제';if(topicId)try{title=learning.topic(topicId,student).title;}catch{title=report.topics.find(item=>item.topicId===topicId)?.title||topicId;}
 const complete=!stale&&['gemini-api','gemini-partial'].includes(analysis.source),axes=complete?analysis.axes||[]:[];
 const status=stale?'원문 변경 · 재분석 필요':analysis.source==='gemini-api'?'분석 완료':analysis.source==='gemini-partial'?'일부 근거 확인 필요':'분석 미완료';
 const byKey=Object.fromEntries(axes.map(axis=>[axis.key,axis]));
 const values=[hash([student.schoolId,student.uid,topicId]),student.grade,student.classId,String(student.studentNumber||''),student.name||'',title,status,complete?analysis.generatedAt||'':'',complete?analysis.analyzedCount||0:'',...['concept','evidence','reasoning','response','expression'].map(key=>axisText(byKey[key])),complete?changeText(analysis.changes):'',stale?'학생 원문이 분석 후 변경되었습니다. 이전 분석 결과는 표시하지 않습니다. 학생이 다시 분석해야 합니다.':analysis.notice||'교사의 최종 평가가 아닌 학습 피드백입니다.'];
 return {topicId,values};
}
class GrowthSheets{
 constructor(storage,learning,sheets){this.storage=storage;this.learning=learning;this.sheets=sheets;this.running=null;}
 students(scope){return this.storage.getUsers().filter(u=>u.role==='student'&&u.onboardingComplete&&u.schoolId===scope.schoolId&&(!scope.grade||Number(u.grade)===Number(scope.grade))&&(!scope.classId||Number(u.classId)===Number(scope.classId)));}
 entries(student,saved){return (saved||this.storage.getStudentGrowthAnalyses(student)).map(item=>entry(this.storage,this.learning,student,item.topicId,item.analysis)).sort((a,b)=>a.topicId.localeCompare(b.topicId));}
 status(scope){
  const config=this.storage.getRecordSheetConfig(scope.schoolId),index=this.storage.getGrowthAnalysisIndex(scope.schoolId);
  const students=this.students(scope).map(u=>{const rows=index[u.uid]?.length?this.entries(u,index[u.uid]):[],saved=rows.length?this.storage.getGrowthSheetSync(u.uid):null,synced=rows.length>0&&saved?.status==='synced'&&saved.spreadsheetId===config?.spreadsheetId&&saved.fingerprint===hash(rows);return {uid:u.uid,name:u.name,studentNumber:u.studentNumber,entryCount:rows.length,status:!rows.length?'empty':synced?'synced':'pending',syncedAt:saved?.syncedAt||null,message:saved?.status==='pending'?saved.message:null};});
  return {connected:Boolean(config),spreadsheetUrl:config?`https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`:null,sheetTitle:TABS.real,testSheetTitle:TABS.test,students,pendingCount:students.filter(s=>s.status==='pending').length,syncedCount:students.filter(s=>s.status==='synced').length};
 }
 async syncStudent(student,saved){
  const config=this.storage.getRecordSheetConfig(student.schoolId);if(!config)return;
  const rows=this.entries(student,saved),fingerprint=hash(rows),prior=this.storage.getGrowthSheetSync(student.uid);
  if(!rows.length||prior?.status==='synced'&&prior.fingerprint===fingerprint&&prior.spreadsheetId===config.spreadsheetId)return;
  return this.sheets.locked(config.spreadsheetId,async()=>{
   try{
    const title=student.isTestAccount||student.authProvider==='simulation'||/^sim-/.test(student.uid)?TABS.test:TABS.real;
    const {tab}=await this.sheets.ensureTab(config.spreadsheetId,title,HEADERS);
    const old=await this.sheets.request(config.spreadsheetId,`/values/${encodeURIComponent(`'${title}'!A2:A${tab.gridProperties.rowCount}`)}`);
    const keys=(old.values||[]).map(row=>row[0]),now=new Date().toISOString(),data=[];
    for(const row of rows){const key=row.values[0];if(keys.filter(value=>value===key).length>1)throw Error('역량 분석 연동 키가 중복되었습니다. 시트의 중복 행을 확인하세요.');let index=keys.indexOf(key);if(index<0){index=keys.length;keys.push(key);}data.push({range:`'${title}'!A${index+2}:Q${index+2}`,values:[[...row.values,now]]});}
    if(keys.length+1>tab.gridProperties.rowCount)await this.sheets.request(config.spreadsheetId,':batchUpdate','POST',{requests:[{appendDimension:{sheetId:tab.sheetId,dimension:'ROWS',length:keys.length+501-tab.gridProperties.rowCount}}]});
    for(let i=0;i<data.length;i+=100)await this.sheets.request(config.spreadsheetId,'/values:batchUpdate','POST',{valueInputOption:'RAW',data:data.slice(i,i+100)});
    await this.sheets.request(config.spreadsheetId,':batchUpdate','POST',{requests:[{repeatCell:{range:{sheetId:tab.sheetId,startRowIndex:1,endRowIndex:keys.length+1,startColumnIndex:9,endColumnIndex:16},cell:{userEnteredFormat:{wrapStrategy:'WRAP',verticalAlignment:'TOP'}},fields:'userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment'}},{updateDimensionProperties:{range:{sheetId:tab.sheetId,dimension:'COLUMNS',startIndex:9,endIndex:16},properties:{pixelSize:360},fields:'pixelSize'}}]});
    this.storage.saveGrowthSheetSync(student.uid,{status:'synced',spreadsheetId:config.spreadsheetId,fingerprint,syncedAt:now,entryCount:rows.length});
   }catch(error){this.storage.saveGrowthSheetSync(student.uid,{status:'pending',spreadsheetId:config.spreadsheetId,message:error.status?error.message:'역량 분석 시트 전송에 실패했습니다. 분석은 앱에 보존되며 다시 전송합니다.'});throw error;}
  });
 }
 async syncAll(scope){if(this.running)await this.running;this.running=(async()=>{const index=this.storage.getGrowthAnalysisIndex(scope.schoolId);for(const student of this.students(scope).filter(u=>index[u.uid]?.length))try{await this.syncStudent(student,index[student.uid]);}catch{}return this.status(scope);})();try{return await this.running;}finally{this.running=null;}}
 async tick(){for(const schoolId of new Set(this.storage.getUsers().filter(u=>u.role==='student'&&u.onboardingComplete).map(u=>u.schoolId)))if(this.storage.getRecordSheetConfig(schoolId))await this.syncAll({schoolId});}
}
module.exports={GrowthSheets,entry,axisText,changeText,HEADERS,TABS};
