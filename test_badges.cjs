'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const {build}=require('./tests/helpers/learning-server.cjs');

test('badge acknowledgement is saved and remains confirmed after reopening the store',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'debateon-badges-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const previous=process.env.DATA_STORE_PATH;process.env.DATA_STORE_PATH=path.join(dir,'store.json');t.after(()=>{if(previous===undefined)delete process.env.DATA_STORE_PATH;else process.env.DATA_STORE_PATH=previous;});
 delete require.cache[require.resolve('./services/storageService')];const storage=require('./services/storageService');
 const badge=storage.awardBadge('student-a',{badgeType:'badge_reasoning',badgeName:'주장-근거 연결 뱃지'});
 assert.equal(badge.acknowledgedAt,undefined);
 assert.equal(storage.acknowledgeBadge('student-b',badge.id),null);
 assert.equal(storage.getStudentBadges('student-a')[0].acknowledgedAt,undefined);
 const confirmed=storage.acknowledgeBadge('student-a',badge.id);assert.ok(confirmed.acknowledgedAt);
 assert.equal(storage.acknowledgeBadge('student-a',badge.id).acknowledgedAt,confirmed.acknowledgedAt);
 delete require.cache[require.resolve('./services/storageService')];assert.equal(require('./services/storageService').getStudentBadges('student-a')[0].acknowledgedAt,confirmed.acknowledgedAt);
});

test('badge API returns only own badges and confirms by owner',async t=>{
 const badges=[{id:'badge-1',userId:'fixture-student',badgeType:'badge_reasoning',badgeName:'주장-근거 연결 뱃지',earnedAt:'2026-10-01T00:00:00Z'},{id:'other',userId:'another-student',badgeType:'badge_speech_master',earnedAt:'2026-10-02T00:00:00Z'}];
 const storage={getUser:()=>null,getStudentBadges:uid=>badges.filter(b=>b.userId===uid),acknowledgeBadge:(uid,id)=>{const badge=badges.find(b=>b.userId===uid&&b.id===id);if(badge)badge.acknowledgedAt||='2026-10-03T00:00:00Z';return badge||null;}};
 const fixture=build(path.join(__dirname,'data','topics.json'),null,{storage}),server=await fixture.start();t.after(()=>server.close());
 const get=()=>fetch(server.origin+'/api/student/badges',{headers:{cookie:'test_role=student'}});
 let response=await get();assert.equal(response.status,200);let data=await response.json();assert.deepEqual(data.badges.map(b=>b.id),['badge-1']);assert.equal(data.badges[0].acknowledgedAt,undefined);
 response=await fetch(server.origin+'/api/student/badges',{method:'POST',headers:{cookie:'test_role=student','Content-Type':'application/json'},body:JSON.stringify({badgeId:'other'})});assert.equal(response.status,404);
 response=await fetch(server.origin+'/api/student/badges',{method:'POST',headers:{cookie:'test_role=student','Content-Type':'application/json'},body:JSON.stringify({badgeId:'badge-1'})});assert.equal(response.status,200);data=await response.json();assert.ok(data.badges[0].acknowledgedAt);
 response=await get();data=await response.json();assert.ok(data.badges[0].acknowledgedAt);
 response=await fetch(server.origin+'/api/student/badges',{headers:{cookie:'test_role=teacher'}});assert.equal(response.status,403);
});

test('a newly earned badge opens a dialog and appears in the header only after confirmation',async()=>{
 const nodes=[],events={},badge={id:'badge-ui',badgeType:'badge_reasoning',badgeName:'주장-근거 연결 뱃지',description:'재도전 완료',earnedAt:'2026-10-03T00:00:00Z'};
 const node=()=>{const n={hidden:false,children:[],textContent:'',classList:{add(){},remove(){}},append(...children){this.children.push(...children)},replaceChildren(...children){this.children=children},prepend(){},after(){},setAttribute(){},removeAttribute(){},addEventListener(type,fn){this['on'+type]=fn},querySelector(){return node()},focus(){}};nodes.push(n);return n;};
 const header=node(),main=node(),body=node();body.dataset={screen:'hub'};
 const document={body,activeElement:null,createElement:node,querySelector:s=>s==='body > header'?header:s==='main'?main:null,querySelectorAll:()=>[],addEventListener(){}};
 let posted=false;const fetchMock=async(url,options={})=>({ok:true,json:async()=>url==='/api/health'?{authentication:'firebase_session'}:url==='/api/auth/me'?{user:{uid:'student-ui',name:'학생',role:'student',onboardingComplete:true}}:url==='/api/student/badges'?(options.method==='POST'?(posted=true,badge.acknowledgedAt='2026-10-03T00:01:00Z',{success:true,badges:[badge]}):{success:true,badges:[badge]}):{}});
 const source=fs.readFileSync(path.join(__dirname,'assets/cyber-ui.js'),'utf8').split('  const toast=')[0]+'})();';
 vm.runInNewContext(source,{document,window:{addEventListener:(type,fn)=>events[type]=fn},navigator:{onLine:true},AbortSignal,location:{},localStorage:{removeItem(){}},fetch:fetchMock,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0});
 await new Promise(resolve=>setImmediate(resolve));
 const overlay=nodes.find(n=>n.className==='badge-award-overlay'),bar=nodes.find(n=>n.className==='hud-badge-bar'),confirm=nodes.find(n=>n.className==='badge-award-confirm');
 assert.equal(overlay.hidden,false);assert.equal(bar.hidden,true);assert.equal(posted,false);
 await confirm.onclick();assert.equal(posted,true);assert.equal(overlay.hidden,true);assert.equal(bar.hidden,false);assert.equal(bar.children.length,2);
});
