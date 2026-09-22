'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.events={};this.value='';this.hidden=true;this.textContent='';this.checked=false;this.style={};}
 append(...nodes){this.children.push(...nodes);}replaceChildren(){this.children=[];}setAttribute(){}addEventListener(name,fn){this.events[name]=fn;}
 querySelectorAll(tag){return this.children.flatMap(c=>[...(c.tag===tag?[c]:[]),...c.querySelectorAll(tag)]);}
 async click(){await this.events.click?.({preventDefault(){}});}
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(role='teacher'){
 const ids=Object.fromEntries(['review-status','review-state','review-source','review-cards','review-prev','review-next','review-filter','review-login'].map(id=>[id,new Element('div')]));ids['review-state'].value='pending';const writes=[];let conflict=false;
 const document={getElementById:id=>ids[id],createElement:tag=>new Element(tag),createTextNode:text=>Object.assign(new Element('text'),{textContent:text})};
 const fetch=async(url,options)=>{
  let data;if(url==='/api/auth/me')data={user:{role}};
  else if(url==='/api/evidence/sources')data={sources:[]};
  else if(options?.body){const body=JSON.parse(options.body);writes.push(body);if(conflict)return {ok:false,json:async()=>({message:'다른 검수 내용이 저장됐습니다. 목록을 새로 불러오세요.'})};data={card:{reviewRevision:body.revision+1,reviewStatus:body.status}};}
  else data={total:1,cards:[{cardId:'test-only',source:'가상 검수 자료',sourceUrl:'/test-source',detail:'가상 자료 문장',reviewStatus:'pending',reviewRevision:0}]};
  return {ok:true,json:async()=>data};
 };
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'assets/evidence-review.js'),'utf8'),{document,fetch,URLSearchParams});await settle();if(role==='teacher')assert.equal(ids['review-cards'].children.length,1,ids['review-status'].textContent);return {ids,writes,setConflict:()=>conflict=true};
}
test('review UI requires original check and hold reason, updates status and revision after save',async()=>{
 const f=await fixture(),panel=f.ids['review-cards'].children[0],buttons=panel.querySelectorAll('button'),check=panel.querySelectorAll('input')[0],note=panel.querySelectorAll('textarea')[0];
 await buttons[0].click();assert.equal(f.writes.length,0);check.checked=true;await buttons[0].click();assert.equal(f.writes[0].status,'approved');assert.equal(panel.children[1].textContent,'승인');
 await buttons[1].click();assert.equal(f.writes.length,1);note.value='맥락 확인 필요';await buttons[1].click();assert.equal(f.writes[1].revision,1);assert.equal(panel.children[1].textContent,'보류');
 await buttons[2].click();assert.equal(f.writes[2].revision,2);assert.equal(panel.children[1].textContent,'검수 전');
});
test('conflicting save preserves current status and shows reload instruction',async()=>{const f=await fixture(),panel=f.ids['review-cards'].children[0];f.setConflict();panel.querySelectorAll('input')[0].checked=true;const button=panel.querySelectorAll('button')[0];await button.click();assert.equal(panel.children[1].textContent,'검수 전');assert.equal(button.disabled,false);assert.ok(panel.querySelectorAll('p').some(p=>p.textContent.includes('새로 불러오세요')));});
test('student cannot see teacher review controls',async()=>{const f=await fixture('student');assert.equal(f.ids['review-filter'].hidden,true);assert.equal(f.ids['review-cards'].children.length,0);assert.match(f.ids['review-status'].textContent,/승인된 교사/);});


