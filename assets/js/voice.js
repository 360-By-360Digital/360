/* ════════════════════════════════════════════════════════
   360 Voice v2.0 — Group WebRTC calls + voice notes
   Place at: /assets/js/voice.js  (loads after chat.js)
   Requires: window.supabaseClient, window.sb, window.currentUserId
════════════════════════════════════════════════════════ */

window.Voice = (function () {

  /* ── Config ────────────────────────────────────────── */
  const ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  /* ── State ─────────────────────────────────────────── */
  let localStream     = null;   // our mic MediaStream
  let peers           = {};     // peerId → { pc: RTCPeerConnection, audio: HTMLAudioElement }
  let callRoom        = null;
  let roomChan        = null;   // supabase broadcast channel for this room
  let inboxChan       = null;   // personal inbox for receiving invites
  let isInCall        = false;
  let isMuted         = false;
  let pendingInvite   = null;

  let timerInterval   = null;
  let timerStart      = null;

  /* ── Supabase ──────────────────────────────────────── */
  function getSb() { return window.supabaseClient || window.sb; }
  function myId()  { return window.currentUserId; }

  /* ── Broadcast helpers ─────────────────────────────── */
  function signal(toId, type, data) {
    // Send on room channel (if in call) AND personal inbox of recipient
    const msg = { type: 'broadcast', event: 'sig', payload: { from: myId(), to: toId, type, data } };
    if (roomChan && roomChan.state === 'joined') roomChan.send(msg);
    // Also reach their inbox directly for reliability
    const sb = getSb();
    if (!sb) return;
    const key = `voice-inbox:${toId}`;
    const tmp = sb.channel(key, { config: { broadcast: { self: false } } });
    tmp.subscribe(s => {
      if (s === 'SUBSCRIBED') {
        tmp.send(msg);
        setTimeout(() => { try { sb.removeChannel(tmp); } catch(e){} }, 3000);
      }
    });
  }

  function joinRoomChannel(roomId) {
    const sb = getSb();
    if (!sb) return;
    if (roomChan) sb.removeChannel(roomChan);
    roomChan = sb.channel(`voice-room:${roomId}`, { config: { broadcast: { self: false } } });
    roomChan.on('broadcast', { event: 'sig' }, ({ payload: p }) => {
      if (p.to !== myId()) return;
      handleSignal(p.from, p.type, p.data);
    }).subscribe();
  }

  /* ── WebRTC peer creation ──────────────────────────── */
  async function createPeer(peerId, isCallerSide) {
    if (peers[peerId]) { peers[peerId].pc.close(); cleanupPeer(peerId); }

    const pc = new RTCPeerConnection({ iceServers: ICE });
    peers[peerId] = { pc, audio: null };

    // ── CRITICAL: add local tracks BEFORE creating offer
    if (localStream) {
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) signal(peerId, 'ice', candidate.toJSON());
    };

    pc.ontrack = ({ streams, track }) => {
      // Get or create audio element for this peer
      let audio = peers[peerId]?.audio;
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = `voice-audio-${peerId}`;
        audio.autoplay = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        if (peers[peerId]) peers[peerId].audio = audio;
      }
      // Attach the remote stream
      if (streams && streams[0]) {
        audio.srcObject = streams[0];
      } else {
        // fallback: build MediaStream from track
        if (!audio.srcObject) audio.srcObject = new MediaStream();
        audio.srcObject.addTrack(track);
      }
      audio.play().catch(e => console.warn('audio play failed', e));
      updateParticipantIcon(peerId, '🔊');
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') updateParticipantIcon(peerId, '🔊');
      if (['disconnected', 'failed', 'closed'].includes(state)) {
        cleanupPeer(peerId);
        removeParticipantUI(peerId);
        if (Object.keys(peers).length === 0 && isInCall) endCall();
      }
    };

    if (isCallerSide) {
      // We initiate — create offer now that tracks are added
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      signal(peerId, 'offer', pc.localDescription.toJSON());
    }

    return pc;
  }

  /* ── Signal handling ───────────────────────────────── */
  async function handleSignal(fromId, type, data) {
    if (type === 'call-invite') {
      if (isInCall) { signal(fromId, 'call-busy', {}); return; }
      pendingInvite = { fromId, roomId: data.room_id, callerName: data.caller_name || 'Someone', participants: data.participants || [] };
      showIncomingUI();
      return;
    }
    if (type === 'call-busy') {
      showToast('📵 User is in another call');
      cleanupPeer(fromId);
      return;
    }
    if (type === 'call-decline') {
      showToast(`📵 ${data.name || 'User'} declined`);
      cleanupPeer(fromId);
      removeParticipantUI(fromId);
      if (Object.keys(peers).length === 0) endCall();
      return;
    }
    if (type === 'call-end') {
      cleanupPeer(fromId);
      removeParticipantUI(fromId);
      if (Object.keys(peers).length === 0) endCall();
      return;
    }
    // call-accept: callee accepted, now create peer and offer as caller
    if (type === 'call-accept') {
      addParticipantUI(fromId, data.name || 'Friend');
      await createPeer(fromId, true); // isCallerSide=true → sends offer
      return;
    }
    // WebRTC signaling
    if (type === 'offer') {
      // We're callee — create peer (don't send offer, wait for remote)
      const pc = await createPeer(fromId, false);
      await pc.setRemoteDescription(new RTCSessionDescription(data));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      signal(fromId, 'answer', pc.localDescription.toJSON());
      return;
    }
    if (type === 'answer') {
      const p = peers[fromId];
      if (!p) return;
      if (p.pc.signalingState !== 'stable') {
        try { await p.pc.setRemoteDescription(new RTCSessionDescription(data)); } catch(e) { console.warn('answer err', e); }
      }
      return;
    }
    if (type === 'ice') {
      const p = peers[fromId];
      if (!p || !p.pc.remoteDescription) return;
      try { await p.pc.addIceCandidate(new RTCIceCandidate(data)); } catch(e) { console.warn('ice err', e); }
      return;
    }
    // New participant joined group call — connect to them as caller
    if (type === 'participant-joined') {
      if (fromId === myId()) return;
      if (!isInCall) return;
      addParticipantUI(fromId, data.name || 'Friend');
      await createPeer(fromId, true);
      return;
    }
  }

  /* ── Start a call ──────────────────────────────────── */
  async function startCall(friendId, friendName) {
    if (!myId()) { showToast('❌ Sign in to make calls'); return; }
    if (isInCall)  { showToast('Already in a call'); return; }
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch(e) {
      showToast('❌ Microphone access denied');
      return;
    }
    isInCall = true;
    callRoom  = [myId(), friendId].sort().join('_');
    joinRoomChannel(callRoom);
    // Send invite
    signal(friendId, 'call-invite', {
      room_id: callRoom,
      caller_name: window.currentProfile?.username || 'Someone',
      participants: [myId()]
    });
    addParticipantUI(myId(), window.currentProfile?.username || 'You', true);
    showCallUI(friendName);
    showToast(`📞 Calling ${friendName}…`);
  }

  /* ── Group call: call multiple friends ─────────────── */
  async function startGroupCall(friendIds, friendNames) {
    if (!myId()) { showToast('❌ Sign in to make calls'); return; }
    if (isInCall) { showToast('Already in a call'); return; }
    if (!friendIds.length) return;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch(e) {
      showToast('❌ Microphone access denied');
      return;
    }
    isInCall = true;
    callRoom  = 'group_' + [myId(), ...friendIds].sort().join('_');
    joinRoomChannel(callRoom);
    addParticipantUI(myId(), window.currentProfile?.username || 'You', true);
    friendIds.forEach((fid, i) => {
      signal(fid, 'call-invite', {
        room_id: callRoom,
        caller_name: window.currentProfile?.username || 'Someone',
        participants: [myId(), ...friendIds]
      });
      addParticipantUI(fid, friendNames[i] || 'Friend');
    });
    showCallUI(friendIds.length === 1 ? (friendNames[0] || 'Friend') : `Group call (${friendIds.length + 1})`);
  }

  /* ── Accept incoming call ──────────────────────────── */
  async function acceptCall() {
    if (!pendingInvite) return;
    hideIncomingUI();
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch(e) {
      showToast('❌ Microphone access denied');
      return;
    }
    isInCall = true;
    callRoom  = pendingInvite.roomId;
    joinRoomChannel(callRoom);

    // Tell caller we accepted (they will create peer + send offer)
    signal(pendingInvite.fromId, 'call-accept', {
      name: window.currentProfile?.username || 'Friend'
    });

    // Add caller's participant UI
    addParticipantUI(pendingInvite.fromId, pendingInvite.callerName);
    addParticipantUI(myId(), window.currentProfile?.username || 'You', true);

    // Notify others in group call (if any)
    const others = (pendingInvite.participants || []).filter(id => id !== myId() && id !== pendingInvite.fromId);
    others.forEach(pid => {
      signal(pid, 'participant-joined', { name: window.currentProfile?.username || 'Friend' });
      addParticipantUI(pid, 'Friend');
      createPeer(pid, true);
    });

    showCallUI(pendingInvite.callerName);
    pendingInvite = null;
  }

  /* ── Decline incoming call ─────────────────────────── */
  function declineCall() {
    if (!pendingInvite) return;
    signal(pendingInvite.fromId, 'call-decline', { name: window.currentProfile?.username || 'You' });
    hideIncomingUI();
    const sb = getSb();
    if (inboxChan && sb) { /* keep inbox running */ }
    pendingInvite = null;
  }

  /* ── End call ──────────────────────────────────────── */
  function endCall() {
    Object.keys(peers).forEach(pid => {
      try { signal(pid, 'call-end', {}); } catch(e) {}
      cleanupPeer(pid);
    });
    peers = {};
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    isInCall = false;
    isMuted  = false;
    callRoom = null;
    const sb = getSb();
    if (roomChan && sb) { sb.removeChannel(roomChan); roomChan = null; }
    stopTimer();
    getCallUI()?.classList.add('hidden');
    hideIncomingUI();
    showToast('📵 Call ended');
  }

  function cleanupPeer(peerId) {
    const p = peers[peerId];
    if (!p) return;
    try { p.pc.close(); } catch(e) {}
    if (p.audio) { p.audio.srcObject = null; p.audio.remove(); }
    delete peers[peerId];
  }

  /* ── Mute ──────────────────────────────────────────── */
  function toggleMute() {
    if (!localStream) return;
    isMuted = !isMuted;
    localStream.getAudioTracks().forEach(t => { t.enabled = !isMuted; });
    const btn = document.getElementById('vc-mute');
    if (btn) btn.textContent = isMuted ? '🔇' : '🎙️';
  }

  /* ── Timer ─────────────────────────────────────────── */
  function startTimer() {
    timerStart = Date.now();
    timerInterval = setInterval(() => {
      const el = document.getElementById('vc-timer');
      if (!el) return;
      const s = Math.floor((Date.now() - timerStart) / 1000);
      el.textContent = `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
    }, 1000);
  }
  function stopTimer() { clearInterval(timerInterval); timerInterval = null; }

  /* ── Call UI ───────────────────────────────────────── */
  function getCallUI() { return document.getElementById('voice-call-ui'); }

  function showCallUI(label) {
    injectCallUI();
    const ui = getCallUI();
    ui.classList.remove('hidden');
    const nm = document.getElementById('vc-room-name');
    if (nm) nm.textContent = label;
    renderParticipants();
    startTimer();
  }

  function injectCallUI() {
    if (document.getElementById('voice-call-ui')) return;
    const ui = document.createElement('div');
    ui.id = 'voice-call-ui';
    ui.className = 'voice-call-ui hidden';
    ui.innerHTML = `
      <div class="vc-header">
        <span class="vc-status">🔴</span>
        <span class="vc-room-name" id="vc-room-name"></span>
        <span class="vc-timer" id="vc-timer">0:00</span>
      </div>
      <div class="vc-participants" id="vc-participants"></div>
      <div class="vc-controls">
        <button class="vc-btn" id="vc-mute" title="Mute" onclick="Voice.toggleMute()">🎙️</button>
        <button class="vc-btn vc-end" title="End" onclick="Voice.endCall()">📵</button>
      </div>`;
    document.body.appendChild(ui);
  }

  function injectIncomingUI() {
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
        <button class="ic-btn ic-accept" title="Accept" onclick="Voice.acceptCall()">📞</button>
        <button class="ic-btn ic-decline" title="Decline" onclick="Voice.declineCall()">📵</button>
      </div>`;
    document.body.appendChild(ui);
  }

  function showIncomingUI() {
    injectIncomingUI();
    const nameEl = document.getElementById('ic-caller-name');
    const avEl   = document.getElementById('ic-avatar');
    if (nameEl) nameEl.textContent = pendingInvite.callerName;
    if (avEl)   avEl.textContent   = (pendingInvite.callerName||'?').slice(0,2).toUpperCase();
    document.getElementById('incoming-call-ui')?.classList.remove('hidden');
  }
  function hideIncomingUI() {
    document.getElementById('incoming-call-ui')?.classList.add('hidden');
  }

  /* ── Participants ───────────────────────────────────── */
  const participantMap = new Map(); // id → name
  function addParticipantUI(uid, name, isSelf) {
    participantMap.set(uid, { name, isSelf });
    renderParticipants();
  }
  function removeParticipantUI(uid) {
    participantMap.delete(uid);
    renderParticipants();
  }
  function renderParticipants() {
    const el = document.getElementById('vc-participants');
    if (!el) return;
    el.innerHTML = '';
    participantMap.forEach(({ name, isSelf }, uid) => {
      const div = document.createElement('div');
      div.className = 'vc-participant';
      div.id = `vcp-${uid}`;
      div.innerHTML = `<div class="vc-p-avatar">${(name||'?').slice(0,2).toUpperCase()}</div>
        <div class="vc-p-name">${isSelf?'You':name}</div>
        <div class="vc-p-indicator" id="vci-${uid}">${isSelf?(isMuted?'🔇':'🎙️'):'⏳'}</div>`;
      el.appendChild(div);
    });
  }
  function updateParticipantIcon(uid, icon) {
    const el = document.getElementById(`vci-${uid}`);
    if (el) el.textContent = icon;
  }

  function showToast(msg) { if (window.showToast) window.showToast(msg); }

  /* ════════════════════════════════════════════════════
     VOICE NOTES
  ════════════════════════════════════════════════════ */
  let mediaRecorder    = null;
  let voiceChunks      = [];
  let voiceTimer       = null;
  let voiceSeconds     = 0;
  let isRecording      = false;

  async function startVoiceNote() {
    if (!myId()) { showToast('❌ Sign in to send voice notes'); return; }
    if (isRecording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/webm;codecs=opus','audio/webm','audio/ogg'].find(t => MediaRecorder.isTypeSupported(t)) || '';
      mediaRecorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      voiceChunks = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) voiceChunks.push(e.data); };
      mediaRecorder.onstop = uploadVoiceNote;
      mediaRecorder.start();
      isRecording = true;
      voiceSeconds = 0;
      voiceTimer = setInterval(() => {
        voiceSeconds++;
        const btn = document.getElementById('voice-note-btn');
        if (btn) btn.title = `Recording ${voiceSeconds}s — click to stop`;
        if (voiceSeconds >= 120) stopVoiceNote();
      }, 1000);
      const btn = document.getElementById('voice-note-btn');
      if (btn) { btn.textContent = '⏹️'; btn.classList.add('recording'); }
      showToast('🎤 Recording… tap 🎤 to stop');
    } catch(e) { showToast('❌ Microphone access denied'); }
  }

  function stopVoiceNote() {
    if (!isRecording || !mediaRecorder) return;
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(t => t.stop());
    clearInterval(voiceTimer);
    isRecording = false;
    const btn = document.getElementById('voice-note-btn');
    if (btn) { btn.textContent = '🎤'; btn.classList.remove('recording'); }
  }

  async function uploadVoiceNote() {
    const sb = getSb();
    const uid = myId();
    if (!sb || !uid) { showToast('❌ Not signed in'); return; }
    const ext = (mediaRecorder?.mimeType||'').includes('ogg') ? 'ogg' : 'webm';
    const blob = new Blob(voiceChunks, { type: mediaRecorder?.mimeType || 'audio/webm' });
    if (blob.size < 500) { showToast('Voice note too short'); return; }
    showToast('⏫ Uploading…');
    const path = `voice-notes/${uid}/${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('chat-attachments').upload(path, blob, { contentType: blob.type });
    if (error) { showToast('❌ Upload failed: ' + error.message); return; }
    const { data: urlData } = sb.storage.from('chat-attachments').getPublicUrl(path);
    const url = urlData?.publicUrl;
    if (url && window.sendVoiceNoteMessage) window.sendVoiceNoteMessage(url, voiceSeconds);
  }

  function toggleVoiceNote() {
    if (isRecording) stopVoiceNote(); else startVoiceNote();
  }

  /* ── Init ──────────────────────────────────────────── */
  function setupInbox() {
    const sb = getSb();
    const uid = myId();
    if (!sb || !uid) return;
    if (inboxChan) return; // already set up
    inboxChan = sb.channel(`voice-inbox:${uid}`, { config: { broadcast: { self: false } } });
    inboxChan.on('broadcast', { event: 'sig' }, ({ payload: p }) => {
      if (p.to !== uid) return;
      handleSignal(p.from, p.type, p.data);
    }).subscribe();
  }

  function init() {
    injectCallUI();
    injectIncomingUI();
    const btn = document.getElementById('voice-note-btn');
    if (btn) btn.onclick = toggleVoiceNote;
    if (myId()) setupInbox();
    window.addEventListener('voice-auth-ready', setupInbox, { once: true });
  }

  /* ── Public API ────────────────────────────────────── */
  return {
    init,
    startCall,
    startGroupCall,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    toggleVoiceNote,
    isInCall: () => isInCall,
  };

})();

// Auto-init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.Voice.init(), { once: true });
} else {
  window.Voice.init();
}
