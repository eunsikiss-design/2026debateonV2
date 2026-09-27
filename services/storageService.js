/**
 * 통합사회 논술·토론 AI 코치 플랫폼 ('디베이트온')
 * services/storageService.js
 * 
 * Firestore 스키마 표준 어댑터 및 로컬 영속 JSON 스토어 (data/store.json)
 * - Firebase 미설정 시에도 100% 정상 작동하는 하이브리드 데이터 계층
 * - 지시서 제82조 (users, topics, practiceSessions, studentBadges, classSettings, auditLogs) 규격 완전 준수
 */

const fs = require('fs');
const path = require('path');

const STORE_PATH = process.env.DATA_STORE_PATH
  ? path.resolve(process.env.DATA_STORE_PATH)
  : path.join(__dirname, '..', 'data', 'store.json');

// 기본 시드 데이터
const INITIAL_STORE = {
  users: {},
  classSettings: {},
  studentBadges: [],
  practiceSessions: [],
  teacherObservations: [],
  auditLogs: []
};

class StorageService {
  constructor() {
    this._ensureStore();
  }

  _ensureStore() {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(STORE_PATH)) {
      fs.writeFileSync(STORE_PATH, JSON.stringify(INITIAL_STORE, null, 2), 'utf-8');
    }
  }

  _read() {
    try {
      this._ensureStore();
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      throw new Error('저장된 기록을 읽지 못했습니다. 원본 파일을 확인해야 합니다.',{cause:err});
    }
  }

  _write(data) {
    try {
      this._ensureStore();
      const temp=STORE_PATH+'.'+require('crypto').randomUUID()+'.tmp';
      try{fs.writeFileSync(temp,JSON.stringify(data,null,2),{encoding:'utf8',mode:0o600});fs.renameSync(temp,STORE_PATH);}
      finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
      return true;
    } catch (err) {
      console.error('Storage write error:', err);
      throw new Error('기록 저장에 실패했습니다. 화면의 내용을 보관하고 다시 시도하세요.',{cause:err});
    }
  }

  // --- 사용자 (User) ---
  getUser(uid) {
    const store = this._read();
    return store.users[uid] || null;
  }

  getUsers() {
    return Object.values(this._read().users);
  }

  findUserByStudentNumber(studentNumber) {
    const number = String(studentNumber || '').trim();
    return Object.values(this._read().users).find(user => String(user.studentNumber || '').trim() === number) || null;
  }

  findUserByNameAndStudentId(name, studentNumber, grade = 1, classId = 3) {
    const store = this._read();
    const parsedNum = parseInt(studentNumber, 10);
    return Object.values(store.users).find(u => 
      u.name === name && 
      (u.studentNumber === parsedNum || String(u.studentNumber) === String(studentNumber))
    ) || null;
  }

  saveUser(userData) {
    const store = this._read();
    const uid = userData.uid || `user_${Date.now()}`;
    const previous = store.users[uid] || {};
    const user = {
      ...previous,
      ...userData,
      uid,
      createdAt: previous.createdAt || userData.createdAt || new Date().toISOString()
    };
    store.users[uid] = user;
    this._write(store);
    return user;
  }

  // Count a new visit after 30 minutes without a recorded visit. Refreshes within
  // one minute do not write to disk, and historical visits are never invented.
  recordStudentVisit(uid, at = new Date().toISOString()) {
    const store = this._read();
    const user = store.users[uid];
    if (!user || user.role !== 'student' || user.onboardingComplete !== true) return null;
    const now = Date.parse(at), previous = Date.parse(user.lastAccessAt || '');
    if (!Number.isFinite(now)) throw new Error('Invalid visit timestamp');
    const newVisit = !Number.isFinite(previous) || now - previous >= 30 * 60 * 1000;
    if (!newVisit && now - previous < 60 * 1000) return user;
    user.lastAccessAt = at;
    if (newVisit) {
      user.visitCount = (Number(user.visitCount) || 0) + 1;
      user.lastLoginAt = at;
    }
    this._write(store);
    return user;
  }

  // --- 교과 토론 논제 (Topics) ---
  getTopics() {
    try {
      const topicsPath = path.join(__dirname, '..', 'data', 'topics.json');
      if (fs.existsSync(topicsPath)) {
        return JSON.parse(fs.readFileSync(topicsPath, 'utf8'));
      }
    } catch (e) {
      console.warn('Failed to read topics.json:', e.message);
    }
    return [];
  }

  getTopic(topicId) {
    const topics = this.getTopics();
    return topics.find(t => t.topicId === topicId || t.id === topicId) || null;
  }

  // --- 학급 설정 (Class Settings & Topic Assignment) ---
  getClassSettings(schoolId = "demo-school", grade = 1, classId = 3) {
    const store = this._read();
    const key = `${schoolId}_${grade}_${classId}`;
    if (!store.classSettings[key]) {
      store.classSettings[key] = {
        schoolId,
        grade,
        classId,
        requiredBadgeCount: Number(classId)===13 ? 0 : 1,
        activeTopicId: this.getTopics()[0]?.topicId,
        updatedBy: "system",
        updatedAt: new Date().toISOString()
      };
      this._write(store);
    }
    const settings=store.classSettings[key];
    if(!this.getTopic(settings.activeTopicId))return {...settings,previousTopicId:settings.activeTopicId,activeTopicId:this.getTopics()[0]?.topicId};
    return settings;
  }

  updateClassSettings(schoolId, grade, classId, options, updatedBy = "demo_teacher") {
    const store = this._read();
    const key = `${schoolId}_${grade}_${classId}`;
    const prev = store.classSettings[key] || { requiredBadgeCount: Number(classId)===13 ? 0 : 1, activeTopicId: this.getTopics()[0]?.topicId };

    let requiredBadgeCount = prev.requiredBadgeCount ?? 1;
    let activeTopicId = this.getTopic(prev.activeTopicId)?prev.activeTopicId:this.getTopics()[0]?.topicId;

    if (typeof options === "number" || typeof options === "string") {
      requiredBadgeCount = parseInt(options, 10);
    } else if (typeof options === "object" && options !== null) {
      if (options.requiredBadgeCount !== undefined && options.requiredBadgeCount !== null) {
        requiredBadgeCount = parseInt(options.requiredBadgeCount, 10);
      }
      if (options.activeTopicId !== undefined && options.activeTopicId !== null) {
        activeTopicId = options.activeTopicId;
      }
    }

    store.classSettings[key] = {
      schoolId,
      grade,
      classId,
      requiredBadgeCount,
      activeTopicId,
      updatedBy,
      updatedAt: new Date().toISOString()
    };

    // 감사 로그 (지시서 제84조)
    this.addAuditLog({
      action: "UPDATE_CLASS_SETTINGS",
      targetId: key,
      performedBy: updatedBy,
      previousValue: JSON.stringify(prev),
      newValue: JSON.stringify(store.classSettings[key]),
      reason: "교사의 학급 참가 뱃지 조건 및 수업 토론 주제 배정 변경"
    });

    this._write(store);
    return store.classSettings[key];
  }

  setStudentBattleOverride(studentUid, approved = true, teacherUid = "demo_teacher") {
    const store = this._read();
    const user = store.users[studentUid];
    if (user) {
      user.battleOverride = approved;
      this.addAuditLog({
        action: approved ? "APPROVE_BATTLE_OVERRIDE" : "REVOKE_BATTLE_OVERRIDE",
        targetId: studentUid,
        performedBy: teacherUid,
        previousValue: !approved,
        newValue: approved,
        reason: "교사의 배틀룸 참가 특별 예외 승인 (지시서 제17조)"
      });
      this._write(store);
      return true;
    }
    return false;
  }

  // --- 뱃지 (Student Badges) ---
  getStudentBadges(userId) {
    const store = this._read();
    return store.studentBadges.filter(b => b.userId === userId);
  }

  awardBadge(userId, badgeData) {
    const store = this._read();
    // 중복 뱃지 확인 (동일한 세션 또는 동일 뱃지 타입)
    const existing = store.studentBadges.find(b => 
      b.userId === userId && b.badgeType === badgeData.badgeType
    );

    const newBadge = {
      id: `badge_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId,
      badgeType: badgeData.badgeType || "badge_reasoning",
      badgeName: badgeData.badgeName || "주장-근거 연결 뱃지",
      description: badgeData.description || "주장에 타당한 교과 근거를 연결하고 1회 이상 재작성을 완료함",
      icon: badgeData.icon || "verified",
      earnedAt: new Date().toISOString(),
      sessionRef: badgeData.sessionRef || null
    };

    store.studentBadges.push(newBadge);

    this.addAuditLog({
      action: "AWARD_BADGE",
      targetId: newBadge.id,
      performedBy: "system_ai",
      previousValue: existing ? "has_badge" : "none",
      newValue: newBadge.badgeType,
      reason: "기초 연습 요건 충족 및 재도전 완료"
    });

    this._write(store);
    return newBadge;
  }

  // --- 연습 세션 (Practice Sessions) ---
  savePracticeSession(sessionData) {
    const store = this._read();
    const sessionId = sessionData.sessionId || `session_${require('crypto').randomUUID()}`;
    const session = {
      ...sessionData,
      sessionId,
      createdAt: sessionData.createdAt || new Date().toISOString()
    };
    store.practiceSessions.push(session);
    this._write(store);
    return session;
  }

  getStudentPracticeSessions(userId) {
    const store = this._read();
    return store.practiceSessions
      .filter(s => s.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // --- 감사 로그 (Audit Logs, 지시서 제84조) ---
  getStudentRecordEvidence(student) {
    const store = this._read();
    const rooms = Object.values(store.debateRooms || {}).filter(r => r.schoolId === student.schoolId && Number(r.grade) === Number(student.grade) && Number(r.classId) === Number(student.classId));
    const roomIds = new Set(rooms.map(r => r.roomId));
    return {
      sessions: (store.practiceSessions || []).filter(s => s.userId === student.uid),
      messages: rooms.flatMap(r => (r.messages || []).filter(m => m.authorUid === student.uid && m.dataOrigin === 'verified').map(m => ({...m, topicId:r.topicId, roomId:r.roomId}))),
      observations: (store.teacherObservations || []).filter(o => o.studentUid === student.uid && roomIds.has(o.debateId))
    };
  }

  getRecordSheetConfig(schoolId) {
    return this._read().recordSheetConfigs?.['school:'+schoolId] || null;
  }

  getActivitySheetSync(uid){return this._read().activitySheetSync?.[uid]||null;}
  saveActivitySheetSync(uid,state){const db=this._read();db.activitySheetSync||={};db.activitySheetSync[uid]=state;this._write(db);return state;}

  getRecordSheetPendingCount(schoolId) {
    const store=this._read(),id=store.recordSheetConfigs?.['school:'+schoolId]?.spreadsheetId;
    return Object.values(store.users).filter(s=>{
      if(s.schoolId!==schoolId||s.role!=='student')return false;
      const key='student:'+s.uid,draft=store.schoolRecordDrafts?.[key],sync=store.recordSheetSync?.[key];
      return draft?.status==='teacher-reviewed'&&(!id||sync?.spreadsheetId!==id||sync.status!=='synced'||sync.revision!==draft.revision);
    }).length;
  }

  saveRecordSheetConfig(schoolId, config) {
    const store=this._read(); store.recordSheetConfigs ||= {};
    store.recordSheetConfigs['school:'+schoolId]=config;
    if(!this._write(store))throw new Error('Sheet configuration persistence failed');
    return config;
  }

  getRecordSheetSync(studentId) {
    return this._read().recordSheetSync?.['student:'+studentId] || null;
  }

  saveRecordSheetSync(studentId, state) {
    const store=this._read();store.recordSheetSync ||= {};
    store.recordSheetSync['student:'+studentId]=state;
    if(!this._write(store))throw new Error('Sheet sync state persistence failed');
    return state;
  }

  getSchoolRecordDraft(studentId) {
    return this._read().schoolRecordDrafts?.['student:'+studentId] || null;
  }

  getSchoolRecordAnalysis(studentId) {
    return this._read().schoolRecordAnalyses?.['student:'+studentId] || null;
  }

  saveSchoolRecordAnalysis(studentId, analysis) {
    const store = this._read();
    store.schoolRecordAnalyses ||= {};
    store.schoolRecordAnalyses['student:'+studentId] = analysis;
    if (!this._write(store)) throw new Error('Record analysis storage failed');
    return analysis;
  }

  saveSchoolRecordDraft(studentId, input, teacherUid) {
    const store = this._read(), key = 'student:'+studentId;
    store.schoolRecordDrafts ||= {};
    const previous = store.schoolRecordDrafts[key];
    if (input.revision !== (previous?.revision || 0)) throw Object.assign(new Error('다른 수정 내용이 저장되었습니다. 학생 기록을 다시 불러온 뒤 비교해 주세요.'), {status:409});
    const record = {...input, studentId, revision:(previous?.revision || 0)+1, updatedBy:teacherUid, updatedAt:new Date().toISOString()};
    store.schoolRecordDrafts[key] = record;
    store.schoolRecordHistory ||= [];
    if (previous) store.schoolRecordHistory.push(previous);
    if (!this._write(store)) throw new Error('Record storage failed');
    return record;
  }

  addAuditLog(logEntry) {
    const store = this._read();
    const log = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      action: logEntry.action,
      targetId: logEntry.targetId,
      performedBy: logEntry.performedBy,
      previousValue: logEntry.previousValue,
      newValue: logEntry.newValue,
      reason: logEntry.reason,
      createdAt: new Date().toISOString()
    };
    store.auditLogs.push(log);
    this._write(store);
    return log;
  }

  // --- 학급 학생 목록 및 배틀룸 준비도 종합 현황 ---
  getClassStudentsStatus(schoolId = "demo-school", grade = 1, classId = 3) {
    const store = this._read();
    const settings = this.getClassSettings(schoolId, grade, classId);
    const requiredBadges = settings.requiredBadgeCount ?? 1;

    const students = Object.values(store.users).filter(u => 
      (u.authProvider === 'firebase' || u.dataOrigin === 'verified') &&
      u.role === "student" && 
      u.schoolId === schoolId && 
      u.grade === grade && 
      u.classId === classId
    );

    return students.map(student => {
      const badges = this.getStudentBadges(student.uid);
      const badgeCount = badges.length;
      const hasOverride = student.battleOverride === true;
      const isBattleReady = (badgeCount >= requiredBadges) || hasOverride;
      const sessions = this.getStudentPracticeSessions(student.uid);

      return {
        uid: student.uid,
        name: student.name,
        studentNumber: student.studentNumber,
        badgeCount,
        requiredBadges,
        isBattleReady,
        hasOverride,
        badges,
        practiceCount: sessions.length,
        lastActive: sessions[0]?.createdAt || student.lastAccessAt || student.lastLoginAt,
        lastAccessAt: student.lastAccessAt || null,
        online: Boolean(student.lastAccessAt && Date.now() - Date.parse(student.lastAccessAt) < 90000),
        activityStatus: sessions.length ? `연습 ${sessions.length}회` : '활동 기록 없음'
      };
    });
  }

  getBattlePlan(schoolId, grade, classId, topicId) {
    const key = `${schoolId}_${grade}_${classId}_${topicId}`;
    return this._read().battlePlans?.[key] || {schoolId,grade,classId,topicId,mode:'open',capacity:26,assignments:[]};
  }

  saveBattlePlan(schoolId, grade, classId, topicId, input, teacherUid) {
    const mode = input.mode;
    const capacity = Number(input.capacity);
    if (!['open','assigned'].includes(mode) || !Number.isInteger(capacity) || capacity < 2 || capacity > 99)
      throw Object.assign(new Error('참여 방식과 정원(2~99명)을 확인하세요.'),{status:400});
    const assignments = mode === 'assigned' ? input.assignments : [];
    if (!Array.isArray(assignments) || assignments.length > capacity || (mode === 'assigned' && !assignments.length))
      throw Object.assign(new Error('지정 학생은 한 명 이상이며 정원을 넘을 수 없습니다.'),{status:400});
    const numbers = new Set();
    for (const item of assignments) {
      if (!/^\d{5}$/.test(String(item.studentNumber)) || !['pro','con'].includes(item.team) || numbers.has(item.studentNumber))
        throw Object.assign(new Error('학생 학번 또는 조 편성을 확인하세요.'),{status:400});
      numbers.add(item.studentNumber);
    }
    if (mode === 'assigned' && !['pro','con'].every(team => assignments.some(item => item.team === team)))
      throw Object.assign(new Error('찬성과 반대에 각각 한 명 이상 배정하세요.'),{status:400});
    const store=this._read();store.battlePlans ||= {};
    const plan={schoolId,grade,classId,topicId,mode,capacity,assignments:assignments.map(item=>({studentNumber:String(item.studentNumber),team:item.team})),updatedBy:teacherUid,updatedAt:new Date().toISOString()};
    store.battlePlans[`${schoolId}_${grade}_${classId}_${topicId}`]=plan;
    this._write(store);return plan;
  }

  // --- 실시간 토론 배틀룸 (Debate Rooms, 지시서 제36~44조) ---
  initDebateRoom(roomData) {
    const store = this._read();
    if (!store.debateRooms) store.debateRooms = {};
    if(roomData.plan&&(roomData.plan.capacity<2||roomData.plan.mode==='assigned'&&!['pro','con'].every(team=>roomData.plan.assignments?.some(item=>item.team===team))))
      throw Object.assign(new Error('편성을 수정해 주세요. 정원은 2명 이상이며 지정 배정은 찬반에 각각 한 명 이상 필요합니다.'),{status:400});

    const activeRooms=Object.values(store.debateRooms).filter(room=>room.schoolId===roomData.schoolId&&
      Number(room.grade)===Number(roomData.grade)&&Number(room.classId)===Number(roomData.classId)&&
      room.status==='active'&&Date.parse(room.endsAt)>Date.now());
    if(activeRooms.some(room=>room.topicId===roomData.topicId))
      throw Object.assign(new Error('이 논제로 진행 중인 토론방이 이미 있습니다.'),{status:409});
    if(activeRooms.length>=10)
      throw Object.assign(new Error('한 학급에서 동시에 열 수 있는 토론방은 최대 10개입니다.'),{status:409});

    const roomId = roomData.roomId || `room_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const existing = store.debateRooms[roomId];
    if(existing) throw Object.assign(new Error('기존 토론 기록은 덮어쓸 수 없습니다. 새 토론을 시작하세요.'),{status:409});
    const durationMinutes = parseInt(roomData.durationMinutes || 10, 10);
    const now = new Date();
    const endsAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

    const room = {
      roomId,
      topicId: roomData.topicId || "topic_ai_judge",
      title: roomData.title || "인공지능(AI) 판사 도입, 사법 정의 실현에 타당한가?",
      unit: roomData.unit || "통합사회2 Ⅱ. 사회 정의와 법치주의",
      hostUid: roomData.hostUid || null,
      schoolId: roomData.schoolId || "demo-school",
      grade: parseInt(roomData.grade || 1, 10),
      classId: parseInt(roomData.classId || 3, 10),
      teamSize: roomData.teamSize || "classroom",
      plan: roomData.plan || {mode:'open',capacity:26,assignments:[]},
      durationMinutes,
      startedAt: now.toISOString(),
      endsAt: endsAt.toISOString(),
      status: "active", // "waiting", "active", "finished"
      participants: { teamA: [], teamB: [] },
      messages: [],
      oracleUsage: {},
      aiSummary: null,
      evaluation: null
    };

    store.debateRooms[roomId] = room;
    this._write(store);
    return room;
  }

  getDebateRoom(roomId = "room_gangseo_1_3") {
    const store = this._read();
    if (!store.debateRooms || !store.debateRooms[roomId]) {
      throw Object.assign(new Error('교사가 아직 토론방을 열지 않았습니다.'), {status:404});
    }
    const room = store.debateRooms[roomId];
    return { ...room,
      participants: {
        teamA: (room.participants?.teamA || []).filter(item => item.dataOrigin === 'verified'),
        teamB: (room.participants?.teamB || []).filter(item => item.dataOrigin === 'verified')
      },
      messages: (room.messages || []).filter(item => item.dataOrigin === 'verified')
    };
  }

  getCurrentDebateRoom(schoolId, grade, classId) {
    const rooms=Object.values(this._read().debateRooms||{}).filter(r=>r.schoolId===schoolId&&Number(r.grade)===Number(grade)&&Number(r.classId)===Number(classId));
    const room=rooms.sort((a,b)=>Number(b.status==='active'&&Date.parse(b.endsAt)>Date.now())-Number(a.status==='active'&&Date.parse(a.endsAt)>Date.now())||new Date(b.startedAt)-new Date(a.startedAt))[0];
    return room?this.getDebateRoom(room.roomId):null;
  }

  getActiveDebateRooms(schoolId, grade, classId) {
    return Object.values(this._read().debateRooms||{}).filter(room=>room.schoolId===schoolId&&Number(room.grade)===Number(grade)&&Number(room.classId)===Number(classId)&&room.status==='active'&&Date.parse(room.endsAt)>Date.now()).sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt)).map(room=>this.getDebateRoom(room.roomId));
  }

  joinDebateRoom(roomId, profile, teamId) {
    const store = this._read();
    if (!store.debateRooms?.[roomId]) throw Object.assign(new Error('교사가 아직 토론방을 열지 않았습니다.'), {status:404});
    const fresh = this._read();
    const room = fresh.debateRooms[roomId];
    if (room.schoolId !== profile.schoolId || Number(room.grade) !== Number(profile.grade) || Number(room.classId) !== Number(profile.classId))
      throw Object.assign(new Error('다른 학급 토론에는 참여할 수 없습니다.'),{status:403});
    if (room.status !== 'active' || Date.parse(room.endsAt) <= Date.now())
      throw Object.assign(new Error('종료된 토론입니다.'),{status:409});
    if (profile.role !== 'student' || !['pro','con'].includes(teamId))
      throw Object.assign(new Error('학생 계정으로 찬성 또는 반대를 선택하세요.'),{status:400});
    if (!room.participants) room.participants = { teamA: [], teamB: [] };
    const members=[...room.participants.teamA,...room.participants.teamB];
    const existing=members.find(item=>item.uid===profile.uid);
    const plan=room.plan||{mode:'open',capacity:99,assignments:[]};
    if (profile.role==='student') {
      if (plan.mode==='assigned') {
        const assigned=plan.assignments?.find(item=>item.studentNumber===String(profile.studentNumber));
        if (!assigned) throw Object.assign(new Error('이 논제의 지정 참가자가 아닙니다.'),{status:403});
        if (assigned.team!==teamId) throw Object.assign(new Error('교사가 지정한 조로 참여해 주세요.'),{status:403});
      }
      if (!existing && members.filter(item=>item.role==='student').length >= Number(plan.capacity||99))
        throw Object.assign(new Error('이 논제의 참가 정원이 찼습니다.'),{status:409});
      const otherRoom=Object.values(fresh.debateRooms).find(item=>item.roomId!==roomId&&item.status==='active'&&Date.parse(item.endsAt)>Date.now()&&[...(item.participants?.teamA||[]),...(item.participants?.teamB||[])].some(member=>member.uid===profile.uid));
      if(otherRoom) throw Object.assign(new Error('이미 참여 중인 토론방에서 나간 뒤 다른 방에 입장하세요.'),{status:409});
      if(existing?.team===teamId) return this.getDebateRoom(roomId);
      if(plan.mode!=='assigned') {
        const others=members.filter(item=>item.uid!==profile.uid&&item.role==='student');
        const chosen=others.filter(item=>item.team===teamId).length,opposite=others.length-chosen;
        if(chosen>=Math.ceil(Number(plan.capacity||99)/2)||chosen+1>opposite+1)
          throw Object.assign(new Error('찬반 인원 균형을 위해 인원이 적은 입장을 선택해 주세요.'),{status:409});
      }
    }
    const key = teamId === 'con' ? 'teamB' : 'teamA';
    for (const list of [room.participants.teamA, room.participants.teamB]) {
      const index = list.findIndex(item => item.uid === profile.uid);
      if (index >= 0) list.splice(index, 1);
    }
    room.participants[key].push({ uid:profile.uid, name:profile.name, studentNumber:profile.studentNumber || null,
      team:teamId === 'con' ? 'con' : 'pro', role:profile.role, dataOrigin:'verified', joinedAt:new Date().toISOString() });
    this._write(fresh);
    return this.getDebateRoom(roomId);
  }

  leaveDebateRoom(roomId, profile) {
    const store=this._read(),room=store.debateRooms?.[roomId];
    if(!room) throw Object.assign(new Error('토론방을 찾을 수 없습니다.'),{status:404});
    if(room.schoolId!==profile.schoolId||Number(room.grade)!==Number(profile.grade)||Number(room.classId)!==Number(profile.classId))
      throw Object.assign(new Error('다른 학급 토론에는 접근할 수 없습니다.'),{status:403});
    const own=[...(room.participants?.teamA||[]),...(room.participants?.teamB||[])].find(item=>item.uid===profile.uid);
    if(own){
      room.participationHistory ||= [];
      room.participationHistory.push({...own,leftAt:new Date().toISOString()});
      for(const key of ['teamA','teamB'])room.participants[key]=room.participants[key].filter(item=>item.uid!==profile.uid);
      this._write(store);
    }
    return this.getDebateRoom(roomId);
  }

  addDebateMessage(roomId, messageData) {
    const store = this._read();
    if (!store.debateRooms) store.debateRooms = {};
    if (!store.debateRooms[roomId]) {
      this.initDebateRoom({ roomId });
    }

    const room = store.debateRooms[roomId];
    const message = {
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      roomId,
      authorUid: messageData.authorUid,
      authorName: messageData.authorName,
      authorNumber: messageData.authorNumber || null,
      teamId: messageData.teamId || "pro",
      messageType: messageData.messageType || "claim",
      targetUid: messageData.targetUid || null,
      targetName: messageData.targetName || null,
      content: messageData.content,
      usedEvidenceIds: messageData.usedEvidenceIds || [],
      createdAt: new Date().toISOString(),
      moderationStatus: messageData.moderationStatus || "approved"
      ,dataOrigin: 'verified'
    };

    room.messages.push(message);
    this._write(store);
    return message;
  }

  updateDebateRoom(roomId, updateData) {
    const store = this._read();
    if (!store.debateRooms || !store.debateRooms[roomId]) {
      this.initDebateRoom({ roomId });
    }
    const room = store.debateRooms[roomId];
    Object.assign(room, updateData);
    this._write(store);
    return room;
  }

  // --- 교사 실시간 토론 관찰 메모 (지시서 제55조) ---
  addTeacherObservation(obsData) {
    const store = this._read();
    if (!store.teacherObservations) store.teacherObservations = [];

    const observation = {
      id: `obs_${Date.now()}`,
      teacherUid: obsData.teacherUid || "demo_teacher",
      studentUid: obsData.studentUid,
      studentName: obsData.studentName || null,
      debateId: obsData.debateId || "room_gangseo_1_3",
      timestamp: new Date().toISOString(),
      note: obsData.note,
      tags: obsData.tags || ["반론우수", "개념활용"]
    };

    store.teacherObservations.push(observation);
    this._write(store);
    return observation;
  }

  getTeacherObservations(debateId = "room_gangseo_1_3") {
    const store = this._read();
    if (!store.teacherObservations) return [];
    return store.teacherObservations.filter(o => o.debateId === debateId);
  }

  // --- 교사용 학급 전체 역량 분석 및 차기 수업 추천 (지시서 제79, 80조) ---
  getClassAnalytics(schoolId = "demo-school", grade = 1, classId = 3) {
    const store = this._read();
    const studentsStatus = this.getClassStudentsStatus(schoolId, grade, classId);
    const studentIds = new Set(studentsStatus.map(student => student.uid));
    const sessions = (store.practiceSessions || []).filter(session => studentIds.has(session.userId));
    const keys = ['concept','claim','reasoning','rebuttal','expression'];
    const values = Object.fromEntries(keys.map(key => [key, sessions.map(session => Number(session.analysis?.[key])).filter(Number.isFinite)]));
    const averageCompetencies = Object.fromEntries(keys.map(key => [key, values[key].length ? Math.round(values[key].reduce((a,b)=>a+b,0)/values[key].length*10)/10 : null]));
    const measured = Object.entries(averageCompetencies).filter(([,value]) => value !== null);
    return { schoolId, grade, classId, totalStudents: studentsStatus.length,
      readyStudentsCount: studentsStatus.filter(student => student.isBattleReady).length,
      practiceSessionCount: sessions.length, hasSufficientData: sessions.length >= 3 && measured.length >= 3,
      averageCompetencies, weakestCompetency: measured.length ? measured.sort((a,b)=>a[1]-b[1])[0][0] : null,
      recommendedTopic: null,
      recentObservations: (store.teacherObservations || []).filter(item => studentIds.has(item.studentUid)).slice(-5).reverse()
    };
  }
}


module.exports = new StorageService();
