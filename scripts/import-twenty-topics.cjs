'use strict';
// Input is the teacher-supplied integrated JSON. No external AI requests.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),source=process.argv[2];
if(!source)throw Error('Provide the integrated source JSON path');
function normalize(value){if(Array.isArray(value))return value.map(normalize);if(value&&typeof value==='object'){const keys=Object.keys(value);if(keys.length&&keys.every((k,i)=>k===String(i)))return keys.map(k=>normalize(value[k]));return Object.fromEntries(keys.map(k=>[k,normalize(value[k])]));}return value;}
const input=normalize(JSON.parse(fs.readFileSync(source,'utf8')));
const workbookPath=process.argv[3];
if(!workbookPath)throw Error('Provide extracted workbook cells as the second input');
const workbook=JSON.parse(fs.readFileSync(workbookPath,'utf8'));
const workbookRows=workbook.rows.filter(r=>/^\d+$/.test(r.cells.A||''));
if(workbook.sheet!=='20대 정예논제 총괄 총람'||workbookRows.length!==20)throw Error('Expected the 20-topic workbook sheet');
for(const s of input){const row=workbookRows.find(r=>r.cells.B===s.unitCode);if(!row||['E','G','H','I'].some(c=>!row.cells[c]))throw Error('Missing mandatory workbook cells: '+s.unitCode);Object.assign(s,{topic:row.cells.E,concepts:row.cells.G,episode:row.cells.H,issues:row.cells.I});}
if(input.length!==20||new Set(input.map(x=>x.no)).size!==20)throw Error('Expected exactly 20 unique topics');
// Classroom adaptations: preserve the dispute, make each stakeholder visible,
// and distinguish fictional conditions from real statistics/legal findings.
const rows=[
 ['의무 투표제','김지호 취업준비생','청년 일자리 예산이 줄어 취업 준비 지원을 받기 어렵습니다. 낮은 청년 참여율 때문에 청년의 요구가 충분히 전달되지 않는다고 생각합니다.','이서진 법학도','지지할 후보가 없어 기권하려고 합니다. 벌금을 피하려고 원하지 않는 선택을 해야 할까 걱정합니다.','대표성을 높이기 위한 투표 의무와 기권할 자유를 비교하고, 불참 예외와 의사 표현 방법을 포함한 제도를 제안하시오.','의무 투표제를 도입해야 한다'],
 ['노키즈존','정태훈 카페 운영자','매장에서 어린이의 화상 사고를 겪은 뒤 배상 부담과 재발 위험을 걱정합니다. 직원 한 명으로 안전을 관리하기 어렵습니다.','박수현 보호자','아이와 조용히 이용하려고 해도 나이만으로 입장을 거절당합니다. 아이가 있는 가족이 이용할 수 있는 공간이 줄어 불편합니다.','영업의 자유와 아동의 평등권이 충돌하는 상황을 분석하고, 출입 제한의 기준과 덜 제한적인 대안을 제안하시오.','영업장의 노키즈존 설정을 허용해야 한다'],
 ['피의자 신상 공개','김안전 유가족 대표','흉기 사건으로 가족을 잃었습니다. 비슷한 피해를 막기 위해 수사 중인 피의자의 신상 공개를 요구합니다.','윤성호 국선변호인','혐의가 확정되지 않은 피의자를 변호합니다. 수사 오류가 밝혀져도 공개된 정보와 가족에 대한 피해를 되돌리기 어렵다고 걱정합니다.','알 권리와 안전, 무죄 추정과 인격권을 비교하고 판결 전 신상 공개의 요건과 피해 방지 절차를 논증하시오.','사법 판결 전이라도 흉악범죄 피의자의 신상 공개를 확대해야 한다'],
 ['재난과 기본권 제한','정안전 방역 담당자','감염 환자가 늘어 중환자 병상이 부족합니다. 감염을 줄이기 위해 마스크 착용과 영업시간 제한을 제안합니다.','최영업 식당 운영자','저녁 손님이 매출의 대부분인데 영업시간 제한이 이어져 임대료를 내기 어렵습니다. 환기와 인원 제한으로 영업을 이어가기를 원합니다.','공공복리와 기본권을 비교하고 방역 조치의 필요성, 최소 침해, 보완책을 기준으로 정당성과 한계를 논증하시오.','감염병 재난 시 공공복리를 위해 법률로 시민의 기본권을 제한할 수 있다'],
 ['촉법소년 기준 연령','김회복 피해학생 보호자','만 13세 학생의 폭행으로 자녀가 치료를 받고 있습니다. 같은 학생과 다시 마주칠까 두려워하는 자녀를 위해 책임 강화와 보호를 요구합니다.','이교화 변호인','가해 학생 강민우가 폭력적인 가정환경에서 자랐다는 점을 확인했습니다. 책임을 묻되 상담·교육과 분리 보호가 재범을 줄이는 데 중요하다고 생각합니다.','응보와 범죄 예방의 관점에서 형사책임 연령 하향을 비교하고 피해자 보호와 재범 방지를 함께 달성할 방안을 논증하시오.','촉법소년 기준 연령을 만 14세에서 만 12세로 낮추어야 한다'],
 ['적극적 평등 실현 조치','김도윤 수험생','교육 시설과 사교육 기회가 적은 농촌에서 공부했습니다. 지역인재 전형을 통해 진학하고 고향의 의료 부족을 해소하는 일을 하고 싶습니다.','박현우 수험생','일반 전형에서 높은 점수를 받았지만 불합격했습니다. 거주 지역이 다르다는 이유로 기회가 달라지는 것이 자신의 노력을 충분히 존중하지 않는다고 생각합니다.','출발 조건과 개인의 노력을 함께 고려하여 적극적 평등 실현 조치의 정당성과 대상 선정 기준을 논증하시오.','대학 입시와 공공 채용의 적극적 평등 실현 조치는 정당하다'],
 ['사형제 폐지','이진석 유가족 대표','가족이 억울한 판결을 받은 경험 때문에 돌이킬 수 없는 처벌을 걱정합니다. 오판을 바로잡을 기회를 남겨야 한다고 생각합니다.','김책임 범죄피해자 보호자','강력범죄로 가족을 잃었습니다. 가해자의 책임에 맞는 처벌과 재발 방지가 충분히 보장되기를 원합니다.','생명권, 응보, 오판 위험과 범죄 예방을 비교하여 사형제 존폐와 대체 형벌의 조건을 논증하시오.','사형제도를 전면 폐지해야 한다'],
 ['일수벌금제','이균형 일용직 노동자','같은 위반으로 부과된 벌금 때문에 생활비를 마련하기 어렵습니다. 소득이 많은 사람에게 같은 액수가 같은 부담인지 의문을 가집니다.','박기준 자영업자','매출이 일정하지 않아 재산과 소득 평가에 오류가 생길까 걱정합니다. 같은 잘못에는 같은 기준을 적용해야 한다고 생각합니다.','형식적 평등과 실질적 평등을 비교하여 일수벌금제의 정당성, 경제력 산정 방식과 이의 절차를 제안하시오.','소득과 재산에 따라 벌금 액수를 차등 부과하는 일수벌금제를 도입해야 한다'],
 ['성적 중심 입시의 공정성','정성적 수험생','오랫동안 시험 준비에 힘써 높은 점수를 받았습니다. 평가 기준이 여러 개가 되면 합격 기준을 예측하기 어려워질까 걱정합니다.','최기회 수험생','가족 돌봄과 공부를 병행하여 학습 시간이 부족합니다. 점수만으로는 주어진 기회와 노력의 차이를 충분히 설명할 수 없다고 생각합니다.','시험 성적의 객관성과 학습 기회의 격차를 비교하고 공정한 입시 선발 기준과 절차를 제안하시오.','대학 입시에서 시험 성적과 학업 능력만을 유일한 선발 기준으로 삼아야 한다'],
 ['패스트 패션 규제','서유진 환경단체 대표','버려진 의류가 쌓인 지역의 환경 피해를 조사하고 있습니다. 생산자가 폐기 비용을 부담해야 한다고 생각합니다.','박진우 의류 유통업자','저렴한 옷을 찾는 소비자에게 의류를 판매합니다. 추가 비용이 가격에 반영되면 저소득 소비자와 작은 가게가 부담을 질까 걱정합니다.','의류 생산의 외부 비용과 소비자 부담을 분석하고 규제, 기술 개선, 윤리적 소비를 조합한 방안을 논증하시오.','패스트 패션의 생산과 유통에 환경 규제를 도입해야 한다'],
 ['기업 초과 이익과 횡재세','이옥순 음식점 운영자','에너지 가격 상승으로 난방비를 감당하기 어려워졌습니다. 외부 위기로 큰 이익을 얻은 기업이 취약계층 지원을 분담하기를 바랍니다.','정투자 정유업체 대표','가격이 떨어진 시기의 손실을 부담했고 새 에너지 설비 투자도 계획하고 있습니다. 일시적 이익에 추가 과세하면 장기 투자가 어려워질까 걱정합니다.','초과 이익의 발생 원인과 조세 형평성을 분석하고 횡재세의 과세 기준, 사용처와 투자 위축 보완책을 제안하시오.','고유가·고금리 시기 기업의 초과 이익에 횡재세를 부과해야 한다'],
 ['배달 수수료 상한제','박성철 음식점 운영자','배달 앱 의존도가 높아 중개 비용이 올라가도 거래를 끊기 어렵습니다. 원재료비와 임대료를 내고 나면 소득이 적습니다.','최혁신 플랫폼 운영자','배차 시스템과 서버를 유지하고 새로운 서비스를 개발합니다. 수수료를 제한하면 서비스 축소나 배달비 인상이 필요해질까 걱정합니다.','플랫폼 시장의 독과점과 정부 개입의 부작용을 분석하고 수수료 규제 및 대안의 조건을 논증하시오.','배달 플랫폼 중개 수수료에 법적 상한제를 도입해야 한다'],
 ['대형마트 영업 규제 완화','이지은 맞벌이 소비자','평일에는 장을 볼 시간이 부족합니다. 일요일에 마트가 닫히면 온라인으로 주문하므로 휴업이 지역시장 이용으로 이어지지 않는다고 생각합니다.','최노동 마트 노동자','일요일 휴무가 가족과 함께 쉬는 중요한 시간입니다. 휴업일을 평일로 옮기면 주말 휴식과 돌봄 일정을 지키기 어려워집니다.','소비자 편익, 지역상권과 노동자의 휴식을 비교하고 의무휴업 및 배송 규제의 조정 조건을 논증하시오.','대형마트 의무휴업을 평일로 전환하고 새벽·온라인 배송 규제를 완화해야 한다'],
 ['다국적 기업과 경제 자립','민성장 경제 담당자','외국 기업의 공장 투자로 일자리와 도로가 생기기를 기대합니다. 지역 기업에도 기술과 거래 기회가 전달되기를 원합니다.','라니 현지 노동자 대표','새 공장에서 급여를 받지만 긴 근무시간과 안전장비 부족을 겪고 있습니다. 이익과 기술이 현지에 남지 않으면 경제가 한 기업에 의존할까 걱정합니다.','다국적 기업의 고용·기술 이전 효과와 노동·환경 문제를 비교하고 자립적 발전을 위한 투자 조건을 제안하시오.','다국적 기업의 투자는 개발도상국의 자립적 경제 발전에 기여한다'],
 ['세계화와 문화 다양성','김융합 음악가','전통 음악과 현대 음악을 결합한 영상을 해외에 알립니다. 디지털 플랫폼이 작은 문화도 새 청중을 만날 기회를 준다고 생각합니다.','타히티 지역문화 활동가','마을의 전통 언어 수업에 참여하는 청소년이 줄어 걱정합니다. 대규모 자본이 만든 콘텐츠에 지역 문화가 밀려날 수 있다고 생각합니다.','문화 융합과 획일화 사례를 비교하고 세계화 속 소수 문화의 지속과 교류를 돕는 조건을 논증하시오.','세계화는 문화 다양성을 증진한다'],
 ['난민 수용과 세계시민의 책임','아흐마드 난민 신청자','분쟁과 박해를 피해 가족과 피신했습니다. 안전하게 심사를 받고 정착하여 지역사회에 기여하기를 바랍니다.','김지역 주민 대표','임시 거주시설 인근에서 생활합니다. 주거·교육·의료 지원을 함께 준비하고 주민의 우려를 설명할 절차가 필요하다고 생각합니다.','보편적 인권과 지역사회의 수용 여건을 비교하고 난민 심사, 정착 지원과 갈등 조정 방안을 논증하시오.','인도적 차원에서 난민 수용을 대폭 확대해야 한다'],
 ['인구 감소와 이민 확대','강태식 제조업체 대표','구인 공고를 내도 인력을 구하기 어려워 공장 가동을 줄이고 있습니다. 이주 노동자가 안정적으로 일할 수 있는 제도를 원합니다.','최진우 노동연구자','일손 부족의 원인에 임금과 근로조건도 포함된다고 봅니다. 이민 확대와 함께 국내외 노동자의 권리와 사회통합 지원을 갖춰야 한다고 생각합니다.','생산가능인구 감소와 노동조건을 함께 분석하고 이민 확대의 범위와 사회통합 정책을 제안하시오.','인구 감소에 대응해 외국인 이민과 이주 노동자 수용을 대폭 확대해야 한다'],
 ['탄소세와 정의로운 전환','이기후 학생 대표','폭염과 집중호우로 미래의 생활환경이 나빠질까 걱정합니다. 탄소 배출의 비용을 가격에 반영하고 세수를 전환 지원에 쓰기를 원합니다.','김철호 제조업체 대표','현재 설비로는 화석연료 사용을 바로 줄이기 어렵습니다. 탄소세가 급히 도입되면 일자리와 제품 가격에 부담이 생길까 걱정합니다.','세대 간 정의와 현재의 산업·가계 부담을 비교하고 탄소세의 도입 속도와 세수 활용 방안을 논증하시오.','기후위기 대응을 위해 탄소세 도입을 법적으로 의무화해야 한다'],
 ['자동화와 로봇세','이미숙 서비스 노동자','조리와 주문 업무가 자동화되면서 일자리를 잃었습니다. 새 일을 배우는 동안의 생계와 재교육 기회가 필요합니다.','최건우 로봇기업 대표','자동화 기술을 개발하며 투자금을 마련하고 있습니다. 세금의 대상이 불분명하거나 부담이 크면 기술 개발과 새 일자리 창출이 위축될까 걱정합니다.','자동화의 생산성 향상과 고용 변화를 분석하고 로봇세의 과세 대상, 재분배 효과와 혁신 지원을 논증하시오.','AI와 로봇 자동화로 인한 실업에 대비해 로봇세를 신설해야 한다'],
 ['난민 심사와 지속가능한 공존','한인권 변호사','박해를 피해 온 가족의 난민 심사를 돕고 있습니다. 신청자별 사정을 충분히 살피고 위험한 곳으로 돌려보내지 않기를 요구합니다.','김안보 주민 대표','정착 지원 시설과 생활 기반을 함께 이용하게 됩니다. 심사의 신뢰성과 지원 예산의 배분, 주민과 신청자의 안전을 확인하고 싶습니다.','강제송환금지와 공정한 심사, 정착 지원 비용을 함께 고려하여 지속가능한 난민 수용·지원 절차를 제안하시오.','국제 난민 협약에 따라 난민 신청자를 인도주의적 관점에서 적극 수용해야 한다']
];
const oldKeywords=JSON.parse(fs.readFileSync(path.join(root,'data/keywords.json')));
const dictionary=JSON.parse(fs.readFileSync(path.join(root,'data/keyword-dictionary.json')));
const definitions=new Map([...oldKeywords.keywords,...dictionary.keywords].map(w=>[w.term,w.definition]));
for(const [term,definition] of Object.entries(require('./twenty-topic-definitions.cjs')))definitions.set(term,definition);
const topics=[],plans={},materials=[];
const sourceNote='교사 제공 엑셀 「20대 정예논제 총괄 총람」의 E열 논제, G열 핵심 교과 개념, H열 에피소드, I열 필수 쟁점을 수록했습니다. 에피소드의 문구와 어투는 원문을 유지합니다.';
for(const s of input){
 const [title,a,ac,b,bc,draftedEssay,proposition]=rows[s.no-1],id='episode2026_'+s.unitCode.replace('-','_'),cid='episode2026-'+s.unitCode;
 const essay=s.rawAttractive?.essayTask||draftedEssay;
 const concepts=s.concepts.split(/,\s*(?![^()]*\))/).filter(Boolean),checks=s.issues.split('\n').map(x=>x.replace(/^\d+\.\s*/,''));
 const plan={question:s.topic,essayPrompt:essay,textbookRef:s.pages,debateGoal:`${title}에 관한 두 입장의 이익과 부담을 비교하고 자신의 판단을 근거와 함께 설명합니다.`,essayGoal:essay.replace(/하시오\.$/,'합니다.'),setting:`다음은 ‘${title}’에 관해 검토하기 위한 수업용 가상 상황입니다. 등장인물은 ${a}, ${b}입니다. 서로 다른 처지와 이해관계를 비교합니다. 아래 주장은 검토 대상이며, 실제 통계나 법적 판단으로 확정된 내용이 아닙니다.`,characters:[{name:a,context:ac,position:`‘${proposition}’라는 주장에 동의하는 입장입니다.`},{name:b,context:bc,position:`이 주장에 동의하지 않거나, 현재의 조건에서는 시행하기 어렵다는 입장입니다.`}],claimant:a,proposition,issue:checks[0].replace(/^쟁점:\s*/,'').replace(/[?？]$/,''),advancedComplication:`정책을 결정하는 회의에서 ${a}는 자신의 요구를 바로 반영해 달라고 요청하고, ${b}는 부담을 줄일 조건부터 마련해 달라고 요청합니다. 예산과 준비 기간에는 한계가 있습니다. 시행 범위·예외·비용 분담·효과 확인 방법을 정하고, 자신의 방안으로도 해결되지 않는 문제를 설명해야 합니다.`,conceptApplications:concepts.map(term=>({term,application:`${title}에서 ${a}와 ${b}의 처지와 판단 기준을 ‘${term}’의 의미에 비추어 비교합니다.`})),feedbackPoints:checks};
 plans[id]=plan;
 plan.preserveEpisode=true;
 plan.setting=s.episode;
 plan.coreConceptText=s.concepts;
 plan.issue=s.issues;
 plan.conceptApplications=concepts.map(term=>({term,application:`「${term}」의 뜻을 에피소드 속 주장과 이해관계에 적용하여 필수 쟁점을 검토합니다.`}));
 plan.advancedComplication='에피소드의 조건을 바탕으로 자신의 판단을 설명하고, 필수 쟁점에 따라 다른 주장의 근거와 예상되는 결과를 비교합니다. 필요한 적용 조건이나 예외가 있다면 이유와 함께 제안합니다.';
 topics.push({topicId:id,curriculumId:cid,title,unit:'통합사회2 '+['','Ⅰ. 인권 보장과 헌법','Ⅱ. 사회 정의와 불평등','Ⅲ. 시장경제와 지속가능발전','Ⅳ. 세계화와 평화','Ⅴ. 미래와 지속가능한 삶'][Number(s.unitCode[0])],chapter:title,question:s.topic,essayPrompt:essay,background:plan.setting,coreConceptText:s.concepts,requiredIssues:s.issues,keyConcepts:concepts,textbookRef:s.pages,sourceType:'교사 제공 엑셀 · E·G·H·I 원문 수록',sourceUrl:'',difficulty:'중급',recommendedLevel:1,recommendedBadge:'badge_reasoning'});
 const base={id:cid,title,unit:s.unit,primaryStandard:s.standard,standard:{summary:'제공 자료의 성취기준 코드입니다. 아래 평가는 수업용 관찰 기준이며 공식 성취수준 판정이 아닙니다.',A:'개념·근거·반론·조건을 종합하여 판단합니다.',B:'개념과 근거를 연결하고 다른 입장을 검토합니다.',C:'자신의 판단과 관련된 이유를 설명합니다.',D:'쟁점과 이유의 연결을 보완합니다.',E:'개념과 쟁점의 뜻부터 확인합니다.'},case:plan.setting,taskChecks:checks,caution:'예시답안의 수치·법령 해석·일반화는 제공 자료의 주장입니다. 현실의 사실로 활용하기 전 출처 확인이 필요합니다. 찬반 선택 자체로 수준을 판단하지 않습니다.',sources:{provided:'교사 제공 20논제 통합 자료집',printedPages:s.pages},rubric:['개념의 뜻과 상황 적용','주장과 근거의 연결','다른 입장과 조건 검토'].map(criterion=>({criterion,target:essay,'5':'개념과 상황을 정확히 연결하고 반론과 적용 조건까지 설명합니다.','4':'근거와 다른 입장을 비교하지만 일부 조건의 설명이 부족합니다.','3':'입장과 관련된 이유를 설명합니다.','2':'입장은 있으나 이유와의 연결이 불분명합니다.','1':'의견을 제시하지만 이유를 확인하기 어렵습니다.'})),essays:['A','B','C'].map((level,i)=>({level,label:['제공 예시 1','제공 예시 2','제공 예시 3'][i],paragraphs:[s['student'+level]],judgment:'제공 파일의 예시 구분입니다. 내용의 정확성과 개념 적용, 주장·이유의 연결을 교사가 확인하여 판단합니다.',standardLink:'연결 성취기준: '+s.standard,nextStep:'검증되지 않은 사실 표현을 구별하고 반대 입장이 제기할 조건을 검토합니다.'})),speeches:{},dialogues:[{direction:'찬반 입장 비교',question:checks[0],answer:'찬성 측 참고 논거: '+s.pro,counter:'반대 측 참고 논거: '+s.con,rebuttal:'반대 우려가 실제로 생기는 조건을 검토하고 자신의 방안을 수정하거나 보완합니다.',judge:'근거의 정확성과 개념 적용, 상대 논거에 직접 답하는지 살핍니다.'}]};
 // Detailed models supplied for five topics remain teacher references, separately labelled.
 base.originalEpisode=s.episode;
 if(s.rawAttractive){for(const field of ['rubric','essays','speeches','dialogues','standard'])if(s.rawAttractive[field])base[field]=s.rawAttractive[field];base.providedDetails=s.rawAttractive;}
 for(const [stance,models] of Object.entries(base.speeches))base.speeches[stance]=models.map(model=>({...model,paragraphs:model.paragraphs||String(model.text||'').split(/\n\s*\n/),judgment:model.judgment||'제공 자료의 입론 예시입니다. 사실·통계·법령 인용은 원출처 확인이 필요합니다.'}));
 materials.push(base);
}
const allTerms=[...new Set(topics.flatMap(t=>t.keyConcepts))];
const keywords=allTerms.map((term,i)=>({id:'episodeword_'+(i+1),term,definition:definitions.get(term)||`‘${term}’은 이 논제의 판단에 활용할 개념입니다. 제공 자료에 별도 뜻풀이가 없어 교과서와 교사의 설명을 확인합니다.`,source:'20논제 제공 자료 · '+topics.filter(t=>t.keyConcepts.includes(term)).map(t=>t.textbookRef).join(' / '),topicIds:topics.filter(t=>t.keyConcepts.includes(term)).map(t=>t.topicId)}));
// Keep the complete dictionary and rebind its applicability to the new catalogue.
for(const word of dictionary.keywords)word.topicIds=topics.filter(t=>t.keyConcepts.some(k=>k.includes(word.term)||word.term.includes(k))).map(t=>t.topicId);
const write=(name,data)=>fs.writeFileSync(path.join(root,'data',name),JSON.stringify(data,null,2)+'\n');
write('topics.json',topics);write('lesson-plans.json',{version:2,sourceNote,plans});write('learning-materials.json',{version:2,notice:'교사 제공 자료의 수업용 예시입니다. 표시된 A~C는 원본의 구분이며 공식 성취수준이나 학생 성적을 확정하지 않습니다.',topics:materials});write('keywords.json',{version:2,keywords});write('keyword-dictionary.json',dictionary);
console.log(JSON.stringify({topics:topics.length,plans:Object.keys(plans).length,materials:materials.length,terms:keywords.length,definitionsToReview:keywords.filter(w=>!definitions.has(w.term)).map(w=>w.term)},null,2));
