'use strict';

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const COOKIE_NAME = '__session';
const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000;
let app;

function serverConfigured() {
  return ['FIREBASE_PROJECT_ID','FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY'].every(key => Boolean(process.env[key]));
}
function clientConfigured() {
  return ['FIREBASE_WEB_API_KEY','FIREBASE_AUTH_DOMAIN','FIREBASE_PROJECT_ID','FIREBASE_APP_ID'].every(key => Boolean(process.env[key]));
}
function isConfigured() { return serverConfigured() && clientConfigured(); }
function getApp() {
  if (!serverConfigured()) throw Object.assign(new Error('Firebase Admin configuration is incomplete'), { code: 'AUTH_NOT_CONFIGURED' });
  if (!app) app = getApps()[0] || initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL || undefined
  });
  return app;
}
function publicConfig() {
  if (!clientConfigured()) return null;
  return { apiKey: process.env.FIREBASE_WEB_API_KEY, authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID, appId: process.env.FIREBASE_APP_ID };
}
function cookies(header='') {
  return Object.fromEntries(String(header).split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return i<0?[v,'']:[v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));
}
function cookie(value, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${COOKIE_NAME}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSeconds}${secure}`;
}
async function profileFor(decoded) {
  const ref = getFirestore(getApp()).collection('users').doc(decoded.uid);
  let data = {};
  try {
    const snap = await ref.get();
    data = snap.exists ? snap.data() : {};
    if (!data.role) {
      data = {
        name: decoded.name || decoded.email?.split('@')[0] || '학생',
        email: decoded.email || null,
        role: 'student',
        authProvider: decoded.firebase?.sign_in_provider || decoded.sourceProvider || 'unknown',
        onboardingComplete: false,
        createdAt: new Date().toISOString()
      };
      await ref.set(data, { merge: true });
    }
  } catch (error) {
    data = decoded.role ? {} : {
      name: decoded.name || decoded.email?.split('@')[0] || '학생',
      email: decoded.email || null,
      role: 'student',
      authProvider: decoded.firebase?.sign_in_provider || decoded.sourceProvider || 'unknown'
    };
  }
  const role = data.role || decoded.role;
  if (!['student','teacher'].includes(role)) throw Object.assign(new Error('승인된 역할 정보가 없습니다.'), { code:'ROLE_NOT_ASSIGNED' });
  if (role === 'teacher' && decoded.admin !== true) throw Object.assign(new Error('관리자 권한이 없습니다.'), { code:'ADMIN_REQUIRED' });
  return { uid: decoded.uid, email: decoded.email || null, name: data.name || decoded.name || null, role,
    schoolId: data.schoolId || decoded.schoolId || null, grade: Number(data.grade ?? decoded.grade) || null,
    classId: Number(data.classId ?? decoded.classId) || null, studentNumber: data.studentNumber || null,
    authProvider: data.authProvider || decoded.firebase?.sign_in_provider || decoded.sourceProvider || 'unknown',
    onboardingComplete: role === 'teacher' || data.onboardingComplete === true,
    privacyConsentAt: data.privacyConsentAt || null };
}
async function exchangeIdentityToolkit(path, body) {
  if (!process.env.FIREBASE_WEB_API_KEY) throw new Error('Firebase Web API key is missing');
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/${path}?key=${encodeURIComponent(process.env.FIREBASE_WEB_API_KEY)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok || !data.idToken) throw Object.assign(new Error('Firebase sign-in failed'), { code: data.error?.message || 'FIREBASE_SIGN_IN_FAILED' });
  return data.idToken;
}
async function signInAdmin(username, password) {
  if (username !== 'admin' || !process.env.ADMIN_EMAIL || !password) throw new Error('Invalid admin credentials');
  const idToken = await exchangeIdentityToolkit('accounts:signInWithPassword', {
    email: process.env.ADMIN_EMAIL, password, returnSecureToken: true
  });
  return createSession(idToken);
}
async function createSocialSession({ provider, providerUserId, email, name }) {
  const digest = require('crypto').createHash('sha256').update(String(providerUserId)).digest('hex').slice(0, 40);
  const uid = `${provider}_${digest}`;
  const auth = getAuth(getApp());
  try { await auth.getUser(uid); }
  catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    await auth.createUser({ uid, displayName: name || undefined });
  }
  try {
    const ref=getFirestore(getApp()).collection('users').doc(uid),snap=await ref.get(),existing=snap.exists?snap.data():{};
    const update={ email: email || null, role: 'student', authProvider: provider,
      providerUserId: String(providerUserId), onboardingComplete:existing.onboardingComplete===true,updatedAt: new Date().toISOString() };
    if(!existing.onboardingComplete)update.name=name||'학생';
    await ref.set(update, { merge: true });
  } catch (error) {
    if (!/PERMISSION_DENIED|disabled/i.test(String(error?.message))) throw error;
  }
  const customToken = await auth.createCustomToken(uid, { sourceProvider: provider });
  const idToken = await exchangeIdentityToolkit('accounts:signInWithCustomToken', { token: customToken, returnSecureToken: true });
  return createSession(idToken);
}
async function createSession(idToken) {
  const decoded = await getAuth(getApp()).verifyIdToken(idToken, true);
  const profile = await profileFor(decoded);
  const session = await getAuth(getApp()).createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
  return { session, profile, maxAgeSeconds: Math.floor(SESSION_MAX_AGE_MS/1000) };
}
async function completeStudentProfile(user, input) {
  if (!user?.uid || user.role !== 'student') throw Object.assign(new Error('학생 계정이 필요합니다.'), { code:'STUDENT_REQUIRED' });
  const data={ name:input.name, role:'student', schoolId:input.schoolId, grade:Number(input.grade), classId:Number(input.classId),
    studentNumber:String(input.studentNumber), onboardingComplete:true, privacyConsentAt:input.privacyConsentAt,
    privacyConsentVersion:input.privacyConsentVersion, updatedAt:new Date().toISOString() };
  await getFirestore(getApp()).collection('users').doc(user.uid).set(data,{merge:true});
  return {...user,...data};
}
async function authenticate(req, findStoredProfile) {
  const token = cookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;
  const decoded = await getAuth(getApp()).verifySessionCookie(token, true);
  const stored = typeof findStoredProfile === 'function' ? findStoredProfile(decoded.uid) : null;
  if (stored?.role === 'student' && stored.onboardingComplete === true) {
    return {
      uid: decoded.uid,
      email: stored.email || decoded.email || null,
      name: stored.name || decoded.name || null,
      role: 'student',
      schoolId: stored.schoolId || null,
      grade: Number(stored.grade) || null,
      classId: Number(stored.classId) || null,
      studentNumber: stored.studentNumber || null,
      authProvider: stored.authProvider || decoded.firebase?.sign_in_provider || decoded.sourceProvider || 'unknown',
      onboardingComplete: true,
      privacyConsentAt: stored.privacyConsentAt || null
    };
  }
  return profileFor(decoded);
}
function sameClass(user, schoolId, grade, classId) {
  return Boolean(user && user.schoolId && user.schoolId === schoolId && Number(user.grade) === Number(grade) && Number(user.classId) === Number(classId));
}
function safeProfile(user) { const { uid,email,name,role,schoolId,grade,classId,studentNumber,authProvider,onboardingComplete,privacyConsentAt }=user;return {uid,email,name,role,schoolId,grade,classId,studentNumber,authProvider,onboardingComplete,privacyConsentAt}; }

module.exports={COOKIE_NAME,isConfigured,serverConfigured,clientConfigured,publicConfig,cookie,createSession,signInAdmin,createSocialSession,completeStudentProfile,authenticate,sameClass,safeProfile};

