'use strict';

const crypto = require('crypto');

const PROVIDERS = {
  naver: {
    clientId: 'NAVER_CLIENT_ID', clientSecret: 'NAVER_CLIENT_SECRET',
    authorizeUrl: 'https://nid.naver.com/oauth2.0/authorize',
    tokenUrl: 'https://nid.naver.com/oauth2.0/token'
  },
  kakao: {
    clientId: 'KAKAO_REST_API_KEY', clientSecret: 'KAKAO_CLIENT_SECRET',
    authorizeUrl: 'https://kauth.kakao.com/oauth/authorize',
    tokenUrl: 'https://kauth.kakao.com/oauth/token'
  }
};

function appOrigin() {
  const configured = String(process.env.APP_ORIGIN || '').split(',').map(v => v.trim()).find(Boolean);
  if (configured) return configured.replace(/\/$/, '');
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}
function callbackUrl(provider) { return `${appOrigin()}/api/auth/${provider}/callback`; }
function configured(provider) {
  const item = PROVIDERS[provider];
  return Boolean(item && process.env[item.clientId] && process.env[item.clientSecret] && process.env.OAUTH_STATE_SECRET);
}
function sign(value) {
  return crypto.createHmac('sha256', process.env.OAUTH_STATE_SECRET).update(value).digest('base64url');
}
function stateCookie(provider, value, maxAge = 600) {
  const secure = appOrigin().startsWith('https://') ? '; Secure' : '';
  return `oauth_${provider}=${encodeURIComponent(value)}; Path=/api/auth/${provider}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
function cookieValue(header, key) {
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (part.slice(0, index).trim() === key) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return '';
}
function start(provider) {
  if (!configured(provider)) throw new Error('SOCIAL_PROVIDER_NOT_CONFIGURED');
  const item = PROVIDERS[provider];
  const nonce = crypto.randomBytes(24).toString('base64url');
  const state = `${nonce}.${sign(`${provider}.${nonce}`)}`;
  const params = new URLSearchParams({ response_type: 'code', client_id: process.env[item.clientId], redirect_uri: callbackUrl(provider), state });
  if (provider === 'kakao') params.set('scope', 'profile_nickname account_email');
  return { url: `${item.authorizeUrl}?${params}`, cookie: stateCookie(provider, state) };
}
function verifyState(provider, state, cookieHeader) {
  const stored = cookieValue(cookieHeader, `oauth_${provider}`);
  const [nonce, signature] = String(state || '').split('.');
  if (!stored || stored !== state || !nonce || !signature) return false;
  const expected = sign(`${provider}.${nonce}`);
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
async function token(provider, code) {
  const item = PROVIDERS[provider];
  const params = new URLSearchParams({ grant_type: 'authorization_code', client_id: process.env[item.clientId], client_secret: process.env[item.clientSecret], redirect_uri: callbackUrl(provider), code });
  const response = await fetch(item.tokenUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' }, body: params
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('SOCIAL_TOKEN_EXCHANGE_FAILED');
  return data.access_token;
}
async function profile(provider, accessToken) {
  const url = provider === 'naver' ? 'https://openapi.naver.com/v1/nid/me' : 'https://kapi.kakao.com/v2/user/me';
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await response.json();
  if (!response.ok) throw new Error('SOCIAL_PROFILE_FAILED');
  if (provider === 'naver') {
    const item = data.response || {};
    return { providerUserId: item.id, email: item.email || null, name: item.name || item.nickname || '학생' };
  }
  const account = data.kakao_account || {};
  return { providerUserId: data.id, email: account.email || null, name: account.profile?.nickname || '학생' };
}
async function complete(provider, code, state, cookieHeader) {
  if (!configured(provider) || !verifyState(provider, state, cookieHeader) || !code) throw new Error('INVALID_OAUTH_CALLBACK');
  return profile(provider, await token(provider, code));
}

module.exports = { configured, start, complete, stateCookie };
