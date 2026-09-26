'use strict';
const crypto=require('node:crypto');
const labels={basic:'기초 논리 연습',advanced:'심화 논술',speech:'스피치 전사',debate:'토론 발언',observation:'교사 관찰'};
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const string=value=>typeof value==='string'?value.trim():'';
function portfolio(storage,student,topicFor,drafts={}){
 const raw=storage.getStudentRecordEvidence(student),sources=[],topicCache=new Map();
 const add=(kind,id,topicId,createdAt,text)=>{
  if(!string(text))return;
  if(!topicCache.has(topicId))topicCache.set(topicId,topicFor(topicId)||{});
  const topic=topicCache.get(topicId);
  sources.push({id:hash([kind,id]).slice(0,24),kind,label:labels[kind],topicId:topicId||null,title:topic.title||'이전 수업 기록',createdAt:createdAt||null,text:string(text),concepts:Array.isArray(topic.keyConcepts)?topic.keyConcepts:[]});
 };
 for(const [index,s] of raw.sessions.entries()){
  const kind=s.mode==='speech_timer'?'speech':s.mode==='advanced_essay'?'advanced':'basic';
  const text=kind==='speech'?s.transcript:kind==='advanced'?s.studentDraft:[s.claim,s.reason,s.rebuttal].filter(v=>typeof v==='string'&&v.trim()).join('\n\n');
  add(kind,[s.sessionId,index],s.topicId,s.createdAt||s.submittedAt,text);
 }
 for(const [topicId,modes] of Object.entries(drafts)){
  for(const kind of ['basic','advanced','speech']){
   for(const draft of [...(modes[kind]?.versions||[]),modes[kind]]){const content=draft?.content;if(!content)continue;
   // A supplied claim or speaking outline alone is not a student's written response.
   if(kind==='basic'&&!string(content.reason)&&!string(content.rebuttal))continue;
   const text=kind==='basic'?[content.claim,content.reason,content.rebuttal].filter(string).join('\n\n'):kind==='advanced'?(content.paragraphs||[]).filter(string).join('\n\n'):content.transcript;
   if(!string(text)||(!draft.version&&sources.some(s=>s.kind===kind&&s.topicId===topicId&&s.text===string(text))))continue;
   add(kind,[draft.version?'snapshot':'draft',topicId,draft.version||draft.revision],topicId,draft.updatedAt,text);
   const source=sources.at(-1);source.status=draft.version?'snapshot':'draft';source.label+=' · '+(draft.version?draft.version+'차 저장본':'작성 중인 초안');
   }
  }
 }
 for(const m of raw.messages)add('debate',m.roomId+':'+m.messageId,m.topicId,m.createdAt||m.timestamp,m.content);
 for(const o of raw.observations)add('observation',o.id,null,o.timestamp,o.note);
 sources.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||a.id.localeCompare(b.id));
 return {student:{uid:student.uid,name:student.name,studentNumber:student.studentNumber,schoolId:student.schoolId,grade:student.grade,classId:student.classId,isTestAccount:student.isTestAccount===true||student.authProvider==='simulation'||/^sim-/.test(student.uid)},sources,saved:storage.getSchoolRecordDraft(student.uid)};
}
function selection(portfolio,ids){
 if(!Array.isArray(ids)||!ids.length)fail('분석할 학생 기록을 선택하세요.');
 if(ids.length>30||new Set(ids).size!==ids.length)fail('서로 다른 기록을 최대 30개까지 선택하세요.');
 const selected=ids.map(id=>portfolio.sources.find(s=>s.id===id));
 if(selected.some(s=>!s))fail('선택한 기록이 변경되었거나 이 학생의 기록이 아닙니다. 다시 불러오세요.',409);
 if(!selected.some(s=>s.kind!=='observation'))fail('학생이 직접 작성한 글이나 발언이 한 건 이상 필요합니다.');
 if(selected.reduce((n,s)=>n+s.text.length,0)>40000)fail('선택한 원문이 너무 깁니다. 나누어 분석하세요.');
 return selected;
}
const fingerprint=sources=>hash(sources.map(s=>({id:s.id,text:s.text,topicId:s.topicId,title:s.title,concepts:s.concepts})).sort((a,b)=>a.id.localeCompare(b.id)));
function localAnalysis(sources){
 return sources.filter(s=>s.kind!=='observation').slice(0,6).map(s=>{
  const terms=s.concepts.filter(term=>s.text.includes(term));
  return {competency:terms.length?'교과 개념 활용 검토':'주장과 이유 연결 검토',finding:terms.length?`‘${terms.join('·')}’ 표현이 나타납니다. 개념의 의미와 적용의 정확성은 원문에서 확인해야 합니다.`:`${s.label}에 자신의 생각을 기록했습니다. 주장과 근거의 타당성은 원문에서 확인해야 합니다.`,evidence:[{sourceId:s.id,quote:s.text.slice(0,240)}]};
 });
}
function localDraft(sources){
 const picked=sources.filter(s=>s.kind!=='observation').slice(0,3);
 const sentences=picked.map(s=>({text:`‘${s.title}’ ${s.label}에서 “${s.text.slice(0,160).replace(/\n/g,' ')}${s.text.length>160?'…':''}”라고 기록함.`,evidence:[{sourceId:s.id,quote:s.text.slice(0,160)}]}));
 return {source:'evidence-extract',analysis:localAnalysis(sources),sentences,draftText:sentences.map(s=>s.text).join(' '),notice:'AI 의미 분석을 사용하지 못해 원문 발췌 중심의 초안을 구성했습니다. 역량의 수준이나 성장을 판정한 결과가 아닙니다.'};
}
function validateAI(result,sources){
 if(!result||!Array.isArray(result.analysis)||!result.analysis.length||result.analysis.length>8||!Array.isArray(result.sentences)||!result.sentences.length||result.sentences.length>8)throw Error('Invalid school record response');
 const evidence=refs=>{
  if(!Array.isArray(refs)||!refs.length||refs.length>5)throw Error('Missing evidence');
  return refs.map(ref=>{const source=sources.find(s=>s.id===ref.sourceId),quote=string(ref.quote);if(!source||quote.length<4||quote.length>500||!source.text.includes(quote))throw Error('Unverified student quote');return {sourceId:source.id,quote};});
 };
 const text=(v,max)=>{if(!string(v)||v.length>max)throw Error('Invalid generated text');return string(v);};
 const analysis=result.analysis.map(a=>({competency:text(a.competency,80),finding:text(a.finding,800),evidence:evidence(a.evidence)}));
 const sentences=result.sentences.map(s=>({text:text(s.text,800),evidence:evidence(s.evidence)}));
 const draftText=sentences.map(s=>s.text).join(' ');if(draftText.length>3000)throw Error('Draft too long');
 const integratedThinking=Array.isArray(result.integratedThinking)?result.integratedThinking.map(a=>{
  if(!['시간적 관점','공간적 관점','사회적 관점','윤리적 관점'].includes(a.perspective)||!['observed','insufficient'].includes(a.status))throw Error('Invalid perspective');
  return {perspective:a.perspective,status:a.status,finding:a.status==='insufficient'&&!string(a.finding)?'선택한 원문만으로는 이 관점의 적용을 확인하기 어렵습니다.':text(a.finding,800),evidence:a.status==='observed'?evidence(a.evidence):[],nextStep:text(a.nextStep,800)};
 }):[];
 if(integratedThinking.length&&(integratedThinking.length!==4||new Set(integratedThinking.map(a=>a.perspective)).size!==4))throw Error('Missing perspective');
 const feedback=Array.isArray(result.feedback)?result.feedback.slice(0,5).map(a=>({focus:text(a.focus,100),finding:text(a.finding,800),nextStep:text(a.nextStep,800),evidence:evidence(a.evidence)})):[];
 return {source:'gemini-api',analysis,sentences,integratedThinking,feedback,draftText,notice:'AI 분석 및 세특 초안입니다. 인용 원문과 문장별 해석이 맞는지 교사가 확인하고 수정하세요.'};
}
module.exports={portfolio,selection,fingerprint,localDraft,validateAI};
