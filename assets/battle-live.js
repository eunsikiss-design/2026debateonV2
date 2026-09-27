(() => {
 const $=id=>document.getElementById(id),feed=$('debateFeed'),input=$('argumentInput');
 const params=new URLSearchParams(location.search),teacherClass=params.get('class')||'';
 const types={claim:'주장',question:'질문',answer:'답변',counter:'반론',rebuttal:'재반론',final:'최종발언'};
 let user,room,stream,timer,roomList=[],sending=false,joining=false,joined=false,displayedRoomId=null,lastReadyState=null,loadSequence=0,refreshing=false;
 async function api(url,body){const res=await fetch(url,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await res.json();if(!res.ok||data.success===false&&!data.moderated)throw Error(data.message||data.error||'연결을 확인하고 다시 시도해 주세요.');return data;}
 const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
 const people=r=>[...(r?.participants?.teamA||[]),...(r?.participants?.teamB||[])].filter(p=>p.role!=='teacher');
 const active=()=>room?.status==='active'&&Date.parse(room.endsAt)>Date.now();
 function tell(text){$('battle-notice').textContent=text;}
 function pane(which){document.querySelector('.battle-workspace').dataset.pane=which;$('show-feed').setAttribute('aria-pressed',String(which==='feed'));$('show-writer').setAttribute('aria-pressed',String(which==='writer'));}
 $('show-feed').onclick=()=>pane('feed');$('show-writer').onclick=()=>pane('writer');
 function draftKey(){return user&&room?'debateon:battle-draft:'+user.uid+':'+room.roomId:null;}
 function count(){const n=Array.from(input.value).length;$('charCount').textContent=n+' / 300자';const key=draftKey();if(key)try{sessionStorage.setItem(key,input.value);$('draft-status').textContent='이 탭에 초안 저장됨';}catch{$('draft-status').textContent='이 화면에서 초안 유지 중';}}
 input.addEventListener('input',count);
 function assignment(){return room?.plan?.mode==='assigned'?room.plan.assignments?.find(p=>p.studentNumber===String(user?.studentNumber)):null;}
 function choiceError(team){
   const own=people(room).find(p=>p.uid===user?.uid),others=people(room).filter(p=>p.uid!==user?.uid);
   if(!active())return '진행 중인 토론방이 아닙니다.';
   if(!team)return '찬성 또는 반대를 선택해 주세요.';
   if(own?.team===team)return '';
   if(room.plan?.mode==='assigned')return assignment()?.team===team?'':'교사가 지정한 입장으로 참여해 주세요.';
   if(!own&&others.length>=Number(room.plan?.capacity||99))return '참가 정원이 찼습니다.';
   const chosen=others.filter(p=>p.team===team).length,opposite=others.length-chosen;
   if(chosen>=Math.ceil(Number(room.plan?.capacity||99)/2)||chosen>opposite)return '인원 균형을 위해 인원이 적은 입장으로 참여해 주세요.';
   return '';
 }
 function controls(){
   const own=people(room).find(p=>p.uid===user?.uid),select=$('battle-team'),assigned=assignment();joined=Boolean(own);
   $('battle-room-select').disabled=joining||sending;
   if(assigned)select.value=assigned.team;
   select.disabled=joining||!active()||room?.plan?.mode==='assigned';
   for(const option of [...select.options].filter(o=>o.value)){option.disabled=Boolean(choiceError(option.value));const text=(option.value==='pro'?'찬성':'반대')+' · '+people(room).filter(p=>p.team===option.value).length+'명'+(option.disabled?' · 선택 대기':'');if(option.textContent!==text)option.textContent=text;}
   const other=roomList.find(r=>r.roomId!==room?.roomId&&people(r).some(p=>p.uid===user?.uid));
   $('my-room-btn').hidden=!other;$('my-room-btn').onclick=()=>other&&selectRoom(other.roomId);
   const reason=other?'다른 방에 참여 중입니다. 그 방에서 나간 뒤 입장하세요.':choiceError(select.value);
   $('join-battle-btn').disabled=joining||user?.role==='teacher'||Boolean(reason)||own?.team===select.value;
   $('join-battle-btn').textContent=joining?'처리 중…':joined?'선택한 입장으로 변경':'토론방 입장하기';
   $('leave-battle-btn').hidden=!joined;$('leave-battle-btn').disabled=joining;
   $('send-msg-btn').disabled=!joined||!active()||sending||joining;
   $('finish-debate-btn').disabled=!active();
   const membershipText=user?.role==='teacher'?'교사는 참가자와 발언을 관찰하고 토론을 종료할 수 있습니다.':room&&!active()?'종료된 토론입니다. 발언 기록은 계속 확인할 수 있습니다.':joined?'현재 '+(own.team==='pro'?'찬성으로':'반대로')+' 참여 중입니다. 나가도 이미 남긴 발언은 보존됩니다.':reason||'선택한 입장으로 입장할 수 있습니다.';
   if($('membership-status').textContent!==membershipText)$('membership-status').textContent=membershipText;
   const ready=active()?(joined?'joined':'waiting'):'closed';
   if(ready!==lastReadyState){$('composer-status').textContent=ready==='joined'?'내 주장과 이유를 작성한 뒤 전송하세요.':ready==='waiting'?'위에서 입장을 선택하고 토론방에 입장해 주세요.':'종료된 토론은 발언 기록만 읽을 수 있습니다.';lastReadyState=ready;}
 }
 $('battle-team').addEventListener('change',controls);
 function summary(){$('battle-summary-copy').textContent='현재 찬성 '+(room?.participants?.teamA?.length||0)+'명 · 반대 '+(room?.participants?.teamB?.length||0)+'명 · 저장된 발언 '+(room?.messages?.length||0)+'건. 퇴장해도 발언 기록은 보존됩니다.';}
 function updatePicker(){
   const picker=$('battle-room-select'),value=room?.roomId||picker.value;picker.replaceChildren();
   const items=[...roomList];if(room&&!items.some(r=>r.roomId===room.roomId))items.push(room);
   for(const r of items)picker.add(new Option(r.title+' · 찬성 '+(r.participants?.teamA?.length||0)+' / 반대 '+(r.participants?.teamB?.length||0)+' · '+(r.status!=='active'||Date.parse(r.endsAt)<=Date.now()?'종료':people(r).some(p=>p.uid===user?.uid)?'참여 중':'모집 중'),r.roomId));
   if(!items.length)picker.add(new Option('열린 토론방이 없습니다.',''));
   if(items.some(r=>r.roomId===value))picker.value=value;
 }
 function presence(participants){
   if(!room)return;room.participants=participants;const listItem=roomList.find(r=>r.roomId===room.roomId);if(listItem)listItem.participants=participants;
   const members=people(room);$('room-members-count').textContent='참여 '+members.length+'명';$('room-capacity').textContent=members.length+' / '+(room.plan?.capacity||'—')+'명';
   const teams=$('battle-teams');teams.replaceChildren();
   for(const team of ['pro','con']){
     const membersOfTeam=members.filter(p=>p.team===team),card=node('section',undefined,'battle-team-card');card.dataset.team=team;
     card.append(node('h3',(team==='pro'?'찬성':'반대')+' '+membersOfTeam.length+'명'));
     const list=node('ul');for(const p of membersOfTeam)list.append(node('li',(p.studentNumber?p.studentNumber+' ':'')+(p.name||'학생')+(p.uid===user?.uid?' · 나':'')));
     if(!membersOfTeam.length)list.append(node('li','아직 참가자가 없습니다.','battle-help'));card.append(list);teams.append(card);
   }
   $('team-balance-help').textContent=room.plan?.mode==='assigned'?'교사가 지정한 참가자와 입장으로 입장합니다.':'자유롭게 입장을 선택하세요. 찬반 인원 차이가 1명을 넘는 입장은 잠시 선택할 수 없습니다. 퇴장으로 차이가 나면 적은 쪽부터 입장합니다.';
   const selected=$('target-student-select').value;$('target-student-select').replaceChildren(new Option('전체에게','all'));
   const targets=new Map(members.map(p=>[p.uid,p]));for(const m of room.messages||[])if(!targets.has(m.authorUid))targets.set(m.authorUid,{uid:m.authorUid,name:m.authorName,team:m.teamId});
   for(const p of targets.values())if(p.uid!==user?.uid)$('target-student-select').add(new Option(p.name+' · '+(p.team==='con'?'반대':'찬성'),p.uid));
   if(targets.has(selected))$('target-student-select').value=selected;
   updatePicker();summary();controls();
 }
 function addMessage(message){
   if(feed.querySelector('[data-message-id="'+CSS.escape(message.messageId)+'"]'))return;
   const atBottom=feed.scrollHeight-feed.scrollTop-feed.clientHeight<80,card=node('article',undefined,'feed-item');card.dataset.messageId=message.messageId;card.dataset.team=message.teamId;
   const meta=node('div',undefined,'feed-meta');meta.append(node('strong',message.authorName||'학생'),node('span',message.teamId==='con'?'반대':'찬성'),node('span',types[message.messageType]||'발언'));
   if(message.targetName)meta.append(node('span','→ '+message.targetName));meta.append(node('time',new Date(message.createdAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})));
   card.append(meta,node('p',message.content));
   if(message.authorUid!==user?.uid&&user?.role!=='teacher'){const reply=node('button','이 발언에 답하기');reply.type='button';reply.onclick=()=>{$('target-student-select').value=message.authorUid;document.querySelector('input[name=speechType][value=answer]').checked=true;pane('writer');input.focus();};card.append(reply);}
   feed.append(card);if(atBottom)feed.scrollTop=feed.scrollHeight;else $('new-messages').hidden=false;$('message-total-count').textContent='발언 '+feed.children.length+'건';
 }
 $('new-messages').onclick=()=>{feed.scrollTop=feed.scrollHeight;$('new-messages').hidden=true;};
 function renderRoom(next){
   room=next;const changed=displayedRoomId!==room.roomId;displayedRoomId=room.roomId;
   $('room-topic-title').textContent=room.title;$('battle-class').textContent=room.grade+'학년 '+room.classId+'반 · '+(active()?'진행 중':'종료된 기록');
   if(changed){feed.replaceChildren();$('message-total-count').textContent='발언 0건';$('new-messages').hidden=true;try{input.value=sessionStorage.getItem(draftKey())||'';}catch{input.value='';}count();$('battle-team').value=people(room).find(p=>p.uid===user?.uid)?.team||'';lastReadyState=null;}
   presence(room.participants||{});for(const m of room.messages||[])addMessage(m);
   clearInterval(timer);const tick=()=>{const seconds=active()?Math.max(0,Math.ceil((Date.parse(room.endsAt)-Date.now())/1000)):0;$('serverTimer').textContent=seconds?String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'):'종료';controls();};tick();timer=setInterval(tick,1000);
 }
 function connect(){
   stream?.close();const connectedId=room.roomId;$('battle-live-status').textContent='실시간 연결 중';stream=new EventSource('/api/debate/stream/'+encodeURIComponent(connectedId));
   stream.addEventListener('open',()=>{$('battle-live-status').textContent='실시간 연결됨';});
   stream.addEventListener('room',event=>{if(room?.roomId===connectedId)renderRoom(JSON.parse(event.data).room);});
   stream.addEventListener('presence',event=>{if(room?.roomId===connectedId)presence(JSON.parse(event.data).participants);});
   stream.addEventListener('message',event=>{if(room?.roomId!==connectedId)return;const m=JSON.parse(event.data).message;if(!room.messages.some(v=>v.messageId===m.messageId))room.messages.push(m);addMessage(m);summary();});
   stream.onerror=()=>{$('battle-live-status').textContent='연결 복구 중 · 글은 유지됩니다';};
 }
 async function selectRoom(id){
   const seq=++loadSequence;try{const result=await api('/api/debate/room/'+encodeURIComponent(id));if(seq!==loadSequence)return;renderRoom(result.room);connect();tell(active()?'참가자와 입장을 확인하고 입장하세요.':'종료된 토론의 발언 기록입니다.');}catch(error){tell(error.message);}
 }
 async function refresh(manual=false){
   if(refreshing||!user)return;refreshing=true;
   try{
     const data=await api('/api/debate/available?summary=1'+(user.role==='teacher'&&teacherClass?'&class='+encodeURIComponent(teacherClass):''));roomList=data.rooms||[];updatePicker();
     if(!room&&params.get('room')){const requested=params.get('room');params.delete('room');await selectRoom(requested);}
     if(!room){let selected=roomList.find(r=>r.roomId===params.get('room'))||roomList.find(r=>people(r).some(p=>p.uid===user.uid))||roomList[0];if(selected)await selectRoom(selected.roomId);else{$('room-topic-title').textContent='교사가 토론을 열면 시작할 수 있습니다.';$('battle-live-status').textContent='토론방 대기';tell('열린 방을 자동으로 확인하고 있습니다.');controls();}}
     else if(manual)await selectRoom(room.roomId);else controls();
   }catch(error){tell(error.message);}finally{refreshing=false;}
 }
 $('battle-room-select').addEventListener('change',()=>selectRoom($('battle-room-select').value));
 const retry=node('button','토론방 새로 확인');retry.type='button';retry.onclick=()=>refresh(true);const noticeRow=node('div',undefined,'battle-notice-row');$('battle-notice').before(noticeRow);noticeRow.append($('battle-notice'),retry);
 $('join-form').onsubmit=async event=>{
   event.preventDefault();if(!room||joining)return;joining=true;controls();
   try{const data=await api('/api/debate/join',{roomId:room.roomId,teamId:$('battle-team').value});renderRoom(data.room);$('composer-status').textContent='입장했습니다. 내 주장과 이유를 작성해 보세요.';tell('토론방에 입장했습니다.');pane('writer');}
   catch(error){tell(error.message);await refresh(true);}finally{joining=false;controls();}
 };
 $('leave-battle-btn').onclick=async()=>{
   if(!room||joining)return;joining=true;controls();
   try{const data=await api('/api/debate/leave',{roomId:room.roomId});renderRoom(data.room);$('battle-team').value='';pane('feed');tell('토론방에서 나왔습니다. 작성한 발언은 보존되며 다른 방을 선택하거나 다시 입장할 수 있습니다.');}
   catch(error){tell(error.message);}finally{joining=false;controls();}
 };
 $('argument-form').onsubmit=async event=>{
   event.preventDefault();if(sending||!room||!joined||!active()||!input.value.trim())return;
   const content=input.value.trim(),sentRoomId=room.roomId;sending=true;controls();
   try{const result=await api('/api/debate/message',{roomId:sentRoomId,messageType:document.querySelector('input[name=speechType]:checked').value,targetUid:$('target-student-select').value==='all'?null:$('target-student-select').value,content});if(room?.roomId!==sentRoomId)return;if(result.moderated){$('composer-status').textContent=result.guidance;return;}if(!room.messages.some(m=>m.messageId===result.message.messageId))room.messages.push(result.message);addMessage(result.message);summary();if(input.value.trim()===content)input.value='';count();$('composer-status').textContent='발언을 전송했습니다.';}
   catch(error){$('composer-status').textContent=error.message+' 작성한 글은 유지됩니다.';}finally{sending=false;controls();}
 };
 input.onkeydown=event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();if(!$('send-msg-btn').disabled)$('argument-form').requestSubmit();}};
 $('finish-debate-btn').onclick=async()=>{if(!room)return;try{await api('/api/debate/finish',{roomId:room.roomId});await refresh(true);tell('토론을 종료하고 발언 기록을 저장했습니다.');}catch(error){tell(error.message);}};
 (async()=>{try{user=(await api('/api/auth/me')).user;if(user.role==='teacher'){$('teacher-room-form').hidden=false;$('join-form').hidden=true;$('battle-writer').hidden=true;$('show-writer').hidden=true;document.querySelector('.battle-workspace').classList.add('teacher-observer');$('teacher-planner-link').href='/stitch_screens/10_teacher_dashboard.html?panel=battle'+(teacherClass?'&class='+encodeURIComponent(teacherClass):'');}else $('finish-debate-btn').hidden=true;await refresh();}catch{tell('로그인 후 우리 반 토론에 참여할 수 있습니다.');$('battle-live-status').textContent='로그인 필요';const link=node('a','로그인하기');link.href='/stitch_screens/04_login_signup.html';$('battle-notice').append(' ',link);}})();
 setInterval(()=>{if(!document.hidden)refresh();},15000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
 window.addEventListener('beforeunload',()=>stream?.close());
})();
