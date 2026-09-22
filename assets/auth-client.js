/* Firebase Google sign-in; the ID token is exchanged for an HttpOnly session cookie. */
(() => {
  if (location.hostname === '127.0.0.1') {
    location.replace(`${location.protocol}//localhost:${location.port}${location.pathname}${location.search}${location.hash}`);
    return;
  }
  const form = document.querySelector('#login-form');
  const googleButton = document.getElementById('google-sso-btn');
  if (!form || !googleButton) return;

  const nameInput = document.getElementById('student-name');
  const numberInput = document.getElementById('student-id-num');
  const roleButtons = [document.getElementById('role-student-btn'), document.getElementById('role-teacher-btn')];
  const status = document.createElement('p');
  status.id = 'auth-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.className = 'mt-3 text-sm text-on-surface-variant text-center';

  document.querySelectorAll('#quick-student-btn,#quick-teacher-btn').forEach(element => { element.hidden = true; });
  [...document.querySelectorAll('button')]
    .filter(button => /네이버|카카오/.test(button.textContent))
    .forEach(button => { button.hidden = true; });
  roleButtons.forEach(button => { if (button) button.disabled = true; });

  const demoPanel = document.getElementById('quick-student-btn')?.closest('.mb-space-md');
  const roleRow = document.getElementById('role-student-btn')?.parentElement?.parentElement;
  const credentialDivider = [...document.querySelectorAll('span')].find(element => element.textContent.includes('성명 · 학번'))?.parentElement;
  const badgeTitle = [...document.querySelectorAll('span')].find(element => element.textContent.trim() === '활동 인증 내역 뱃지');
  const badgePanel = badgeTitle?.closest('aside');
  [demoPanel, roleRow, credentialDivider, badgePanel].forEach(element => { if (element) element.hidden = true; });
  form.hidden = true;
  nameInput?.removeAttribute('required');
  numberInput?.removeAttribute('required');

  googleButton.querySelector('span.font-label-lg').textContent = 'Google 계정으로 계속하기';
  const recommendation = googleButton.querySelector('span.font-label-sm');
  if (recommendation) recommendation.textContent = '기본 로그인';
  googleButton.insertAdjacentElement('afterend', status);

  const preview = document.querySelector('body > aside[role=status]');
  if (preview) preview.textContent = 'Google 로그인 연결 상태를 확인하고 있습니다.';
  const footer = form.parentElement?.querySelector('footer p');
  if (footer) footer.textContent = 'Google 계정으로 로그인한 뒤 승인된 학급 권한을 확인합니다.';

  let signingIn = false;

  async function exchangeSession(idToken) {
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || '승인된 학급 계정이 아닙니다.');
    localStorage.setItem('debateon_user', JSON.stringify(data.user));
    location.href = data.user.role === 'teacher'
      ? '/stitch_screens/10_teacher_dashboard.html'
      : '/stitch_screens/05_ai_basic_practice.html';
  }

  async function firebaseClient() {
    const configResponse = await fetch('/api/auth/config');
    const configData = await configResponse.json();
    if (!configResponse.ok || !configData.firebase) {
      throw new Error(configData.message || 'Firebase 로그인이 아직 활성화되지 않았습니다.');
    }
    const [{ initializeApp, getApps }, authModule] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js')
    ]);
    const app = getApps()[0] || initializeApp(configData.firebase);
    return { auth: authModule.getAuth(app), authModule };
  }

  async function completeRedirect() {
    try {
      const { auth, authModule } = await firebaseClient();
      const credential = await authModule.getRedirectResult(auth);
      if (!credential) return;
      status.textContent = '학급 권한을 확인하고 있습니다.';
      await exchangeSession(await credential.user.getIdToken(true));
    } catch (error) {
      status.textContent = error?.message || 'Google 로그인 결과를 확인하지 못했습니다.';
    }
  }

  async function signInWithGoogle() {
    if (signingIn) return;
    signingIn = true;
    googleButton.disabled = true;
    status.textContent = 'Google 로그인 창을 여는 중입니다.';
    try {
      const { auth, authModule } = await firebaseClient();
      const provider = new authModule.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await authModule.signInWithRedirect(auth, provider);
    } catch (error) {
      const cancelled = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error?.code);
      status.textContent = cancelled ? 'Google 로그인이 취소되었습니다.' : (error?.message || 'Google 로그인에 실패했습니다.');
    } finally {
      signingIn = false;
      googleButton.disabled = false;
    }
  }

  googleButton.addEventListener('click', signInWithGoogle);
  completeRedirect();
  form.addEventListener('submit', event => event.preventDefault(), true);
  fetch('/api/health')
    .then(response => response.json())
    .then(info => {
      if (preview && info.authentication === 'firebase_session') {
        preview.textContent = 'Google 계정으로 로그인하세요.';
      }
    })
    .catch(() => {
      if (preview) preview.textContent = '로그인 서버 상태를 확인할 수 없습니다.';
    });
})();

