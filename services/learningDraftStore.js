'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function error(message,status=400){throw Object.assign(Error(message),{status});}
class LearningDraftStore{
 constructor(file){this.file=file;}
 read(){return fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{version:1,users:{}};}
 key(user){if(!user.uid||!user.schoolId)error('로그인 정보를 확인하세요.',403);return crypto.createHash('sha256').update(JSON.stringify([user.schoolId,user.uid])).digest('hex');}
 get(user,topicId){return structuredClone(this.read().users[this.key(user)]?.[topicId]||{});}
 list(user){return structuredClone(this.read().users[this.key(user)]||{});}
 save(user,topicId,input){
  const {mode,content,revision}=input;if(!['basic','advanced','speech'].includes(mode)||!content||typeof content!=='object')error('초안 형식을 확인하세요.');
  let value;if(mode==='basic'){value={};for(const field of ['claim','reason','rebuttal']){if(typeof content[field]!=='string'||content[field].length>10000)error('초안은 항목별 10000자 이내로 입력하세요.');value[field]=content[field];}value.stance=content.stance==='con'?'con':'pro';}
  else if(mode==='advanced'){if(!Array.isArray(content.paragraphs)||content.paragraphs.length>20||content.paragraphs.some(p=>typeof p!=='string'||p.length>10000)||content.paragraphs.join('').length>40000)error('논술 초안 분량을 확인하세요.');value={paragraphs:content.paragraphs,writingPlan:require('../assets/writing-plan').normalize(content.writingPlan)};}
  else{value={};for(const field of ['sourceText','claim','reason','condition','transcript']){if(typeof content[field]!=='string'||content[field].length>40000)error('말하기 초안 분량을 확인하세요.');value[field]=content[field];}value.targetDurationSeconds=[45,90,180,300].includes(Number(content.targetDurationSeconds))?Number(content.targetDurationSeconds):45;}
  const db=this.read(),key=this.key(user),current=db.users[key]?.[topicId]?.[mode];if(revision!==(current?.revision||0))error('다른 화면에서 초안을 변경했습니다. 현재 글을 복사해 보관한 뒤 새로고침하세요.',409);
  const versions=current?.versions||[];
  if(input.snapshot===true)versions.push({version:versions.length+1,content:structuredClone(value),updatedAt:new Date().toISOString()});
  const draft={revision:(current?.revision||0)+1,content:value,updatedAt:new Date().toISOString(),versions};
  db.users[key]??={};db.users[key][topicId]??={};db.users[key][topicId][mode]=draft;
  fs.mkdirSync(path.dirname(this.file),{recursive:true});const temp=this.file+'.'+crypto.randomUUID()+'.tmp';try{fs.writeFileSync(temp,JSON.stringify(db),{encoding:'utf8',mode:0o600});fs.renameSync(temp,this.file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  return draft;
 }
}
module.exports={LearningDraftStore};
