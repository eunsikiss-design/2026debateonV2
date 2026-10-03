'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LearningService}=require('./services/learningService');
const {build}=require('./tests/helpers/learning-server.cjs');
const teacher={uid:'rubric-teacher',role:'teacher',schoolId:'rubric-school'};
const example=[{name:'주장과 근거',maxPoints:20,levels:[{name:'우수',description:'주장과 검증 가능한 근거를 논리적으로 연결한다.',points:20},{name:'보통',description:'주장과 근거를 제시하나 연결 설명이 부족하다.',points:10},{name:'보완',description:'주장 또는 근거가 빠져 있다.',points:0}]}];
function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'teacher-rubric-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return path.join(directory,'teaching.json');}
test('teacher rubric persists by school and class and rejects stale or invalid updates',t=>{
 const file=fixture(t),service=new LearningService(file);
 assert.deepEqual(service.rubric(teacher,1,2).elements,[]);
 const saved=service.saveRubric(teacher,1,2,{revision:0,elements:example});
 assert.equal(saved.revision,1);assert.equal(saved.elements[0].levels[0].points,20);
 assert.deepEqual(new LearningService(file).rubric(teacher,1,2),saved);
 assert.deepEqual(service.rubric(teacher,1,3).elements,[]);
 assert.deepEqual(service.rubric({...teacher,schoolId:'another-school'},1,2).elements,[]);
 const word=service.keywords(teacher).keywords[0];service.mutate(teacher,'PUT',word.id,{...word,revision:service.keywords(teacher).revision,definition:'교사가 고친 뜻'});
 assert.deepEqual(new LearningService(file).rubric(teacher,1,2),saved);
 assert.throws(()=>service.saveRubric(teacher,1,2,{revision:0,elements:example}),e=>e.status===409);
 assert.throws(()=>service.saveRubric(teacher,1,2,{revision:1,elements:[{...example[0],levels:[{name:'우수',description:'설명',points:21},{name:'보완',description:'설명',points:0}]}]}),e=>e.status===400);
 assert.throws(()=>service.saveRubric({...teacher,role:'student'},1,2,{revision:0,elements:example}),e=>e.status===403);
});
test('rubric API is teacher-only, class-scoped and serves editor assets',async t=>{
 const file=fixture(t),app=build(file),server=await app.start();t.after(server.close);
 const call=(url,role,method='GET',body)=>fetch(server.origin+url,{method,headers:{cookie:role?'test_role='+role:'','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await call('/api/teacher/rubric?class=1-1','student')).status,403);
 assert.equal((await call('/api/teacher/rubric?class=1-2','teacher')).status,403);
 const empty=await (await call('/api/teacher/rubric?class=1-1','teacher')).json();assert.equal(empty.rubric.revision,0);
 const saved=await call('/api/teacher/rubric','teacher','PUT',{class:'1-1',revision:0,elements:example});
 assert.equal(saved.status,200);assert.equal((await saved.json()).rubric.elements[0].name,'주장과 근거');
 const fresh=await (await call('/api/teacher/rubric?class=1-1','teacher')).json();assert.equal(fresh.rubric.revision,1);
 assert.equal((await call('/api/teacher/rubric','teacher','PUT',{class:'1-1',revision:0,elements:example})).status,409);
 assert.equal((await fetch(server.origin+'/assets/teacher-rubric.js')).status,200);
});
