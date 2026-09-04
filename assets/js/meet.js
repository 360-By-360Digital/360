/* ════════════════════════════════════════════════════════
   360Meet v3 — sign-in required, optional passcode, prepare
   room, Zoom-style call chamber, profile-picture avatars,
   and host-approved screen sharing for non-host participants.
   Requires: supabaseClient + getGravatarUrl (globals from main.js)
════════════════════════════════════════════════════════ */

window.Meet = (function () {
  const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
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
    join: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    fullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>',
    exitFullscreen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>'
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
  let allowedScreenViewers = null; // Set of peerIds permitted to actually see the current share
  const audioMeters = {}; // key -> { ctx, analyser, source, bars, rafId }
  let blackTrack = null; // reusable 1-frame black video track sent to non-permitted screen-share viewers
  let micLocked = false;     // true on non-host clients when the host has locked mics off
  let camLocked = false;     // true on non-host clients when the host has locked cameras off
  let hostMicLocked = false; // host's own toggle state for the "Mute all" bulk control
  let hostCamLocked = false; // host's own toggle state for the "Cameras off" bulk control

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
  let pendingKnownSharerId = null;   // learned from join-response, applied once that peer connects
  let pendingKnownSharerName = null;

  async function openPrepare(action, prefillCode) {
    prepareAction = action;
    if (action === 'join') {
      // Joining now happens in two steps: first the meeting code +
      // passcode (validated against the host, which also tells us the
      // meeting's real mode), THEN the camera/mic prepare screen — so a
      // voice meeting and a video meeting can be told apart from the
      // very start instead of guessing and correcting afterward.
      openJoinCodeStep(prefillCode);
      return;
    }
    mode = action === 'host-voice' ? 'voice' : 'video';
    previewCamOn = mode === 'video';
    previewMicOn = true;
    showScreen('meet-prepare-screen');
    renderPrepare();
    await refreshPreview();
  }

  /* ── Step 1 of joining: meeting code + passcode only ─── */
  function openJoinCodeStep(prefillCode) {
    showScreen('meet-prepare-screen');
    renderJoinCodeStep(prefillCode || '');
  }

  function renderJoinCodeStep(prefillCode) {
    const el = $('#meet-prepare-screen');
    el.innerHTML = `
      <button class="meet-back-link" id="meet-back-btn">${ICONS.back} Back</button>
      <h2 class="meet-title" style="margin-bottom:2px;">Join meeting</h2>
      <p class="meet-subtitle">Enter the meeting code to continue.</p>
      <div class="meet-card" style="max-width:420px;">
        <div class="meet-card-body">
          <div class="meet-field-label">Meeting code</div>
          <input class="meet-input" id="meet-code-input" placeholder="e.g. AB3-XY9" style="text-transform:uppercase;" value="${escapeHtml(prefillCode)}" />
          <div class="meet-field-label">Passcode (if required)</div>
          <input class="meet-input" id="meet-passcode-input" placeholder="Leave blank if none" />
          <button class="meet-btn" id="meet-code-continue-btn">Continue</button>
          <div class="meet-error" id="meet-error"></div>
          <div class="meet-status-line" id="meet-status-line"><span class="meet-spinner"></span><span id="meet-status-text"></span></div>
        </div>
      </div>
    `;
    $('#meet-back-btn').onclick = () => showScreen('meet-action-select');
    $('#meet-code-continue-btn').onclick = handleJoinCodeContinue;
  }

  function setJoinCodeBusy(busy) {
    const btn = $('#meet-code-continue-btn');
    if (btn) btn.disabled = busy;
  }

  function renderPrepare() {
    const el = $('#meet-prepare-screen');
    const isJoin = prepareAction === 'join';
    const camAvailable = mode === 'video' && !camLocked;
    el.innerHTML = `
      <button class="meet-back-link" id="meet-back-btn">${ICONS.back} Back</button>
      <h2 class="meet-title" style="margin-bottom:2px;">${isJoin ? 'Ready to join?' : (mode === 'video' ? 'Start video call' : 'Start voice chat')}</h2>
      <p class="meet-subtitle">Check your camera and microphone before ${isJoin ? 'joining' : 'starting'}.</p>
      <div class="meet-prepare">
        <div class="meet-card">
          <div class="meet-preview" id="meet-preview">
            <video id="meet-preview-video" autoplay playsinline muted style="display:none;"></video>
            <div class="meet-preview-off" id="meet-preview-off">
              <div class="avatar-circle" style="width:60px;height:60px;font-size:20px;overflow:hidden;">${avatarHtml(user.username, user.avatarUrl)}</div>
              <span>${mode === 'video' && camLocked ? 'Camera is locked off by the host' : 'Camera is off'}</span>
            </div>
            <div class="meet-preview-controls">
              <button class="meet-mini-btn${micLocked ? ' off' : ''}" id="meet-preview-mic" title="${micLocked ? 'Locked by the host' : 'Toggle microphone'}" ${micLocked ? 'disabled' : ''}>${micLocked ? ICONS.micOff : ICONS.mic}</button>
              ${mode === 'video' ? `<button class="meet-mini-btn${camAvailable ? '' : ' off'}" id="meet-preview-cam" title="${camLocked ? 'Locked by the host' : 'Toggle camera'}" ${camLocked ? 'disabled' : ''}>${camAvailable ? ICONS.video : ICONS.videoOff}</button>` : ''}
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
              ${micLocked ? `<p class="meet-error show" style="color:var(--mut);">The host has muted microphones for everyone right now.</p>` : ''}
              ${camLocked && mode === 'video' ? `<p class="meet-error show" style="color:var(--mut);">The host has turned cameras off for everyone right now.</p>` : ''}
              ${pendingKnownSharerName ? `<p class="meet-error show" style="color:var(--mut);">${escapeHtml(pendingKnownSharerName)} is currently sharing their screen.</p>` : ''}
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

    $('#meet-back-btn').onclick = () => {
      stopPreview();
      if (isJoin) {
        // Abandon this admission attempt cleanly rather than leaving a
        // subscribed-but-unused channel behind.
        if (channel && !inCall) { getSb().removeChannel(channel); channel = null; }
        openJoinCodeStep(roomCode || '');
      } else {
        showScreen('meet-action-select');
      }
    };
    if (!micLocked) {
      $('#meet-preview-mic').onclick = () => {
        previewMicOn = !previewMicOn;
        $('#meet-preview-mic').classList.toggle('off', !previewMicOn);
        $('#meet-preview-mic').innerHTML = previewMicOn ? ICONS.mic : ICONS.micOff;
        if (localStream) localStream.getAudioTracks().forEach(t => t.enabled = previewMicOn);
      };
    }
    const camBtn = $('#meet-preview-cam');
    if (camBtn && !camLocked) {
      camBtn.onclick = () => {
        previewCamOn = !previewCamOn;
        camBtn.classList.toggle('off', !previewCamOn);
        camBtn.innerHTML = previewCamOn ? ICONS.video : ICONS.videoOff;
        refreshPreview();
      };
    }
    $('#meet-primary-btn').onclick = isJoin ? handleJoinFinalize : handleHostSubmit;
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
      const sharerId = currentSharerId();
      channel.send({
        type: 'broadcast', event: 'join-response',
        payload: {
          to: payload.from, approved, reason: approved ? null : 'passcode',
          mode, micLocked: hostMicLocked, camLocked: hostCamLocked,
          screenSharer: sharerId,
          screenSharerName: sharerId ? (sharerId === myPeerId ? user.username : (peers[sharerId]?.name || null)) : null
        }
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

    // Screen-share permission handshake (everyone asks the host, even
    // the host asking for itself is routed through the same request path).
    channel.on('broadcast', { event: 'screen-request' }, ({ payload }) => {
      if (!isHost) return;
      showScreenRequestModal(payload.from, payload.name);
    });
    channel.on('broadcast', { event: 'screen-response' }, ({ payload }) => {
      if (payload.to !== myPeerId) return;
      handleScreenResponse(payload.approved);
    });
    channel.on('broadcast', { event: 'screen-viewers' }, ({ payload }) => {
      if (peers[payload.sharer]) peers[payload.sharer].screenSharing = true;
    });
    // Host immediately force-stops a share (takeover) — no confirmation.
    channel.on('broadcast', { event: 'screen-force-stop' }, ({ payload }) => {
      if (payload.to !== myPeerId) return;
      if (localScreenSharing) { stopScreenShare(); toast('The host took over screen sharing.'); }
    });
    // Host politely asks the current sharer to stop — sharer decides.
    channel.on('broadcast', { event: 'screen-stop-request' }, ({ payload }) => {
      if (payload.to !== myPeerId) return;
      if (localScreenSharing) showAskStopModal();
    });

    // In-call chat.
    channel.on('broadcast', { event: 'chat' }, ({ payload }) => {
      appendChatMessage(payload, false);
    });

    // Host bulk controls — locking prevents participants from turning
    // their mic/camera back on until the host explicitly unlocks it.
    channel.on('broadcast', { event: 'force-mute' }, ({ payload }) => {
      if (isHost) return;
      micLocked = !!payload.lock;
      updateLockedButtonUI('#meet-mic-btn', micLocked);
      if (micLocked) {
        if (micOn) setMicEnabled(false);
        toast('The host muted everyone and locked the microphone.');
      } else {
        toast('The host unlocked the microphone — you can unmute yourself.');
      }
    });
    channel.on('broadcast', { event: 'force-camera-off' }, ({ payload }) => {
      if (isHost) return;
      camLocked = !!payload.lock;
      updateLockedButtonUI('#meet-cam-btn', camLocked);
      if (camLocked) {
        if (mode === 'video' && camOn) setCamEnabled(false);
        toast('The host turned off everyone\u2019s camera and locked it.');
      } else {
        toast('The host unlocked cameras — you can turn yours back on.');
      }
    });

    // Host ended the meeting — everyone else is kicked back to the lobby.
    channel.on('broadcast', { event: 'meeting-ended' }, () => {
      if (isHost) return;
      toast('The host ended the meeting.');
      leaveCall(true);
    });

    // Host removed a single participant.
    channel.on('broadcast', { event: 'kick' }, ({ payload }) => {
      if (payload.to !== myPeerId) return;
      toast('You were removed from the meeting by the host.');
      leaveCall(true);
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
    setPrimaryBusy(true);
    roomCode = genRoomCode();
    passcode = ($('#meet-passcode-input')?.value || '').trim();
    isHost = true;
    micOn = previewMicOn;
    camOn = previewCamOn;
    buildChannel();
    channel.subscribe(status => { if (status === 'SUBSCRIBED') { enterCallRoom(); trackPresence(); } });
  }

  /* ── Joiner step 1: submit code + passcode, wait for admission ── */
  async function handleJoinCodeContinue() {
    showError('');
    const code = ($('#meet-code-input')?.value || '').trim().toUpperCase();
    const enteredPasscode = ($('#meet-passcode-input')?.value || '').trim();
    if (!code) { showError('Enter a meeting code.'); return; }

    roomCode = code;
    isHost = false;

    setJoinCodeBusy(true);
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
          setJoinCodeBusy(false);
          showStatus('');
          showError('No response from the host. The meeting may not have started, or the code is wrong.');
          getSb().removeChannel(channel);
          channel = null;
        }, ADMIT_TIMEOUT_MS);
      }
    });
  }

  // Host has approved admission — we now know the meeting's real mode,
  // current mic/camera lock state, and whether anyone is already
  // screen-sharing, all BEFORE ever touching the camera/mic. Step 2 (the
  // camera/mic prepare screen) is rendered accordingly.
  async function handleJoinResponse(payload) {
    if (!pendingJoin || pendingJoin.settled) return;
    pendingJoin.settled = true;
    clearTimeout(admitTimer);
    if (payload.approved) {
      showStatus('');
      setJoinCodeBusy(false);
      passcode = pendingJoin.passcode;
      mode = payload.mode === 'video' ? 'video' : 'voice';
      micLocked = !!payload.micLocked;
      camLocked = !!payload.camLocked;
      pendingKnownSharerId = payload.screenSharer || null;
      pendingKnownSharerName = payload.screenSharerName || null;

      previewCamOn = mode === 'video' && !camLocked;
      previewMicOn = !micLocked;
      showScreen('meet-prepare-screen');
      renderPrepare();
      await refreshPreview();
    } else {
      setJoinCodeBusy(false);
      showStatus('');
      showError(payload.reason === 'passcode' ? 'Incorrect passcode.' : 'Unable to join this meeting.');
      getSb().removeChannel(channel);
      channel = null;
    }
  }

  // Step 2's "Join meeting" button — media is only acquired now, with the
  // already-known mode/locks respected from the start.
  function handleJoinFinalize() {
    showError('');
    if (!localStream) { showError('Camera/microphone access is required.'); return; }
    setPrimaryBusy(true);
    micOn = previewMicOn;
    camOn = previewCamOn;
    enterCallRoom();
    trackPresence();
    if (mode === 'video' && !camOn && !camLocked) acquireCameraIfNeeded();
  }

  // Called after joining a video meeting when the prepare screen didn't
  // already grab a camera (we default 'join' prepare to voice-only until
  // the host confirms the real mode). Attaches the track to each peer's
  // already-reserved camera slot via replaceTrack — no renegotiation
  // needed, and it keeps the camera/screen slot ordering intact (see
  // createPeerConnection).
  async function acquireCameraIfNeeded() {
    if (!localStream || mode !== 'video') return;
    if (localStream.getVideoTracks().length) { camOn = true; return; }
    try {
      const camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 400 } });
      const track = camStream.getVideoTracks()[0];
      localStream.addTrack(track);
      camOn = true;
      Object.values(peers).forEach(p => { p.camTransceiver?.sender.replaceTrack(track); });
      const camBtn = $('#meet-cam-btn');
      if (camBtn) { camBtn.style.display = ''; camBtn.classList.remove('off'); camBtn.innerHTML = ICONS.video; }
      broadcastMeta();
      renderStage();
    } catch (e) {
      // No camera available/granted — stay voice-only for this person,
      // camera button remains hidden.
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
      if (!peers[key]) {
        const meta = state[key][0] || {};
        createPeerConnection(key, meta);
      }
      // Existing peers' live video/audio/screenSharing flags are kept
      // current via the 'meta' broadcast, not this (stale) presence
      // snapshot — re-applying presence data here on every sync/join
      // would stomp on more recent updates. This was the root cause of
      // camera visibility, mute-state, and screen-share-stage bugs: any
      // time someone else joined or left, everyone's tracked video/audio/
      // screenSharing flags silently reverted to their values from the
      // moment they first connected.
    });
    // Drop peers that disappeared from presence but never fired 'leave'.
    Object.keys(peers).forEach(key => { if (!state[key]) removePeer(key); });
    renderStage();
    updateParticipantCount();
  }

  /* ── WebRTC mesh (perfect negotiation) ──────────────────
     Every connection has onnegotiationneeded live on BOTH sides —
     needed so a track can be added/replaced mid-call (camera
     acquired after joining a video meeting, screen share swapping
     tracks) from either side and still renegotiate correctly.
     Initial-offer / mid-call glare is resolved via the standard
     "polite peer" pattern (MDN): the lexicographically smaller
     peer id is polite and yields to an incoming offer; the larger
     id is impolite and ignores a colliding incoming offer, letting
     its own outgoing offer win.
  ==================================================== */
  function createPeerConnection(peerId, meta) {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const polite = myPeerId < peerId;
    peers[peerId] = {
      pc, stream: null, screenStream: null, camTrack: null, audioTrack: null, videoOrdinal: 0,
      name: meta.name || 'Guest',
      avatarUrl: meta.avatarUrl || null,
      isHost: !!meta.isHost,
      video: !!meta.video,
      audio: meta.audio !== false,
      screenSharing: !!meta.screenSharing,
      tile: null,
      polite,
      makingOffer: false,
      ignoreOffer: false,
      iceFailedAt: null,
      camTransceiver: null,
      screenTransceiver: null
    };

    const audioTrack = localStream?.getAudioTracks()[0];
    if (audioTrack) pc.addTrack(audioTrack, localStream);

    // Camera and screen each get their own dedicated, always-present
    // sendonly video slot, reserved up front (with no track attached
    // until needed) and in a FIXED order for every connection — this is
    // what lets the receiving side reliably tell "this is their camera"
    // apart from "this is their screen share" (see ontrack below),
    // regardless of whether the meeting is voice-only, or the camera
    // gets turned on/off or acquired later mid-call.
    const camTransceiver = pc.addTransceiver('video', { direction: 'sendonly' });
    peers[peerId].camTransceiver = camTransceiver;
    const camTrack = localStream?.getVideoTracks()[0];
    if (camTrack) camTransceiver.sender.replaceTrack(camTrack);

    peers[peerId].screenTransceiver = pc.addTransceiver('video', { direction: 'sendonly' });

    // If I know (from my own join-response) that this specific peer is
    // the current screen sharer, mark it immediately rather than waiting
    // for a 'meta'/'screen-viewers' broadcast that might race with this
    // connection being set up — this is the join-time screen-share sync.
    if (pendingKnownSharerId && peerId === pendingKnownSharerId) {
      peers[peerId].screenSharing = true;
      pendingKnownSharerId = null;
      pendingKnownSharerName = null;
    }

    // If I'M the one currently sharing my screen and a new peer just
    // joined, route them into the (fixed, 2-viewer) whitelist the same
    // way the original viewers were chosen — otherwise a late joiner's
    // reserved screen slot would just sit empty/black forever, since
    // computeScreenViewers() only ran once at share-start.
    if (localScreenSharing && screenStream) {
      const screenTrack = screenStream.getVideoTracks()[0];
      if (allowedScreenViewers && allowedScreenViewers.size < 2) {
        allowedScreenViewers.add(peerId);
        peers[peerId].screenTransceiver.sender.replaceTrack(screenTrack);
        channel?.send({ type: 'broadcast', event: 'screen-viewers', payload: { sharer: myPeerId, viewers: [...allowedScreenViewers] } });
      } else {
        peers[peerId].screenTransceiver.sender.replaceTrack(getBlackTrack());
      }
    }

    pc.onicecandidate = ({ candidate }) => { if (candidate) sendSignal(peerId, 'ice', candidate); };

    function rebuildCombinedStream(entry) {
      const tracks = [];
      if (entry.camTrack) tracks.push(entry.camTrack);
      if (entry.audioTrack) tracks.push(entry.audioTrack);
      entry.stream = tracks.length ? new MediaStream(tracks) : null;
    }

    pc.ontrack = (e) => {
      const entry = peers[peerId];
      if (!entry) return;
      if (e.track.kind === 'audio') {
        entry.audioTrack = e.track;
        rebuildCombinedStream(entry);
      } else if (e.track.kind === 'video') {
        entry.videoOrdinal += 1;
        if (entry.videoOrdinal === 1) {
          // The first video m-line negotiated for this connection is
          // always the reserved camera slot (see above) — always
          // present even if empty/muted, so this is reliable in every
          // mode, not just when a camera happens to already be on.
          entry.camTrack = e.track;
          rebuildCombinedStream(entry);
        } else {
          // Anything after that is the reserved screen slot.
          entry.screenStream = e.streams[0] || new MediaStream([e.track]);
        }
      }
      renderStage();
    };

    pc.onnegotiationneeded = async () => {
      const entry = peers[peerId];
      if (!entry) return;
      try {
        entry.makingOffer = true;
        await pc.setLocalDescription();
        sendSignal(peerId, 'offer', pc.localDescription);
      } catch (e) {
        console.error('Meet negotiation error', e);
      } finally {
        entry.makingOffer = false;
      }
    };

    pc.oniceconnectionstatechange = () => {
      const entry = peers[peerId];
      if (!entry) return;
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        entry.iceFailedAt = null;
        return;
      }
      if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
        if (!entry.iceFailedAt) entry.iceFailedAt = Date.now();
        // Try to self-heal with an ICE restart before giving up — this is
        // what fixes most "random disconnects" caused by brief network
        // blips, without needing a TURN server.
        if (pc.iceConnectionState === 'failed' && typeof pc.restartIce === 'function') {
          try { pc.restartIce(); } catch (e) {}
        }
        setTimeout(() => {
          const stillBad = ['failed', 'disconnected', 'closed'].includes(pc.iceConnectionState);
          if (peers[peerId] && stillBad && entry.iceFailedAt && Date.now() - entry.iceFailedAt >= 8000) {
            removePeer(peerId);
          }
        }, 8500);
      }
    };

    return pc;
  }

  async function handleSignal(fromId, type, payload) {
    if (!peers[fromId] && type === 'offer') createPeerConnection(fromId, {});
    const entry = peers[fromId];
    if (!entry) return;
    const pc = entry.pc;

    if (type === 'offer' || type === 'answer') {
      const desc = payload;
      const offerCollision = desc.type === 'offer' && (entry.makingOffer || pc.signalingState !== 'stable');
      entry.ignoreOffer = !entry.polite && offerCollision;
      if (entry.ignoreOffer) return;

      try {
        // A single setRemoteDescription() call is all that's needed here —
        // per spec, receiving a remote offer while in "have-local-offer"
        // performs an IMPLICIT rollback automatically. The previous code
        // instead fired an explicit rollback concurrently alongside this
        // call (racing against this same peer's onnegotiationneeded
        // handler, which was independently awaiting its own
        // setLocalDescription() at the same moment). That race is what
        // caused connections to succeed for some pairs and silently corrupt
        // for others — this matches the standard, browser-tested "perfect
        // negotiation" pattern instead of a custom (and broken) variant.
        await pc.setRemoteDescription(desc);
        if (desc.type === 'offer') {
          await pc.setLocalDescription();
          sendSignal(fromId, 'answer', pc.localDescription);
        }
      } catch (e) { console.error('Meet signal error', e); }
    } else if (type === 'ice') {
      try { await pc.addIceCandidate(new RTCIceCandidate(payload)); }
      catch (e) { if (!entry.ignoreOffer) console.error('Meet ICE error', e); }
    }
  }

  function removePeer(peerId) {
    const entry = peers[peerId];
    if (!entry) return;
    try { entry.pc.close(); } catch (e) {}
    stopAudioMeter(peerId);
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

    const hostControls = $('#meet-host-controls');
    if (hostControls) hostControls.style.display = isHost ? '' : 'none';

    // Sync the lock state we already learned from the host at admission
    // time (or that a fresh host starts with, which is always unlocked).
    updateLockedButtonUI('#meet-mic-btn', micLocked);
    updateLockedButtonUI('#meet-cam-btn', camLocked);

    renderStage();
    updateParticipantCount();
    startTimer();
    window.addEventListener('beforeunload', onBeforeUnload);
    setupLeaveTabWatcher();
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
    const { key, name, avatarUrl, host, isLocal, hasVideoTrack, mic, size, screen, kickable } = opts;
    const cls = ['meet-tile', size === 'main' ? 'meet-tile-main' : 'meet-tile-side', isLocal ? 'local' : '', screen ? 'screen' : ''].filter(Boolean).join(' ');
    return `
      <div class="${cls}" id="meet-tile-${key}">
        <video autoplay playsinline ${isLocal && !screen ? 'muted' : ''}></video>
        <div class="meet-tile-avatar" style="display:${hasVideoTrack ? 'none' : 'flex'}"><div class="avatar-circle">${avatarHtml(name, avatarUrl)}</div></div>
        <div class="meet-tile-meter" id="meet-meter-${key}"><span></span><span></span><span></span><span></span><span></span></div>
        <div class="meet-tile-actions">
          ${kickable ? `<button class="meet-tile-kick-btn" id="meet-kick-${key}" title="Remove from meeting" type="button">${ICONS.close}</button>` : ''}
          <button class="meet-tile-fullscreen-btn" id="meet-fs-${key}" title="Full screen" type="button">${ICONS.fullscreen}</button>
        </div>
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
    const tileRegistry = []; // { key, audioOwnerId } — for meters + fullscreen wiring below

    if (sharerId) {
      const sharerName = sharerId === myPeerId ? user.username : peers[sharerId].name;
      main.innerHTML = tileHtml({ key: 'share-' + sharerId, name: sharerName, avatarUrl: null, host: sharerId === hostId, isLocal: sharerId === myPeerId, hasVideoTrack: true, mic: true, size: 'main', screen: true, kickable: isHost && sharerId !== myPeerId });
      const mainVideo = main.querySelector('video');
      mainVideo.srcObject = sharerId === myPeerId ? screenStream : (peers[sharerId]?.screenStream || null);
      tileRegistry.push({ key: 'share-' + sharerId, audioOwnerId: sharerId === myPeerId ? 'local' : sharerId, kickPeerId: isHost && sharerId !== myPeerId ? sharerId : null });

      let sideHtml = '';
      const hostIsLocal = hostId === myPeerId;
      const hostName = hostIsLocal ? user.username : (peers[hostId]?.name || 'Host');
      const hostAvatar = hostIsLocal ? user.avatarUrl : (peers[hostId]?.avatarUrl || null);
      const hostHasVideo = hostIsLocal ? (mode === 'video' && camOn) : !!peers[hostId]?.video;
      const hostMic = hostIsLocal ? micOn : (peers[hostId]?.audio !== false);
      if (hostId) {
        sideHtml += tileHtml({ key: 'side-' + hostId, name: hostName, avatarUrl: hostAvatar, host: true, isLocal: hostIsLocal, hasVideoTrack: hostHasVideo, mic: hostMic, size: 'side', kickable: isHost && !hostIsLocal });
        tileRegistry.push({ key: 'side-' + hostId, audioOwnerId: hostIsLocal ? 'local' : hostId, kickPeerId: isHost && !hostIsLocal ? hostId : null });
      }

      otherKeys.filter(k => k !== hostId).forEach(k => {
        const p = peers[k];
        sideHtml += tileHtml({ key: 'side-' + k, name: p.name, avatarUrl: p.avatarUrl, host: false, isLocal: false, hasVideoTrack: !!p.video, mic: p.audio !== false, size: 'side', kickable: isHost });
        tileRegistry.push({ key: 'side-' + k, audioOwnerId: k, kickPeerId: isHost ? k : null });
      });
      if (!isHost && hostId !== myPeerId) {
        sideHtml += tileHtml({ key: 'side-' + myPeerId, name: user.username, avatarUrl: user.avatarUrl, host: false, isLocal: true, hasVideoTrack: mode === 'video' && camOn, mic: micOn, size: 'side' });
        tileRegistry.push({ key: 'side-' + myPeerId, audioOwnerId: 'local', kickPeerId: null });
      }
      side.innerHTML = sideHtml || `<div class="meet-side-empty">No other participants yet</div>`;
    } else {
      const hostIsLocal = hostId === myPeerId;
      const hostName = hostIsLocal ? user.username : (peers[hostId]?.name || 'Host');
      const hostAvatar = hostIsLocal ? user.avatarUrl : (peers[hostId]?.avatarUrl || null);
      const hostHasVideo = hostIsLocal ? (mode === 'video' && camOn) : !!peers[hostId]?.video;
      const hostMic = hostIsLocal ? micOn : (peers[hostId]?.audio !== false);
      main.innerHTML = hostId ? tileHtml({ key: hostId, name: hostName, avatarUrl: hostAvatar, host: true, isLocal: hostIsLocal, hasVideoTrack: hostHasVideo, mic: hostMic, size: 'main', kickable: isHost && !hostIsLocal }) : '';
      const mainVideo = main.querySelector('video');
      if (mainVideo) mainVideo.srcObject = hostIsLocal ? localStream : peers[hostId]?.stream || null;
      if (hostId) tileRegistry.push({ key: hostId, audioOwnerId: hostIsLocal ? 'local' : hostId, kickPeerId: isHost && !hostIsLocal ? hostId : null });

      let sideHtml = '';
      otherKeys.filter(k => k !== hostId).forEach(k => {
        const p = peers[k];
        sideHtml += tileHtml({ key: k, name: p.name, avatarUrl: p.avatarUrl, host: false, isLocal: false, hasVideoTrack: !!p.video, mic: p.audio !== false, size: 'side', kickable: isHost });
        tileRegistry.push({ key: k, audioOwnerId: k, kickPeerId: isHost ? k : null });
      });
      if (!isHost) {
        sideHtml += tileHtml({ key: myPeerId, name: user.username, avatarUrl: user.avatarUrl, host: false, isLocal: true, hasVideoTrack: mode === 'video' && camOn, mic: micOn, size: 'side' });
        tileRegistry.push({ key: myPeerId, audioOwnerId: 'local', kickPeerId: null });
      }
      side.innerHTML = sideHtml || `<div class="meet-side-empty">No other participants yet</div>`;
    }

    otherKeys.forEach(k => {
      const p = peers[k];
      const vids = document.querySelectorAll(`[id$="-${k}"] video, #meet-tile-${k} video`);
      vids.forEach(v => { if (p.stream && v.srcObject !== p.stream && !v.closest('.screen')) v.srcObject = p.stream; });
    });
    const localVids = document.querySelectorAll(`[id$="-${myPeerId}"] video, #meet-tile-${myPeerId} video`);
    localVids.forEach(v => { if (localStream && v.srcObject !== localStream && !v.closest('.screen')) v.srcObject = localStream; });

    wireTileExtras(tileRegistry);
  }

  /* ── Fullscreen (client-side only, per tile) ────────── */
  function wireTileExtras(tileRegistry) {
    tileRegistry.forEach(({ key, audioOwnerId, kickPeerId }) => {
      const btn = document.getElementById(`meet-fs-${key}`);
      const tileEl = document.getElementById(`meet-tile-${key}`);
      if (btn && tileEl) {
        btn.onclick = (e) => { e.stopPropagation(); goFullscreen(tileEl, btn); };
      }
      const kickBtn = document.getElementById(`meet-kick-${key}`);
      if (kickBtn && kickPeerId) {
        kickBtn.onclick = (e) => { e.stopPropagation(); kickParticipant(kickPeerId); };
      }
      startAudioMeter(key, audioOwnerId);
    });
    // Tear down meters for tiles that no longer exist this render.
    Object.keys(audioMeters).forEach(key => {
      if (!tileRegistry.find(t => t.key === key)) stopAudioMeter(key);
    });
  }

  function goFullscreen(tileEl, btn) {
    if (document.fullscreenElement === tileEl) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    tileEl.requestFullscreen?.().then(() => {
      btn.innerHTML = ICONS.exitFullscreen;

      // Cursor shows normally in fullscreen, then auto-hides after 5s of
      // no mouse movement (like a video player), and reappears instantly
      // on the next movement.
      let hideTimer = null;
      const showCursor = () => {
        tileEl.classList.remove('fs-cursor-hidden');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => tileEl.classList.add('fs-cursor-hidden'), 5000);
      };
      tileEl.addEventListener('mousemove', showCursor);
      showCursor();

      const onExit = () => {
        if (document.fullscreenElement !== tileEl) {
          btn.innerHTML = ICONS.fullscreen;
          clearTimeout(hideTimer);
          tileEl.classList.remove('fs-cursor-hidden');
          tileEl.removeEventListener('mousemove', showCursor);
          document.removeEventListener('fullscreenchange', onExit);
        }
      };
      document.addEventListener('fullscreenchange', onExit);
    }).catch(() => {});
  }

  /* ── Voice-activity meter ("ripple" bars, top-left of every tile) ──
     Purely a local visual — reads live audio levels via Web Audio's
     AnalyserNode from whichever MediaStream that tile represents. */
  function startAudioMeter(key, audioOwnerId) {
    const stream = audioOwnerId === 'local' ? localStream : peers[audioOwnerId]?.stream;
    const track = stream?.getAudioTracks?.()[0];
    if (!track) { stopAudioMeter(key); return; }

    let entry = audioMeters[key];
    if (entry && entry.track === track) return; // already wired to this exact track
    stopAudioMeter(key);

    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const source = ctx.createMediaStreamSource(new MediaStream([track]));
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const draw = () => {
        const meterEl = document.getElementById(`meet-meter-${key}`);
        if (!meterEl) { entry.rafId = requestAnimationFrame(draw); return; }
        analyser.getByteFrequencyData(data);
        const bars = meterEl.children;
        const bands = bars.length;
        const step = Math.floor(data.length / bands) || 1;
        for (let i = 0; i < bands; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) sum += data[i * step + j] || 0;
          const avg = sum / step;
          const h = Math.max(2, Math.min(16, (avg / 255) * 16));
          bars[i].style.height = h + 'px';
        }
        entry.rafId = requestAnimationFrame(draw);
      };

      entry = { ctx, analyser, source, track, rafId: null };
      audioMeters[key] = entry;
      draw();
    } catch (e) {
      // Web Audio unavailable/blocked — meter simply won't animate.
    }
  }

  function stopAudioMeter(key) {
    const entry = audioMeters[key];
    if (!entry) return;
    if (entry.rafId) cancelAnimationFrame(entry.rafId);
    try { entry.source.disconnect(); } catch (e) {}
    try { entry.ctx.close(); } catch (e) {}
    delete audioMeters[key];
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
  function updateLockedButtonUI(selector, locked) {
    const btn = $(selector);
    if (!btn) return;
    btn.classList.toggle('locked', locked);
    btn.disabled = locked;
    btn.title = locked ? 'Locked by the host' : (selector === '#meet-mic-btn' ? 'Mute microphone' : 'Turn off camera');
  }

  function setMicEnabled(on) {
    if (!localStream) return;
    if (on && micLocked) { toast('The host has muted the microphone for everyone.'); return; }
    micOn = on;
    localStream.getAudioTracks().forEach(t => t.enabled = micOn);
    const btn = $('#meet-mic-btn');
    if (btn) { btn.classList.toggle('off', !micOn); btn.innerHTML = micOn ? ICONS.mic : ICONS.micOff; }
    broadcastMeta();
  }
  function toggleMic() { setMicEnabled(!micOn); }

  function setCamEnabled(on) {
    if (mode !== 'video') return;
    if (on && camLocked) { toast('The host has turned off cameras for everyone.'); return; }
    camOn = on;
    if (localStream) localStream.getVideoTracks().forEach(t => t.enabled = camOn);
    const btn = $('#meet-cam-btn');
    if (btn) { btn.classList.toggle('off', !camOn); btn.innerHTML = camOn ? ICONS.video : ICONS.videoOff; }
    broadcastMeta();
    renderStage();
  }
  function toggleCam() { setCamEnabled(!camOn); }

  /* ── Host bulk controls (persistent lock: participants can't turn
     their mic/camera back on until the host explicitly unlocks it) ── */
  function hostMuteAll() {
    if (!isHost || !channel) return;
    hostMicLocked = !hostMicLocked;
    channel.send({ type: 'broadcast', event: 'force-mute', payload: { lock: hostMicLocked } });
    const btn = $('#meet-mute-all-btn');
    if (btn) {
      btn.classList.toggle('active-toggle', hostMicLocked);
      const label = btn.querySelector('.meet-host-action-label');
      if (label) label.textContent = hostMicLocked ? 'Unmute all' : 'Mute all';
    }
    toast(hostMicLocked ? 'Muted everyone and locked the microphone.' : 'Microphone unlocked for everyone.');
  }
  function hostCamerasOff() {
    if (!isHost || !channel) return;
    hostCamLocked = !hostCamLocked;
    channel.send({ type: 'broadcast', event: 'force-camera-off', payload: { lock: hostCamLocked } });
    const btn = $('#meet-cameras-off-btn');
    if (btn) {
      btn.classList.toggle('active-toggle', hostCamLocked);
      const label = btn.querySelector('.meet-host-action-label');
      if (label) label.textContent = hostCamLocked ? 'Allow cameras' : 'Cameras off';
    }
    toast(hostCamLocked ? 'Turned off everyone\u2019s camera and locked it.' : 'Cameras unlocked for everyone.');
  }

  /* ── Host: remove a participant ──────────────────────── */
  function kickParticipant(peerId) {
    if (!isHost || !channel || !peers[peerId]) return;
    const name = peers[peerId].name || 'Participant';
    channel.send({ type: 'broadcast', event: 'kick', payload: { to: peerId } });
    removePeer(peerId);
    toast(`Removed ${name} from the meeting.`);
  }

  /* ── Chat ──────────────────────────────────────────── */
  let chatOpen = false;
  let unreadChat = 0;

  function toggleChatPanel() {
    chatOpen = !chatOpen;
    const panel = $('#meet-chat-panel');
    if (panel) panel.classList.toggle('open', chatOpen);
    const btn = $('#meet-chat-btn');
    if (chatOpen) {
      unreadChat = 0;
      const badge = $('#meet-chat-badge');
      if (badge) badge.style.display = 'none';
      btn?.classList.add('active-toggle');
      setTimeout(() => $('#meet-chat-input')?.focus(), 50);
    } else {
      btn?.classList.remove('active-toggle');
    }
  }

  function sendChatMessage(text) {
    text = (text || '').trim();
    if (!text || !channel) return;
    const payload = { from: myPeerId, name: user.username, avatarUrl: user.avatarUrl, text, ts: Date.now() };
    channel.send({ type: 'broadcast', event: 'chat', payload });
    appendChatMessage(payload, true);
  }

  function appendChatMessage(payload, isLocal) {
    const list = $('#meet-chat-messages');
    if (!list) return;
    const time = new Date(payload.ts || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const row = document.createElement('div');
    row.className = 'meet-chat-msg' + (isLocal ? ' own' : '');
    row.innerHTML = `
      <div class="avatar-circle meet-chat-avatar">${avatarHtml(payload.name, payload.avatarUrl)}</div>
      <div class="meet-chat-bubble-wrap">
        <div class="meet-chat-meta"><span class="meet-chat-name">${escapeHtml(payload.name || 'Guest')}</span><span class="meet-chat-time">${time}</span></div>
        <div class="meet-chat-bubble">${escapeHtml(payload.text)}</div>
      </div>`;
    list.appendChild(row);
    list.scrollTop = list.scrollHeight;

    if (!isLocal && !chatOpen) {
      unreadChat++;
      const badge = $('#meet-chat-badge');
      if (badge) { badge.textContent = String(unreadChat); badge.style.display = 'flex'; }
    }
  }

  /* ── Screen sharing ──────────────────────────────────
     Everyone — including the host — must have the host explicitly
     allow a share. Only the sharer plus one other viewer (chosen as
     the host, or if the sharer IS the host, the first other
     participant) ever receive the real screen pixels; everyone else's
     connection is fed a static black frame on the reserved screen
     transceiver, so they see solid black rather than the share. ── */
  function toggleScreenShare() {
    if (localScreenSharing) { stopScreenShare(); return; }
    const currentSharer = currentSharerId();

    if (isHost) {
      if (currentSharer) {
        showTakeoverModal(currentSharer, peers[currentSharer]?.name || 'This participant');
      } else {
        requestScreenShare(); // host still "asks" (itself) — see requestScreenShare
      }
      return;
    }
    requestScreenShare();
  }

  function computeScreenViewers() {
    const hostId = currentHostId();
    let second = null;
    if (hostId && hostId !== myPeerId) second = hostId;
    else second = Object.keys(peers).find(k => k !== myPeerId) || null;
    return second ? [myPeerId, second] : [myPeerId];
  }

  function getBlackTrack() {
    if (blackTrack && blackTrack.readyState === 'live') return blackTrack;
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 2, 2);
    const stream = canvas.captureStream(1);
    blackTrack = stream.getVideoTracks()[0];
    return blackTrack;
  }

  async function startScreenShare() {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch (e) { return; }
    localScreenSharing = true;
    const screenTrack = screenStream.getVideoTracks()[0];
    const viewers = computeScreenViewers();
    allowedScreenViewers = new Set(viewers);

    Object.keys(peers).forEach(pid => {
      const t = peers[pid].screenTransceiver;
      if (!t) return;
      t.sender.replaceTrack(allowedScreenViewers.has(pid) ? screenTrack : getBlackTrack());
    });

    channel?.send({ type: 'broadcast', event: 'screen-viewers', payload: { sharer: myPeerId, viewers } });
    $('#meet-screen-btn').classList.add('active-toggle');
    broadcastMeta();
    renderStage();

    const others = viewers.filter(v => v !== myPeerId);
    const otherName = others.length ? (peers[others[0]]?.name || (others[0] === currentHostId() ? 'the host' : 'them')) : null;
    toast(otherName ? `Sharing your screen — visible to you and ${otherName} only.` : 'Sharing your screen.');

    screenTrack.onended = () => stopScreenShare();
  }

  function stopScreenShare() {
    screenStream?.getTracks().forEach(t => t.stop());
    screenStream = null;
    localScreenSharing = false;
    allowedScreenViewers = null;
    Object.values(peers).forEach(p => { try { p.screenTransceiver?.sender.replaceTrack(null); } catch (e) {} });
    $('#meet-screen-btn').classList.remove('active-toggle');
    broadcastMeta();
    renderStage();
  }

  // Both hosts and participants go through this — a request always
  // reaches the host, who explicitly allows it before anything shares.
  function requestScreenShare() {
    const hostId = currentHostId();
    if (!hostId) return;
    if (hostId === myPeerId) {
      // Host asking themself: confirm-through, no round trip needed.
      startScreenShare();
      return;
    }
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

  /* Popup shown to the HOST when someone asks to share (or when a new
     request comes in while someone is already sharing — allowing it
     force-stops the current sharer first). */
  function showScreenRequestModal(fromId, name) {
    const overlay = document.getElementById('meet-screen-modal');
    if (!overlay) return;
    document.getElementById('meet-screen-modal-name').textContent = name || 'A participant';
    const currentSharer = currentSharerId();
    const noteEl = document.getElementById('meet-screen-modal-note');
    if (noteEl) {
      noteEl.textContent = (currentSharer && currentSharer !== fromId)
        ? `${peers[currentSharer]?.name || 'Someone'} is currently sharing — allowing this will stop their share.`
        : '';
      noteEl.style.display = noteEl.textContent ? '' : 'none';
    }
    overlay.classList.add('show');

    let resolved = false;
    const timer = setTimeout(() => { finish(false); }, SCREEN_REQUEST_TIMEOUT_MS);

    function finish(approved) {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      overlay.classList.remove('show');
      if (approved && currentSharer && currentSharer !== fromId) {
        channel?.send({ type: 'broadcast', event: 'screen-force-stop', payload: { to: currentSharer } });
      }
      channel?.send({ type: 'broadcast', event: 'screen-response', payload: { to: fromId, approved } });
      allowBtn.onclick = null;
      denyBtn.onclick = null;
    }

    const allowBtn = document.getElementById('meet-screen-allow-btn');
    const denyBtn = document.getElementById('meet-screen-deny-btn');
    allowBtn.onclick = () => finish(true);
    denyBtn.onclick = () => finish(false);
  }

  /* Popup shown to the HOST when they try to share while someone else
     already is — "ask them to stop" or force-stop-and-take-over. */
  function showTakeoverModal(currentSharerPeerId, name) {
    const overlay = document.getElementById('meet-takeover-modal');
    if (!overlay) return;
    document.getElementById('meet-takeover-modal-name').textContent = name;
    overlay.classList.add('show');

    const askBtn = document.getElementById('meet-takeover-ask-btn');
    const forceBtn = document.getElementById('meet-takeover-force-btn');
    const cancelBtn = document.getElementById('meet-takeover-cancel-btn');

    function close() {
      overlay.classList.remove('show');
      askBtn.onclick = null; forceBtn.onclick = null; cancelBtn.onclick = null;
    }
    askBtn.onclick = () => {
      channel?.send({ type: 'broadcast', event: 'screen-stop-request', payload: { to: currentSharerPeerId } });
      toast(`Asked ${name} to stop sharing.`);
      close();
    };
    forceBtn.onclick = () => {
      channel?.send({ type: 'broadcast', event: 'screen-force-stop', payload: { to: currentSharerPeerId } });
      toast(`Took over screen sharing from ${name}.`);
      close();
      setTimeout(() => startScreenShare(), 300); // brief pause so their stop propagates first
    };
    cancelBtn.onclick = close;
  }

  /* Popup shown to a sharer when the host politely asks them to stop. */
  function showAskStopModal() {
    const overlay = document.getElementById('meet-ask-stop-modal');
    if (!overlay) return;
    overlay.classList.add('show');
    const stopBtn = document.getElementById('meet-ask-stop-confirm-btn');
    const keepBtn = document.getElementById('meet-ask-stop-keep-btn');
    function close() { overlay.classList.remove('show'); stopBtn.onclick = null; keepBtn.onclick = null; }
    stopBtn.onclick = () => { stopScreenShare(); close(); };
    keepBtn.onclick = close;
  }

  function copyInviteLink() {
    const url = `${location.origin}${location.pathname}?room=${encodeURIComponent(roomCode)}`;
    navigator.clipboard?.writeText(url).then(() => toast('Invite link copied')).catch(() => toast(url));
  }

  /* ── "Left the tab" floating mini window ──────────────
     When the person switches away from this browser tab during a call,
     show a small popup — bottom-right, positioned by the browser itself —
     so they can still keep an eye on the meeting. Uses the real Document
     Picture-in-Picture API where available (Chrome/Edge) for a richer
     mini view with mute/leave buttons; falls back to the standard
     <video> Picture-in-Picture API (Firefox/Safari too), which floats
     just the video, still bottom-right by default in every major
     browser. Returning to the tab closes the popup automatically. */
  let pipWindow = null;
  let pipActive = false;
  let fallbackPipVideoEl = null;

  function setupLeaveTabWatcher() {
    document.addEventListener('visibilitychange', onTabVisibilityChange);
  }
  function teardownLeaveTabWatcher() {
    document.removeEventListener('visibilitychange', onTabVisibilityChange);
    closeLeaveTabPopup();
  }

  function onTabVisibilityChange() {
    if (!inCall) return;
    if (document.hidden) openLeaveTabPopup();
    else closeLeaveTabPopup();
  }

  function pickFeaturedVideo() {
    // Whatever's currently on the main stage (host camera, or the shared
    // screen) is the most useful thing to keep visible; fall back to the
    // person's own camera if the main stage has nothing yet.
    const mainVideo = document.querySelector('#meet-stage-main video');
    if (mainVideo && mainVideo.srcObject) return mainVideo;
    return document.querySelector(`#meet-tile-${myPeerId} video`);
  }

  async function openLeaveTabPopup() {
    if (pipActive) return;
    pipActive = true;

    if ('documentPictureInPicture' in window) {
      try {
        pipWindow = await window.documentPictureInPicture.requestWindow({ width: 300, height: 200 });

        const style = pipWindow.document.createElement('style');
        style.textContent = `
          body { margin:0; background:#05070d; font-family:sans-serif; overflow:hidden; }
          video { width:100%; height:100%; object-fit:cover; display:block; background:#000; }
          .meet-pip-label { position:fixed; top:6px; left:8px; color:#e5e9f2; font-size:10px; background:rgba(0,0,0,.45); padding:2px 8px; border-radius:999px; }
          .meet-pip-bar { position:fixed; bottom:0; left:0; right:0; display:flex; justify-content:center; gap:8px; padding:6px; background:rgba(0,0,0,.4); }
          .meet-pip-bar button { min-width:32px; height:32px; padding:0 10px; border-radius:16px; border:none; cursor:pointer; background:rgba(255,255,255,.16); color:#fff; font-size:11px; font-weight:600; }
          .meet-pip-bar button.leave { background:#ef4444; }
        `;
        pipWindow.document.head.appendChild(style);

        const sourceVideo = pickFeaturedVideo();
        const video = pipWindow.document.createElement('video');
        video.autoplay = true; video.playsInline = true; video.muted = true;
        if (sourceVideo && sourceVideo.srcObject) video.srcObject = sourceVideo.srcObject;
        pipWindow.document.body.appendChild(video);

        const label = pipWindow.document.createElement('div');
        label.className = 'meet-pip-label';
        label.textContent = roomCode ? `360Meet \u00b7 ${roomCode}` : '360Meet';
        pipWindow.document.body.appendChild(label);

        const bar = pipWindow.document.createElement('div');
        bar.className = 'meet-pip-bar';
        const micBtn = pipWindow.document.createElement('button');
        micBtn.textContent = micOn ? 'Mute' : 'Unmute';
        micBtn.onclick = () => { toggleMic(); micBtn.textContent = micOn ? 'Mute' : 'Unmute'; };
        const leaveBtn = pipWindow.document.createElement('button');
        leaveBtn.className = 'leave';
        leaveBtn.textContent = 'Leave';
        leaveBtn.onclick = () => { closeLeaveTabPopup(); confirmLeave(); };
        bar.appendChild(micBtn);
        bar.appendChild(leaveBtn);
        pipWindow.document.body.appendChild(bar);

        pipWindow.addEventListener('pagehide', () => { pipWindow = null; pipActive = false; }, { once: true });
      } catch (e) {
        pipWindow = null;
        openFallbackPip();
      }
    } else {
      openFallbackPip();
    }
  }

  function openFallbackPip() {
    const video = pickFeaturedVideo();
    if (!video || !video.requestPictureInPicture) { pipActive = false; return; }
    video.requestPictureInPicture().then(() => {
      fallbackPipVideoEl = video;
      video.addEventListener('leavepictureinpicture', () => {
        fallbackPipVideoEl = null;
        pipActive = false;
      }, { once: true });
    }).catch(() => { pipActive = false; });
  }

  function closeLeaveTabPopup() {
    if (pipWindow) { try { pipWindow.close(); } catch (e) {} pipWindow = null; }
    if (fallbackPipVideoEl && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
    fallbackPipVideoEl = null;
    pipActive = false;
  }

  /* ── Leave confirmation popup ─────────────────────────
     The End Call button no longer leaves immediately — it opens a
     custom confirmation popup first. Programmatic exits (kicked,
     meeting ended, tab closing) skip this and call leaveCall directly. */
  function confirmLeave() {
    const overlay = document.getElementById('meet-leave-confirm-modal');
    if (!overlay) { leaveCall(false); return; }
    overlay.classList.add('show');
    const cancelBtn = document.getElementById('meet-leave-cancel-btn');
    const confirmBtn = document.getElementById('meet-leave-confirm-btn');
    function close() { overlay.classList.remove('show'); cancelBtn.onclick = null; confirmBtn.onclick = null; }
    cancelBtn.onclick = close;
    confirmBtn.onclick = () => { close(); leaveCall(false); };
  }

  // kicked=true means this call is being torn down because the HOST ended
  // the meeting (received via the 'meeting-ended' broadcast) — in that case
  // we must not re-broadcast 'meeting-ended' ourselves or show the generic
  // "you left" toast, since a more specific one was already shown.
  function leaveCall(kicked) {
    if (!inCall) return;
    if (isHost && !kicked && channel) {
      // Kick everyone else out and shut the meeting down before tearing
      // down our own connection.
      channel.send({ type: 'broadcast', event: 'meeting-ended', payload: {} });
    }
    inCall = false;
    stopTimer();
    Object.keys(peers).forEach(removePeer);
    if (channel) { getSb().removeChannel(channel); channel = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
    localScreenSharing = false;
    allowedScreenViewers = null;
    if (blackTrack) { try { blackTrack.stop(); } catch (e) {} blackTrack = null; }
    Object.keys(audioMeters).forEach(stopAudioMeter);
    micLocked = false;
    camLocked = false;
    hostMicLocked = false;
    hostCamLocked = false;
    updateLockedButtonUI('#meet-mic-btn', false);
    updateLockedButtonUI('#meet-cam-btn', false);
    chatOpen = false;
    unreadChat = 0;
    const chatList = $('#meet-chat-messages');
    if (chatList) chatList.innerHTML = '';
    $('#meet-chat-panel')?.classList.remove('open');
    $('#meet-call-room').classList.remove('active');
    window.removeEventListener('beforeunload', onBeforeUnload);
    teardownLeaveTabWatcher();
    if (!kicked) toast('You left the meeting');
    isHost = false;
    renderActionSelect();
    showScreen('meet-action-select');
  }

  function onBeforeUnload() { leaveCall(); }

  /* ── Public API ────────────────────────────────────── */
  return {
    init,
    stopPreview,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    hostMuteAll,
    hostCamerasOff,
    toggleChatPanel,
    sendChatMessage,
    copyInviteLink,
    confirmLeave,
    leaveCall: () => leaveCall(false)
  };
})();
