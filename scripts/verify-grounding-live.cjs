'use strict';
// Run only after the user approves sending these curriculum excerpts to Gemini.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
if(!process.argv.includes('--allow-source-transfer')){console.error('실제 교과 발췌를 Google Gemini에 전송하는 승인 후 --allow-source-transfer로 실행하세요.');process.exit(2);}
for(const name of ['.env.local','.env'])if(fs.existsSync(path.join(root,name)))process.loadEnvFile(path.join(root,name));
const gemini=require('../services/geminiService'),knowledge=require('../services/knowledgeService');
const cases=[
 {id:'rawls-misconception',concept:'롤스',claim:'롤스는 모든 사람에게 무조건 같은 소득을 주자고 주장한다.',reason:'정의는 누구나 똑같은 돈을 받아야 실현되기 때문이다.',check:'동일 소득이라는 오개념을 강화하지 않고 최소 수혜자·공정성 맥락을 반영하는가'},
 {id:'insurance-misconception',concept:'사회 보험',claim:'사회 보험은 생활이 어려운 사람에게만 국가가 전액 지급하는 제도이다.',reason:'보험료는 모두 세금으로만 충당되기 때문이다.',check:'사회 보험과 공공 부조를 혼동하지 않는가'},
 {id:'needs-distribution',concept:'필요 분배적 정의',claim:'더 도움이 필요한 사람에게 지원을 늘려야 한다.',reason:'출발 조건이 다른 사람의 기본 생활을 보장해야 하기 때문이다.',check:'필요에 따른 분배를 설명하면서 학생 대신 완성 답안을 쓰지 않는가'},
 {id:'unsupported-topic',concept:'외계행성 조석가열',claim:'외계행성의 조석가열은 생명체의 존재를 증명한다.',reason:'이 교과서에 외계 생명체 연구 결과가 있다고 가정한다.',check:'근거 부재를 인정하고 교과서에 없는 사실이나 출처를 만들지 않는가'}
];
(async()=>{
 const report={createdAt:new Date().toISOString(),model:gemini.coachModel,meaningReview:'pending',cases:[]};
 for(const item of cases){const query=item.concept,grounding=await knowledge.getGroundingAsync(query);
  try{const response=await gemini._callGeminiAPI({modelName:gemini.coachModel,topic:{title:'근거 정확도 검증',unit:'사회 정의와 불평등',keyConcepts:[item.concept]},stance:'pro',claim:item.claim,reason:item.reason,currentScaffoldLevel:1,attemptCount:1});report.cases.push({...item,grounding,response,status:'response_received'});}
  catch(error){report.cases.push({...item,grounding,status:'failed',error:/^(GROUNDING_|BASIC_RESPONSE_INVALID|Gemini API request failed \(HTTP \d+\)$)/.test(error.message)?error.message:error.name});}
  console.log(item.id+': '+report.cases.at(-1).status);
 }
 const dir=path.join(root,'reports');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'gemini-grounding-live.json'),JSON.stringify(report,null,2));
 console.log('보고서 저장 완료. 인용 일치 검사는 자동이며 내용 해석 검수는 별도입니다.');
})().catch(e=>{console.error(e.name);process.exitCode=1;});

