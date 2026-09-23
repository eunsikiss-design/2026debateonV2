/* Shared HUD, navigation, input states, and responsive behavior. No AI or auth simulation. */
(() => {
  const routes = {
    basic: '/stitch_screens/05_ai_basic_practice.html', advanced: '/stitch_screens/06_ai_advanced_practice.html',
    speech: '/stitch_screens/08_speech_timer_training.html', growth: '/stitch_screens/07_competency_report.html',
    battle: '/stitch_screens/09_class_debate_battle.html', auth: '/stitch_screens/04_login_signup.html'
  };
  const page = document.body.dataset.screen || 'basic';
  const titles = {
    basic: ['01 / BASIC PRACTICE','짧게 쓰고, 깊게 생각하기','나의 주장부터 시작해 보세요. 소크라 AI는 생각을 대신하지 않고 다음 질문을 건넵니다.'],
    advanced: ['02 / ADVANCED WRITING','생각을 하나의 논증으로','주장, 근거, 반론을 연결하는 세 문단. 내 언어로 논리를 완성합니다.'],
    speech: ['03 / SPEECH LAB','생각을 목소리로','주어진 시간 안에 핵심을 분명하게. 나만의 속도로 말하기를 연습하세요.'],
    growth: ['04 / GROWTH MATRIX','비교보다, 나의 변화','실제 수행 근거를 바탕으로 다섯 가지 역량의 변화를 살펴봅니다.'],
    battle: ['CLASSROOM / DEBATE ARENA','서로의 생각을 잇는 토론','사람이 아닌 논거를 검토하세요. 다른 관점에서 질문하고, 근거로 답합니다.'],
    auth: ['ACCESS / DEBATEON','생각이 연결되는 곳','통합사회 토론·논술 학습 공간에 오신 것을 환영합니다.']
  };
  function element(tag, cls, text) {
    const node = document.createElement(tag); if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text; return node;
  }
  function icon(name) { const node = element('span', 'material-symbols-outlined', name); node.setAttribute('aria-hidden','true'); return node; }
  const skip = element('a','cyber-skip','본문으로 건너뛰기'); skip.href='#main-content';document.body.prepend(skip);
  const header = document.querySelector('body > header');
  if (header) {
    const old = element('div','legacy-header'); while(header.firstChild) old.append(header.firstChild); header.append(old);
    const hud=element('div','hud-header'); const brand=element('a','hud-brand');brand.href=routes.basic;
    const word=element('span');word.append('Debate',element('b','','On'));brand.append(word,element('small','','THINK · SPEAK · CONNECT'));
    const actions=element('div','hud-actions'); const battle=element('a','hud-battle');battle.href=routes.battle;
    battle.append(icon('swords'),element('span','',page==='battle'?'배틀룸':'배틀룸 입장'));actions.append(battle);const evidence=element('a','hud-battle');evidence.href='/stitch_screens/11_evidence_library.html';evidence.textContent='근거 자료';actions.prepend(evidence);hud.append(brand,actions);header.append(hud);
    const notice=document.querySelector('body > aside[role=status]');
    if(notice) {notice.removeAttribute('style');notice.className='preview-notice';notice.textContent='서비스 연결 상태를 확인하고 있습니다.';header.after(notice);}
  }
  const main=document.querySelector('main'); if(!main)return;
  main.id='main-content';main.setAttribute('tabindex','-1');
  const layout=main.querySelector(':scope > div');if(layout)layout.classList.add('content-layout');
  const intro=element('section','page-intro');const introText=element('div');const title=titles[page];
  introText.append(element('span','tech-label',title[0]),element('h1','',title[1]),element('p','',title[2]));
  intro.append(introText,element('span','intro-index','UNIT 02 / 통합사회2'));main.prepend(intro);

  document.querySelectorAll('body > nav').forEach(n=>n.remove());
  const nav=element('nav','cyber-nav');nav.setAttribute('aria-label','학습 메뉴');
  [['basic','edit_note','기초 연습'],['advanced','article','심화 논술'],['speech','mic','스피치'],['growth','radar','역량 분석']].forEach(([key,symbol,label])=>{
    const a=element('a','cyber-nav-link');a.href=routes[key];if(page===key)a.setAttribute('aria-current','page');a.append(icon(symbol),element('span','',label));nav.append(a);
  });document.body.append(nav);

  const state=element('section','connection-state');state.setAttribute('role','status');state.setAttribute('aria-live','polite');
  const stateCopy=element('div');const stateHeading=element('strong','','CHECKING CONNECTION');const stateMessage=element('span','','학습 서비스 상태를 확인하고 있습니다.');stateCopy.append(stateHeading,stateMessage);
  const retry=element('button','','다시 확인');retry.type='button';state.append(stateCopy,retry);intro.after(state);
  let checking=false;let signedIn=false;let reconnectTimer;let automaticRetries=0;
  async function checkConnection() {
    if(checking)return;checking=true;retry.disabled=true;state.setAttribute('aria-busy','true');
    stateHeading.textContent='CONNECTING';stateMessage.textContent='학습 서비스 상태를 확인하고 있습니다.';
    try {
      const res=await fetch('/api/health',{signal:AbortSignal.timeout(5000)});if(!res.ok)throw new Error('Unavailable');
      automaticRetries=0;clearTimeout(reconnectTimer);const info=await res.json();if(info.authentication==='firebase_session'){const me=await fetch('/api/auth/me');if(me.ok){const data=await me.json();if(data.user.role==='student'&&data.user.onboardingComplete===false){location.href='/stitch_screens/04_login_signup.html?onboarding=1';return;}signedIn=true;stateHeading.textContent='CONNECTED';stateMessage.textContent=(data.user.name||'사용자')+'님 · '+(data.user.role==='teacher'?'교사':'학생')+' 세션으로 연결되었습니다.';if(notice)notice.textContent='운영 서비스 연결됨 · 학습 기록이 안전하게 저장됩니다.';}else{stateHeading.textContent='SIGN IN REQUIRED';stateMessage.textContent='AI 분석과 기록 저장을 사용하려면 로그인하세요.';if(notice)notice.textContent='운영 서비스 연결됨 · 로그인 후 AI 분석과 기록 저장을 사용할 수 있습니다.';}}
      else{stateHeading.textContent='PREVIEW MODE';stateMessage.textContent='글 작성과 타이머를 둘러볼 수 있어요. Firebase Authentication 활성화 후 로그인과 기록 저장을 사용할 수 있습니다.';if(notice)notice.textContent='미리보기 · 실제 인증과 학습 기록은 연결 전입니다.';}
    } catch {stateHeading.textContent=navigator.onLine?'RECONNECTING':'OFFLINE';stateMessage.textContent=navigator.onLine?'서버가 다시 연결되는 중입니다. 작성 중인 내용은 유지됩니다.':'인터넷 연결을 확인해 주세요. 작성 중인 내용은 유지됩니다.';if(notice)notice.textContent=stateMessage.textContent;if(navigator.onLine&&automaticRetries<3){automaticRetries+=1;clearTimeout(reconnectTimer);reconnectTimer=setTimeout(checkConnection,automaticRetries*2000);}}
    finally{retry.disabled=false;state.removeAttribute('aria-busy');checking=false;}
  }
  retry.addEventListener('click',()=>{automaticRetries=0;clearTimeout(reconnectTimer);checkConnection();});window.addEventListener('online',()=>{automaticRetries=0;checkConnection();});window.addEventListener('offline',checkConnection);checkConnection();
  const toast=element('div','cyber-toast');toast.hidden=true;toast.setAttribute('role','status');document.body.append(toast);let toastTimer;
  function inform(message) {toast.textContent=message;toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},6500);}
  const protectedActions=new Set(['request-eval-btn','submit-essay-btn','send-msg-btn','finish-debate-btn','save-obs-btn','final-submit-badge-btn']);
  document.addEventListener('click',event=>{const b=event.target.closest('button');if(b&&protectedActions.has(b.id)&&!signedIn){
    event.preventDefault();event.stopImmediatePropagation();inform('로그인 후 AI 분석·전송·저장을 사용할 수 있습니다. 입력 내용은 이 화면에 유지됩니다.');
  }},true);
  document.querySelectorAll('.material-symbols-outlined').forEach(i=>i.setAttribute('aria-hidden','true'));
  document.querySelectorAll('button').forEach(b=>{if(!b.getAttribute('aria-label')&&!b.textContent.replace(/\s/g,'').replace(/^[a-z_]+$/,'').length)b.setAttribute('aria-label',b.title||'추가 정보');});
  document.querySelectorAll('textarea,input,select').forEach((input,index)=>{
    if(!input.id)input.id='cyber-input-'+index;
    if(!input.labels?.length&&!input.getAttribute('aria-label'))input.setAttribute('aria-label',input.placeholder||({ 'topic-select':'연습 논제 선택','target-student-select':'답변할 학생 선택' }[input.id])||'학습 입력');
  });
  const nodes=[['input-claim','01 / CLAIM','주장'],['input-reason','02 / REASONING','이유와 근거'],['input-rebuttal','03 / SYNTHESIS','반론 검토와 결론']];
  nodes.forEach(([id,technical,label])=>{
    const input=document.getElementById(id);if(!input)return;input.value='';input.setAttribute('aria-label',label);
    const panel=input.parentElement;panel.classList.add('logic-module','cyber-panel');
    const hud=element('div','node-status');const value=element('strong','','READY');hud.append(element('span','','NODE '+technical),value);panel.prepend(hud);
    const update=()=>{value.textContent=input.value.trim()?`${Array.from(input.value).length} CHARS · 작성 중`:'READY';};input.addEventListener('input',update);
  });
  if(page==='basic') {
    const coach=element('section','cyber-panel cyber-coach-empty');coach.append(element('span','tech-label','SOCRA AI / THINK FIRST'),element('h2','','먼저, 나의 생각을 적어보세요'),element('p','','AI는 완성된 답안을 대신 작성하지 않습니다. 주장과 근거를 연결한 뒤 도움을 요청하세요.'));
    if(layout)layout.append(coach);
  }
  if(page==='advanced') {
    const input=document.getElementById('essay-input');if(input){input.value='';input.placeholder='문제 제기와 주장 → 핵심 논거와 근거 → 반론 검토와 결론. 세 문단으로 생각을 연결해 보세요.';input.rows=12;input.setAttribute('aria-label','세 문단 논술 작성');}
    const workspace=document.getElementById('essay-workspace');
    if(workspace&&input){
      const progress=workspace.firstElementChild;progress.className='hud-segments';progress.replaceChildren();
      const counters=['주장 / 문제 제기','논거 / 근거','반론 / 결론'].map((label,index)=>{const p=element('div','hud-segment');const count=element('span','','0자 · READY');p.append(element('strong','',`P0${index+1}`),element('div','',label),count);progress.append(p);return count;});
      const update=()=>{const paragraphs=input.value.split(/\n\s*\n/).filter(p=>p.trim());counters.forEach((n,i)=>{n.textContent=`${Array.from(paragraphs[i]||'').length}자 · ${paragraphs[i]?'작성 중':'READY'}`;});const total=document.getElementById('char-count');if(total)total.textContent=Array.from(input.value).length;};input.addEventListener('input',update);update();
      const count=document.getElementById('char-count');if(count){const node=count.parentElement;node.replaceChildren(count,document.createTextNode(' / 600~800자 권장'));}
    }
    const level=document.getElementById('overall-level-badge');if(level)level.textContent='분석 대기';
    const completion=document.getElementById('completion-rate-text');if(completion)completion.textContent='이번 응답 분석 · 아직 결과가 없습니다';
    ['claim','concept','rebuttal'].forEach(key=>{const grade=document.getElementById(`rubric-${key}-grade`);const desc=document.getElementById(`rubric-${key}-desc`);if(grade)grade.textContent='—';if(desc)desc.textContent='작성한 논증을 바탕으로 확인할 항목입니다. 인증 연결 후 분석할 수 있습니다.';});
  }
  if(page==='speech') {
    const ring=document.getElementById('timer-digits');if(ring){const display=ring.closest('.relative');if(display){const waveform=element('div','waveform-hud');waveform.setAttribute('aria-label','마이크 미연결 · 장식용 파형');for(let i=0;i<25;i++)waveform.append(element('i'));display.after(waveform);}}
  }
  if(page==='battle') {
    const dock=document.querySelector('body > aside:not([role=status])');if(dock){dock.classList.add('warp-console');dock.prepend(element('div','tech-label','WARP CONSOLE / 내 논증 작성'));}
    const input=document.getElementById('argumentInput');if(input){input.maxLength=300;input.setAttribute('aria-label','토론 발언 작성, 최대 300자');}
    const oracle=element('section','cyber-panel oracle-panel');const text=element('div');text.append(element('span','tech-label','SOCRA AI ORACLE'),element('p','','사용 — / 3 · 세션 연결 전 · 질문과 근거 방향 안내'));
    const button=element('button','neon-button','도움 안내');button.type='button';button.addEventListener('click',()=>inform('Oracle은 논리의 빈틈, 빠진 근거, 질문 방향을 안내합니다. 실제 세션 연결 전에는 사용 횟수를 차감하지 않습니다.'));
    oracle.append(text,button);state.after(oracle);
    ['sum-clash','sum-pro','sum-con','sum-question'].forEach(id=>{const n=document.getElementById(id);if(n)n.textContent='실제 발언이 쌓이면 분석할 수 있습니다.';});
    const summaryButton=document.getElementById('summary-toggle-icon');if(summaryButton)summaryButton.setAttribute('aria-label','쟁점 요약 펼치기 또는 접기');
    const timer=document.getElementById('serverTimer');if(timer)timer.textContent='대기';
    const members=document.getElementById('room-members-count');if(members)members.textContent='세션 연결 전 · 예시 화면';
    const heading=document.getElementById('author-name-tag');if(heading)heading.textContent='내 생각을 작성하세요 · 전송 연결 전';
  }

  document.getElementById('topic-select')?.parentElement.classList.add('topic-toolbar');
  if(page==='growth'){
    if(layout){layout.hidden=true;layout.setAttribute('aria-hidden','true');}
    const empty=element('div','growth-empty');
    const matrix=element('section','cyber-panel');matrix.append(element('span','tech-label','GROWTH MATRIX / NO DATA'),element('h2','','나의 다섯 가지 역량'),element('p','','아직 분석할 수행 기록이 없습니다. 기록이 쌓이면 각 역량의 변화와 근거를 함께 보여드립니다.'));
    const axes=element('div','growth-axes');['개념 활용','논거 타당성','논리 구조화','반론 대응','전달 및 표현'].forEach(label=>{const row=element('div');row.append(element('span','',label),element('strong','','—'));axes.append(row);});const grid=document.createElementNS('http://www.w3.org/2000/svg','svg');grid.setAttribute('viewBox','0 0 300 240');grid.setAttribute('role','img');grid.setAttribute('aria-label','오각형 역량 분석 격자. 수행 기록이 없어 점수는 표시되지 않습니다.');grid.classList.add('radar-empty');
    [1,.75,.5,.25].forEach(scale=>{const polygon=document.createElementNS(grid.namespaceURI,'polygon');polygon.setAttribute('points',Array.from({length:5},(_,i)=>{const a=-Math.PI/2+i*2*Math.PI/5;return (150+100*scale*Math.cos(a))+','+(120+100*scale*Math.sin(a));}).join(' '));polygon.setAttribute('fill','none');polygon.setAttribute('stroke','#00f2fe');polygon.setAttribute('stroke-opacity','.24');grid.append(polygon);});
    const label=document.createElementNS(grid.namespaceURI,'text');label.setAttribute('x','150');label.setAttribute('y','125');label.setAttribute('text-anchor','middle');label.setAttribute('fill','#b6c3d4');label.textContent='기록 대기';grid.append(label);matrix.append(grid,axes);
    const history=element('section','cyber-panel');history.append(element('span','tech-label','LEARNING TIMELINE'),element('h2','','첫 기록을 기다리고 있어요'),element('p','','인증과 저장 연결 후, 기초 연습부터 심화 논술과 토론까지 나의 학습 이력을 확인할 수 있습니다.'));
    const start=element('a','neon-button','기초 연습으로 이동');start.href=routes.basic;history.append(start);empty.append(matrix,history);main.append(empty);
  }
  if(page==='advanced'){
    const speech=document.getElementById('speech-workspace');if(speech){speech.replaceChildren(element('section','cyber-panel','음성 인식은 아직 연결되지 않았습니다. 스피치 탭에서 타이머로 연습할 수 있습니다.'));}
    document.querySelectorAll('button').forEach(b=>{if(/작성 가이드|작성가이드/.test(b.textContent))b.addEventListener('click',()=>inform('문단 사이를 한 줄 비워 주장, 근거, 반론과 결론을 작성하세요. 전체 600~800자를 권장합니다.'));if(b.textContent.includes('임시저장'))b.addEventListener('click',()=>inform('기록 저장은 인증 연결 후 사용할 수 있습니다. 현재 글은 화면을 나가면 유지되지 않습니다.'));});
  }
  if(page==='speech'){
    const options=[...document.querySelectorAll('input[type=checkbox]')];options.slice(0,2).forEach(c=>{c.checked=false;c.disabled=true;});if(options[2])options[2].id='notification-toggle';
  }
  // Account for the mobile visual viewport instead of covering the software keyboard.
  if(window.visualViewport){let baseHeight=window.visualViewport.height;const viewport=()=>{const v=window.visualViewport;const focused=/INPUT|TEXTAREA/.test(document.activeElement?.tagName||'');const open=focused&&baseHeight-v.height>120;document.body.classList.toggle('keyboard-open',open);document.documentElement.style.setProperty('--keyboard-inset',open?`${Math.max(0,window.innerHeight-v.height-v.offsetTop)}px`:'0px');};window.visualViewport.addEventListener('resize',viewport);document.addEventListener('focusin',viewport);document.addEventListener('focusout',()=>setTimeout(viewport,0));window.addEventListener('orientationchange',()=>{baseHeight=window.visualViewport.height;});}
})();

