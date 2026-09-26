'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {StudentRoster}=require('./services/studentRoster');
const storageService=require('./services/storageService');
const {build}=require('./tests/helpers/learning-server.cjs');

test('onboarding without school configuration places students in the default teacher school',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'debateon-onboarding-'));
  const student={uid:'new-student',role:'student',onboardingComplete:false};
  let saved;
  const harness=build(path.join(root,'learning.json'),null,{
    users:{student},
    storage:{getUser:()=>student,findUserByStudentNumber:()=>null,saveUser:profile=>{saved=profile;},recordStudentVisit:()=>null},
    studentRoster:{students:[{}],verify:()=>({studentNumber:'10326',verifiedName:'테스트학생',grade:1,classId:3,transferSlot:true})}
  });
  const server=await harness.start();
  try{
    const response=await fetch(server.origin+'/api/auth/onboarding',{method:'POST',headers:{'Content-Type':'application/json',Cookie:'test_role=student'},body:JSON.stringify({studentNumber:'10326',name:'테스트학생',privacyConsent:true})});
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.user.schoolId,'default-school');
    assert.equal(saved.schoolId,'default-school');
    assert.equal(saved.grade,1);assert.equal(saved.classId,3);assert.equal(saved.onboardingComplete,true);
  }finally{await server.close();fs.rmSync(root,{recursive:true,force:true});}
});

test('roster requires matching names and permits named claims for blank transfer slots',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'debateon-roster-')),file=path.join(root,'roster.json');
  try{
    fs.writeFileSync(file,JSON.stringify({version:1,students:[{studentNumber:'10315',name:'홍길동'},{studentNumber:'10326',name:null}]}));
    const roster=new StudentRoster(file);
    assert.equal(roster.verify('10315','홍 길동').verifiedName,'홍길동');
    assert.throws(()=>roster.verify('10315','김학생'),error=>error.code==='ROSTER_NAME_MISMATCH');
    const transfer=roster.verify('10326','새학생');assert.equal(transfer.verifiedName,'새학생');assert.equal(transfer.transferSlot,true);
    assert.throws(()=>roster.verify('99999','없는학생'),error=>error.code==='STUDENT_NOT_IN_ROSTER');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('registration status joins roster slots to completed student profiles',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'debateon-roster-')),file=path.join(root,'roster.json');
  try{
    fs.writeFileSync(file,JSON.stringify({version:1,students:[{studentNumber:'10101',name:'등록학생'},{studentNumber:'10102',name:null}]}));
    const roster=new StudentRoster(file),status=roster.registrationStatus([{uid:'u',role:'student',studentNumber:'10101',name:'등록학생',onboardingComplete:true,privacyConsentAt:'2026-09-23T00:00:00Z'}]);
    assert.equal(status.length,2);assert.equal(status[0].registered,true);assert.equal(status[1].registered,false);assert.equal(status[1].transferSlot,true);
    const withEmail=roster.registrationStatus([{uid:'u',role:'student',studentNumber:'10101',name:'등록학생',email:'student@example.com',onboardingComplete:true}]);
    assert.equal(withEmail[0].email,'student@example.com');assert.equal(withEmail[1].email,null);
    const visited=roster.registrationStatus([{uid:'u',role:'student',studentNumber:'10101',name:'등록학생',onboardingComplete:true,registeredAt:'2026-09-23T00:00:00Z',lastAccessAt:'2026-09-25T04:30:00Z',visitCount:3}]);
    assert.equal(visited[0].registeredAt,'2026-09-23T00:00:00Z');
    assert.equal(visited[0].lastAccessAt,'2026-09-25T04:30:00Z');
    assert.equal(visited[0].visitCount,3);
    assert.equal(visited[1].visitCount,null);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('student visits group refreshes and resume after 30 minutes of inactivity',()=>{
  const storage=Object.create(Object.getPrototypeOf(storageService));
  let store={users:{student:{uid:'student',role:'student',onboardingComplete:true},teacher:{uid:'teacher',role:'teacher',onboardingComplete:true}}};
  storage._read=()=>structuredClone(store);
  storage._write=data=>{store=structuredClone(data);return true;};
  assert.equal(storage.recordStudentVisit('teacher','2026-09-25T00:00:00Z'),null);
  storage.recordStudentVisit('student','2026-09-25T00:00:00Z');
  assert.equal(store.users.student.visitCount,1);
  storage.recordStudentVisit('student','2026-09-25T00:00:20Z');
  assert.equal(store.users.student.lastAccessAt,'2026-09-25T00:00:00Z');
  storage.recordStudentVisit('student','2026-09-25T00:29:00Z');
  assert.equal(store.users.student.visitCount,1);
  storage.recordStudentVisit('student','2026-09-25T00:59:00Z');
  assert.equal(store.users.student.visitCount,2);
  assert.equal(store.users.student.lastAccessAt,'2026-09-25T00:59:00Z');
  storage.saveUser({uid:'student',name:'등록학생'});
  assert.equal(store.users.student.visitCount,2);
  assert.equal(store.users.student.lastAccessAt,'2026-09-25T00:59:00Z');
});
