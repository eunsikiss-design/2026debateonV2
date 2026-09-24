'use strict';
const {normalize}=require('../assets/writing-plan');
const schema={type:'OBJECT',properties:{paragraphs:{type:'ARRAY',items:{type:'OBJECT',properties:{index:{type:'INTEGER'},focus:{type:'STRING'},contextQuote:{type:'STRING'},questions:{type:'ARRAY',items:{type:'STRING'}},terms:{type:'ARRAY',items:{type:'STRING'}}},required:['index','focus','contextQuote','questions','terms']}}},required:['paragraphs']};
function contextOf(lesson){return {...lesson.topic,scenario:lesson.scenario,pedagogy:lesson.pedagogy,feedbackPoints:lesson.feedbackPoints};}
function contextText(lesson){const s=lesson.scenario;return [s.story,s.complication,s.advancedComplication].filter(Boolean).join('\n');}
function localQuestions(lesson,input){
  const plan=normalize(input),s=lesson.scenario,actor=s.role||'상황 속 인물',words=lesson.topic.conceptDefinitions||[];
  const quotes=(s.characters?.length?s.characters.map(c=>c.context).join('\n'):contextText(lesson)).split(/(?<=[.!?])\s+/).filter(Boolean),issue=s.issue||lesson.topic.title;
  return {source:'lesson-guide',writingPlan:plan,paragraphs:Array.from({length:plan.targetParagraphs},(_,i)=>{
    const last=i===plan.targetParagraphs-1,one=plan.targetParagraphs===1,focus=one?'선택·이유·다른 의견':i===0?'문제와 나의 선택':last?'다른 의견과 결론':'개념을 적용한 근거';
    const names=s.characters?.map(c=>c.name).join(' · ')||actor;
    const questions=one?[s.choiceQuestion||lesson.topic.question,`${names}의 이해관계를 비교하여 이유와 조건을 설명해 주십시오.`]:i===0?[`${names}의 요구가 충돌하는 구체적 조건은 무엇입니까?`,s.choiceQuestion||lesson.topic.question]:last?[`‘${issue}’에 관해 자신과 다른 주장이 제기할 수 있는 가장 중요한 걱정은 무엇입니까?`,'그 걱정에 답하려면 자신의 판단에 어떤 조건이나 예외가 필요합니까?']:[`아래 단서를 ‘${issue}’에 대한 자신의 판단 근거로 어떻게 연결할 수 있습니까?`,words.length?`‘${words[(i-1)%words.length].term}’의 뜻을 서로 다른 인물의 상황에 적용해 설명해 주십시오.`:'이유와 주장을 연결하는 과정을 설명해 주십시오.'];
    return {index:i+1,focus,contextQuote:quotes[Math.min(i,quotes.length-1)]||s.story,questions,terms:words.length?[words[i%words.length].term]:[]};
  })};
}
function validate(result,lesson,input){
  const plan=normalize(input),source=contextText(lesson),allowed=new Set(lesson.topic.keyConcepts);
  if(!Array.isArray(result?.paragraphs)||result.paragraphs.length!==plan.targetParagraphs)throw Error('WRITING_QUESTIONS_INVALID');
  return result.paragraphs.map((p,i)=>{
    if(p.index!==i+1||typeof p.focus!=='string'||!p.focus.trim()||p.focus.length>80||typeof p.contextQuote!=='string'||p.contextQuote.length<8||p.contextQuote.length>350||!source.includes(p.contextQuote)||!Array.isArray(p.questions)||p.questions.length<1||p.questions.length>3||p.questions.some(q=>typeof q!=='string'||q.trim().length<8||q.length>500)||!Array.isArray(p.terms)||p.terms.length>4||p.terms.some(term=>!allowed.has(term)))throw Error('WRITING_QUESTIONS_INVALID');
    return {index:i+1,focus:p.focus.trim(),contextQuote:p.contextQuote,questions:p.questions.map(q=>q.trim()),terms:p.terms};
  });
}
module.exports={schema,contextOf,contextText,localQuestions,validate,normalize};
