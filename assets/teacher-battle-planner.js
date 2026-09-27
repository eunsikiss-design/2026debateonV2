(() => {
  const $=id=>document.getElementById(id),topic=$('battle-plan-topic'),mode=$('battle-plan-mode'),capacity=$('battle-plan-capacity'),rows=$('battle-roster-rows');
  let classValue='',students=[],loadedPlan=null,sequence=0,activeRoomCount=0,opening=false,monitoring=false,lastRoomSignature='';
  async function api(url,body){const response=await fetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw Error(result.message||result.error||'연결 오류');return result;}
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  function status(message){$('battle-plan-status').textContent=message;}
  function selection(){return [...rows.querySelectorAll('tr')].flatMap(row=>row.querySelector('input[type=checkbox]')?.checked?[{studentNumber:row.dataset.studentNumber,team:row.querySelector('select').value}]:[]);}
  function counts(){const chosen=selection();$('battle-assignment-count').textContent=mode.value==='assigned'?'지정 '+chosen.length+'명 · 찬성 '+chosen.filter(p=>p.team==='pro').length+'명 · 반대 '+chosen.filter(p=>p.team==='con').length+'명':'자유 가입 · 찬반 인원 차이 최대 1명 · 전체 정원 '+capacity.value+'명';}
  function renderRoster(chosen=selection()){
    rows.replaceChildren();const selected=new Map(chosen.map(item=>[item.studentNumber,item.team]));
    for(const student of students){
      const row=node('tr');row.dataset.studentNumber=student.studentNumber;
      const check=node('input');check.type='checkbox';check.setAttribute('aria-label',student.studentNumber+' '+(student.name||'이름 미등록')+' 지정');check.disabled=!student.registered;check.checked=student.registered&&selected.has(student.studentNumber);
      const team=node('select');team.setAttribute('aria-label',student.studentNumber+' 찬반 조');team.add(new Option('입장 선택',''));team.add(new Option('찬성','pro'));team.add(new Option('반대','con'));team.value=selected.get(student.studentNumber)||'';team.disabled=!student.registered;
      const first=node('td');first.append(check);row.append(first);
      for(const text of [student.studentNumber,student.name||'미등록',student.registered?'완료':'대기',student.online?'접속 중':student.registered?'오프라인':'—',student.activityStatus||'활동 기록 없음',student.registered?(student.isBattleReady?'참가 가능':'뱃지 '+(student.badgeCount||0)+'/'+(student.requiredBadges||1)):'가입 필요'])row.append(node('td',text));
      const last=node('td');last.append(team);row.append(last);rows.append(row);
    }
    rows.querySelectorAll('input,select').forEach(input=>input.hidden=mode.value!=='assigned');counts();
  }
  async function loadPlan(){
    const id=++sequence;if(!classValue||!topic.value)return;
    try{const result=await api('/api/teacher/battle-plan?class='+encodeURIComponent(classValue)+'&topicId='+encodeURIComponent(topic.value));if(id!==sequence)return;loadedPlan=result.plan;mode.value=loadedPlan.mode;capacity.value=Math.max(2,loadedPlan.capacity);renderRoster(loadedPlan.assignments||[]);status('편성을 정한 뒤 현재 편성으로 토론 열기를 누르세요.');}
    catch(error){status(error.message);}
  }
  async function savePlan(){
    if(!$('battle-plan-form').reportValidity())return null;
    const assigned=mode.value==='assigned'?selection():[];
    if(mode.value==='assigned'&&(!assigned.length||assigned.some(item=>!item.team)||!['pro','con'].every(team=>assigned.some(item=>item.team===team))))throw Error('지정할 학생을 선택하고 찬성과 반대에 각각 한 명 이상 배정하세요.');
    const result=await api('/api/teacher/battle-plan',{class:classValue,topicId:topic.value,mode:mode.value,capacity:Number(capacity.value),assignments:assigned});loadedPlan=result.plan;return result.plan;
  }
  function renderRooms(rooms){
    const list=$('battle-room-list');list.replaceChildren();activeRoomCount=rooms.length;$('battle-room-count').textContent='활성 방 '+activeRoomCount+'/10';$('battle-room-open').disabled=opening||activeRoomCount>=10;
    if(!rooms.length){list.append(node('p','진행 중인 방이 없습니다. 아래에서 논제와 정원을 정해 방을 여세요.'));return;}
    for(const room of rooms){
      const card=node('article',undefined,'battle-monitor-card'),link=node('a',room.title);link.href='/stitch_screens/09_class_debate_battle.html?class='+encodeURIComponent(classValue)+'&room='+encodeURIComponent(room.roomId);
      const title=node('h4');title.append(link);card.append(title);
      const all=[...(room.participants?.teamA||[]),...(room.participants?.teamB||[])];
      const meta=node('p',(room.plan?.mode==='assigned'?'교사 지정':'자유 가입')+' · '+all.length+'/'+room.plan?.capacity+'명 · 발언 '+(room.messageCount??room.messages?.length??0)+'건 · '),clock=node('span');clock.dataset.endsAt=room.endsAt;meta.append(clock);card.append(meta);
      const teams=node('div',undefined,'battle-monitor-teams');
      for(const [key,label] of [['teamA','찬성'],['teamB','반대']]){const section=node('div'),members=room.participants?.[key]||[];section.append(node('strong',label+' '+members.length+'명'),node('p',members.length?members.map(p=>(p.studentNumber||'')+' '+p.name).join(', '):'참가자 대기'));teams.append(section);}
      card.append(teams);
      if(!room.participants?.teamA?.length||!room.participants?.teamB?.length)card.append(node('p','양쪽 입장 참가자를 기다리고 있습니다.','battle-monitor-wait'));
      const actions=node('div',undefined,'battle-monitor-actions'),observe=node('a','토론 관찰하기','neon-button');observe.href=link.href;
      const finish=node('button','이 토론 종료','neon-button');finish.type='button';finish.onclick=async()=>{finish.disabled=true;try{await api('/api/debate/finish',{roomId:room.roomId});await monitor();status('토론을 종료했습니다. 학생들의 발언 기록은 보존됩니다.');}catch(error){status(error.message);finish.disabled=false;}};
      actions.append(observe,finish);card.append(actions);list.append(card);
    }
  }
  async function monitor(){
    if(!classValue||monitoring)return;monitoring=true;const scope=classValue;
    try{const result=await api('/api/debate/available?summary=1&class='+encodeURIComponent(scope));if(scope!==classValue)return;const signature=scope+JSON.stringify(result.rooms);if(signature!==lastRoomSignature){lastRoomSignature=signature;renderRooms(result.rooms||[]);}document.querySelectorAll('[data-ends-at]').forEach(clock=>clock.textContent='남은 시간 '+Math.max(0,Math.ceil((Date.parse(clock.dataset.endsAt)-Date.now())/60000))+'분');$('battle-monitor-status').textContent='5초마다 갱신 · 마지막 확인 '+new Date().toLocaleTimeString('ko-KR');}
    catch(error){$('battle-monitor-status').textContent='현황 갱신 실패 · '+error.message;}finally{monitoring=false;}
  }
  document.addEventListener('teacher-students-loaded',async event=>{
    classValue=event.detail.classValue;const id=++sequence;status('학생 명단과 논제를 불러오고 있습니다.');
    try{const [roster,topics]=await Promise.all([api('/api/teacher/battle-roster?class='+encodeURIComponent(classValue)),api('/api/learning/topics')]);if(id!==sequence)return;students=roster.students||[];const old=topic.value;topic.replaceChildren();for(const item of topics.topics||[])topic.add(new Option(item.question||item.title,item.topicId));if([...topic.options].some(o=>o.value===old))topic.value=old;await Promise.all([loadPlan(),monitor()]);}catch(error){status(error.message);}
  });
  topic.addEventListener('change',loadPlan);mode.addEventListener('change',()=>{rows.querySelectorAll('input,select').forEach(input=>input.hidden=mode.value!=='assigned');document.querySelector('.battle-roster-details').open=mode.value==='assigned';counts();});capacity.addEventListener('input',counts);rows.addEventListener('change',counts);
  $('battle-plan-form').addEventListener('submit',async event=>{event.preventDefault();try{if(await savePlan())status('편성을 저장했습니다. 새로 여는 방부터 적용됩니다.');}catch(error){status(error.message);}});
  $('battle-room-open').addEventListener('click',async()=>{
    if(opening||!$('battle-room-minutes').reportValidity())return;opening=true;$('battle-room-open').disabled=true;
    const scope=classValue,chosenTopic=topic.value,durationMinutes=Number($('battle-room-minutes').value);
    try{const plan=await savePlan();if(!plan)return;await api('/api/debate/room/init',{class:scope,topicId:chosenTopic,planUpdatedAt:plan.updatedAt,durationMinutes});status('토론방을 열었습니다. 학생 화면에 자동으로 표시됩니다.');await monitor();$('battle-room-list').scrollIntoView({behavior:'smooth',block:'nearest'});}
    catch(error){status(error.message);}finally{opening=false;$('battle-room-open').disabled=activeRoomCount>=10;}
  });
  $('battle-monitor-refresh').onclick=monitor;
  setInterval(()=>{if(!document.hidden&&!document.querySelector('[data-view=battle]').hidden)monitor();},5000);
  setInterval(async()=>{if(document.hidden||!classValue||document.querySelector('[data-view=battle]').hidden||rows.contains(document.activeElement))return;const scope=classValue;try{const roster=await api('/api/teacher/battle-roster?class='+encodeURIComponent(scope));if(scope===classValue){students=roster.students||[];renderRoster();}}catch{}},30000);
  $('teacher-account-form').addEventListener('submit',async event=>{event.preventDefault();const field=$('teacher-account-password'),message=$('teacher-account-result');message.textContent='발급 중입니다.';try{const result=await api('/api/teacher/provision-test-admins',{password:field.value});field.value='';message.textContent=`발급 완료: ${result.accounts.join(', ')}`;}catch(error){message.textContent=error.message;}});
  $('test-students-provision').addEventListener('click',async()=>{const button=$('test-students-provision'),message=$('test-students-provision-result');button.disabled=true;message.textContent='99개 계정을 발급하고 있습니다.';try{const result=await api('/api/teacher/provision-test-students',{});message.textContent=`발급 완료: ${result.accounts.length}개 · test01~test99`; }catch(error){message.textContent=error.message;}finally{button.disabled=false;}});
})();
