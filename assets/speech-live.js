(() => {
  const startButton = document.getElementById('start-btn');
  if (!startButton) return;

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let mediaStream = null;
  let finalTranscript = '';
  let interimTranscript = '';
  let startedAt = 0;
  let warningSent = false;
  let liveRunning = false;
  let targetSeconds = 45;
  let speechTopic = null;

  const panel = document.createElement('section');
  panel.id = 'live-speech-panel';
  panel.className = 'bg-surface-container rounded-xl p-space-md shadow-md flex flex-col gap-3 border border-secondary/20';
  panel.innerHTML = `
    <div class="flex items-center justify-between gap-3">
      <div><span class="font-code-argument text-[11px] tracking-widest text-secondary">LIVE SPEECH</span><h2 class="font-headline-sm text-on-surface">실시간 발화 기록</h2></div>
      <span id="speech-live-state" class="px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant text-xs font-bold" role="status" aria-live="polite">READY</span>
    </div>
    <div id="speech-waveform" class="h-12 flex items-center justify-center gap-1" aria-hidden="true">
      ${Array.from({length:18},(_,i)=>`<span class="w-1 rounded-full bg-secondary/70" style="height:${8+(i%5)*4}px"></span>`).join('')}
    </div>
    <div id="speech-transcript" class="min-h-[112px] max-h-56 overflow-y-auto p-3 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-sm leading-relaxed text-on-surface" aria-live="polite">
      마이크를 허용하고 훈련을 시작하면 발화가 여기에 실시간으로 표시됩니다.
    </div>
    <div class="flex flex-wrap justify-between gap-2 text-xs text-on-surface-variant">
      <span id="speech-word-count">0어절</span><span>원본 음성은 저장하지 않고 전사문만 제출합니다.</span>
    </div>`;
  startButton.closest('section').before(panel);

  const stateNode = document.getElementById('speech-live-state');
  const transcriptNode = document.getElementById('speech-transcript');
  const wordCountNode = document.getElementById('speech-word-count');
  const bars = [...document.querySelectorAll('#speech-waveform span')];

  function setState(value, message) {
    stateNode.textContent = value;
    if (message) transcriptNode.textContent = message;
    bars.forEach((bar, index) => {
      bar.style.animation = value === 'LISTENING' ? `speechPulse .7s ${index * 35}ms ease-in-out infinite alternate` : 'none';
    });
  }

  function renderTranscript() {
    const combined = `${finalTranscript}${interimTranscript}`.trim();
    transcriptNode.textContent = combined || '발화를 기다리고 있습니다.';
    wordCountNode.textContent = `${combined ? combined.split(/\s+/).length : 0}어절`;
  }

  function stopMedia() {
    mediaStream?.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  async function beginRecognition() {
    if (!Recognition) {
      setState('UNAVAILABLE', '이 브라우저는 실시간 음성 인식을 지원하지 않습니다. Chrome 또는 Edge 최신 버전을 사용해 주세요.');
      throw new Error('SPEECH_RECOGNITION_UNAVAILABLE');
    }
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recognition = new Recognition();
    recognition.lang = 'ko-KR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = event => {
      interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalTranscript += `${text.trim()} `;
        else interimTranscript += text;
      }
      renderTranscript();
    };
    recognition.onerror = event => {
      const messages = { 'not-allowed':'마이크 사용이 허용되지 않았습니다.', 'no-speech':'음성이 감지되지 않았습니다. 다시 시작해 주세요.', network:'음성 인식 네트워크에 연결하지 못했습니다.' };
      setState('ERROR', messages[event.error] || '음성 인식 중 오류가 발생했습니다.');
      stopMedia();
    };
    recognition.onend = () => { if (liveRunning) { try { recognition.start(); } catch {} } };
    recognition.start();
    startedAt = Date.now();
    warningSent = false;
    setState('LISTENING');
  }

  function pauseRecognition() {
    try { recognition?.stop(); } catch {}
    stopMedia();
    setState('PAUSED');
  }

  const legacyToggle = window.toggleSpeechTimer;
  window.toggleSpeechTimer = async function toggleLiveSpeechTimer() {
    if (!liveRunning) {
      if (!window.TopicCatalog.current) { setState('EMPTY', '주제를 먼저 선택해 주세요.'); return; }
      if (speechTopic?.topicId !== window.TopicCatalog.current.topicId) { finalTranscript = ''; interimTranscript = ''; }
      speechTopic = window.TopicCatalog.current;
      document.querySelectorAll('#curriculum-unit, #curriculum-topic').forEach(s => { s.disabled = true; });
      try { await beginRecognition(); }
      catch (error) { window.TopicCatalog.lock(false); if (error.message !== 'SPEECH_RECOGNITION_UNAVAILABLE') setState('MIC DENIED', '마이크 권한을 허용해야 실시간 발화 훈련을 시작할 수 있습니다.'); return; }
      liveRunning = true;
    } else {
      pauseRecognition();
      liveRunning = false;
    }
    legacyToggle();
  };

  const legacySetDuration = window.setTimerDuration;
  window.setTimerDuration = function setLiveDuration(seconds, button) {
    targetSeconds = seconds;
    legacySetDuration(seconds, button);
  };

  window.finishSpeechTraining = async function finishLiveSpeechTraining() {
    liveRunning = false;
    try { recognition?.stop(); } catch {}
    stopMedia();
    const transcript = finalTranscript.trim();
    const durationSeconds = startedAt ? Math.max(1, Math.round((Date.now() - startedAt) / 1000)) : 0;
    if (!transcript) { window.TopicCatalog.lock(false); setState('EMPTY', '기록된 발화가 없습니다. 다시 시작해 주세요.'); return; }
    setState('ANALYZING');
    try {
      const response = await fetch('/api/speech/submit', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ topicId:speechTopic.topicId, transcript, durationSeconds, targetDurationSeconds:targetSeconds })
      });
      const data = await response.json();
      if (response.status === 401) throw new Error('분석 결과를 저장하려면 학생 계정 로그인이 필요합니다.');
      if (!response.ok) throw new Error(data.message || data.error || '스피치 분석에 실패했습니다.');
      setState('COMPLETE');
      const evaluation = data.evaluation || {};
      document.getElementById('speech-eval-total').textContent = evaluation.scores?.totalScore == null ? '분석 완료' : `${evaluation.scores.totalScore}점`;
      document.getElementById('speech-eval-wpm').textContent = evaluation.metrics?.wpm == null ? '측정값 없음' : `${evaluation.metrics.wpm} WPM`;
      document.getElementById('speech-eval-praise').textContent = evaluation.feedback?.praise || '발화를 끝까지 완료했습니다.';
      document.getElementById('speech-eval-growth').textContent = evaluation.feedback?.growthPoint || '실제 수행 근거를 바탕으로 다음 연습 목표를 확인하세요.';
      document.getElementById('speech-eval-challenge').textContent = evaluation.feedback?.nextSpeechChallenge || '같은 주장을 더 짧게 구조화해 보세요.';
      document.getElementById('speech-eval-modal').classList.remove('hidden');
      document.getElementById('speech-eval-modal').classList.add('flex');
    } catch (error) { setState('ERROR', error.message); }
    finally { window.TopicCatalog.lock(false); }
  };

  const style = document.createElement('style');
  style.textContent = '@keyframes speechPulse{from{transform:scaleY(.5);opacity:.45}to{transform:scaleY(1.8);opacity:1}}';
  document.head.append(style);
})();

