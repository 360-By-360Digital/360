/* ════════════════════════════════════════════════════════
   360 Voice v1.1 — WebRTC voice calls + voice notes
   Requires: supabaseClient (global from main.js)
   Place at: /assets/js/voice.js
════════════════════════════════════════════════════════ */

window.Voice = (function() {

  /* ── State ─────────────────────────────────────────── */
  let localStream      = null;
  let peerConnections  = {};
  let callRoom         = null;
  let callSignalChan   = null;
  let isMuted          = false;
  let isInCall         = false;
  let callParticipants = new Map();
  let ongoingCallId    = null;

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  // Lazy getter — supabaseClient is defined by main.js which loads before voice.js
  // but we access it at call-time not at parse-time so it's always ready.
  function getSb() {
    // supabaseClient is a top-level const in main.js (classic script = on window)
    // fallback to window.sb which chat.js uses internally
    return window.supabaseClient || window.sb;
  }

  /* ── UI Elements ───────────────────────────────────── */
  function getCallUI() { return document.getElementById('voice-call-ui'); }

  function injectCallUI() {
    if (document.getElementById('voice-call-ui')) return;
    const ui = document.createElement('div');
    ui.id = 'voice-call-ui';
    ui.className = 'voice-call-ui hidden';
    ui.innerHTML = `
      <div class="vc-header">
        <span class="vc-status" id="vc-status">🔴 In Call</span>
        <span class="vc-room-name" id="vc-room-name"></span>
        <span class="vc-timer" id="vc-timer">0:00</span>
      </div>
      <div class="vc-participants" id="vc-participants"></div>
      <div class="vc-controls">
        <button class="vc-btn" id="vc-mute" title="Mute">🎙️</button>
        <button class="vc-btn vc-end" id="vc-end" title="End call">📵</button>
      </div>
    `;
    document.body.appendChild(ui);
    document.getElementById('vc-mute').onclick = toggleMute;
    document.getElementById('vc-end').onclick = endCall;
  }

  function injectIncomingCallUI() {
    if (document.getElementById('incoming-call-ui')) return;
    const ui = document.createElement('div');
    ui.id = 'incoming-call-ui';
    ui.className = 'incoming-call-ui hidden';
    ui.innerHTML = `
      <div class="ic-avatar" id="ic-avatar">?</div>
      <div class="ic-info">
        <div class="ic-name" id="ic-caller-name">Someone</div>
        <div class="ic-subtitle">Incoming voice call</div>
      </div>
      <div class="ic-actions">
        <button class="ic-btn ic-accept" id="ic-accept" title="Accept">📞</button>
        <button class="ic-btn ic-decline" id="ic-decline" title="Decline">📵</button>
      </div>
    `;
    document.body.appendChild(ui);
    document.getElementById('ic-accept').onclick = acceptIncomingCall;
    document.getElementById('ic-decline').onclick = declineIncomingCall;
  }

  /* ── Timer ─────────────────────────────────────────── */
  let callTimerInterval = null;
  let callStartTime = null;

  function startTimer() {
    callStartTime = Date.now();
    callTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      const el = document.getElementById('vc-timer');
      if (el) el.textContent = `${m}:${s.toString().padStart(2,'0')}`;
    }, 1000);
  }

  function stopTimer() {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
  }

  /* ── Signaling via Supabase ────────────────────────── */
  // Broadcast-based signaling — instant, no DB polling needed
  function getSignalChannel(roomId) {
    const sb = getSb();
    if (!sb) return null;
    // One persistent broadcast channel per room
    if (callSignalChan) return callSignalChan;
    callSignalChan = sb.channel(`voice-broadcast:${roomId}`, { config: { broadcast: { self: false } } });
    callSignalChan
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        if (payload.to !== window.currentUserId) return;
        handleSignal(payload.from, payload.type, payload.data);
      })
      .subscribe();
    return callSignalChan;
  }

  // Cache outbound inbox channels so we dont re-subscribe on every ICE candidate
  const _outboxChans = {};

  function sendSignal(toId, type, payload) {
    const sb = getSb();
    if (!sb) { console.error('Voice: no supabase client'); return; }
    const msg = { type: 'broadcast', event: 'signal', payload: {
      from: window.currentUserId,
      to: toId,
      type,
      data: payload
    }};
    // Send on room channel if active
    const roomChan = callRoom ? getSignalChannel(callRoom) : null;
    if (roomChan) {
      // Only send if already subscribed to avoid REST fallback
      if (roomChan.state === 'joined') roomChan.send(msg);
      else roomChan.subscribe(s => { if(s==='SUBSCRIBED') roomChan.send(msg); });
    }

    // Always also send to inbox for reliability (invite, accept, decline)
    // Reuse cached channel if already subscribed
    if (_outboxChans[toId]) {
      const c = _outboxChans[toId];
      if (c.state === 'joined') c.send(msg);
      else c.subscribe(s => { if(s==='SUBSCRIBED') c.send(msg); });
      return;
    }
    const inboxChan = sb.channel(`voice-inbox:${toId}`, { config: { broadcast: { self: false } } });
    _outboxChans[toId] = inboxChan;
    inboxChan.subscribe(status => {
      if (status === 'SUBSCRIBED') inboxChan.send(msg);
    });
    // Clean up non-call signals after 10s
    if (['call-invite','call-accept','call-decline','call-end'].includes(type)) {
      setTimeout(() => { try { sb.removeChannel(inboxChan); delete _outboxChans[toId]; } catch(e){} }, 10000);
    }
  }

  function subscribeToSignals(roomId) {
    getSignalChannel(roomId); // sets up callSignalChan
  }

  /* ── WebRTC ────────────────────────────────────────── */
  async function createPeerAndOffer(peerId) {
    // Caller side: create peer, add tracks, send offer
    if (peerConnections[peerId]) peerConnections[peerId].close();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnections[peerId] = pc;
    if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.onicecandidate = ({ candidate }) => { if (candidate) sendSignal(peerId, 'ice', candidate.toJSON()); };
    pc.ontrack = ({ streams }) => { if (streams[0]) playRemoteAudio(peerId, streams[0]); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') updateParticipantUI(peerId, 'connected');
      else if (['failed','disconnected','closed'].includes(pc.connectionState)) {
        removeParticipantUI(peerId); delete peerConnections[peerId];
      }
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(peerId, 'offer', pc.localDescription.toJSON());
    } catch(e) { console.error('createOffer error', e); }
    return pc;
  }

  function createPeerAsCallee(peerId) {
    // Callee side: create peer, add tracks, wait for offer
    if (peerConnections[peerId]) peerConnections[peerId].close();
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnections[peerId] = pc;
    if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    pc.onicecandidate = ({ candidate }) => { if (candidate) sendSignal(peerId, 'ice', candidate.toJSON()); };
    pc.ontrack = ({ streams }) => { if (streams[0]) playRemoteAudio(peerId, streams[0]); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') updateParticipantUI(peerId, 'connected');
      else if (['failed','disconnected','closed'].includes(pc.connectionState)) {
        removeParticipantUI(peerId); delete peerConnections[peerId];
      }
    };
    return pc;
  }

  async function handleSignal(fromId, type, payload) {
    if (!isInCall && type !== 'call-invite' && type !== 'call-decline') return;

    if (type === 'offer') {
      let pc = peerConnections[fromId];
      if (!pc) pc = createPeerAsCallee(fromId);
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(fromId, 'answer', pc.localDescription.toJSON());

    } else if (type === 'answer') {
      const pc = peerConnections[fromId];
      if (pc && pc.signalingState !== 'stable') {
        try { await pc.setRemoteDescription(new RTCSessionDescription(payload)); } catch(e) { console.warn('answer err',e); }
      }

    } else if (type === 'ice') {
      const pc = peerConnections[fromId];
      if (pc && payload && pc.remoteDescription) {
        try { await pc.addIceCandidate(new RTCIceCandidate(payload)); } catch(e) { console.warn('ice err',e); }
      }

    } else if (type === 'call-invite') {
      handleIncomingCallInvite(fromId, payload);

    } else if (type === 'call-accept') {
      addParticipant(fromId, payload.username || 'Friend');
      createPeerAndOffer(fromId); // caller now sends offer

    } else if (type === 'call-decline') {
      if (window.showToast) window.showToast('📵 Call declined');
      if (Object.keys(peerConnections).length === 0) endCall();

    } else if (type === 'call-end') {
      removeParticipantUI(fromId);
      if (peerConnections[fromId]) { peerConnections[fromId].close(); delete peerConnections[fromId]; }
      if (Object.keys(peerConnections).length === 0) endCall();
    }
  }

  /* ── Remote Audio ──────────────────────────────────── */
  function playRemoteAudio(peerId, stream) {
    let audio = document.getElementById(`remote-audio-${peerId}`);
    if (!audio) {
      audio = document.createElement('audio');
      audio.id = `remote-audio-${peerId}`;
      audio.autoplay = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
    }
    audio.srcObject = stream;
  }

  function removeRemoteAudio(peerId) {
    document.getElementById(`remote-audio-${peerId}`)?.remove();
  }

  /* ── Participants UI ───────────────────────────────── */
  function addParticipant(userId, username) {
    callParticipants.set(userId, { username });
    renderParticipants();
  }

  function renderParticipants() {
    const el = document.getElementById('vc-participants');
    if (!el) return;
    el.innerHTML = '';
    const selfProf = window.currentProfile || {};
    el.appendChild(makeParticipantBubble(window.currentUserId, selfProf.username || 'You', true));
    callParticipants.forEach((info, uid) => el.appendChild(makeParticipantBubble(uid, info.username, false)));
  }

  function makeParticipantBubble(uid, username, isSelf) {
    const wrap = document.createElement('div');
    wrap.className = 'vc-participant';
    wrap.id = `vcp-${uid}`;
    const initials = (username||'?').slice(0,2).toUpperCase();
    wrap.innerHTML = `
      <div class="vc-p-avatar">${initials}</div>
      <div class="vc-p-name">${isSelf ? 'You' : username}</div>
      <div class="vc-p-indicator" id="vci-${uid}">🎙️</div>
    `;
    return wrap;
  }

  function updateParticipantUI(uid, state) {
    const el = document.getElementById(`vci-${uid}`);
    if (el) el.textContent = state === 'connected' ? '🔊' : '🔇';
  }

  function removeParticipantUI(uid) {
    document.getElementById(`vcp-${uid}`)?.remove();
    removeRemoteAudio(uid);
    callParticipants.delete(uid);
  }

  /* ── Incoming Call ─────────────────────────────────── */
  let pendingInvite = null;

  function handleIncomingCallInvite(fromId, payload) {
    if (isInCall) { sendSignal(fromId, 'call-decline', {}); return; }
    pendingInvite = { fromId, roomId: payload.room_id, username: payload.username || 'Friend' };
    const nameEl = document.getElementById('ic-caller-name');
    const avEl   = document.getElementById('ic-avatar');
    if (nameEl) nameEl.textContent = pendingInvite.username;
    if (avEl)   avEl.textContent   = (pendingInvite.username||'?').slice(0,2).toUpperCase();
    callRoom = payload.room_id;
    subscribeToSignals(callRoom);
    document.getElementById('incoming-call-ui')?.classList.remove('hidden');
  }

  async function acceptIncomingCall() {
    if (!pendingInvite) return;
    document.getElementById('incoming-call-ui')?.classList.add('hidden');
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch(e) {
      if (window.showToast) window.showToast('❌ Microphone access denied');
      return;
    }
    isInCall = true;
    callRoom = pendingInvite.roomId;
    ongoingCallId = callRoom;
    const selfProf = window.currentProfile || {};
    sendSignal(pendingInvite.fromId, 'call-accept', { username: selfProf.username || 'Friend' });
    addParticipant(pendingInvite.fromId, pendingInvite.username);
    createPeerAsCallee(pendingInvite.fromId);
    showCallUI(pendingInvite.username);
    pendingInvite = null;
  }

  function declineIncomingCall() {
    if (!pendingInvite) return;
    document.getElementById('incoming-call-ui')?.classList.add('hidden');
    sendSignal(pendingInvite.fromId, 'call-decline', {});
    const sb = getSb();
    if (callSignalChan && sb) { sb.removeChannel(callSignalChan); callSignalChan = null; }
    callRoom = null;
    pendingInvite = null;
  }

  /* ── Start Call ────────────────────────────────────── */
  async function startCall(friendId, friendUsername) {
    if (!window.currentUserId) { if (window.showToast) window.showToast('❌ Sign in to make calls'); return; }
    if (isInCall) { if (window.showToast) window.showToast('Already in a call!'); return; }
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch(e) {
      if (window.showToast) window.showToast('❌ Microphone access denied');
      return;
    }
    isInCall = true;
    callRoom = [window.currentUserId, friendId].sort().join('_');
    ongoingCallId = callRoom;
    subscribeToSignals(callRoom);
    const selfProf = window.currentProfile || {};
    sendSignal(friendId, 'call-invite', { room_id: callRoom, username: selfProf.username || 'You' });
    addParticipant(friendId, friendUsername);
    showCallUI(friendUsername);
    if (window.showToast) window.showToast(`📞 Calling ${friendUsername}…`);
  }

  function showCallUI(roomLabel) {
    const ui = getCallUI();
    if (!ui) return;
    const nameEl = document.getElementById('vc-room-name');
    if (nameEl) nameEl.textContent = roomLabel;
    renderParticipants();
    ui.classList.remove('hidden');
    startTimer();
  }

  /* ── End Call ──────────────────────────────────────── */
  function endCall() {
    const sb = getSb();
    Object.keys(peerConnections).forEach(peerId => {
      try { sendSignal(peerId, 'call-end', {}); } catch(e) {}
      peerConnections[peerId].close();
    });
    peerConnections = {};
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (callSignalChan && sb) { sb.removeChannel(callSignalChan); callSignalChan = null; }
    document.querySelectorAll('[id^="remote-audio-"]').forEach(el => el.remove());
    isInCall = false;
    isMuted = false;
    callRoom = null;
    ongoingCallId = null;
    callParticipants.clear();
    stopTimer();
    getCallUI()?.classList.add('hidden');
    document.getElementById('incoming-call-ui')?.classList.add('hidden');
    if (window.showToast) window.showToast('📵 Call ended');
  }

  /* ── Mute ──────────────────────────────────────────── */
  function toggleMute() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => { t.enabled = !isMuted; });
    const btn = document.getElementById('vc-mute');
    if (btn) btn.textContent = isMuted ? '🔇' : '🎙️';
  }

  /* ════════════════════════════════════════════════════
     VOICE NOTES
  ════════════════════════════════════════════════════ */
  let mediaRecorder    = null;
  let voiceNoteChunks  = [];
  let voiceNoteTimer   = null;
  let voiceNoteSeconds = 0;
  let isRecording      = false;

  async function startVoiceNote() {
    const uid = window.currentUserId;
    if (!uid) { if (window.showToast) window.showToast('❌ Sign in to use voice notes'); return; }
    if (isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Pick a supported MIME type
      const mime = ['audio/webm;codecs=opus','audio/webm','audio/ogg'].find(t => MediaRecorder.isTypeSupported(t)) || '';
      mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      voiceNoteChunks = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) voiceNoteChunks.push(e.data); };
      mediaRecorder.onstop = finishVoiceNote;
      mediaRecorder.start();
      isRecording = true;
      voiceNoteSeconds = 0;
      voiceNoteTimer = setInterval(() => {
        voiceNoteSeconds++;
        const btn = document.getElementById('voice-note-btn');
        if (btn) btn.title = `Recording… ${voiceNoteSeconds}s (click to stop)`;
        if (voiceNoteSeconds >= 120) stopVoiceNote();
      }, 1000);
      const btn = document.getElementById('voice-note-btn');
      if (btn) { btn.textContent = '⏹️'; btn.classList.add('recording'); }
      if (window.showToast) window.showToast('🎤 Recording… click 🎤 to stop');
    } catch(e) {
      if (window.showToast) window.showToast('❌ Microphone access denied');
    }
  }

  function stopVoiceNote() {
    if (!isRecording || !mediaRecorder) return;
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
    clearInterval(voiceNoteTimer);
    isRecording = false;
    const btn = document.getElementById('voice-note-btn');
    if (btn) { btn.textContent = '🎤'; btn.title = 'Voice note'; btn.classList.remove('recording'); }
  }

  async function finishVoiceNote() {
    const sb = getSb();
    const uid = window.currentUserId;
    if (!sb || !uid) { if (window.showToast) window.showToast('❌ Sign in to send voice notes'); return; }
    const ext = (mediaRecorder?.mimeType || 'audio/webm').includes('ogg') ? 'ogg' : 'webm';
    const blob = new Blob(voiceNoteChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
    if (blob.size < 500) { if (window.showToast) window.showToast('Voice note too short'); return; }
    if (window.showToast) window.showToast('⏫ Uploading voice note…');
    const fileName = `voice-notes/${uid}/${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('chat-attachments').upload(fileName, blob, { contentType: blob.type });
    if (error) {
      // Bucket may not exist yet — try creating it
      if (error.message?.includes('not found') || error.statusCode === 404) {
        if (window.showToast) window.showToast('❌ Storage bucket "chat-attachments" not found. Create it in Supabase dashboard → Storage.');
      } else {
        if (window.showToast) window.showToast('❌ Upload failed: ' + error.message);
      }
      return;
    }
    const { data: urlData } = sb.storage.from('chat-attachments').getPublicUrl(fileName);
    const url = urlData?.publicUrl;
    if (!url) return;
    if (window.sendVoiceNoteMessage) window.sendVoiceNoteMessage(url, voiceNoteSeconds);
  }

  function toggleVoiceNote() {
    if (isRecording) stopVoiceNote();
    else startVoiceNote();
  }

  /* ── Init ──────────────────────────────────────────── */
  function setupGlobalListener() {
    const sb = getSb();
    const uid = window.currentUserId;
    if (!sb || !uid) return;
    // Global incoming-call listener on a per-user broadcast channel
    // This lets anyone call us even outside an active callRoom
    const listenChan = sb.channel(`voice-inbox:${uid}`, { config: { broadcast: { self: false } } });
    listenChan.on('broadcast', { event: 'signal' }, ({ payload }) => {
      if (payload.to !== window.currentUserId) return;
      handleSignal(payload.from, payload.type, payload.data);
    }).subscribe();
  }

  function init() {
    injectCallUI();
    injectIncomingCallUI();
    const vnBtn = document.getElementById('voice-note-btn');
    if (vnBtn) vnBtn.onclick = toggleVoiceNote;
    // Try immediately (user may already be authed on page reload)
    if (window.currentUserId) setupGlobalListener();
    // Also hook into auth state changes from chat.js
    window.addEventListener('voice-auth-ready', setupGlobalListener, { once: true });
  }

  return { init, startCall, endCall, toggleVoiceNote, isInCall: () => isInCall, isRecording: () => isRecording };

})();

// Auto-init once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.Voice.init(), { once: true });
} else {
  window.Voice.init();
}
