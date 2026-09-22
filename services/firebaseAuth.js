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
  let data = {};
  try { const snap = await getFirestore(getApp()).collection('users').doc(decoded.uid).get(); data = snap.exists ? snap.data() : {}; }
  catch (error) { if (!decoded.role) throw error; }
  const role = data.role || decoded.role;
  if (!['student','teacher'].includes(role)) throw Object.assign(new Error('승인된 역할 정보가 없습니다.'), { code:'ROLE_NOT_ASSIGNED' });
  return { uid: decoded.uid, email: decoded.email || null, name: data.name || decoded.name || null, role,
    schoolId: data.schoolId || decoded.schoolId || null, grade: Number(data.grade ?? decoded.grade) || null,
    classId: Number(data.classId ?? decoded.classId) || null, studentNumber: data.studentNumber || null };
}
async function createSession(idToken) {
  const decoded = await getAuth(getApp()).verifyIdToken(idToken, true);
  const profile = await profileFor(decoded);
  const session = await getAuth(getApp()).createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
  return { session, profile, maxAgeSeconds: Math.floor(SESSION_MAX_AGE_MS/1000) };
}
async function authenticate(req) {
  const token = cookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) return null;
  const decoded = await getAuth(getApp()).verifySessionCookie(token, true);
  return profileFor(decoded);
}
function sameClass(user, schoolId, grade, classId) {
  return Boolean(user && user.schoolId && user.schoolId === schoolId && Number(user.grade) === Number(grade) && Number(user.classId) === Number(classId));
}
function safeProfile(user) { const { uid,email,name,role,schoolId,grade,classId,studentNumber }=user;return {uid,email,name,role,schoolId,grade,classId,studentNumber}; }

module.exports={COOKIE_NAME,isConfigured,serverConfigured,clientConfigured,publicConfig,cookie,createSession,authenticate,sameClass,safeProfile};

