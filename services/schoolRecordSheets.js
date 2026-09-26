'use strict';
const crypto=require('node:crypto');
const HEADERS=['연동 키','학년','반','학번','이름','세특 내용','검토 상태','저장 버전','저장 시각','연동 시각'];
const TABS={real:'DebateOn_세특',test:'DebateOn_연동시험'};
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function spreadsheetId(value){
 if(typeof value!=='string')fail('Google 스프레드시트 URL을 입력하세요.');
 const input=value.trim();
 if(/^[\w-]{20,160}$/.test(input))return input;
 try{const u=new URL(input),match=/^\/spreadsheets\/d\/([\w-]{20,160})(?:\/|$)/.exec(u.pathname);if(u.protocol==='https:'&&u.hostname==='docs.google.com'&&match)return match[1];}catch{}
 fail('docs.google.com의 스프레드시트 URL을 입력하세요.');
}
class SchoolRecordSheets {
 constructor(storage,{env=process.env,transport=null}={}){this.storage=storage;this.env=env;this.transport=transport;this.locks=new Map();this.client=null;}
 credentials(){const dedicated=this.env.GOOGLE_SERVICE_ACCOUNT_EMAIL||this.env.GOOGLE_PRIVATE_KEY;return {email:dedicated?this.env.GOOGLE_SERVICE_ACCOUNT_EMAIL:this.env.FIREBASE_CLIENT_EMAIL,key:(dedicated?this.env.GOOGLE_PRIVATE_KEY:this.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g,'\n')};}
 status(schoolId,studentId){
  const config=this.storage.getRecordSheetConfig(schoolId),c=this.credentials();
  const sync=studentId?this.storage.getRecordSheetSync(studentId):null;
  return {connected:Boolean(config),queueLength:this.storage.getRecordSheetPendingCount(schoolId),credentialsReady:Boolean(c.email&&c.key)||Boolean(this.transport),serviceAccountEmail:c.email||null,spreadsheetUrl:config?`https://docs.google.com/spreadsheets/d/${config.spreadsheetId}/edit`:null,title:config?.title||null,sync:sync?.spreadsheetId===config?.spreadsheetId?sync:null};
 }
 async locked(key,action){const prior=this.locks.get(key)||Promise.resolve();const next=prior.catch(()=>{}).then(action);this.locks.set(key,next);try{return await next;}finally{if(this.locks.get(key)===next)this.locks.delete(key);}}
 async request(id,suffix='',method='GET',body){
  if(this.transport)return this.transport({id,suffix,method,body});
  const {email,key}=this.credentials();if(!email||!key)fail('서버에 Google 서비스 계정 설정이 필요합니다.',503);
  const {JWT}=require('google-auth-library');
  if(!this.client)this.client=new JWT({email,key,scopes:['https://www.googleapis.com/auth/spreadsheets']});
  try{
   const response=await this.client.request({url:`https://sheets.googleapis.com/v4/spreadsheets/${id}${suffix}`,method,data:body,timeout:12000,retry:false});
   return response.data;
  }catch(e){
   const code=Number(e.response?.status||e.code);
   if(e.response?.data?.error?.details?.some(d=>d.reason==='SERVICE_DISABLED'))fail('Google Cloud 프로젝트에서 Google Sheets API를 켜야 합니다. 설정 후 다시 연결하세요.',502);
   if(code===403||code===404)fail('시트의 편집자 공유와 Google Sheets API 활성화를 확인하세요.',502);
   fail('Google Sheets에 연결하지 못했습니다. 저장한 초안은 유지됩니다. 다시 시도하세요.',502);
  }
 }
 async ensureTab(id,title){
  let meta=await this.request(id,'?fields=spreadsheetId,properties(title),sheets(properties)');
  let tab=meta.sheets?.find(s=>s.properties.title===title)?.properties;
  if(!tab){const result=await this.request(id,':batchUpdate','POST',{requests:[{addSheet:{properties:{title,gridProperties:{rowCount:1000,columnCount:10,frozenRowCount:1}}}}]});tab=result.replies[0].addSheet.properties;}
  const range=encodeURIComponent(`'${title}'!A1:J1`),old=await this.request(id,`/values/${range}`);
  if(old.values?.length&&old.values[0].some(v=>String(v).trim())){
   if(JSON.stringify(old.values[0])!==JSON.stringify(HEADERS))fail(`${title} 탭의 열 구성이 다릅니다. 기존 자료를 보호하기 위해 연결을 중단했습니다.`,409);
  }else{
   await this.request(id,`/values/${range}?valueInputOption=RAW`,'PUT',{values:[HEADERS]});
   await this.request(id,':batchUpdate','POST',{requests:[
    {repeatCell:{range:{sheetId:tab.sheetId,startRowIndex:0,endRowIndex:1,startColumnIndex:0,endColumnIndex:10},cell:{userEnteredFormat:{backgroundColor:{red:.93,green:.94,blue:.96},textFormat:{bold:true},wrapStrategy:'WRAP'}},fields:'userEnteredFormat'}},
    {updateSheetProperties:{properties:{sheetId:tab.sheetId,gridProperties:{frozenRowCount:1}},fields:'gridProperties.frozenRowCount'}},
    {updateDimensionProperties:{range:{sheetId:tab.sheetId,dimension:'COLUMNS',startIndex:0,endIndex:10},properties:{pixelSize:130},fields:'pixelSize'}},
    {updateDimensionProperties:{range:{sheetId:tab.sheetId,dimension:'COLUMNS',startIndex:5,endIndex:6},properties:{pixelSize:650},fields:'pixelSize'}}
   ]});
  }
  return {title:meta.properties.title,tab};
 }
 async connect(schoolId,url,teacherUid){
  const id=spreadsheetId(url);
  return this.locked('school:'+schoolId,()=>this.locked(id,async()=>{
   const {title}=await this.ensureTab(id,TABS.real);await this.ensureTab(id,TABS.test);
   this.storage.saveRecordSheetConfig(schoolId,{spreadsheetId:id,title,updatedBy:teacherUid,connectedAt:new Date().toISOString()});return this.status(schoolId);
  }));
 }
 async disconnect(schoolId){return this.locked('school:'+schoolId,()=>{this.storage.saveRecordSheetConfig(schoolId,null);return this.status(schoolId);});}
 async sync(student,expectedRevision){
  return this.locked('school:'+student.schoolId,async()=>{
   const config=this.storage.getRecordSheetConfig(student.schoolId);if(!config)fail('Google 스프레드시트를 먼저 연결하세요.',409);
   return this.locked(config.spreadsheetId,async()=>{
    const saved=this.storage.getSchoolRecordDraft(student.uid);
    if(!saved||saved.revision!==Number(expectedRevision))fail('저장 버전이 변경되었습니다. 다시 불러오세요.',409);
    if(!student.isTestAccount&&saved.status!=='teacher-reviewed')fail('교사 검토를 완료한 세특만 연동할 수 있습니다.',409);
    const tabTitle=student.isTestAccount?TABS.test:TABS.real;
    try{
     const {tab}=await this.ensureTab(config.spreadsheetId,tabTitle);
     const key=crypto.createHash('sha256').update(student.schoolId+'\0'+student.uid).digest('hex');
     const existing=await this.request(config.spreadsheetId,`/values/${encodeURIComponent(`'${tabTitle}'!A2:A${tab.gridProperties.rowCount}`)}`);
     const rows=existing.values||[],matches=rows.map((v,i)=>v[0]===key?i:-1).filter(i=>i>=0);
     if(matches.length>1)fail('시트에 같은 학생의 연동 키가 중복되어 있습니다. 중복 행을 확인하세요.',409);
     const row=matches.length?matches[0]+2:rows.length+2;
     if(row>tab.gridProperties.rowCount)await this.request(config.spreadsheetId,':batchUpdate','POST',{requests:[{appendDimension:{sheetId:tab.sheetId,dimension:'ROWS',length:500}}]});
     const now=new Date().toISOString();
     await this.request(config.spreadsheetId,`/values/${encodeURIComponent(`'${tabTitle}'!A${row}:J${row}`)}?valueInputOption=RAW`,'PUT',{values:[[key,student.grade,student.classId,String(student.studentNumber||''),student.name||'',saved.draftText,student.isTestAccount?'가상 학생 시험용':'교사 검토 완료',saved.revision,saved.updatedAt,now]]});
     await this.request(config.spreadsheetId,':batchUpdate','POST',{requests:[{repeatCell:{range:{sheetId:tab.sheetId,startRowIndex:row-1,endRowIndex:row,startColumnIndex:0,endColumnIndex:10},cell:{userEnteredFormat:{wrapStrategy:'WRAP',verticalAlignment:'TOP'}},fields:'userEnteredFormat.wrapStrategy,userEnteredFormat.verticalAlignment'}},{autoResizeDimensions:{dimensions:{sheetId:tab.sheetId,dimension:'ROWS',startIndex:row-1,endIndex:row}}}]});
     const state={spreadsheetId:config.spreadsheetId,revision:saved.revision,status:'synced',syncedAt:now,sheetTitle:tabTitle,row};this.storage.saveRecordSheetSync(student.uid,state);return {...this.status(student.schoolId,student.uid),message:`${tabTitle} 탭에 저장 버전 ${saved.revision}을 연동했습니다.`};
    }catch(e){this.storage.saveRecordSheetSync(student.uid,{spreadsheetId:config.spreadsheetId,revision:saved.revision,status:'pending',message:e.status?e.message:'시트 연동에 실패했습니다. 다시 시도하세요.'});throw e;}
   });
  });
 }
}
module.exports={SchoolRecordSheets,HEADERS,TABS,spreadsheetId};
