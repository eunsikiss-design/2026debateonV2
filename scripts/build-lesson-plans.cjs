'use strict';
const fs=require('node:fs'),path=require('node:path');
const topics=require('../data/topics.json'),materials=require('../data/learning-materials.json'),cases=require('./learning-scenarios.cjs'),details=require('./lesson-plan-details.cjs');
const formalPosition=s=>s.replace(/\.$/,'')+'는 입장입니다.';
const proposition=q=>q.replace(/\?$/,'').replace(/야 하는가$/,'야 한다').replace(/낮춰야 하는가$/,'낮춰야 한다').replace(/수 있는가$/,'수 있다').replace(/공정한가$/,'공정하다').replace(/정당한가$/,'정당하다').replace(/필요한가$/,'필요하다').replace(/심화시키는가$/,'심화시킨다');
const plans={};
for(const t of topics.filter(t=>t.curriculumId)){
 const m=materials.topics.find(m=>m.id===t.curriculumId),c=cases[t.curriculumId],[name,context,applications]=details[t.curriculumId];
 plans[t.topicId]={question:t.question,essayPrompt:t.essayPrompt,textbookRef:t.textbookRef,
  debateGoal:`핵심 쟁점 ‘${c[4]}’에 따라 두 주장의 이익과 부담을 비교하고, 선택한 주장과 다른 주장의 핵심 근거에 답합니다.`,
  essayGoal:t.essayPrompt.replace(/하라\.$/,'합니다.').replace(/제시하라\.$/,'제시합니다.'),
  conceptApplications:t.keyConcepts.map((term,i)=>({term,application:applications.split('|')[i]||c[4]})),
  setting:'다음은 수업을 위해 만든 가상 상황입니다. '+c[1],
  characters:[{name:m.scenario.role,context:c[0],position:formalPosition(c[2])},{name,context,position:formalPosition(c[3])}],
  issue:c[4],advancedComplication:`결정 이후에도 ${name}의 요구가 받아들여지지 않았다는 의견이 남았습니다. ${m.scenario.role}의 요구도 모두 충족되지 않았습니다. 같은 원칙을 다른 처지의 사람에게 적용할 때 생길 문제를 살피고, 시행 범위·예외·다시 검토할 조건을 구체적으로 정해야 합니다.`,claimant:m.scenario.role,proposition:proposition(t.question),
  feedbackPoints:m.taskChecks};
}
const extra=[
 ['topic_justice_basic_income','김불안 청년','김불안 청년은 단기 일자리의 계약이 자주 끊기지만 소득 증빙이 불규칙해 복지 신청에서 누락됩니다. 누구나 받는 기본소득이 있어야 일자리를 찾는 기간을 버틸 수 있다고 주장합니다.','이집중 시민','이집중 시민은 가족의 중증 질환으로 큰 돌봄 비용을 냅니다. 기본소득 예산 때문에 기존의 집중 지원이 줄면 손해가 커지므로 더 어려운 사람의 지원부터 보장하자고 주장합니다.','모든 시민에게 조건 없는 기본소득을 지급해야 한다','같은 예산으로 넓게 지원할지 필요가 큰 사람에게 집중할지 결정하는 기준','기본소득과 기존 복지의 조합을 비교하고, 가장 불리한 사람에게 미칠 영향과 비용 부담의 원칙을 논증합니다.'],
 ['topic_sns_shutdown','박수면 학생','박수면 학생은 밤마다 모둠 채팅의 응답을 요구받아 잠을 줄입니다. 혼자 알림을 끄면 협력하지 않는다는 말을 듣기 때문에 공통의 심야 제한이 필요하다고 주장합니다.','김자율 학생','김자율 학생은 저녁에 가족의 가게를 돕고 밤에야 멀리 사는 친구와 연락합니다. 정해진 시각 이후 모든 SNS를 막으면 필요한 연락까지 끊기므로 알림 제한과 자율 설정을 먼저 제안합니다.','청소년의 SNS 심야 이용을 법률로 제한해야 한다','수면 보호의 효과와 자기결정권 제한의 범위','심야 제한과 덜 제한적인 대안을 비교하고 보호 효과·예외·권리 제한의 범위를 논증합니다.']
];
for(const [id,a,ac,b,bc,proposition,issue,essayGoal]of extra){const t=topics.find(t=>t.topicId===id);plans[id]={question:t.question,essayPrompt:essayGoal,textbookRef:t.textbookRef+' (개별 쪽수 추가 확인 필요)',debateGoal:issue+'를 비교하고 반대 근거를 고려하여 판단합니다.',essayGoal,conceptApplications:t.keyConcepts.map(term=>({term,application:issue+'에 적용하여 두 인물의 부담과 대안을 비교합니다.'})),setting:'다음은 수업을 위해 만든 가상 상황입니다.',characters:[{name:a,context:ac,position:proposition+'는 입장입니다.'},{name:b,context:bc,position:'일률적 시행보다 필요한 대안과 예외를 먼저 마련해야 한다는 입장입니다.'}],issue,advancedComplication:'한정된 예산과 시행 시간을 고려해야 합니다. 예외의 대상과 효과를 확인할 기준도 함께 결정합니다.',claimant:a,proposition,feedbackPoints:[issue+'를 자신의 판단 근거와 연결합니다.']};}
plans.topic_affirmative_action={...structuredClone(plans.curriculum_2_06),question:topics.find(t=>t.topicId==='topic_affirmative_action').question,conceptApplications:topics.find(t=>t.topicId==='topic_affirmative_action').keyConcepts.map(term=>({term,application:'정유진 지원자와 김경계 지원자가 겪는 실제 불리함과 선발 기준을 비교합니다.'}))};
fs.writeFileSync(path.join(__dirname,'../data/lesson-plans.json'),JSON.stringify({version:1,sourceNote:'교과서 쪽수는 기존 자료집의 관련 개념 위치입니다. 가상 상황의 실제 출처나 교과서 원문 인용이 아닙니다.',plans},null,2));
console.log('Built '+Object.keys(plans).length+' editable lesson plans.');
