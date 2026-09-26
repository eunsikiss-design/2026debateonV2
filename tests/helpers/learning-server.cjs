// Local test harness only. Production server never imports this file.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http');
const root=path.resolve(__dirname,'../..');
const {LearningService}=require('../../services/learningService');
function build(file,coach,options={}){
 const learning=new LearningService(file),users=options.users||{student:{uid:'fixture-student',role:'student',name:'테스트 학생',schoolId:'fixture-school',grade:1,classId:1,studentNumber:'10101',email:'student@example.test',onboardingComplete:true},teacher:{uid:'fixture-teacher',role:'teacher',name:'테스트 교사',schoolId:'fixture-school',grade:1,classId:1,onboardingComplete:true}},sessions=[];
 const storage=options.storage||{getUser:uid=>Object.values(users).find(u=>u.uid===uid),getUsers:()=>[users.student],recordStudentVisit:()=>null,getStudentPracticeSessions:uid=>sessions.filter(s=>s.userId===uid).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)),getStudentBadges:()=>[],getClassSettings:()=>({requiredBadgeCount:1}),savePracticeSession:input=>(sessions.push(input),{...input,sessionId:'fixture-'+sessions.length}),awardBadge:()=>null,getClassStudentsStatus:()=>[],getClassAnalytics:()=>({}),getTeacherObservations:()=>[]};
 const auth=options.firebaseAuth||{isConfigured:()=>true,serverConfigured:()=>true,clientConfigured:()=>true,authenticate:async req=>users[/test_uid=([a-zA-Z0-9_-]+)/.exec(req.headers.cookie||'')?.[1]]||users[/test_role=(student|teacher)/.exec(req.headers.cookie||'')?.[1]],safeProfile:u=>u,sameClass:(teacher,schoolId,grade,classId)=>teacher.schoolId===schoolId&&teacher.grade===grade&&teacher.classId===classId};
 const services={schoolRecordService:require('../../services/schoolRecordService'),storageService:storage,learningService:learning,geminiService:coach||{evaluateBasicPractice:async()=>{throw Error('No coaching fixture configured');}},firebaseAuth:auth,socialAuth:{},studentRoster:options.studentRoster||{students:[],registrationStatus:()=>[]},knowledgeService:{cards:[],getEvidenceCards:()=>[],getStats:()=>({}),getGlossary:()=>[]},sheetSyncQueue:{enqueue(){},getQueueStatus:()=>({queueLength:0})}};
 services.studentReportService=require('../../services/studentReportService');
 services.learningDraftStore=require('../../services/learningDraftStore');
 services.activitySheets=require('../../services/activitySheets');
 services.appSchool=require('../../services/appSchool');
 services.schoolRecordSheets=options.schoolRecordSheets||require('../../services/schoolRecordSheets');
 let handler;const env={APP_ORIGIN:'http://127.0.0.1:3000'};
 vm.runInNewContext(fs.readFileSync(path.join(root,'server.js'),'utf8'),{require:id=>{if(id==='http')return {createServer:fn=>(handler=fn,{listen(){}})};if(id.startsWith('./services/')){const key=id.split('/').pop();if(!services[key])throw Error('Unexpected service '+key);return services[key];}return require(id);},__dirname:root,process:{env,loadEnvFile(){}},console:{log(){},warn(){}},URLSearchParams,Buffer,setTimeout,clearTimeout,setInterval,clearInterval});
 return {learning,users,sessions,async start(){const server=http.createServer((req,res)=>Promise.resolve(handler(req,res)).catch(e=>{res.writeHead(500);res.end(JSON.stringify({error:e.message}));}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;env.APP_ORIGIN=origin;return {origin,close:()=>new Promise(r=>server.close(r))};}};
}
module.exports={build};
