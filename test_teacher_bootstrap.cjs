'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'teacher-bootstrap-'));
process.env.DATA_STORE_PATH=path.join(dir,'store.json');
const storage=require('./services/storageService'),{build}=require('./tests/helpers/learning-server.cjs');
test.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep+'teacher-bootstrap-'));fs.rmSync(dir,{recursive:true,force:true});});
const base={schoolId:'our-school',grade:1,classId:3,onboardingComplete:true,dataOrigin:'verified'};
const users={teacher:{...base,uid:'admin01',name:'운영교사 01',role:'teacher',email:'admin01@example.test'},primary:{...base,uid:'owner',role:'teacher',email:'owner@example.test'},student:{...base,uid:'test01',role:'student',classId:13,name:'검증 학생',studentNumber:'11301'},outsider:{...base,uid:'outside',role:'teacher',schoolId:'other-school'}};
Object.values(users).forEach(user=>storage.saveUser(user));
const roster={students:[{grade:1,classId:13},{grade:1,classId:3},{grade:1,classId:13}],registrationStatus:()=>[{studentNumber:'11301',grade:1,classId:13,registered:true}]};
const options={users,storage,studentRoster:roster,env:{ADMIN_SCHOOL_ID:'our-school',ADMIN_EMAIL:'owner@example.test'}};
async function get(app,url,who='teacher'){return fetch(app.origin+url,{headers:{cookie:'test_uid='+who}});}

test('teacher class discovery is reachable, scoped, and preserves provision permissions',async()=>{
 const app=await build(path.join(dir,'classes.json'),null,options).start();
 try{
  const res=await get(app,'/api/teacher/classes');assert.equal(res.status,200);assert.match(res.headers.get('cache-control'),/no-store/);
  const data=await res.json();assert.deepEqual(data.classes,[{grade:1,classId:3},{grade:1,classId:13}]);assert.equal(data.canProvisionTeachers,false);
  assert.equal((await (await get(app,'/api/teacher/classes','primary')).json()).canProvisionTeachers,true);
  assert.deepEqual((await (await get(app,'/api/teacher/classes','outsider')).json()).classes,[{grade:1,classId:3}]);
  assert.equal((await get(app,'/api/teacher/classes','student')).status,403);
  assert.equal((await fetch(app.origin+'/api/teacher/classes')).status,401);
 }finally{await app.close();}
});

test('teacher dashboard bootstrap loads class picker and every initial data dependency',async()=>{
 const app=await build(path.join(dir,'dashboard.json'),null,options).start();
 try{
  assert.equal((await (await get(app,'/api/auth/me')).json()).user.role,'teacher');
  const classes=await (await get(app,'/api/teacher/classes')).json();
  const chosen=classes.classes.find(c=>c.classId===13);assert.ok(chosen);
  const scope=`?class=${chosen.grade}-${chosen.classId}`;
  const routes=['/api/teacher/students-status'+scope,'/api/teacher/registration-status','/api/teacher/class-settings'+scope,'/api/teacher/class-analytics'+scope,'/api/topics','/api/evidence/cards','/api/teacher/record-sheets'];
  const results=await Promise.all(routes.map(async url=>{const r=await get(app,url);assert.equal(r.status,200,url);return r.json();}));
  assert.ok(results[0].students.some(s=>s.uid==='test01'));
  assert.equal(results[1].registrations[0].studentNumber,'11301');
  assert.equal(results[2].settings.requiredBadgeCount,0);
  assert.equal(results[3].analytics.totalStudents,1);
  assert.ok(Array.isArray(results[4].topics));assert.ok(Array.isArray(results[5].cards));assert.equal(results[6].connected,false);
 }finally{await app.close();}
});
