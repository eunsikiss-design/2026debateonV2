'use strict';
// One-time, explicitly invoked repair of the historical onboarding fallback.
const fs=require('node:fs'),path=require('node:path'),storage=require('../services/storageService'),learning=require('../services/learningService'),roster=require('../services/studentRoster');
const target=process.env.STUDENT_SCHOOL_ID||process.env.ADMIN_SCHOOL_ID||'default-school';
const storeFile=process.env.DATA_STORE_PATH,draftFile=learning.drafts.file;
if(!storeFile||!path.resolve(storeFile).startsWith('/data/'))throw Error('Run only against the mounted production data directory.');
const original=fs.readFileSync(storeFile,'utf8'),originalDraft=fs.existsSync(draftFile)?fs.readFileSync(draftFile,'utf8'):null;
const db=JSON.parse(original),drafts=originalDraft?JSON.parse(originalDraft):{version:1,users:{}};
let repaired=0,skipped=0;
for(const user of Object.values(db.users)){
 if(user.role!=='student'||!user.onboardingComplete||user.schoolId!=='school'||target==='school')continue;
 let verified;try{verified=roster.verify(user.studentNumber,user.name);}catch{skipped++;continue;}
 if(Number(user.grade)!==verified.grade||Number(user.classId)!==verified.classId){skipped++;continue;}
 const old=learning.drafts.key(user),next=learning.drafts.key({...user,schoolId:target});
 for(const [topic,modes] of Object.entries(drafts.users[old]||{}))for(const [mode,value] of Object.entries(modes)){
  const existing=drafts.users[next]?.[topic]?.[mode];
  if(existing&&JSON.stringify(existing)!==JSON.stringify(value))throw Error('Conflicting target draft; no files changed.');
  drafts.users[next]??={};drafts.users[next][topic]??={};drafts.users[next][topic][mode]=value;
 }
 user.schoolId=target;repaired++;
}
if(process.argv.includes('--apply')&&repaired){
 const backup='/data/school-link-backup-'+Date.now();fs.mkdirSync(backup,{mode:0o700});fs.writeFileSync(path.join(backup,'store.json'),original,{mode:0o600});if(originalDraft)fs.writeFileSync(path.join(backup,'drafts.json'),originalDraft,{mode:0o600});
 if(fs.readFileSync(storeFile,'utf8')!==original||(originalDraft&&fs.readFileSync(draftFile,'utf8')!==originalDraft))throw Error('Data changed during repair; retry.');
 for(const [file,value] of [[draftFile,drafts],[storeFile,db]]){const tmp=file+'.repair.tmp';fs.writeFileSync(tmp,JSON.stringify(value),{mode:0o600});fs.renameSync(tmp,file);}
 console.log(JSON.stringify({applied:true,repaired,skipped,backup}));
}else console.log(JSON.stringify({applied:false,repaired,skipped}));
