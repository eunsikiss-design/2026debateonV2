'use strict';
const {BASIC_WRITING_JSON_SCHEMA}=require('../prompts/basicWritingCoach');
const schema=structuredClone(BASIC_WRITING_JSON_SCHEMA);
for(const field of Object.values(schema.properties.analysis.properties))Object.assign(field,{minimum:0,maximum:3});
for(const name of ['currentLevel','recommendedLevel'])Object.assign(schema.properties.scaffold.properties[name],{minimum:0,maximum:5});
schema.properties.evidenceBasis={type:'ARRAY',maxItems:4,items:{type:'OBJECT',properties:{cardId:{type:'STRING'},quote:{type:'STRING',minLength:12,maxLength:300},explanation:{type:'STRING',minLength:1,maxLength:1000}},required:['cardId','quote','explanation']}};
schema.required.push('evidenceBasis');
function validate(value,node=schema){
 const fail=()=>{throw Error('BASIC_RESPONSE_INVALID');};
 switch(node.type){
  case 'OBJECT':
   if(!value||typeof value!=='object'||Array.isArray(value))fail();
   for(const key of node.required||[])if(!Object.hasOwn(value,key))fail();
   for(const [key,child] of Object.entries(node.properties||{}))if(Object.hasOwn(value,key))validate(value[key],child);
   break;
  case 'ARRAY':if(!Array.isArray(value)||(node.maxItems!=null&&value.length>node.maxItems))fail();for(const item of value)validate(item,node.items);break;
  case 'INTEGER':if(!Number.isInteger(value)||value<node.minimum||value>node.maximum)fail();break;
  case 'BOOLEAN':if(typeof value!=='boolean')fail();break;
  case 'STRING':if(typeof value!=='string'||!value.trim()||value.length<(node.minLength||1)||value.length>(node.maxLength||5000))fail();break;
  default:fail();
 }
 return value;
}
function groundingQuery(topic,reason){
 const concepts=Array.isArray(topic?.keyConcepts)?topic.keyConcepts.join(' '):String(topic?.keyConcepts||'');
 // Keep generic words in a student's rationale from overriding the assigned concept.
 return concepts.trim()||String(reason||'').trim();
}
module.exports={schema,validate,groundingQuery};

