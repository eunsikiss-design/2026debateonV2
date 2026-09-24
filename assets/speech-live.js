(() => {
  const $=id=>document.getElementById(id);
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  $('speech-privacy').textContent='원본 음성은 저장하지 않고 전사문만 제출합니다.';
  let recognition=null,mediaStream=null,finalTranscript='',interimTranscript='',activeSeconds=0,startedAt=0,timer=null,state='READY',outlineReady=false,busy=false,topicId=null;
  let sources={},sourceTicket=0,sourceOriginal='',sourceContent=null;
  const text=(id)=>$(id).value.trim();
  function setState(next,message=''){
    state=next;$('speech-live-state').textContent=next;if(message)$('speech-message').textContent=message;
    $('start-btn').disabled=!outlineReady||busy||!(next==='READY'||next==='PAUSED');
    $('start-btn').textContent=next==='PAUSED'?'계속하기':'시작하기';
    $('pause-btn').disabled=busy||next!=='LISTENING';
    $('finish-btn').disabled=busy||!(next==='LISTENING'||next==='PAUSED');
    $('restart-btn').disabled=busy||!(next==='LISTENING'||next==='PAUSED'||next==='COMPLETE');
    const locked=['LISTENING','PAUSED','ANALYZING'].includes(next);window.TopicCatalog.lock(locked);document.querySelectorAll('#speech-source-panel input,#speech-source-panel textarea,#speech-source-panel select,#speech-source-panel button,#speech-preparation textarea,#speech-preparation button').forEach(n=>n.disabled=locked);
  }
  function renderTimer(){const seconds=activeSeconds+(state==='LISTENING'?Math.floor((Date.now()-startedAt)/1000):0);$('timer-digits').textContent=`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
  function renderTranscript(){const combined=(finalTranscript+' '+interimTranscript).trim();$('speech-transcript').textContent=combined||'말하기를 기다리고 있습니다.';$('speech-word-count').textContent=`${combined?combined.split(/\s+/).length:0}어절`;}
  function stopMedia(){mediaStream?.getTracks().forEach(track=>track.stop());mediaStream=null;}
  function stopRecognition(){try{recognition?.stop();}catch{}stopMedia();}
  function freezeTime(){if(state==='LISTENING'){activeSeconds+=Math.floor((Date.now()-startedAt)/1000);startedAt=Date.now();clearInterval(timer);renderTimer();}}
  async function listen(){
    if(!Recognition){setState(state,'이 브라우저는 음성 인식을 지원하지 않습니다. 최신 Chrome 또는 Edge를 사용해 주세요.');return;}
    if(!window.TopicCatalog.current){setState(state,'주제를 먼저 선택해 주세요.');return;}
    try{
      mediaStream=await navigator.mediaDevices.getUserMedia({ audio: true });
      recognition=new Recognition();recognition.lang = 'ko-KR';recognition.continuous=true;recognition.interimResults=true;
      recognition.onresult=event=>{interimTranscript='';for(let i=event.resultIndex;i<event.results.length;i++){const phrase=event.results[i][0].transcript.trim();if(event.results[i].isFinal)finalTranscript+=phrase+' ';else interimTranscript+=phrase;}renderTranscript();};
      recognition.onerror=event=>{freezeTime();setState('PAUSED',event.error==='not-allowed'?'마이크 권한을 허용해야 스피치할 수 있습니다.':'음성 인식이 중단되었습니다. 계속하기를 눌러 다시 말해 주세요.');stopMedia();};
      recognition.onend=()=>{if(state==='LISTENING'){try{recognition.start();}catch{freezeTime();stopMedia();setState('PAUSED','인식이 중단되었습니다. 계속하기를 눌러 주세요.');}}};
      recognition.start();startedAt=Date.now();setState('LISTENING','말하기를 시작했습니다.');timer=setInterval(renderTimer,250);
    }catch{stopMedia();setState('PAUSED','마이크 권한을 허용해야 스피치할 수 있습니다.');}
  }
  function outline(){
    const claim=text('speech-claim'),reason=text('speech-reason'),condition=text('speech-condition');
    if(!claim||!reason){$('speech-message').textContent='주장과 가장 중요한 이유에 먼저 답해 주세요.';(!claim?$('speech-claim'):$('speech-reason')).focus();return;}
    const node=$('speech-outline');node.replaceChildren();
    [['1. 나의 판단을 먼저 설명',claim],['2. 상황·개념과 이유 연결',reason],['3. 다른 입장에 답하고 마무리',condition||'반대 입장의 걱정과 필요한 조건을 설명합니다.']].forEach(([heading,value])=>{const part=document.createElement('section'),strong=document.createElement('h3'),list=document.createElement('ul');strong.textContent=heading;window.SpeechOutline.bullets(value).forEach(text=>{const li=document.createElement('li');li.textContent=text;list.append(li);});part.append(strong,list);node.append(part);});
    const guide=document.createElement('p');guide.textContent='내 글의 핵심 문장을 말할 순서로 정리했습니다. 문장을 그대로 읽기보다 각 항목의 이유를 자신의 말로 풀어서 설명합니다.';node.append(guide);
    node.hidden=false;outlineReady=true;setState(state,'개요를 보며 자신의 말로 스피치해 보세요.');
  }
  function reset(){
    clearInterval(timer);setState('READY','처음부터 다시 시작할 수 있습니다.');stopRecognition();recognition=null;activeSeconds=0;startedAt=0;finalTranscript='';interimTranscript='';$('speech-feedback').hidden=true;renderTimer();renderTranscript();
  }
  $('show-outline-btn').addEventListener('click',outline);
  async function loadSources(){const ticket=++sourceTicket;sources={};$('speech-source-status').textContent='같은 주제로 작성한 내 글을 찾고 있습니다.';try{const d=await window.LearningDrafts.fetch(topicId);if(ticket!==sourceTicket)return;for(const mode of ['basic','advanced'])sources[mode]=d.drafts[mode]?.content||d.previous.filter(p=>p.mode===mode).at(-1)?.content;const available=Object.keys(sources).filter(k=>sources[k]&&(k==='basic'?sources[k].reason:sources[k].paragraphs?.join('').trim()));if(available.length){$('speech-source-kind').value=available[0];$('speech-source-status').textContent=available.map(k=>k==='basic'?'기초 연습':'심화 논술').join(', ')+' 글이 있습니다. 활동을 고르고 내 글 불러오기를 누르세요.';}else $('speech-source-status').textContent='이 주제로 저장한 글이 없습니다. 기초 연습·심화 논술에서 작성하거나 아래에 직접 적을 수 있습니다.';}catch(e){if(ticket===sourceTicket)$('speech-source-status').textContent=e.message;}}
  $('speech-source-text').addEventListener('input',()=>{outlineReady=false;$('speech-outline').hidden=true;setState(state,'수정한 글로 개요를 다시 준비해 주세요.');});
  $('load-speech-source').addEventListener('click',()=>{const mode=$('speech-source-kind').value,d=sources[mode];if(!d){$('speech-source-status').textContent='이 활동의 저장된 글이 없습니다.';return;}if(text('speech-source-text')&&text('speech-source-text')!==sourceOriginal&&!confirm('현재 말하기 준비 글을 선택한 활동의 글로 바꿀까요?'))return;sourceContent=d;sourceOriginal=mode==='basic'?[d.claim,d.reason,d.rebuttal].filter(Boolean).join('\n\n'):d.paragraphs.filter(Boolean).join('\n\n');$('speech-source-text').value=sourceOriginal;outlineReady=false;$('speech-outline').hidden=true;setState(state);$('speech-source-status').textContent='내 글을 불러왔습니다. 수정하거나 그대로 사용한 뒤 이 글로 개요 준비를 누르세요.';});
  $('use-speech-source').addEventListener('click',()=>{const value=text('speech-source-text');if(!value){$('speech-source-status').textContent='말하기에 사용할 글을 먼저 불러오거나 적어 주세요.';return;}const parts=value===sourceOriginal&&sourceContent?.claim?{claim:sourceContent.claim,reason:sourceContent.reason,condition:sourceContent.rebuttal}:window.SpeechOutline.fromText(value);$('speech-claim').value=parts.claim;$('speech-reason').value=parts.reason;$('speech-condition').value=parts.condition;outlineReady=false;$('speech-outline').hidden=true;$('speech-source-status').textContent='내 글을 주장·이유·다른 의견 순서로 나눴습니다. 아래에서 내용의 역할을 확인하고 다듬을 수 있습니다.';outline();});
  ['speech-claim','speech-reason','speech-condition'].forEach(id=>$(id).addEventListener('input',()=>{outlineReady=false;$('speech-outline').hidden=true;setState(state);}));
  $('start-btn').addEventListener('click',listen);
  $('pause-btn').addEventListener('click',()=>{if(state!=='LISTENING')return;freezeTime();setState('PAUSED','일시 멈췄습니다. 계속하기를 누르면 이어서 말할 수 있습니다.');stopRecognition();});
  $('restart-btn').addEventListener('click',async()=>{reset();if(outlineReady)await listen();});
  $('finish-btn').addEventListener('click',async()=>{
    if(!['LISTENING','PAUSED'].includes(state)||busy)return;
    freezeTime();setState('ANALYZING','말한 내용을 확인하고 있습니다.');stopRecognition();busy=true;setState('ANALYZING');
    const transcript=(finalTranscript+' '+interimTranscript).trim();if(!transcript){busy=false;setState('PAUSED','기록된 말이 없습니다. 다시 시작해 주세요.');return;}
    try{
      const response=await fetch('/api/speech/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({topicId,transcript,durationSeconds:Math.max(1,activeSeconds),targetDurationSeconds:Number($('speech-target').value),outline:{claim:text('speech-claim'),reason:text('speech-reason'),condition:text('speech-condition')}})});
      const data=await response.json();if(response.status===401)throw Error('학생 계정 로그인이 필요합니다.');if(!response.ok||!data.evaluation)throw Error(data.error||'스피치 피드백을 받지 못했습니다.');
      const e=data.evaluation;$('speech-eval-praise').textContent='잘한 점: '+e.praise;$('speech-eval-growth').textContent='다음 연습: '+e.growthPoint;$('speech-eval-question').textContent='생각할 질문: '+e.nextSpeechChallenge;$('speech-feedback').hidden=false;busy=false;setState('COMPLETE','말하기 기록과 피드백을 저장했습니다.');
    }catch(e){busy=false;setState('PAUSED',e.message+' 전사문은 화면에 유지됩니다.');}
  });
  function changeTopic(){const next=window.TopicCatalog.current?.topicId||null;if(topicId===next)return;topicId=next;reset();outlineReady=false;sourceOriginal='';sourceContent=null;$('speech-source-text').value='';$('speech-outline').hidden=true;$('speech-claim').value='';$('speech-reason').value='';$('speech-condition').value='';$('topic-question').textContent=window.TopicCatalog.current?.question||'주제를 선택해 주세요.';setState('READY');if(topicId)loadSources();}
  window.addEventListener('curriculum-topic-change',changeTopic);window.TopicCatalog.ready.then(changeTopic);
  setState('READY');renderTimer();
})();
