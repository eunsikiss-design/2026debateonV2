'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {StudentRoster}=require('./services/studentRoster');

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
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
