(() => {
 const $=id=>document.getElementById(id);let students=[],classValue='',sync=null;
 const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
 const review=student=>{document.querySelector('[data-panel="records"]').click();document.dispatchEvent(new CustomEvent('teacher-review-student',{detail:{uid:student.uid}}));};
 const overview=node('div');overview.id='overview-details';$('overview-empty').after(overview);
 const syncDetails=node('div');$('sync-state').after(syncDetails);
 function clickable(element,action){element.tabIndex=0;element.setAttribute('role','button');element.style.cursor='pointer';element.addEventListener('click',action);element.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();action();}});}
 function showStudents(title,items){overview.replaceChildren(node('h3',title));if(!items.length)overview.append(node('p','해당 학생이 없습니다.'));for(const s of items){const line=node('p',`${s.studentNumber} ${s.name} · 완료 ${s.practiceCount||0}건 · 저장본 ${s.savedCount||0}건 · 최신 초안 ${s.draftCount||0}건 `),button=node('button','원문 확인');button.type='button';button.className='neon-button';button.onclick=()=>review(s);line.append(button);overview.append(line);}overview.scrollIntoView({block:'nearest'});}
 clickable($('metric-students').parentElement,()=>showStudents('등록 학생',students));
 clickable($('metric-ready').parentElement,()=>showStudents('배틀 준비 학생',students.filter(s=>s.isBattleReady)));
 clickable($('metric-practice').parentElement,()=>showStudents('활동 기록 상세 · 완료 + 저장본 (최신 초안은 별도)',students.filter(s=>s.practiceCount||s.savedCount||s.draftCount)));
 clickable($('metric-sync').parentElement,()=>document.querySelector('[data-panel="sync"]').click());
 for(const [id,filter] of [['registration-total','all'],['registration-complete','complete'],['registration-pending','pending']])clickable($(id).parentElement,()=>{document.dispatchEvent(new CustomEvent('teacher-registration-filter',{detail:filter}));$('registration-table-title').scrollIntoView({block:'start'});});
 $('teacher-class-select').addEventListener('change',()=>document.dispatchEvent(new CustomEvent('teacher-registration-filter',{detail:'class'})));
 const descriptions={주장:'논제에 대한 입장을 분명히 밝히고 적용 범위를 설명하는가?',근거:'확인 가능한 자료나 사례를 제시하고 출처와 한계를 검토하는가?','논리 연결':'근거가 주장을 뒷받침하는 이유를 설명하는가?','개념 활용':'교과 개념을 정확히 이해하고 사례에 적용하는가?','상대 이해':'다른 입장의 이유와 우려를 왜곡 없이 설명하는가?',반론:'상대 주장의 근거나 전제를 구체적으로 검토하는가?',재반론:'제기된 반론에 답하며 자기 주장을 수정하거나 조건을 보완하는가?',표현:'글·전사문의 문장이 명료하고 논리적으로 이어지는가? 음성 전달력은 전사문만으로 판단하지 않습니다.'};
 for(const item of $('rubric-grid').children)item.querySelector('span').textContent=descriptions[item.querySelector('strong').textContent]||'';
 $('rubric-grid').before(node('p','앱의 관찰·피드백 기준입니다. 학교가 확정한 수행평가 배점표는 아직 등록되지 않았습니다. 원문·수정 과정·토론 발언·교사 관찰을 근거로 검토하며, 저장 횟수나 AI 뱃지를 성적으로 환산하지 않습니다.'));
 async function request(url,options){const r=await fetch(url,options),d=await r.json();if(!r.ok)throw Error(d.message||'조회하지 못했습니다.');return d;}
 async function loadSync(retry=false){
  const selected=classValue;syncDetails.replaceChildren(node('p','활동 시트의 전송 상태를 확인하고 있습니다.'));
  try{const d=await request('/api/teacher/activity-sheets'+(retry?'':'?class='+encodeURIComponent(selected)),retry?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({class:selected})}:undefined);if(classValue!==selected)return;sync=d;
   $('metric-sync').textContent=d.pendingCount;
   $('sync-state').textContent=`학생 활동 ${d.connected?'시트 연결됨':'시트 연결 전'} · 전송 완료 ${d.syncedCount}명 · 대기 ${d.pendingCount}명`;
   syncDetails.replaceChildren(node('p','최신 초안·각 저장본·완료 글·스피치 전사·토론 발언을 학생 활동 탭에 약 1분 간격으로 전송합니다. 원문은 앱에 먼저 저장되며, 실패한 전송은 재시도합니다. 세특은 교사가 검토 완료한 내용만 별도 세특 탭에 저장합니다.'));
   if(d.spreadsheetUrl){const link=node('a','연결된 Google 스프레드시트 열기');link.href=d.spreadsheetUrl;link.target='_blank';link.rel='noopener';syncDetails.append(link);}
   const button=node('button','지금 전송 · 실패 재시도');button.className='neon-button';button.disabled=!d.connected;button.onclick=()=>loadSync(true);syncDetails.append(button);
   for(const s of d.students){const line=node('p',`${s.studentNumber} ${s.name} · ${s.entryCount}건 · ${s.status==='synced'?'전송 완료':s.status==='empty'?'저장된 활동 없음':'전송 대기'}${s.syncedAt?' · 마지막 성공 '+new Date(s.syncedAt).toLocaleString('ko-KR'):''}${s.message?' · '+s.message:''} `),b=node('button','기록 확인');b.onclick=()=>review(s);line.append(b);syncDetails.append(line);}
  }catch(e){syncDetails.replaceChildren(node('p',e.message));}
 }
 async function growth(){
  const selected=classValue,holder=$('growth-content');holder.replaceChildren(node('p','같은 학생·주제·활동의 서로 다른 시점 원문을 비교합니다. 글의 길이나 저장 횟수만으로 성장했다고 판단하지 않습니다. 비교 가능한 두 원문과 교사의 확인이 필요합니다.'));
  for(const s of students){
   try{const p=await request('/api/teacher/student-record?studentId='+encodeURIComponent(s.uid));if(selected!==classValue)return;
    const groups=new Map();for(const source of p.sources||[]){const key=source.kind+':'+source.topicId;if(!groups.has(key))groups.set(key,[]);const list=groups.get(key);if(!list.some(v=>v.text===source.text))list.push(source);}
    for(const values of groups.values()){if(values.length<2)continue;values.sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));const first=values[0],last=values.at(-1),box=node('details'),summary=node('summary',`${s.studentNumber} ${s.name} · ${last.title} · ${values.length}개 원문 비교`);box.append(summary,node('p','앞선 기록 ('+first.createdAt+'): '+first.text),node('p','이후 기록 ('+last.createdAt+'): '+last.text),node('p','확인할 변화: 주장 명료화, 근거 보완, 개념 적용, 상대 입장 이해, 반론에 따른 수정.'));const b=node('button','근거 선택 · 분석');b.onclick=()=>review(s);box.append(b);holder.append(box);}
   }catch(e){holder.append(node('p',`${s.studentNumber}: ${e.message}`));}
  }
  if(holder.children.length===1)holder.append(node('p','현재 학급에는 비교할 서로 다른 원문이 두 개 이상인 동일 주제·활동이 없습니다. 한 번 작성한 글도 학생별 검토에서 확인할 수 있습니다.'));
 }
 document.querySelector('[data-panel="sync"]').addEventListener('click',()=>loadSync());
 document.addEventListener('teacher-record-sheet-change',()=>{if(classValue)loadSync();});
 document.querySelector('[data-panel="growth"]').addEventListener('click',growth);
 document.addEventListener('teacher-students-loaded',e=>{students=e.detail.students;classValue=e.detail.classValue;overview.replaceChildren();$('metric-practice').textContent=students.reduce((sum,s)=>sum+(s.practiceCount||0)+(s.savedCount||0),0);$('metric-practice').previousElementSibling.textContent='완료 기록 + 저장본';for(const row of $('student-rows').children){const s=students.find(s=>row.cells[1]?.textContent===String(s.studentNumber));if(s)row.cells[2].textContent=`완료 ${s.practiceCount} · 저장본 ${s.savedCount||0} · 초안 ${s.draftCount||0}`;}loadSync();});
})();
