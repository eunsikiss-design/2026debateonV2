(() => {
  const $=id=>document.getElementById(id),ui=window.LearningUI;
  const claim=$('input-claim'),reason=$('input-reason'),rebuttal=$('input-rebuttal'),status=$('basic-status');
  let attempt=1,evaluation=null,evaluatedText='',busy=false,needsRewrite=false;
  let draftSession=null,loadedTopic=null,loadTicket=0;
  const draftStatus=ui.node('p','','learning-status');draftStatus.setAttribute('role','status');status.before(draftStatus);
  function saveDraft(){if(draftSession)draftSession.schedule({claim:claim.value,reason:reason.value,rebuttal:rebuttal.value,stance:stance()});}
  const stance=()=>document.querySelector('[name=stance]:checked')?.value||'pro';
  const fingerprint=()=>JSON.stringify([window.TopicCatalog.current?.topicId,stance(),claim.value,reason.value,rebuttal.value]);
  function selectedClaim(){
    const option=window.TopicCatalog.lesson?.scenario?.options?.find(item=>item.value===stance());
    claim.value=option?.claim||`내 생각에는 이 논제에 ${stance()==='pro'?'찬성한다':'반대한다'}.`;
    $('basic-claim-sentence').textContent=claim.value.replace(/^내 생각에는\s*/, '');
  }
  function scaffold(){
    const holder=$('basic-concept-scaffold');holder.replaceChildren();
    const words=window.TopicCatalog.current?.conceptDefinitions||[];
    for(const [title,terms] of [['활용해야 하는 개념이나 용어',words.slice(0,1)],['활용할 수 있는 개념이나 용어',words.slice(1)]]){
      holder.append(ui.details(title,terms.length?ui.concepts(terms):ui.node('p','등록된 용어가 없습니다. 상황과 이유를 자신의 말로 설명해 보세요.')));
    }
  }
  function saving(){ $('final-submit-badge-btn').disabled=busy||!evaluation||attempt<2||needsRewrite||fingerprint()!==evaluatedText; }
  function sync(){if(busy)return;attempt=1;evaluation=null;evaluatedText='';needsRewrite=false;$('attempt-badge').textContent='1회차 생각 쓰기';$('topic-question').textContent=window.TopicCatalog.current?.question||'주제를 선택해 주세요.';$('coach-feedback').hidden=true;$('request-eval-btn').disabled=!window.TopicCatalog.current;status.textContent='';selectedClaim();scaffold();saving();}
  async function restore(){const id=window.TopicCatalog.current?.topicId;if(!id||loadedTopic===id)return;loadedTopic=id;const ticket=++loadTicket;draftSession?.close();draftSession=null;reason.value='';rebuttal.value='';sync();reason.readOnly=rebuttal.readOnly=true;
    try{const session=await window.LearningDrafts.open(id,'basic',draftStatus);if(ticket!==loadTicket){session.close();return;}draftSession=session;const d=session.content;if(d){reason.value=d.reason;rebuttal.value=d.rebuttal;const radio=document.querySelector(`[name=stance][value="${d.stance==='con'?'con':'pro'}"]`);if(radio)radio.checked=true;selectedClaim();}}
    catch(e){draftStatus.textContent=e.message+' 새로고침 후 다시 불러오세요.';loadedTopic=null;}finally{if(ticket===loadTicket)reason.readOnly=rebuttal.readOnly=!draftSession;}}
  window.TopicCatalog.ready.then(restore);window.addEventListener('curriculum-topic-change',restore);
  document.addEventListener('change',event=>{if(event.target.matches('[name=stance]')){selectedClaim();saving();saveDraft();}});
  [reason,rebuttal].forEach(n=>n.addEventListener('input',()=>{if(needsRewrite&&fingerprint()!==evaluatedText)needsRewrite=false;saving();saveDraft();}));
  function lock(value){busy=value;window.TopicCatalog.lock(value);$('request-eval-btn').disabled=value;[reason,rebuttal].forEach(n=>n.readOnly=value);document.querySelectorAll('[name=stance]').forEach(n=>n.disabled=value);$('retry-rewrite-btn').disabled=value;saving();}
  function render(result){const f=result.feedback;document.querySelector('#coach-card h2').textContent='내 글 다시 살펴보기';$('coach-feedback').hidden=false;$('feedback-praise').textContent=f.praise;$('feedback-challenge').textContent=f.nextChallenge;$('feedback-question').textContent=f.question;$('scaffold-guidance').textContent=result.scaffold.scaffoldGuidance;$('feedback-source').textContent=result.source==='gemini-api'?'소크라AI 피드백 · 교사의 최종 평가가 아닙니다.':'AI 응답을 받지 못해 기본 도움말을 보여드립니다. 글의 타당성을 판정한 결과가 아닙니다.';const refs=$('coach-references');refs.replaceChildren();for(const item of result.evidenceBasis||[]){const c=ui.node('div');c.append(ui.node('blockquote',item.quote),ui.node('p',item.explanation));refs.append(ui.details('사용한 교과 근거',c));}}
  $('request-eval-btn').addEventListener('click',async()=>{
    if(busy)return;if(!reason.value.trim()){status.textContent='그렇게 생각한 이유를 먼저 적어 주세요.';reason.focus();return;}
    lock(true);status.textContent='소크라AI가 개념과 이유의 연결을 살펴보고 있습니다.';
    try{const r=await fetch('/api/practice/evaluate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topicId:window.TopicCatalog.current.topicId,stance:stance(),claim:claim.value,reason:reason.value,rebuttal:rebuttal.value,attemptCount:attempt,currentScaffoldLevel:evaluation?.scaffold?.recommendedLevel||1})});const data=await r.json();if(!r.ok||!data.evaluation)throw Error(data.error||'피드백을 받지 못했습니다.');evaluation=data.evaluation;evaluatedText=fingerprint();render(evaluation);status.textContent=attempt<2?'질문을 읽고 이유를 고쳐 보세요.':'피드백을 확인한 뒤 다시 쓴 글을 기록할 수 있습니다.';}
    catch(e){evaluation=null;status.textContent=e.message+' 입력한 글은 그대로 있습니다. 잠시 후 다시 요청해 주세요.';}
    finally{lock(false);}
  });
  $('retry-rewrite-btn').addEventListener('click',()=>{attempt++;needsRewrite=true;$('attempt-badge').textContent=attempt+'회차 다시 쓰기';status.textContent='이유를 고친 뒤 소크라AI에게 다시 요청해 주세요.';saving();reason.focus();});
  $('final-submit-badge-btn').addEventListener('click',async()=>{if($('final-submit-badge-btn').disabled)return;lock(true);try{const r=await fetch('/api/practice/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topicId:window.TopicCatalog.current.topicId,stance:stance(),claim:claim.value,reason:reason.value,rebuttal:rebuttal.value,scaffoldLevel:evaluation.scaffold.recommendedLevel,evaluation,attemptCount:attempt})});const d=await r.json();if(!r.ok||!d.success)throw Error(d.error||'저장에 실패했습니다.');status.textContent=d.badgeAwarded?'다시 쓴 글을 기록하고 연습 뱃지를 받았습니다.':'다시 쓴 글을 기록했습니다.';evaluation=null;}catch(e){status.textContent=e.message+' 글은 화면에 유지됩니다.';}finally{lock(false);}});
})();
