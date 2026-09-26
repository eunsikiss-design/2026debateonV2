'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'student-reports-'));process.env.DATA_STORE_PATH=path.join(dir,'store.json');
const storage=require('./services/storageService'),report=require('./services/studentReportService'),records=require('./services/schoolRecordService'),{SchoolRecordSheets,HEADERS,TABS,spreadsheetId}=require('./services/schoolRecordSheets'),{build}=require('./tests/helpers/learning-server.cjs');
test.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
const student={uid:'report-student',schoolId:'school-a',role:'student',grade:1,classId:13,studentNumber:'11301',name:'시험 학생',isTestAccount:true};
storage.saveUser(student);storage.savePracticeSession({userId:student.uid,topicId:'episode2026_1_01',claim:'주권자의 자유를 존중해야 합니다.',reason:'참여를 높이는 제도와 권리를 함께 고려합니다.'});
const p=records.portfolio(storage,student,id=>storage.getTopic(id));
storage.saveSchoolRecordDraft(student.uid,{revision:0,evidenceIds:p.sources.map(s=>s.id),evidenceFingerprint:records.fingerprint(p.sources),evidence:p.sources,generated:records.localDraft(p.sources),status:'test-draft',draftText:'=SUM(1,2)라는 표현도 문자 그대로 보존함. 자유와 제도의 관계를 검토함.'},'teacher');
test('exports preserve saved teacher text, literal formulas, full evidence, revision and test label',async()=>{
 const r=report.build({...p,saved:storage.getSchoolRecordDraft(student.uid)},1);
 const bytes=await report.xlsx(r),Excel=require('exceljs'),wb=new Excel.Workbook();await wb.xlsx.load(bytes);
 const all=wb.getWorksheet('활동 보고서').getColumn(2).values;assert.ok(all.includes(r.draftText));assert.equal(wb.getWorksheet('활동 보고서').getCell('B11').type!==Excel.ValueType.Formula,true);
 assert.match(all.join(' '),/가상 학생 시험용/);assert.match(all.join(' '),/공간적 관점|이 관점/);
 assert.equal(wb.getWorksheet('원문 근거').getRow(2).getCell(5).value,p.sources[0].text);
 const pdf=await report.pdf(r);assert.equal(pdf.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.length>10000);
 assert.throws(()=>report.build({...p,saved:storage.getSchoolRecordDraft(student.uid)},0),{status:409});assert.throws(()=>report.build({...p,saved:null},1),{status:409});
});
function mockGoogle(){const values={},calls=[];let failWrite=false;
 const transport=async q=>{calls.push(q);const range=decodeURIComponent(q.suffix.split('/values/')[1]?.split('?')[0]||'');const tab=range.match(/^'([^']+)'/)?.[1];
  if(q.suffix.startsWith('?fields='))return {properties:{title:'시험 연동 시트'},sheets:Object.values(TABS).map((title,i)=>({properties:{title,sheetId:i,gridProperties:{rowCount:1000}}}))};
  if(q.suffix===':batchUpdate')return {};
  if(q.method==='GET'&&range.endsWith('A1:J1'))return {values:[HEADERS]};
  if(q.method==='GET')return {values:Object.values(values[tab]||{}).map(v=>[v[0]])};
  if(q.method==='PUT'){assert.match(q.suffix,/valueInputOption=RAW/);if(failWrite)throw Object.assign(Error('일시 실패'),{status:502});values[tab]||={};values[tab][range]=q.body.values[0];return {};}
  throw Error('Unexpected API '+q.suffix);
 };return {transport,calls,values,setFail:v=>failWrite=v};}
test('Sheets upserts same student, isolates tests, rejects unreviewed/stale records and keeps retryable failures',async()=>{
 const mock=mockGoogle(),svc=new SchoolRecordSheets(storage,{env:{},transport:mock.transport}),id='s'.repeat(30);
 await svc.connect(student.schoolId,id,'teacher');
 await Promise.all([svc.sync(student,1),svc.sync(student,1)]);
 assert.equal(Object.keys(mock.values[TABS.test]).length,1);assert.equal(mock.values[TABS.real],undefined);
 assert.equal(Object.values(mock.values[TABS.test])[0][5],storage.getSchoolRecordDraft(student.uid).draftText);
 await assert.rejects(()=>svc.sync({...student,isTestAccount:false},1),{status:409});await assert.rejects(()=>svc.sync(student,99),{status:409});
 mock.setFail(true);await assert.rejects(()=>svc.sync(student,1),/일시 실패/);assert.equal(svc.status(student.schoolId,student.uid).sync.status,'pending');
 mock.setFail(false);await svc.sync(student,1);assert.equal(svc.status(student.schoolId,student.uid).sync.status,'synced');
 await svc.disconnect(student.schoolId);assert.equal(svc.status(student.schoolId).connected,false);assert.ok(mock.values[TABS.test]);
 assert.throws(()=>spreadsheetId('https://example.com/spreadsheets/d/'+id));assert.equal(spreadsheetId('https://docs.google.com/spreadsheets/d/'+id+'/edit'),id);
});
test('HTTP downloads and Sheets settings require teacher and scoped student; saved report is attachment',async()=>{
 const users={teacher:{uid:'teacher',role:'teacher',schoolId:student.schoolId,grade:1,classId:13,onboardingComplete:true},student};
 storage.saveUser({...student,uid:'other-school',schoolId:'school-b'});
 const app=await build(path.join(dir,'teaching.json'),null,{storage,users}).start();
 try{
  const url='/api/teacher/student-report?studentId='+student.uid+'&revision=1&format=';
  const call=(route,who='teacher')=>fetch(app.origin+route,{headers:{cookie:'test_uid='+who}});
  assert.equal((await call(url+'xlsx','student')).status,403);
  assert.equal((await call('/api/teacher/student-report?studentId=other-school&revision=1&format=pdf')).status,403);
  assert.equal((await call(url+'html')).status,400);
  for(const format of ['pdf','xlsx']){const r=await call(url+format);assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/attachment/);assert.match(r.headers.get('cache-control'),/no-store/);assert.ok((await r.arrayBuffer()).byteLength>1000);}
  assert.equal((await call('/api/teacher/record-sheets','student')).status,403);
  assert.equal((await call('/api/teacher/record-sheets?studentId=other-school')).status,403);
 }finally{await app.close();}
});
