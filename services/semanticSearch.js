'use strict';
const fs=require('node:fs'),path=require('node:path');
const {fingerprint}=require('./evidenceReviewStore');
const {embedLocal,MODEL,REVISION}=require('./localEmbedding');
class SemanticSearch {
 constructor(root,{index,embedder}={}){
  const file=path.join(root,'data','curriculum_embeddings.json');this.index=index||(fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):null);
  this.embedder=embedder||(texts=>embedLocal(texts,path.join(root,'data','embedding-model')));this.cache=new Map();this.inFlight=new Map();
  this.entries=new Map((this.index?.entries||[]).map(e=>[e.cardId,e]));
 }
 async queryVector(query){
  const key=query.trim().normalize('NFC');if(this.cache.has(key))return this.cache.get(key);if(this.inFlight.has(key))return this.inFlight.get(key);
  if(this.inFlight.size>=2)throw Error('SEARCH_BUSY');
  const promise=this.embedder([key]).then(v=>{this.cache.set(key,v[0]);if(this.cache.size>128)this.cache.delete(this.cache.keys().next().value);return v[0];}).finally(()=>this.inFlight.delete(key));
  this.inFlight.set(key,promise);return promise;
 }
 async search(knowledge,query,options={}){
  const fallback=reason=>({cards:knowledge.searchEvidence(query,options),retrievalMode:'local-lexical',fallbackReason:reason});
  if(!query?.trim())return {cards:[],retrievalMode:'local-lexical'};
  if(query.length>200)return fallback('QUERY_TOO_LONG');
  if(!this.index||this.index.version!==1||this.index.dimensions!==384||this.index.model!==MODEL||this.index.revision!==REVISION)return fallback('INDEX_UNAVAILABLE');
  const candidates=knowledge.getEvidenceCards(null,null,options.role||'student').filter(c=>(!options.sourceId||c.sourceId===options.sourceId)&&c.reviewStatus!=='rejected');
  if(!candidates.length)return {cards:[],retrievalMode:'local-semantic-hybrid'};
  if(candidates.some(c=>this.entries.get(c.cardId)?.fingerprint!==fingerprint(c)))return fallback('INDEX_STALE');
  try{
   const vector=await this.queryVector(query);const lexical=new Map(knowledge.searchEvidence(query,{...options,limit:30}).map(c=>[c.cardId,c.retrievalScore]));
   const dot=stored=>{if(stored.length!==vector.length||stored.some(n=>!Number.isFinite(n)))throw Error('INVALID_INDEX');return stored.reduce((sum,n,i)=>sum+n*vector[i],0);};
   const scored=candidates.map(card=>{const entry=this.entries.get(card.cardId);const similarity=0.85*Math.max(...(entry.passageVectors||[entry.vector]).map(dot))+0.15*dot(entry.vector);return {...card,semanticSimilarity:similarity,retrievalScore:similarity+Math.min(lexical.get(card.cardId)||0,12)*0.012};}).filter(c=>c.semanticSimilarity>=0.85||lexical.has(c.cardId)).sort((a,b)=>b.retrievalScore-a.retrievalScore);
   const used=new Set(),cards=[];for(const card of scored){if(used.has(card.unitId))continue;used.add(card.unitId);cards.push(card);if(cards.length>=Math.min(30,options.limit||10))break;}
   return {cards,retrievalMode:'local-semantic-hybrid'};
  }catch{return fallback('SEMANTIC_UNAVAILABLE');}
 }
}
module.exports={SemanticSearch};

