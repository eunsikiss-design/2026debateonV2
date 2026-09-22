'use strict';
const path=require('node:path'),{pathToFileURL}=require('node:url');
const MODEL='Xenova/multilingual-e5-small';
const REVISION='761b726dd34fb83930e26aab4e9ac3899aa1fa78';
const pipelines=new Map();
async function extractor(cache,download=false){
 const key=path.resolve(cache);if(!pipelines.has(key)){
  const modulePath=require.resolve('@huggingface/transformers',{paths:[__dirname,path.join(__dirname,'runtime')]});
  const promise=import(pathToFileURL(modulePath).href).then(m=>(m.pipeline||m.default.pipeline)('feature-extraction',MODEL,{revision:REVISION,dtype:'q8',device:'cpu',cache_dir:key,local_files_only:!download}));
  pipelines.set(key,promise);promise.catch(()=>pipelines.delete(key));
 }return pipelines.get(key);
}
function normalize(values){const norm=Math.hypot(...values);if(!norm||values.some(n=>!Number.isFinite(n)))throw Error('INVALID_VECTOR');return values.map(n=>n/norm);}
async function embedLocal(texts,cache){
 const matrices=await embedPassages(texts,cache,'query');return matrices.map(matrix=>normalize(matrix[0].map((_,i)=>matrix.reduce((sum,row)=>sum+row[i],0)/matrix.length)));
}
async function embedPassages(texts,cache,task='passage'){const pipe=await extractor(cache),results=[];for(const text of texts){const parts=(String(text).match(/[\s\S]{1,180}/g)||['']).map(part=>task+': '+part);results.push((await pipe(parts,{pooling:'mean',normalize:true,truncation:true,max_length:256})).tolist());}return results;}
module.exports={MODEL,REVISION,extractor,embedLocal,embedPassages,normalize};

