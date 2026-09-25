'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LearningService}=require('./services/learningService');
const {dictionary,key}=require('./services/keywordDictionary');
const defaults=require('./data/keywords.json').keywords,topics=require('./data/topics.json');
const teacher={uid:'teacher',role:'teacher',schoolId:'school'},student={uid:'student',role:'student',schoolId:'school'};
function fixture(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dictionary-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return new LearningService(path.join(dir,'teaching.json'));}
test('all 245 source entries are represented once with valid topics and page references',()=>{
 assert.equal(dictionary.sourceEntryCount,245);assert.equal(dictionary.keywords.length,235);
 const seen=new Set(),names=new Set(),units={};
 for(const w of dictionary.keywords){
  assert.ok(!names.has(key(w.term)),w.term);names.add(key(w.term));
  assert.ok(w.definition&&w.definition.length<=800);assert.ok(w.source.length<=1200);
  assert.ok(w.topicIds.every(id=>topics.some(t=>t.topicId===id)),w.term);
  for(const r of w.references){const id=r.unit+':'+r.entry;assert.ok(!seen.has(id));seen.add(id);units[r.unit]=(units[r.unit]||0)+1;assert.match(r.excerpts.join(' '),/교과서 \d+쪽/);}
 }
 assert.equal(seen.size,245);assert.deepEqual(units,{1:61,2:35,3:62,4:36,5:51});
 const sample=dictionary.keywords.find(w=>w.term==='천부성');
 assert.equal(sample.definition,'하늘이 주거나, 태어날 때부터 지닌다는 의미입니다.');assert.equal(sample.topicIds.length,0);assert.match(sample.source,/교과서 10쪽/);
 assert.ok(dictionary.keywords.some(w=>w.term==='코로나바이러스감염증-19'));
});
test('catalogue migration preserves teacher definitions, historical lessons and is idempotent',t=>{const service=fixture(t),scope=service.scope(teacher);const old={version:1,schools:{[scope]:{revision:12,keywordImports:[dictionary.id],keywords:[{id:'custom',term:'참정권',definition:'교사가 작성한 뜻입니다.',source:'직접 기록',topicIds:['curriculum_2_05']}],lessons:{curriculum_1_01:{question:'과거 논제'}}}}};fs.writeFileSync(service.file,JSON.stringify(old));const current=service.keywords(teacher);assert.equal(current.revision,13);assert.equal(current.keywords.find(w=>w.id==='custom').definition,'교사가 작성한 뜻입니다.');assert.deepEqual(current.keywords.find(w=>w.id==='custom').topicIds,['episode2026_1_01']);assert.deepEqual(current.lessons,old.schools[scope].lessons);assert.deepEqual(JSON.parse(fs.readFileSync(service.file+'.before-'+require('./services/catalogueMigration').VERSION+'.bak')),old);assert.equal(service.keywords(teacher).revision,13);assert.equal(service.list(student).length,20);assert.throws(()=>service.lesson('curriculum_1_01',student),e=>e.status===404);const word=current.keywords.find(w=>w.id==='custom');service.mutate(teacher,'DELETE',word.id,{revision:13});assert.ok(!new LearningService(service.file).keywords(teacher).keywords.some(w=>w.id==='custom'));});

test('imported entries can be edited with full references and reach every coaching mode',t=>{
 const s=fixture(t),c=s.keywords(teacher);assert.ok(c.keywords.length<400);const w={...c.keywords.find(w=>w.topicIds.length),source:'교과서 출처 메모 '.repeat(30)};assert.ok(w.source.length>180);
 const changed=s.mutate(teacher,'PUT',w.id,{...w,revision:0,definition:'교사가 다듬은 핵심 뜻입니다.'});assert.equal(changed.revision,1);
 for(const mode of ['basic','advanced','speech'])assert.equal(s.coaching(w.topicIds[0],student,mode).topic.conceptDefinitions.find(x=>x.id===w.id).definition,'교사가 다듬은 핵심 뜻입니다.');
 assert.equal(new LearningService(s.file).keywords(teacher).revision,1);
 assert.throws(()=>s.mutate(student,'DELETE',w.id,{revision:1}),e=>e.status===403);
});
