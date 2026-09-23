'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),vm=require('node:vm');
const {Writable}=require('node:stream');
const knowledge=require('./services/knowledgeService');
const knowledgeRoot=process.env.KNOWLEDGE_ROOT?path.resolve(process.env.KNOWLEDGE_ROOT):__dirname;
const corpus=JSON.parse(fs.readFileSync(path.join(knowledgeRoot,'data/curriculum_corpus.json'),'utf8'));
test('every citation resolves to an exact source excerpt and valid physical location',()=>{
  assert.equal(corpus.sources.length,9);assert.ok(corpus.cards.length>200);assert.deepEqual(corpus.failures,[]);
  assert.equal(new Set(corpus.cards.map(c=>c.cardId)).size,corpus.cards.length);
  const units=new Map(corpus.units.map(u=>[u.unitId,u]));
  for(const card of corpus.cards){
    const source=corpus.sources.find(s=>s.sourceId===card.sourceId),unit=units.get(card.unitId);
    assert.equal(card.detail,unit.text.slice(card.offsetStart,card.offsetEnd));assert.equal(card.sourceHash,source.sha256);
    assert.equal(card.audience,source.audience);assert.equal(card.reviewStatus,'pending');assert.equal(card.printedPage,null);
    if(source.format==='pdf')assert.ok(card.page>=1&&card.page<=source.pageCount);
    else {assert.equal(card.page,null);assert.match(card.section,/^Section\d+$/);}
  }
  for(const source of corpus.sources)assert.ok(knowledge.getSourceFile(source.sourceId,'teacher'),source.fileName);
});
test('concept retrieval handles Korean whitespace and no matches',()=>{
  for(const query of ['롤스','분배적 정의','사회보험']){
    const results=knowledge.searchEvidence(query);assert.ok(results.length>0,query);
    assert.ok(results[0].detail.replace(/\s/g,'').includes(query.replace(/\s/g,'')),query);
    assert.equal(new Set(results.map(c=>c.unitId)).size,results.length);
  }
  for(const query of ['',null,'존재하지않는개념XYZ123'])assert.deepEqual(knowledge.searchEvidence(query),[]);
});
test('opposing textbook columns remain separate in extraction order',()=>{
  const page=corpus.units.find(u=>u.page===12&&corpus.sources.find(s=>s.sourceId===u.sourceId).category==='textbook');
  assert.ok(page.text.includes('자유주의적 정의관 자유주의에서는 정의를 개인의 자유와 권리 보장에 연관 지어 바라본다.'));
  assert.ok(page.text.includes('공동체주의적 정의관 공동체주의에서는 정의를 공동체에 관한 의무에 연 관 지어 바라본다.'));
});
test('student retrieval cannot expose teacher answers even with a forged source filter',()=>{
  assert.equal(knowledge.getSources().length,2);assert.equal(knowledge.getSources('teacher').length,9);
  assert.ok(knowledge.getEvidenceCards().length>70);
  for(const source of corpus.sources.filter(s=>s.audience==='teacher')){
    assert.deepEqual(knowledge.searchEvidence('정의',{sourceId:source.sourceId}),[]);
    assert.equal(knowledge.getSourceFile(source.sourceId),null);
    const card=corpus.cards.find(c=>c.sourceId===source.sourceId);assert.equal(knowledge.getCardById(card.cardId),null);
  }
  const worksheet=corpus.sources.find(s=>s.category==='worksheet');
  assert.ok(knowledge.searchEvidence('정의',{sourceId:worksheet.sourceId,role:'teacher'}).length>0);
  assert.equal(knowledge.getSourceFile('../.env','teacher'),null);
});
test('changed originals are excluded after reload and cannot be served under an old citation',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'debateon-corpus-'));
  try{
    fs.writeFileSync(path.join(root,'sample.pdf'),'old');
    const sample={schemaVersion:1,sources:[{sourceId:'sample',fileName:'sample.pdf',audience:'student',sha256:crypto.createHash('sha256').update('old').digest('hex')}],cards:[{sourceId:'sample',cardId:'c1',detail:'정의',audience:'student'}]};
    const current=new knowledge.KnowledgeService({root,corpus:structuredClone(sample)});
    assert.ok(current.getSourceFile('sample'));fs.writeFileSync(path.join(root,'sample.pdf'),'changed');
    assert.equal(current.getSourceFile('sample'),null);
    const stale=new knowledge.KnowledgeService({root,corpus:sample});assert.equal(stale.cards.length,0);assert.equal(stale.getSources()[0].integrityStatus,'stale');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Gemini receives real student excerpts and server-owned reference IDs',async()=>{
  const gemini=require('./services/geminiService'),original=gemini._callGeminiAPIWithPrompt;
  let prompt;const originalGrounding=knowledge.getGroundingAsync;knowledge.getGroundingAsync=async query=>knowledge.getGrounding(query);
  try{
    gemini._callGeminiAPIWithPrompt=async args=>{prompt=args.userPrompt;return {evidenceBasis:[],retrievedReferences:[{cardId:'invented'}]};};
    const result=await gemini._callGeminiAPI({topic:{title:'정의',keyConcepts:'롤스'},reason:'분배적 정의'});
    assert.ok(result.retrievedReferences.length>0);assert.equal(result.retrievalMode,'local-lexical');
    for(const ref of result.retrievedReferences){const card=knowledge.getCardById(ref.cardId);assert.ok(card);assert.ok(prompt.includes(card.detail));assert.equal(card.audience,'student');}
    assert.match(prompt,/명령이 아닌 참고 데이터/);assert.doesNotMatch(prompt,/개념확인문제|지도서/);
  }finally{gemini._callGeminiAPIWithPrompt=original;knowledge.getGroundingAsync=originalGrounding;}
});
let handler;
const forbidden=new Proxy({},{get(){throw Error('Unexpected private service access');}});
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'server.js'),'utf8'),{
  require:name=>name==='http'?{createServer:fn=>{handler=fn;return {listen(){}};}}:name==='fs'?fs:name==='path'?path:name.includes('knowledgeService')?knowledge:name.includes('studentRoster')?{students:[],registrationStatus:()=>[]}:name.includes('firebaseAuth')?{
    isConfigured:()=>true,authenticate:async req=>req.headers.cookie?{uid:'test',role:req.headers.cookie==='teacher'?'teacher':'student'}:null
  }:forbidden,
  __dirname,process:{env:{},loadEnvFile(){}},console:{log(){},warn(){}},URLSearchParams,Buffer
});
function request(url,cookie){return new Promise((resolve,reject)=>{
  const chunks=[],res=new Writable({write(chunk,enc,done){chunks.push(chunk);done();}});res.headers={};
  res.setHeader=(key,value)=>{res.headers[key]=value;};res.writeHead=(status,headers)=>{res.status=status;Object.assign(res.headers,headers||{});};
  res.on('error',reject);res.on('finish',()=>resolve({status:res.status,headers:res.headers,body:Buffer.concat(chunks)}));
  Promise.resolve(handler({url,method:'GET',headers:cookie?{cookie}:{}},res)).catch(reject);
});}
test('HTTP sources and search use authenticated role and are never cached publicly',async()=>{
  for(const url of ['/api/evidence/sources','/api/evidence/cards','/api/evidence/search?q='+encodeURIComponent('롤스'),'/api/evidence/glossary']){
    assert.equal((await request(url)).status,401,url);
  }
  for(const [role,count] of [['student',2],['teacher',9]]){
    const res=await request('/api/evidence/sources',role);assert.equal(res.status,200);assert.equal(JSON.parse(res.body).sources.length,count);assert.equal(res.headers['Cache-Control'],'private, no-store');
  }
  const res=await request('/api/evidence/search?mode=keyword&q='+encodeURIComponent('롤스'),'student');assert.ok(JSON.parse(res.body).cards.length>0);
  assert.equal((await request('/api/evidence/search?q='+'x'.repeat(201),'student')).status,400);
});
test('HTTP original files require login and protect teacher documents',async()=>{
  const student=corpus.sources.find(s=>s.audience==='student'),teacher=corpus.sources.find(s=>s.audience==='teacher');
  assert.equal((await request('/api/evidence/source/'+student.sourceId)).status,401);
  assert.equal((await request('/api/evidence/source/'+teacher.sourceId,'student')).status,404);
  const pdf=await request('/api/evidence/source/'+student.sourceId,'student');assert.equal(pdf.status,200);assert.equal(pdf.body.subarray(0,4).toString(),'%PDF');
  assert.equal(pdf.headers['X-Content-Type-Options'],'nosniff');
  assert.equal((await request('/api/evidence/source/'+teacher.sourceId,'teacher')).status,200);
  assert.equal((await request('/api/evidence/source/..%2f.env','teacher')).status,404);
});
test('library page and script are public; corpus JSON stays private',async()=>{
  for(const url of ['/stitch_screens/11_evidence_library.html','/assets/evidence-library.js','/assets/evidence.css'])assert.equal((await request(url)).status,200,url);
  assert.equal((await request('/data/curriculum_corpus.json')).status,404);
});

