'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');

test('a revised basic answer can be recorded after the first Socratic feedback',async()=>{
  const nodes=new Map(),events=[];
  function node(id=''){if(nodes.has(id))return nodes.get(id);const listeners={};const item={id,value:'',textContent:'',disabled:false,hidden:false,readOnly:false,dataset:{},children:[],setAttribute(){},before(){},focus(){},append(){},replaceChildren(){},addEventListener(type,listener){listeners[type]=listener;},fire(type){return listeners[type]?.({target:item});}};nodes.set(id,item);return item;}
  const pro=node('pro');pro.value='pro';pro.checked=true;const con=node('con');con.value='con';
  const document={getElementById:node,querySelector(selector){if(selector==='[name=stance]:checked')return pro.checked?pro:con;return node(selector);},querySelectorAll(selector){return selector==='[name=stance]'?[pro,con]:[];},addEventListener(){}};
  const submitted=[];
  const window={TopicCatalog:{current:{topicId:'episode2026_1_01',question:'논제',conceptDefinitions:[]},lesson:{scenario:{options:[{value:'pro',claim:'처음 주장'}]}},ready:Promise.resolve(),lock(){}},LearningDrafts:{open:async()=>({content:null,schedule(){},flush:async()=>{},close(){}})},LearningUI:{node:(_,value)=>({textContent:value,append(){},setAttribute(){}}),details:()=>({}),concepts:()=>({})},addEventListener(){},dispatchEvent(e){events.push(e.type);}};
  const evaluation={feedback:{praise:'좋은 점',nextChallenge:'고쳐 보세요',question:'다른 이유는?'},scaffold:{recommendedLevel:1,scaffoldGuidance:'생각해 보세요'},evidenceBasis:[]};
  const fetch=async(url,options)=>{if(url.endsWith('/evaluate'))return {ok:true,json:async()=>({evaluation})};submitted.push(JSON.parse(options.body));return {ok:true,json:async()=>({success:true,badgeAwarded:true})};};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'assets/basic-learning.js'),'utf8'),{document,window,fetch,Event:class{constructor(type){this.type=type;}}});
  await new Promise(setImmediate);
  node('input-reason').value='처음 쓴 이유';
  await node('request-eval-btn').fire('click');
  assert.equal(node('final-submit-badge-btn').disabled,true);
  node('retry-rewrite-btn').fire('click');
  node('input-reason').value='피드백을 반영해 다시 쓴 이유';node('input-reason').fire('input');
  assert.equal(node('final-submit-badge-btn').disabled,false);
  await node('final-submit-badge-btn').fire('click');
  assert.equal(submitted.length,1);assert.equal(submitted[0].reason,'피드백을 반영해 다시 쓴 이유');assert.ok(events.includes('activity-record-saved'));
});
