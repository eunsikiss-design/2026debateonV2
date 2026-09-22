const fs=require('node:fs'),path=require('node:path');
const root=process.argv[2]||path.join(__dirname,'..'),out=process.argv[3]||path.join(root,'data','curriculum_embeddings.json'),cache=process.argv[4]||path.join(root,'data','embedding-model');
const local=fs.existsSync(path.join(__dirname,'localEmbedding.js'))?'./':'../services/';
const {embedPassages,normalize,MODEL,REVISION}=require(local+'localEmbedding');const {fingerprint}=require(local+'evidenceReviewStore');
(async()=>{
 const corpus=JSON.parse(fs.readFileSync(path.join(root,'data','curriculum_corpus.json'),'utf8'));const checkpoint=out+'.pending';let entries=[];
 if(fs.existsSync(checkpoint)){const saved=JSON.parse(fs.readFileSync(checkpoint,'utf8'));if(saved.model===MODEL&&saved.revision===REVISION)entries=saved.entries.filter(e=>corpus.cards.some(c=>c.cardId===e.cardId&&fingerprint(c)===e.fingerprint));}
 const missing=corpus.cards.filter(c=>!entries.some(e=>e.cardId===c.cardId));
 for(let i=0;i<missing.length;i+=8){const batch=missing.slice(i,i+8),matrices=await embedPassages(batch.map(c=>c.detail),cache);
  entries.push(...batch.map((c,j)=>({cardId:c.cardId,fingerprint:fingerprint(c),passageVectors:matrices[j],vector:normalize(matrices[j][0].map((_,d)=>matrices[j].reduce((sum,row)=>sum+row[d],0)/matrices[j].length))})));
  fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(checkpoint,JSON.stringify({version:1,model:MODEL,revision:REVISION,dimensions:384,entries}));console.log('Embedded locally '+entries.length+'/'+corpus.cards.length);
 }
 fs.writeFileSync(checkpoint,JSON.stringify({version:1,model:MODEL,revision:REVISION,dimensions:384,createdAt:new Date().toISOString(),entries}));fs.renameSync(checkpoint,out);console.log('Complete: '+entries.length+' local vectors');
})().catch(e=>{console.error(e.message);process.exitCode=1;});

