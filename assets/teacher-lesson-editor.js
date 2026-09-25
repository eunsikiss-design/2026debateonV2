(() => {
 const ui=window.LearningUI,n=ui.node;
 window.TeacherLessonEditor=(data,onSaved)=>{
  let revision=data.revision;const p=structuredClone(data.plan),form=n('form',undefined,'guided-form lesson-editor'),status=n('p','','learning-status');status.setAttribute('role','status');
  form.append(n('h3','단원별 상황·목표 편집'),n('p',data.sourceNote,'source-note'),n('p','저장하면 학생이 주제를 다시 열 때 화면에 반영되고, 다음 AI 요청부터 최신 자료를 사용합니다. 제시된 주장에 대한 학생 자신의 판단을 묻습니다.'));
  const fields={};function field(key,label,value,max,holder=form){const wrap=n('label',label),input=n('textarea');input.name=key;input.value=value||'';input.required=true;input.maxLength=max;input.rows=key==='setting'?3:2;wrap.append(input);holder.append(wrap);return input;}
  for(const [key,label,max]of [['question','토론 논제 (E열)',700],['essayPrompt','논술 주제',700],['textbookRef','교과서·쪽수',300],['debateGoal','토론 목표',1200],['essayGoal','논술 목표',1200],['setting',p.preserveEpisode?'만약에 · 에피소드 원문 (H열)':'만약에 · 공통 배경 (합니다·입니다체)',2500],['issue',p.preserveEpisode?'필수 쟁점 (I열)':'핵심 쟁점',700],['advancedComplication','심화 논술 · 추가 조건',2500]])fields[key]=field(key,label,p[key],max);
  if(p.preserveEpisode){fields.coreConceptText=field('coreConceptText','핵심 교과 개념 (G열)',p.coreConceptText,1500);fields.setting.rows=12;form.append(n('p','에피소드 원문은 문구·어투·줄바꿈을 그대로 표시합니다. 아래 추가 조건과 발문은 원문 밖에 따로 표시됩니다.'));}
  const characterBox=n('div',undefined,'lesson-characters'),characters=[];form.append(n('h4','서로 다른 이해관계를 지닌 등장인물'),characterBox);
  function addCharacter(c={}){const box=n('fieldset'),legend=n('legend','등장인물');box.append(legend);const item={box,name:field('characterName','이름·역할',c.name,80,box),context:field('characterContext','구체적인 처지·얻는 이익·감당할 부담',c.context,2500,box),position:field('characterPosition','이 인물의 주장과 이유',c.position,1000,box)};const remove=n('button','이 인물 제외');remove.type='button';remove.addEventListener('click',()=>{if(characters.length<=2){status.textContent='최소 두 인물이 필요합니다.';return;}characters.splice(characters.indexOf(item),1);box.remove();});box.append(remove);characters.push(item);characterBox.append(box);}
  p.characters.forEach(addCharacter);const add=n('button','등장인물 추가');add.type='button';add.addEventListener('click',()=>{if(characters.length<6)addCharacter();else status.textContent='등장인물은 최대 6명입니다.';});form.append(add);
  fields.claimant=field('claimant','판단 대상 주장을 제시한 인물 이름 (위 이름과 동일)',p.claimant,80);
  fields.proposition=field('proposition','학생이 동의·부동의를 판단할 주장 (예: 공공 임대 주택 공급을 확대해야 한다)',p.proposition,700);
  form.append(n('p',p.preserveEpisode?'학생은 에피소드와 필수 쟁점을 읽고 제시된 주장에 대해 자신의 판단을 답합니다.':'발문은 인물의 주장에 대한 독립적인 판단을 묻습니다.'));
  const conceptField=field('conceptApplications','교과 용어 | 이 상황에 적용하는 맥락 (한 줄에 하나)',p.conceptApplications.map(c=>c.term+' | '+c.application).join('\n'),20000);conceptField.required=false;conceptField.rows=5;
  const feedbackField=field('feedbackPoints','교사 피드백 관점 (한 줄에 하나)',p.feedbackPoints.join('\n'),20000);feedbackField.required=false;feedbackField.rows=4;
  form.append(n('p','용어의 뜻과 주제별 적용 여부는 아래 핵심 단어 편집에서 관리합니다. 삭제된 용어는 AI에 필수 개념으로 전달되지 않습니다.'));
  if(p.preserveEpisode){characterBox.hidden=true;characterBox.previousElementSibling.hidden=true;add.hidden=true;fields.claimant.parentElement.hidden=true;fields.claimant.required=false;for(const c of characters)for(const key of ['name','context','position'])c[key].required=false;}
  const save=n('button','수업 자료 저장');save.type='submit';form.append(save,status);const preview=n('div');form.append(preview);
  function showPreview(lesson){preview.replaceChildren(n('h4','학생 화면 · 기초 연습'),ui.scenario(lesson.scenario),ui.details('심화 논술 상황 미리 보기',ui.scenario(lesson.scenario,true)));}
  showPreview(data.lesson);
  form.addEventListener('submit',async e=>{e.preventDefault();const plan={...p};Object.entries(fields).forEach(([key,input])=>plan[key]=p.preserveEpisode&&['question','setting','issue','coreConceptText'].includes(key)?input.value:input.value.trim());plan.characters=characters.map(c=>({name:c.name.value.trim(),context:c.context.value.trim(),position:c.position.value.trim()}));
   try{plan.conceptApplications=conceptField.value.split('\n').filter(v=>v.trim()).map(line=>{const split=line.indexOf('|');if(split<1)throw Error('교과 용어와 맥락 사이에 | 를 넣으세요.');return {term:line.slice(0,split).trim(),application:line.slice(split+1).trim()};});plan.feedbackPoints=feedbackField.value.split('\n').map(v=>v.trim()).filter(Boolean);save.disabled=true;const r=await fetch('/api/teacher/materials/'+encodeURIComponent(data.lesson.topic.topicId),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision,plan})}),result=await r.json();if(!r.ok)throw Error(result.message||result.error||'저장하지 못했습니다.');revision=result.revision;showPreview(result.lesson);status.textContent='저장했습니다. 학생 화면과 다음 AI 요청에 반영됩니다.';await onSaved?.(result);}
   catch(error){status.textContent=error.message+' 입력 내용은 유지했습니다.';}finally{save.disabled=false;}
  });return form;
 };
})();
