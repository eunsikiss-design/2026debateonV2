'use strict';
const compact=text=>String(text||'').normalize('NFC').replace(/\s+/g,'');
function validateGrounding(result,grounding){
 const cards=JSON.parse(grounding.context),byId=new Map(cards.map(c=>[c.id,c]));
 if(!Array.isArray(result.evidenceBasis))throw Error('GROUNDING_CITATIONS_MISSING');
 if(result.evidenceBasis.length>4)throw Error('GROUNDING_TOO_MANY_CITATIONS');
 const citations=result.evidenceBasis.map(entry=>{
  const source=byId.get(entry.cardId),quote=compact(entry.quote);
  if(!source||quote.length<12||quote.length>300||!compact(source.text).includes(quote))throw Error('GROUNDING_CITATION_MISMATCH');
  if(typeof entry.explanation!=='string'||!entry.explanation.trim()||entry.explanation.length>1000)throw Error('GROUNDING_EXPLANATION_MISSING');
  return {cardId:entry.cardId,quote:entry.quote,explanation:entry.explanation};
 });
 return {...result,evidenceBasis:citations,retrievedReferences:grounding.references,usedReferences:grounding.references.filter(r=>citations.some(c=>c.cardId===r.cardId)),retrievalMode:grounding.retrievalMode,groundingValidation:{status:citations.length?'quote_matched':'no_citation',meaningVerified:false}};
}
module.exports={validateGrounding};

