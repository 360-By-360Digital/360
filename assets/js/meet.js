/* ════════════════════════════════════════════════════════
   360Meet v3 — sign-in required, optional passcode, prepare
   room, Zoom-style call chamber, profile-picture avatars,
   and host-approved screen sharing for non-host participants.
   Requires: supabaseClient + getGravatarUrl (globals from main.js)
════════════════════════════════════════════════════════ */

window.Meet = (function () {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];
  const ADMIT_TIMEOUT_MS = 9000;
  const SCREEN_REQUEST_TIMEOUT_MS = 20000;

  const ICONS = {
    mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    micOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2"/><path d="M19 10v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
    video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>',
    videoOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/><path d="M9.5 5H14a2 2 0 0 1 2 2v4.5"/><polygon points="23 7 16 12 23 17 23 7"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
    screen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    hangup: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 9c-2.3 0-4.5.36-6.6 1.03a1.5 1.5 0 0 0-1 1.6l.34 2.5a1.5 1.5 0 0 0 1.2 1.27c1.1.2 2.2.36 3.06.36.66 0 1.2-.44 1.37-1.06l.3-1.1a1 1 0 0 1 1.1-.73c.66.1 1.34.13 2.23.13.9 0 1.57-.03 2.23-.13a1 1 0 0 1 1.1.73l.3 1.1c.17.62.71 1.06 1.37 1.06.87 0 1.96-.16 3.06-.36a1.5 1.5 0 0 0 1.2-1.27l.34-2.5a1.5 1.5 0 0 0-1-1.6A20.6 20.6 0 0 0 12 9z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    join: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>'
  };

  const $ = s => document.querySelector(s);
  const myPeerId = crypto.randomUUID();

  /* ── Session state ─────────────────────────────────── */
  let user = null;           // { id, username, avatarUrl }
  let roomCode = null;
  let passcode = '';
  let isHost = false;
  let mode = 'video';
  let localStream = null;
  let screenStream = null;
  let micOn = true;
  let camOn = true;
  let inCall = false;
  let channel = null;
  let admitTimer = null;
  let screenRequestTimer = null;
  let pendingJoin = null;    // { settled, passcode }
  let callStartTime = null;
  let timerInterval = null;
  let mediaLock = Promise.resolve(); // serializes getUserMedia calls
  const peers = {};          // peerId -> { pc, stream, name, avatarUrl, isHost, video, audio, screenSharing, tile }
  let localScreenSharing = false;

  /* ── Helpers ───────────────────────────────────────── */
  function getSb() {
    // main.js declares `const supabaseClient = ...` at the top level of a
    // classic script — const/let don't attach to `window`, but they ARE
    // visible as a plain global identifier to every later classic script
    // on the page (shared global scope), so reference it directly.
    if (typeof supabaseClient !== 'undefined' && supabaseClient) return supabaseClient;
    if (window.supabaseClient) return window.supabaseClient;
    return null;
  }

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
    el._t = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function initials(name) { return (name || '?').trim().slice(0, 2).toUpperCase(); }

  function avatarHtml(name, url) {
    return url
      ? `<img class="avatar-img" src="${url}" alt="${escapeHtml(name || '')}" onerror="this.remove()" />`
      : escapeHtml(initials(name));
  }

  function genRoomCode() {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < 3; i++) out += chars[Math.floor(Math.random() * chars.length)];
    out += '-';
    for (let i = 0; i < 3; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  function mediaErrorMessage(e) {
    switch (e && e.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'Camera/microphone permission was blocked. Check the site permissions in your browser (the padlock icon in the address bar) and allow camera and microphone access.';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return 'No camera or microphone was found on this device.';
      case 'NotReadableError':
        return 'Your camera or microphone is already in use by another app or browser tab. Close it and try again.';
      default:
        if (!window.isSecureContext) {
          return 'Camera/microphone access requires a secure (https) connection.';
        }
        return 'Could not access your camera/microphone' + (e && e.message ? ': ' + e.message : '.');
    }
  }

  /* ── Screens ───────────────────────────────────────── */
  function showScreen(name) {
    ['meet-gate', 'meet-action-select', 'meet-prepare-screen'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = id === name ? '' : 'none';
    });
  }

  /* ── Auth gate ─────────────────────────────────────── */
  async function init() {
    const sb = getSb();
    if (!sb) {
      console.error('360Meet: supabaseClient not found — check that main.js loaded before meet.js.');
      renderGate(false);
      showScreen('meet-gate');
      return;
    }
    const { data: { session } } = await sb.auth.getSession();
    if (!session || !session.user) {
      renderGate(false);
      showScreen('meet-gate');
      return;
    }

    let username = session.user.user_metadata?.username
      || session.user.user_metadata?.full_name
      || session.user.email?.split('@')[0]
      || 'User';
    let avatarUrl = session.user.user_metadata?.avatar_url || null;

    try {
      const { data: profile } = await sb.from('profiles').select('username, avatar_url').eq('id', session.user.id).maybeSingle();
      if (profile?.username) username = profile.username;
      if (profile?.avatar_url) avatarUrl = profile.avatar_url;
    } catch (e) {}

    if (!avatarUrl) {
      try {
        if (typeof getGravatarUrl === 'function') {
          const gUrl = await getGravatarUrl(session.user.email || '', 120);
          const probe = await fetch(gUrl, { method: 'HEAD' });
          if (probe.ok) avatarUrl = gUrl;
        }
      } catch (e) {}
    }

    user = { id: session.user.id, username, avatarUrl };

    renderActionSelect();
    showScreen('meet-action-select');

    const params = new URLSearchParams(location.search);
    const roomParam = params.get('room');
    if (roomParam) openPrepare('join', roomParam.toUpperCase());
  }

  function renderGate(signedIn) {
    const el = $('#meet-gate');
    if (!el || signedIn) return;
    el.innerHTML = `
      <div class="meet-action-icon">${ICONS.lock}</div>
      <h2 class="meet-title" style="margin:0;">Sign in required</h2>
      <p>You need a 360 account to start or join a meeting. Meeting participants are always shown by their account username and profile picture.</p>
      <button class="meet-btn" id="meet-gate-signin" style="max-width:220px;">Sign in</button>
    `;
    $('#meet-gate-signin').onclick = () => window.openAuth ? window.openAuth('signin') : (location.href = 'signin.html');
  }

  function renderActionSelect() {
    const el = $('#meet-action-select');
    if (!el) return;
    el.innerHTML = `
      <h2 class="meet-title">360Meet</h2>
      <p class="meet-subtitle">Start a video call, start a voice chat, or join an existing meeting.</p>
      <div class="meet-action-grid">
        <div class="meet-card meet-action-card" id="meet-card-video">
          <div class="meet-action-icon">${ICONS.video}</div>
          <div class="meet-action-title">New video call</div>
          <div class="meet-action-desc">Start a meeting with your camera. Set an optional passcode.</div>
        </div>
        <div class="meet-card meet-action-card" id="meet-card-voice">
          <div class="meet-action-icon">${ICONS.mic}</div>
          <div class="meet-action-title">New voice chat</div>
          <div class="meet-action-desc">Audio-only meeting. Lighter weight, same passcode option.</div>
        </div>
        <div class="meet-card meet-action-card" id="meet-card-join">
          <div class="meet-action-icon">${ICONS.join}</div>
          <div class="meet-action-title">Join meeting</div>
          <div class="meet-action-desc">Enter a meeting code (and passcode, if the host set one).</div>
        </div>
      </div>
      <div class="meet-signed-in-as">
        <div class="avatar-circle" style="width:22px;height:22px;font-size:9px;display:inline-flex;vertical-align:middle;margin-right:6px;overflow:hidden;">${avatarHtml(user.username, user.avatarUrl)}</div>
        Signed in as <strong>${escapeHtml(user.username)}</strong>
      </div>
    `;
    $('#meet-card-video').onclick = () => openPrepare('host-video');
    $('#meet-card-voice').onclick = () => openPrepare('host-voice');
    $('#meet-card-join').onclick = () => openPrepare('join');
  }

  /* ── Prepare room ──────────────────────────────────── */
  let prepareAction = null;
  let previewCamOn = true;
  let previewMicOn = true;

  async function openPrepare(action, prefillCode) {
    prepareAction = action;
    mode = action === 'host-voice' ? 'voice' : 'video';
    previewCamOn = mode === 'video';
    previewMicOn = true;
    showScreen('meet-prepare-screen');
    renderPrepare(prefillCode || '');
    await refreshPreview();
  }

  function renderPrepare(prefillCode) {
    const el = $('#meet-prepare-screen');
    const isJoin = prepareAction === 'join';
    el.innerHTML = `
      <button class="meet-back-link" id="meet-back-btn">${ICONS.back} Back</button>
      <h2 class="meet-title" style="margin-bottom:2px;">${isJoin ? 'Join meeting' : (mode === 'video' ? 'Start video call' : 'Start voice chat')}</h2>
      <p class="meet-subtitle">Check your camera and microphone before ${isJoin ? 'joining' : 'starting'}.</p>
      <div class="meet-prepare">
        <div class="meet-card">
          <div class="meet-preview" id="meet-preview">
            <video id="meet-preview-video" autoplay playsinline muted style="display:none;"></video>
            <div class="meet-preview-off" id="meet-preview-off">
              <div class="avatar-circle" style="width:60px;height:60px;font-size:20px;overflow:hidden;">${avatarHtml(user.username, user.avatarUrl)}</div>
              <span>Camera is off</span>
            </div>
            <div class="meet-preview-controls">
              <button class="meet-mini-btn" id="meet-preview-mic" title="Toggle microphone">${ICONS.mic}</button>
              ${mode === 'video' ? `<button class="meet-mini-btn" id="meet-preview-cam" title="Toggle camera">${ICONS.video}</button>` : ''}
            </div>
          </div>
        </div>
        <div class="meet-card">
          <div class="meet-card-body">
            <div class="meet-field-label">Joining as</div>
            <div class="meet-identity-row">
              <div class="avatar-circle" style="width:30px;height:30px;font-size:12px;overflow:hidden;">${avatarHtml(user.username, user.avatarUrl)}</div>
              <div>
                <div class="meet-identity-name">${escapeHtml(user.username)}</div>
                <div class="meet-identity-sub">Your account username</div>
              </div>
            </div>

            ${isJoin ? `
              <div class="meet-field-label">Meeting code</div>
              <input class="meet-input" id="meet-code-input" placeholder="e.g. AB3-XY9" style="text-transform:uppercase;" value="${escapeHtml(prefillCode)}" />
              <div class="meet-field-label">Passcode (if required)</div>
              <input class="meet-input" id="meet-passcode-input" placeholder="Leave blank if none" />
              <button class="meet-btn" id="meet-primary-btn">Join meeting</button>
            ` : `
              <div class="meet-field-label">Passcode (optional)</div>
              <input class="meet-input" id="meet-passcode-input" placeholder="Leave blank for no passcode" />
              <button class="meet-btn" id="meet-primary-btn">Start meeting</button>
            `}
            <div class="meet-error" id="meet-error"></div>
            <div class="meet-status-line" id="meet-status-line"><span class="meet-spinner"></span><span id="meet-status-text"></span></div>
          </div>
        </div>
      </div>
    `;

    $('#meet-back-btn').onclick = () => { stopPreview(); showScreen('meet-action-select'); };
    $('#meet-preview-mic').onclick = () => {
      previewMicOn = !previewMicOn;
      $('#meet-preview-mic').classList.toggle('off', !previewMicOn);
      $('#meet-preview-mic').innerHTML = previewMicOn ? ICONS.mic : ICONS.micOff;
      if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = previewMicOn);
    };
    const camBtn = $('#meet-preview-cam');
    if (camBtn) {
      camBtn.onclick = () => {
        previewCamOn = !previewCamOn;
        camBtn.classList.toggle('off', !previewCamOn);
        camBtn.innerHTML = previewCamOn ? ICONS.video : ICONS.videoOff;
        refreshPreview();
      };
    }
    $('#meet-primary-btn').onclick = isJoin ? handleJoinSubmit : handleHostSubmit;
  }

  async function refreshPreview() {
    if (mode === 'video' && previewCamOn) {
      await startPreview(true);
    } else {
      await startPreview(false);
      const v = $('#meet-preview-video');
      const off = $('#meet-preview-off');
      if (v) v.style.display = 'none';
      if (off) off.style.display = 'flex';
    }
  }

  // getUserMedia calls are serialized through mediaLock so a rapid
  // toggle (or the auto-run on screen open) never overlaps two calls —
  // overlapping requests are a common real-world cause of NotReadableError
  // even when OS/browser permission is already granted.
  function startPreview(withVideo) {
    mediaLock = mediaLock.then(() => doStartPreview(withVideo)).catch(() => {});
    return mediaLock;
  }

  async function doStartPreview(withVideo) {
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const msg = mediaErrorMessage({});
      showError(msg);
      toast(msg);
      return null;
    }

    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: withVideo ? { width: 640, height: 400 } : false,
        audio: true
      });
    } catch (e) {
      const msg = mediaErrorMessage(e);
      showError(msg);
      toast(msg);
      localStream = null;
      return null;
    }

    showError('');
    localStream.getAudioTracks().forEach(t => t.enabled = previewMicOn);
    const v = $('#meet-preview-video');
    if (v && withVideo) {
      v.srcObject = localStream;
      v.style.display = 'block';
      const off = $('#meet-preview-off');
      if (off) off.style.display = 'none';
      v.play().catch(() => {});
    }
    return localStream;
  }

  function stopPreview() {
    if (localStream && !inCall) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  }

  function showError(msg) {
    const el = $('#meet-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.toggle('show', !!msg);
  }
  function showStatus(msg) {
    const line = $('#meet-status-line');
    const text = $('#meet-status-text');
    if (!line) return;
    if (msg) { text.textContent = msg; line.classList.add('show'); }
    else line.classList.remove('show');
  }
  function setPrimaryBusy(busy) {
    const btn = $('#meet-primary-btn');
    if (btn) btn.disabled = busy;
  }

  /* ── Unified channel setup ─────────────────────────────
     Built and fully wired with .on() handlers BEFORE calling
     .subscribe(), for both host and joiner. Registering presence
     config only after the channel already exists — or adding .on()
     bindings only after SUBSCRIBED — is what caused the previous
     "both sides can't see each other" bug: the joiner's channel
     was created without a presence key and its handlers were
     attached only after admission, so its presence track() never
     produced a reliable join/sync event on the host's side.
  ==================================================== */
  function buildChannel() {
    const sb = getSb();
    channel = sb.channel(`meet:${roomCode}`, {
      config: { broadcast: { self: false }, presence: { key: myPeerId } }
    });

    channel.on('broadcast', { event: 'join-request' }, ({ payload }) => {
      if (!isHost) return; // only the host admits people
      const approved = !passcode || payload.passcode === passcode;
      channel.send({
        type: 'broadcast', event: 'join-response',
        payload: { to: payload.from, approved, reason: approved ? null : 'passcode' }
      });
    });

    channel.on('broadcast', { event: 'join-response' }, ({ payload }) => {
      if (payload.to === myPeerId) handleJoinResponse(payload);
    });

    channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
      if (payload.to === myPeerId) handleSignal(payload.from, payload.type, payload.data);
    });

    channel.on('broadcast', { event: 'meta' }, ({ payload }) => {
      if (peers[payload.from]) Object.assign(peers[payload.from], payload.data);
      renderStage();
    });

    // Screen-share permission handshake (non-host asks the host).
    channel.on('broadcast', { event: 'screen-request' }, ({ payload }) => {
      if (!isHost) return;
      showScreenRequestModal(payload.from, payload.name);
    });
    channel.on('broadcast', { event: 'screen-response' }, ({ payload }) => {
      if (payload.to !== myPeerId) return;
      handleScreenResponse(payload.approved);
    });

    channel.on('presence', { event: 'sync' }, () => evaluatePresence());
    channel.on('presence', { event: 'join' }, () => evaluatePresence());
    channel.on('presence', { event: 'leave' }, ({ key }) => removePeer(key));

    return channel;
  }

  function trackPresence() {
    channel.track({
      name: user.username,
      avatarUrl: user.avatarUrl,
      isHost,
      video: mode === 'video' && camOn,
      audio: micOn,
      screenSharing: false
    });
  }

  /* ── Host: start meeting ───────────────────────────── */
  async function handleHostSubmit() {
    showError('');
    if (!localStream) { showError('Camera/microphone access is required.'); return; }
    roomCode = genRoomCode();
    passcode = ($('#meet-passcode-input')?.value || '').trim();
    isHost = true;
    micOn = previewMicOn;
    camOn = previewCamOn;
    buildChannel();
    channel.subscribe(status => { if (status === 'SUBSCRIBED') { enterCallRoom(); trackPresence(); } });
  }

  /* ── Joiner: request admission ─────────────────────── */
  async function handleJoinSubmit() {
    showError('');
    const code = ($('#meet-code-input')?.value || '').trim().toUpperCase();
    const enteredPasscode = ($('#meet-passcode-input')?.value || '').trim();
    if (!code) { showError('Enter a meeting code.'); return; }
    if (!localStream) { showError('Camera/microphone access is required.'); return; }

    roomCode = code;
    isHost = false;
    micOn = previewMicOn;
    camOn = previewCamOn;

    setPrimaryBusy(true);
    showStatus('Waiting for the host to admit you...');

    pendingJoin = { settled: false, passcode: enteredPasscode };
    buildChannel();
    channel.subscribe(status => {
      if (status === 'SUBSCRIBED') {
        channel.send({
          type: 'broadcast', event: 'join-request',
          payload: { from: myPeerId, name: user.username, passcode: enteredPasscode }
        });
        admitTimer = setTimeout(() => {
          if (!pendingJoin || pendingJoin.settled) return;
          pendingJoin.settled = true;
          setPrimaryBusy(false);
          showStatus('');
          showError('No response from the host. The meeting may not have started, or the code is wrong.');
          getSb().removeChannel(channel);
          channel = null;
        }, ADMIT_TIMEOUT_MS);
      }
    });
  }

  function handleJoinResponse(payload) {
    if (!pendingJoin || pendingJoin.settled) return;
    pendingJoin.settled = true;
    clearTimeout(admitTimer);
    if (payload.approved) {
      showStatus('');
      setPrimaryBusy(false);
      passcode = pendingJoin.passcode;
      enterCallRoom();
      trackPresence();
    } else {
      setPrimaryBusy(false);
      showStatus('');
      showError(payload.reason === 'passcode' ? 'Incorrect passcode.' : 'Unable to join this meeting.');
      getSb().removeChannel(channel);
      channel = null;
    }
  }

  function sendSignal(toId, type, data) {
    channel?.send({ type: 'broadcast', event: 'signal', payload: { from: myPeerId, to: toId, type, data } });
  }
  function broadcastMeta() {
    channel?.send({ type: 'broadcast', event: 'meta', payload: { from: myPeerId, data: { video: mode === 'video' && camOn, audio: micOn, screenSharing: localScreenSharing } } });
  }

  function evaluatePresence() {
    if (!channel) return;
    const state = channel.presenceState();
    Object.keys(state).forEach(key => {
      if (key === myPeerId) return;
      const meta = state[key][0] || {};
      if (!peers[key]) {
        const initiator = myPeerId > key;
        createPeerConnection(key, meta, initiator);
      } else {
        Object.assign(peers[key], meta);
      }
    });
    // Drop peers that disappeared from presence but never fired 'leave'.
    Object.keys(peers).forEach(key => { if (!state[key]) removePeer(key); });
    renderStage();
    updateParticipantCount();
  }

  /* ── WebRTC mesh ───────────────────────────────────── */
  function createPeerConnection(peerId, meta, initiator) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers[peerId] = {
      pc, stream: null,
      name: meta.name || 'Guest',
      avatarUrl: meta.avatarUrl || null,
      isHost: !!meta.isHost,
      video: !!meta.video,
      audio: meta.audio !== false,
      screenSharing: !!meta.screenSharing,
      tile: null
    };

    if (localStream) localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    pc.onicecandidate = ({ candidate }) => { if (candidate) sendSignal(peerId, 'ice', candidate); };

    pc.ontrack = (e) => {
      peers[peerId].stream = e.streams[0];
      renderStage();
    };

    pc.onconnectionstatechange = () => {
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) {
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
    return pc;
  }

  async function handleSignal(fromId, type, payload) {
    if (type === 'offer') {
      if (!peers[fromId]) createPeerConnection(fromId, {}, false);
      const pc = peers[fromId].pc;
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
    }
  }

  function removePeer(peerId) {
    const entry = peers[peerId];
    if (!entry) return;
    try { entry.pc.close(); } catch (e) {}
    delete peers[peerId];
    renderStage();
    updateParticipantCount();
  }

  /* ── Call room ─────────────────────────────────────── */
  function enterCallRoom() {
    inCall = true;
    document.getElementById('meet-action-select').style.display = 'none';
    document.getElementById('meet-prepare-screen').style.display = 'none';
    document.getElementById('meet-gate').style.display = 'none';
    const room = $('#meet-call-room');
    room.classList.add('active');
    $('#meet-call-room-code-label').textContent = roomCode;
    $('#meet-lock-icon').style.display = passcode ? '' : 'none';

    const micBtn = $('#meet-mic-btn');
    micBtn.classList.toggle('off', !micOn);
    micBtn.innerHTML = micOn ? ICONS.mic : ICONS.micOff;

    const camBtn = $('#meet-cam-btn');
    if (mode === 'video') {
      camBtn.style.display = '';
      camBtn.classList.toggle('off', !camOn);
      camBtn.innerHTML = camOn ? ICONS.video : ICONS.videoOff;
    } else {
      camBtn.style.display = 'none';
    }

    renderStage();
    updateParticipantCount();
    startTimer();
    window.addEventListener('beforeunload', leaveCall);
  }

  function currentHostId() {
    if (isHost) return myPeerId;
    const found = Object.keys(peers).find(k => peers[k].isHost);
    return found || null;
  }
  function currentSharerId() {
    if (localScreenSharing) return myPeerId;
    return Object.keys(peers).find(k => peers[k].screenSharing) || null;
  }

  function tileHtml(opts) {
    const { key, name, avatarUrl, host, isLocal, hasVideoTrack, mic, size, screen } = opts;
    const cls = ['meet-tile', size === 'main' ? 'meet-tile-main' : 'meet-tile-side', isLocal ? 'local' : '', screen ? 'screen' : ''].filter(Boolean).join(' ');
    return `
      <div class="${cls}" id="meet-tile-${key}">
        <video autoplay playsinline ${isLocal && !screen ? 'muted' : ''}></video>
        <div class="meet-tile-avatar" style="display:${hasVideoTrack ? 'none' : 'flex'}"><div class="avatar-circle">${avatarHtml(name, avatarUrl)}</div></div>
        <div class="meet-tile-label">${escapeHtml(name)}${host ? '<span class="host-badge">Host</span>' : ''}</div>
        ${!mic ? `<div class="meet-mic-off-badge">${ICONS.micOff}</div>` : ''}
      </div>`;
  }

  function renderStage() {
    if (!inCall) return;
    const main = $('#meet-stage-main');
    const side = $('#meet-stage-side');
    const hostId = currentHostId();
    const sharerId = currentSharerId();
    const otherKeys = Object.keys(peers);

    if (sharerId) {
      const sharerName = sharerId === myPeerId ? user.username : peers[sharerId].name;
      main.innerHTML = tileHtml({ key: 'share-' + sharerId, name: sharerName, avatarUrl: null, host: sharerId === hostId, isLocal: sharerId === myPeerId, hasVideoTrack: true, mic: true, size: 'main', screen: true });
      const mainVideo = main.querySelector('video');
      mainVideo.srcObject = sharerId === myPeerId ? screenStream : peers[sharerId].stream;

      let sideHtml = '';
      const hostIsLocal = hostId === myPeerId;
      const hostName = hostIsLocal ? user.username : (peers[hostId]?.name || 'Host');
      const hostAvatar = hostIsLocal ? user.avatarUrl : (peers[hostId]?.avatarUrl || null);
      const hostHasVideo = hostIsLocal ? (mode === 'video' && camOn) : !!peers[hostId]?.video;
      const hostMic = hostIsLocal ? micOn : (peers[hostId]?.audio !== false);
      if (hostId) sideHtml += tileHtml({ key: 'side-' + hostId, name: hostName, avatarUrl: hostAvatar, host: true, isLocal: hostIsLocal, hasVideoTrack: hostHasVideo, mic: hostMic, size: 'side' });

      otherKeys.filter(k => k !== hostId).forEach(k => {
        const p = peers[k];
        sideHtml += tileHtml({ key: 'side-' + k, name: p.name, avatarUrl: p.avatarUrl, host: false, isLocal: false, hasVideoTrack: !!p.video, mic: p.audio !== false, size: 'side' });
      });
      if (!isHost && hostId !== myPeerId) {
        sideHtml += tileHtml({ key: 'side-' + myPeerId, name: user.username, avatarUrl: user.avatarUrl, host: false, isLocal: true, hasVideoTrack: mode === 'video' && camOn, mic: micOn, size: 'side' });
      }
      side.innerHTML = sideHtml || `<div class="meet-side-empty">No other participants yet</div>`;
    } else {
      const hostIsLocal = hostId === myPeerId;
      const hostName = hostIsLocal ? user.username : (peers[hostId]?.name || 'Host');
      const hostAvatar = hostIsLocal ? user.avatarUrl : (peers[hostId]?.avatarUrl || null);
      const hostHasVideo = hostIsLocal ? (mode === 'video' && camOn) : !!peers[hostId]?.video;
      const hostMic = hostIsLocal ? micOn : (peers[hostId]?.audio !== false);
      main.innerHTML = hostId ? tileHtml({ key: hostId, name: hostName, avatarUrl: hostAvatar, host: true, isLocal: hostIsLocal, hasVideoTrack: hostHasVideo, mic: hostMic, size: 'main' }) : '';
      const mainVideo = main.querySelector('video');
      if (mainVideo) mainVideo.srcObject = hostIsLocal ? localStream : peers[hostId]?.stream || null;

      let sideHtml = '';
      otherKeys.filter(k => k !== hostId).forEach(k => {
        const p = peers[k];
        sideHtml += tileHtml({ key: k, name: p.name, avatarUrl: p.avatarUrl, host: false, isLocal: false, hasVideoTrack: !!p.video, mic: p.audio !== false, size: 'side' });
      });
      if (!isHost) {
        sideHtml += tileHtml({ key: myPeerId, name: user.username, avatarUrl: user.avatarUrl, host: false, isLocal: true, hasVideoTrack: mode === 'video' && camOn, mic: micOn, size: 'side' });
      }
      side.innerHTML = sideHtml || `<div class="meet-side-empty">No other participants yet</div>`;
    }

    otherKeys.forEach(k => {
      const p = peers[k];
      const vids = document.querySelectorAll(`[id$="-${k}"] video, #meet-tile-${k} video`);
      vids.forEach(v => { if (p.stream && v.srcObject !== p.stream) v.srcObject = p.stream; });
    });
    const localVids = document.querySelectorAll(`[id$="-${myPeerId}"] video, #meet-tile-${myPeerId} video`);
    localVids.forEach(v => { if (localStream && v.srcObject !== localStream && !v.closest('.screen')) v.srcObject = localStream; });
  }

  function updateParticipantCount() {
    const el = $('#meet-participant-count-label');
    if (el) el.textContent = String(Object.keys(peers).length + 1);
  }

  function startTimer() {
    callStartTime = Date.now();
    timerInterval = setInterval(() => {
      const s = Math.floor((Date.now() - callStartTime) / 1000);
      const el = $('#meet-call-timer');
      if (el) el.textContent = `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
    }, 1000);
  }
  function stopTimer() { clearInterval(timerInterval); timerInterval = null; }

  /* ── Controls ──────────────────────────────────────── */
  function toggleMic() {
    if (!localStream) return;
    micOn = !micOn;
    localStream.getAudioTracks().forEach(t => t.enabled = micOn);
    const btn = $('#meet-mic-btn');
    btn.classList.toggle('off', !micOn);
    btn.innerHTML = micOn ? ICONS.mic : ICONS.micOff;
    broadcastMeta();
  }

  function toggleCam() {
    if (mode !== 'video') return;
    camOn = !camOn;
    if (localStream) localStream.getVideoTracks().forEach(t => t.enabled = camOn);
    const btn = $('#meet-cam-btn');
    btn.classList.toggle('off', !camOn);
    btn.innerHTML = camOn ? ICONS.video : ICONS.videoOff;
    broadcastMeta();
    renderStage();
  }

  /* ── Screen sharing (host: instant; participant: ask first) ── */
  function toggleScreenShare() {
    if (localScreenSharing) { stopScreenShare(); return; }
    if (currentSharerId()) { toast('Someone else is already sharing their screen.'); return; }
    if (isHost) {
      startScreenShare();
    } else {
      requestScreenShare();
    }
  }

  async function startScreenShare() {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch (e) { return; }
    localScreenSharing = true;
    const screenTrack = screenStream.getVideoTracks()[0];
    Object.values(peers).forEach(({ pc }) => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) sender.replaceTrack(screenTrack);
      else if (localStream) pc.addTrack(screenTrack, localStream);
    });
    $('#meet-screen-btn').classList.add('active-toggle');
    broadcastMeta();
    renderStage();
    screenTrack.onended = () => stopScreenShare();
  }

  function stopScreenShare() {
    screenStream?.getTracks().forEach(t => t.stop());
    screenStream = null;
    localScreenSharing = false;
    const camTrack = localStream?.getVideoTracks()[0];
    Object.values(peers).forEach(({ pc }) => {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender && camTrack) sender.replaceTrack(camTrack);
    });
    $('#meet-screen-btn').classList.remove('active-toggle');
    broadcastMeta();
    renderStage();
  }

  function requestScreenShare() {
    const hostId = currentHostId();
    if (!hostId || hostId === myPeerId) { startScreenShare(); return; }
    toast('Asking the host for permission to share your screen...');
    channel?.send({ type: 'broadcast', event: 'screen-request', payload: { from: myPeerId, name: user.username } });
    clearTimeout(screenRequestTimer);
    screenRequestTimer = setTimeout(() => toast('The host did not respond to your screen share request.'), SCREEN_REQUEST_TIMEOUT_MS);
  }

  function handleScreenResponse(approved) {
    clearTimeout(screenRequestTimer);
    if (approved) { toast('Screen sharing approved.'); startScreenShare(); }
    else toast('The host denied your screen share request.');
  }

  /* Custom in-page popup shown to the host when someone asks to share. */
  function showScreenRequestModal(fromId, name) {
    const overlay = document.getElementById('meet-screen-modal');
    if (!overlay) return;
    document.getElementById('meet-screen-modal-name').textContent = name || 'A participant';
    overlay.classList.add('show');

    let resolved = false;
    const timer = setTimeout(() => { finish(false); }, SCREEN_REQUEST_TIMEOUT_MS);

    function finish(approved) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      overlay.classList.remove('show');
      channel?.send({ type: 'broadcast', event: 'screen-response', payload: { to: fromId, approved } });
      allowBtn.onclick = null;
      denyBtn.onclick = null;
    }

    const allowBtn = document.getElementById('meet-screen-allow-btn');
    const denyBtn = document.getElementById('meet-screen-deny-btn');
    allowBtn.onclick = () => finish(true);
    denyBtn.onclick = () => finish(false);
  }

  function copyInviteLink() {
    const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(roomCode)}`;
    navigator.clipboard?.writeText(url).then(() => toast('Invite link copied')).catch(() => toast(url));
  }

  function leaveCall() {
    if (!inCall) return;
    inCall = false;
    stopTimer();
    Object.keys(peers).forEach(removePeer);
    if (channel) { getSb().removeChannel(channel); channel = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    localScreenSharing = false;
    $('#meet-call-room').classList.remove('active');
    window.removeEventListener('beforeunload', leaveCall);
    toast('You left the meeting');
    renderActionSelect();
    showScreen('meet-action-select');
  }

  /* ── Public API ────────────────────────────────────── */
  return {
    init,
    stopPreview,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    copyInviteLink,
    leaveCall
  };
})();
