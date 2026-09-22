const fs = require('fs');
const path = require('path');

const screensDir = 'd:/2026-2학기/웹앱/stitch_screens';

const navScript = `
<script>
  // Unified Screen Navigation Dispatcher
  document.addEventListener('click', function(e) {
    const navLink = e.target.closest('[data-path]');
    if (navLink) {
      e.preventDefault();
      const targetPath = navLink.getAttribute('data-path');
      if (window.parent && window.parent !== window && typeof window.parent.navigateToScreen === 'function') {
        window.parent.navigateToScreen(targetPath);
      } else {
        const pathMap = {
          'basic-practice': '05_ai_basic_practice.html',
          'advanced-practice': '06_ai_advanced_practice.html',
          'speech-timer-training': '08_speech_timer_training.html',
          'speech-timer': '08_speech_timer_training.html',
          'growth-report': '07_competency_report.html',
          'debate-battle': '09_class_debate_battle.html',
          'my-profile': '04_login_signup.html',
          'auth': '04_login_signup.html'
        };
        if (pathMap[targetPath]) {
          window.location.href = pathMap[targetPath];
        }
      }
    }
  });
</script>
`;

// 1. Patch 04_login_signup.html
let loginHtml = fs.readFileSync(path.join(screensDir, '04_login_signup.html'), 'utf8');
if (!loginHtml.includes('Unified Screen Navigation Dispatcher')) {
  // Add mascot banner before tabs
  const mascotWelcome = `
<!-- Ansan Gangseo Mascot Welcome Banner -->
<div class="flex items-center gap-3 p-3.5 mb-space-md rounded-2xl bg-surface-container-lowest border border-surface-container-high shadow-xs">
  <div class="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 border border-primary/20 bg-blue-50">
    <img src="../assets/logo_symbol.png" alt="예시고 예시학생1 학생 마스코트" class="w-full h-full object-cover">
  </div>
  <div class="flex flex-col min-w-0">
    <div class="flex items-center gap-1.5">
      <span class="font-headline-sm text-sm font-bold text-on-surface">예시학생1 & 예시학생2</span>
      <span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary-fixed text-on-primary-fixed">예시고 1학년</span>
    </div>
    <p class="text-xs text-on-surface-variant line-clamp-1 mt-0.5">
      "토론과 논술, 디베이트온 AI와 함께 자신 있게 시작해봐!"
    </p>
  </div>
</div>
`;
  loginHtml = loginHtml.replace('<!-- Segmented Control Tab Switcher -->', mascotWelcome + '\n<!-- Segmented Control Tab Switcher -->');
  loginHtml = loginHtml.replace('</body>', navScript + '\n</body>');
  fs.writeFileSync(path.join(screensDir, '04_login_signup.html'), loginHtml, 'utf8');
  console.log('✓ Patched 04_login_signup.html');
}

// 2. Patch 05_ai_basic_practice.html
let basicHtml = fs.readFileSync(path.join(screensDir, '05_ai_basic_practice.html'), 'utf8');
if (!basicHtml.includes('Unified Screen Navigation Dispatcher')) {
  basicHtml = basicHtml.replace('</body>', navScript + '\n</body>');
  fs.writeFileSync(path.join(screensDir, '05_ai_basic_practice.html'), basicHtml, 'utf8');
  console.log('✓ Patched 05_ai_basic_practice.html');
}

// 3. Patch 06_ai_advanced_practice.html
let advHtml = fs.readFileSync(path.join(screensDir, '06_ai_advanced_practice.html'), 'utf8');
if (!advHtml.includes('Unified Screen Navigation Dispatcher')) {
  advHtml = advHtml.replace('</body>', navScript + '\n</body>');
  fs.writeFileSync(path.join(screensDir, '06_ai_advanced_practice.html'), advHtml, 'utf8');
  console.log('✓ Patched 06_ai_advanced_practice.html');
}

// 4. Patch 07_competency_report.html
let reportHtml = fs.readFileSync(path.join(screensDir, '07_competency_report.html'), 'utf8');
if (!reportHtml.includes('Unified Screen Navigation Dispatcher')) {
  // Replace profile image with local mascot boy
  reportHtml = reportHtml.replace(
    /src="https:\/\/lh3\.googleusercontent\.com\/aida-public\/AB6AXuAhcDTS[^"]+"/,
    'src="../assets/logo_symbol.png"'
  );
  reportHtml = reportHtml.replace('</body>', navScript + '\n</body>');
  fs.writeFileSync(path.join(screensDir, '07_competency_report.html'), reportHtml, 'utf8');
  console.log('✓ Patched 07_competency_report.html');
}

// 5. Patch 08_speech_timer_training.html
let timerHtml = fs.readFileSync(path.join(screensDir, '08_speech_timer_training.html'), 'utf8');
if (!timerHtml.includes('Unified Screen Navigation Dispatcher')) {
  timerHtml = timerHtml.replace(
    /src="https:\/\/lh3\.googleusercontent\.com\/aida\/AEtjO1WBtk0FG2QZ[^"]+"/,
    'src="../assets/logo_symbol.png"'
  );
  timerHtml = timerHtml.replace('</body>', navScript + '\n</body>');
  fs.writeFileSync(path.join(screensDir, '08_speech_timer_training.html'), timerHtml, 'utf8');
  console.log('✓ Patched 08_speech_timer_training.html');
}

// 6. Patch 09_class_debate_battle.html
let battleHtml = fs.readFileSync(path.join(screensDir, '09_class_debate_battle.html'), 'utf8');
if (!battleHtml.includes('Unified Screen Navigation Dispatcher')) {
  // Header mascot
  battleHtml = battleHtml.replace(
    /src="https:\/\/lh3\.googleusercontent\.com\/aida-public\/AB6AXuCY93shJiu[^"]+"/,
    'src="../assets/logo_symbol.png"'
  );
  // Pro speaker 1
  battleHtml = battleHtml.replace(
    /src="https:\/\/lh3\.googleusercontent\.com\/aida-public\/AB6AXuCkprAUi1w[^"]+"/,
    'src="../assets/logo_symbol.png"'
  );
  // Pro speaker 2
  battleHtml = battleHtml.replace(
    /src="https:\/\/lh3\.googleusercontent\.com\/aida-public\/AB6AXuDpWQY0IUV[^"]+"/,
    'src="../assets/logo_symbol.png"'
  );
  // Con speaker (girl mascot)
  battleHtml = battleHtml.replace(
    /src="https:\/\/lh3\.googleusercontent\.com\/aida-public\/AB6AXuAAgKUZhzk[^"]+"/,
    'src="../assets/logo_symbol.png"'
  );
  battleHtml = battleHtml.replace('</body>', navScript + '\n</body>');
  fs.writeFileSync(path.join(screensDir, '09_class_debate_battle.html'), battleHtml, 'utf8');
  console.log('✓ Patched 09_class_debate_battle.html');
}

console.log('All screens successfully updated!');

