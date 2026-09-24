(() => {
  let topics=[],current=null,lesson=null,locked=false,resolveReady,sequence=0;
  const ready=new Promise(r=>resolveReady=r);
  window.TopicCatalog={ready,lock(value){locked=value;document.querySelectorAll('#curriculum-unit,#curriculum-topic').forEach(s=>s.disabled=value);},get current(){return current;},get lesson(){return lesson;},get topics(){return topics;}};
  document.addEventListener('DOMContentLoaded',async()=>{
    const ui=window.LearningUI,main=document.querySelector('main'),hub=document.body.dataset.screen==='hub';
    const panel=ui.node('section',undefined,'learning-panel');panel.id='learning-selector';
    panel.innerHTML='<h2>단원과 주제 선택</h2><div class="learning-selectors"><label>단원<select id="curriculum-unit"></select></label><label>주제<select id="curriculum-topic"></select></label></div><div id="learning-topic-copy"></div><p id="curriculum-status" class="learning-status" role="status"></p>';
    main.append(panel);
    const unit=panel.querySelector('#curriculum-unit'),select=panel.querySelector('#curriculum-topic'),copy=panel.querySelector('#learning-topic-copy'),status=panel.querySelector('#curriculum-status');
    let activities;
    if(hub){activities=ui.node('section',undefined,'learning-panel');activities.id='activity-choice';main.append(activities);}
    async function pick(id){
      const ticket=++sequence;status.textContent='선택한 주제의 수업 자료를 불러오고 있습니다.';
      try{
        await window.LearningDrafts?.flushAll();
        const r=await fetch('/api/learning/topics/'+encodeURIComponent(id),{cache:'no-store'}),data=await r.json();
        if(!r.ok)throw Error(data.error||'수업 자료를 불러오지 못했습니다.');if(ticket!==sequence)return;
        lesson=data.lesson;current=lesson.topic;
        const index=topics.findIndex(t=>t.topicId===id);if(index>=0)topics[index]=current;

        try{sessionStorage.setItem('debateon-topic',id);}catch{}history.replaceState(null,'',location.pathname+'?topic='+encodeURIComponent(id));copy.replaceChildren();
        if(hub){copy.className='learning-topic-copy';copy.append(ui.node('p','토론 논제','learning-section-title'),ui.node('h3',current.question,'learning-question'),ui.node('p','논술 주제','learning-section-title'),ui.node('p',current.essayPrompt||current.question,'learning-question'),ui.node('h3','핵심 개념'),ui.node('p','단어를 누르면 쉬운 뜻풀이가 열립니다.'),ui.concepts(current.conceptDefinitions),ui.node('p',current.textbookRef,'source-note'));activities.replaceChildren(ui.node('span','다음 활동','learning-kicker'),ui.node('h2','이 주제로 무엇을 해 볼까요?'),ui.node('p','활동을 고르면 소크라AI가 질문과 도움말로 함께합니다. 내 생각을 먼저 쓰거나 말한 뒤 피드백을 받아 보세요.'),ui.activityCards(lesson));}
        else{
          const nav=ui.node('div',undefined,'activity-switch'),back=ui.node('a','← 주제·활동 선택으로');back.href='13_learning_hub.html?topic='+encodeURIComponent(id);nav.append(back);for(const a of lesson.activities){if(a.id===document.body.dataset.screen)continue;const link=ui.node('a',a.title+' →');link.href=a.href+'?topic='+encodeURIComponent(id);nav.append(link);}copy.append(nav);
          let context=document.getElementById('lesson-context');if(!context){context=ui.node('div');context.id='lesson-context';const q=document.getElementById('topic-question');if(q)q.after(context);else main.querySelector('.page-intro')?.after(context);}context.replaceChildren();
          if(document.body.dataset.screen==='advanced')context.append(ui.node('p','관련 토론 논제: '+current.question));
          context.append(ui.scenario(document.body.dataset.screen==='speech'?(lesson.speechScenario||lesson.scenario):lesson.scenario,['advanced','speech'].includes(document.body.dataset.screen)));
          if(document.body.dataset.screen==='basic'){
            const stance=ui.node('fieldset',undefined,'basic-stance');stance.innerHTML='<legend>나의 입장</legend><label><input type="radio" name="stance" value="pro" checked><span></span></label><label><input type="radio" name="stance" value="con"><span></span></label>';
            const options=lesson.scenario?.options||[];stance.querySelector('[value=pro]+span').textContent=options[0]?.label||'찬성';stance.querySelector('[value=con]+span').textContent=options[1]?.label||'반대';context.append(stance);
          }
          context.append(ui.details('개념 도움말 · 필요할 때 펼쳐 보기',ui.concepts(current.conceptDefinitions)));
          if(lesson.pedagogy){const guide=ui.node('div'),p=lesson.pedagogy;guide.append(ui.node('p','토론 목표: '+p.debateGoal),ui.node('p','논술 목표: '+p.essayGoal));for(const c of p.conceptApplications)guide.append(ui.node('p',c.term+' — '+c.application));guide.append(ui.node('p',p.textbookRef,'source-note'));context.append(ui.details('학습 목표·개념 적용·교과서 쪽수',guide));}
          if(document.body.dataset.screen==='basic')context.append(ui.details('이번 연습에서 살펴볼 점',ui.rubric(lesson.basicRubric)));
          const plan=lesson.activities.find(a=>a.id===document.body.dataset.screen);if(plan)context.append(ui.node('p','소크라AI 활동 계획: '+plan.plan,'learning-status'));
        }
        window.dispatchEvent(new CustomEvent('curriculum-topic-change',{detail:current}));document.querySelectorAll('.cyber-nav-link').forEach(a=>{if(/05_|06_|08_|13_/.test(a.href))a.search='?topic='+encodeURIComponent(id);});status.textContent='';
      }catch(e){if(ticket!==sequence)return;status.textContent=e.message+' 새로고침 후 다시 선택해 주세요.';if(current){unit.value=current.unit;fill(current.topicId);}else copy.textContent='로그인 상태와 연결을 확인해 주세요.';throw e;}
    }
    function fill(preferred){select.replaceChildren();topics.filter(t=>t.unit===unit.value).forEach(t=>select.add(new Option(t.title,t.topicId)));if(preferred)select.value=preferred;}
    unit.addEventListener('change',()=>{if(locked)return;fill();pick(select.value).catch(()=>{});});select.addEventListener('change',()=>{if(!locked)pick(select.value).catch(()=>{});});
    document.getElementById('tab-speak-btn')?.addEventListener('click',()=>{if(current)location.href='08_speech_timer_training.html?topic='+encodeURIComponent(current.topicId);});
    try{const r=await fetch('/api/learning/topics',{cache:'no-store'}),data=await r.json();if(!r.ok||!data.topics?.length)throw Error(r.status===401?'로그인 후 주제를 선택할 수 있습니다.':'주제를 불러오지 못했습니다.');topics=data.topics;[...new Set(topics.map(t=>t.unit))].forEach(u=>unit.add(new Option(u,u)));let saved;try{saved=sessionStorage.getItem('debateon-topic');}catch{}const first=topics.find(t=>t.topicId===(new URLSearchParams(location.search).get('topic')||saved))||topics[0];unit.value=first.unit;fill(first.topicId);await pick(first.topicId);resolveReady(topics);}catch(e){status.textContent=e.message;resolveReady([]);}
  });
})();
