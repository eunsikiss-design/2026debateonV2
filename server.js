/**
 * 통합사회 논술·토론 AI 코치 플랫폼 ('디베이트온')
 * server.js
 * 
 * 정적 에셋 서빙 + Phase 1 REST API 서버
 * - 환경변수 안전 로딩 (.env)
 * - Gemini API 보안 중계
 * - Firestore 표준 스키마 영속 계층 연동
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Node 22+ dotenv parser; process environment takes precedence. Never log values.
for (const file of ['.env.local', '.env']) {
  const location = path.join(__dirname, file);
  if (fs.existsSync(location)) process.loadEnvFile(location);
}
if (process.env.PORT && (!/^\d+$/.test(process.env.PORT) || Number(process.env.PORT) < 1 || Number(process.env.PORT) > 65535)) {
  throw new Error('PORT must be an integer from 1 to 65535');
}

const storageService = require('./services/storageService');
const geminiService = require('./services/geminiService');
const knowledgeService = require('./services/knowledgeService');
const sheetSyncQueue = require('./services/sheetSyncQueue');
const firebaseAuth = require('./services/firebaseAuth');
const socialAuth = require('./services/socialAuth');
const studentRoster = require('./services/studentRoster');
const learningService = require('./services/learningService');
const schoolRecords = require('./services/schoolRecordService');
const studentReports = require('./services/studentReportService');
const debateInsights = require('./services/debateInsights');
let recordSheetsInstance;
function recordSheets(){return recordSheetsInstance ||= new (require('./services/schoolRecordSheets').SchoolRecordSheets)(storageService);}
let activitySheetsInstance;
function activitySheets(){return activitySheetsInstance ||= new (require('./services/activitySheets').ActivitySheets)(storageService,learningService,recordSheets());}
let growthSheetsInstance;
function growthSheets(){return growthSheetsInstance ||= new (require('./services/growthSheets').GrowthSheets)(storageService,learningService,recordSheets());}

const PORT = parseInt(process.env.PORT, 10) || 3000;
const ROOT = path.resolve(__dirname);
const debateStreams = new Map();
const debateJobs = new Map();
const debateRefreshTimers = new Map();
const growthJobs = new Map();

function restoreStoredStudentProfile(profile) {
  if (!profile || profile.role !== 'student') return profile;
  const stored = storageService.getUser(profile.uid);
  if (!stored?.onboardingComplete) return profile;
  return {
    ...profile,
    name: stored.name || profile.name,
    schoolId: stored.schoolId || profile.schoolId,
    grade: Number(stored.grade) || profile.grade,
    classId: Number(stored.classId) || profile.classId,
    studentNumber: String(stored.studentNumber || profile.studentNumber || ''),
    onboardingComplete: true,
    privacyConsentAt: stored.privacyConsentAt || profile.privacyConsentAt
  };
}

function teacherClasses(user) {
  const rosterSchool = process.env.ADMIN_SCHOOL_ID || process.env.STUDENT_SCHOOL_ID || user.schoolId;
  if (user.schoolId !== rosterSchool) return [{ grade: Number(user.grade), classId: Number(user.classId) }];
  const classes = new Map();
  for (const student of studentRoster.students) {
    if (!Number.isInteger(student.grade) || !Number.isInteger(student.classId)) continue;
    classes.set(`${student.grade}-${student.classId}`, { grade: student.grade, classId: student.classId });
  }
  classes.set(`${user.grade}-${user.classId}`, { grade: Number(user.grade), classId: Number(user.classId) });
  return [...classes.values()].sort((a,b) => a.grade-b.grade || a.classId-b.classId);
}

function teacherClass(user, classValue) {
  if (!classValue) return { schoolId: user.schoolId, grade: Number(user.grade), classId: Number(user.classId) };
  const selected = teacherClasses(user).find(item => `${item.grade}-${item.classId}` === classValue);
  if (!selected) throw Object.assign(new Error('담당 학교 명단에 없는 학급입니다.'), { status: 403 });
  return { schoolId: user.schoolId, ...selected };
}

function studentRecordPortfolio(teacher, studentId) {
  const student = storageService.getUser(studentId);
  if (!student || student.role !== 'student' || student.schoolId !== teacher.schoolId) throw Object.assign(new Error('담당 학교의 학생만 검토할 수 있습니다.'), {status:403});
  teacherClass(teacher, `${student.grade}-${student.classId}`);
  return schoolRecords.portfolio(storageService, student, id => {
    try { return learningService.topic(id, teacher); } catch { return storageService.getTopic(id); }
  },learningService.drafts.list(student));
}

function broadcastDebate(roomId, event, payload) {
  const clients = debateStreams.get(roomId);
  if (!clients) return;
  for (const client of clients) client.response.write(`event: ${event}\ndata: ${JSON.stringify(event==='room'?{...payload,room:presentDebateRoom(client.user,payload.room)}:payload)}\n\n`);
}
function presentDebateRoom(user,room){
  if(user.role==='teacher'||!room?.aiReview?.students)return room;
  return {...room,aiReview:{...room.aiReview,students:room.aiReview.students[user.uid]?{[user.uid]:room.aiReview.students[user.uid]}:{}}};
}

function scopedDebateRoom(user, roomId) {
  let room=storageService.getDebateRoom(roomId);
  if(user.role==='teacher'){teacherClass(user,`${room.grade}-${room.classId}`);if(user.schoolId!==room.schoolId)throw Object.assign(new Error('담당 학교의 토론방만 이용할 수 있습니다.'),{status:403});}
  else if(!firebaseAuth.sameClass(user,room.schoolId,room.grade,room.classId))throw Object.assign(new Error('담당 학급의 토론방만 이용할 수 있습니다.'),{status:403});
  if(room.status==='active'&&Date.parse(room.endsAt)<=Date.now())room=finishDebate(roomId);
  if(room.status==='completed'&&room.aiReview?.status==='pending'&&!debateJobs.has(`${roomId}:final`)){queueDebateAnalysis(roomId,'final',{force:true});room=storageService.getDebateRoom(roomId);}
  return room;
}

function roomStatistics(room){return debateInsights.statistics(room);}
function publishRoom(roomId){const room=storageService.getDebateRoom(roomId);broadcastDebate(roomId,'room',{room:{...room,statistics:roomStatistics(room),remainingSeconds:Math.max(0,Math.floor((Date.parse(room.endsAt)-Date.now())/1000))}});return room;}
function queueDebateAnalysis(roomId,kind,{force=false}={}){
  const key=`${roomId}:${kind}`;
  if(debateJobs.has(key))return;
  const room=storageService.getDebateRoom(roomId),stats=roomStatistics(room);
  if(!stats.byTeam.pro.total||!stats.byTeam.con.total)return;
  if(kind==='live'&&room.status!=='active')return;
  if(kind==='final'&&room.status!=='completed')return;
  const previous=kind==='live'?room.aiSummary:room.aiReview;
  if(!force&&previous?.status==='ready'&&previous.messageCount===stats.total)return;
  if(!force&&previous?.status==='unavailable'&&previous.messageCount===stats.total)return;
  if(kind==='live'&&!force&&previous?.status==='ready'&&Date.now()-Date.parse(previous.generatedAt)<45000){
    if(!debateRefreshTimers.has(roomId)){const delay=45000-(Date.now()-Date.parse(previous.generatedAt))+100,timer=setTimeout(()=>{debateRefreshTimers.delete(roomId);queueDebateAnalysis(roomId,'live');},Math.max(100,delay));timer.unref?.();debateRefreshTimers.set(roomId,timer);}return;
  }
  const field=kind==='live'?'aiSummary':'aiReview';
  storageService.updateDebateRoom(roomId,{[field]:{status:'pending',messageCount:stats.total,requestedAt:new Date().toISOString()}});
  publishRoom(roomId);
  const job=debateInsights.analyze(geminiService,room,kind).then(result=>{
    storageService.updateDebateRoom(roomId,{[field]:result});
    publishRoom(roomId);
  }).catch(()=>{
    storageService.updateDebateRoom(roomId,{[field]:{status:'unavailable',messageCount:stats.total,message:'AI 분석을 완료하지 못했습니다. 실제 발언 기록을 확인해 주세요.'}});
    publishRoom(roomId);
  }).finally(()=>{debateJobs.delete(key);if(kind==='live'){const latest=storageService.getDebateRoom(roomId);if(latest.status==='active'&&roomStatistics(latest).total>stats.total)queueDebateAnalysis(roomId,'live');}});
  debateJobs.set(key,job);
}
function finishDebate(roomId){
  const room=storageService.getDebateRoom(roomId);
  if(room.status==='completed'){if(room.aiReview?.status==='pending'&&!debateJobs.has(`${roomId}:final`))queueDebateAnalysis(roomId,'final',{force:true});return room;}
  const stats=roomStatistics(room),messages=debateInsights.verified(room);
  const evaluation={topic:room.title,status:'completed',finishedAt:new Date().toISOString(),evidenceMessageIds:messages.map(m=>m.messageId),statistics:stats,note:'발언 횟수는 수행평가 점수가 아닙니다. AI 피드백은 교사 검토용입니다.'};
  const aiReview=stats.byTeam.pro.total&&stats.byTeam.con.total?{status:'pending',messageCount:stats.total}:{status:'insufficient',messageCount:stats.total,message:'찬성과 반대 양쪽의 실제 발언이 있어야 AI가 논점을 비교할 수 있습니다.'};
  storageService.updateDebateRoom(roomId,{status:'completed',finishedAt:evaluation.finishedAt,evaluation,aiReview});
  publishRoom(roomId);
  if(aiReview.status==='pending')queueDebateAnalysis(roomId,'final');
  return storageService.getDebateRoom(roomId);
}
function finishExpiredDebates(){for(const roomId of storageService.getExpiredDebateRoomIds?.()||[])try{finishDebate(roomId);}catch{ /* retry on the next tick */ }}
if(typeof setInterval==='function'){const debateExpiryTimer=setInterval(finishExpiredDebates,10000);debateExpiryTimer.unref?.();}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf'
};

// Helper: JSON 요청 바디 파서
function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) { // 10MB limit
        req.connection.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

// Helper: JSON 응답 헬퍼
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return;
  }

  const urlParts = req.url.split('?');
  let pathname;
  try { pathname = decodeURIComponent(urlParts[0]); }
  catch { sendJSON(res, 400, { success: false, error: 'INVALID_URL' }); return; }
  if (pathname === '/api/health' && req.method === 'GET') {
    sendJSON(res, 200, { success: true, mode: firebaseAuth.isConfigured() ? 'authenticated' : 'preview',
      authentication: firebaseAuth.isConfigured() ? 'firebase_session' : 'firebase_setup_required',
      storage: process.env.DATA_STORE_PATH ? 'persistent-volume' : 'local-json-migration-pending', firebase: firebaseAuth.serverConfigured() ? 'admin_configured' : 'not_connected', sheets: 'not_connected',
      gemini: process.env.GEMINI_API_KEY ? 'configured_not_verified' : 'not_configured', evidenceCount: knowledgeService.cards.length,
      rosterCount: studentRoster.students.length }); return;
  }
  if (pathname === '/api/auth/config' && req.method === 'GET') {
    const config=firebaseAuth.publicConfig();if(!config){sendJSON(res,503,{success:false,error:'AUTH_NOT_CONFIGURED',message:'Firebase Web 설정과 Authentication 활성화가 필요합니다.'});return;}
    sendJSON(res,200,{success:true,firebase:config});return;
  }
  if (pathname === '/api/auth/providers' && req.method === 'GET') {
    sendJSON(res,200,{success:true,providers:{google:firebaseAuth.clientConfigured(),naver:socialAuth.configured('naver'),kakao:socialAuth.configured('kakao')},studentDefault:true,adminLogin:Boolean(process.env.ADMIN_EMAIL)});return;
  }
  if (pathname === '/api/auth/admin' && req.method === 'POST') {
    if(!firebaseAuth.isConfigured()){sendJSON(res,503,{success:false,error:'AUTH_NOT_CONFIGURED'});return;}
    try{const body=await parseRequestBody(req);const created=await firebaseAuth.signInAdmin(body.username,body.password);res.setHeader('Set-Cookie',firebaseAuth.cookie(created.session,created.maxAgeSeconds));sendJSON(res,200,{success:true,user:firebaseAuth.safeProfile(created.profile)});}catch{sendJSON(res,401,{success:false,error:'INVALID_ADMIN_CREDENTIALS',message:'관리자 아이디 또는 비밀번호를 확인하세요.'});}return;
  }
  if (pathname === '/api/auth/test-student' && req.method === 'POST') {
    if(!firebaseAuth.isConfigured()){sendJSON(res,503,{success:false,error:'AUTH_NOT_CONFIGURED'});return;}
    try {
      const body=await parseRequestBody(req),created=await firebaseAuth.signInTestStudent(body.username,body.password);
      const restored=restoreStoredStudentProfile(created.profile);
      if(restored.onboardingComplete)storageService.recordStudentVisit(restored.uid);
      res.setHeader('Set-Cookie',firebaseAuth.cookie(created.session,created.maxAgeSeconds));
      sendJSON(res,200,{success:true,user:firebaseAuth.safeProfile(restored)});
    }catch{sendJSON(res,401,{success:false,error:'INVALID_TEST_CREDENTIALS',message:'테스트 아이디 또는 비밀번호를 확인하세요.'});}
    return;
  }
  const socialStart = pathname.match(/^\/api\/auth\/(naver|kakao)\/start$/);
  if (socialStart && req.method === 'GET') {
    try{const started=socialAuth.start(socialStart[1]);res.setHeader('Set-Cookie',started.cookie);res.writeHead(302,{Location:started.url});res.end();}catch{sendJSON(res,503,{success:false,error:'SOCIAL_PROVIDER_NOT_CONFIGURED',message:'간편가입 제공자 설정이 아직 완료되지 않았습니다.'});}return;
  }
  const socialCallback = pathname.match(/^\/api\/auth\/(naver|kakao)\/callback$/);
  if (socialCallback && req.method === 'GET') {
    try{const params=new URLSearchParams(urlParts[1]||'');const profile=await socialAuth.complete(socialCallback[1],params.get('code'),params.get('state'),req.headers.cookie);const created=await firebaseAuth.createSocialSession({provider:socialCallback[1],...profile}),restored=restoreStoredStudentProfile(created.profile);if(restored.onboardingComplete)storageService.recordStudentVisit(restored.uid);res.setHeader('Set-Cookie',[socialAuth.stateCookie(socialCallback[1],'',0),firebaseAuth.cookie(created.session,created.maxAgeSeconds)]);res.writeHead(302,{Location:restored.onboardingComplete?'/stitch_screens/13_learning_hub.html':'/stitch_screens/04_login_signup.html?onboarding=1'});res.end();}catch{res.writeHead(302,{Location:'/stitch_screens/04_login_signup.html?error=social_login_failed'});res.end();}return;
  }
  if (pathname === '/api/auth/session' && req.method === 'POST') {
    if(!firebaseAuth.isConfigured()){sendJSON(res,503,{success:false,error:'AUTH_NOT_CONFIGURED',message:'Firebase Authentication 설정이 완료되지 않았습니다.'});return;}
    try{const body=await parseRequestBody(req);if(!body.idToken)throw new Error('ID token required');const created=await firebaseAuth.createSession(body.idToken),restored=restoreStoredStudentProfile(created.profile);if(restored.role==='student'&&restored.onboardingComplete)storageService.recordStudentVisit(restored.uid);res.setHeader('Set-Cookie',firebaseAuth.cookie(created.session,created.maxAgeSeconds));sendJSON(res,200,{success:true,user:firebaseAuth.safeProfile(restored)});}catch(error){sendJSON(res,error.code==='EMAIL_VERIFICATION_REQUIRED'?403:401,{success:false,error:error.code==='EMAIL_VERIFICATION_REQUIRED'?error.code:'INVALID_ID_TOKEN',message:error.code==='EMAIL_VERIFICATION_REQUIRED'?error.message:'로그인 정보를 확인할 수 없습니다.'});}return;
  }
  if (pathname === '/api/auth/logout' && req.method === 'POST') {res.setHeader('Set-Cookie',firebaseAuth.cookie('',0));sendJSON(res,200,{success:true});return;}
  const publicReads = new Set(['/api/topics']);
  if (pathname.startsWith('/api/') && !(req.method==='GET'&&publicReads.has(pathname))) {
    if(!firebaseAuth.isConfigured()){sendJSON(res,503,{success:false,error:'AUTH_NOT_CONFIGURED',message:'Firebase Authentication 설정이 완료되지 않았습니다.'});return;}
    try{req.auth=restoreStoredStudentProfile(await firebaseAuth.authenticate(req,uid=>storageService.getUser(uid)));}catch{req.auth=null;}
    if(!req.auth){sendJSON(res,401,{success:false,error:'AUTH_REQUIRED',message:'로그인이 필요합니다.'});return;}
    if(req.auth.role==='student'&&req.auth.onboardingComplete===false&&!['/api/auth/me','/api/auth/onboarding'].includes(pathname)){
      sendJSON(res,403,{success:false,error:'ONBOARDING_REQUIRED',message:'학번·성명 확인과 개인정보 이용 동의를 완료해 주세요.'});return;
    }
    if(!['GET','HEAD'].includes(req.method)){
      const origin=req.headers.origin;
      const allowedOrigins=new Set([
        'http://127.0.0.1:'+PORT,
        'http://localhost:'+PORT,
        process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '',
        ...String(process.env.APP_ORIGIN || '').split(',').map(value=>value.trim()).filter(Boolean)
      ].filter(Boolean));
      if(origin&&!allowedOrigins.has(origin)){sendJSON(res,403,{success:false,error:'ORIGIN_FORBIDDEN'});return;}
    }
    if((pathname.startsWith('/api/teacher/')||pathname.startsWith('/api/sync/')||pathname==='/api/debate/room/init'||pathname==='/api/debate/finish'||pathname==='/api/debate/extend')&&req.auth.role!=='teacher'){sendJSON(res,403,{success:false,error:'TEACHER_REQUIRED'});return;}
  }
  const queryParams = new URLSearchParams(urlParts[1] || '');

  // ==========================================
  // [REST API ROUTES]
  // ==========================================

  // 1. Legacy name/number login is permanently disabled.
  if (req.method === 'POST' && pathname === '/api/auth/login') { sendJSON(res,410,{success:false,error:'LEGACY_LOGIN_REMOVED'});return; }

  // 2. Current verified session.
  if (req.method === 'GET' && pathname === '/api/auth/me') {if(req.auth.role==='student'&&req.auth.onboardingComplete)storageService.recordStudentVisit(req.auth.uid);res.setHeader('Cache-Control','private, no-store');sendJSON(res,200,{success:true,user:firebaseAuth.safeProfile(req.auth)});return; }

  if (pathname === '/api/student/badges' && ['GET','POST'].includes(req.method)) {
    res.setHeader('Cache-Control','private, no-store');
    if(req.auth.role!=='student'){sendJSON(res,403,{success:false,error:'STUDENT_REQUIRED'});return;}
    try {
      if(req.method==='POST'){
        const {badgeId}=await parseRequestBody(req);
        if(typeof badgeId!=='string'||!badgeId.trim()){sendJSON(res,400,{success:false,error:'BADGE_ID_REQUIRED'});return;}
        const badge=storageService.acknowledgeBadge(req.auth.uid,badgeId);
        if(!badge){sendJSON(res,404,{success:false,error:'BADGE_NOT_FOUND'});return;}
      }
      sendJSON(res,200,{success:true,badges:storageService.getStudentBadges(req.auth.uid).sort((a,b)=>Date.parse(a.earnedAt)-Date.parse(b.earnedAt))});
    }catch(error){sendJSON(res,error.status||500,{success:false,error:error.status?error.message:'뱃지 기록을 불러오지 못했습니다.'});}
    return;
  }

  if (req.method === 'POST' && pathname === '/api/auth/onboarding') {
    try {
      if(req.auth.role!=='student'){sendJSON(res,403,{success:false,error:'STUDENT_REQUIRED',message:'학생 계정에서만 가입할 수 있습니다.'});return;}
      if(!studentRoster.students.length){sendJSON(res,503,{success:false,error:'ROSTER_NOT_CONFIGURED',message:'학생 명단이 아직 등록되지 않았습니다.'});return;}
      const body=await parseRequestBody(req);
      if(body.privacyConsent!==true){sendJSON(res,400,{success:false,error:'PRIVACY_CONSENT_REQUIRED',message:'개인정보 이용 동의가 필요합니다.'});return;}
      const testNumber=firebaseAuth.testStudentNumberForUid?.(req.auth.uid);
      if(testNumber&&String(body.studentNumber)!==testNumber){sendJSON(res,403,{success:false,error:'TEST_STUDENT_NUMBER_FIXED',message:'테스트 계정에 지정된 학번으로 가입해 주세요.'});return;}
      const verified=studentRoster.verify(body.studentNumber,body.name),claimed=storageService.findUserByStudentNumber(verified.studentNumber);
      if(claimed&&claimed.uid!==req.auth.uid){sendJSON(res,409,{success:false,error:'STUDENT_NUMBER_ALREADY_REGISTERED',message:'이미 가입에 사용된 학번입니다. 교사에게 문의해 주세요.'});return;}
      const now=new Date().toISOString(),profileData={name:verified.verifiedName,
        schoolId:require('./services/appSchool').id(),grade:verified.grade,classId:verified.classId,
        studentNumber:verified.studentNumber,privacyConsentAt:now,privacyConsentVersion:'2026-09-23-v1'},profile={...req.auth,...profileData,onboardingComplete:true};
      storageService.saveUser({...profile,studentNumber:verified.studentNumber,name:verified.verifiedName,grade:verified.grade,classId:verified.classId,
        onboardingComplete:true,transferSlot:verified.transferSlot,isTestAccount:verified.testSlot===true,privacyConsentAt:now,privacyConsentVersion:'2026-09-23-v1',registeredAt:claimed?.registeredAt||now,dataOrigin:'verified'});
      storageService.recordStudentVisit(profile.uid,now);
      try{Object.assign(profile,await firebaseAuth.completeStudentProfile(req.auth,profileData));}
      catch(error){console.warn('Firebase student profile sync deferred:',error?.code||error?.name||'unknown');}
      sendJSON(res,200,{success:true,user:firebaseAuth.safeProfile(profile)});
    } catch(error){sendJSON(res,error.status||500,{success:false,error:error.code||'ONBOARDING_FAILED',message:error.status?error.message:'학생 가입 정보를 저장하지 못했습니다.'});}
    return;
  }

  // 3. 토론 논제 목록 조회: GET /api/topics
  if (req.method === 'GET' && pathname === '/api/topics') {
    try {
      const topicsPath = path.join(__dirname, 'data', 'topics.json');
      const topicsData = JSON.parse(fs.readFileSync(topicsPath, 'utf-8'));
      sendJSON(res, 200, { success: true, topics: topicsData });
    } catch (err) {
      sendJSON(res, 500, { success: false, error: 'Failed to load topics' });
    }
    return;
  }

  // 4. Gemini 기초 연습 실시간 진단: POST /api/practice/evaluate
  if (pathname === '/api/learning/topics' && req.method === 'GET') {
    try { res.setHeader('Cache-Control','no-store');sendJSON(res,200,{success:true,topics:learningService.list(req.auth)}); }
    catch(error){sendJSON(res,error.status||500,{success:false,error:error.code||'LEARNING_UNAVAILABLE',message:error.status?error.message:'수업 자료를 불러오지 못했습니다.'});} return;
  }
  const lessonRoute=pathname.match(/^\/api\/learning\/topics\/([a-zA-Z0-9_-]+)$/);
  const materialRoute=pathname.match(/^\/api\/teacher\/materials\/([a-zA-Z0-9_-]+)$/);
  if(materialRoute&&req.method==='PUT'){
    try{res.setHeader('Cache-Control','no-store');sendJSON(res,200,{success:true,...learningService.savePlan(materialRoute[1],req.auth,await parseRequestBody(req))});}
    catch(error){sendJSON(res,error.status||500,{success:false,error:error.status?error.message:'수업 자료 저장에 실패했습니다.'});}return;
  }
  const draftRoute=pathname.match(/^\/api\/learning\/drafts\/([a-zA-Z0-9_-]+)$/);
  if(pathname==='/api/learning/history'&&req.method==='GET'){
    try{
      if(req.auth.role!=='student')throw Object.assign(Error('학생 활동 기록만 조회할 수 있습니다.'),{status:403});
      const {hasDraftContent}=require('./services/learningDraftStore');
      const topicId=new URLSearchParams(urlParts[1]||'').get('topicId');
      if(topicId)learningService.topic(topicId,req.auth);
      const titles=new Map(learningService.list(req.auth).map(t=>[t.topicId,t.title]));
      const drafts=learningService.drafts.list(req.auth);
      const entries=[];
      for(const [id,modes] of Object.entries(drafts)){
        if(topicId&&id!==topicId)continue;
        for(const mode of ['basic','advanced','speech'])if(modes[mode]){if(hasDraftContent(mode,modes[mode].content))entries.push({kind:'draft',mode,topicId:id,topicTitle:titles.get(id)||id,updatedAt:modes[mode].updatedAt,content:modes[mode].content});for(const v of modes[mode].versions||[])if(hasDraftContent(mode,v.content))entries.push({kind:'snapshot',mode,topicId:id,topicTitle:titles.get(id)||id,...v});}
      }
      for(const s of storageService.getStudentPracticeSessions(req.auth.uid)){
        if(topicId&&s.topicId!==topicId)continue;
        const mode=s.mode==='advanced_essay'?'advanced':s.mode==='speech_timer'?'speech':s.mode==='basic'||s.mode==='basic_practice'||!s.mode?'basic':null;
        if(!mode)continue;
        const content=mode==='basic'?{stance:s.stance||'pro',claim:s.claim||'',reason:s.reason||'',rebuttal:s.rebuttal||''}:mode==='advanced'?{studentDraft:s.studentDraft||'',writingPlan:s.writingPlan||null}:{transcript:s.transcript||'',outline:s.outline||null,durationSeconds:s.durationSeconds||0};
        const feedback=s.evaluation||{analysis:s.analysis||{},diagnosis:s.diagnosis||{},feedback:s.feedback||{}};
        entries.push({kind:'record',mode,topicId:s.topicId,topicTitle:s.topicTitle||titles.get(s.topicId)||s.topicId,updatedAt:s.createdAt||s.submittedAt,sessionId:s.sessionId,content,feedback});
      }
      entries.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
      res.setHeader('Cache-Control','no-store');sendJSON(res,200,{success:true,entries});
    }catch(error){sendJSON(res,error.status||500,{success:false,error:error.status?error.message:'활동 기록을 불러오지 못했습니다.'});}return;
  }
  if(draftRoute){
    try{
      res.setHeader('Cache-Control','no-store');learningService.topic(draftRoute[1],req.auth);
      if(req.method==='GET'){
        const counts={basic:0,advanced:0};
        const previous=storageService.getStudentPracticeSessions(req.auth.uid).filter(s=>{if(s.topicId!==draftRoute[1]||s.mode==='speech_timer')return false;const mode=s.mode==='advanced_essay'?'advanced':'basic';return ++counts[mode]<=30;}).reverse().map(s=>({mode:s.mode==='advanced_essay'?'advanced':'basic',content:s.studentDraft?{paragraphs:s.studentDraft.split(/\n\s*\n/),writingPlan:s.writingPlan}:{claim:s.claim||'',reason:s.reason||'',rebuttal:s.rebuttal||'',stance:s.stance||'pro'},updatedAt:s.createdAt||s.submittedAt}));
        sendJSON(res,200,{success:true,drafts:learningService.drafts.get(req.auth,draftRoute[1]),previous});
      }else if(req.method==='PUT')sendJSON(res,200,{success:true,draft:learningService.drafts.save(req.auth,draftRoute[1],await parseRequestBody(req))});
      else sendJSON(res,405,{error:'METHOD_NOT_ALLOWED'});
    }catch(error){sendJSON(res,error.status||500,{success:false,error:error.status?error.message:'초안을 저장하거나 불러오지 못했습니다.'});}return;
  }
  if ((lessonRoute||materialRoute)&&req.method==='GET') {
    try {res.setHeader('Cache-Control','no-store');sendJSON(res,200,{success:true,...(materialRoute?learningService.teacherMaterial(materialRoute[1],req.auth):{lesson:learningService.lesson(lessonRoute[1],req.auth)})});}
    catch(error){sendJSON(res,error.status||500,{success:false,error:error.code||'LEARNING_UNAVAILABLE',message:error.status?error.message:'수업 자료를 불러오지 못했습니다.'});} return;
  }
  const keywordRoute=pathname.match(/^\/api\/teacher\/keywords(?:\/([a-zA-Z0-9_-]+))?$/);
  if(keywordRoute){
    try {
      res.setHeader('Cache-Control','no-store');
      if(req.method==='GET'&&!keywordRoute[1])sendJSON(res,200,{success:true,...learningService.keywords(req.auth)});
      else if((req.method==='POST'&&!keywordRoute[1])||(['PUT','DELETE'].includes(req.method)&&keywordRoute[1])){
        const body=await parseRequestBody(req);sendJSON(res,200,{success:true,...learningService.mutate(req.auth,req.method,keywordRoute[1],body)});
      }else sendJSON(res,405,{success:false,error:'METHOD_NOT_ALLOWED'});
    } catch(error){sendJSON(res,error.status||500,{success:false,error:error.code||'KEYWORD_SAVE_FAILED',message:error.status?error.message:'단어를 저장하지 못했습니다. 기존 설정은 유지됩니다.'});} return;
  }

  if (req.method === 'POST' && pathname === '/api/practice/evaluate') {
    try {
      const body = await parseRequestBody(req);
      const { stance, claim, reason, rebuttal, currentScaffoldLevel = 1, attemptCount = 1 } = body;
      const learningContext=learningService.coaching(body.topicId||body.topic?.topicId,req.auth,'basic');
      const topic=learningContext.topic;

      const evaluation = await geminiService.evaluateBasicPractice({
        topic,
        learningContext,
        stance,
        claim,
        reason,
        rebuttal,
        currentScaffoldLevel,
        attemptCount
      });

      sendJSON(res, 200, { success: true, evaluation });
    } catch (err) {
      sendJSON(res, err.status || 500, { success: false, error: err.status ? err.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    return;
  }

  // 5. 연습 제출 및 뱃지 수여: POST /api/practice/submit
  if (req.method === 'POST' && pathname === '/api/practice/submit') {
    try {
      const body = await parseRequestBody(req);
      const { topicId, stance, claim, reason, rebuttal, scaffoldLevel, evaluation, attemptCount = 1 } = body;
      const userId=req.auth.uid;
      const user = storageService.getUser(userId);
      if (!user) {
        sendJSON(res, 404, { success: false, error: 'User not found' });
        return;
      }

      // 세션 기록 저장
      const session = storageService.savePracticeSession({
        userId: user.uid,
        topicId,
        topicTitle: learningService.topic(topicId,req.auth).title,
        mode: 'basic',
        stance,
        claim,
        reason,
        rebuttal,
        scaffoldLevel,
        analysis: evaluation?.analysis || {},
        diagnosis: evaluation?.diagnosis || {},
        feedback: evaluation?.feedback || {},
        attemptCount,
        badgeAwarded: false
      });

      // 뱃지 수여 조건 검증 (지시서 제15조: 2~3문장 + 해당 논증요소 + 피드백 확인 + 1회 이상 재도전)
      let awardedBadge = null;
      if (attemptCount >= 2 || evaluation?.badgeEligible) {
        awardedBadge = storageService.awardBadge(user.uid, {
          badgeType: "badge_reasoning",
          badgeName: "주장-근거 연결 뱃지",
          description: "2~3문장 논증 구조를 완성하고 소크라 AI 피드백을 반영해 성공적으로 재도전을 완료함",
          icon: "verified",
          sessionRef: session.sessionId
        });
        session.badgeAwarded = true;
      }

      sendJSON(res, 200, {
        success: true,
        session,
        badge: awardedBadge,
        badgeAwarded: !!awardedBadge
      });
    } catch (err) {
      sendJSON(res, err.status || 500, { success: false, error: err.status ? err.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    return;
  }

  // Student growth: authentic source records, scoped access, and citation-backed feedback.
  const growthRoute=pathname.match(/^\/api\/growth\/student\/([^/]+)(\/analyze|\/report\.pdf)?$/);
  if(growthRoute&&((req.method==='GET'&&growthRoute[2]!=='/analyze')||(req.method==='POST'&&growthRoute[2]==='/analyze'))){
    res.setHeader('Cache-Control','private, no-store');
    try{
      const uid=growthRoute[1];
      if(req.auth.role!=='teacher'&&uid!==req.auth.uid)throw Object.assign(Error('본인의 활동 기록만 확인할 수 있습니다.'),{status:403});
      const student=storageService.getUser(uid);
      if(!student||student.role!=='student')throw Object.assign(Error('학생 기록을 찾을 수 없습니다.'),{status:404});
      if(req.auth.role==='teacher')studentRecordPortfolio(req.auth,uid);
      const topicId=queryParams.get('topic')||'';
      if(topicId.length>100||topicId&&!/^[a-zA-Z0-9_-]+$/.test(topicId))throw Object.assign(Error('주제를 확인하세요.'),{status:400});
      const growth=require('./services/studentGrowthService');
      const report=growth.collect(storageService,learningService,student,topicId),selected=growth.batch(report);
      const prior=storageService.getStudentGrowthAnalysis(student,topicId);
      let analysis=prior?.fingerprint===report.fingerprint?prior:null;
      if(growthRoute[2]==='/report.pdf'){
        if(queryParams.has('fingerprint')&&(queryParams.get('fingerprint')!==report.fingerprint||queryParams.get('analysisAt')!==(analysis?.generatedAt||'')))throw Object.assign(Error('기록이나 분석이 변경되었습니다. 기록을 새로고침한 뒤 PDF를 다시 만들어 주세요.'),{status:409});
        const exporter=require('./services/studentGrowthReport'),document=exporter.build(report,analysis),buffer=await exporter.pdf(document);
        res.writeHead(200,{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="DebateOn-growth.pdf"; filename*=UTF-8''${encodeURIComponent(exporter.filename(document))}`,'Content-Length':buffer.length,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(buffer);return;
      }
      if(req.method==='POST'){
        const body=await parseRequestBody(req);
        if(!selected.sources.length)throw Object.assign(Error('저장한 글이나 전사문, 토론 발언이 한 건 이상 필요합니다.'),{status:400});
        if(!analysis||analysis.source!=='gemini-api'||body.force===true){
          const jobKey=JSON.stringify([student.schoolId,uid,topicId,report.fingerprint]);
          if(!growthJobs.has(jobKey)){
            const job=(async()=>{
              const result=await geminiService.analyzeStudentGrowth(selected);
              const latest=growth.collect(storageService,learningService,student,topicId);
              if(latest.fingerprint!==report.fingerprint)throw Object.assign(Error('분석 중 활동 기록이 변경되었습니다. 새로고침 후 다시 분석해 주세요.'),{status:409});
              return storageService.saveStudentGrowthAnalysis(student,topicId,{...result,fingerprint:report.fingerprint,generatedAt:new Date().toISOString(),analyzedCount:selected.sources.length,excludedCount:selected.excludedCount,truncatedCount:selected.truncatedCount});
            })();growthJobs.set(jobKey,job);job.finally(()=>growthJobs.delete(jobKey)).catch(()=>{});
          }
          analysis=await growthJobs.get(jobKey);
        }
      }
      const badges=storageService.getStudentBadges(uid),required=storageService.getClassSettings(student.schoolId,student.grade,student.classId).requiredBadgeCount??1;
      sendJSON(res,200,{success:true,...report,axes:growth.AXES,analysis,analysisStale:Boolean(prior&&!analysis),analysisScope:{includedCount:selected.sources.length,excludedCount:selected.excludedCount},readiness:{earnedBadges:badges.length,requiredBadges:required,isBattleReady:badges.length>=required||student.battleOverride===true}});
    }catch(error){sendJSON(res,error.status||500,{success:false,message:error.status?error.message:'역량 기록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'});}
    return;
  }

  if (req.method === 'GET' && pathname === '/api/teacher/classes') {
    res.setHeader('Cache-Control', 'private, no-store');
    sendJSON(res, 200, { success: true, classes: teacherClasses(req.auth), canProvisionTeachers: Boolean(process.env.ADMIN_EMAIL && req.auth.email?.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()) });
    return;
  }

  // 7. 교사용 학급 설정: GET /api/teacher/class-settings & POST
  if (pathname === '/api/teacher/class-settings') {
    if (req.method === 'GET') {
      let scope;
      try { scope = teacherClass(req.auth, queryParams.get('class')); }
      catch (error) { sendJSON(res,error.status,{success:false,message:error.message});return; }
      const {schoolId,grade,classId}=scope;
      const settings = storageService.getClassSettings(schoolId, grade, classId);
      sendJSON(res, 200, { success: true, settings });
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = await parseRequestBody(req);
        const { requiredBadgeCount, activeTopicId } = body; const {schoolId,grade,classId}=teacherClass(req.auth,body.class); const teacherUid=req.auth.uid;
        const updated = storageService.updateClassSettings(schoolId, grade, classId, { requiredBadgeCount, activeTopicId }, teacherUid);
        sendJSON(res, 200, { success: true, settings: updated });
      } catch (err) {
        sendJSON(res, err.status || 400, { success: false, error: err.message });
      }
      return;
    }
  }

  // 8. 교사용 학급 학생 현황: GET /api/teacher/students-status
  if (req.method === 'GET' && pathname === '/api/teacher/students-status') {
    let scope;
    try { scope = teacherClass(req.auth, queryParams.get('class')); }
    catch (error) { sendJSON(res,error.status,{success:false,message:error.message});return; }
    const {schoolId,grade,classId}=scope;
    const students = storageService.getClassStudentsStatus(schoolId, grade, classId).map(s=>{
      const user=storageService.getUser(s.uid),drafts=user?learningService.drafts.list(user):{};
      let savedCount=0,draftCount=0;const {hasDraftContent}=require('./services/learningDraftStore');
      for(const modes of Object.values(drafts))for(const mode of ['basic','advanced','speech']){const d=modes[mode];if(!d)continue;if(hasDraftContent(mode,d.content))draftCount++;savedCount+=(d.versions||[]).filter(v=>hasDraftContent(mode,v.content)).length;}
      return {...s,savedCount,draftCount};
    });
    sendJSON(res, 200, { success: true, students });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/teacher/registration-status') {
    res.setHeader('Cache-Control','private, no-store');
    const rosterSchool = process.env.ADMIN_SCHOOL_ID || process.env.STUDENT_SCHOOL_ID || req.auth.schoolId;
    if (req.auth.schoolId !== rosterSchool) { sendJSON(res,403,{success:false,error:'SCHOOL_SCOPE_REQUIRED'});return; }
    const registrations=studentRoster.registrationStatus(storageService.getUsers().filter(u=>u.schoolId===req.auth.schoolId));
    sendJSON(res,200,{success:true,total:registrations.length,registered:registrations.filter(item=>item.registered).length,registrations});return;
  }
  if(req.method==='POST'&&pathname==='/api/teacher/provision-test-admins'){
    if(!process.env.ADMIN_EMAIL||req.auth.email?.toLowerCase()!==process.env.ADMIN_EMAIL.toLowerCase()){
      sendJSON(res,403,{success:false,error:'PRIMARY_ADMIN_REQUIRED'});return;
    }
    try{const body=await parseRequestBody(req),accounts=await firebaseAuth.provisionTeacherBatch(body.password);
      sendJSON(res,200,{success:true,accounts});
    }catch(error){sendJSON(res,error.status||500,{success:false,error:error.status?error.message:'교사 계정 발급에 실패했습니다.'});}return;
  }
  if(req.method==='POST'&&pathname==='/api/teacher/provision-test-students'){
    if(!process.env.ADMIN_EMAIL||req.auth.email?.toLowerCase()!==process.env.ADMIN_EMAIL.toLowerCase()){
      sendJSON(res,403,{success:false,error:'PRIMARY_ADMIN_REQUIRED'});return;
    }
    try{const accounts=await firebaseAuth.provisionTestStudents();sendJSON(res,200,{success:true,accounts});}
    catch{sendJSON(res,500,{success:false,error:'TEST_STUDENT_PROVISION_FAILED',message:'테스트 학생 계정 발급에 실패했습니다.'});}return;
  }

  if (pathname === '/api/teacher/battle-plan' && ['GET','POST'].includes(req.method)) {
    try {
      const body=req.method==='POST'?await parseRequestBody(req):{};
      const scope=teacherClass(req.auth,body.class||queryParams.get('class'));
      const topicId=body.topicId||queryParams.get('topicId');
      if(!storageService.getTopic(topicId))throw Object.assign(new Error('토론 논제를 선택하세요.'),{status:400});
      if(req.method==='POST'){
        const known=new Set(studentRoster.registrationStatus(storageService.getUsers().filter(item=>item.schoolId===scope.schoolId)).filter(item=>item.grade===scope.grade&&item.classId===scope.classId&&item.registered).map(item=>item.studentNumber));
        if(body.mode==='assigned'&&(!Array.isArray(body.assignments)||body.assignments.some(item=>!known.has(String(item.studentNumber)))))
          throw Object.assign(new Error('가입한 학급 학생만 지정할 수 있습니다.'),{status:400});
      }
      const plan=req.method==='POST'?storageService.saveBattlePlan(scope.schoolId,scope.grade,scope.classId,topicId,body,req.auth.uid):storageService.getBattlePlan(scope.schoolId,scope.grade,scope.classId,topicId);
      sendJSON(res,200,{success:true,plan});
    }catch(error){sendJSON(res,error.status||500,{success:false,error:error.message});}return;
  }

  if(req.method==='GET'&&pathname==='/api/teacher/battle-roster'){
    try{
      const scope=teacherClass(req.auth,queryParams.get('class'));
      const status=new Map(storageService.getClassStudentsStatus(scope.schoolId,scope.grade,scope.classId).map(item=>[String(item.studentNumber),item]));
      const roster=studentRoster.registrationStatus(storageService.getUsers().filter(item=>item.schoolId===scope.schoolId));
      sendJSON(res,200,{success:true,students:roster.filter(item=>item.grade===scope.grade&&item.classId===scope.classId).map(item=>{
        const state=status.get(item.studentNumber),user=state?storageService.getUser(state.uid):null;
        let saved=0,debate=0;if(user){try{const drafts=learningService.drafts.list(user);for(const modes of Object.values(drafts))for(const draft of Object.values(modes))saved+=draft?.versions?.length||0;}catch{}
          debate=storageService.getStudentRecordEvidence(user).messages.length;}
        const activity=[state?.practiceCount?`연습 ${state.practiceCount}`:'',saved?`저장 ${saved}`:'',debate?`토론 ${debate}`:''].filter(Boolean).join(' · ')||'활동 기록 없음';
        return {...item,...(state||{}),online:Boolean(state?.online),activityStatus:activity,isBattleReady:Boolean(state?.isBattleReady)};
      })});
    }catch(error){sendJSON(res,error.status||500,{success:false,error:error.message});}return;
  }

  // 8-1. 교사용 학생 배틀룸 참가 특별 예외 승인/해제: POST /api/teacher/student-override (지시서 제17조)
  if (req.method === 'POST' && pathname === '/api/teacher/student-override') {
    try {
      const body = await parseRequestBody(req);
      const { studentUid, approved = true } = body; const teacherUid=req.auth.uid; const target=storageService.getUser(studentUid); if(!target||!firebaseAuth.sameClass(req.auth,target.schoolId,target.grade,target.classId)){sendJSON(res,403,{success:false,error:'CLASS_SCOPE_REQUIRED'});return;}
      const success = storageService.setStudentBattleOverride(studentUid, approved, teacherUid);
      sendJSON(res, 200, { success, studentUid, approved });
    } catch (err) {
      sendJSON(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // 8-2. 교사용 학급 전체 역량 분석 및 다음 수업 추천: GET /api/teacher/class-analytics (지시서 제79, 80조)
  if (req.method === 'GET' && pathname === '/api/teacher/class-analytics') {
    let scope;
    try { scope = teacherClass(req.auth, queryParams.get('class')); }
    catch (error) { sendJSON(res,error.status,{success:false,message:error.message});return; }
    const {schoolId,grade,classId}=scope;
    const analytics = storageService.getClassAnalytics(schoolId, grade, classId);
    sendJSON(res, 200, { success: true, analytics });
    return;
  }

  // ==========================================
  // [PHASE 3: REALTIME DEBATE BATTLE API ROUTES]
  // ==========================================

  if(req.method==='GET'&&pathname==='/api/debate/current') {
    finishExpiredDebates();
    const room=storageService.getCurrentDebateRoom(req.auth.schoolId,req.auth.grade,req.auth.classId);
    sendJSON(res,200,{success:true,room:room?presentDebateRoom(req.auth,room):null});return;
  }
  if(req.method==='GET'&&pathname==='/api/debate/available'){
    try{const scope=req.auth.role==='teacher'?teacherClass(req.auth,queryParams.get('class')):req.auth;
      finishExpiredDebates();
      let rooms=storageService.getActiveDebateRooms(scope.schoolId,scope.grade,scope.classId);
      if(queryParams.get('includeFinished')==='1')rooms.push(...storageService.getRecentDebateRooms(scope.schoolId,scope.grade,scope.classId));
      rooms=rooms.map(room=>presentDebateRoom(req.auth,room));
      if(queryParams.get('summary')==='1')rooms=rooms.map(({messages,participationHistory,...room})=>({...room,messageCount:messages.length}));
      sendJSON(res,200,{success:true,rooms});
    }catch(error){sendJSON(res,error.status||500,{success:false,error:error.message});}return;
  }
  // 9. 토론방 초기화/조회: POST /api/debate/room/init
  if (req.method === 'POST' && pathname === '/api/debate/room/init') {
    try {
      const body = await parseRequestBody(req);
      const scope=teacherClass(req.auth,body.class);
      const active=storageService.getActiveDebateRooms(scope.schoolId,scope.grade,scope.classId).find(room=>room.topicId===body.topicId);
      if(active?.status==='active'&&new Date(active.endsAt)>new Date()){sendJSON(res,409,{success:false,error:'진행 중인 토론을 종료한 뒤 새 토론을 시작하세요.'});return;}
      const topic=learningService.topic(body.topicId,req.auth);
      body.title=topic.question;body.unit=topic.unit;body.durationMinutes=Math.max(1,Math.min(60,Number(body.durationMinutes)||10));
      const plan=storageService.getBattlePlan(scope.schoolId,scope.grade,scope.classId,body.topicId);
      if(body.planUpdatedAt&&body.planUpdatedAt!==plan.updatedAt)throw Object.assign(new Error('다른 교사가 편성을 변경했습니다. 현재 편성을 다시 확인하고 방을 열어 주세요.'),{status:409});
      const room = storageService.initDebateRoom({ ...body, plan, hostUid:req.auth.uid, schoolId:scope.schoolId,
        grade:scope.grade, classId:scope.classId });
      const remainingSeconds = Math.max(0, Math.floor((new Date(room.endsAt) - Date.now()) / 1000));
      broadcastDebate(room.roomId, 'room', { room:{ ...room, remainingSeconds } });
      sendJSON(res, 200, { success: true, room: { ...room, id: room.roomId, remainingSeconds } });
    } catch (err) {
      sendJSON(res, err.status || 500, { success: false, error: err.status ? err.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    return;
  }

  // 10. 배틀룸 참가 및 자격 검증: POST /api/debate/join (지시서 제16조, 17조, 39조)
  if (req.method === 'POST' && pathname === '/api/debate/join') {
    try {
      const body = await parseRequestBody(req);
      const { roomId, teamId } = body; const {uid:userId,schoolId,grade,classId,role}=req.auth;

      const user = req.auth;
      const existingRoom=scopedDebateRoom(user,roomId);
      if(existingRoom.status!=='active'||new Date(existingRoom.endsAt)<=new Date()){sendJSON(res,409,{success:false,error:'종료된 토론입니다. 기록만 읽을 수 있습니다.'});return;}
      if(existingRoom.plan?.mode!=='random'&&!['pro','con'].includes(teamId)){sendJSON(res,400,{success:false,error:'입장을 선택하세요.'});return;}
      const badges = storageService.getStudentBadges(userId);
      const settings = storageService.getClassSettings(schoolId, grade, classId);
      const required = settings.requiredBadgeCount ?? 1;
      const userRole = role || user.role || 'student';
      const hasOverride = storageService.getUser(userId)?.battleOverride === true;

      // 지시서 제16·17조: 배틀룸 참가 자격 엄격 검증 (교사 참관 및 교사 특별 예외 승인은 뱃지 제한 면제)
      if (userRole !== 'teacher' && !hasOverride && badges.length < required) {
        sendJSON(res, 403, {
          success: false,
          eligible: false,
          error: `배틀룸에 참여하려면 기초 연습 뱃지 ${required - badges.length}개가 더 필요합니다. (보유: ${badges.length} / 기준: ${required})`,
          requiredBadges: required,
          earnedBadges: badges.length
        });
        return;
      }

      const room = storageService.joinDebateRoom(roomId, user, teamId);
      const remainingSeconds = Math.max(0, Math.floor((new Date(room.endsAt) - Date.now()) / 1000));
      broadcastDebate(roomId, 'presence', { participants:room.participants });

      sendJSON(res, 200, {
        success: true,
        eligible: true,
        user,
        room: { ...room, id: room.roomId, remainingSeconds, statistics:roomStatistics(room) }
      });
    } catch (err) {
      sendJSON(res, err.status || 500, { success: false, error: err.status ? err.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    return;
  }

  // 인증 세션 쿠키를 사용하는 단방향 실시간 토론 스트림.
  if(req.method==='POST'&&pathname==='/api/debate/leave') {
    try {
      const body=await parseRequestBody(req);
      scopedDebateRoom(req.auth,body.roomId);
      const room=storageService.leaveDebateRoom(body.roomId,req.auth);
      broadcastDebate(room.roomId,'presence',{participants:room.participants});
      sendJSON(res,200,{success:true,room});
    } catch(error){sendJSON(res,error.status||500,{success:false,error:error.status?error.message:'퇴장 처리에 실패했습니다. 다시 시도해 주세요.'});}
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/debate/stream/')) {
    const roomId = pathname.split('/').pop();
    let room;try{room = scopedDebateRoom(req.auth,roomId);}catch(error){sendJSON(res,error.status||500,{success:false,error:error.message});return;}
    if (!room) {
      sendJSON(res, 403, { success:false, error:'CLASS_SCOPE_REQUIRED' }); return;
    }
    res.writeHead(200, { 'Content-Type':'text/event-stream; charset=utf-8', 'Cache-Control':'no-cache, no-transform',
      Connection:'keep-alive', 'X-Accel-Buffering':'no' });
    if (!debateStreams.has(roomId)) debateStreams.set(roomId, new Set());
    const clients = debateStreams.get(roomId),client={response:res,user:req.auth};clients.add(client);
    const remainingSeconds = Math.max(0, Math.floor((new Date(room.endsAt) - Date.now()) / 1000));
    res.write(`event: room\ndata: ${JSON.stringify({ room:presentDebateRoom(req.auth,{...room,remainingSeconds,statistics:roomStatistics(room)}) })}\n\n`);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
    req.on('close', () => { clearInterval(heartbeat); clients.delete(client); if (!clients.size) debateStreams.delete(roomId); });
    return;
  }

  // 11. 토론방 상세 상태 조회: GET /api/debate/room/:roomId (지시서 제40조)
  if (req.method === 'GET' && pathname.startsWith('/api/debate/room/')) {
    try {
      const roomId = pathname.split('/').pop() || "room_gangseo_1_3";
      const room = scopedDebateRoom(req.auth,roomId);
      const remainingSeconds = Math.max(0, Math.floor((new Date(room.endsAt) - Date.now()) / 1000));
      const observations = storageService.getTeacherObservations(roomId);

      sendJSON(res, 200, {
        success: true,
        room: presentDebateRoom(req.auth,{ ...room, id: room.roomId, remainingSeconds, statistics:roomStatistics(room) }),
        teacherObservations: req.auth.role==='teacher' ? observations : undefined
      });
    } catch (err) {
      sendJSON(res, err.status || 500, { success: false, error: err.status ? err.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    return;
  }

  // 12. 토론 메시지 전송 및 Moderation: POST /api/debate/message (지시서 제41, 42, 51, 52조)
  if (req.method === 'POST' && pathname === '/api/debate/message') {
    try {
      const body = await parseRequestBody(req);
      const { roomId = "room_gangseo_1_3", teamId = "pro", messageType, speechType, targetUid = null, targetName = null, content, usedEvidenceIds = [] } = body; const {uid:authorUid,name:authorName,studentNumber:authorNumber}=req.auth;
      const currentRoom=scopedDebateRoom(req.auth,roomId);
      if(currentRoom.status!=='active'||new Date(currentRoom.endsAt)<=new Date()){sendJSON(res,409,{success:false,error:'토론이 종료되었습니다. 작성한 글은 화면에 유지됩니다.'});return;}
      const members=[...(currentRoom.participants?.teamA||[]),...(currentRoom.participants?.teamB||[])];
      const member=members.find(p=>p.uid===authorUid);
      if(!member){sendJSON(res,403,{success:false,error:'입장을 선택하고 토론에 참여한 뒤 전송하세요.'});return;}
      const previousSpeaker=targetUid?(currentRoom.messages||[]).find(m=>m.authorUid===targetUid):null;
      const target=targetUid?(members.find(p=>p.uid===targetUid)||(previousSpeaker?{uid:targetUid,name:previousSpeaker.authorName}:null)):null;
      if(targetUid&&!target){sendJSON(res,400,{success:false,error:'답변할 학생을 다시 선택하세요.'});return;}

      const trimmed = (content || '').trim();
      if(Array.from(trimmed).length>300){sendJSON(res,400,{success:false,error:'MESSAGE_TOO_LONG'});return;}
      if (!trimmed) {
        sendJSON(res, 400, { success: false, error: "메시지 내용을 입력하세요." });
        return;
      }

      // 지시서 제51·52조: 발언 안전 Moderation 필터링
      const toxicWords = ['바보', '멍청', '병신', '꺼져', '닥쳐', '미친', '새끼', '쓰레기', '노답'];
      const normalizedSpeech=trimmed.toLowerCase().replace(/[\s.·_\-]+/g,'');
      const foundToxic = toxicWords.find(w => trimmed.includes(w))||/(씨발|시발|씨바|개새끼|좆|ㅅㅂ|ㅂㅅ|ㅈㄹ)/.test(normalizedSpeech);
      if (foundToxic) {
        sendJSON(res, 200, {
          success: false,
          moderated: true,
          error: "MODERATION_BLOCKED",
          guidance: "비속어·욕설이 포함되어 발언이 게시되지 않았습니다. 사람 대신 주장과 근거를 비판하도록 표현을 수정해 주세요."
        });
        return;
      }

      const typeMap = {
        '주장': 'claim',
        '질문': 'question',
        '답변': 'answer',
        '반론': 'counter',
        '논박': 'counter',
        '재반론': 'rebuttal',
        '재반박': 'rebuttal',
        '재논박': 'rebuttal',
        '최종 발언': 'final',
        '최종발언': 'final'
      };
      const rawType = messageType || speechType || "claim";
      const normalizedType = typeMap[rawType] || rawType;
      if(!debateInsights.TYPES.includes(normalizedType)){sendJSON(res,400,{success:false,error:'발언 유형을 다시 선택하세요.'});return;}

      const message = storageService.addDebateMessage(roomId, {
        authorUid,
        authorName,
        authorNumber,
        teamId:member.team,
        messageType: normalizedType,
        speechType: rawType,
        targetUid,
        targetName:target?.name||null,
        content: trimmed,
        usedEvidenceIds,
        moderationStatus: "approved"
      });

      broadcastDebate(roomId, 'message', { message:{ ...message, id:message.messageId, speechType:rawType } });
      const updated=storageService.getDebateRoom(roomId),stats=roomStatistics(updated);
      if(stats.byTeam.pro.total&&stats.byTeam.con.total)queueDebateAnalysis(roomId,'live');
      sendJSON(res, 200, { success: true, message: { ...message, id: message.messageId, speechType: rawType } });
    } catch (err) {
      sendJSON(res, err.status || 500, { success: false, error: err.status ? err.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    return;
  }

  // 13. 소크라 AI 중간 요약 생성: POST /api/debate/ai-summary (지시서 제46, 47조)
  if (req.method === 'POST' && pathname === '/api/debate/ai-summary') {
    try {
      const body = await parseRequestBody(req);
      const { roomId = "room_gangseo_1_3" } = body;
      const room = scopedDebateRoom(req.auth,roomId);

      const stats=roomStatistics(room);
      if(!stats.byTeam.pro.total||!stats.byTeam.con.total){sendJSON(res,503,{success:false,code:'DEBATE_SUMMARY_NOT_READY',error:'찬성과 반대 양쪽의 실제 발언이 있으면 쟁점을 요약합니다.'});return;}
      if(room.status==='completed'){
        if(req.auth.role==='teacher'&&room.aiReview?.status==='unavailable')queueDebateAnalysis(roomId,'final',{force:true});
        const visible=presentDebateRoom(req.auth,storageService.getDebateRoom(roomId));sendJSON(res,200,{success:true,summary:visible.aiReview||visible.aiSummary});return;
      }
      queueDebateAnalysis(roomId,'live',{force:req.auth.role==='teacher'});
      sendJSON(res,202,{success:true,summary:storageService.getDebateRoom(roomId).aiSummary});
    } catch (err) {
      sendJSON(res, err.status || 500, { success: false, error: err.status ? err.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    return;
  }

  // 14. 토론 종료 및 종합 분석: POST /api/debate/finish (지시서 제48~50조)
  if (req.method === 'POST' && pathname === '/api/debate/finish') {
    try {
      const body = await parseRequestBody(req);
      const { roomId = "room_gangseo_1_3" } = body;
      const room = scopedDebateRoom(req.auth,roomId);

      const completed=finishDebate(roomId);
      sendJSON(res,200,{success:true,evaluation:completed.evaluation,aiReview:completed.aiReview});
    } catch (err) {
      sendJSON(res, err.status || 500, { success: false, error: err.status ? err.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    return;
  }

  if(req.method==='POST'&&pathname==='/api/debate/extend'){
    try{const body=await parseRequestBody(req);scopedDebateRoom(req.auth,body.roomId);const room=storageService.extendDebateRoom(body.roomId,body.minutes,req.auth.uid);publishRoom(body.roomId);sendJSON(res,200,{success:true,room:{...room,statistics:roomStatistics(room)}});}
    catch(error){sendJSON(res,error.status||500,{success:false,error:error.status?error.message:'토론 시간을 연장하지 못했습니다.'});}
    return;
  }

  // 15. 교사 실시간 관찰 메모 기록: POST /api/teacher/debate-note (지시서 제55조)
  if (req.method === 'POST' && pathname === '/api/teacher/debate-note') {
    try {
      const body = await parseRequestBody(req);
      scopedDebateRoom(req.auth,body.roomId);
      const obs = storageService.addTeacherObservation({...body, teacherUid:req.auth.uid});
      sheetSyncQueue.enqueue('TEACHER_OBSERVATION', obs);
      sendJSON(res, 200, { success: true, observation: obs });
    } catch (err) {
      sendJSON(res, 400, { success: false, error: err.message });
    }
    return;
  }

  // ==========================================
  // [PHASE 5: EVIDENCE ROOM & RAG API ROUTES]
  // ==========================================

  if(pathname==='/api/teacher/evidence'&&req.method==='GET'){
    res.setHeader('Cache-Control','private, no-store');
    const offset=Math.max(0,Number(queryParams.get('offset'))||0),limit=Math.max(1,Math.min(20,Number(queryParams.get('limit'))||10));
    sendJSON(res,200,{success:true,...knowledgeService.reviewList({status:queryParams.get('status')??'pending',sourceId:queryParams.get('sourceId')||'',offset,limit})});return;
  }
  if(pathname==='/api/teacher/evidence/review'&&req.method==='POST'){
    res.setHeader('Cache-Control','private, no-store');
    try{const input=await parseRequestBody(req);const card=knowledgeService.reviewCard(input.cardId,input,req.auth);sendJSON(res,200,{success:true,card});}
    catch(error){sendJSON(res,error.status||500,{success:false,message:error.status?error.message:'검수 내용을 저장하지 못했습니다.'});}return;
  }
  // Source excerpts: public student resources, authenticated teacher resources.
  if (req.method === 'GET' && pathname.startsWith('/api/evidence/')) {
    let user = req.auth || null;
    if (!user && req.headers.cookie && firebaseAuth.isConfigured()) {
      try { user = await firebaseAuth.authenticate(req); } catch { user = null; }
    }
    const role = user?.role === 'teacher' ? 'teacher' : 'student';
    res.setHeader('Cache-Control','private, no-store');
    if (pathname === '/api/evidence/sources') {
      sendJSON(res,200,{success:true,sources:knowledgeService.getSources(role),retrievalMode:'local-lexical'});return;
    }
    if (pathname.startsWith('/api/evidence/source/')) {
      const id = pathname.slice('/api/evidence/source/'.length);
      const file = knowledgeService.getSourceFile(id,role);
      if(!file){sendJSON(res,404,{success:false,message:'자료를 찾을 수 없거나 원문이 변경되었습니다.'});return;}
      const pdf=file.source.format==='pdf';
      res.writeHead(200,{'Content-Type':pdf?'application/pdf':'application/octet-stream','X-Content-Type-Options':'nosniff',
        'Content-Disposition':(pdf?'inline':'attachment')+"; filename*=UTF-8''"+encodeURIComponent(file.source.fileName)});
      const stream=fs.createReadStream(file.filePath);stream.on('error',()=>res.destroy());stream.pipe(res);return;
    }
    if (pathname === '/api/evidence/cards') {
      const cards=knowledgeService.getEvidenceCards(queryParams.get('topicId'),queryParams.get('category'),role);
      sendJSON(res,200,{success:true,count:cards.length,cards});return;
    }
    if (pathname === '/api/evidence/search') {
      const q=queryParams.get('q')||'';
      if(q.length>200){sendJSON(res,400,{success:false,message:'검색어는 200자 이내로 입력하세요.'});return;}
      const result=queryParams.get('mode')==='keyword'?{cards:knowledgeService.searchEvidence(q,{role,sourceId:queryParams.get('sourceId'),limit:10}),retrievalMode:'local-lexical'}:await knowledgeService.search(q,{role,sourceId:queryParams.get('sourceId'),limit:10});
      sendJSON(res,200,{success:true,count:result.cards.length,...result});return;
    }
    if (pathname === '/api/evidence/glossary') {
      const glossary=knowledgeService.getGlossary(role);sendJSON(res,200,{success:true,count:glossary.length,glossary});return;
    }
  }

  // ==========================================
  // [PHASE 2: ADVANCED WRITING & SPEECH API ROUTES]
  // ==========================================

  // 19. 심화 서술형 (1~3문단) 진단 평가: POST /api/practice/advanced/evaluate
  if(req.method==='POST'&&pathname==='/api/practice/advanced/plan'){
    try{
      const body=await parseRequestBody(req),lesson=learningService.lesson(body.topicId,req.auth);
      const plan=await geminiService.planAdvancedWriting({lesson,writingPlan:body.writingPlan});
      res.setHeader('Cache-Control','no-store');sendJSON(res,200,{success:true,plan});
    }catch(error){sendJSON(res,error.status||500,{success:false,error:error.status?error.message:'문단별 질문을 불러오지 못했습니다. 잠시 후 다시 요청해 주세요.'});}
    return;
  }

  if (req.method === 'POST' && pathname === '/api/practice/advanced/evaluate') {
    try {
      const body = await parseRequestBody(req);
      const { topicId, studentDraft, paragraphLevel = 3, stance = 'pro' } = body;
      const learningContext=learningService.coaching(topicId,req.auth,pathname.startsWith('/api/speech/')?'speech':'advanced');
      const topic=learningContext.topic;
      learningContext.writingPlan={targetChars:Math.min(4000,Math.max(50,Number(body.writingPlan?.targetChars)||600)),targetSentences:Math.min(80,Math.max(1,Number(body.writingPlan?.targetSentences)||12)),targetParagraphs:Math.min(20,Math.max(1,Number(paragraphLevel)||3))};
      const evaluation = await geminiService.evaluateAdvancedEssay({ topic, studentDraft, paragraphLevel, stance, learningContext });
      sendJSON(res, 200, { success: true, evaluation });
    } catch (err) {
      sendJSON(res, err.status || 500, { success: false, error: err.status ? err.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    return;
  }

  // 20. 심화 서술형 최종 제출 및 뱃지 수여: POST /api/practice/advanced/submit
  if (req.method === 'POST' && pathname === '/api/practice/advanced/submit') {
    try {
      const body = await parseRequestBody(req);
      const { topicId, studentDraft, paragraphLevel = 3, stance = 'pro' } = body; const userId=req.auth.uid;
      const learningContext=learningService.coaching(topicId,req.auth,pathname.startsWith('/api/speech/')?'speech':'advanced');
      const topic=learningContext.topic;
      learningContext.writingPlan={targetChars:Math.min(4000,Math.max(50,Number(body.writingPlan?.targetChars)||600)),targetSentences:Math.min(80,Math.max(1,Number(body.writingPlan?.targetSentences)||12)),targetParagraphs:Math.min(20,Math.max(1,Number(paragraphLevel)||3))};
      const evaluation = await geminiService.evaluateAdvancedEssay({ topic, studentDraft, paragraphLevel, stance, learningContext });

      const session = storageService.savePracticeSession({
        userId,
        topicId: topic.id || topicId,
        topicTitle: topic.title,
        mode: "advanced_essay",
        paragraphLevel,
        writingPlan:learningContext.writingPlan,
        stance,
        studentDraft,
        evaluation,
        overallLevel: evaluation.overallLevel
      });

      let badge = null;
      if (evaluation.badgeEligible) {
        badge = storageService.awardBadge(userId, {
          badgeType: "badge_advanced_essay",
          badgeName: "심화 논술 구성 뱃지",
          description: "다각적 관점과 교과 개념을 반영한 3문단 심화 논술을 완성함",
          icon: "psychology",
          sessionRef: session.sessionId
        });
      }

      sheetSyncQueue.enqueue('PRACTICE_SUBMIT', { userId, type: 'advanced_essay', sessionId: session.sessionId });
      sendJSON(res, 200, { success: true, session, badge, evaluation });
    } catch (err) {
      sendJSON(res, err.status || 500, { success: false, error: err.status ? err.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    return;
  }

  // 21. 구술·스피치 훈련 평가: POST /api/speech/evaluate
  if (req.method === 'POST' && pathname === '/api/speech/evaluate') {
    try {
      const body = await parseRequestBody(req);
      const { topicId, transcript, durationSeconds = 45, targetDurationSeconds = 45 } = body;
      const learningContext=learningService.coaching(topicId,req.auth,pathname.startsWith('/api/speech/')?'speech':'advanced');
      const topic=learningContext.topic;
      learningContext.studentOutline={claim:String(body.outline?.claim||'').slice(0,1000),reason:String(body.outline?.reason||'').slice(0,1000),condition:String(body.outline?.condition||'').slice(0,1000)};
      const evaluation = await geminiService.evaluateSpeech({ topic, transcript, durationSeconds, targetDurationSeconds, learningContext });
      sendJSON(res, 200, { success: true, evaluation });
    } catch (err) {
      sendJSON(res, err.status || 500, { success: false, error: err.status ? err.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    return;
  }

  // 22. 구술·스피치 훈련 최종 제출 및 뱃지 수여: POST /api/speech/submit
  if (req.method === 'POST' && pathname === '/api/speech/submit') {
    try {
      const body = await parseRequestBody(req);
      const { topicId, transcript, durationSeconds = 45, targetDurationSeconds = 45 } = body; const userId=req.auth.uid;
      const learningContext=learningService.coaching(topicId,req.auth,pathname.startsWith('/api/speech/')?'speech':'advanced');
      const topic=learningContext.topic;
      learningContext.studentOutline={claim:String(body.outline?.claim||'').slice(0,1000),reason:String(body.outline?.reason||'').slice(0,1000),condition:String(body.outline?.condition||'').slice(0,1000)};
      const evaluation = await geminiService.evaluateSpeech({ topic, transcript, durationSeconds, targetDurationSeconds, learningContext });

      const session = storageService.savePracticeSession({
        userId,
        topicId: topic.id || topicId,
        topicTitle: topic.title,
        mode: "speech_timer",
        durationSeconds,
        targetDurationSeconds,
        transcript,
        outline: learningContext.studentOutline,
        evaluation
      });

      let badge = null;
      if (evaluation.scores.totalScore >= 80) {
        badge = storageService.awardBadge(userId, {
          badgeType: "badge_speech_master",
          badgeName: "논리 스피치 뱃지",
          description: "정해진 시간 내에 핵심 주장과 교과 개념을 명확한 음성으로 전달함",
          icon: "record_voice_over",
          sessionRef: session.sessionId
        });
      }

      sheetSyncQueue.enqueue('PRACTICE_SUBMIT', { userId, type: 'speech_timer', sessionId: session.sessionId });
      sendJSON(res, 200, { success: true, session, badge, evaluation });
    } catch (err) {
      sendJSON(res, err.status || 500, { success: false, error: err.status ? err.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    return;
  }



  // ==========================================
  // [PHASE 6 & 8: SYNC & SCHOOL RECORD DRAFT API]
  // ==========================================

  // 23. 구글 스프레드시트 큐 상태 확인: GET /api/sync/status
  if (req.method === 'GET' && pathname === '/api/sync/status') {
    sendJSON(res, 200, { success: true, ...sheetSyncQueue.getQueueStatus() });
    return;
  }

  // 24. 구글 스프레드시트 큐 즉시 동기화 플러시: POST /api/sync/flush
  if (req.method === 'POST' && pathname === '/api/sync/flush') {
    const result = await sheetSyncQueue.flushQueue();
    sendJSON(res, 200, result);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/teacher/student-report') {
    try {
      const format=queryParams.get('format');
      if(!['xlsx','pdf'].includes(format))throw Object.assign(new Error('엑셀 또는 PDF 형식을 선택하세요.'),{status:400});
      const portfolio=studentRecordPortfolio(req.auth,queryParams.get('studentId'));
      const report=studentReports.build(portfolio,queryParams.get('revision'));
      const buffer=await studentReports[format](report);
      const name=`${report.student.isTestAccount?'시험용_':''}${report.student.studentNumber||'학생'}_토론활동보고서_v${report.revision}.${format}`;
      res.writeHead(200,{'Content-Type':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="student-report.${format}"; filename*=UTF-8''${encodeURIComponent(name)}`,'Content-Length':buffer.length,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});res.end(buffer);
    }catch(err){sendJSON(res,err.status||500,{success:false,message:err.status?err.message:'보고서를 만들지 못했습니다. 다시 시도하세요.'});}
    return;
  }

  if(pathname==='/api/teacher/activity-sheets'&&['GET','POST'].includes(req.method)){
    try{const body=req.method==='POST'?await parseRequestBody(req):{},scope=teacherClass(req.auth,body.class||queryParams.get('class'));res.setHeader('Cache-Control','no-store');sendJSON(res,200,{success:true,...await (req.method==='POST'?activitySheets().syncAll(scope):activitySheets().status(scope))});}
    catch(e){sendJSON(res,e.status||500,{success:false,message:e.status?e.message:'활동 연동 상태를 확인하지 못했습니다.'});}return;
  }
  if(pathname==='/api/teacher/growth-sheets'&&['GET','POST'].includes(req.method)){
    try{const body=req.method==='POST'?await parseRequestBody(req):{},scope=teacherClass(req.auth,body.class||queryParams.get('class'));res.setHeader('Cache-Control','no-store');sendJSON(res,200,{success:true,...await (req.method==='POST'?growthSheets().syncAll(scope):growthSheets().status(scope))});}
    catch(e){sendJSON(res,e.status||500,{success:false,message:e.status?e.message:'역량 분석 연동 상태를 확인하지 못했습니다.'});}return;
  }
  if(pathname==='/api/teacher/record-sheets'&&['GET','PUT','DELETE'].includes(req.method)){
    try{
      res.setHeader('Cache-Control','no-store');
      if(req.method==='PUT'){const body=await parseRequestBody(req);sendJSON(res,200,{success:true,...await recordSheets().connect(req.auth.schoolId,body.spreadsheetUrl,req.auth.uid)});}
      else if(req.method==='DELETE')sendJSON(res,200,{success:true,...await recordSheets().disconnect(req.auth.schoolId)});
      else{const uid=queryParams.get('studentId');if(uid)studentRecordPortfolio(req.auth,uid);sendJSON(res,200,{success:true,...recordSheets().status(req.auth.schoolId,uid)});}
    }catch(err){sendJSON(res,err.status||500,{success:false,message:err.status?err.message:'시트 연결 설정을 처리하지 못했습니다.'});}
    return;
  }

  if(req.method==='POST'&&pathname==='/api/teacher/record-sheets/sync'){
    try{const body=await parseRequestBody(req),p=studentRecordPortfolio(req.auth,body.studentId);sendJSON(res,200,{success:true,...await recordSheets().sync(p.student,body.revision)});}
    catch(err){sendJSON(res,err.status||500,{success:false,message:err.status?err.message:'시트 연동에 실패했습니다. 저장한 내용은 유지됩니다.'});}
    return;
  }

  if (pathname === '/api/teacher/student-record' && ['GET','PUT'].includes(req.method)) {
    try {
      res.setHeader('Cache-Control','no-store');
      const body=req.method==='PUT'?await parseRequestBody(req):null;
      const studentId=body?.studentId||queryParams.get('studentId');
      if(typeof studentId!=='string'||!studentId)throw Object.assign(new Error('학생을 선택하세요.'),{status:400});
      const portfolio=studentRecordPortfolio(req.auth,studentId);
      if(!body){sendJSON(res,200,{success:true,...portfolio});return;}
      const sources=schoolRecords.selection(portfolio,body.evidenceIds),fingerprint=schoolRecords.fingerprint(sources);
      if(body.evidenceFingerprint!==fingerprint)throw Object.assign(new Error('원문이나 수업 정보가 변경되었습니다. 다시 불러와 근거를 확인하세요.'),{status:409});
      if(typeof body.draftText!=='string'||!body.draftText.trim()||body.draftText.length>10000)throw Object.assign(new Error('초안을 1~10,000자로 작성하세요.'),{status:400});
      if(portfolio.student.isTestAccount&&body.reviewed===true)throw Object.assign(new Error('가상 학생 기록은 시험용 초안으로만 저장할 수 있습니다.'),{status:400});
      const generated=[storageService.getSchoolRecordAnalysis(studentId),portfolio.saved?.generated].find(g=>g?.generationId&&g.generationId===body.generationId&&g.evidenceFingerprint===fingerprint)||null;
      const saved=storageService.saveSchoolRecordDraft(studentId,{revision:body.revision,draftText:body.draftText.trim(),evidenceIds:sources.map(s=>s.id),evidenceFingerprint:fingerprint,evidence:sources,generated,reviewed:body.reviewed===true,status:portfolio.student.isTestAccount?'test-draft':body.reviewed===true?'teacher-reviewed':'draft'},req.auth.uid);
      let sheetSync=null;
      if(saved.status==='teacher-reviewed'&&recordSheets().status(req.auth.schoolId).connected){
        try{sheetSync=await recordSheets().sync(portfolio.student,saved.revision);}
        catch(err){sheetSync={...recordSheets().status(req.auth.schoolId,studentId),message:err.status?err.message:'초안은 저장했지만 시트 연동에 실패했습니다. 다시 시도하세요.'};}
      }
      sendJSON(res,200,{success:true,saved,sheetSync});
    } catch(err){sendJSON(res,err.status||500,{success:false,message:err.status?err.message:'초안을 저장하거나 불러오지 못했습니다. 작성 내용은 유지됩니다.'});}
    return;
  }

  // Grounded teacher draft; never sends records to Sheets or NEIS automatically.
  if (req.method === 'POST' && pathname === '/api/teacher/generate-record') {
    try {
      const body = await parseRequestBody(req);
      const {studentId}=body;
      if(typeof studentId!=='string'||!studentId)throw Object.assign(new Error('학생을 선택하세요.'),{status:400});
      const portfolio=studentRecordPortfolio(req.auth,studentId),sources=schoolRecords.selection(portfolio,body.evidenceIds);
      const draft={...await geminiService.generateSchoolRecordDraft({sources}),generationId:require('node:crypto').randomUUID(),evidenceIds:sources.map(s=>s.id),evidenceFingerprint:schoolRecords.fingerprint(sources),generatedAt:new Date().toISOString(),isTestAccount:portfolio.student.isTestAccount};
      storageService.saveSchoolRecordAnalysis(studentId,draft);
      sendJSON(res, 200, { success: true, draft });
    } catch (err) {
      sendJSON(res, err.status || 500, { success: false, error: err.status ? err.message : "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." });
    }
    return;
  }

  // ==========================================
  // [STATIC FILE SERVING]
  // ==========================================
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  const reqUrl = pathname === '/' ? '/stitch_screens/04_login_signup.html' : pathname;
  const screenNames = new Set(['index.html','04_login_signup.html','05_ai_basic_practice.html','06_ai_advanced_practice.html','07_competency_report.html','08_speech_timer_training.html','09_class_debate_battle.html','10_teacher_dashboard.html','11_evidence_library.html','12_evidence_review.html','13_learning_hub.html','14_user_guide.html']);
  const allowed = reqUrl === '/index.html' || ['/assets/growth-export.js','/assets/growth-live.js','/assets/teacher-connections.js','/assets/teacher-records.js','/assets/teacher-battle-planner.js','/assets/speech-outline.js','/assets/learning-drafts.js','/assets/activity-history.js','/assets/teacher-lesson-editor.js','/assets/basic-learning.js','/assets/advanced-writing.js','/assets/writing-plan.js', '/assets/learning-ui.js','/assets/teacher-learning.js','/assets/topic-catalog.js','/assets/cyber-ui.js','/assets/cyber-theme.js','/assets/auth-client.js','/assets/teacher-dashboard.js','/assets/speech-live.js','/assets/battle-live.js','/assets/evidence-library.js','/assets/evidence-review.js'].includes(reqUrl) ||
    (reqUrl.startsWith('/stitch_screens/') && screenNames.has(reqUrl.slice('/stitch_screens/'.length))) ||
    (/^\/assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:png|jpg|jpeg|svg|webp|ico|css|woff2?)$/.test(reqUrl));
  if (!allowed || reqUrl.includes('..') || reqUrl.includes('\\')) { res.writeHead(404); res.end('Not Found'); return; }
  const filePath = path.join(ROOT, reqUrl);
  try {
    const real = fs.realpathSync(filePath);
    const relative = path.relative(ROOT, real);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(real).isFile()) throw new Error('Invalid path');
    // Disallow symbolic links even if their target remains inside the repository.
    let part = ROOT;
    for (const segment of reqUrl.slice(1).split('/')) {
      part = path.join(part, segment);
      if (fs.lstatSync(part).isSymbolicLink()) throw new Error('Symbolic link');
    }
    res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(real).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(real);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  } catch { res.writeHead(404); res.end('Not Found'); }

});

const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  const sync=()=>{activitySheets().tick().catch(()=>console.warn('Activity sheet sync deferred; records retained.'));growthSheets().tick().catch(()=>console.warn('Growth sheet sync deferred; analyses retained.'));};
  setTimeout(sync,3000).unref();setInterval(sync,60000).unref();
  console.log(`=======================================================`);
  console.log(`[DebateOn] AI Coach Server listening on ${HOST}:${PORT}`);
  console.log(`- Authentication: ${firebaseAuth.isConfigured() ? 'Firebase session enabled' : 'Firebase setup required'}`);
  console.log(`- Active School: 예시고등학교 (고1 통합사회2)`);
  console.log(`=======================================================`);
});
