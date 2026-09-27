'use strict';
const path=require('node:path');
const {AXES}=require('./studentGrowthService');
const date=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'미확인';
const names={basic:'기초 연습',advanced:'심화 논술',speech:'스피치 전사',debate:'토론 발언'};
function build(report,analysis){
 if(!report.sources.length)throw Object.assign(Error('PDF로 저장할 활동 원문이 없습니다.'),{status:400});
 const current=analysis?.fingerprint===report.fingerprint?analysis:null;
 const ref=entries=>(entries||[]).map(e=>{const i=report.sources.findIndex(s=>s.id===e.sourceId);return i<0?'':`[원문 ${i+1}] ${e.quote}`;}).filter(Boolean).join('\n');
 const scope=report.topicId?report.topics.find(t=>t.topicId===report.topicId)?.title||'선택한 주제':'전체 주제';
 const s=report.summary;
 const sections=[
  {title:'나의 활동과 분석 범위',items:[['학생',`${report.student.grade}학년 ${report.student.classId}반 · ${report.student.studentNumber||''} · ${report.student.name||''}`],['분석할 주제',scope],['저장된 활동',`내용이 다른 원문 ${s.recordCount}건 · 주제 ${s.topicCount}개 · 비교 가능한 활동 ${s.comparisonCount}개\n저장·완료 ${s.savedCount}건 / 작성 중인 초안 ${s.draftCount}건\n${Object.entries(names).map(([kind,label])=>`${label} ${s.counts[kind]||0}건`).join(' · ')}`],['분석 상태',current?`${current.source==='gemini-api'?'소크라AI 분석':'원문 점검 안내 (AI 분석 미완료)'} · ${date(current.generatedAt)}`:'최신 원문에 대한 분석이 저장되지 않았습니다. 아래 질문은 일반적인 점검 안내입니다.'],['분석 안내',current?.notice||'원문이 없는 역량은 판단하지 않습니다. AI 분석은 교사의 최종 평가가 아닙니다.'],...(current?[['AI가 검토한 범위',`원문 ${current.analyzedCount}건${current.excludedCount?` · 분량 제한으로 제외 ${current.excludedCount}건`:''}${current.truncatedCount?` · 긴 원문 ${current.truncatedCount}건은 앞부분 40,000자만 분석`:''}. 부록에는 선택한 범위의 활동 원문 전체를 싣습니다.`]]:[])]},
  {title:'원문으로 살펴보는 다섯 역량',items:(current?.axes||AXES).flatMap(a=>[[a.label,`${a.status==='observed'?'원문 근거 연결':a.status==='insufficient'?'추가 확인 필요':'분석 미완료'}\n${a.finding||'저장한 원문을 바탕으로 이 역량을 살펴보세요.'}${a.evidence?.length?'\n'+ref(a.evidence):''}`],['다음 연습',a.nextStep||a.question]])},
  {title:'처음 쓴 글에서 다시 쓴 글로',items:report.comparisons.length?report.comparisons.map(p=>{const before=report.sources.findIndex(s=>s.id===p.beforeId),after=report.sources.findIndex(s=>s.id===p.afterId),change=current?.changes?.find(c=>c.beforeId===p.beforeId&&c.afterId===p.afterId);return [`${p.title} · ${names[p.kind]}`,`앞선 기록: [원문 ${before+1}] ${date(p.beforeAt)}\n이후 기록: [원문 ${after+1}] ${date(p.afterAt)}\n${change?change.finding+'\n'+ref(change.evidence)+'\n다음 연습: '+change.nextStep:'두 원문을 비교할 수 있습니다. 변화를 성장으로 판정한 분석은 아직 없습니다.'}`];}):[['비교할 기록','같은 주제·활동에서 서로 다른 시점에 저장한 두 원문이 있어야 비교합니다. 같은 글의 반복 저장과 작성 중인 초안은 변화 비교에서 제외합니다.']]},
  {title:'분석 기준과 읽는 방법',items:[['판단의 근거','원문의 개념 적용, 이유와 근거, 논리 연결, 다른 입장에 대한 응답, 글의 표현을 검토합니다. 기록 수나 글자 수를 점수·등급으로 환산하지 않습니다.'],['해석의 한계','전사문만으로 발음·목소리·태도를 평가하지 않습니다. 추가 확인이 필요하다는 표시는 낮은 능력을 뜻하지 않습니다. 분석의 타당성과 최종 평가는 교사가 확인합니다.']]}
 ];
 return {student:report.student,scope,sections,sources:report.sources,exportedAt:new Date().toISOString()};
}
function filename(report){const safe=String(report.student.studentNumber||'학생').replace(/[^0-9A-Za-z_-]/g,'').slice(0,24)||'학생',day=new Date(Date.parse(report.exportedAt)+9*60*60*1000).toISOString().slice(0,10);return `DebateOn_${safe}_역량분석_${day}.pdf`;}
async function pdf(report){
 const PDFDocument=require('pdfkit');
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'A4',margins:{top:48,bottom:56,left:48,right:48},bufferPages:true,info:{Title:'나의 역량 분석 보고서',Author:'DebateOn'}}),chunks=[];
  doc.on('data',chunk=>chunks.push(chunk));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));
  try{
   doc.font(path.join(__dirname,'../assets/fonts/NanumGothic-Regular.ttf'));
   const width=doc.page.width-96;
   const body=(text,size=10,color='#213547')=>{doc.fontSize(size).fillColor(color).text(String(text),48,doc.y,{width,lineGap:4,paragraphGap:5});doc.moveDown(.45);};
   const space=height=>{if(doc.y+height>doc.page.height-doc.page.margins.bottom)doc.addPage();};
   const heading=text=>{space(95);body(text,16,'#12606B');};
   body('DebateOn · MY LEARNING',10,'#12606B');body('나의 역량 분석 보고서',24);body('비교보다, 나의 변화',13);body(`출력 시각 ${date(report.exportedAt)} (한국 시간)`,9,'#526579');
   if(report.student.isTestAccount)body('가상 학생 시험용',10,'#855600');
   for(const section of report.sections){heading(section.title);for(const [label,text] of section.items){space(70);body(label,11,'#12606B');body(text);}}
   doc.moveDown(1);space(180);heading('부록 · 분석에 연결된 활동 원문');body('본문의 [원문 번호]와 연결됩니다. 작성 중인 초안은 잠정 기록으로 표시합니다.',9,'#526579');
   report.sources.forEach((s,i)=>{space(110);body(`[원문 ${i+1}] ${s.title}`,12,'#12606B');body(`${s.label||names[s.kind]} · ${s.status==='draft'?'작성 중인 초안':s.status==='snapshot'?'저장본':'완료 기록'}\n${date(s.createdAt)} (한국 시간)`,9,'#526579');body(s.text);});
   const pages=doc.bufferedPageRange();for(let i=0;i<pages.count;i++){doc.switchToPage(i);doc.page.margins.bottom=0;doc.fontSize(8).fillColor('#526579').text(`DebateOn · ${report.student.studentNumber||''} · 나의 역량 분석     ${i+1} / ${pages.count}`,48,doc.page.height-34,{width,height:20,lineBreak:false});}
   doc.end();
  }catch(error){doc.destroy();reject(error);}
 });
}
module.exports={build,filename,pdf};
