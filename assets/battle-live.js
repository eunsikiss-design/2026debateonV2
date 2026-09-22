(() => {
  const roomId = 'room_gangseo_1_3';
  let stream;

  function ensureStatus() {
    let node = document.getElementById('battle-live-status');
    if (!node) {
      node = document.createElement('span'); node.id = 'battle-live-status';
      node.className = 'px-2 py-1 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold';
      node.setAttribute('role','status'); node.setAttribute('aria-live','polite');
      document.getElementById('room-members-count')?.parentElement?.append(node);
    }
    return node;
  }

  function participantCount(participants={}) {
    return (participants.teamA?.length || 0) + (participants.teamB?.length || 0);
  }

  function updatePresence(participants) {
    document.getElementById('room-members-count').textContent = `참여 ${participantCount(participants)}명 · 서버 실시간 연결`;
  }

  async function connect() {
    const status = ensureStatus();
    const auth = await fetch('/api/auth/me');
    if (!auth.ok) { status.textContent = 'SIGN IN REQUIRED'; return; }
    status.textContent = 'CONNECTING';
    stream = new EventSource(`/api/debate/stream/${encodeURIComponent(roomId)}`);
    stream.addEventListener('open', () => { status.textContent = 'LIVE'; status.className = 'px-2 py-1 rounded-full bg-emerald-950 text-emerald-300 text-[10px] font-bold'; });
    stream.addEventListener('room', event => {
      const data = JSON.parse(event.data); if (data.room) { window.renderRoom?.(data.room); updatePresence(data.room.participants); }
    });
    stream.addEventListener('presence', event => updatePresence(JSON.parse(event.data).participants));
    stream.addEventListener('message', event => {
      const message = JSON.parse(event.data).message; if (!message) return;
      const feed = document.getElementById('debateFeed');
      if (feed?.querySelector(`[data-message-id="${CSS.escape(message.messageId)}"]`)) return;
      feed?.insertAdjacentHTML('beforeend', window.renderMessageHTML(message)); feed.scrollTop = feed.scrollHeight;
      document.getElementById('message-total-count').textContent = `총 ${feed.querySelectorAll('[data-message-id]').length}건 발언`;
    });
    stream.onerror = () => { status.textContent = 'RECONNECTING'; status.className = 'px-2 py-1 rounded-full bg-amber-950 text-amber-300 text-[10px] font-bold'; };
  }

  window.addEventListener('beforeunload', () => stream?.close());
  connect().catch(() => { ensureStatus().textContent = 'CONNECTION ERROR'; });
})();

