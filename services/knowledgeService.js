'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {EvidenceReviewStore}=require('./evidenceReviewStore');
const {SemanticSearch}=require('./semanticSearch');
const compact = value => String(value || '').normalize('NFC').toLowerCase().replace(/\s+/g, '');
const visible = (item, role) => item.audience === 'student' || role === 'teacher';

class KnowledgeService {
  constructor({root = path.join(__dirname, '..'), corpus} = {}) {
    this.root = root;
    this.reviews=new EvidenceReviewStore(root);
    this.semantic=new SemanticSearch(root);
    this.corpus = corpus || JSON.parse(fs.readFileSync(path.join(root,'data','curriculum_corpus.json'),'utf8'));
    if (this.corpus.schemaVersion !== 1 || !Array.isArray(this.corpus.cards) || !Array.isArray(this.corpus.sources)) throw new Error('Invalid curriculum corpus');
    this.sources = this.corpus.sources;
    const ids = new Set();
    for (const source of this.sources) {
      if (ids.has(source.sourceId) || !['teacher','student'].includes(source.audience)) throw new Error('Invalid source registry');
      ids.add(source.sourceId);
      const sourcePath = this.resolveSourcePath(source);
      source.integrityStatus = sourcePath && crypto.createHash('sha256').update(fs.readFileSync(sourcePath)).digest('hex') === source.sha256 ? 'current' : 'stale';
    }
    this.cards = this.corpus.cards.filter(card => this.sources.some(s => s.sourceId===card.sourceId && s.integrityStatus==='current'));
    this.index = new Map(this.cards.map(card => [card.cardId, compact(card.detail)]));
  }
  resolveSourcePath(source) {
    if (!source || source.fileName !== path.basename(source.fileName) || !/\.(pdf|hwp)$/i.test(source.fileName)) return null;
    const target = path.join(this.root,source.fileName);
    try {
      if (fs.lstatSync(target).isSymbolicLink()) return null;
      const relative = path.relative(fs.realpathSync(this.root),fs.realpathSync(target));
      if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
      return target;
    } catch { return null; }
  }
  getSources(role='student') {
    return this.sources.filter(s => visible(s,role)).map(({sha256,...source})=>source);
  }
  getSourceFile(sourceId, role='student') {
    const source = this.sources.find(s=>s.sourceId===sourceId && visible(s,role));
    if (!source || source.integrityStatus!=='current') return null;
    const filePath=this.resolveSourcePath(source);
    // Never serve a replaced source under an old citation.
    if (!filePath || crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')!==source.sha256) return null;
    return {filePath, source};
  }
  getEvidenceCards(topicId=null, category=null, role='student') {
    return this.cards.filter(c=>visible(c,role) && (!topicId || c.topicId===topicId || c.topicId==='all') && (!category || c.category===category)).map(c=>this.reviews.decorate(c,role)).filter(c=>role==='teacher'||c.reviewStatus!=='rejected');
  }
  searchEvidence(query, {role='student',sourceId=null,limit=10}={}) {
    if (typeof query!=='string' || !query.trim()) return [];
    const terms=[...new Set(query.toLowerCase().trim().split(/\s+/).filter(t=>t.length>=2))].slice(0,20);
    if (!terms.length) return [];
    const full=compact(query), candidates=this.getEvidenceCards(null,null,role).filter(c=>!sourceId||c.sourceId===sourceId);
    const scored=candidates.map(card=>{
      const text=this.index.get(card.cardId), heading=compact(card.title+' '+card.keyConcepts.join(' '));
      let matched=0, score=0;
      for (const term of terms) {
        const key=compact(term), found=text.includes(key);
        if (found) {matched++;score+=2+(heading.includes(key)?1:0);}
      }
      if (text.includes(full)) score+=4;
      return {...card,retrievalScore:score,matchedTerms:matched};
    }).filter(c=>c.matchedTerms>0).sort((a,b)=>b.retrievalScore-a.retrievalScore||a.cardId.localeCompare(b.cardId));
    // Collapse overlapping chunks from the same source page/section in the initial results.
    const used=new Set(), results=[];
    for (const card of scored) {
      if (used.has(card.unitId)) continue;
      used.add(card.unitId); results.push(card);
      if (results.length>=Math.max(1,Math.min(30,Number(limit)||10))) break;
    }
    return results;
  }
  getCardById(id,role='student') { return this.getEvidenceCards(null,null,role).find(c=>c.cardId===id)||null; }
  search(query,options={}) { return this.semantic.search(this,query,options); }
  reviewCard(id,input,user){const card=this.cards.find(c=>c.cardId===id);if(!card)throw Object.assign(Error('자료를 찾을 수 없습니다.'),{status:404});if(!this.getSourceFile(card.sourceId,'teacher'))throw Object.assign(Error('원본이 변경되었습니다. 재추출 후 검수하세요.'),{status:409});return this.reviews.save(card,input,user);}
  reviewList({status='pending',sourceId='',offset=0,limit=20}={}){const all=this.getEvidenceCards(null,null,'teacher').filter(c=>(!status||c.reviewStatus===status)&&(!sourceId||c.sourceId===sourceId));return {cards:all.slice(offset,offset+limit),total:all.length,offset,limit};}
  getGlossary(role='student') {
    const map=new Map();
    for(const card of this.getEvidenceCards(null,null,role)) for(const concept of card.keyConcepts) {
      if(!map.has(concept)) map.set(concept,{concept,unit:card.unit,relatedCardTitle:card.title,cardId:card.cardId});
    }
    return [...map.values()];
  }
  getGrounding(query) {
    const cards=this.searchEvidence(query,{role:'student',limit:4});
    return { retrievalMode:'local-lexical', references:cards.map(c=>({cardId:c.cardId,source:c.source,page:c.page,sourceUrl:c.sourceUrl})),
      context:JSON.stringify(cards.map(c=>({id:c.cardId,source:c.source,text:c.detail,reviewStatus:c.reviewStatus}))) };
  }
  async getGroundingAsync(query){
    const result=await this.search(query.slice(0,200),{role:'student',limit:4});
    return {retrievalMode:result.retrievalMode,references:result.cards.map(c=>({cardId:c.cardId,source:c.source,page:c.page,sourceUrl:c.sourceUrl,reviewStatus:c.reviewStatus})),context:JSON.stringify(result.cards.map(c=>({id:c.cardId,source:c.source,text:c.detail,reviewStatus:c.reviewStatus})))};
  }
}
module.exports = new KnowledgeService();
module.exports.KnowledgeService = KnowledgeService;

