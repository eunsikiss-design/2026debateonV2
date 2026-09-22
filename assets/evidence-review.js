(()=>{
 const $=id=>document.getElementById(id);let offset=0,total=0,requestId=0;
 const names={pending:'검수 전',approved:'승인',rejected:'보류'};
 const el=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
 async function api(url,body){const response=await fetch(url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const data=await response.json();if(!response.ok)throw Error(data.message||'교사 권한 또는 로그인 상태를 확인하세요.');return data;}
 async function load(){const id=++requestId;$('review-status').textContent='자료를 불러오는 중입니다.';
  try{const data=await api('/api/teacher/evidence?'+new URLSearchParams({status:$('review-state').value,sourceId:$('review-source').value,offset,limit:10}));if(id!==requestId)return;total=data.total;$('review-cards').replaceChildren();
   $('review-status').textContent=`총 ${total}개 · ${total?offset+1:0}~${Math.min(offset+10,total)}번째`;
   for(const card of data.cards){const panel=el('article','','cyber-panel');const stateLabel=el('p',names[card.reviewStatus],'evidence-note');panel.append(el('h2',card.source),stateLabel);
    const link=el('a','원문 새 창에서 보기','evidence-button');link.href=card.sourceUrl;link.target='_blank';link.rel='noopener';panel.append(link);
    const detail=el('details');detail.append(el('summary','추출된 발췌와 원문 나란히 보기'));
    const compare=el('div');compare.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px';compare.append(el('p',card.detail,'evidence-excerpt'));
    if(card.page){const frame=document.createElement('iframe');frame.title=card.source+' 원문';frame.loading='lazy';frame.style.cssText='width:100%;height:520px;border:1px solid #334155';detail.addEventListener('toggle',()=>{if(detail.open&&!frame.src)frame.src=card.sourceUrl;});compare.append(frame);}else compare.append(el('p','HWP는 원문 파일을 내려받아 해당 구역을 확인하세요.'));detail.append(compare);detail.open=true;panel.append(detail);
    const form=el('form'),label=el('label','검수 메모'),note=el('textarea');note.value=card.reviewNote||'';note.maxLength=2000;note.id='note-'+card.cardId;label.htmlFor=note.id;
    const checkLabel=el('label'),check=el('input');check.type='checkbox';checkLabel.append(check,document.createTextNode(' 원문 내용과 앞뒤 맥락을 직접 대조했습니다.'));
    const actions=el('div','','evidence-actions'),message=el('p');message.setAttribute('role','status');
    for(const [status,title] of [['approved','승인'],['rejected','보류'],['pending','검수 전으로 되돌리기']]){const button=el('button',title,'evidence-button');button.type='button';button.addEventListener('click',async()=>{
      if(status==='approved'&&!check.checked){message.textContent='원문 대조 확인란을 체크해 주세요.';return;}
      if(status==='rejected'&&!note.value.trim()){message.textContent='보류 사유를 메모에 적어 주세요.';return;}
      const controls=[...actions.querySelectorAll('button')];controls.forEach(b=>b.disabled=true);
      try{const result=await api('/api/teacher/evidence/review',{cardId:card.cardId,status,note:note.value,originalChecked:check.checked,revision:card.reviewRevision});card.reviewRevision=result.card.reviewRevision;card.reviewStatus=result.card.reviewStatus;stateLabel.textContent=names[card.reviewStatus];message.textContent=names[card.reviewStatus]+' 저장 완료 · 목록을 불러오면 필터에 반영됩니다.';}catch(error){message.textContent=error.message;}finally{controls.forEach(b=>b.disabled=false);}
    });actions.append(button);}form.append(label,note,checkLabel,actions,message);form.addEventListener('submit',event=>event.preventDefault());panel.append(form);$('review-cards').append(panel);
   }
   $('review-prev').hidden=offset===0;$('review-next').hidden=offset+10>=total;
  }catch(error){if(id===requestId)$('review-status').textContent=error.message;}
 }
 $('review-filter').addEventListener('submit',event=>{event.preventDefault();offset=0;load();});$('review-prev').onclick=()=>{offset=Math.max(0,offset-10);load();};$('review-next').onclick=()=>{offset+=10;load();};
 api('/api/auth/me').then(async data=>{if(data.user?.role!=='teacher')throw Error('원문 검수는 승인된 교사 계정에서 사용할 수 있습니다.');const sources=await api('/api/evidence/sources');for(const source of sources.sources){const option=el('option',source.documentTitle);option.value=source.sourceId;$('review-source').append(option);}$('review-filter').hidden=false;await load();}).catch(error=>{$('review-status').textContent=error.message;$('review-login').hidden=false;});
})();

