'use strict';
const {normalize}=require('../assets/writing-plan');
const schema={type:'OBJECT',properties:{paragraphs:{type:'ARRAY',items:{type:'OBJECT',properties:{index:{type:'INTEGER'},focus:{type:'STRING'},contextQuote:{type:'STRING'},questions:{type:'ARRAY',items:{type:'STRING'}},terms:{type:'ARRAY',items:{type:'STRING'}}},required:['index','focus','contextQuote','questions','terms']}}},required:['paragraphs']};
function contextOf(lesson){return {...lesson.topic,scenario:lesson.scenario,feedbackPoints:lesson.feedbackPoints};}
function contextText(lesson){const s=lesson.scenario;return [s.story,s.complication,s.advancedComplication].filter(Boolean).join('\n');}
function withParticle(word,closed,open){const code=word.charCodeAt(word.length-1)-0xAC00;return word+(code>=0&&code<=11171&&code%28!==0?closed:open);}
function localQuestions(lesson,input){
  const plan=normalize(input),s=lesson.scenario,actor=s.role||'상황 속 인물',words=lesson.topic.conceptDefinitions||[];
  const quotes=contextText(lesson).split(/(?<=[.!?])\s+/).filter(Boolean),issue=s.issue||lesson.topic.title;
  return {source:'lesson-guide',writingPlan:plan,paragraphs:Array.from({length:plan.targetParagraphs},(_,i)=>{
    const last=i===plan.targetParagraphs-1,one=plan.targetParagraphs===1,focus=one?'선택·이유·다른 의견':i===0?'문제와 나의 선택':last?'다른 의견과 결론':'개념을 적용한 근거';
    const questions=one?[`${withParticle(actor,'은','는')} 어떤 어려움을 겪고 있나요? 어떤 선택을 지지하고 왜 그런가요?`,`${withParticle(issue,'을','를')} 판단할 때 다른 입장의 걱정에는 어떻게 답할까요?`]:i===0?[`${withParticle(actor,'이','가')} 겪는 가장 시급한 어려움은 무엇인가요?`,`${lesson.topic.question} ${actor}의 처지를 고려해 내 주장을 밝혀 보세요.`]:last?[`${issue}에 관해 반대하는 사람은 어떤 부담을 걱정할까요?`,`${actor}의 선택에 어떤 조건이나 예외를 두면 그 걱정에 답할 수 있을까요?`]:[`${actor}의 상황에서 아래 단서가 내 주장을 뒷받침하는 이유는 무엇인가요?`,words.length?`‘${words[(i-1)%words.length].term}’의 뜻을 이 상황에 어떻게 적용할 수 있나요?`:'그 이유에서 내 주장으로 이어지는 과정을 설명할 수 있나요?'];
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
