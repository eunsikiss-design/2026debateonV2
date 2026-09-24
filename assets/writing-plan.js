(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WritingPlan=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  const limit=(value,min,max,fallback)=>{const n=Number(value);return Number.isFinite(n)&&n>0?Math.min(max,Math.max(min,Math.round(n))):fallback;};
  function recommend(anchor,value){
    let targetChars,targetSentences,targetParagraphs;
    if(anchor==='paragraphs'){targetParagraphs=limit(value,1,20,3);targetSentences=targetParagraphs*4;targetChars=targetSentences*50;}
    else if(anchor==='sentences'){targetSentences=limit(value,1,80,12);targetChars=targetSentences*50;targetParagraphs=Math.max(1,Math.ceil(targetSentences/4));}
    else{targetChars=limit(value,50,4000,600);targetSentences=Math.max(1,Math.round(targetChars/50));targetParagraphs=Math.max(1,Math.ceil(targetSentences/4));}
    return {targetChars,targetSentences,targetParagraphs};
  }
  function normalize(input={}){const base=recommend('paragraphs',input.targetParagraphs);return {targetChars:limit(input.targetChars,50,4000,base.targetChars),targetSentences:limit(input.targetSentences,1,80,base.targetSentences),targetParagraphs:base.targetParagraphs};}
  return {recommend,normalize};
});
