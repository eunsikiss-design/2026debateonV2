const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const client = fs.readFileSync(path.join(root, 'assets', 'auth-client.js'), 'utf8');

test('student signup defaults to Google and supports configured Naver and Kakao', () => {
  assert.match(client, /GoogleAuthProvider/);
  assert.match(client, /signInWithRedirect/);
  assert.match(client, /getRedirectResult/);
  assert.match(client, /location\.hostname === '127\.0\.0\.1'/);
  assert.match(client, /Google 계정으로 학생 가입/);
  assert.match(client, /\/api\/auth\/naver\/start/);
  assert.match(client, /\/api\/auth\/kakao\/start/);
  assert.doesNotMatch(client, /accounts:signInWithPassword/);
});

test('Google ID token is exchanged for an HttpOnly server session', () => {
  assert.match(client, /credential\.user\.getIdToken/);
  assert.match(client, /\/api\/auth\/session/);
  assert.match(client, /body: JSON\.stringify\(\{ idToken \}\)/);
});

test('teacher login uses a dedicated administrator endpoint', () => {
  assert.match(client, /교사 관리자 로그인/);
  assert.match(client, /value="admin"/);
  assert.match(client, /\/api\/auth\/admin/);
  assert.doesNotMatch(client, /123456789!/);
});

