(() => {
  const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  function concepts(words){const box=node('div',undefined,'concept-list');if(!words?.length)box.append(node('p','이 주제에 등록된 핵심 단어가 없습니다. 자신의 말로 이유를 설명해도 좋아요.'));for(const w of words||[]){const item=node('details');item.append(node('summary',w.term),node('p',w.definition));box.append(item);}return box;}
  function scenario(s){const box=node('section',undefined,'what-if');box.setAttribute('aria-label','만약에');box.append(node('span','생각을 시작하는 수업용 이야기','learning-kicker'),node('h3','만약에'),node('p',s.story),node('p',s.complication),node('p',s.invitation,'scenario-invitation'));return box;}
  function details(title,content){const d=node('details',undefined,'learning-details');d.append(node('summary',title),content);return d;}
  function rubric(items){const list=node('ul');for(const r of items)list.append(node('li',r.name+' — '+r.description));return list;}
  function activityCards(lesson){const grid=node('div',undefined,'activity-grid');for(const a of lesson.activities){const link=node('a',undefined,'activity-card');link.href=a.href+'?topic='+encodeURIComponent(lesson.topic.topicId);const icon=node('span',a.icon,'activity-icon');icon.setAttribute('aria-hidden','true');link.append(icon,node('h3',a.title),node('p',a.description),node('strong','소크라AI와 이렇게 해요'),node('p',a.plan,'activity-plan'),node('span',a.title+' 시작 →','activity-start'));grid.append(link);}return grid;}
  window.LearningUI={node,concepts,scenario,details,rubric,activityCards};
})();
