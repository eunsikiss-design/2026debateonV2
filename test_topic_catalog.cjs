const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const topics=require('./data/topics.json');
test('20 teacher-supplied topics cover five units with unique IDs and complete writing tasks',()=>{
 const curriculum=topics.filter(t=>t.curriculumId);
 assert.equal(curriculum.length,20);assert.equal(new Set(topics.map(t=>t.topicId)).size,topics.length);
 const groups=Object.groupBy(curriculum,t=>t.unit);assert.equal(Object.keys(groups).length,5);
 assert.deepEqual(Object.values(groups).map(group=>group.length),[4,5,4,3,4]);
 for(const t of curriculum){assert.ok(t.question&&t.essayPrompt&&t.sourceType&&t.textbookRef);assert.ok(t.keyConcepts.length>=2);}
 for(const id of ['episode2026_1_01','episode2026_1_02','episode2026_2_02'])assert.ok(topics.some(t=>t.topicId===id));
});
test('every curriculum topic resolves through storage and coaches use its own concepts',async()=>{
 const storage=require('./services/storageService'),coach=require('./services/geminiService');
 for(const topic of topics.filter(t=>t.curriculumId)){
  assert.equal(storage.getTopic(topic.topicId).question,topic.question);
  const essay=await coach.evaluateAdvancedEssay({topic,studentDraft:topic.keyConcepts.join(' ')});
  assert.deepEqual(essay.rubricAssessment.conceptApplication.usedConcepts,topic.keyConcepts);
  assert.ok(essay.socraticQuestion.includes(topic.question));
  const speech=await coach.evaluateSpeech({topic,transcript:topic.keyConcepts.join(' ')});
  assert.ok(JSON.stringify(speech).includes(topic.keyConcepts[0]));
 }
});
test('all inline learning scripts parse after catalogue wiring',()=>{
 for(const file of ['05_ai_basic_practice.html','06_ai_advanced_practice.html','08_speech_timer_training.html']){
  const html=fs.readFileSync('stitch_screens/'+file,'utf8');
  for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
  assert.ok(html.includes('/assets/topic-catalog.js'));
 }
});
