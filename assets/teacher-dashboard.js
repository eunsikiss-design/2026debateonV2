(() => {
  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const state=$('#teacher-state'), toast=$('#teacher-toast'); let teacher=null, students=[],registrations=[];
  const pageTitles={overview:'학급 운영 대시보드',registration:'학생 가입 현황',students:'학생별 준비도',assignments:'수업 논제와 배틀 기준',battle:'실시간 토론 관찰',keywords:'핵심 단어 관리',materials:'40논제 수업 자료',rubric:'수행평가 기준',evidence:'교과 근거 라이브러리',growth:'학급 성장 근거',records:'세특 작성 지원',sync:'보고용 데이터 동기화'};
  function show(message){toast.textContent=message;toast.hidden=false;clearTimeout(show.t);show.t=setTimeout(()=>toast.hidden=true,5000);}
  function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  async function api(url,options){const res=await fetch(url,options);const body=await res.json().catch(()=>({}));if(!res.ok)throw Object.assign(new Error(body.message||body.error||'요청을 처리하지 못했습니다.'),{status:res.status});return body;}
  function view(name){$$('[data-view]').forEach(p=>p.hidden=p.dataset.view!==name);$$('#teacher-nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.panel===name?'page':'false'));$('#teacher-page-title').textContent=pageTitles[name]||pageTitles.overview;document.title=`DebateOn · ${pageTitles[name]||pageTitles.overview}`;$('#teacher-main').focus({preventScroll:true});}
  $$('#teacher-nav button').forEach(b=>b.addEventListener('click',()=>view(b.dataset.panel)));
  const rubric=['주장','근거','논리 연결','개념 활용','상대 이해','반론','재반론','표현'];rubric.forEach(label=>{const item=document.createElement('article');item.innerHTML=`<strong>${label}</strong><span>교사 확인</span>`;$('#rubric-grid').append(item);});
  function renderStudents(){const body=$('#student-rows');body.replaceChildren();$('#students-empty').hidden=students.length>0;students.forEach(s=>{const row=document.createElement('tr');row.innerHTML=`<td>${esc(s.name||'이름 미등록')}</td><td>${esc(s.studentNumber||'—')}</td><td>${Number(s.practiceCount)||0}회</td><td>${Number(s.badgeCount)||0}개</td><td>${s.isBattleReady?'준비':'추가 연습'}</td><td>${s.lastActive?new Date(s.lastActive).toLocaleDateString('ko-KR'):'—'}</td>`;body.append(row);});}
  function renderRegistrations(){
    const body=$('#registration-rows'),classValue=$('#teacher-class-select').value,query=$('#registration-search').value.trim().toLocaleLowerCase();
    body.replaceChildren();
    for(const item of registrations.filter(item=>`${item.grade}-${item.classId}`===classValue && (!query || [item.studentNumber,item.name,item.email].some(value=>String(value||'').toLocaleLowerCase().includes(query))))) {
      const row=document.createElement('tr');
      row.innerHTML=`<td>${esc(item.studentNumber)}</td><td>${esc(item.name||'전입생용 빈 자리')}</td><td>${esc(item.grade)}-${esc(item.classId)}</td><td>${item.registered?'완료':'대기'}</td><td>${esc(item.authProvider||'—')}</td><td>${item.email?`<span class="student-email">${esc(item.email)}</span>`:'—'}</td><td>${item.registeredAt?new Date(item.registeredAt).toLocaleDateString('ko-KR'):'—'}</td>`;
      body.append(row);
    }
    $('#registration-table-title').textContent=`${$('#teacher-class-select').selectedOptions[0]?.textContent||'선택한 학급'} 학생`;
    const complete=registrations.filter(item=>item.registered).length,total=registrations.length,rate=total?Math.round(complete/total*100):0;
    $('#registration-total').textContent=total;$('#registration-complete').textContent=complete;$('#registration-pending').textContent=total-complete;
    const overall=$('#registration-overall-gauge');overall.style.setProperty('--rate',`${rate}%`);overall.setAttribute('aria-valuenow',String(rate));$('#registration-overall-rate').textContent=`${rate}%`;$('#registration-overall-caption').textContent=`${complete}명 / ${total}명 가입 완료`;
    const groups=new Map();for(const item of registrations){const key=`${item.grade}-${item.classId}`;if(!groups.has(key))groups.set(key,{grade:item.grade,classId:item.classId,total:0,complete:0});const group=groups.get(key);group.total++;if(item.registered)group.complete++;}
    const charts=$('#registration-class-gauges');charts.replaceChildren();
    for(const group of [...groups.values()].sort((a,b)=>a.grade-b.grade||a.classId-b.classId)){
      const percent=group.total?Math.round(group.complete/group.total*100):0,card=document.createElement('article');
      card.innerHTML=`<strong>${esc(group.grade)}학년 ${esc(group.classId)}반 · ${percent}%</strong><div class="registration-bar" role="progressbar" aria-label="${esc(group.grade)}학년 ${esc(group.classId)}반 가입률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div><small>${group.complete}명 / ${group.total}명 가입 완료</small>`;
      charts.append(card);
    }
  }
  async function load(){state.className='connection-state';state.innerHTML='<div><strong>CONNECTING</strong><span>교사 권한과 담당 학급을 확인하고 있습니다.</span></div>';
    try{const me=await api('/api/auth/me');if(me.user.role!=='teacher')throw Object.assign(new Error('교사 계정으로 로그인해야 합니다.'),{status:403});teacher=me.user;$('#teacher-identity').textContent=`${teacher.name||'교사'} · TEACHER`;
      const classSelect=$('#teacher-class-select'),previous=classSelect.disabled?'':classSelect.value,classData=await api('/api/teacher/classes');classSelect.replaceChildren();for(const item of classData.classes){const option=document.createElement('option');option.value=`${item.grade}-${item.classId}`;option.textContent=`${item.grade}학년 ${item.classId}반`;classSelect.append(option);}classSelect.value=previous&&[...classSelect.options].some(o=>o.value===previous)?previous:`${teacher.grade}-${teacher.classId}`;classSelect.disabled=false;
      const selected=classSelect.value,scope=`?class=${encodeURIComponent(selected)}`;$('#class-label').textContent=`${teacher.schoolId||'학교 미지정'} · ${classSelect.selectedOptions[0]?.textContent||'학급 미지정'}`;
      const [roster,registration,settings,analytics,topics,evidence,sync]=await Promise.all([api('/api/teacher/students-status'+scope),api('/api/teacher/registration-status'),api('/api/teacher/class-settings'+scope),api('/api/teacher/class-analytics'+scope),api('/api/topics'),api('/api/evidence/cards'),api('/api/sync/status').catch(()=>({status:'not_connected',queueLength:0}))]);
      students=roster.students||[];registrations=registration.registrations||[];renderStudents();renderRegistrations();$('#metric-students').textContent=students.length;$('#metric-ready').textContent=students.filter(s=>s.isBattleReady).length;$('#metric-practice').textContent=students.reduce((n,s)=>n+(Number(s.practiceCount)||0),0);$('#metric-sync').textContent=sync.queueLength??'—';$('#overview-empty').hidden=students.length>0;
      $('#badge-requirement').value=String(settings.settings?.requiredBadgeCount||1);const topicSelect=$('#topic-assignment');topicSelect.replaceChildren();(topics.topics||topics||[]).forEach(t=>{const o=document.createElement('option');o.value=t.topicId||t.id;o.textContent=t.title||t.topic;o.selected=o.value===settings.settings?.activeTopicId;topicSelect.append(o);});
      const cards=evidence.cards||[];$('#metric-evidence').textContent=cards.length;$('#metric-verified').textContent=cards.filter(c=>c.verificationStatus==='verified').length;$('#growth-content').textContent=analytics.analytics?.hasSufficientData?'실제 수행 기록을 바탕으로 학급 성장 분석을 확인할 수 있습니다.':'분석할 실제 수행 기록이 충분하지 않습니다.';$('#sync-state').textContent=sync.status==='connected'?'Google Sheets 연결됨':`연결 전 · 대기 ${sync.queueLength||0}건`;
      state.innerHTML='<div><strong>CONNECTED</strong><span>검증된 교사 세션과 담당 학급 범위로 연결되었습니다.</span></div>';
    }catch(error){state.className='connection-state error';state.innerHTML=`<div><strong>${error.status===401?'SIGN IN REQUIRED':'ACCESS DENIED'}</strong><span>${esc(error.message)}</span></div><a class="neon-button" href="/stitch_screens/04_login_signup.html">로그인 화면</a>`;$$('#teacher-main .teacher-panel').forEach(p=>p.hidden=true);}
  }
  $('#settings-form').addEventListener('submit',async e=>{e.preventDefault();try{await api('/api/teacher/class-settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({class:$('#teacher-class-select').value,requiredBadgeCount:Number($('#badge-requirement').value),activeTopicId:$('#topic-assignment').value})});$('#settings-result').textContent='선택한 학급 설정을 저장했습니다.';show('학급 설정이 저장되었습니다.');}catch(error){$('#settings-result').textContent=error.message;}});
  $('#registration-search').addEventListener('input',renderRegistrations);$('#teacher-class-select').addEventListener('change',()=>{$('#registration-search').value='';load();});$('#refresh-dashboard').addEventListener('click',load);$('#logout-btn').addEventListener('click',async()=>{await fetch('/api/auth/logout',{method:'POST'});location.href='/stitch_screens/04_login_signup.html';});load();
})();

