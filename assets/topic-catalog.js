(() => {
  let topics = [], current = null;
  const drafts = new Map();
  const fields = () => [...document.querySelectorAll('#input-claim, #input-reason, #input-rebuttal, #essay-input')];
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  window.TopicCatalog = { ready, lock(value) { document.querySelectorAll('#curriculum-unit, #curriculum-topic').forEach(s => { s.disabled = value; }); }, get current() { return current; }, get topics() { return topics; } };
  document.addEventListener('DOMContentLoaded', async () => {
    const main = document.querySelector('main');
    const panel = document.createElement('section');
    panel.style.cssText = 'margin:20px;padding:20px;border:1px solid #168294;border-radius:16px;background:#101923;color:#e6f5ff';
    panel.innerHTML = '<h2>통합사회2 토론·논술 주제</h2><label>단원 <select id="curriculum-unit"></select></label> <label>주제 <select id="curriculum-topic"></select></label><p id="curriculum-question"></p><p id="curriculum-essay"></p><p id="curriculum-concepts"></p><small id="curriculum-source"></small><p><a href="05_ai_basic_practice.html">기초 연습</a> · <a href="06_ai_advanced_practice.html">심화논술</a> · <a href="08_speech_timer_training.html">스피치</a></p><p id="curriculum-status" role="status">주제를 불러오는 중입니다.</p>';
    main.prepend(panel);
    document.getElementById('tab-speak-btn')?.addEventListener('click', () => {
      if (current) location.href = '08_speech_timer_training.html?topic=' + encodeURIComponent(current.topicId);
    });
    panel.querySelectorAll('select').forEach(s => { s.style.cssText = 'max-width:100%;padding:10px;margin:6px 0;background:#101923;color:#e6f5ff;border:1px solid #168294'; });
    const unit = panel.querySelector('#curriculum-unit'), select = panel.querySelector('#curriculum-topic');
    function pick(id) {
      const next = topics.find(t => t.topicId === id);
      if (!next) return;
      if (current) drafts.set(current.topicId, fields().map(f => f.value));
      current = next;
      fields().forEach((f,i) => { f.value = drafts.get(id)?.[i] || ''; f.placeholder = f.id === 'essay-input' ? next.essayPrompt || next.question : '선택한 주제에 대한 주장과 교과 근거를 작성하세요.'; f.dispatchEvent(new Event('input')); });
      try { sessionStorage.setItem('debateon-topic', id); } catch {}
      document.getElementById('curriculum-question').textContent = '토론: ' + next.question;
      document.getElementById('curriculum-essay').textContent = '논술: ' + (next.essayPrompt || next.question);
      document.getElementById('curriculum-concepts').textContent = '핵심 개념: ' + next.keyConcepts.join(' · ');
      document.getElementById('curriculum-source').textContent = next.textbookRef + ' · ' + (next.sourceType || '기존 확장 주제');
      document.querySelectorAll('.intro-index').forEach(n => { n.textContent = next.unit; });
      panel.querySelectorAll('a').forEach(a => { a.search = '?topic=' + encodeURIComponent(id); });
      window.dispatchEvent(new CustomEvent('curriculum-topic-change', { detail: next }));
    }
    function options(preferred) {
      select.replaceChildren();
      topics.filter(t => t.unit === unit.value).forEach(t => select.add(new Option(t.title, t.topicId)));
      if ([...select.options].some(o => o.value === preferred)) select.value = preferred;
      pick(select.value);
    }
    try {
      const response = await fetch('/api/topics');
      const data = await response.json();
      if (!response.ok || !data.success || !data.topics?.length) throw new Error();
      topics = data.topics;
      [...new Set(topics.map(t => t.unit))].forEach(u => unit.add(new Option(u,u)));
      let saved; try { saved = sessionStorage.getItem('debateon-topic'); } catch {}
      const preferred = new URLSearchParams(location.search).get('topic') || saved;
      const first = topics.find(t => t.topicId === preferred) || topics[0];
      unit.value = first.unit; options(first.topicId);
      unit.addEventListener('change', () => options());
      select.addEventListener('change', () => pick(select.value));
      document.getElementById('curriculum-status').textContent = '단원별 40개 주제 · 기존 추가 주제도 선택할 수 있습니다.';
      resolveReady(topics);
    } catch {
      document.getElementById('curriculum-status').textContent = '주제를 불러오지 못했습니다. 새로고침해 주세요.';
      resolveReady([]);
    }
  });
})();
