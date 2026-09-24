(() => {
  const $=id=>document.getElementById(id),ui=window.LearningUI,planning=window.WritingPlan;
  const goal={chars:$('target-chars'),sentences:$('target-sentences'),paragraphs:$('target-paragraphs')};
  const drafts=new Map(),questionCache=new Map();
  let active=null,revision=null,busy=false,paragraphDrafts=[],requestNumber=0,controller=null;
  const currentInputs=()=>[...document.querySelectorAll('.guided-paragraph textarea')];
  const words=()=>window.TopicCatalog.current?.conceptDefinitions||[];
  const plan=()=>planning.normalize({targetChars:goal.chars.value,targetSentences:goal.sentences.value,targetParagraphs:goal.paragraphs.value});
  function setGoals(value){goal.chars.value=value.targetChars;goal.sentences.value=value.targetSentences;goal.paragraphs.value=value.targetParagraphs;}
  function recommendation(){
    const p=plan();$('writing-recommendation').textContent=p.targetParagraphs+'문단 권장 범위: '+(p.targetParagraphs*3)+'~'+(p.targetParagraphs*4)+'문장, 약 '+(p.targetParagraphs*150)+'~'+(p.targetParagraphs*200)+'자. 글자 수는 공백·줄바꿈 포함이며, 분량은 연습을 돕는 안내입니다.';
  }
  function counts(){
    const text=currentInputs().map(n=>n.value.trim()).filter(Boolean).join('\n\n');$('essay-input').value=text;
    const chars=Array.from(text).length,sentences=(text.match(/[^.!?。！？\n]+[.!?。！？]?/g)||[]).map(s=>s.trim()).filter(Boolean).length,paragraphs=text?text.split(/\n\s*\n/).length:0;
    $('essay-counts').textContent='현재 글자 '+chars+' / 목표 '+goal.chars.value+'자 · 문장 '+sentences+' / 목표 '+goal.sentences.value+'문장 · 문단 '+paragraphs+' / 목표 '+goal.paragraphs.value+'문단';
  }
  function preparedQuestions(){
    const s=window.TopicCatalog.lesson?.scenario||{},count=plan().targetParagraphs,role=s.role||'상황 속 인물';
    const clue=(s.story||'').split(/(?<=[.!?])\s/)[0];
    return Array.from({length:count},(_,i)=>({index:i+1,focus:count===1?'선택과 이유':i===0?'문제와 선택':i===count-1?'다른 의견과 결론':'상황 근거와 개념',contextQuote:clue,questions:[count===1?role+'의 상황에서 무엇을 선택하겠어요? 아래 단서를 이유와 연결하고 다른 입장에도 답해 보세요.':i===0?role+'의 가장 시급한 어려움은 무엇인가요? 이 상황에서 내 선택을 밝혀 보세요.':i===count-1?(s.issue||'이 선택')+'에 관해 다른 입장의 걱정에 어떻게 답할까요?':role+'의 상황에서 아래 단서는 내 주장을 왜 뒷받침하나요? 관련 개념으로 설명해 보세요.'],terms:words().slice(0,2).map(w=>w.term)}));
  }
  function renderQuestions(paragraphs){
    paragraphs.forEach((p,i)=>{
      const box=document.querySelectorAll('.guided-paragraph')[i];if(!box)return;
      box.querySelector('h3').textContent=(i+1)+'문단 · '+p.focus;
      const content=box.querySelector('.paragraph-guidance');content.replaceChildren();
      if(p.contextQuote)content.append(ui.node('p','상황 단서: '+p.contextQuote,'paragraph-clue'));
      const list=ui.node('ol',undefined,'paragraph-questions');p.questions.forEach(q=>list.append(ui.node('li',q)));content.append(list);
      const relevant=words().filter(w=>p.terms.includes(w.term));content.append(ui.details('관련 핵심 교과 용어 · 필요할 때 보기',relevant.length?ui.concepts(relevant):ui.node('p','상황의 이유를 자신의 말로 설명해 보세요.')));
    });
  }
  function build(){
    currentInputs().forEach((n,i)=>{paragraphDrafts[i]=n.value;});
    const holder=$('paragraph-prompts');holder.replaceChildren();
    for(let i=0;i<plan().targetParagraphs;i++){
      const box=ui.node('section',undefined,'guided-paragraph guided-form');box.append(ui.node('h3',(i+1)+'문단'),ui.node('div',undefined,'paragraph-guidance'));
      const label=ui.node('label',(i+1)+'문단 쓰기'),field=ui.node('textarea');field.maxLength=10000;field.placeholder='위 질문에 답하며 자신의 문장으로 작성해 보세요.';field.value=paragraphDrafts[i]||'';field.addEventListener('input',()=>{paragraphDrafts[i]=field.value;counts();});label.append(field);box.append(label);holder.append(box);
    }
    renderQuestions(preparedQuestions());recommendation();counts();
  }
  async function requestQuestions(force=false){
    if(!active||busy)return;
    const ticket=++requestNumber,selected=plan(),key=JSON.stringify([active,revision,selected]);
    controller?.abort();const thisRequest=new AbortController();controller=thisRequest;
    if(!force&&questionCache.has(key)){renderQuestions(questionCache.get(key));$('question-plan-status').textContent='소크라AI가 이 주제와 분량에 맞춘 질문입니다.';$('generate-questions-btn').disabled=false;return;}
    $('generate-questions-btn').disabled=true;$('question-plan-status').textContent='소크라AI가 인물의 처지와 쟁점에 맞춰 문단별 질문을 만들고 있습니다. 먼저 글을 써도 좋아요.';
    const timer=setTimeout(()=>thisRequest.abort(),55000);
    try{
      const response=await fetch('/api/practice/advanced/plan',{method:'POST',headers:{'Content-Type':'application/json'},signal:thisRequest.signal,body:JSON.stringify({topicId:active,writingPlan:selected})});
      const data=await response.json();if(!response.ok||!data.plan?.paragraphs)throw Error(data.error||'질문을 받지 못했습니다.');
      if(ticket!==requestNumber)return;
      renderQuestions(data.plan.paragraphs);
      if(data.plan.source==='gemini-api'){questionCache.set(key,data.plan.paragraphs);$('question-plan-status').textContent='소크라AI가 이 주제와 분량에 맞춘 질문입니다. 질문을 참고해 나의 문장으로 이어 보세요.';}
      else $('question-plan-status').textContent='AI 질문을 받지 못해 상황 기반 준비 질문을 보여 드립니다. 질문 다시 만들기로 재시도할 수 있습니다.';
    }catch(error){if(ticket!==requestNumber)return;renderQuestions(preparedQuestions());$('question-plan-status').textContent='AI 질문을 불러오지 못했습니다. 상황 기반 준비 질문으로 작성하거나 다시 요청해 주세요.';}
    finally{clearTimeout(timer);if(ticket===requestNumber)$('generate-questions-btn').disabled=busy;}
  }
  function topicChange(){
    const next=window.TopicCatalog.current;if(!next)return;
    if(active===next.topicId&&revision===next.keywordRevision)return;
    if(active)drafts.set(active,{goals:plan(),paragraphs:[...paragraphDrafts]});
    active=next.topicId;revision=next.keywordRevision;
    const draft=drafts.get(active);paragraphDrafts=[...(draft?.paragraphs||[])];$('paragraph-prompts').replaceChildren();setGoals(draft?.goals||planning.recommend('paragraphs',3));build();
    $('topic-question').textContent=next.essayPrompt||next.question;$('essay-feedback').hidden=true;$('essay-status').textContent='';requestQuestions();
  }
  window.TopicCatalog.ready.then(topicChange);window.addEventListener('curriculum-topic-change',topicChange);
  Object.entries(goal).forEach(([anchor,n])=>n.addEventListener('change',()=>{if(busy)return;setGoals(planning.recommend(anchor,n.value));build();requestQuestions();}));
  $('generate-questions-btn').addEventListener('click',()=>requestQuestions(true));
  $('submit-essay-btn').addEventListener('click',async()=>{
    if(busy||!active)return;
    const parts=currentInputs().map(n=>n.value.trim());if(parts.some(p=>!p)){ $('essay-status').textContent='각 문단의 질문에 답한 뒤 글을 살펴보세요.';currentInputs()[parts.findIndex(p=>!p)].focus();return; }
    busy=true;$('submit-essay-btn').disabled=true;$('generate-questions-btn').disabled=true;Object.values(goal).forEach(n=>n.disabled=true);currentInputs().forEach(n=>n.readOnly=true);window.TopicCatalog.lock(true);$('essay-status').textContent='소크라AI가 글의 주장과 근거를 살펴보고 있습니다.';
    try{
      const r=await fetch('/api/practice/advanced/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topicId:active,studentDraft:$('essay-input').value,paragraphLevel:parts.length,writingPlan:plan()})});
      const data=await r.json();if(!r.ok||!data.evaluation)throw Error(data.error||'글을 살펴보지 못했습니다.');
      const e=data.evaluation;$('essay-strength').textContent='잘한 점: '+(e.strengths?.[0]||'작성한 글을 확인했습니다.');$('essay-improvement').textContent='다듬을 점: '+(e.focusImprovement||'주장과 이유가 이어지는지 다시 읽어 보세요.');$('essay-question').textContent='다음 질문: '+(e.socraticQuestion||'다른 입장의 이유에는 어떻게 답할까요?');$('essay-feedback').hidden=false;$('essay-status').textContent=e.assessmentLimited?'글을 기록했습니다. AI 응답 대신 기본 도움말을 표시합니다.':'글을 기록하고 피드백을 받았습니다.';
    }catch(e){$('essay-status').textContent=e.message+' 글은 화면에 그대로 있습니다.';}
    finally{busy=false;$('submit-essay-btn').disabled=false;$('generate-questions-btn').disabled=false;Object.values(goal).forEach(n=>n.disabled=false);currentInputs().forEach(n=>n.readOnly=false);window.TopicCatalog.lock(false);}
  });
})();
