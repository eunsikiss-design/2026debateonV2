const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Writable } = require('node:stream');
const root = __dirname;
let handler;
// No real network, credentials, application storage, or AI calls are used.
const knowledge = require('./services/knowledgeService');
const roster={students:[{}],registrationStatus:()=>[]};
const forbiddenService = new Proxy({}, {get(){throw new Error('Private service accessed without authentication');}});
vm.runInNewContext(fs.readFileSync(path.join(root,'server.js'),'utf8'), {
  require: name => name === 'http' ? {createServer: fn => {handler=fn;return {listen(){}};}} :
    name === 'fs' ? fs : name === 'path' ? path : name.includes('knowledgeService') ? knowledge : name.includes('studentRoster') ? roster : name.includes('firebaseAuth') ? {isConfigured(){return false},serverConfigured(){return false},publicConfig(){return null}} : forbiddenService,
  __dirname: root, process: {env:{},loadEnvFile(){}}, console: {log(){},warn(){}}, URLSearchParams, Buffer
});
function request(url, method='GET') {
  return new Promise((resolve,reject)=>{
    const chunks=[];
    const res=new Writable({write(chunk,encoding,cb){chunks.push(chunk);cb();}});
    res.headers={};res.setHeader=(name,value)=>{res.headers[name]=value;};
    res.writeHead=(status,headers)=>{res.status=status;Object.assign(res.headers,headers||{});};
    res.on('finish',()=>resolve({status:res.status,body:Buffer.concat(chunks).toString(),headers:res.headers}));
    res.on('error',reject);
    Promise.resolve(handler({url,method,headers:{}},res)).catch(reject);
  });
}
test('private files and traversal never return file contents',async()=>{
  for(const url of ['/.env','/.env.local','/.env.example','/.git/config','/server.js','/services/geminiService.js','/data/store.json','/data/syncQueue.json','/assets/../.env','/%2eenv','/%2e%2e/.env','/assets/x.png:secret','/stitch_screens/../.env','/assets/%5c..%5c.env']) {
    const r=await request(url);assert.equal(r.status,404,url);assert.equal(r.body,'Not Found',url);
  }
});
test('malformed URL returns 400 without crashing',async()=>assert.equal((await request('/%zz')).status,400));
test('public HTML works and HEAD has no body',async()=>{
  for(const url of ['/','/stitch_screens/05_ai_basic_practice.html']){
    const r=await request(url);assert.equal(r.status,200);assert.match(r.body,/<!DOCTYPE html>/i);
    assert.equal(r.headers['X-Content-Type-Options'],'nosniff');
    const h=await request(url,'HEAD');assert.equal(h.status,200);assert.equal(h.body,'');
  }
});
test('all private API access is denied before touching services',async()=>{
  for(const url of ['/api/auth/me','/api/auth/login','/api/teacher/students-status','/api/teacher/student-override','/api/growth/student/other','/api/debate/message','/api/practice/submit','/api/speech/submit','/api/sync/flush']){
    for(const method of ['GET','POST']){const r=await request(url,method);assert.equal(r.status,503);assert.equal(JSON.parse(r.body).error,'AUTH_NOT_CONFIGURED');}
  }
});
test('health explicitly describes unconnected services',async()=>{
  const r=await request('/api/health');const body=JSON.parse(r.body);
  assert.equal(body.firebase,'not_connected');assert.equal(body.authentication,'firebase_setup_required');assert.ok(body.evidenceCount>0);
});
test('extracted evidence is not claimed teacher verified',async()=>{
  assert.ok(knowledge.cards.length>0);assert.ok(knowledge.cards.every(c=>c.verificationStatus==='source_extracted'&&c.reviewStatus==='pending'));
  const r=await request('/api/evidence/cards');assert.equal(r.status,503);assert.equal(JSON.parse(r.body).error,'AUTH_NOT_CONFIGURED');
});
test('example contains no nonempty credential values',()=>{
  for(const line of fs.readFileSync(path.join(root,'.env.example'),'utf8').split(/\r?\n/)){
    const m=line.match(/^([A-Z_]+)=(.*)$/);if(m&&m[1]!=='PORT')assert.equal(m[2],'',m[1]);
  }
});
test('Sheets failure retains queue and does not claim sync',async()=>{
  const queue=require('./services/sheetSyncQueue');const before=JSON.stringify(queue.queue);
  const result=await queue.flushQueue();assert.equal(result.success,false);assert.equal(result.processedCount,0);assert.equal(JSON.stringify(queue.queue),before);
});
test('school record generation cannot fabricate missing evidence',async()=>{
  await assert.rejects(require('./services/geminiService').generateSchoolRecordDraft({}),/검증된 수행 근거/);
});
test('inline scripts remain syntactically valid',()=>{
  for(const file of ['index.html',...fs.readdirSync(path.join(root,'stitch_screens')).filter(f=>f.endsWith('.html')).map(f=>'stitch_screens/'+f)]){
    const html=fs.readFileSync(path.join(root,file),'utf8');
    for(const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
      if(!/\bsrc\s*=/.test(m[1])&&m[2].trim())new vm.Script(m[2],{filename:file});
    }
  }
});

