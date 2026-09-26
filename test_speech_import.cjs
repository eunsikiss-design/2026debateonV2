'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function loader(){const window={addEventListener(){}},document={addEventListener(){}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'assets/learning-drafts.js'),'utf8'),{window,document});return window.LearningDrafts;}
test('speech imports the newest nonempty own writing and falls back past empty drafts',()=>{
 const {writingSource}=loader();const data={drafts:{basic:{updatedAt:'2026-09-26T10:00:00Z',content:{claim:'주장',reason:'최신 기초 초안'}},advanced:{updatedAt:'2026-09-26T10:00:00Z',content:{paragraphs:['새 논술 초안']}}},previous:[{mode:'basic',updatedAt:'2026-09-26T09:00:00Z',content:{reason:'옛 기초 제출'}},{mode:'advanced',updatedAt:'2026-09-26T11:00:00Z',content:{paragraphs:['최신 논술 제출']}}]};
 assert.equal(writingSource(data,'basic').content.reason,'최신 기초 초안');assert.equal(writingSource(data,'advanced').content.paragraphs[0],'최신 논술 제출');
 data.drafts.basic.content={claim:'자동 주장만 있음',reason:'   ',rebuttal:''};assert.equal(writingSource(data,'basic').content.reason,'옛 기초 제출');
 assert.equal(writingSource({drafts:{},previous:[]},'basic'),null);
});
