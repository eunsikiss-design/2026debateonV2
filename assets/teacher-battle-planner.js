(() => {
  const $=id=>document.getElementById(id);
  const topic=$('battle-plan-topic'),mode=$('battle-plan-mode'),capacity=$('battle-plan-capacity'),rows=$('battle-roster-rows');
  let classValue='',students=[],loadedPlan=null,sequence=0;
  async function api(url,body){const response=await fetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw Error(result.message||result.error||'연결 오류');return result;}
  function status(message){$('battle-plan-status').textContent=message;}
  function selection(){return [...rows.querySelectorAll('tr')].flatMap(row=>{const checked=row.querySelector('input[type=checkbox]');return checked?.checked?[{studentNumber:row.dataset.studentNumber,team:row.querySelector('select').value}]:[];});}
  function renderRoster(){
    rows.replaceChildren();const selected=new Map((loadedPlan?.assignments||[]).map(item=>[item.studentNumber,item.team]));
    for(const student of students){
      const row=document.createElement('tr');row.dataset.studentNumber=student.studentNumber;
      const check=document.createElement('input');check.type='checkbox';check.setAttribute('aria-label',`${student.studentNumber} ${student.name||'이름 미등록'} 지정`);check.disabled=!student.registered;check.checked=student.registered&&selected.has(student.studentNumber);
      const team=document.createElement('select');team.setAttribute('aria-label',`${student.studentNumber} 찬반 조`);team.add(new Option('찬성','pro'));team.add(new Option('반대','con'));team.value=selected.get(student.studentNumber)||'pro';team.disabled=!student.registered;
      const add=text=>{const cell=document.createElement('td');cell.textContent=text;row.append(cell);};
      const first=document.createElement('td');first.append(check);row.append(first);
      add(student.studentNumber);add(student.name||'미등록');add(student.registered?'완료':'대기');add(student.online?'접속 중':student.registered?'오프라인':'—');
      add(student.activityStatus||'활동 기록 없음');add(student.registered?(student.isBattleReady?'참가 가능':`뱃지 ${student.badgeCount||0}/${student.requiredBadges||1}`):'가입 필요');
      const last=document.createElement('td');last.append(team);row.append(last);rows.append(row);
    }
    const assigned=mode.value==='assigned';rows.querySelectorAll('input,select').forEach(input=>{input.hidden=!assigned;});
  }
  async function loadPlan(){const id=++sequence;if(!classValue||!topic.value)return;
    try{const result=await api(`/api/teacher/battle-plan?class=${encodeURIComponent(classValue)}&topicId=${encodeURIComponent(topic.value)}`);if(id!==sequence)return;loadedPlan=result.plan;mode.value=loadedPlan.mode;capacity.value=loadedPlan.capacity;renderRoster();status(`${students.length}명 명단 · ${loadedPlan.mode==='assigned'?'지정 배정':'자유 가입'} · 정원 ${loadedPlan.capacity}명`);}catch(error){status(error.message);}
  }
  async function rooms(){if(!classValue)return;try{const result=await api('/api/debate/available?class='+encodeURIComponent(classValue)),list=$('battle-room-list');list.replaceChildren();if(!result.rooms.length){list.textContent='진행 중인 논제가 없습니다.';return;}
    for(const room of result.rooms){const line=document.createElement('p'),link=document.createElement('a');link.href=`/stitch_screens/09_class_debate_battle.html?class=${encodeURIComponent(classValue)}&room=${encodeURIComponent(room.roomId)}`;link.textContent=room.title;line.append(link,` · ${room.plan?.mode==='assigned'?'교사 지정':'자유 가입'} · ${[...(room.participants?.teamA||[]),...(room.participants?.teamB||[])].length}/${room.plan?.capacity||'—'}명`);list.append(line);}
  }catch(error){status(error.message);}}
  document.addEventListener('teacher-students-loaded',async event=>{classValue=event.detail.classValue;const id=++sequence;status('학생 명단과 논제를 불러오고 있습니다.');
    try{const [roster,topics]=await Promise.all([api('/api/teacher/battle-roster?class='+encodeURIComponent(classValue)),api('/api/learning/topics')]);if(id!==sequence)return;students=roster.students||[];const old=topic.value;topic.replaceChildren();for(const item of topics.topics||[])topic.add(new Option(item.question||item.title,item.topicId));if([...topic.options].some(option=>option.value===old))topic.value=old;await Promise.all([loadPlan(),rooms()]);}catch(error){status(error.message);}
  });
  topic.addEventListener('change',loadPlan);mode.addEventListener('change',renderRoster);
  $('battle-plan-form').addEventListener('submit',async event=>{event.preventDefault();try{const assignments=mode.value==='assigned'?selection():[],result=await api('/api/teacher/battle-plan',{class:classValue,topicId:topic.value,mode:mode.value,capacity:Number(capacity.value),assignments});loadedPlan=result.plan;status('논제별 편성과 정원을 저장했습니다. 새로 여는 토론부터 적용됩니다.');}catch(error){status(error.message);}});
  $('battle-room-open').addEventListener('click',async()=>{try{const result=await api('/api/debate/room/init',{class:classValue,topicId:topic.value,durationMinutes:Number($('battle-room-minutes').value)});status('토론을 열었습니다. 학생에게 배틀룸에서 논제를 선택하도록 안내하세요.');await rooms();location.href=`/stitch_screens/09_class_debate_battle.html?class=${encodeURIComponent(classValue)}&room=${encodeURIComponent(result.room.roomId)}`;}catch(error){status(error.message);}});
  $('teacher-account-form').addEventListener('submit',async event=>{event.preventDefault();const field=$('teacher-account-password'),message=$('teacher-account-result');message.textContent='발급 중입니다.';try{const result=await api('/api/teacher/provision-test-admins',{password:field.value});field.value='';message.textContent=`발급 완료: ${result.accounts.join(', ')}`;}catch(error){message.textContent=error.message;}});
})();
