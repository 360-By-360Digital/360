/* ════════════════════════════════════════════════════════
   360 Voice v1.0 — WebRTC voice calls + voice notes
   Requires: supabaseClient (global), currentUserId (global)
   Tables needed: voice_signals (id, room_id, from_id, to_id, type, payload, created_at)
════════════════════════════════════════════════════════ */

window.Voice = (function() {

  /* ── State ─────────────────────────────────────────── */
  let localStream      = null;
  let peerConnections  = {};   // peerId → RTCPeerConnection
  let callRoom         = null; // current call room id
  let callSignalChan   = null; // supabase realtime channel
  let isMuted          = false;
  let isInCall         = false;
  let callParticipants = new Map(); // userId → {username, avatar_url}
  let ongoingCallId    = null;

  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  function getSb() { return window.supabaseClient || window.sb; }

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

  /* ── Signaling via Supabase Realtime ───────────────── */
  async function sendSignal(toId, type, payload) {
    const sb = getSb();
    await sb.from('voice_signals').insert({
      room_id: callRoom,
      from_id: window.currentUserId,
      to_id: toId,
      type,
      payload: JSON.stringify(payload)
    });
  }

  function subscribeToSignals(roomId) {
    const sb = getSb();
    if (callSignalChan) { sb.removeChannel(callSignalChan); }
    callSignalChan = sb.channel(`voice:${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'voice_signals',
        filter: `room_id=eq.${roomId}`
      }, async ({ new: row }) => {
        if (row.to_id !== window.currentUserId) return;
        const payload = JSON.parse(row.payload || '{}');
        await handleSignal(row.from_id, row.type, payload);
      })
      .subscribe();
  }

  /* ── WebRTC ────────────────────────────────────────── */
  function createPeer(peerId, polite) {
    if (peerConnections[peerId]) {
      peerConnections[peerId].close();
    }
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerConnections[peerId] = pc;

    if (localStream) {
      localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) sendSignal(peerId, 'ice', candidate);
    };

    pc.ontrack = ({ streams }) => {
      playRemoteAudio(peerId, streams[0]);
    };

    pc.onnegotiationneeded = async () => {
      if (polite) return; // impolite peer makes offer
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal(peerId, 'offer', pc.localDescription);
      } catch(e) { console.error('offer error', e); }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        updateParticipantUI(peerId, 'connected');
      } else if (['failed','disconnected','closed'].includes(pc.connectionState)) {
        removeParticipantUI(peerId);
        delete peerConnections[peerId];
      }
    };

    return pc;
  }

  async function handleSignal(fromId, type, payload) {
    if (!isInCall && type !== 'call-invite' && type !== 'call-decline') return;

    if (type === 'offer') {
      let pc = peerConnections[fromId];
      if (!pc) pc = createPeer(fromId, true);
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(fromId, 'answer', pc.localDescription);

    } else if (type === 'answer') {
      const pc = peerConnections[fromId];
      if (pc && pc.signalingState !== 'stable') {
        await pc.setRemoteDescription(new RTCSessionDescription(payload));
      }

    } else if (type === 'ice') {
      const pc = peerConnections[fromId];
      if (pc && payload) {
        try { await pc.addIceCandidate(new RTCIceCandidate(payload)); } catch(e) {}
      }

    } else if (type === 'call-invite') {
      handleIncomingCallInvite(fromId, payload);

    } else if (type === 'call-accept') {
      // They accepted — create peer and let negotiation happen
      addParticipant(fromId, payload.username || 'Friend');
      const pc = createPeer(fromId, false);
      // trigger negotiation
      if (localStream) {
        localStream.getTracks().forEach(t => pc.addTrack(t, localStream));
      }

    } else if (type === 'call-decline') {
      if (window.showToast) window.showToast(`📵 Call declined`);
      if (Object.keys(peerConnections).length === 0) endCall();

    } else if (type === 'call-end') {
      removeParticipantUI(fromId);
      if (peerConnections[fromId]) {
        peerConnections[fromId].close();
        delete peerConnections[fromId];
      }
      if (Object.keys(peerConnections).length === 0) {
        endCall();
      }
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
    // Self
    const selfId = window.currentUserId;
    const selfProf = window.currentProfile || {};
    const selfName = selfProf.username || 'You';
    el.appendChild(makeParticipantBubble(selfId, selfName, true));
    // Others
    callParticipants.forEach((info, uid) => {
      el.appendChild(makeParticipantBubble(uid, info.username, false));
    });
  }

  function makeParticipantBubble(uid, username, isSelf) {
    const wrap = document.createElement('div');
    wrap.className = 'vc-participant';
    wrap.id = `vcp-${uid}`;
    const initials = (username||'?').slice(0,2).toUpperCase();
    wrap.innerHTML = `
      <div class="vc-p-avatar">${initials}</div>
      <div class="vc-p-name">${isSelf ? 'You' : username}</div>
      <div class="vc-p-indicator" id="vci-${uid}">🔇</div>
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

  /* ── Call Invite Flow ──────────────────────────────── */
  let pendingInvite = null; // { fromId, roomId, username }

  function handleIncomingCallInvite(fromId, payload) {
    if (isInCall) {
      sendSignal(fromId, 'call-decline', {});
      return;
    }
    pendingInvite = { fromId, roomId: payload.room_id, username: payload.username || 'Friend' };
    const nameEl = document.getElementById('ic-caller-name');
    const avEl = document.getElementById('ic-avatar');
    if (nameEl) nameEl.textContent = pendingInvite.username;
    if (avEl) avEl.textContent = (pendingInvite.username||'?').slice(0,2).toUpperCase();

    // Subscribe to signals so answer/ice works before we're "in call"
    callRoom = payload.room_id;
    subscribeToSignals(callRoom);

    document.getElementById('incoming-call-ui')?.classList.remove('hidden');

    // Ring sound
    try {
      const audio = new Audio('/click-sound.mp3');
      audio.play().catch(()=>{});
    } catch(e) {}
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

    // Notify caller we accepted
    const selfProf = window.currentProfile || {};
    sendSignal(pendingInvite.fromId, 'call-accept', {
      username: selfProf.username || 'Friend'
    });

    addParticipant(pendingInvite.fromId, pendingInvite.username);

    // Create peer — we are polite (wait for offer from caller)
    createPeer(pendingInvite.fromId, true);

    showCallUI(pendingInvite.username);
    startTimer();
    pendingInvite = null;
  }

  function declineIncomingCall() {
    if (!pendingInvite) return;
    document.getElementById('incoming-call-ui')?.classList.add('hidden');
    sendSignal(pendingInvite.fromId, 'call-decline', {});
    if (callSignalChan) {
      getSb().removeChannel(callSignalChan);
      callSignalChan = null;
    }
    callRoom = null;
    pendingInvite = null;
  }

  /* ── Start a Call ──────────────────────────────────── */
  async function startCall(friendId, friendUsername) {
    if (isInCall) {
      if (window.showToast) window.showToast('Already in a call!');
      return;
    }

    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch(e) {
      if (window.showToast) window.showToast('❌ Microphone access denied');
      return;
    }

    isInCall = true;
    // Room = sorted pair of user IDs
    callRoom = [window.currentUserId, friendId].sort().join('_');
    ongoingCallId = callRoom;

    subscribeToSignals(callRoom);

    const selfProf = window.currentProfile || {};
    sendSignal(friendId, 'call-invite', {
      room_id: callRoom,
      username: selfProf.username || 'You'
    });

    addParticipant(friendId, friendUsername);
    showCallUI(friendUsername);

    // We are impolite — we'll make the offer once call-accept arrives
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
    // Notify all peers
    Object.keys(peerConnections).forEach(peerId => {
      sendSignal(peerId, 'call-end', {});
      peerConnections[peerId].close();
    });
    peerConnections = {};

    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }

    if (callSignalChan) {
      getSb().removeChannel(callSignalChan);
      callSignalChan = null;
    }

    // Remove remote audios
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
    const selfEl = document.getElementById(`vci-${window.currentUserId}`);
    if (selfEl) selfEl.textContent = isMuted ? '🔇' : '🎙️';
  }

  /* ════════════════════════════════════════════════════
     VOICE NOTES
  ════════════════════════════════════════════════════ */
  let mediaRecorder = null;
  let voiceNoteChunks = [];
  let voiceNoteTimer = null;
  let voiceNoteSeconds = 0;
  let isRecording = false;

  async function startVoiceNote() {
    if (isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream);
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
        if (voiceNoteSeconds >= 120) stopVoiceNote(); // max 2 min
      }, 1000);
      const btn = document.getElementById('voice-note-btn');
      if (btn) { btn.textContent = '⏹️'; btn.title = 'Recording… 0s (click to stop)'; btn.classList.add('recording'); }
      if (window.showToast) window.showToast('🎤 Recording voice note…');
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
    const blob = new Blob(voiceNoteChunks, { type: 'audio/webm' });
    if (blob.size < 1000) { if (window.showToast) window.showToast('Voice note too short'); return; }
    // Upload to Supabase Storage
    const sb = getSb();
    const fileName = `voice-notes/${window.currentUserId}/${Date.now()}.webm`;
    const { data, error } = await sb.storage.from('chat-attachments').upload(fileName, blob, { contentType: 'audio/webm' });
    if (error) { if (window.showToast) window.showToast('❌ Upload failed: ' + error.message); return; }
    const { data: urlData } = sb.storage.from('chat-attachments').getPublicUrl(fileName);
    const url = urlData?.publicUrl;
    if (!url) return;
    // Send as a special message — voice note player will render it
    if (window.sendVoiceNoteMessage) {
      window.sendVoiceNoteMessage(url, voiceNoteSeconds);
    }
  }

  function toggleVoiceNote() {
    if (isRecording) stopVoiceNote();
    else startVoiceNote();
  }

  /* ── Public API ────────────────────────────────────── */
  return {
    init() {
      injectCallUI();
      injectIncomingCallUI();
    },
    startCall,
    endCall,
    toggleVoiceNote,
    isInCall: () => isInCall,
    isRecording: () => isRecording,
  };

})();
