(() => {
 const root=document.getElementById('student-record-workspace');if(!root)return;
 const el=(tag,text,cls)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;};
 const status=el('p','학생을 선택하면 작성 글과 토론 발언을 모아 볼 수 있습니다.','record-status');status.setAttribute('role','status');
 const select=el('select'),selectLabel=el('label','검토할 학생'),reload=el('button','기록 새로 불러오기');select.id='record-student-select';selectLabel.append(select);reload.type='button';
 const toolbar=el('div',undefined,'record-toolbar');toolbar.append(selectLabel,reload);
 const badge=el('p','', 'record-test-notice');badge.hidden=true;
 const layout=el('div',undefined,'record-layout'),left=el('section'),right=el('section');left.setAttribute('aria-label','학생 원문 선택');right.setAttribute('aria-label','기록 분석과 세특 초안');
 const kind=el('select'),filterLabel=el('label','활동 보기');for(const [value,label] of [['','전체 활동'],['basic','기초 논리 연습'],['advanced','심화 논술'],['speech','스피치 전사'],['debate','토론 발언'],['observation','교사 관찰']])kind.add(new Option(label,value));filterLabel.append(kind);
 const topic=el('select'),topicLabel=el('label','주제 보기');topicLabel.append(topic);
 const all=el('button','보이는 기록 선택'),none=el('button','선택 해제'),count=el('p','선택 0건'),sourcesBox=el('div',undefined,'record-sources');
 const filters=el('div',undefined,'record-toolbar');filters.append(filterLabel,topicLabel,all,none);left.append(el('h3','학생이 남긴 기록'),filters,count,sourcesBox);
 const generate=el('button','선택 기록 분석 · 세특 초안 만들기','neon-button'),analysisBox=el('div',undefined,'record-analysis'),draft=el('textarea'),draftLabel=el('label','세특 초안 · 교사 수정'),meter=el('p'),reviewed=el('input'),reviewLabel=el('label',undefined,'record-review-check');
 draft.id='record-draft';draft.rows=10;draft.maxLength=10000;draftLabel.append(draft);reviewed.type='checkbox';reviewLabel.append(reviewed,document.createTextNode('원문과 대조하여 수정한 내용을 검토했습니다.'));
 const save=el('button','초안 저장','neon-button'),copy=el('button','본문 복사'),actions=el('div',undefined,'record-toolbar');actions.append(save,copy);
 const downloads=el('div',undefined,'record-toolbar'),excel=el('button','엑셀 다운로드'),pdf=el('button','PDF 다운로드');downloads.append(excel,pdf);
 const sheetPanel=el('section',undefined,'record-sheet-panel'),sheetStatus=el('p'),sheetLink=el('a','연결된 Google 시트 열기'),sheetSettings=el('details'),sheetURL=el('input'),urlLabel=el('label','Google 스프레드시트 URL'),account=el('p'),connect=el('button','시트 연결'),disconnect=el('button','연결 해제'),sync=el('button','저장한 세특 지금 연동');
 sheetStatus.setAttribute('role','status');sheetLink.target='_blank';sheetLink.rel='noopener noreferrer';sheetLink.hidden=true;sheetURL.type='url';sheetURL.placeholder='https://docs.google.com/spreadsheets/d/…';urlLabel.append(sheetURL);const sheetActions=el('div',undefined,'record-toolbar');sheetActions.append(connect,disconnect);
 sheetSettings.append(el('summary','Google Sheets 연결 설정'),account,urlLabel,sheetActions);sheetPanel.append(el('h3','세특 Google Sheets 연동'),sheetStatus,sheetLink,sync,sheetSettings,el('p','교사 검토를 완료한 세특은 저장 시 자동 연동됩니다. 시트는 학생별 한 행으로 갱신되며, 시트에서 수정한 내용은 앱으로 가져오지 않습니다. 가상 학생은 별도의 연동시험 탭을 사용합니다.','teacher-note'));
 right.append(el('h3','분석에서 세특으로'),generate,analysisBox,draftLabel,meter,reviewLabel,actions,downloads,el('p','파일에는 저장한 세특·분석·피드백·선택한 원문 근거가 포함됩니다. 수정 중인 내용은 먼저 저장하세요.','teacher-note'),sheetPanel,el('p','작성한 내용은 교사용 초안으로 저장됩니다. 학교생활기록부에 자동 제출되지 않습니다.','teacher-note'));
 layout.append(left,right);root.append(toolbar,status,badge,layout);
 let portfolio=null,selected=new Set(),binding=null,revision=0,busy=false,dirty=false,ticket=0,students=[],sheetState=null;
 const message=text=>status.textContent=text;
 async function api(url,options){const response=await fetch(url,{cache:'no-store',...options}),data=await response.json();if(!response.ok)throw Error(data.message||data.error||'요청을 처리하지 못했습니다.');return data;}
 const visible=()=>portfolio?.sources.filter(s=>(!kind.value||s.kind===kind.value)&&(!topic.value||s.topicId===topic.value))||[];
 function controls(){select.disabled=busy||!students.length;reload.disabled=busy||!select.value;generate.disabled=busy||!selected.size;save.disabled=busy||!binding||!draft.value.trim();copy.disabled=busy||!draft.value.trim();reviewed.disabled=busy||!binding||portfolio?.student.isTestAccount===true;draft.disabled=busy||!portfolio;all.disabled=none.disabled=kind.disabled=topic.disabled=busy||!portfolio;sourcesBox.querySelectorAll('input').forEach(c=>c.disabled=busy);excel.disabled=pdf.disabled=busy||dirty||!portfolio?.saved;connect.disabled=busy;disconnect.disabled=busy||!sheetState?.connected;sync.disabled=busy||dirty||!sheetState?.connected||!portfolio?.saved||(!portfolio.student.isTestAccount&&portfolio.saved.status!=='teacher-reviewed');sheetURL.disabled=busy;}
 function showSheet(state){sheetState=state;document.dispatchEvent(new CustomEvent('teacher-record-sheet-change',{detail:state}));sheetLink.hidden=!state.connected;if(state.spreadsheetUrl){sheetLink.href=state.spreadsheetUrl;sheetURL.value=state.spreadsheetUrl;}
  account.textContent=state.serviceAccountEmail?`시트의 공유 메뉴에서 ${state.serviceAccountEmail}을 편집자로 추가한 뒤 연결하세요.`:'서버에 Google 서비스 계정 이메일과 키를 설정해야 연결할 수 있습니다.';
  const s=state.sync;sheetStatus.textContent=!state.connected?'아직 연결된 Google 시트가 없습니다.':s?.status==='synced'&&s.revision===revision?`저장 버전 ${s.revision} 연동 완료 · ${s.sheetTitle} · ${new Date(s.syncedAt).toLocaleString('ko-KR')}`:s?.status==='pending'?`연동 대기: ${s.message}`:portfolio?.saved?'시트가 연결되어 있습니다. 현재 저장 버전은 아직 연동되지 않았습니다.':'시트가 연결되어 있습니다. 검토한 세특을 저장하면 자동 연동됩니다.';controls();}
 async function loadSheet(own=ticket){try{const result=await api('/api/teacher/record-sheets'+(portfolio?'?studentId='+encodeURIComponent(portfolio.student.uid):''));if(own===ticket)showSheet(result);}catch(e){if(own===ticket){sheetState=null;sheetStatus.textContent=e.message;controls();}}}
 function meterUpdate(){meter.textContent=`${Array.from(draft.value).length}자 · UTF-8 ${new TextEncoder().encode(draft.value).length}바이트${dirty?' · 저장 전 수정 있음':''}`;controls();}
 function changeSelection(){binding=null;reviewed.checked=false;count.textContent=`선택 ${selected.size}건 / 최대 30건`;if(draft.value)message('선택 근거가 바뀌었습니다. 현재 글은 유지되며, 새 초안을 만든 뒤 저장할 수 있습니다.');controls();}
 function renderSources(){
  sourcesBox.replaceChildren();count.textContent=`전체 ${portfolio?.sources.length||0}건 · 선택 ${selected.size}건 / 최대 30건`;
  for(const s of visible()){
   const card=el('article',undefined,'record-source'),label=el('label'),check=el('input'),details=el('details'),summary=el('summary','원문 펼치기'),text=el('div',s.text,'record-original');check.type='checkbox';check.checked=selected.has(s.id);check.setAttribute('aria-label',`${s.label} · ${s.title} 선택`);
   check.addEventListener('change',()=>{if(check.checked&&selected.size>=30){check.checked=false;message('최대 30건을 선택할 수 있습니다.');return;}check.checked?selected.add(s.id):selected.delete(s.id);changeSelection();});
   const date=s.createdAt&&Number.isFinite(Date.parse(s.createdAt))?new Date(s.createdAt).toLocaleString('ko-KR'):'날짜 미등록';label.append(check,document.createTextNode(s.label+' · '+s.title));card.append(label,el('small',date));details.id='record-source-'+s.id;details.append(summary,text);card.append(details);sourcesBox.append(card);
  }
  if(!sourcesBox.children.length)sourcesBox.append(el('p',portfolio?.sources.length?'조건에 맞는 기록이 없습니다.':'아직 학생이 작성한 내용이 없습니다. 활동 횟수만으로 세특을 만들지 않습니다.','teacher-empty'));controls();
 }
 function refs(items,parent){for(const ref of items||[]){const s=portfolio.sources.find(s=>s.id===ref.sourceId);if(!s)continue;const quote=el('blockquote',ref.quote),link=el('button',`${s.label} 원문 확인`);link.type='button';link.addEventListener('click',()=>{kind.value='';topic.value='';renderSources();const target=document.getElementById('record-source-'+s.id);target.open=true;target.scrollIntoView({block:'center',behavior:'smooth'});});quote.append(link);parent.append(quote);}}
 function showAnalysis(result){
  analysisBox.replaceChildren();if(!result)return;
  analysisBox.append(el('p',result.notice||'저장된 분석 근거입니다.','teacher-note'));
  for(const a of result.analysis||[]){const card=el('article');card.append(el('h4',a.competency),el('p',a.finding));refs(a.evidence,card);analysisBox.append(card);}
  for(const a of result.integratedThinking||[]){const card=el('article');card.append(el('h4',a.perspective+' · '+(a.status==='observed'?'근거 확인':'추가 확인')),el('p',a.finding),el('p','다음 탐구: '+a.nextStep));refs(a.evidence,card);analysisBox.append(card);}
  for(const a of result.feedback||[]){const card=el('article');card.append(el('h4','토론 피드백 · '+a.focus),el('p',a.finding),el('p','다음 활동: '+a.nextStep));refs(a.evidence,card);analysisBox.append(card);}
  const sentences=el('details'),summary=el('summary','생성 당시 문장별 근거');sentences.append(summary,el('p','교사가 문장을 수정한 뒤에는 아래 인용과의 연결도 다시 확인하세요.'));
  for(const s of result.sentences||[]){const card=el('article');card.append(el('p',s.text));refs(s.evidence,card);sentences.append(card);}analysisBox.append(sentences);
 }
 function discard(){return !dirty||window.confirm('저장하지 않은 초안 수정 내용이 있습니다. 저장하지 않고 이동할까요?');}
 async function load(uid){
  const own=++ticket;busy=true;portfolio=null;selected=new Set();binding=null;draft.value='';analysisBox.replaceChildren();sourcesBox.replaceChildren();badge.hidden=true;revision=0;dirty=false;reviewed.checked=false;controls();message('학생의 원문 기록을 불러오고 있습니다.');
  try{
   const data=await api('/api/teacher/student-record?studentId='+encodeURIComponent(uid));if(own!==ticket)return;portfolio=data;select.value=uid;
   kind.value='';topic.replaceChildren(new Option('전체 주제',''));for(const [id,title] of new Map(data.sources.filter(s=>s.topicId).map(s=>[s.topicId,s.title])))topic.add(new Option(title,id));
   selected=new Set(data.saved?.evidenceIds||data.sources.slice(0,30).map(s=>s.id));selected=new Set([...selected].filter(id=>data.sources.some(s=>s.id===id)));revision=data.saved?.revision||0;
   badge.hidden=!data.student.isTestAccount;badge.textContent='가상 학생의 시험용 기록입니다. 실제 학생의 세특으로 확정하지 않습니다.';
   if(data.saved){draft.value=data.saved.draftText;binding={evidenceIds:data.saved.evidenceIds,evidenceFingerprint:data.saved.evidenceFingerprint,generationId:data.saved.generated?.generationId};reviewed.checked=data.saved.reviewed===true;showAnalysis(data.saved.generated);message(`저장된 ${data.saved.status==='teacher-reviewed'?'교사 검토본':'초안'}을 불러왔습니다. 새 분석은 버튼을 눌러 진행하세요.`);}
   else message(data.sources.length?'원문을 확인하고 분석에 사용할 기록을 선택하세요.':'작성한 기록이 없어 분석할 수 없습니다.');
   renderSources();await loadSheet(own);
  }catch(e){if(own===ticket)message(e.message);}finally{if(own===ticket){busy=false;meterUpdate();}}
 }
 document.addEventListener('teacher-students-loaded',event=>{
  const previous=select.value,next=event.detail;students=next.students;select.replaceChildren();for(const s of students)select.add(new Option(`${s.studentNumber||'학번 없음'} · ${s.name||'이름 없음'}`,s.uid));
  const same=students.some(s=>s.uid===previous);if(same&&portfolio){select.value=previous;controls();return;}
  if(dirty){ // Keep an unfinished draft visible even after changing the dashboard class.
   select.add(new Option(`${portfolio.student.studentNumber} · 수정 중`,portfolio.student.uid));select.value=portfolio.student.uid;message('이전 학생의 수정 중인 초안을 유지했습니다. 저장한 뒤 다른 학생을 선택하세요.');controls();return;
  }
  if(students.length)load(select.value);else{++ticket;portfolio=null;binding=null;draft.value='';analysisBox.replaceChildren();sourcesBox.replaceChildren();busy=false;message('선택한 학급에 등록된 학생이 없습니다.');controls();}
 });
 document.addEventListener('teacher-review-student',event=>{if(event.detail.uid===portfolio?.student.uid)return;if(discard())load(event.detail.uid);});
 document.addEventListener('teacher-records-disconnected',()=>{++ticket;busy=false;message('교사 연결을 확인해 주세요. 작성한 내용은 유지됩니다.');select.disabled=save.disabled=generate.disabled=true;});
 select.addEventListener('change',()=>{if(discard())load(select.value);else select.value=portfolio?.student.uid||'';});
 reload.addEventListener('click',()=>{if(discard())load(select.value);});
 kind.addEventListener('change',renderSources);topic.addEventListener('change',renderSources);
 all.addEventListener('click',()=>{for(const s of visible())if(selected.size<30)selected.add(s.id);changeSelection();renderSources();});none.addEventListener('click',()=>{selected.clear();changeSelection();renderSources();});
 draft.addEventListener('input',()=>{dirty=true;reviewed.checked=false;meterUpdate();});reviewed.addEventListener('change',()=>{dirty=true;meterUpdate();});
 generate.addEventListener('click',async()=>{
  if(draft.value&&!window.confirm('현재 초안을 새 분석 결과로 바꿀까요? 저장한 초안은 다시 불러올 수 있습니다.'))return;
  const own=ticket,uid=portfolio.student.uid;busy=true;controls();message('선택한 원문을 분석하여 세특 초안을 만들고 있습니다.');
  try{const {draft:result}=await api('/api/teacher/generate-record',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({studentId:uid,evidenceIds:[...selected]})});if(own!==ticket)return;binding=result;draft.value=result.draftText;dirty=true;reviewed.checked=false;showAnalysis(result);message(result.source==='gemini-api'?'분석과 초안을 만들었습니다. 원문 근거를 확인하고 수정한 뒤 저장하세요.':result.notice);}
  catch(e){if(own===ticket)message(e.message);}finally{if(own===ticket){busy=false;meterUpdate();}}
 });
 save.addEventListener('click',async()=>{
  const own=ticket;busy=true;controls();message('초안을 저장하고 있습니다.');
  try{const {saved,sheetSync}=await api('/api/teacher/student-record',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({studentId:portfolio.student.uid,revision,draftText:draft.value,evidenceIds:binding.evidenceIds,evidenceFingerprint:binding.evidenceFingerprint,generationId:binding.generationId,reviewed:reviewed.checked})});if(own!==ticket)return;revision=saved.revision;portfolio.saved=saved;dirty=false;message('초안을 저장했습니다.'+(sheetSync?.message?' '+sheetSync.message:''));if(sheetSync)showSheet(sheetSync);else await loadSheet(own);}
  catch(e){if(own===ticket)message(e.message);}finally{if(own===ticket){busy=false;meterUpdate();}}
 });
 copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText((portfolio.student.isTestAccount?'[가상 학생 시험용 초안]\n':'')+draft.value);message('본문을 복사했습니다.');}catch{draft.focus();draft.select();message('복사할 본문을 선택했습니다. Ctrl/Cmd+C를 누르세요.');}});
 async function download(format){busy=true;controls();message(format.toUpperCase()+' 보고서를 만들고 있습니다.');try{const response=await fetch('/api/teacher/student-report?'+new URLSearchParams({studentId:portfolio.student.uid,revision,format}),{cache:'no-store'});if(!response.ok){const error=await response.json();throw Error(error.message||'다운로드에 실패했습니다.');}const url=URL.createObjectURL(await response.blob()),a=document.createElement('a');a.href=url;a.download=`${portfolio.student.isTestAccount?'시험용_':''}${portfolio.student.studentNumber||'학생'}_토론활동보고서_v${revision}.${format}`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);message('저장한 내용의 보고서를 다운로드했습니다.');}catch(e){message(e.message);}finally{busy=false;controls();}}
 excel.addEventListener('click',()=>download('xlsx'));pdf.addEventListener('click',()=>download('pdf'));
 async function sheetAction(action){busy=true;controls();sheetStatus.textContent='Google Sheets 연결을 처리하고 있습니다.';try{const state=await action();showSheet(state);if(state.message)message(state.message);}catch(e){sheetStatus.textContent=e.message;}finally{busy=false;controls();}}
 connect.addEventListener('click',()=>sheetAction(()=>api('/api/teacher/record-sheets',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({spreadsheetUrl:sheetURL.value})})));
 disconnect.addEventListener('click',()=>{if(window.confirm('이 학교의 자동 연동을 해제할까요? Google 시트의 기존 내용은 유지됩니다.'))sheetAction(()=>api('/api/teacher/record-sheets',{method:'DELETE'}));});
 sync.addEventListener('click',()=>sheetAction(()=>api('/api/teacher/record-sheets/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({studentId:portfolio.student.uid,revision})})));
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});controls();
})();
