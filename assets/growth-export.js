(() => {
 'use strict';
 window.GrowthExport={mount({getReport,getUser,isBusy}){
  const download=document.getElementById('growth-download'),share=document.getElementById('growth-share'),status=document.getElementById('growth-export-status');
  let prepared=null,working=false,cacheKey='';
  const key=()=>{const r=getReport(),u=getUser();return r&&u?JSON.stringify([u.uid,r.topicId,r.fingerprint,r.analysis?.generatedAt||'']):'';};
  const supported=file=>{try{return typeof navigator.share==='function'&&typeof navigator.canShare==='function'&&navigator.canShare({files:[file]});}catch{return false;}};
  function update(){const next=key();if(cacheKey!==next){prepared=null;cacheKey=next;status.textContent='';}const disabled=working||isBusy()||!getReport()?.summary.recordCount||!getUser();download.disabled=share.disabled=disabled;share.textContent=prepared&&supported(prepared)?'공유창 열기':'카카오톡 등으로 공유';}
  async function prepare(){
   if(prepared)return prepared;
   const r=getReport(),u=getUser(),expected=key();
   const params=new URLSearchParams({topic:r.topicId||'',fingerprint:r.fingerprint,analysisAt:r.analysis?.generatedAt||''});
   const response=await fetch('/api/growth/student/'+encodeURIComponent(u.uid)+'/report.pdf?'+params,{cache:'no-store'});
   if(!response.ok){const body=await response.json().catch(()=>({}));throw Error(body.message||'PDF를 만들지 못했습니다. 다시 시도해 주세요.');}
   if(!response.headers.get('content-type')?.includes('application/pdf'))throw Error('PDF 응답을 확인하지 못했습니다. 다시 로그인해 주세요.');
   const blob=await response.blob();
   if(expected!==key()||isBusy())throw Error('선택한 기록이 변경되었습니다. 현재 화면에서 다시 시도해 주세요.');
   const encoded=/filename\*=UTF-8''([^;]+)/i.exec(response.headers.get('content-disposition')||'')?.[1];
   let name='DebateOn_역량분석.pdf';try{if(encoded)name=decodeURIComponent(encoded);}catch{}
   prepared=new File([blob],name,{type:'application/pdf'});return prepared;
  }
  function save(file){const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=file.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  download.onclick=async()=>{if(download.disabled)return;working=true;update();status.textContent='선택한 주제의 분석과 활동 원문으로 PDF를 만들고 있습니다.';try{save(await prepare());status.textContent='PDF 다운로드를 요청했습니다. 내려받은 파일을 카카오톡 대화방에 첨부할 수도 있습니다.';}catch(error){status.textContent=error.message;}finally{working=false;update();}};
  share.onclick=async()=>{
   if(share.disabled)return;
   if(!supported(prepared||new File([''],'report.pdf',{type:'application/pdf'}))){status.textContent='이 브라우저에서는 PDF 파일 공유를 지원하지 않습니다. PDF를 내려받은 뒤 카카오톡에서 파일을 첨부해 주세요.';return;}
   // A second click after PDF preparation preserves the user gesture required by mobile browsers.
   if(!prepared){working=true;update();status.textContent='공유할 PDF를 준비하고 있습니다.';try{await prepare();status.textContent='PDF가 준비되었습니다. 「공유창 열기」를 눌러 카카오톡과 받을 대화방을 선택하세요.';}catch(error){status.textContent=error.message;}finally{working=false;update();}return;}
   working=true;update();try{await navigator.share({files:[prepared],title:'DebateOn 나의 역량 분석'});status.textContent='공유창에 PDF를 전달했습니다. 실제 전송 여부는 선택한 앱에서 확인해 주세요.';}catch(error){status.textContent=error.name==='AbortError'?'공유를 취소했습니다. PDF는 다시 공유하거나 내려받을 수 있습니다.':'공유창을 열지 못했습니다. PDF를 내려받아 카카오톡에 첨부해 주세요.';}finally{working=false;update();}
  };
  update();return {update};
 }};
})();
