const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const client = fs.readFileSync(path.join(root, 'assets', 'auth-client.js'), 'utf8');

test('Google is the default visible authentication method', () => {
  assert.match(client, /GoogleAuthProvider/);
  assert.match(client, /signInWithRedirect/);
  assert.match(client, /getRedirectResult/);
  assert.match(client, /location\.hostname === '127\.0\.0\.1'/);
  assert.match(client, /Google 계정으로 계속하기/);
  assert.match(client, /form\.hidden = true/);
  assert.doesNotMatch(client, /accounts:signInWithPassword/);
});

test('Google ID token is exchanged for an HttpOnly server session', () => {
  assert.match(client, /credential\.user\.getIdToken/);
  assert.match(client, /\/api\/auth\/session/);
  assert.match(client, /body: JSON\.stringify\(\{ idToken \}\)/);
});

