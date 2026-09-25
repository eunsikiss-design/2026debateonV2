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
  assert.ok(w.topicIds.length&&w.topicIds.every(id=>topics.some(t=>t.topicId===id)),w.term);
  for(const r of w.references){const id=r.unit+':'+r.entry;assert.ok(!seen.has(id));seen.add(id);units[r.unit]=(units[r.unit]||0)+1;assert.match(r.excerpts.join(' '),/교과서 \d+쪽/);}
 }
 assert.equal(seen.size,245);assert.deepEqual(units,{1:61,2:35,3:62,4:36,5:51});
 const sample=dictionary.keywords.find(w=>w.term==='천부성');
 assert.equal(sample.definition,'하늘이 주거나, 태어날 때부터 지닌다는 의미입니다.');assert.equal(sample.topicIds.length,9);assert.match(sample.source,/교과서 10쪽/);
 assert.ok(dictionary.keywords.some(w=>w.term==='코로나바이러스감염증-19'));
});
test('existing teacher edits, topic assignments and removed defaults survive one-time migration',t=>{
 const s=fixture(t),keywords=structuredClone(defaults),original=keywords.find(w=>w.term==='사회권');
 const edited=keywords.find(w=>w.term==='주거권');edited.definition='교사가 작성한 뜻입니다.';edited.source='직접 기록';edited.topicIds=['curriculum_1_02'];
 const custom={id:'manual',term:'천부성',definition:'교사의 샘플 뜻입니다.',source:'교과서 10쪽 교사 메모',topicIds:['curriculum_1_01']};keywords.push(custom);
 const removed=keywords.find(w=>w.term==='인권 감수성');keywords.splice(keywords.indexOf(removed),1);
 const lessons={custom:{unchanged:true}},scope=s.scope(teacher);
 const old={version:1,schools:{[scope]:{revision:12,keywords,lessons},[s.scope({...teacher,schoolId:'other'})]:{revision:4,keywords:structuredClone(defaults)}}};
 fs.writeFileSync(s.file,JSON.stringify(old));
 const c=s.keywords(teacher);assert.equal(c.revision,13);assert.deepEqual(c.lessons,lessons);
 assert.deepEqual(c.keywords.find(w=>w.id===edited.id),edited);assert.deepEqual(c.keywords.find(w=>w.id==='manual'),custom);
 assert.equal(c.keywords.filter(w=>w.term==='천부성').length,1);assert.ok(!c.keywords.some(w=>w.id===removed.id));
 assert.match(c.keywords.find(w=>w.id===original.id).source,/교과서/);
 assert.deepEqual(JSON.parse(fs.readFileSync(s.file+'.before-'+dictionary.id+'.bak')),old);
 assert.equal(s.keywords({...teacher,schoolId:'other'}).revision,5);
 assert.throws(()=>s.mutate(teacher,'POST',null,{revision:12}),e=>e.status===409);
 const added=c.keywords.find(w=>w.term==='보편성');
 s.mutate(teacher,'DELETE',added.id,{revision:13});
 const restarted=new LearningService(s.file);assert.equal(restarted.keywords(teacher).revision,14);assert.ok(!restarted.keywords(student).keywords.some(w=>w.id===added.id));
});
test('imported entries can be edited with full references and reach every coaching mode',t=>{
 const s=fixture(t),c=s.keywords(teacher);assert.ok(c.keywords.length<400);const w=c.keywords.find(w=>w.source.length>180);assert.ok(w.source.length>180);
 const changed=s.mutate(teacher,'PUT',w.id,{...w,revision:0,definition:'교사가 다듬은 핵심 뜻입니다.'});assert.equal(changed.revision,1);
 for(const mode of ['basic','advanced','speech'])assert.equal(s.coaching(w.topicIds[0],student,mode).topic.conceptDefinitions.find(x=>x.id===w.id).definition,'교사가 다듬은 핵심 뜻입니다.');
 assert.equal(new LearningService(s.file).keywords(teacher).revision,1);
 assert.throws(()=>s.mutate(student,'DELETE',w.id,{revision:1}),e=>e.status===403);
});
