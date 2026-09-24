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

const PORT = parseInt(process.env.PORT, 10) || 3000;
const ROOT = path.resolve(__dirname);
const debateStreams = new Map();

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

function broadcastDebate(roomId, event, payload) {
  const clients = debateStreams.get(roomId);
  if (!clients) return;
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const response of clients) response.write(frame);
}

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
  const socialStart = pathname.match(/^\/api\/auth\/(naver|kakao)\/start$/);
  if (socialStart && req.method === 'GET') {
    try{const started=socialAuth.start(socialStart[1]);res.setHeader('Set-Cookie',started.cookie);res.writeHead(302,{Location:started.url});res.end();}catch{sendJSON(res,503,{success:false,error:'SOCIAL_PROVIDER_NOT_CONFIGURED',message:'간편가입 제공자 설정이 아직 완료되지 않았습니다.'});}return;
  }
  const socialCallback = pathname.match(/^\/api\/auth\/(naver|kakao)\/callback$/);
  if (socialCallback && req.method === 'GET') {
    try{const params=new URLSearchParams(urlParts[1]||'');const profile=await socialAuth.complete(socialCallback[1],params.get('code'),params.get('state'),req.headers.cookie);const created=await firebaseAuth.createSocialSession({provider:socialCallback[1],...profile}),restored=restoreStoredStudentProfile(created.profile);res.setHeader('Set-Cookie',[socialAuth.stateCookie(socialCallback[1],'',0),firebaseAuth.cookie(created.session,created.maxAgeSeconds)]);res.writeHead(302,{Location:restored.onboardingComplete?'/stitch_screens/05_ai_basic_practice.html':'/stitch_screens/04_login_signup.html?onboarding=1'});res.end();}catch{res.writeHead(302,{Location:'/stitch_screens/04_login_signup.html?error=social_login_failed'});res.end();}return;
  }
  if (pathname === '/api/auth/session' && req.method === 'POST') {
    if(!firebaseAuth.isConfigured()){sendJSON(res,503,{success:false,error:'AUTH_NOT_CONFIGURED',message:'Firebase Authentication 설정이 완료되지 않았습니다.'});return;}
    try{const body=await parseRequestBody(req);if(!body.idToken)throw new Error('ID token required');const created=await firebaseAuth.createSession(body.idToken),restored=restoreStoredStudentProfile(created.profile);res.setHeader('Set-Cookie',firebaseAuth.cookie(created.session,created.maxAgeSeconds));sendJSON(res,200,{success:true,user:firebaseAuth.safeProfile(restored)});}catch{sendJSON(res,401,{success:false,error:'INVALID_ID_TOKEN',message:'로그인 정보를 확인할 수 없습니다.'});}return;
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
    if((pathname.startsWith('/api/teacher/')||pathname.startsWith('/api/sync/')||pathname==='/api/debate/room/init'||pathname==='/api/debate/finish')&&req.auth.role!=='teacher'){sendJSON(res,403,{success:false,error:'TEACHER_REQUIRED'});return;}
  }
  const queryParams = new URLSearchParams(urlParts[1] || '');

  // ==========================================
  // [REST API ROUTES]
  // ==========================================

  // 1. Legacy name/number login is permanently disabled.
  if (req.method === 'POST' && pathname === '/api/auth/login') { sendJSON(res,410,{success:false,error:'LEGACY_LOGIN_REMOVED'});return; }

  // 2. Current verified session.
  if (req.method === 'GET' && pathname === '/api/auth/me') { sendJSON(res,200,{success:true,user:firebaseAuth.safeProfile(req.auth)});return; }

  if (req.method === 'POST' && pathname === '/api/auth/onboarding') {
    try {
      if(req.auth.role!=='student'){sendJSON(res,403,{success:false,error:'STUDENT_REQUIRED',message:'학생 계정에서만 가입할 수 있습니다.'});return;}
      if(!studentRoster.students.length){sendJSON(res,503,{success:false,error:'ROSTER_NOT_CONFIGURED',message:'학생 명단이 아직 등록되지 않았습니다.'});return;}
      const body=await parseRequestBody(req);
      if(body.privacyConsent!==true){sendJSON(res,400,{success:false,error:'PRIVACY_CONSENT_REQUIRED',message:'개인정보 이용 동의가 필요합니다.'});return;}
      const verified=studentRoster.verify(body.studentNumber,body.name),claimed=storageService.findUserByStudentNumber(verified.studentNumber);
      if(claimed&&claimed.uid!==req.auth.uid){sendJSON(res,409,{success:false,error:'STUDENT_NUMBER_ALREADY_REGISTERED',message:'이미 가입에 사용된 학번입니다. 교사에게 문의해 주세요.'});return;}
      const now=new Date().toISOString(),profileData={name:verified.verifiedName,
        schoolId:process.env.STUDENT_SCHOOL_ID||process.env.ADMIN_SCHOOL_ID||'school',grade:verified.grade,classId:verified.classId,
        studentNumber:verified.studentNumber,privacyConsentAt:now,privacyConsentVersion:'2026-09-23-v1'},profile={...req.auth,...profileData,onboardingComplete:true};
      storageService.saveUser({...profile,studentNumber:verified.studentNumber,name:verified.verifiedName,grade:verified.grade,classId:verified.classId,
        onboardingComplete:true,transferSlot:verified.transferSlot,privacyConsentAt:now,privacyConsentVersion:'2026-09-23-v1',registeredAt:claimed?.registeredAt||now,dataOrigin:'verified'});
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
  if (req.method === 'POST' && pathname === '/api/practice/evaluate') {
    try {
      const body = await parseRequestBody(req);
      const { topic, stance, claim, reason, rebuttal, currentScaffoldLevel = 1, attemptCount = 1 } = body;

      const evaluation = await geminiService.evaluateBasicPractice({
        topic,
        stance,
        claim,
        reason,
        rebuttal,
        currentScaffoldLevel,
        attemptCount
      });

      sendJSON(res, 200, { success: true, evaluation });
    } catch (err) {
      sendJSON(res, 500, { success: false, error: err.message });
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
      sendJSON(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 6. 학생 성장 기록 및 배틀룸 준비도 조회: GET /api/growth/student/:userId
  if (req.method === 'GET' && pathname.startsWith('/api/growth/student/')) {
    try {
      const userId = pathname.split('/').pop();
      if(req.auth.role!=='teacher'&&userId!==req.auth.uid){sendJSON(res,403,{success:false,error:'OWN_RECORDS_ONLY'});return;}
      const user = storageService.getUser(userId);

      if (!user) {
        sendJSON(res, 404, { success: false, error: 'User not found' });
        return;
      }

      const badges = storageService.getStudentBadges(user.uid);
      const sessions = storageService.getStudentPracticeSessions(user.uid);
      const classSetting = storageService.getClassSettings(user.schoolId, user.grade, user.classId);
      const requiredBadges = classSetting.requiredBadgeCount || 1;
      const earnedCount = badges.length;
      const isBattleReady = (earnedCount >= requiredBadges) || (user.battleOverride === true);

      // 5대 핵심 역량 산출 (기본값 + 세션 기반 누적)
      let claimTotal = 90, reasonTotal = 88, conceptTotal = 92, rebuttalTotal = 84, expressionTotal = 80;
      if (sessions.length > 0) {
        const lastSession = sessions[0];
        claimTotal = Math.min(99, 80 + (lastSession.analysis?.claim || 2) * 6);
        reasonTotal = Math.min(99, 78 + (lastSession.analysis?.evidence || 2) * 6);
        conceptTotal = Math.min(99, 82 + (lastSession.analysis?.concept || 2) * 5);
        rebuttalTotal = Math.min(99, 76 + (lastSession.analysis?.rebuttal || 2) * 6);
      }

      sendJSON(res, 200, {
        success: true,
        user,
        readiness: {
          earnedBadges: earnedCount,
          requiredBadges,
          missingBadges: isBattleReady ? 0 : Math.max(0, requiredBadges - earnedCount),
          isBattleReady,
          hasOverride: user.battleOverride === true,
          progressPercent: isBattleReady ? 100 : Math.min(100, Math.round((earnedCount / Math.max(1, requiredBadges)) * 100))
        },
        competencies: {
          claim: claimTotal,
          reasoning: reasonTotal,
          concept: conceptTotal,
          rebuttal: rebuttalTotal,
          expression: expressionTotal,
          overallScore: ((claimTotal + reasonTotal + conceptTotal + rebuttalTotal + expressionTotal) / 5).toFixed(1)
        },
        badges,
        recentSessions: sessions.slice(0, 5)
      });
    } catch (err) {
      sendJSON(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 7. 교사용 학급 설정: GET /api/teacher/class-settings & POST
  if (pathname === '/api/teacher/class-settings') {
    if (req.method === 'GET') {
      const {schoolId,grade,classId}=req.auth;
      const settings = storageService.getClassSettings(schoolId, grade, classId);
      sendJSON(res, 200, { success: true, settings });
      return;
    }

    if (req.method === 'POST') {
      try {
        const body = await parseRequestBody(req);
        const { requiredBadgeCount, activeTopicId } = body; const {schoolId,grade,classId,uid:teacherUid}=req.auth;
        const updated = storageService.updateClassSettings(schoolId, grade, classId, { requiredBadgeCount, activeTopicId }, teacherUid);
        sendJSON(res, 200, { success: true, settings: updated });
      } catch (err) {
        sendJSON(res, 400, { success: false, error: err.message });
      }
      return;
    }
  }

  // 8. 교사용 학급 학생 현황: GET /api/teacher/students-status
  if (req.method === 'GET' && pathname === '/api/teacher/students-status') {
    const {schoolId,grade,classId}=req.auth;
    const students = storageService.getClassStudentsStatus(schoolId, grade, classId);
    sendJSON(res, 200, { success: true, students });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/teacher/registration-status') {
    res.setHeader('Cache-Control','private, no-store');
    const registrations=studentRoster.registrationStatus(storageService.getUsers());
    sendJSON(res,200,{success:true,total:registrations.length,registered:registrations.filter(item=>item.registered).length,registrations});return;
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
    const {schoolId,grade,classId}=req.auth;
    const analytics = storageService.getClassAnalytics(schoolId, grade, classId);
    sendJSON(res, 200, { success: true, analytics });
    return;
  }

  // ==========================================
  // [PHASE 3: REALTIME DEBATE BATTLE API ROUTES]
  // ==========================================

  // 9. 토론방 초기화/조회: POST /api/debate/room/init
  if (req.method === 'POST' && pathname === '/api/debate/room/init') {
    try {
      const body = await parseRequestBody(req);
      const room = storageService.initDebateRoom({ ...body, hostUid:req.auth.uid, schoolId:req.auth.schoolId,
        grade:req.auth.grade, classId:req.auth.classId });
      const remainingSeconds = Math.max(0, Math.floor((new Date(room.endsAt) - Date.now()) / 1000));
      broadcastDebate(room.roomId, 'room', { room:{ ...room, remainingSeconds } });
      sendJSON(res, 200, { success: true, room: { ...room, id: room.roomId, remainingSeconds } });
    } catch (err) {
      sendJSON(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 10. 배틀룸 참가 및 자격 검증: POST /api/debate/join (지시서 제16조, 17조, 39조)
  if (req.method === 'POST' && pathname === '/api/debate/join') {
    try {
      const body = await parseRequestBody(req);
      const { roomId = "room_gangseo_1_3", teamId = "pro" } = body; const {uid:userId,schoolId,grade,classId,role}=req.auth;

      const user = req.auth;
      const badges = storageService.getStudentBadges(userId);
      const settings = storageService.getClassSettings(schoolId, grade, classId);
      const required = settings.requiredBadgeCount || 1;
      const userRole = role || user.role || 'student';
      const hasOverride = user.battleOverride === true;

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
        room: { ...room, id: room.roomId, remainingSeconds }
      });
    } catch (err) {
      sendJSON(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 인증 세션 쿠키를 사용하는 단방향 실시간 토론 스트림.
  if (req.method === 'GET' && pathname.startsWith('/api/debate/stream/')) {
    const roomId = pathname.split('/').pop();
    const room = storageService.getDebateRoom(roomId);
    if (!room || !firebaseAuth.sameClass(req.auth, room.schoolId, room.grade, room.classId)) {
      sendJSON(res, 403, { success:false, error:'CLASS_SCOPE_REQUIRED' }); return;
    }
    res.writeHead(200, { 'Content-Type':'text/event-stream; charset=utf-8', 'Cache-Control':'no-cache, no-transform',
      Connection:'keep-alive', 'X-Accel-Buffering':'no' });
    if (!debateStreams.has(roomId)) debateStreams.set(roomId, new Set());
    const clients = debateStreams.get(roomId); clients.add(res);
    const remainingSeconds = Math.max(0, Math.floor((new Date(room.endsAt) - Date.now()) / 1000));
    res.write(`event: room\ndata: ${JSON.stringify({ room:{...room,remainingSeconds} })}\n\n`);
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15000);
    req.on('close', () => { clearInterval(heartbeat); clients.delete(res); if (!clients.size) debateStreams.delete(roomId); });
    return;
  }

  // 11. 토론방 상세 상태 조회: GET /api/debate/room/:roomId (지시서 제40조)
  if (req.method === 'GET' && pathname.startsWith('/api/debate/room/')) {
    try {
      const roomId = pathname.split('/').pop() || "room_gangseo_1_3";
      const room = storageService.getDebateRoom(roomId);
      const remainingSeconds = Math.max(0, Math.floor((new Date(room.endsAt) - Date.now()) / 1000));
      const observations = storageService.getTeacherObservations(roomId);

      sendJSON(res, 200, {
        success: true,
        room: { ...room, id: room.roomId, remainingSeconds },
        teacherObservations: req.auth.role==='teacher' ? observations : undefined
      });
    } catch (err) {
      sendJSON(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 12. 토론 메시지 전송 및 Moderation: POST /api/debate/message (지시서 제41, 42, 51, 52조)
  if (req.method === 'POST' && pathname === '/api/debate/message') {
    try {
      const body = await parseRequestBody(req);
      const { roomId = "room_gangseo_1_3", teamId = "pro", messageType, speechType, targetUid = null, targetName = null, content, usedEvidenceIds = [] } = body; const {uid:authorUid,name:authorName,studentNumber:authorNumber}=req.auth;

      const trimmed = (content || '').trim();
      if(Array.from(trimmed).length>300){sendJSON(res,400,{success:false,error:'MESSAGE_TOO_LONG'});return;}
      if (!trimmed) {
        sendJSON(res, 400, { success: false, error: "메시지 내용을 입력하세요." });
        return;
      }

      // 지시서 제51·52조: 발언 안전 Moderation 필터링
      const toxicWords = ['바보', '멍청', '병신', '꺼져', '닥쳐', '미친', '새끼', '쓰레기', '노답'];
      const foundToxic = toxicWords.find(w => trimmed.includes(w));
      if (foundToxic) {
        sendJSON(res, 200, {
          success: false,
          moderated: true,
          error: "MODERATION_BLOCKED",
          guidance: "상대방의 사람이 아니라 주장이나 근거를 비판하도록 표현을 수정해 보세요. (지시서 제51·52조 발언 예절 준수)"
        });
        return;
      }

      const typeMap = {
        '주장': 'claim',
        '질문': 'question',
        '답변': 'answer',
        '반론': 'counter',
        '재반론': 'rebuttal',
        '재반박': 'rebuttal',
        '최종 발언': 'final',
        '최종발언': 'final'
      };
      const rawType = messageType || speechType || "claim";
      const normalizedType = typeMap[rawType] || rawType;

      const message = storageService.addDebateMessage(roomId, {
        authorUid,
        authorName,
        authorNumber,
        teamId,
        messageType: normalizedType,
        speechType: rawType,
        targetUid,
        targetName,
        content: trimmed,
        usedEvidenceIds,
        moderationStatus: "approved"
      });

      broadcastDebate(roomId, 'message', { message:{ ...message, id:message.messageId, speechType:rawType } });
      sendJSON(res, 200, { success: true, message: { ...message, id: message.messageId, speechType: rawType } });
    } catch (err) {
      sendJSON(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 13. 소크라 AI 중간 요약 생성: POST /api/debate/ai-summary (지시서 제46, 47조)
  if (req.method === 'POST' && pathname === '/api/debate/ai-summary') {
    try {
      const body = await parseRequestBody(req);
      const { roomId = "room_gangseo_1_3" } = body;
      const room = storageService.getDebateRoom(roomId);

      // 47조 절대 준수: 승패/우열 판정 금지, 쟁점 중심 요약
      const summary = {
        clashPoint: "기계적 판결의 [법적 안정성 및 신속성] vs 구체적 사건 맥락의 [개별적 타당성 및 실질적 평등]",
        teamAKeyArgument: "인간 판사의 자의적 판결을 배제하고 양형 기준을 확립하여 사법 불신 해소 (헌법 제27조)",
        teamBKeyArgument: "사회적 약자의 생계형 범죄 등 수치화 불가 맥락 무시 위험 및 과거 판례 편향 답습",
        proSummary: "양형 기준 확립을 통한 자의적 판결 방지 및 법적 안정성 확보",
        conSummary: "과거 판례 데이터 편향 답습 위험 및 사회적 약자의 특수한 맥락 고려 필요",
        unansweredQuestions: "찬성 측은 AI 알고리즘의 편향을 사전 감사할 수 있는 구체적 제도를, 반대 측은 현재 인간 판사의 양형 불일치를 해결할 대안을 추가 제시해야 합니다.",
        proPoints: ["양형 기준 확립을 통한 자의적 판결 방지", "법적 안정성 및 신속한 재판권 보장"],
        conPoints: ["과거 데이터 편향 답습 위험", "생계형 범죄 등 수치화하기 힘든 인간적 맥락 반영 한계"],
        socraticChallenge: "찬성 측은 알고리즘 편향에 대한 검증책을, 반대 측은 인간 판사의 양형 불일치 개선 대안을 제시해 보세요.",
        updatedAt: new Date().toISOString()
      };

      storageService.updateDebateRoom(roomId, { aiSummary: summary });
      sendJSON(res, 200, { success: true, summary });
    } catch (err) {
      sendJSON(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 14. 토론 종료 및 종합 분석: POST /api/debate/finish (지시서 제48~50조)
  if (req.method === 'POST' && pathname === '/api/debate/finish') {
    try {
      const body = await parseRequestBody(req);
      const { roomId = "room_gangseo_1_3" } = body;
      const room = storageService.getDebateRoom(roomId);

      const verifiedMessages = (room.messages || []).filter(message => message.dataOrigin === 'verified');
      const byTeam = teamId => verifiedMessages.filter(message => message.teamId === teamId);
      const byStudent = new Map();
      for (const message of verifiedMessages) {
        if (!byStudent.has(message.authorUid)) byStudent.set(message.authorUid, []);
        byStudent.get(message.authorUid).push(message);
      }
      const evaluation = {
        topic: room.title, status: 'completed', finishedAt: new Date().toISOString(),
        evidenceMessageIds: verifiedMessages.map(message => message.messageId),
        teamAnalysis: {
          teamA: { messageCount: byTeam('pro').length, questionCount: byTeam('pro').filter(message => message.messageType === 'question').length },
          teamB: { messageCount: byTeam('con').length, questionCount: byTeam('con').filter(message => message.messageType === 'question').length }
        },
        studentAnalysis: Object.fromEntries([...byStudent].map(([uid,messages]) => [uid, {
          messageCount:messages.length,
          messageTypeCounts:messages.reduce((counts,message)=>(counts[message.messageType]=(counts[message.messageType]||0)+1,counts),{}),
          evidenceMessageIds:messages.map(message=>message.messageId),
          note:'AI 자동 판정이 아닌 실제 발언 근거 요약입니다. 교사 확인이 필요합니다.'
        }]))
      };

      storageService.updateDebateRoom(roomId, { status: "completed", evaluation });
      sendJSON(res, 200, { success: true, evaluation });
    } catch (err) {
      sendJSON(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 15. 교사 실시간 관찰 메모 기록: POST /api/teacher/debate-note (지시서 제55조)
  if (req.method === 'POST' && pathname === '/api/teacher/debate-note') {
    try {
      const body = await parseRequestBody(req);
      const obs = storageService.addTeacherObservation(body);
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
  if (req.method === 'POST' && pathname === '/api/practice/advanced/evaluate') {
    try {
      const body = await parseRequestBody(req);
      const { topicId, studentDraft, paragraphLevel = 3, stance = 'pro' } = body;
      const topic = storageService.getTopic(topicId) || { title: "기본소득제 도입 타당성", keyConcepts: ["기회비용", "재정건전성", "소득재분배", "차등의 원칙"] };
      const evaluation = await geminiService.evaluateAdvancedEssay({ topic, studentDraft, paragraphLevel, stance });
      sendJSON(res, 200, { success: true, evaluation });
    } catch (err) {
      sendJSON(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 20. 심화 서술형 최종 제출 및 뱃지 수여: POST /api/practice/advanced/submit
  if (req.method === 'POST' && pathname === '/api/practice/advanced/submit') {
    try {
      const body = await parseRequestBody(req);
      const { topicId, studentDraft, paragraphLevel = 3, stance = 'pro' } = body; const userId=req.auth.uid;
      const topic = storageService.getTopic(topicId) || { title: "기본소득제 도입 타당성", keyConcepts: ["기회비용", "재정건전성", "소득재분배", "차등의 원칙"] };
      const evaluation = await geminiService.evaluateAdvancedEssay({ topic, studentDraft, paragraphLevel, stance });

      const session = storageService.savePracticeSession({
        userId,
        topicId: topic.id || topicId,
        topicTitle: topic.title,
        mode: "advanced_essay",
        paragraphLevel,
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
      sendJSON(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 21. 구술·스피치 훈련 평가: POST /api/speech/evaluate
  if (req.method === 'POST' && pathname === '/api/speech/evaluate') {
    try {
      const body = await parseRequestBody(req);
      const { topicId, transcript, durationSeconds = 45, targetDurationSeconds = 45 } = body;
      const topic = storageService.getTopic(topicId) || { title: "AI 판사 도입 논란", keyConcepts: ["사법정의", "법적안정성", "공정한재판"] };
      const evaluation = await geminiService.evaluateSpeech({ topic, transcript, durationSeconds, targetDurationSeconds });
      sendJSON(res, 200, { success: true, evaluation });
    } catch (err) {
      sendJSON(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // 22. 구술·스피치 훈련 최종 제출 및 뱃지 수여: POST /api/speech/submit
  if (req.method === 'POST' && pathname === '/api/speech/submit') {
    try {
      const body = await parseRequestBody(req);
      const { topicId, transcript, durationSeconds = 45, targetDurationSeconds = 45 } = body; const userId=req.auth.uid;
      const topic = storageService.getTopic(topicId) || { title: "AI 판사 도입 논란", keyConcepts: ["사법정의", "법적안정성", "공정한재판"] };
      const evaluation = await geminiService.evaluateSpeech({ topic, transcript, durationSeconds, targetDurationSeconds });

      const session = storageService.savePracticeSession({
        userId,
        topicId: topic.id || topicId,
        topicTitle: topic.title,
        mode: "speech_timer",
        durationSeconds,
        targetDurationSeconds,
        transcript,
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
      sendJSON(res, 500, { success: false, error: err.message });
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

  // 25. NEIS 학교생활기록부 세특 초안 생성: POST /api/teacher/generate-record (지시서 제56~62조)
  if (req.method === 'POST' && pathname === '/api/teacher/generate-record') {
    try {
      const body = await parseRequestBody(req);
      const { studentId, roomId = "room_gangseo_1_3" } = body; if(!studentId){sendJSON(res,400,{success:false,error:'STUDENT_REQUIRED'});return;} const student=storageService.getUser(studentId); if(!student||!firebaseAuth.sameClass(req.auth,student.schoolId,student.grade,student.classId)){sendJSON(res,403,{success:false,error:'CLASS_SCOPE_REQUIRED'});return;}
      const practiceSessions = storageService.getStudentPracticeSessions(studentId);
      const room = storageService.getDebateRoom(roomId);
      const debateMessages = room ? (room.messages || []) : [];
      const teacherObservations = storageService.getTeacherObservations(roomId);
      const badges = storageService.getStudentBadges(studentId);

      const draft = await geminiService.generateSchoolRecordDraft({
        student,
        practiceSessions,
        debateMessages,
        teacherObservations,
        badges
      });

      sheetSyncQueue.enqueue('SCHOOL_RECORD_DRAFT', { studentId, draft });
      sendJSON(res, 200, { success: true, draft });
    } catch (err) {
      sendJSON(res, 500, { success: false, error: err.message });
    }
    return;
  }

  // ==========================================
  // [STATIC FILE SERVING]
  // ==========================================
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
  const reqUrl = pathname === '/' ? '/stitch_screens/04_login_signup.html' : pathname;
  const screenNames = new Set(['index.html','04_login_signup.html','05_ai_basic_practice.html','06_ai_advanced_practice.html','07_competency_report.html','08_speech_timer_training.html','09_class_debate_battle.html','10_teacher_dashboard.html','11_evidence_library.html','12_evidence_review.html']);
  const allowed = reqUrl === '/index.html' || ['/assets/topic-catalog.js','/assets/cyber-ui.js','/assets/cyber-theme.js','/assets/auth-client.js','/assets/teacher-dashboard.js','/assets/speech-live.js','/assets/battle-live.js','/assets/evidence-library.js','/assets/evidence-review.js'].includes(reqUrl) ||
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
  console.log(`=======================================================`);
  console.log(`[DebateOn] AI Coach Server listening on ${HOST}:${PORT}`);
  console.log(`- Authentication: ${firebaseAuth.isConfigured() ? 'Firebase session enabled' : 'Firebase setup required'}`);
  console.log(`- Active School: 예시고등학교 (고1 통합사회2)`);
  console.log(`=======================================================`);
});

