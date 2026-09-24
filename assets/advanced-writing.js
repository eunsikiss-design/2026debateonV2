(() => {
  const $=id=>document.getElementById(id),ui=window.LearningUI;
  const goal={chars:$('target-chars'),sentences:$('target-sentences'),paragraphs:$('target-paragraphs')};
  const drafts=new Map();let active=null,busy=false,paragraphDrafts=[];
  const currentInputs=()=>[...document.querySelectorAll('.guided-paragraph textarea')];
  const clamp=(n,lo,hi,fallback)=>Number.isFinite(+n)?Math.min(hi,Math.max(lo,Math.round(+n))):fallback;
  const words=()=>window.TopicCatalog.current?.conceptDefinitions||[];
  function guidance(index,total){
    const qs=[
      '이 상황에서 나는 무엇을 주장하나요? 누구의 입장에서 판단하고, 첫 번째 이유는 무엇인가요?',
      '그 이유를 뒷받침하는 상황의 구체적인 부분은 무엇인가요? 핵심 개념의 뜻을 연결해 설명할 수 있나요?',
      '다르게 생각하는 사람은 무엇을 걱정할까요? 그 걱정에 답하고, 어떤 조건이라면 내 주장을 실행할 수 있을까요?'
    ];
    if(total===1)return '주장, 상황에서 찾은 이유, 다른 입장에 대한 답을 한 문단으로 연결해 보세요.';
    if(total===2)return index===0?qs[0]+' '+qs[1]:qs[2];
    if(index<3)return qs[index];
    return index===total-1?'앞에서 제시한 이유를 비교해 결론을 정리해 보세요.':'또 다른 이해관계자의 처지와 반례를 살펴보고 내 주장을 보완해 보세요.';
  }
  function counts(){
    const text=currentInputs().map(n=>n.value.trim()).filter(Boolean).join('\n\n');
    $('essay-input').value=text;
    const chars=Array.from(text).length,sentences=(text.match(/[^.!?。！？\n]+[.!?。！？]?/g)||[]).map(s=>s.trim()).filter(Boolean).length,paragraphs=text?text.split(/\n\s*\n/).length:0;
    $('essay-counts').textContent=`현재 글자 ${chars} / 목표 ${goal.chars.value}자 · 문장 ${sentences} / 목표 ${goal.sentences.value}문장 · 문단 ${paragraphs} / 목표 ${goal.paragraphs.value}문단`;
  }
  function build(){
    currentInputs().forEach((n,i)=>{paragraphDrafts[i]=n.value;});const count=clamp(goal.paragraphs.value,1,5,3);goal.paragraphs.value=count;
    const holder=$('paragraph-prompts');holder.replaceChildren();
    for(let i=0;i<count;i++){
      const box=ui.node('section',undefined,'guided-paragraph guided-form');
      box.append(ui.node('h3',`${i+1}문단`),ui.node('p',guidance(i,count)));
      const relevant=words().slice(i,i+2);
      box.append(ui.details('관련 핵심 교과 용어 · 필요할 때 보기',relevant.length?ui.concepts(relevant):ui.node('p','개념을 억지로 넣지 말고, 상황에서 찾은 이유를 자신의 말로 설명해 보세요.')));
      const label=ui.node('label',`${i+1}문단 쓰기`),field=ui.node('textarea');field.maxLength=10000;field.placeholder='질문에 답하며 자신의 문장으로 작성해 보세요.';field.value=paragraphDrafts[i]||'';field.addEventListener('input',()=>{paragraphDrafts[i]=field.value;counts();});label.append(field);box.append(label);holder.append(box);
    }
    counts();
  }
  function topicChange(){
    if(active)drafts.set(active,{goals:[goal.chars.value,goal.sentences.value,goal.paragraphs.value],paragraphs:[...paragraphDrafts]});
    active=window.TopicCatalog.current?.topicId||null;
    const draft=drafts.get(active);paragraphDrafts=[...(draft?.paragraphs||[])];$('paragraph-prompts').replaceChildren();
    [goal.chars.value,goal.sentences.value,goal.paragraphs.value]=draft?.goals||[600,12,3];
    build();
    $('topic-question').textContent=window.TopicCatalog.current?.essayPrompt||'주제를 선택해 주세요.';
    $('essay-feedback').hidden=true;$('essay-status').textContent='';counts();
  }
  window.TopicCatalog.ready.then(topicChange);window.addEventListener('curriculum-topic-change',topicChange);
  goal.paragraphs.addEventListener('change',build);[goal.chars,goal.sentences].forEach(n=>n.addEventListener('input',counts));
  $('submit-essay-btn').addEventListener('click',async()=>{
    if(busy)return;
    const parts=currentInputs().map(n=>n.value.trim());if(parts.some(p=>!p)){ $('essay-status').textContent='각 문단의 질문에 답한 뒤 글을 살펴보세요.';currentInputs()[parts.findIndex(p=>!p)].focus();return; }
    const plan={targetChars:clamp(goal.chars.value,100,10000,600),targetSentences:clamp(goal.sentences.value,1,100,12),targetParagraphs:parts.length};
    busy=true;$('submit-essay-btn').disabled=true;window.TopicCatalog.lock(true);$('essay-status').textContent='소크라AI가 글의 주장과 근거를 살펴보고 있습니다.';
    try{
      const r=await fetch('/api/practice/advanced/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topicId:window.TopicCatalog.current.topicId,studentDraft:$('essay-input').value,paragraphLevel:parts.length,writingPlan:plan})});
      const data=await r.json();if(!r.ok||!data.evaluation)throw Error(data.error||'글을 살펴보지 못했습니다.');
      const e=data.evaluation;$('essay-strength').textContent='잘한 점: '+(e.strengths?.[0]||'작성한 글을 확인했습니다.');$('essay-improvement').textContent='다듬을 점: '+(e.focusImprovement||'주장과 이유가 이어지는지 다시 읽어 보세요.');$('essay-question').textContent='다음 질문: '+(e.socraticQuestion||'다른 입장의 이유에는 어떻게 답할까요?');$('essay-feedback').hidden=false;$('essay-status').textContent='글을 기록하고 피드백을 받았습니다.';
    }catch(e){$('essay-status').textContent=e.message+' 글은 화면에 그대로 있습니다.';}
    finally{busy=false;$('submit-essay-btn').disabled=false;window.TopicCatalog.lock(false);}
  });
})();
