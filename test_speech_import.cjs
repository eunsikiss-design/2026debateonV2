'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function loader(){const window={addEventListener(){}},document={addEventListener(){}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'assets/learning-drafts.js'),'utf8'),{window,document});return window.LearningDrafts;}
test('speech imports the newest nonempty own writing and falls back past empty drafts',()=>{
 const {writingSource}=loader();const data={drafts:{basic:{updatedAt:'2026-09-26T10:00:00Z',content:{claim:'주장',reason:'최신 기초 초안'}},advanced:{updatedAt:'2026-09-26T10:00:00Z',content:{paragraphs:['새 논술 초안']}}},previous:[{mode:'basic',updatedAt:'2026-09-26T09:00:00Z',content:{reason:'옛 기초 제출'}},{mode:'advanced',updatedAt:'2026-09-26T11:00:00Z',content:{paragraphs:['최신 논술 제출']}}]};
 assert.equal(writingSource(data,'basic').content.reason,'최신 기초 초안');assert.equal(writingSource(data,'advanced').content.paragraphs[0],'최신 논술 제출');
 data.drafts.basic.content={claim:'자동 주장만 있음',reason:'   ',rebuttal:''};assert.equal(writingSource(data,'basic').content.reason,'옛 기초 제출');
 assert.equal(writingSource({drafts:{},previous:[]},'basic'),null);
});

test('speech feedback can switch text and Korean audio, stop, and explain unsupported browsers',()=>{
 const nodes=new Map();function node(id){if(!nodes.has(id)){const listeners={};nodes.set(id,{value:'',textContent:'',hidden:false,disabled:false,addEventListener:(type,fn)=>listeners[type]=fn,fire:type=>listeners[type]?.(),replaceChildren(){},append(){}});}return nodes.get(id);}
 const document={getElementById:node,querySelectorAll:()=>[]};const spoken=[];let cancelled=0;
 const window={speechSynthesis:{cancel(){cancelled++;},speak(u){spoken.push(u);}},SpeechSynthesisUtterance:function(text){this.text=text;},TopicCatalog:{lock(){},ready:new Promise(()=>{})},addEventListener(){}};
 node('speech-feedback').hidden=false;node('speech-eval-praise').textContent='좋은 점';node('speech-eval-growth').textContent='다음 연습';node('speech-eval-question').textContent='질문';
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'assets/speech-live.js'),'utf8'),{window,document,localStorage:{getItem:()=>null,setItem(){}},SpeechSynthesisUtterance:window.SpeechSynthesisUtterance});
 assert.equal(node('feedback-audio-controls').hidden,true);assert.equal(spoken.length,0);
 node('feedback-delivery').value='voice';node('feedback-delivery').fire('change');assert.equal(spoken.length,1);assert.equal(spoken[0].lang,'ko-KR');assert.equal(spoken[0].text,'좋은 점 다음 연습 질문');
 const before=cancelled;node('feedback-stop').fire('click');assert.ok(cancelled>before);
 node('feedback-delivery').value='text';node('feedback-delivery').fire('change');assert.equal(node('feedback-audio-controls').hidden,true);
 window.speechSynthesis=null;node('feedback-play').fire('click');assert.match(node('feedback-audio-status').textContent,/지원하지 않습니다/);
});

test('reducing writing goals preserves written paragraphs through saving and speech import',()=>{
 const planning=require('./assets/writing-plan');
 const paragraphs=['','둘째 문단에 쓴 글','마지막 문단에 쓴 글'];
 const plan=planning.preserveParagraphs(planning.recommend('chars',50),paragraphs);
 assert.equal(plan.targetParagraphs,3);
 const content={paragraphs:paragraphs.slice(0,plan.targetParagraphs),writingPlan:plan};
 const source=loader().writingSource({drafts:{advanced:{content}}},'advanced');
 assert.deepEqual(source.content.paragraphs,paragraphs);
 assert.equal(planning.preserveParagraphs(planning.recommend('paragraphs',1),['첫 문단','','']).targetParagraphs,1);
 const history={drafts:{advanced:{content:{paragraphs:['']},versions:[{version:1,content,updatedAt:'2026-09-26T12:00:00Z'}]}}};
 assert.equal(loader().writingSource(history,'advanced').kind,'snapshot');
});
