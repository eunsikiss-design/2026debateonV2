'use strict';
const defaults=require('../data/lesson-plans.json');
function invalid(message){throw Object.assign(Error(message),{status:400,code:'INVALID_LESSON_PLAN'});}
function text(value,label,max){if(typeof value!=='string'||!value.trim()||value.length>max)invalid(`${label}: 1~${max}자로 입력하세요.`);return value.trim();}
function validate(input){
 if(!input||typeof input!=='object')invalid('수업 자료가 없습니다.');
 const out={};
 for(const [key,label,max]of [['question','토론 논제',700],['essayPrompt','논술 주제',700],['textbookRef','교과서 쪽수',300],['debateGoal','토론 목표',1200],['essayGoal','논술 목표',1200],['setting','상황 배경',2500],['issue','핵심 쟁점',700],['advancedComplication','심화 추가 조건',2500],['claimant','주장을 제시한 인물',80],['proposition','판단할 주장',700]])out[key]=text(input[key],label,max);
 if(!Array.isArray(input.characters)||input.characters.length<2||input.characters.length>6)invalid('서로 다른 이해관계를 지닌 등장인물을 2~6명 입력하세요.');
 out.characters=input.characters.map(c=>({name:text(c.name,'인물 이름',80),context:text(c.context,'구체적 처지와 이해관계',2500),position:text(c.position,'인물의 입장',1000)}));
 if(new Set(out.characters.map(c=>c.name)).size!==out.characters.length)invalid('인물 이름을 구분하세요.');
 if(!out.characters.some(c=>c.name===out.claimant))invalid('판단할 주장을 제시한 인물은 등장인물 이름과 같아야 합니다.');
 if(!Array.isArray(input.conceptApplications)||input.conceptApplications.length>30)invalid('교과 용어 적용 맥락은 30개 이내로 입력하세요.');
 out.conceptApplications=input.conceptApplications.map(c=>({term:text(c.term,'교과 용어',80),application:text(c.application,'적용 맥락',1000)}));
 if(!Array.isArray(input.feedbackPoints)||input.feedbackPoints.length>20)invalid('피드백 관점은 20개 이내로 입력하세요.');
 out.feedbackPoints=input.feedbackPoints.map(v=>text(v,'피드백 관점',1000));
 return out;
}
function scenario(p){
 const choiceQuestion=`${p.claimant}의 입장에서 제시한 “${p.proposition}”라는 주장에 동의합니까, 동의하지 않습니까? 자신의 판단을 밝히고, 다른 입장이 제기할 수 있는 걱정과 필요한 조건도 함께 설명해 주십시오.`;
 return {title:'만약에',setting:p.setting,role:p.claimant,claimant:p.claimant,proposition:p.proposition,characters:p.characters,
  story:p.setting+'\n\n'+p.characters.map(c=>`${c.name}: ${c.context}\n${c.position}`).join('\n\n'),
  complication:'핵심 쟁점은 '+p.issue+'입니다.',advancedComplication:p.advancedComplication,issue:p.issue,
  invitation:choiceQuestion,choiceQuestion,
  options:[{value:'pro',label:'동의한다',claim:`내 생각에는 “${p.proposition}”라는 주장에 동의합니다.`},{value:'con',label:'동의하지 않는다',claim:`내 생각에는 “${p.proposition}”라는 주장에 동의하지 않습니다.`}]};
}
module.exports={defaults:defaults.plans,sourceNote:defaults.sourceNote,validate,scenario};
