'use strict';
const records=require('./schoolRecordService');
const AXES=[
 {key:'concept',label:'개념 활용',question:'사용한 교과 개념의 뜻을 설명하고, 이 사례에 어떻게 적용되는지 연결해 보세요.'},
 {key:'evidence',label:'논거 타당성',question:'주장을 뒷받침하는 이유나 자료가 무엇이며, 확인 가능한 근거인지 점검해 보세요.'},
 {key:'reasoning',label:'논리 구조화',question:'이유에서 결론이 도출되는 과정을 설명하고, 빠진 조건이 없는지 확인해 보세요.'},
 {key:'response',label:'반론 대응',question:'다른 입장의 핵심 이유를 공정하게 설명한 뒤, 그 이유에 답해 보세요.'},
 {key:'expression',label:'전달 및 표현',question:'읽는 사람이 주장과 이유를 구분할 수 있도록 문장과 순서를 다듬어 보세요.'}
];
const key=s=>JSON.stringify([s.kind,s.topicId,s.text.trim()]);
function collect(storage,learning,student,topicId=''){
 const p=records.portfolio(storage,student,id=>{try{return learning.topic(id,student);}catch{return storage.getTopic(id);}},learning.drafts.list(student));
 // Teacher observations and draft school records are private teacher work, not student reports.
 const own=p.sources.filter(s=>s.kind!=='observation');
 const topics=[...new Map(own.filter(s=>s.topicId).map(s=>[s.topicId,{topicId:s.topicId,title:s.title}])).values()];
 const raw=own.filter(s=>!topicId||s.topicId===topicId),unique=new Map();
 for(const s of raw){const k=key(s),prior=unique.get(k);if(!prior||prior.status==='draft'&&s.status!=='draft')unique.set(k,s);}
 const sources=[...unique.values()].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
 const groups=new Map();
 for(const s of raw){if(!s.topicId||s.status==='draft'||!['basic','advanced','speech'].includes(s.kind)||!Number.isFinite(Date.parse(s.createdAt)))continue;
  const k=s.kind+':'+s.topicId;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(s);}
 const comparisons=[];
 for(const group of groups.values()){
  group.sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt));const first=group[0],last=group.at(-1);
  if(first.text.trim()===last.text.trim()||Date.parse(first.createdAt)>=Date.parse(last.createdAt))continue;
  comparisons.push({topicId:last.topicId,title:last.title,kind:last.kind,beforeId:unique.get(key(first)).id,afterId:unique.get(key(last)).id,beforeAt:first.createdAt,afterAt:last.createdAt});
 }
 const counts=Object.fromEntries(['basic','advanced','speech','debate'].map(kind=>[kind,sources.filter(s=>s.kind===kind).length]));
 return {student:p.student,topics,topicId,sources,comparisons,summary:{recordCount:sources.length,savedCount:sources.filter(s=>s.status!=='draft').length,draftCount:sources.filter(s=>s.status==='draft').length,topicCount:new Set(sources.map(s=>s.topicId).filter(Boolean)).size,comparisonCount:comparisons.length,counts},fingerprint:records.fingerprint(sources)};
}
function batch(report){
 const sources=[];let chars=0,truncatedCount=0;
 for(const source of report.sources){if(sources.length>=30)break;const text=source.text.slice(0,40000);if(chars+text.length>40000)continue;sources.push({...source,text});chars+=text.length;if(text.length<source.text.length)truncatedCount++;}
 const ids=new Set(sources.map(s=>s.id));
 return {sources,comparisons:report.comparisons.filter(p=>ids.has(p.beforeId)&&ids.has(p.afterId)),excludedCount:report.sources.length-sources.length,truncatedCount};
}
function fallback(report){return {source:'source-review',notice:'AI 분석을 완료하지 못했습니다. 저장된 원문과 점검 질문을 표시합니다. 아래 내용은 역량 수준이나 성장에 대한 판정이 아닙니다.',axes:AXES.map(axis=>({...axis,status:'insufficient',finding:'이 역량은 원문을 읽고 추가로 확인해야 합니다.',nextStep:axis.question,evidence:[]})),changes:[]};}
function validate(result,{sources,comparisons}){
 if(!Array.isArray(result?.axes)||result.axes.length!==AXES.length)throw Error('Missing competency axes');
 const text=(s,max=1000)=>{if(typeof s!=='string'||!s.trim()||s.length>max)throw Error('Invalid growth text');return s.trim();};
 const refs=entries=>{if(!Array.isArray(entries)||!entries.length||entries.length>5)throw Error('Missing growth citations');return entries.map(ref=>{const s=sources.find(s=>s.id===ref.sourceId),quote=text(ref.quote,500);if(!s||quote.length<4||!s.text.includes(quote))throw Error('Unverified growth quote');return {sourceId:s.id,quote};});};
 const axes=AXES.map(axis=>{const matches=result.axes.filter(a=>a.key===axis.key);if(matches.length!==1)throw Error('Invalid axis key');const a=matches[0];if(!['observed','insufficient'].includes(a.status))throw Error('Invalid axis status');return {key:axis.key,label:axis.label,status:a.status,finding:text(a.finding),nextStep:text(a.nextStep),evidence:a.status==='observed'?refs(a.evidence):[]};});
 if(!Array.isArray(result.changes)||result.changes.length>5)throw Error('Invalid growth changes');
 const changes=result.changes.map(change=>{const pair=comparisons.find(p=>p.beforeId===change.beforeId&&p.afterId===change.afterId);if(!pair)throw Error('Unverified comparison pair');const evidence=refs(change.evidence);if(![pair.beforeId,pair.afterId].every(id=>evidence.some(e=>e.sourceId===id)))throw Error('Both versions must be cited');return {...pair,finding:text(change.finding),nextStep:text(change.nextStep),evidence};});
 return {source:'gemini-api',notice:'학생 원문을 근거로 한 소크라AI의 학습 피드백입니다. 인용이 원문과 일치하는지 확인했으며, 해석의 타당성과 최종 평가는 교사가 확인합니다. 점수·등급을 부여하지 않습니다.',axes,changes};
}
module.exports={AXES,collect,batch,fallback,validate};
