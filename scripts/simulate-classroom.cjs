'use strict';
// Opt-in local preview. Never imports production credentials or writes to the Railway volume.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.tmp','classroom-simulation');
const storeFile=path.join(dir,'store.json'),rosterFile=path.join(dir,'roster.json'),teachingFile=path.join(dir,'teaching.json');
const schoolId='simulation-school',grade=1,classId=3;
const number=i=>'103'+String(i).padStart(2,'0');
const uid=i=>'sim-'+number(i);
const name=i=>'가상학생'+String(i).padStart(2,'0');

function seed(){
 fs.mkdirSync(dir,{recursive:true});
 const roster={version:1,students:Array.from({length:24},(_,index)=>({studentNumber:number(index+1),name:name(index+1)}))};
 if(!fs.existsSync(rosterFile))fs.writeFileSync(rosterFile,JSON.stringify(roster,null,2));
 if(fs.existsSync(storeFile))return;
 const now=new Date().toISOString(),users={},practiceSessions=[],studentBadges=[];
 users.teacher={uid:'teacher',role:'teacher',name:'가상 담임교사',schoolId,grade,classId,authProvider:'simulation',onboardingComplete:true,createdAt:now};
 const topics=['curriculum_1_01','curriculum_1_02','curriculum_2_01'];
 for(let i=1;i<=24;i++){
  const studentUid=uid(i),studentNumber=number(i);
  users[studentUid]={uid:studentUid,role:'student',name:name(i),studentNumber,email:studentUid+'@example.invalid',schoolId,grade,classId,authProvider:'simulation',dataOrigin:'verified',onboardingComplete:true,registeredAt:now,privacyConsentAt:now,createdAt:now,lastLoginAt:now};
  const count=Math.floor((i-1)/6);
  for(let j=0;j<count;j++){
   const sessionId=`sim-session-${studentNumber}-${j+1}`,topicId=topics[j],base={sessionId,userId:studentUid,topicId,createdAt:new Date(Date.now()-(24-i)*3600000-j*60000).toISOString()};
   if(j===0)practiceSessions.push({...base,mode:'basic_practice',stance:i%2?'pro':'con',claim:`${name(i)}의 가상 주장입니다.`,reason:'서로 다른 사람의 권리와 부담을 비교해야 한다고 생각합니다.',rebuttal:'다른 입장의 걱정도 검토하겠습니다.',analysis:{claim:2,reasoning:2+(i%2),concept:1+(i%3),rebuttal:i%2,expression:2}});
   if(j===1)practiceSessions.push({...base,mode:'advanced_essay',studentDraft:'서로 다른 처지를 살펴야 합니다.\n\n상황에 교과 개념을 적용하여 이유를 설명합니다.\n\n반대 입장의 부담도 고려해 조건을 제안합니다.',writingPlan:{targetChars:450,targetSentences:9,targetParagraphs:3},overallLevel:'가상 기록'});
   if(j===2)practiceSessions.push({...base,mode:'speech_timer',transcript:'저는 두 입장의 요구를 비교해 조건을 정해야 한다고 생각합니다.',durationSeconds:45});
  }
  if(count>=2)studentBadges.push({id:'sim-badge-'+studentNumber,userId:studentUid,badgeType:'badge_reasoning',badgeName:'가상 연습 뱃지',earnedAt:now});
 }
 const store={users,classSettings:{[`${schoolId}_${grade}_${classId}`]:{schoolId,grade,classId,requiredBadgeCount:1,activeTopicId:'curriculum_1_01',updatedBy:'simulation',updatedAt:now}},studentBadges,practiceSessions,teacherObservations:[],auditLogs:[]};
 fs.writeFileSync(storeFile,JSON.stringify(store,null,2),{mode:0o600});
}

async function main(){
 seed();process.env.DATA_STORE_PATH=storeFile;
 const storage=require('../services/storageService'),{StudentRoster}=require('../services/studentRoster'),roster=new StudentRoster(rosterFile);
 const users={teacher:storage.getUser('teacher')};for(let i=1;i<=24;i++)users[uid(i)]=storage.getUser(uid(i));
 const status=storage.getClassStudentsStatus(schoolId,grade,classId),analytics=storage.getClassAnalytics(schoolId,grade,classId),registration=roster.registrationStatus(storage.getUsers());
 if(status.length!==24||registration.length!==24||analytics.totalStudents!==24)throw Error('가상 학급 데이터 검증에 실패했습니다.');
 const report=['# 1학년 3반 · 가상 학생 24명 활동 시뮬레이션','','**로컬 시험 환경 전용입니다.** 실제 학생 계정, 학교 명단, Railway 데이터, 외부 AI API는 사용하지 않습니다.','','- 가상 학번: 10301~10324','- 가입 완료: '+registration.filter(item=>item.registered).length+'/24','- 활동 기록: '+analytics.practiceSessionCount+'건','- 가상 연습 뱃지 보유: '+analytics.readyStudentsCount+'명','- 활동 분포: 미시작 6명 / 기초 6명 / 기초·논술 6명 / 기초·논술·스피치 6명','','| 가상 아이디 | 이름 | 학번 | 연습 기록 | 뱃지 |','|---|---|---|---:|---:|'];
 for(const item of status.sort((a,b)=>a.studentNumber.localeCompare(b.studentNumber)))report.push(`| ${item.uid} | ${item.name} | ${item.studentNumber} | ${item.practiceCount} | ${item.badgeCount} |`);
 report.push('','실행: `npm run simulate:classroom`','로컬 접속: http://127.0.0.1:3110/__simulation','');
 const reportFile=path.resolve(root,'../outputs/1학년3반_가상24명_시뮬레이션.md');fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,report.join('\n'));
 console.log(JSON.stringify({students:status.length,registrations:registration.length,sessions:analytics.practiceSessionCount,ready:analytics.readyStudentsCount,reportFile}));
 if(process.argv.includes('--report-only'))return;
 const {build}=require('../tests/helpers/learning-server.cjs'),questions=require('../services/writingQuestions');
 const coach={
  planAdvancedWriting:async input=>questions.localQuestions(input.lesson,input.writingPlan),
  evaluateBasicPractice:async()=>({source:'classroom-simulation',assessmentLimited:true,analysis:{},diagnosis:{strengths:['자신의 생각을 표현했습니다.'],weaknesses:['다른 입장의 이유를 더 살펴보세요.']},scaffold:{currentLevel:1,recommendedLevel:2,scaffoldGuidance:'상황 속 두 인물의 처지와 개념의 뜻을 연결해 보세요.'},feedback:{praise:'자신의 생각을 글로 나타냈습니다.',nextChallenge:'이유가 주장에 어떻게 이어지는지 설명해 보세요.',question:'다른 인물이 걱정하는 점은 무엇입니까?'},badgeEligible:false,evidenceBasis:[]}),
  evaluateAdvancedEssay:async()=>({source:'classroom-simulation',assessmentLimited:true,overallLevel:'확인 전',strengths:['주장과 이유를 작성했습니다.'],focusImprovement:'두 인물의 부담을 비교해 보세요.',socraticQuestion:'반대 입장의 걱정에는 어떤 조건으로 답하겠습니까?',badgeEligible:false,evidenceBasis:[]}),
  evaluateSpeech:async()=>({source:'classroom-simulation',assessmentLimited:true,scores:{totalScore:null},praise:'주장을 말로 표현했습니다.',growthPoint:'상황 근거를 한 가지 더 설명해 보세요.',nextSpeechChallenge:'다른 인물의 우려에 어떻게 답하겠습니까?',evidenceBasis:[]})
 };
 const upstream=await build(teachingFile,coach,{users,storage,studentRoster:roster}).start();
 const picker=()=>`<!doctype html><html lang="ko"><meta charset="utf-8"><title>가상 1학년 3반</title><style>body{font:18px/1.6 sans-serif;max-width:850px;margin:40px auto;padding:0 20px;background:#101722;color:#eef7ff}a{color:#91f1f5}li{margin:8px 0}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}</style><h1>가상 1학년 3반 · 24명</h1><p>로컬 시뮬레이션입니다. 실제 계정·학교 기록과 연결되지 않습니다.</p><p><a href="/__simulation/teacher">가상 담임교사 화면 열기</a></p><h2>가상 학생으로 전환</h2><ul class="grid">${Array.from({length:24},(_,j)=>{const i=j+1;return `<li><a href="/__simulation/student/${number(i)}">${number(i)} · ${name(i)}</a></li>`;}).join('')}</ul><p>6명은 미시작, 6명은 기초, 6명은 기초·논술, 6명은 세 활동을 완료한 가상 기록으로 시작합니다.</p></html>`;
 const server=http.createServer((req,res)=>{
  if(req.url==='/__simulation'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});return res.end(picker());}
  const match=/^\/__simulation\/student\/(103\d{2})$/.exec(req.url);if(req.url==='/__simulation/teacher'||match){const key=match?'sim-'+match[1]:'teacher';if(!users[key]){res.writeHead(404);return res.end();}res.writeHead(302,{'Set-Cookie':`test_uid=${key}; HttpOnly; SameSite=Lax; Path=/`,'Location':'/stitch_screens/'+(match?'13_learning_hub.html':'10_teacher_dashboard.html')});return res.end();}
  const forward=http.request(upstream.origin+req.url,{method:req.method,headers:{...req.headers,origin:upstream.origin}},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});forward.on('error',()=>{res.writeHead(502);res.end();});req.pipe(forward);
 });
 server.listen(3110,'127.0.0.1',()=>console.log('가상 1학년 3반: http://127.0.0.1:3110/__simulation'));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
