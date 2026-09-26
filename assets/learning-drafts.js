(() => {
 const sessions=new Set();
 async function fetchDrafts(topic){const r=await fetch('/api/learning/drafts/'+encodeURIComponent(topic),{cache:'no-store'}),d=await r.json();if(!r.ok)throw Error(d.error||'초안을 불러오지 못했습니다.');return d;}
 async function open(topic,mode,status){
  const data=await fetchDrafts(topic),stored=data.drafts[mode];let revision=stored?.revision||0,pending=null,timer=null,running=null,blocked=false;
  const session={content:stored?.content||data.previous.filter(p=>p.mode===mode).at(-1)?.content||null,
   schedule(content){status.dataset.draftUnsaved='true';if(blocked)return;pending=structuredClone(content);clearTimeout(timer);status.textContent='초안 저장 중입니다.';timer=setTimeout(()=>session.flush().catch(()=>{}),600);},
   async flush(){clearTimeout(timer);if(running)await running;if(blocked)throw Error(status.textContent);if(!pending)return;const content=pending;pending=null;
    running=(async()=>{try{const r=await fetch('/api/learning/drafts/'+encodeURIComponent(topic),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,content,revision})}),d=await r.json();if(!r.ok){if(r.status===409)blocked=true;throw Error(d.error||'초안 저장에 실패했습니다.');}revision=d.draft.revision;session.content=content;if(!pending)status.dataset.draftUnsaved='false';status.textContent='이 주제의 초안이 저장되었습니다.';}catch(e){pending??=content;status.textContent=e.message+' 작성한 내용은 현재 화면에 남아 있습니다.';throw e;}finally{running=null;}})();await running;if(pending&&!blocked)await session.flush();},
   close(){clearTimeout(timer);sessions.delete(session);}
  };sessions.add(session);status.textContent=stored?'저장된 초안을 불러왔습니다.':'입력한 내용은 자동으로 초안에 저장됩니다.';return session;
 }
 async function flushAll(){await Promise.all([...sessions].map(s=>s.flush()));}
 document.addEventListener('click',async e=>{const a=e.target.closest('a[href]');if(!a||e.defaultPrevented||e.ctrlKey||e.metaKey||e.shiftKey||a.target==='_blank'||a.origin!==location.origin||a.hash&&a.pathname===location.pathname)return;if(!sessions.size)return;e.preventDefault();try{await flushAll();location.href=a.href;}catch{}});
 window.addEventListener('beforeunload',e=>{if(document.querySelector('[data-draft-unsaved="true"]')){e.preventDefault();e.returnValue='';}});
 window.LearningDrafts={open,fetch:fetchDrafts,flushAll};
})();
