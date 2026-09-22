/* Student social signup and a separate Firebase-backed administrator login. */
(() => {
  if (location.hostname === '127.0.0.1') {
    location.replace(`${location.protocol}//localhost:${location.port}${location.pathname}${location.search}${location.hash}`);
    return;
  }
  const replaceButton = id => {
    const old = document.getElementById(id);
    if (!old) return null;
    const fresh = old.cloneNode(true);
    old.replaceWith(fresh);
    return fresh;
  };
  const googleButton = replaceButton('google-sso-btn');
  const naverButton = replaceButton('naver-sso-btn');
  const kakaoButton = replaceButton('kakao-sso-btn');
  const legacyForm = document.getElementById('login-form');
  if (!googleButton || !legacyForm) return;
  const form = legacyForm.cloneNode(false);
  legacyForm.replaceWith(form);

  const demoPanel = document.getElementById('quick-student-btn')?.closest('.mb-space-md');
  document.querySelectorAll('#quick-student-btn,#quick-teacher-btn').forEach(element => { element.hidden = true; });
  const roleRow = document.getElementById('role-student-btn')?.parentElement?.parentElement;
  const credentialDivider = [...document.querySelectorAll('span')].find(element => element.textContent.includes('성명 · 학번'))?.parentElement;
  const badgeTitle = [...document.querySelectorAll('span')].find(element => element.textContent.trim() === '활동 인증 내역 뱃지');
  const badgePanel = badgeTitle?.closest('aside');
  [demoPanel, roleRow, credentialDivider, badgePanel, document.getElementById('teacher-panel'), document.querySelector('.connection-state')].forEach(element => { if (element) element.hidden = true; });

  googleButton.querySelector('span.font-label-lg').textContent = 'Google 계정으로 학생 가입';
  const recommendation = googleButton.querySelector('span.font-label-sm');
  if (recommendation) recommendation.textContent = '기본 가입';
  if (naverButton) naverButton.querySelector('span').textContent = '네이버로 학생 가입';
  if (kakaoButton) kakaoButton.querySelector('span').textContent = '카카오로 학생 가입';

  form.className = 'flex flex-col gap-3 mt-5 pt-5 border-t border-surface-container-high';
  form.innerHTML = `
    <div class="flex items-center gap-2 text-on-surface"><span class="material-symbols-outlined text-secondary">admin_panel_settings</span><strong>교사 관리자 로그인</strong></div>
    <p class="text-xs text-on-surface-variant">교사는 발급된 관리자 계정으로 로그인합니다.</p>
    <label class="text-sm font-semibold text-on-surface" for="admin-username">아이디</label>
    <input id="admin-username" name="username" autocomplete="username" value="admin" required class="w-full bg-surface-container-lowest text-on-surface px-4 py-3 rounded-xl border border-surface-container-high" />
    <label class="text-sm font-semibold text-on-surface" for="admin-password">비밀번호</label>
    <input id="admin-password" name="password" type="password" autocomplete="current-password" required class="w-full bg-surface-container-lowest text-on-surface px-4 py-3 rounded-xl border border-surface-container-high" />
    <button id="admin-login-btn" type="submit" class="w-full py-3 rounded-xl bg-secondary text-on-secondary font-semibold">교사 관리 화면 로그인</button>`;

  const status = document.createElement('p');
  status.id = 'auth-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  status.className = 'mt-3 text-sm text-on-surface-variant text-center';
  googleButton.closest('section')?.insertAdjacentElement('afterend', status);
  const preview = document.querySelector('body > aside[role=status]');
  if (preview) preview.textContent = '학생 간편가입과 교사 관리자 로그인을 확인하고 있습니다.';
  const footer = form.parentElement?.querySelector('footer p');
  if (footer) footer.textContent = '학생은 개인 계정으로 가입하며, 교사는 관리자 계정으로 로그인합니다.';

  let signingIn = false;
  async function exchangeSession(idToken) {
    const response = await fetch('/api/auth/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '로그인 정보를 확인하지 못했습니다.');
    localStorage.setItem('debateon_user', JSON.stringify(data.user));
    location.href = data.user.role === 'teacher' ? '/stitch_screens/10_teacher_dashboard.html' : '/stitch_screens/05_ai_basic_practice.html';
  }
  async function firebaseClient() {
    const response = await fetch('/api/auth/config'); const data = await response.json();
    if (!response.ok || !data.firebase) throw new Error('Firebase 로그인이 아직 활성화되지 않았습니다.');
    const [{ initializeApp, getApps }, authModule] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js')
    ]);
    return { auth: authModule.getAuth(getApps()[0] || initializeApp(data.firebase)), authModule };
  }
  async function completeRedirect() {
    try {
      const { auth, authModule } = await firebaseClient();
      const credential = await authModule.getRedirectResult(auth);
      if (!credential) return;
      status.textContent = '학생 계정을 등록하고 있습니다.';
      await exchangeSession(await credential.user.getIdToken(true));
    } catch (error) { status.textContent = error?.message || 'Google 로그인 결과를 확인하지 못했습니다.'; }
  }
  async function signInWithGoogle() {
    if (signingIn) return; signingIn = true; googleButton.disabled = true;
    status.textContent = 'Google 로그인 창을 여는 중입니다.';
    try {
      const { auth, authModule } = await firebaseClient();
      const provider = new authModule.GoogleAuthProvider(); provider.setCustomParameters({ prompt: 'select_account' });
      await authModule.signInWithRedirect(auth, provider);
    } catch (error) { status.textContent = error?.message || 'Google 로그인에 실패했습니다.'; googleButton.disabled = false; signingIn = false; }
  }
  async function configureProviders() {
    try {
      const response = await fetch('/api/auth/providers'); const data = await response.json();
      for (const [name, button] of [['naver', naverButton], ['kakao', kakaoButton]]) {
        if (!button) continue;
        button.disabled = !data.providers?.[name];
        button.style.opacity = data.providers?.[name] ? '1' : '.55';
        button.title = data.providers?.[name] ? '' : 'OAuth 앱 키 등록 후 사용할 수 있습니다.';
      }
      if (preview) preview.textContent = '학생은 개인 Google 계정으로 바로 가입할 수 있습니다.';
    } catch { if (preview) preview.textContent = '로그인 서버 상태를 확인할 수 없습니다.'; }
  }
  googleButton.addEventListener('click', signInWithGoogle);
  naverButton?.addEventListener('click', () => { if (!naverButton.disabled) location.href = '/api/auth/naver/start'; });
  kakaoButton?.addEventListener('click', () => { if (!kakaoButton.disabled) location.href = '/api/auth/kakao/start'; });
  form.addEventListener('submit', async event => {
    event.preventDefault(); const button = document.getElementById('admin-login-btn'); button.disabled = true;
    status.textContent = '관리자 권한을 확인하고 있습니다.';
    try {
      const response = await fetch('/api/auth/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.elements.username.value.trim(), password: form.elements.password.value }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message || '관리자 로그인에 실패했습니다.');
      localStorage.setItem('debateon_user', JSON.stringify(data.user)); location.href = '/stitch_screens/10_teacher_dashboard.html';
    } catch (error) { status.textContent = error.message; button.disabled = false; }
  });
  const error = new URLSearchParams(location.search).get('error');
  if (error) status.textContent = '간편가입을 완료하지 못했습니다. 다시 시도해 주세요.';
  configureProviders(); completeRedirect();
})();
