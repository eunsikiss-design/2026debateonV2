'use strict';
const topics=require('../data/topics.json');
const defaults=require('../data/keywords.json').keywords;
const VERSION='teacher-20-topics-2026-09-25';
const active=new Set(topics.map(t=>t.topicId));
const key=s=>s.normalize('NFC').replace(/\s/g,'');
function migrateCatalogue(config,{saved=false}={}){
 if(config.catalogueVersion===VERSION)return config;
 const keywords=structuredClone(config.keywords),byTerm=new Map(keywords.map(w=>[key(w.term),w]));
 for(const word of keywords){
  word.topicIds=word.topicIds.filter(id=>active.has(id));
  for(const topic of topics)if(topic.keyConcepts.some(term=>key(term)===key(word.term)))word.topicIds.push(topic.topicId);
  word.topicIds=[...new Set(word.topicIds)];
 }
 for(const word of defaults){
  const existing=byTerm.get(key(word.term));
  if(existing)existing.topicIds=[...new Set([...existing.topicIds,...word.topicIds])];
  else {const item=structuredClone(word);keywords.push(item);byTerm.set(key(word.term),item);}
 }
 // New topic IDs intentionally do not reuse old lesson overrides or student drafts.
 return {...config,keywords,catalogueVersion:VERSION,revision:config.revision+(saved?1:0)};
}
module.exports={migrateCatalogue,VERSION};
