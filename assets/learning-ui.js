(() => {
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  function concepts(words){const box=node('div',undefined,'concept-list');if(!words?.length)box.append(node('p','이 주제에 등록된 핵심 단어가 없습니다. 자신의 말로 이유를 설명해도 좋아요.'));for(const w of words||[]){const item=node('details');item.append(node('summary',w.term),node('p',w.definition));box.append(item);}return box;}
  // Only divide the display: keep every character of the teacher's source text.
  function episodeParagraphs(story){
    const text=String(story||'');
    if(/\n/.test(text))return text.split(/(?<=\n)(?=[^\n])/);
    const paragraphs=[];let start=0;
    for(const boundary of text.matchAll(/(?<=[.!?])\s+(?=[가-힣“"'‘])/g)){
      const end=boundary.index+boundary[0].length,remaining=text.slice(end),length=end-start;
      const changesView=/^(그러나|하지만|반면|한편|이에 대해)\s/.test(remaining);
      // Keep an explanation with its preceding claim when the opposing view comes next.
      const nextSentence=remaining.search(/(?<=[.!?])\s+(?=[가-힣“"'‘])/);
      const contrastNext=nextSentence>=0&&/^(그러나|하지만|반면|한편|이에 대해)\s/.test(remaining.slice(nextSentence).trimStart());
      if(remaining.length>=40&&((changesView&&length>=40)||(!contrastNext&&(length>=180||(text.length<320&&length>=70))))){paragraphs.push(text.slice(start,end));start=end;}
    }
    paragraphs.push(text.slice(start));return paragraphs;
  }
  function scenario(s,advanced=false){
    const box=node('section',undefined,'what-if');box.setAttribute('aria-label',s.title||'생각을 여는 사례');
    const id=s.topicId||new URLSearchParams(location.search).get('topic')||'',unit=Number(id.split('_')[1])||1;
    const themes=['rights','rights','justice','economy','world','future'];const theme=id==='curriculum_1_02'?'justice':themes[unit]||'future';
    const visual=node('figure',undefined,'scenario-visual'),img=node('img');
    const suppliedImage=s.preserveEpisode&&/^episode2026_[1-5]_(?:0[1-9]|10)$/.test(id);
    img.src=suppliedImage?'/assets/scenarios/episodes/'+id+'.webp':'/assets/scenarios/'+theme+'.webp';
    img.alt=suppliedImage?`“${s.proposition}”에 관한 서로 다른 입장을 보여 주는 사례 만화`:'';
    img.loading='lazy';img.decoding='async';img.width=suppliedImage?2752:2100;img.height=suppliedImage?1536:700;
    if(suppliedImage){visual.classList.add('scenario-visual-episode');const link=node('a');link.href=img.src;link.target='_blank';link.rel='noopener';link.setAttribute('aria-label','사례 그림을 원본 크기로 보기');link.append(img);visual.append(link,node('figcaption','교사가 제공한 사례 그림 · 그림을 누르면 크게 볼 수 있습니다. 사례의 판단 근거는 아래 글을 확인하세요.'));}
    else visual.append(img,node('figcaption','단원 주제의 분위기를 표현한 가상 일러스트 · 인물의 구체적인 처지는 아래 내용을 확인하세요.'));
    box.append(visual,node('h3',s.title||'생각을 여는 사례'));
    if(s.characters?.length&&s.setting){box.append(node('p',s.setting,'scenario-setting'));const people=node('div',undefined,'scenario-characters');for(const [i,c]of s.characters.entries()){const card=node('article',undefined,'scenario-person');const head=node('div',undefined,'scenario-person-heading');const symbol=node('img',undefined,'app-icon');symbol.src='/assets/icons/user-round.svg';symbol.alt='';symbol.width=24;symbol.height=24;head.append(symbol,node('h4',c.name));card.append(head,node('p',c.context),node('strong','이 인물의 주장'),node('p',c.position,'scenario-position'));people.append(card);}box.append(people);}else for(const paragraph of episodeParagraphs(s.story))box.append(node('p',paragraph,'episode-paragraph'));
    if(s.preserveEpisode){box.classList.add('episode-verbatim');box.append(node('h4','핵심 교과 개념'),node('p',s.coreConceptText,'episode-source-text'),node('h4','필수 쟁점'),node('p',s.requiredIssues,'episode-source-text'));}
    if(s.complication)box.append(node('p',s.complication,'scenario-issue'));if(advanced&&s.advancedComplication)box.append(node('p',s.advancedComplication));if(s.perspectives&&!s.characters?.length){const positions=node('div',undefined,'issue-positions');for(const p of s.perspectives){const card=node('section',undefined,'issue-position');card.append(node('h4',p.label),node('p',p.reason));positions.append(card);}box.append(positions);}if(s.choiceQuestion)box.append(node('p',s.choiceQuestion,'scenario-question'));else if(s.invitation)box.append(node('p',s.invitation,'scenario-invitation'));return box;
  }
  function details(title,content){const d=node('details',undefined,'learning-details');d.append(node('summary',title),content);return d;}
  function rubric(items){const list=node('ul');for(const r of items)list.append(node('li',r.name+' — '+r.description));return list;}
  function activityCards(lesson){const grid=node('div',undefined,'activity-grid');for(const a of lesson.activities){const link=node('a',undefined,'activity-card');link.href=a.href+'?topic='+encodeURIComponent(lesson.topic.topicId);const icon=node('img',undefined,'activity-icon app-icon');icon.src='/assets/icons/'+({basic:'notebook-pen',advanced:'file-text',speech:'mic'})[a.id]+'.svg';icon.alt='';icon.width=48;icon.height=48;const heading=node('div',undefined,'activity-heading');heading.append(icon,node('h3',a.title));link.append(heading,node('p',a.description),node('strong','소크라AI와 이렇게 해요'),node('p',a.plan,'activity-plan'),node('span','시작하기 →','activity-start'));grid.append(link);}return grid;}
  window.LearningUI={node,concepts,scenario,details,rubric,activityCards};
})();
