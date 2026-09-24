(function(root){
 function sentences(s){return String(s||'').split(/(?<=[.!?。！？])\s+|\n+/).map(s=>s.trim()).filter(Boolean);}
 function fromText(text){const paragraphs=String(text||'').split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean),all=sentences(text);if(paragraphs.length>=3)return {claim:paragraphs[0],reason:paragraphs.slice(1,-1).join('\n\n'),condition:paragraphs.at(-1)};return {claim:all[0]||'',reason:all.slice(1,paragraphs.length===1?3:undefined).join(' '),condition:paragraphs.length===1?all.slice(3).join(' '):''};}
 function bullets(text){return sentences(text).map(s=>s.length>100?s.slice(0,100)+'…':s).slice(0,3);}
 const api={fromText,bullets};if(typeof module!=='undefined')module.exports=api;else root.SpeechOutline=api;
})(typeof window!=='undefined'?window:this);
