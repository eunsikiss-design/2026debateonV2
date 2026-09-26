'use strict';
const path=require('node:path');
const perspectives=['시간적 관점','공간적 관점','사회적 관점','윤리적 관점'];
const questions=['이 문제는 과거와 현재에 어떻게 달라졌으며 앞으로 어떤 영향을 미칠까요?','지역에 따라 이해관계와 영향은 어떻게 달라질까요?','관련 제도와 사회 구조는 누구에게 어떤 영향을 줄까요?','충돌하는 권리와 가치를 어떤 기준으로 조정할 수 있을까요?'];
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
function build(portfolio,revision){
 const saved=portfolio.saved;
 if(!saved)fail('분석한 초안을 먼저 저장하세요.',409);
 if(Number(revision)!==saved.revision)fail('저장된 버전이 변경되었습니다. 다시 불러온 뒤 다운로드하세요.',409);
 const sources=saved.evidence||[];
 const generated=saved.generated||{};
 const integratedThinking=perspectives.map((perspective,i)=>generated.integratedThinking?.find(a=>a.perspective===perspective)||{perspective,status:'insufficient',finding:'이 관점의 분석이 저장되어 있지 않습니다. 원문을 다시 분석하여 확인할 수 있습니다.',nextStep:questions[i],evidence:[]});
 const feedback=generated.feedback?.length?generated.feedback:[{focus:'다음 토론을 위한 점검 질문',finding:'개별 피드백 분석이 저장되어 있지 않습니다. 아래 내용은 일반적인 연습 제안입니다.',nextStep:'자신의 주장에 연결되는 근거를 확인하고, 다른 의견의 핵심에 답한 뒤 대안이 성립하는 조건을 덧붙여 보세요.',evidence:[]}];
 return {student:portfolio.student,revision:saved.revision,updatedAt:saved.updatedAt,status:saved.status,draftText:saved.draftText,sources,analysis:generated.analysis||[],sentences:generated.sentences||[],integratedThinking,feedback,notice:generated.notice||'교사가 저장한 세특 초안입니다.',generatedAt:generated.generatedAt||null};
}
const date=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'날짜 미등록';
const status=r=>r.student.isTestAccount?'가상 학생 시험용':r.status==='teacher-reviewed'?'교사 검토 완료':'교사 검토 전 초안';
function sections(r){
 const refText=refs=>(refs||[]).map(ref=>{const i=r.sources.findIndex(s=>s.id===ref.sourceId);return `[근거 ${i+1}] ${ref.quote}`;}).join('\n');
 const activity=[...new Set(r.sources.map(s=>s.label))].map(label=>`${label} ${r.sources.filter(s=>s.label===label).length}건`).join(' / ');
 return [
  {title:'활동 보고서',items:[['학생',`${r.student.grade}학년 ${r.student.classId}반 · ${r.student.studentNumber||''} · ${r.student.name||''}`],['저장 상태',`${status(r)} · 버전 ${r.revision}`],['저장 시각',date(r.updatedAt)],['분석 범위',`저장할 때 선택한 기록 ${r.sources.length}건 (${activity})`],['주제',[...new Set(r.sources.map(s=>s.title))].join('\n')],['분석 안내',r.notice]]},
  {title:'세특 연계 내용',items:[['교사가 저장한 세특',r.draftText],...r.sentences.map((s,i)=>[`생성 문장 ${i+1}`,s.text+'\n'+refText(s.evidence)]),['연결 확인','생성 문장과 인용은 분석 당시의 연결입니다. 교사가 수정한 세특과의 일치 여부는 원문을 함께 확인하세요.']]},
  {title:'통합적 사고역량',items:r.integratedThinking.flatMap(a=>[[a.perspective,`${a.status==='observed'?'원문 근거 확인':'추가 확인 필요'}\n${a.finding}${a.evidence.length?'\n'+refText(a.evidence):''}`],['다음 탐구 질문',a.nextStep]])},
  {title:'토론활동 분석과 피드백',items:[...r.analysis.map(a=>[a.competency,a.finding+'\n'+refText(a.evidence)]),...r.feedback.map(a=>[a.focus,`${a.finding}\n다음 활동: ${a.nextStep}${a.evidence.length?'\n'+refText(a.evidence):''}`])]}
 ];
}
// Runtime downloads use portable Node dependencies, independent of the authoring workstation.
function textChunks(text,limit){const chunks=[];let chunk='',lines=1;for(const c of String(text)){if(chunk.length>=limit||(c==='\n'&&lines>=12)){chunks.push(chunk);chunk='';lines=1;}chunk+=c;if(c==='\n')lines++;}if(chunk||!chunks.length)chunks.push(chunk);return chunks;}
async function xlsx(r){
 const ExcelJS=require('exceljs'),wb=new ExcelJS.Workbook();wb.creator='DebateOn';wb.created=new Date();
 const main=wb.addWorksheet('활동 보고서',{views:[{state:'frozen',ySplit:2,showGridLines:false}]});
 main.columns=[{width:27},{width:100}];
 function row(sheet,values,header=false){const result=sheet.addRow(values);result.font={name:'맑은 고딕',size:11,color:{argb:'FF172B3A'},bold:header};result.alignment={vertical:'top',wrapText:true};result.height=header?28:Math.max(26,...values.map((v,i)=>String(v??'').split('\n').reduce((n,l)=>n+Math.max(1,Math.ceil([...l].reduce((w,c)=>w+(c.charCodeAt(0)>255?2:1),0)/(sheet.columns[i].width-3))),0)*16+10));if(header){result.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE9EFF4'}};}return result;}
 row(main,['DebateOn','학생별 토론활동 보고서'],true);
 row(main,['보고서 기준','저장한 세특과 선택 근거를 함께 내보냅니다.']);
 for(const section of sections(r)){
  row(main,[section.title,null],true);
  for(const [label,text] of section.items){textChunks(text,480).forEach((chunk,i)=>row(main,[i?label+' (계속)':label,chunk]));}
 }
 const source=wb.addWorksheet('원문 근거',{views:[{state:'frozen',ySplit:1,showGridLines:false}]});source.columns=[{width:10},{width:21},{width:30},{width:27},{width:90}];
 row(source,['근거','활동','주제','작성 시각 (한국)','학생 원문 / 교사 관찰'],true);
 r.sources.forEach((s,i)=>{textChunks(s.text,350).forEach((chunk,j)=>{const written=s.createdAt&&Number.isFinite(Date.parse(s.createdAt))?new Date(Date.parse(s.createdAt)+9*60*60*1000):'날짜 미등록';const line=row(source,[String(i+1)+(j?' (계속)':''),s.label,s.title,written,chunk]);if(written instanceof Date)line.getCell(4).numFmt='yyyy-mm-dd hh:mm';});});
 for(const sheet of [main,source]){sheet.pageSetup={paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0};sheet.headerFooter.oddFooter='&L'+(r.student.isTestAccount?'가상 학생 시험용':'DebateOn')+'&R&P / &N';}
 return Buffer.from(await wb.xlsx.writeBuffer());
}
async function pdf(r){
 const PDFDocument=require('pdfkit');
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:'A4',margins:{top:48,bottom:56,left:48,right:48},bufferPages:true,info:{Title:'학생별 토론활동 보고서',Author:'DebateOn'}}),chunks=[];
  doc.on('data',c=>chunks.push(c));doc.on('error',reject);doc.on('end',()=>resolve(Buffer.concat(chunks)));
  try{
   doc.font(path.join(__dirname,'../assets/fonts/NanumGothic-Regular.ttf'));
   const width=doc.page.width-96;
   const body=(text,size=10,color='#213547')=>{doc.fontSize(size).fillColor(color).text(String(text),{width,lineGap:5,paragraphGap:6});doc.moveDown(.4);};
   const heading=text=>{if(doc.y>doc.page.height-140)doc.addPage();body(text,15,'#12606B');};
   body('DebateOn',11,'#12606B');body('학생별 토론활동 보고서',23);body(status(r),10);
   for(const section of sections(r)){heading(section.title);for(const [label,text] of section.items){if(doc.y>doc.page.height-100)doc.addPage();body(label,11,'#12606B');body(text);}}
   doc.addPage();heading('원문 근거');
   r.sources.forEach((s,i)=>{if(doc.y>doc.page.height-140)doc.addPage();body(`[근거 ${i+1}] ${s.label} · ${s.title}`,11,'#12606B');body(date(s.createdAt),9,'#526579');body(s.text);});
   const pages=doc.bufferedPageRange();for(let i=0;i<pages.count;i++){doc.switchToPage(i);const bottom=doc.page.margins.bottom;doc.page.margins.bottom=0;doc.fontSize(8).fillColor('#526579').text(`${r.student.isTestAccount?'가상 학생 시험용 · ':''}${r.student.studentNumber||''} · 저장 버전 ${r.revision}       ${i+1} / ${pages.count}`,48,doc.page.height-35,{width,height:20,lineBreak:false});doc.page.margins.bottom=bottom;}
   doc.end();
  }catch(e){doc.destroy();reject(e);}
 });
}
module.exports={build,sections,xlsx,pdf};
