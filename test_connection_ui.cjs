const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function run(fail=false){
 const nodes=[],timers=[];
 function node(){const n={children:[],hidden:false,textContent:'',classList:{add(){}},append(...v){this.children.push(...v)},replaceChildren(...v){this.children=v},prepend(){},after(){},setAttribute(){},removeAttribute(){},addEventListener(){},querySelector(){return node()}};nodes.push(n);return n;}
 const header=node(),notice=node(),main=node(),body=node();body.dataset={screen:'basic'};
 const document={body,createElement:node,querySelector:s=>s==='body > header'?header:s==='main'?main:notice,querySelectorAll:()=>[]};
 const source=fs.readFileSync('assets/cyber-ui.js','utf8').split("  const toast=")[0]+'})();';
 const context={document,window:{addEventListener(){}},navigator:{onLine:true},AbortSignal,location:{},localStorage:{removeItem(){}},
 fetch:async url=>{if(url==='/api/auth/me'&&fail)throw Error('network');return {ok:true,json:async()=>url==='/api/health'?{authentication:'firebase_session'}:{user:{name:'검증학생',studentNumber:'10325',email:'test@example.test',role:'student',onboardingComplete:true}}}},
 setTimeout:fn=>(timers.push(fn),timers.length),clearTimeout(){}};
 vm.runInNewContext(source,context);
 return {nodes,notice,timers};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('all learning screens complete session rendering without a false connection error',async()=>{
 for(const page of ['05_ai_basic_practice','06_ai_advanced_practice','08_speech_timer_training']){
  assert.match(fs.readFileSync('stitch_screens/'+page+'.html','utf8'),/cyber-ui.js/);
 }
 const r=run();await settle();
 assert.ok(r.nodes.some(n=>n.textContent==='CONNECTED'));
 assert.ok(r.nodes.some(n=>n.textContent==='학번 10325'));
 assert.ok(r.nodes.some(n=>n.textContent==='이메일 test@example.test'));
 assert.match(r.notice.textContent,/운영 서비스 연결됨/);
 assert.equal(r.timers.length,0);
});
test('session failures stop after three automatic retries even when health succeeds',async()=>{
 const r=run(true);await settle();
 for(let i=0;i<3;i++){assert.equal(r.timers.length,i+1);r.timers[i]();await settle();}
 assert.equal(r.timers.length,3);
});
