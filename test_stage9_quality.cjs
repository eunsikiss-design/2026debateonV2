'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const {Readable,Writable}=require('node:stream');
const {EvidenceReviewStore,fingerprint}=require('./services/evidenceReviewStore');
const {SemanticSearch}=require('./services/semanticSearch');const {MODEL,REVISION}=require('./services/localEmbedding');
const {validateGrounding}=require('./services/groundingValidation');
const teacher={uid:'teacher-real',role:'teacher'};
const knowledgeRoot=process.env.KNOWLEDGE_ROOT?path.resolve(process.env.KNOWLEDGE_ROOT):__dirname;
const card={cardId:'a',sourceHash:'source-v1',detail:'사회 보험은 질병이나 실업 등 사회적 위험에 대비하는 제도이다.',audience:'student',unitId:'p1',keyConcepts:['사회 보험']};
function withTemp(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'debateon-review-'));return Promise.resolve().then(()=>fn(root)).finally(()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'debateon-review-'));fs.rmSync(root,{recursive:true,force:true});});}
test('review requires teacher, original comparison, and persists corrected excerpt, identity and revision',()=>withTemp(root=>{
 const correctedDetail='사회 보험은 질병이나 실업 같은 사회적 위험에 공동으로 대비하는 제도이다.';
 const store=new EvidenceReviewStore(root),input={status:'approved',revision:0,note:'원문 대조',correctedDetail,originalChecked:true,reviewerUid:'spoofed'};
 assert.throws(()=>store.save(card,input,{uid:'s',role:'student'}),e=>e.status===403);
 assert.throws(()=>store.save(card,{...input,originalChecked:false},teacher),e=>e.status===400);
 const approved=store.save(card,input,teacher);assert.equal(approved.reviewStatus,'approved');assert.equal(approved.detail,correctedDetail);assert.equal(approved.extractedDetail,card.detail);
 const restored=new EvidenceReviewStore(root);assert.equal(restored.state(card).reviewerUid,teacher.uid);assert.equal(restored.data.history.length,1);
 assert.equal(restored.decorate(card,'student').detail,correctedDetail);assert.equal(restored.decorate(card,'student').extractedDetail,undefined);
 assert.throws(()=>restored.save(card,input,teacher),e=>e.status===409);
 assert.equal(restored.state({...card,detail:card.detail+' 변경'}).status,'pending');
 assert.throws(()=>restored.save(card,{status:'rejected',revision:1,note:''},teacher),e=>e.status===400);
}));
test('rejected excerpts disappear from student retrieval and grounding',()=>withTemp(async root=>{
 const actual=require('./services/knowledgeService'),source=actual.sources.find(s=>s.audience==='student'),sample=actual.cards.find(c=>c.sourceId===source.sourceId);
 fs.copyFileSync(path.join(knowledgeRoot,source.fileName),path.join(root,source.fileName));
 const knowledge=new actual.KnowledgeService({root,corpus:{schemaVersion:1,sources:[{...source}],cards:[{...sample}]}});
 knowledge.reviewCard(sample.cardId,{status:'rejected',revision:0,note:'원문 맥락 재확인',originalChecked:false},teacher);
 assert.equal(knowledge.getEvidenceCards().length,0);assert.equal(knowledge.getCardById(sample.cardId),null);
 assert.equal(knowledge.getEvidenceCards(null,null,'teacher').length,1);assert.equal(JSON.parse((await knowledge.getGroundingAsync('정의')).context).length,0);
}));
test('semantic ranking retrieves paraphrase while respecting role/source and rejection',async()=>{
 const vector=Array(384).fill(0);vector[0]=1;const secret={...card,cardId:'secret',audience:'teacher',unitId:'p2'};
 const index={version:1,model:MODEL,revision:REVISION,dimensions:384,entries:[card,secret].map(c=>({cardId:c.cardId,fingerprint:fingerprint(c),vector}))};
 let calls=0;const search=new SemanticSearch(__dirname,{index,embedder:async()=>{calls++;return [vector];}});
 const knowledge={getEvidenceCards:()=>[{...card,reviewStatus:'pending'}],searchEvidence:()=>[]};
 const result=await search.search(knowledge,'아플 때 함께 부담하는 안전망');assert.equal(result.retrievalMode,'local-semantic-hybrid');assert.deepEqual(result.cards.map(c=>c.cardId),['a']);
 await search.search(knowledge,'아플 때 함께 부담하는 안전망');assert.equal(calls,1);
 const filtered=await search.search(knowledge,'아플 때',{sourceId:'unavailable'});assert.deepEqual(filtered.cards,[]);
 knowledge.getEvidenceCards=()=>[{...card,reviewStatus:'rejected'}];assert.deepEqual((await search.search(knowledge,'아플 때')).cards,[]);
});
test('stale vectors and failed local runtime fall back explicitly to lexical search',async()=>{
 const vector=Array(384).fill(0);vector[0]=1;const index={version:1,model:MODEL,revision:REVISION,dimensions:384,entries:[{cardId:'a',fingerprint:fingerprint(card),vector}]};
 const knowledge={getEvidenceCards:()=>[card],searchEvidence:()=>[card]};
 const search=new SemanticSearch(__dirname,{index,embedder:async()=>{throw Error('missing model');}});
 assert.equal((await search.search(knowledge,'사회 보험')).fallbackReason,'SEMANTIC_UNAVAILABLE');
 knowledge.getEvidenceCards=()=>[{...card,detail:'changed'}];assert.equal((await search.search(knowledge,'사회 보험')).fallbackReason,'INDEX_STALE');
});
test('citations must match real excerpt IDs and verbatim quotes; meaning is not claimed verified',()=>{
 const grounding={context:JSON.stringify([{id:'a',text:card.detail}]),references:[{cardId:'a'}],retrievalMode:'local-semantic-hybrid'};
 const good={evidenceBasis:[{cardId:'a',quote:card.detail,explanation:'사회적 위험에 함께 대비하는 의미를 설명한다.'}]};
 assert.equal(validateGrounding(good,grounding).groundingValidation.meaningVerified,false);
 for(const bad of [{evidenceBasis:[{...good.evidenceBasis[0],cardId:'fake'}]},{evidenceBasis:[{...good.evidenceBasis[0],quote:'원문에 존재하지 않는 허위 내용을 인용했다.'}]},{}])assert.throws(()=>validateGrounding(bad,grounding),/GROUNDING_/);
 assert.equal(validateGrounding({evidenceBasis:[]},{context:'[]',references:[],retrievalMode:'local-lexical'}).groundingValidation.status,'no_citation');
});
test('invalid Gemini evidence triggers the existing local feedback fallback',async()=>{
 const service=require('./services/geminiService'),knowledge=require('./services/knowledgeService');const original={key:service.apiKey,api:service._callGeminiAPIWithPrompt,grounding:knowledge.getGroundingAsync};
 try{service.apiKey='test';service._callGeminiAPIWithPrompt=async()=>({evidenceBasis:[{cardId:'invented',quote:'원문에 없는 문장입니다.',explanation:'거짓'}]});knowledge.getGroundingAsync=async()=>({context:'[]',references:[],retrievalMode:'local-lexical'});
  const result=await service.evaluateBasicPractice({topic:{keyConcepts:['사회 보험']},claim:'사회 보험이 필요하다고 생각한다.',reason:'사회 보험은 위험에 함께 대비하게 한다.'});assert.equal(result.source,'socratic-rules-engine');assert.equal(result.usedReferences,undefined);
 }finally{service.apiKey=original.key;service._callGeminiAPIWithPrompt=original.api;knowledge.getGroundingAsync=original.grounding;}
});
test('HTTP review writes use authenticated identity and reject student/cross-origin requests',async()=>{
 let handler,saved;const knowledge={reviewList:()=>({cards:[],total:0}),reviewCard:(id,input,user)=>{saved=user;return {...card};}};
 const auth={isConfigured:()=>true,authenticate:async req=>req.headers.cookie==='teacher'?teacher:req.headers.cookie==='student'?{uid:'s',role:'student'}:null};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'server.js'),'utf8'),{require:n=>n==='http'?{createServer:f=>(handler=f,{listen(){}})}:n==='fs'?fs:n==='path'?path:n.includes('firebaseAuth')?auth:n.includes('knowledgeService')?knowledge:n.includes('studentRoster')?{students:[],registrationStatus:()=>[]}:{},__dirname,process:{env:{},loadEnvFile(){}},console:{log(){},warn(){}},URLSearchParams,Buffer});
 const request=(cookie,origin='http://localhost:3000')=>new Promise((resolve,reject)=>{const req=Readable.from([JSON.stringify({cardId:'a',reviewerUid:'spoof'})]);req.url='/api/teacher/evidence/review';req.method='POST';req.headers={cookie,origin};const res=new Writable({write(c,e,cb){cb();}});res.setHeader=()=>{};res.writeHead=s=>res.status=s;res.on('finish',()=>resolve(res.status));Promise.resolve(handler(req,res)).catch(reject);});
 assert.equal(await request(''),401);assert.equal(await request('student'),403);assert.equal(await request('teacher','https://untrusted.example'),403);assert.equal(await request('teacher'),200);assert.equal(saved.uid,'teacher-real');
});

