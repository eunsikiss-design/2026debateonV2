'use strict';

const path = require('path');
const fs = require('fs');
const envFile = process.env.ENV_FILE;
if (envFile && fs.existsSync(envFile)) process.loadEnvFile(envFile);
for (const file of ['.env.local', '.env']) {
  const location = path.join(__dirname, '..', file);
  if (fs.existsSync(location)) process.loadEnvFile(location);
}
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@debateon.local';
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!password || password.length < 10) throw new Error('ADMIN_INITIAL_PASSWORD must be at least 10 characters');
  const app = getApps()[0] || initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  }) });
  const auth = getAuth(app);
  let user;
  try { user = await auth.getUserByEmail(email); }
  catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    user = await auth.createUser({ email, password, displayName: '관리자', emailVerified: true });
  }
  await auth.updateUser(user.uid, { password, disabled: false });
  const schoolId = require('../services/appSchool').id();
  const grade = Number(process.env.ADMIN_GRADE || 1);
  const classId = Number(process.env.ADMIN_CLASS_ID || 1);
  await auth.setCustomUserClaims(user.uid, { admin: true, role: 'teacher', schoolId, grade, classId });
  try {
    await getFirestore(app).collection('users').doc(user.uid).set({
      name: '관리자', email, role: 'teacher', isAdmin: true, schoolId, grade, classId,
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    if (!/PERMISSION_DENIED|disabled/i.test(String(error?.message))) throw error;
    console.warn('Firestore profile skipped because Firestore is disabled; custom claims were applied.');
  }
  console.log('Admin account provisioned.');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
