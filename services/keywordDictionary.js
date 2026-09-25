'use strict';
const dictionary=require('../data/keyword-dictionary.json');
const defaults=require('../data/keywords.json').keywords;
const key=term=>String(term).normalize('NFC').replace(/\s/g,'').replace(/^지속가능한발전$/,'지속가능발전');
const baseline=new Map(defaults.map(word=>[key(word.term),word]));
const unchanged=(word,original)=>original&&['id','term','definition','source','topicIds'].every(field=>JSON.stringify(word[field])===JSON.stringify(original[field]));

// A versioned, additive import. Teacher edits win; deleting an imported word is permanent.
function mergeDictionary(config,{saved=false}={}){
 if(config.keywordImports?.includes(dictionary.id))return config;
 const keywords=structuredClone(config.keywords),byTerm=new Map(keywords.map(word=>[key(word.term),word]));
 const report={id:dictionary.id,title:dictionary.title,sourceEntries:dictionary.sourceEntryCount,uniqueTerms:dictionary.keywords.length,added:0,refreshed:0,preserved:0,previouslyDeleted:0};
 for(const entry of dictionary.keywords){
  const name=key(entry.term),existing=byTerm.get(name),original=baseline.get(name);
  if(existing){
   if(unchanged(existing,original)){
    existing.definition=entry.definition;existing.source=entry.source;
    existing.topicIds=[...new Set([...existing.topicIds,...entry.topicIds])];report.refreshed++;
   }else report.preserved++;
  }else if(saved&&original){
   // An absent baseline entry was removed or renamed by the teacher before this import.
   report.previouslyDeleted++;
  }else{
   const {id,term,definition,source,topicIds}=entry;
   const item={id,term,definition,source,topicIds:structuredClone(topicIds)};
   keywords.push(item);byTerm.set(name,item);report.added++;
  }
 }
 return {...config,keywords,revision:config.revision+(saved?1:0),keywordImports:[...(config.keywordImports||[]),dictionary.id],keywordImportReport:report};
}
module.exports={mergeDictionary,dictionary,key};
