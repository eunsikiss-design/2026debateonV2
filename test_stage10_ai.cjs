'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const service=require('./services/geminiService'),knowledge=require('./services/knowledgeService');
const {schema,validate,groundingQuery}=require('./services/basicResponse');
const good=()=>({analysis:{claim:1,evidence:1,reasoning:1,concept:1,rebuttal:0},diagnosis:{strengths:['주장을 제시했다.'],weaknesses:['근거를 보완해야 한다.']},scaffold:{currentLevel:1,recommendedLevel:2,scaffoldGuidance:'개념을 연결해 보세요.'},feedback:{praise:'주장을 제시했습니다.',nextChallenge:'근거를 보완하세요.',question:'왜 그렇게 생각하나요?'},badgeEligible:false,evidenceBasis:[]});
test('basic contract rejects missing fields, wrong types and invalid score ranges',()=>{
 assert.equal(validate(good()).analysis.claim,1);
 for(const mutate of [v=>delete v.scaffold,v=>v.analysis.claim=4,v=>v.analysis.reasoning='2',v=>v.feedback.question='',v=>v.badgeEligible='true',v=>v.scaffold.currentLevel=6]){const v=good();mutate(v);assert.throws(()=>validate(v),/BASIC_RESPONSE_INVALID/);}
});
test('basic request transmits schema, preserves UI fields, and uses assigned concept',async()=>{
 const saved={fetch:global.fetch,key:service.apiKey,model:service.coachModel,grounding:knowledge.getGroundingAsync};let body,query;
 try{service.apiKey='test';service.coachModel='test';knowledge.getGroundingAsync=async q=>(query=q,{context:'[]',references:[],retrievalMode:'local-semantic-hybrid'});global.fetch=async(url,options)=>(body=JSON.parse(options.body),{ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(good())}]}}]})});
  const result=await service.evaluateBasicPractice({topic:{keyConcepts:['외계행성 조석가열']},claim:'가상 주장',reason:'교과서에 연구 결과가 있다고 가정한다.'});
  assert.equal(query,'외계행성 조석가열');assert.deepEqual(body.generationConfig.responseSchema,schema);assert.match(body.contents[0].parts[0].text,/외부 지식, 과학적 사실, 구체적 예시를 새로 제시하거나 암시하지 마세요/);assert.equal(result.source,'gemini-api');assert.equal(result.scaffold.currentLevel,1);assert.equal(result.feedback.question,'왜 그렇게 생각하나요?');
 }finally{global.fetch=saved.fetch;service.apiKey=saved.key;service.coachModel=saved.model;knowledge.getGroundingAsync=saved.grounding;}
});
test('HTTP 503 and malformed response use complete local feedback without fabricated citations',async()=>{
 const saved={fetch:global.fetch,key:service.apiKey,model:service.coachModel,grounding:knowledge.getGroundingAsync};
 try{service.apiKey='test';service.coachModel='test';knowledge.getGroundingAsync=async()=>({context:'[]',references:[],retrievalMode:'local-semantic-hybrid'});
  for(const response of [{ok:false,status:503,body:{cancel:async()=>{}}},{ok:true,json:async()=>({candidates:[{content:{parts:[{text:'{"scores":1}'}]}}]})}]){
   global.fetch=async()=>response;const result=await service.evaluateBasicPractice({topic:{keyConcepts:['사회 보험']},claim:'사회 보험이 필요하다.',reason:'위험을 함께 부담하기 때문이다.'});assert.equal(result.source,'socratic-rules-engine');assert.ok(result.scaffold.scaffoldGuidance);assert.ok(result.feedback.question);assert.equal(result.usedReferences,undefined);
  }
 }finally{global.fetch=saved.fetch;service.apiKey=saved.key;service.coachModel=saved.model;knowledge.getGroundingAsync=saved.grounding;}
});
test('grounding falls back to rationale only when assigned concepts are missing',()=>{assert.equal(groundingQuery({keyConcepts:[]},'사회 보험'),'사회 보험');});

