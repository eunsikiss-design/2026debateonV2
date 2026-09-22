(() => {
  const $=id=>document.getElementById(id);
  const kinds={textbook:'교과서',glossary:'용어 사전','teacher-guide':'교사용 지도서',worksheet:'개념 확인 문제'};
  let requestNumber=0;
  function element(tag,text,className){const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;return node;}
  async function api(url){const res=await fetch(url);const body=await res.json();if(!res.ok)throw new Error(body.message||'자료를 불러오지 못했습니다.');return body;}
  function render(cards){
    $('evidence-results').replaceChildren();
    for(const card of cards){
      const panel=element('article','','cyber-panel');
      panel.append(element('span',kinds[card.category]||'교과 자료','tech-label'),element('h2',card.title));
      panel.append(element('p',card.source,'evidence-meta'),element('p',card.headingPath.join(' → '),'evidence-meta'));
      panel.append(element('p',card.reviewStatus==='approved'?'교사 원문 검수 승인':card.reviewStatus==='rejected'?'검수 보류 · 학생 제공 제외':'원문 자동 추출 · 교사 검토 전','evidence-note'),element('p',card.detail,'evidence-excerpt'));
      panel.append(element('p',card.keyConcepts.join(' · '),'evidence-meta'));
      const actions=element('div','','evidence-actions');const link=element('a','원문 보기','evidence-button');link.href=card.sourceUrl;link.target='_blank';link.rel='noopener';
      const cite=element('button','출처 연결하기','evidence-button');cite.type='button';cite.addEventListener('click',()=>{
        let field=panel.querySelector('textarea');if(!field){field=element('textarea','','evidence-citation');field.readOnly=true;field.setAttribute('aria-label','복사할 출처 정보');panel.append(field);}
        field.value=`[${card.cardId}] ${card.source}`;field.focus();field.select();
        const hint=panel.querySelector('.citation-hint');if(!hint)panel.append(element('p','선택된 출처를 복사해 내 글에 붙이고, 논거와 어떻게 연결되는지 직접 설명하세요.','citation-hint evidence-meta'));
      });actions.append(link,cite);panel.append(actions);$('evidence-results').append(panel);
    }
  }
  $('evidence-search').addEventListener('submit',async event=>{
    event.preventDefault();const query=$('evidence-query').value.trim();if(!query)return;const number=++requestNumber;
    $('search-status').textContent='교과 자료에서 근거를 찾고 있습니다.';
    try{const params=new URLSearchParams({q:query,sourceId:$('evidence-source').value,mode:$('evidence-mode').value});const data=await api('/api/evidence/search?'+params);if(number!==requestNumber)return;
      const mode=data.retrievalMode==='local-semantic-hybrid'?'의미 + 키워드 검색':'키워드 검색';
      render(data.cards);$('search-status').textContent=(data.cards.length?`관련 원문 ${data.cards.length}건 · ${mode}`:'관련성이 충분한 근거가 없습니다. 개념명으로 다시 검색해 주세요.')+(data.fallbackReason?' · 의미 검색을 사용할 수 없어 키워드로 검색했습니다.':'');
    }catch(error){if(number!==requestNumber)return;render([]);$('search-status').textContent=error.message+' 검색 버튼으로 다시 시도할 수 있습니다.';}
  });
  api('/api/evidence/sources').then(data=>{
    $('source-status').textContent=`열람 가능 자료 ${data.sources.length}개 · 지도서와 문제 자료는 교사 계정에서 표시됩니다.`;
    for(const source of data.sources){const option=element('option',source.documentTitle);option.value=source.sourceId;$('evidence-source').append(option);
      $('source-list').append(element('li',`${source.fileName} · ${source.integrityStatus==='current'?'원본 일치':'원본 변경·재추출 필요'} · ${source.chunkCount||0}개 발췌`));}
  }).catch(error=>{$('source-status').textContent=error.message;});
})();

