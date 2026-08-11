/* ════════════════════════════════════════════════════════
   360Meet v1.0 — WebRTC video/voice meetings + "leave page"
   floating mini window (Document Picture-in-Picture, like Zoom).
   Requires: supabaseClient (global from main.js)
════════════════════════════════════════════════════════ */

window.Meet = (function () {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];

  const RECENTS_KEY = '360_meet_recent_rooms';

  /* ── State ─────────────────────────────────────────── */
  const myPeerId = crypto.randomUUID();
  let myName = '';
  let roomCode = null;
  let mode = 'video'; // 'video' | 'voice'
  let localStream = null;
  let screenStream = null;
  let micOn = true;
  let camOn = true;
  let inCall = false;
  let channel = null;
  let callStartTime = null;
  let timerInterval = null;
  const peers = {}; // peerId -> { pc, stream, name, tile }

  function getSb() { return window.supabaseClient; }
  const $ = s => document.querySelector(s);

  /* ── Toast ─────────────────────────────────────────── */
  function toast(msg) {
    let el = document.getElementById('meet-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'meet-toast';
      el.className = 'meet-toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove('show'), 2200);
  }

  /* ── Recents ───────────────────────────────────────── */
  function saveRecent(code) {
    let list = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
    list = list.filter(r => r.code !== code);
    list.unshift({ code, ts: Date.now() });
    list = list.slice(0, 5);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list));
  }
  function getRecents() {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
  }

  function genRoomCode() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 3; i++) out += chars[Math.floor(Math.random() * chars.length)];
    out += '-';
    for (let i = 0; i < 3; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  /* ── Local media / lobby preview ──────────────────── */
  async function startPreview(withVideo) {
    stopPreview();
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: withVideo ? { width: 640, height: 400 } : false,
        audio: true
      });
    } catch (e) {
      toast('⚠️ Could not access camera/mic: ' + e.message);
      localStream = null;
      return null;
    }
    const v = $('#meet-preview-video');
    if (v && withVideo) { v.srcObject = localStream; v.play().catch(() => {}); }
    updatePreviewUI();
    return localStream;
  }

  function stopPreview() {
    if (localStream && !inCall) {
      localStream.getTracks().forEach(t => t.stop());
      localStream = null;
    }
  }

  function updatePreviewUI() {
    const off = $('#meet-preview-off');
    const vidEl = $('#meet-preview-video');
    const hasVideo = mode === 'video' && localStream && localStream.getVideoTracks().some(t => t.enabled);
    if (off) off.style.display = hasVideo ? 'none' : 'flex';
    if (vidEl) vidEl.style.display = hasVideo ? 'block' : 'none';
  }

  /* ── Signaling ─────────────────────────────────────── */
  function getChannel() {
    if (channel) return channel;
    const sb = getSb();
    channel = sb.channel(`meet:${roomCode}`, {
      config: { broadcast: { self: false }, presence: { key: myPeerId } }
    });
    channel
      .on('broadcast', { event: 'signal' }, ({ payload }) => {
        if (payload.to !== myPeerId) return;
        handleSignal(payload.from, payload.type, payload.data, payload.name);
      })
      .on('presence', { event: 'sync' }, () => evaluatePresence())
      .on('presence', { event: 'join' }, () => evaluatePresence())
      .on('presence', { event: 'leave' }, ({ key }) => removePeer(key));
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        channel.track({ name: myName, video: mode === 'video' && camOn, audio: micOn });
      }
    });
    return channel;
  }

  function sendSignal(toId, type, data) {
    if (!channel) return;
    channel.send({ type: 'broadcast', event: 'signal', payload: { from: myPeerId, to: toId, type, data, name: myName } });
  }

  function evaluatePresence() {
    const state = channel.presenceState();
    Object.keys(state).forEach(key => {
      if (key === myPeerId) return;
      const meta = state[key][0] || {};
      if (!peers[key]) {
        // Deterministic glare-free rule: higher id initiates the offer.
        if (myPeerId > key) createPeerConnection(key, meta.name, true);
        else createPeerConnection(key, meta.name, false); // wait for their offer
      }
    });
    updateParticipantCount();
  }

  /* ── WebRTC mesh ───────────────────────────────────── */
  function createPeerConnection(peerId, name, initiator) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers[peerId] = { pc, stream: null, name: name || 'Guest', tile: null };
    ensureTile(peerId, name);

    if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    pc.onicecandidate = ({ candidate }) => { if (candidate) sendSignal(peerId, 'ice', candidate); };

    pc.ontrack = (e) => {
      peers[peerId].stream = e.streams[0];
      const tile = ensureTile(peerId, peers[peerId].name);
      const v = tile.querySelector('video');
      if (v.srcObject !== e.streams[0]) v.srcObject = e.streams[0];
      tile.querySelector('.meet-tile-avatar')?.remove();
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
        // give a brief grace period for reconnection before tearing down
        setTimeout(() => {
          if (peers[peerId] && peers[peerId].pc.connectionState !== 'connected') removePeer(peerId);
        }, 4000);
      }
    };

    if (initiator) {
      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal(peerId, 'offer', pc.localDescription);
        } catch (e) { console.error('Meet offer error', e); }
      };
    }

    updateParticipantCount();
    return pc;
  }

  async function handleSignal(fromId, type, payload, name) {
    if (type === 'offer') {
      let entry = peers[fromId];
      if (!entry) createPeerConnection(fromId, name, false);
      const pc = peers[fromId].pc;
      if (name) peers[fromId].name = name;
      await pc.setRemoteDescription(new RTCSessionDescription(payload));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal(fromId, 'answer', pc.localDescription);
    } else if (type === 'answer') {
      const entry = peers[fromId];
      if (entry && entry.pc.signalingState !== 'stable') {
        await entry.pc.setRemoteDescription(new RTCSessionDescription(payload));
      }
    } else if (type === 'ice') {
      const entry = peers[fromId];
      if (entry && payload) { try { await entry.pc.addIceCandidate(new RTCIceCandidate(payload)); } catch (e) {} }
    } else if (type === 'mic') {
      updateTileMicBadge(fromId, payload.on);
    }
  }

  function removePeer(peerId) {
    const entry = peers[peerId];
    if (!entry) return;
    try { entry.pc.close(); } catch (e) {}
    entry.tile?.remove();
    delete peers[peerId];
    updateParticipantCount();
  }

  /* ── Grid tiles ────────────────────────────────────── */
  function ensureTile(peerId, name) {
    let tile = document.getElementById(`meet-tile-${peerId}`);
    if (tile) return tile;
    const grid = $('#meet-grid');
    tile = document.createElement('div');
    tile.className = 'meet-tile';
    tile.id = `meet-tile-${peerId}`;
    const initials = (name || 'G').slice(0, 2).toUpperCase();
    tile.innerHTML = `
      <video autoplay playsinline></video>
      <div class="meet-tile-avatar"><div class="avatar-circle">${initials}</div></div>
      <div class="meet-tile-label">${escapeHtml(name || 'Guest')}</div>
    `;
    grid.appendChild(tile);
    if (peers[peerId]) peers[peerId].tile = tile;
    return tile;
  }

  function updateTileMicBadge(peerId, on) {
    const tile = document.getElementById(`meet-tile-${peerId}`);
    if (!tile) return;
    let badge = tile.querySelector('.meet-mic-off-badge');
    if (!on) {
      if (!badge) {
        badge = document.createElement('div');
        badge.className = 'meet-mic-off-badge';
        badge.textContent = '🔇';
        tile.appendChild(badge);
      }
    } else {
      badge?.remove();
    }
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function updateParticipantCount() {
    const el = $('#meet-participant-count');
    if (el) el.textContent = `👥 ${Object.keys(peers).length + 1}`;
  }

  /* ── Timer ─────────────────────────────────────────── */
  function startTimer() {
    callStartTime = Date.now();
    timerInterval = setInterval(() => {
      const s = Math.floor((Date.now() - callStartTime) / 1000);
      const el = $('#meet-call-timer');
      if (el) el.textContent = `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
    }, 1000);
  }
  function stopTimer() { clearInterval(timerInterval); timerInterval = null; }

  /* ── Join / Leave ──────────────────────────────────── */
  async function joinCall(code, name, wantsVideo) {
    roomCode = code.toUpperCase();
    myName = (name || 'Guest').slice(0, 30);
    mode = wantsVideo ? 'video' : 'voice';

    if (!localStream || (wantsVideo && localStream.getVideoTracks().length === 0)) {
      await startPreview(wantsVideo);
    }
    if (!localStream) { toast('⚠️ Need camera/mic access to join'); return; }

    inCall = true;
    saveRecent(roomCode);

    $('#meet-lobby').style.display = 'none';
    const room = $('#meet-call-room');
    room.classList.add('active');
    $('#meet-call-room-code-label').textContent = roomCode;

    const localTile = ensureLocalTile();
    localTile.querySelector('video').srcObject = localStream;

    getChannel();
    startTimer();
    updateParticipantCount();
    setupLeavePageWatcher();
    window.addEventListener('beforeunload', leaveCall);
  }

  function ensureLocalTile() {
    let tile = document.getElementById('meet-tile-local');
    if (tile) return tile;
    const grid = $('#meet-grid');
    tile = document.createElement('div');
    tile.className = 'meet-tile local';
    tile.id = 'meet-tile-local';
    tile.innerHTML = `
      <video autoplay playsinline muted></video>
      <div class="meet-tile-avatar" id="meet-local-avatar" style="display:none"><div class="avatar-circle">${(myName || 'Y').slice(0,2).toUpperCase()}</div></div>
      <div class="meet-tile-label">You</div>
    `;
    grid.prepend(tile);
    return tile;
  }

  function leaveCall() {
    if (!inCall) return;
    inCall = false;
    stopTimer();
    Object.keys(peers).forEach(removePeer);
    if (channel) { getSb().removeChannel(channel); channel = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    closeAnyPip();
    $('#meet-call-room').classList.remove('active');
    $('#meet-lobby').style.display = '';
    $('#meet-grid').innerHTML = '';
    window.removeEventListener('beforeunload', leaveCall);
    toast('📵 Left the meeting');
  }

  /* ── Controls ──────────────────────────────────────── */
  function toggleMic() {
    if (!localStream) return;
    micOn = !micOn;
    localStream.getAudioTracks().forEach(t => t.enabled = micOn);
    const btn = $('#meet-mic-btn');
    btn?.classList.toggle('off', !micOn);
    if (btn) btn.textContent = micOn ? '🎙️' : '🔇';
    channel?.send({ type: 'broadcast', event: 'signal', payload: { from: myPeerId, to: '*', type: 'mic', data: { on: micOn } } });
    Object.keys(peers).forEach(pid => sendSignal(pid, 'mic', { on: micOn }));
  }

  async function toggleCam() {
    if (mode !== 'video') return;
    camOn = !camOn;
    if (localStream) localStream.getVideoTracks().forEach(t => t.enabled = camOn);
    const btn = $('#meet-cam-btn');
    btn?.classList.toggle('off', !camOn);
    if (btn) btn.textContent = camOn ? '📹' : '📷';
    const avatar = $('#meet-local-avatar');
    if (avatar) avatar.style.display = camOn ? 'none' : 'flex';
  }

  async function toggleScreenShare() {
    const btn = $('#meet-screen-btn');
    if (screenStream) {
      screenStream.getTracks().forEach(t => t.stop());
      screenStream = null;
      const camTrack = localStream?.getVideoTracks()[0];
      Object.values(peers).forEach(({ pc }) => {
        const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
        if (sender && camTrack) sender.replaceTrack(camTrack);
      });
      const localVideo = document.querySelector('#meet-tile-local video');
      if (localVideo && camTrack) localVideo.srcObject = localStream;
      btn?.classList.remove('active-toggle');
      return;
    }
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch (e) { return; }
    const screenTrack = screenStream.getVideoTracks()[0];
    Object.values(peers).forEach(({ pc }) => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(screenTrack);
      else if (localStream) pc.addTrack(screenTrack, localStream);
    });
    const localVideo = document.querySelector('#meet-tile-local video');
    if (localVideo) localVideo.srcObject = screenStream;
    btn?.classList.add('active-toggle');
    screenTrack.onended = () => toggleScreenShare();
  }

  function copyInviteLink() {
    const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(roomCode)}`;
    navigator.clipboard?.writeText(url).then(() => toast('🔗 Invite link copied')).catch(() => toast(url));
  }

  /* ── "Leave the page" floating window (like Zoom) ────
     Primary path: Document Picture-in-Picture (Chrome/Edge 116+)
     — a real always-on-top OS-level window, bottom-right by
     default, that survives switching tabs/apps.
     Fallback: native <video> Picture-in-Picture on the most
     relevant video element (works in Safari/Firefox too), which
     also floats bottom-right in every major browser.
     ==================================================== */
  let pipWindow = null;
  let pipReturnParent = null;
  let fallbackPipEl = null;

  function setupLeavePageWatcher() {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  async function onVisibilityChange() {
    if (!inCall) return;
    if (document.hidden) {
      await openLeaveWindow();
    } else {
      closeAnyPip();
    }
  }

  function pickFeaturedVideo() {
    // Prefer the first connected remote video; fall back to local.
    const remote = Object.values(peers).find(p => p.stream);
    if (remote) return document.querySelector(`#meet-tile-${Object.keys(peers).find(k => peers[k] === remote)} video`);
    return document.querySelector('#meet-tile-local video');
  }

  async function openLeaveWindow() {
    if (pipWindow || fallbackPipEl) return;

    if ('documentPictureInPicture' in window) {
      try {
        pipWindow = await window.documentPictureInPicture.requestWindow({ width: 300, height: 200 });
        const style = pipWindow.document.createElement('style');
        style.textContent = `
          body { margin:0; background:#05070d; font-family:sans-serif; overflow:hidden; }
          .pip-grid { display:flex; flex-wrap:wrap; gap:4px; padding:4px; box-sizing:border-box; }
          video { width:100%; border-radius:8px; background:#11141d; object-fit:cover; }
          .pip-bar { position:fixed; bottom:0; left:0; right:0; display:flex; justify-content:center; gap:8px; padding:6px; background:rgba(0,0,0,.35); }
          .pip-bar button { width:34px; height:34px; border-radius:50%; border:none; cursor:pointer; background:rgba(255,255,255,.15); color:#fff; font-size:15px; }
          .pip-bar button.leave { background:#ef4444; }
          .pip-label { position:fixed; top:4px; left:8px; color:#cfd4e0; font-size:10px; }
        `;
        pipWindow.document.head.appendChild(style);

        const container = pipWindow.document.createElement('div');
        container.className = 'pip-grid';
        pipWindow.document.body.appendChild(container);

        const label = pipWindow.document.createElement('div');
        label.className = 'pip-label';
        label.textContent = `360Meet · ${roomCode}`;
        pipWindow.document.body.appendChild(label);

        // Move the real <video> elements (up to 4) into the PiP window —
        // same-origin documentPictureInPicture shares the JS realm, so
        // moving nodes keeps their live srcObject intact.
        pipReturnParent = [];
        const allVideos = [
          document.querySelector('#meet-tile-local video'),
          ...Object.keys(peers).map(k => document.querySelector(`#meet-tile-${k} video`))
        ].filter(Boolean).slice(0, 4);
        allVideos.forEach(v => {
          pipReturnParent.push([v, v.parentElement, v.nextSibling]);
          container.appendChild(v);
        });

        const bar = pipWindow.document.createElement('div');
        bar.className = 'pip-bar';
        bar.innerHTML = `<button id="pip-mic">${micOn ? '🎙️' : '🔇'}</button><button class="leave" id="pip-leave">📵</button>`;
        pipWindow.document.body.appendChild(bar);
        bar.querySelector('#pip-mic').onclick = () => { toggleMic(); bar.querySelector('#pip-mic').textContent = micOn ? '🎙️' : '🔇'; };
        bar.querySelector('#pip-leave').onclick = () => { leaveCall(); };

        pipWindow.addEventListener('pagehide', () => { restoreFromPip(); });
      } catch (e) {
        pipWindow = null;
        openFallbackPip();
      }
    } else {
      openFallbackPip();
    }
  }

  function restoreFromPip() {
    if (pipReturnParent) {
      pipReturnParent.forEach(([v, parent, next]) => {
        if (parent) parent.insertBefore(v, next || null);
      });
      pipReturnParent = null;
    }
    pipWindow = null;
  }

  function openFallbackPip() {
    const video = pickFeaturedVideo();
    if (!video || !video.requestPictureInPicture) return;
    video.requestPictureInPicture().then(() => {
      fallbackPipEl = video;
      video.addEventListener('leavepictureinpicture', () => { fallbackPipEl = null; }, { once: true });
    }).catch(() => {});
  }

  function closeAnyPip() {
    if (pipWindow) { try { pipWindow.close(); } catch (e) {} restoreFromPip(); }
    if (fallbackPipEl && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
    fallbackPipEl = null;
  }

  /* ── Public API ────────────────────────────────────── */
  return {
    myPeerId,
    genRoomCode,
    getRecents,
    startPreview,
    stopPreview,
    updatePreviewUI,
    joinCall,
    leaveCall,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    copyInviteLink,
    setMode: (m) => { mode = m; },
    getMode: () => mode,
    isInCall: () => inCall
  };
})();
