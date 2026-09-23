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
  assert.match(client, /\/api\/auth\/naver\/start/);
  assert.match(client, /\/api\/auth\/kakao\/start/);
  assert.doesNotMatch(client, /accounts:signInWithPassword/);
});

test('social sign-in requests only the provider identity needed before roster verification', () => {
  const social=fs.readFileSync(path.join(root,'services','socialAuth.js'),'utf8');
  assert.doesNotMatch(social,/account_email|profile_nickname/);
});

test('Google ID token is exchanged for an HttpOnly server session', () => {
  assert.match(client, /credential\.user\.getIdToken/);
  assert.match(client, /\/api\/auth\/session/);
  assert.match(client, /body:\s*JSON\.stringify\(\{\s*idToken\s*\}\)/);
});

test('student completes roster verification and privacy consent after social sign-in',()=>{
  assert.match(client,/\/api\/auth\/onboarding/);
  assert.match(client,/studentNumber/);
  assert.match(client,/privacyConsent/);
  const html=fs.readFileSync(path.join(root,'stitch_screens','04_login_signup.html'),'utf8');
  assert.match(html,/학번과 성명을 확인/);assert.match(html,/교육 목적의 개인정보 이용에 동의/);assert.match(html,/<summary>교사 관리자<\/summary>/);
});

test('teacher login uses a dedicated administrator endpoint', () => {
  const html=fs.readFileSync(path.join(root,'stitch_screens','04_login_signup.html'),'utf8');
  assert.match(html, /<summary>교사 관리자<\/summary>/);
  assert.match(html, /value="admin"/);
  assert.match(client, /\/api\/auth\/admin/);
  assert.doesNotMatch(client, /123456789!/);
  assert.doesNotMatch(html, /123456789!/);
});

