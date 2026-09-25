'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {LearningService}=require('../services/learningService');
const workbook=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const rows=workbook.rows.filter(r=>/^\d+$/.test(r.cells.A||''));
assert.equal(rows.length,20);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'workbook-topics-'));
try{
 const service=new LearningService(path.join(dir,'teaching.json')),teacher={uid:'verify',schoolId:'isolated-verification',role:'teacher'},student={...teacher,role:'student'};
 const checked=[];
 for(const {row,cells:c} of rows){
  const id='episode2026_'+c.B.replace('-','_'),data=service.teacherMaterial(id,teacher);
  assert.equal(data.plan.question,c.E,`E${row}`);assert.equal(data.plan.coreConceptText,c.G,`G${row}`);assert.equal(data.plan.setting,c.H,`H${row}`);assert.equal(data.plan.issue,c.I,`I${row}`);
  service.savePlan(id,teacher,{revision:data.revision,plan:data.plan});
  const restarted=new LearningService(service.file);
  for(const mode of ['basic','advanced','speech']){
   const context=restarted.coaching(id,student,mode);
   assert.equal(context.topic.question,c.E);assert.equal(context.topic.coreConceptText,c.G);assert.equal(context.scenario.story,c.H);assert.equal(context.scenario.requiredIssues,c.I);
   assert.equal(context.scenario.characters.length,0,'Do not append rewritten character cards');
  }
  checked.push({topicId:id,row,cells:['E','G','H','I'].map(col=>col+row),exact:true});
 }
 // Teacher edits must preserve whitespace across the same save/reload path.
 const id=checked[0].topicId,data=service.teacherMaterial(id,teacher);
 data.plan.setting='  첫 문단 원문입니다.\n\n둘째 문단입니다.  ';
 data.plan.coreConceptText='  개념 A, 개념 B  ';data.plan.issue='  1. 첫 쟁점\n2. 둘째 쟁점  ';
 service.savePlan(id,teacher,{revision:data.revision,plan:data.plan});
 const saved=new LearningService(service.file).lesson(id,student);
 assert.equal(saved.scenario.story,data.plan.setting);assert.equal(saved.topic.coreConceptText,data.plan.coreConceptText);assert.equal(saved.scenario.requiredIssues,data.plan.issue);
 console.log(JSON.stringify({sheet:workbook.sheet,topics:checked.length,exactCells:80,modesPerTopic:3,teacherSaveAndRestart:true,whitespacePreserved:true,checked},null,2));
}finally{fs.rmSync(dir,{recursive:true,force:true});}
