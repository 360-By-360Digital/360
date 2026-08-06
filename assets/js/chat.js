/* ════════════════════════════════════════════════════════
   360 CHAT OVERHAUL PATCH v4.0
   Adds: friends/trusted, community URLs, invite pages,
   polls, link previews, voice notes, notifications panel,
   bot marketplace, profile decor, group DMs
   Append this after chat.js
════════════════════════════════════════════════════════ */

const SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpc3dmcGZzamlvd3RyZHlxcHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzg4OTcsImV4cCI6MjA4MzkxNDg5N30.z_4FtM2c8UwgrRlafPYjolQuod4IoHQats95XHio1zM';
const PATCH_SB_URL = 'https://wiswfpfsjiowtrdyqpxy.supabase.co';

/* ── helpers ── */
function escP(s){ return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function sbFetch(path, opts={}){
  return fetch(PATCH_SB_URL + path, {
    ...opts,
    headers: { apikey: SB_ANON, Authorization: 'Bearer ' + SB_ANON, 'Content-Type': 'application/json', ...(opts.headers||{}) }
  });
}
function toastP(msg, type='info'){
  const el = document.createElement('div');
  el.className = 'chat-patch-toast ' + type;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 3500);
}

/* ── inject CSS ── */
const patchStyle = document.createElement('style');
patchStyle.textContent = `
.chat-patch-toast{position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#111827;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;z-index:9999;animation:fadeInUp .2s ease;}
.chat-patch-toast.error{background:#ef4444;}
.chat-patch-toast.success{background:#10b981;}
@keyframes fadeInUp{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
.patch-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:500;display:flex;align-items:center;justify-content:center;padding:20px;}
.patch-modal{background:var(--bg-float,#1e2130);border-radius:16px;padding:22px;width:100%;max-width:460px;max-height:85vh;overflow-y:auto;color:var(--txt,#e0e6f0);}
.patch-modal h2{margin:0 0 14px;font-size:16px;}
.patch-field{width:100%;padding:9px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.06);color:inherit;font-family:inherit;font-size:13px;margin-bottom:10px;}
.patch-btn{padding:9px 16px;border-radius:9px;border:none;background:linear-gradient(120deg,#3b82f6,#06b6d4);color:#fff;font-weight:700;font-size:13px;cursor:pointer;}
.patch-btn.outline{background:transparent;border:1px solid rgba(255,255,255,.15);color:inherit;}
.patch-btn.danger{background:#ef4444;}
.patch-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px;}
.patch-err{color:#ef4444;font-size:12px;margin-top:6px;}
.patch-tabs{display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;}
.patch-tab{padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;cursor:pointer;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:inherit;}
.patch-tab.active{background:linear-gradient(120deg,#3b82f6,#06b6d4);color:#fff;border-color:transparent;}
.friend-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06);}
.friend-row:last-child{border-bottom:none;}
.friend-avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#06b6d4);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;}
.friend-name{flex:1;font-size:13.5px;font-weight:600;}
.friend-status{font-size:11px;opacity:.6;}
.notif-row{padding:10px 12px;border-radius:10px;cursor:pointer;transition:background .15s;}
.notif-row:hover{background:rgba(255,255,255,.06);}
.notif-row.unread{background:rgba(59,130,246,.1);}
.notif-dot{width:8px;height:8px;border-radius:50%;background:#3b82f6;flex-shrink:0;}
.link-preview-card{border:1px solid rgba(255,255,255,.1);border-radius:10px;overflow:hidden;max-width:380px;margin-top:8px;cursor:pointer;}
.link-preview-img{width:100%;height:160px;object-fit:cover;}
.link-preview-body{padding:10px 12px;}
.link-preview-site{font-size:11px;opacity:.5;text-transform:uppercase;letter-spacing:.04em;}
.link-preview-title{font-size:13.5px;font-weight:700;margin:3px 0 2px;}
.link-preview-desc{font-size:12px;opacity:.7;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}
.poll-card{border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px;margin-top:8px;max-width:380px;}
.poll-q{font-weight:700;font-size:14px;margin-bottom:10px;}
.poll-option{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;cursor:pointer;border:1px solid rgba(255,255,255,.1);margin-bottom:6px;position:relative;overflow:hidden;transition:border-color .15s;}
.poll-option:hover{border-color:#3b82f6;}
.poll-option.voted{border-color:#3b82f6;}
.poll-bar{position:absolute;left:0;top:0;height:100%;background:rgba(59,130,246,.15);z-index:0;transition:width .4s;}
.poll-option-label{position:relative;z-index:1;flex:1;font-size:13px;}
.poll-pct{position:relative;z-index:1;font-size:12px;opacity:.7;font-weight:700;}
.poll-meta{font-size:11px;opacity:.5;margin-top:8px;}
.voice-note-bubble{display:flex;align-items:center;gap:10px;padding:10px 14px;background:rgba(59,130,246,.12);border-radius:12px;margin-top:6px;max-width:260px;}
.vn-play-btn{width:34px;height:34px;border-radius:50%;border:none;background:#3b82f6;color:#fff;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
.vn-waveform{flex:1;height:28px;opacity:.7;}
.vn-dur{font-size:11px;opacity:.6;}
.decor-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px;margin-top:8px;}
.decor-item{border-radius:10px;border:2px solid rgba(255,255,255,.1);padding:6px;cursor:pointer;text-align:center;font-size:22px;transition:border-color .15s;}
.decor-item:hover,.decor-item.selected{border-color:#3b82f6;}
.bot-card{border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:14px;display:flex;gap:12px;margin-bottom:10px;}
.bot-avatar{width:46px;height:46px;border-radius:12px;object-fit:cover;background:rgba(255,255,255,.1);flex-shrink:0;}
.bot-info{flex:1;}
.bot-name{font-weight:700;font-size:14px;}
.bot-handle{font-size:11px;opacity:.5;}
.bot-desc{font-size:12px;opacity:.8;margin-top:3px;}
.community-header{background:linear-gradient(120deg,#3b82f6,#06b6d4);padding:40px 24px 20px;border-radius:0 0 18px 18px;margin:-1px -1px 16px;color:#fff;text-align:center;}
.community-banner{font-size:22px;font-weight:800;}
.community-url{font-size:11px;opacity:.8;margin-top:4px;}
.invite-card{background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.25);border-radius:12px;padding:16px;margin-bottom:12px;}
.tag-chip{display:inline-flex;padding:3px 9px;border-radius:999px;font-size:11px;background:rgba(59,130,246,.15);color:#3b82f6;margin:2px;}
.patch-icon-btn{width:32px;height:32px;border-radius:8px;border:none;background:transparent;color:var(--txt,#e0e6f0);cursor:pointer;display:inline-flex;align-items:center;justify-content:center;opacity:.7;}
.patch-icon-btn:hover{background:rgba(255,255,255,.08);opacity:1;}
#chat-patch-notif-badge{position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;background:#ef4444;font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;color:#fff;}
`;
document.head.appendChild(patchStyle);

/* ══════════════════════════════════════════
   NOTIFICATIONS PANEL
══════════════════════════════════════════ */
let notifCount = 0;

async function loadNotifications(){
  const uid = currentUserId;
  if(!uid) return;
  const res = await sbFetch(`/rest/v1/chat_notifications?user_id=eq.${uid}&order=created_at.desc&limit=50`);
  if(!res.ok) return [];
  return res.json();
}

function openNotificationsPanel(){
  const overlay = document.createElement('div');
  overlay.className = 'patch-modal-overlay';
  overlay.innerHTML = `<div class="patch-modal">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <h2 style="margin:0;">🔔 Notifications</h2>
      <button class="patch-btn outline" id="notif-mark-all">Mark all read</button>
    </div>
    <div id="notif-list"><div style="opacity:.5;font-size:13px;">Loading…</div></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); });

  loadNotifications().then(notifs=>{
    const box = overlay.querySelector('#notif-list');
    if(!notifs.length){ box.innerHTML = `<div style="opacity:.5;text-align:center;padding:40px 0;font-size:13px;">No notifications yet.</div>`; return; }
    box.innerHTML = notifs.map(n=>`<div class="notif-row ${n.is_read?'':'unread'}" data-id="${n.id}" data-link="${escP(n.link||'')}">
      <div style="display:flex;align-items:center;gap:10px;">
        ${!n.is_read?'<div class="notif-dot"></div>':'<div style="width:8px"></div>'}
        <div>
          <div style="font-size:13.5px;font-weight:${n.is_read?'400':'700'}">${escP(n.title)}</div>
          ${n.body?`<div style="font-size:12px;opacity:.6">${escP(n.body)}</div>`:''}
        </div>
      </div>
    </div>`).join('');
    box.querySelectorAll('.notif-row').forEach(row=>{
      row.addEventListener('click', async ()=>{
        await sbFetch(`/rest/v1/chat_notifications?id=eq.${row.dataset.id}`,{method:'PATCH',body:JSON.stringify({is_read:true})});
        if(row.dataset.link) location.href = row.dataset.link;
        else overlay.remove();
      });
    });
  });

  overlay.querySelector('#notif-mark-all').addEventListener('click', async ()=>{
    await sbFetch(`/rest/v1/chat_notifications?user_id=eq.${currentUserId}`,{method:'PATCH',body:JSON.stringify({is_read:true})});
    overlay.remove();
    refreshNotifBadge();
  });
}

async function refreshNotifBadge(){
  if(!currentUserId) return;
  const res = await sbFetch(`/rest/v1/chat_notifications?user_id=eq.${currentUserId}&is_read=eq.false&select=id`);
  if(!res.ok) return;
  const rows = await res.json();
  notifCount = rows.length;
  const badge = document.getElementById('chat-patch-notif-badge');
  if(badge){ badge.textContent = notifCount > 9 ? '9+' : String(notifCount); badge.style.display = notifCount ? 'flex' : 'none'; }
}

async function createNotification(userId, type, title, body='', link=''){
  await sbFetch('/rest/v1/chat_notifications',{method:'POST',body:JSON.stringify({user_id:userId,notif_type:type,title,body,link})});
}

/* ══════════════════════════════════════════
   FRIENDS / TRUSTED
══════════════════════════════════════════ */
async function loadFriends(){
  const uid = currentUserId;
  if(!uid) return [];
  const res = await sbFetch(`/rest/v1/friendships?or=(requester_id.eq.${uid},addressee_id.eq.${uid})&status=eq.accepted&select=*`);
  if(!res.ok) return [];
  const rows = await res.json();
  return rows.map(r=>({ friendId: r.requester_id===uid ? r.addressee_id : r.requester_id, since: r.responded_at }));
}

async function sendFriendRequest(addresseeId){
  const res = await sbFetch('/rest/v1/friendships',{method:'POST',body:JSON.stringify({requester_id:currentUserId,addressee_id:addresseeId,status:'pending'})});
  if(!res.ok){ const e=await res.json(); toastP(e?.message||'Error sending request','error'); return; }
  await createNotification(addresseeId,'friend_request','New friend request','wants to be your trusted friend.');
  toastP('Friend request sent!','success');
}

async function respondFriendRequest(id, accept){
  const status = accept ? 'accepted' : 'declined';
  await sbFetch(`/rest/v1/friendships?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({status,responded_at:new Date().toISOString()})});
  if(accept) toastP('Friend request accepted!','success');
}

function openFriendsPanel(){
  const overlay = document.createElement('div');
  overlay.className = 'patch-modal-overlay';
  overlay.innerHTML = `<div class="patch-modal">
    <h2>👥 Trusted Friends</h2>
    <div class="patch-tabs">
      <button class="patch-tab active" data-tab="friends">Friends</button>
      <button class="patch-tab" data-tab="pending">Requests</button>
      <button class="patch-tab" data-tab="add">Add Friend</button>
    </div>
    <div id="friends-body"><div style="opacity:.5;font-size:13px;">Loading…</div></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.remove(); });
  overlay.querySelectorAll('.patch-tab').forEach(tab=>tab.addEventListener('click',()=>{
    overlay.querySelectorAll('.patch-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    renderFriendsTab(overlay, tab.dataset.tab);
  }));
  renderFriendsTab(overlay, 'friends');
}

async function renderFriendsTab(overlay, tab){
  const box = overlay.querySelector('#friends-body');
  if(tab==='friends'){
    const friends = await loadFriends();
    if(!friends.length){ box.innerHTML=`<div style="opacity:.5;text-align:center;padding:30px;font-size:13px;">No trusted friends yet.</div>`; return; }
    const profiles = await Promise.all(friends.map(f=>sbFetch(`/rest/v1/profiles?id=eq.${f.friendId}&select=username,avatar_url`).then(r=>r.json()).then(r=>r[0])));
    box.innerHTML = friends.map((f,i)=>{
      const p = profiles[i]||{};
      const init = (p.username||'?')[0].toUpperCase();
      return `<div class="friend-row">
        <div class="friend-avatar">${init}</div>
        <div><div class="friend-name">${escP(p.username||f.friendId)}</div><div class="friend-status">Trusted friend</div></div>
        <button class="patch-btn" style="font-size:11px;padding:5px 10px;" onclick="openVoiceNotePicker('${f.friendId}')">🎤 Voice</button>
      </div>`;
    }).join('');
  } else if(tab==='pending'){
    const res = await sbFetch(`/rest/v1/friendships?addressee_id=eq.${currentUserId}&status=eq.pending&select=*`);
    const rows = res.ok ? await res.json() : [];
    if(!rows.length){ box.innerHTML=`<div style="opacity:.5;text-align:center;padding:30px;font-size:13px;">No pending requests.</div>`; return; }
    box.innerHTML = rows.map(r=>`<div class="friend-row" data-fid="${r.id}">
      <div class="friend-avatar">?</div>
      <div class="friend-name" style="flex:1">${escP(r.requester_id)}</div>
      <button class="patch-btn" style="font-size:11px;padding:5px 10px;margin-right:4px;" onclick="respondFriendRequest('${r.id}',true)">✓</button>
      <button class="patch-btn danger" style="font-size:11px;padding:5px 10px;" onclick="respondFriendRequest('${r.id}',false)">✗</button>
    </div>`).join('');
  } else {
    box.innerHTML = `<div>
      <input class="patch-field" id="friend-search" placeholder="Enter username or user ID…" />
      <button class="patch-btn" id="send-req-btn" style="width:100%">Send Friend Request</button>
      <div class="patch-err" id="friend-err"></div>
    </div>`;
    overlay.querySelector('#send-req-btn').addEventListener('click', async ()=>{
      const val = overlay.querySelector('#friend-search').value.trim();
      if(!val) return;
      const r = await sbFetch(`/rest/v1/profiles?username=eq.${encodeURIComponent(val)}&select=id`);
      const rows = r.ok ? await r.json() : [];
      if(!rows.length){ overlay.querySelector('#friend-err').textContent='User not found.'; return; }
      await sendFriendRequest(rows[0].id);
    });
  }
}

/* ══════════════════════════════════════════
   VOICE NOTES
══════════════════════════════════════════ */
let voiceRecorder = null, voiceChunks = [];

async function openVoiceNotePicker(receiverId){
  const overlay = document.createElement('div');
  overlay.className = 'patch-modal-overlay';
  overlay.innerHTML = `<div class="patch-modal" style="text-align:center;">
    <h2>🎤 Record Voice Note</h2>
    <div id="vn-status" style="font-size:13px;opacity:.7;margin-bottom:14px;">Press Record to start</div>
    <div style="display:flex;gap:8px;justify-content:center;">
      <button class="patch-btn" id="vn-record">Record</button>
      <button class="patch-btn outline" id="vn-stop" disabled>Stop</button>
      <button class="patch-btn outline" id="vn-cancel">Cancel</button>
    </div>
    <audio id="vn-preview" controls style="margin-top:12px;display:none;width:100%;"></audio>
    <button class="patch-btn" id="vn-send" style="margin-top:10px;display:none;width:100%">Send</button>
  </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#vn-cancel').addEventListener('click',()=>{ if(voiceRecorder) voiceRecorder.stop(); overlay.remove(); });

  overlay.querySelector('#vn-record').addEventListener('click', async ()=>{
    voiceChunks=[];
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    voiceRecorder = new MediaRecorder(stream);
    voiceRecorder.ondataavailable = e=>voiceChunks.push(e.data);
    voiceRecorder.onstop = ()=>{
      const blob = new Blob(voiceChunks,{type:'audio/webm'});
      const url = URL.createObjectURL(blob);
      const preview = overlay.querySelector('#vn-preview');
      preview.src=url; preview.style.display='block';
      overlay.querySelector('#vn-send').style.display='block';
      overlay.querySelector('#vn-record').disabled=false;
      overlay.querySelector('#vn-stop').disabled=true;

      overlay.querySelector('#vn-send').onclick = async ()=>{
        overlay.querySelector('#vn-send').textContent='Sending…';
        const reader = new FileReader();
        reader.onload = async evt=>{
          const base64 = evt.target.result.split(',')[1];
          const uploadRes = await sbFetch('/storage/v1/object/voice-notes/'+currentUserId+'-'+Date.now()+'.webm',{
            method:'POST', headers:{'Content-Type':'audio/webm','Authorization':'Bearer '+SB_ANON},
            body: blob
          });
          const pubUrl = PATCH_SB_URL+'/storage/v1/object/public/voice-notes/'+currentUserId+'-'+Date.now()+'.webm';
          await sbFetch('/rest/v1/voice_notes',{method:'POST',body:JSON.stringify({sender_id:currentUserId,receiver_id:receiverId,audio_url:pubUrl,duration_seconds:Math.round(blob.size/16000)})});
          await createNotification(receiverId,'voice_note','New voice note','You received a voice note.');
          toastP('Voice note sent!','success');
          overlay.remove();
        };
        reader.readAsDataURL(blob);
      };
    };
    voiceRecorder.start();
    overlay.querySelector('#vn-status').textContent='Recording…';
    overlay.querySelector('#vn-record').disabled=true;
    overlay.querySelector('#vn-stop').disabled=false;
  });
  overlay.querySelector('#vn-stop').addEventListener('click',()=>{ voiceRecorder.stop(); overlay.querySelector('#vn-status').textContent='Preview your recording.'; });
}

function renderVoiceNoteBubble(vn){
  const div = document.createElement('div');
  div.className = 'voice-note-bubble';
  div.innerHTML = `<button class="vn-play-btn" title="Play">▶</button>
    <svg class="vn-waveform" viewBox="0 0 100 28"><polyline points="${Array.from({length:20},(_,i)=>`${i*5},${14+Math.sin(i)*8}`).join(' ')}" fill="none" stroke="#3b82f6" stroke-width="2"/></svg>
    <span class="vn-dur">${vn.duration_seconds||'?'}s</span>`;
  let audio = null;
  div.querySelector('.vn-play-btn').addEventListener('click', ()=>{
    if(!audio){ audio=new Audio(vn.audio_url); audio.onended=()=>div.querySelector('.vn-play-btn').textContent='▶'; }
    if(audio.paused){ audio.play(); div.querySelector('.vn-play-btn').textContent='⏸'; }
    else { audio.pause(); div.querySelector('.vn-play-btn').textContent='▶'; }
  });
  return div;
}

/* ══════════════════════════════════════════
   POLLS
══════════════════════════════════════════ */
async function openPollCreator(channelId, dmId=null){
  const overlay = document.createElement('div');
  overlay.className = 'patch-modal-overlay';
  overlay.innerHTML = `<div class="patch-modal">
    <h2>📊 Create Poll</h2>
    <input class="patch-field" id="poll-q" placeholder="Your question…" />
    <div id="poll-options-wrap">
      <input class="patch-field poll-opt" placeholder="Option 1" />
      <input class="patch-field poll-opt" placeholder="Option 2" />
    </div>
    <button class="patch-btn outline" id="poll-add-opt" style="width:100%;margin-bottom:10px;">+ Add option</button>
    <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:10px;"><input type="checkbox" id="poll-multi" /> Allow multiple votes</label>
    <div class="patch-err" id="poll-err"></div>
    <div class="patch-modal-actions">
      <button class="patch-btn outline" id="poll-cancel">Cancel</button>
      <button class="patch-btn" id="poll-submit">Create poll</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{ if(e.target===overlay) overlay.remove(); });
  overlay.querySelector('#poll-cancel').addEventListener('click',()=>overlay.remove());
  overlay.querySelector('#poll-add-opt').addEventListener('click',()=>{
    const inp = document.createElement('input');
    inp.className = 'patch-field poll-opt';
    inp.placeholder = 'Option ' + (overlay.querySelectorAll('.poll-opt').length+1);
    overlay.querySelector('#poll-options-wrap').appendChild(inp);
  });
  overlay.querySelector('#poll-submit').addEventListener('click', async ()=>{
    const q = overlay.querySelector('#poll-q').value.trim();
    const opts = [...overlay.querySelectorAll('.poll-opt')].map(i=>i.value.trim()).filter(Boolean);
    if(!q || opts.length < 2){ overlay.querySelector('#poll-err').textContent='Question and at least 2 options required.'; return; }
    const multi = overlay.querySelector('#poll-multi').checked;
    const pRes = await sbFetch('/rest/v1/polls',{method:'POST',headers:{'Prefer':'return=representation'},
      body:JSON.stringify({channel_id:channelId||null,dm_id:dmId||null,created_by:currentUserId,question:q,allow_multiple:multi})});
    const poll = (await pRes.json())[0];
    await Promise.all(opts.map((label,i)=>sbFetch('/rest/v1/poll_options',{method:'POST',body:JSON.stringify({poll_id:poll.id,label,position:i})})));
    toastP('Poll created!','success');
    overlay.remove();
  });
}

async function renderPollCard(pollId, container){
  const [pRes, optsRes, votesRes] = await Promise.all([
    sbFetch(`/rest/v1/polls?id=eq.${pollId}&select=*`).then(r=>r.json()),
    sbFetch(`/rest/v1/poll_options?poll_id=eq.${pollId}&order=position.asc`).then(r=>r.json()),
    sbFetch(`/rest/v1/poll_votes?poll_id=eq.${pollId}&select=*`).then(r=>r.json()),
  ]);
  const poll = pRes[0]; const opts = optsRes; const votes = votesRes;
  if(!poll) return;
  const myVotes = new Set(votes.filter(v=>v.user_id===currentUserId).map(v=>v.option_id));
  const totalVotes = votes.length;
  const div = document.createElement('div');
  div.className = 'poll-card';
  div.innerHTML = `<div class="poll-q">${escP(poll.question)}</div>
    ${opts.map(o=>{
      const count = votes.filter(v=>v.option_id===o.id).length;
      const pct = totalVotes ? Math.round(count/totalVotes*100) : 0;
      return `<div class="poll-option ${myVotes.has(o.id)?'voted':''}" data-opt="${o.id}">
        <div class="poll-bar" style="width:${pct}%"></div>
        <span class="poll-option-label">${escP(o.label)}</span>
        <span class="poll-pct">${pct}%</span>
      </div>`;
    }).join('')}
    <div class="poll-meta">${totalVotes} vote${totalVotes!==1?'s':''}</div>`;
  div.querySelectorAll('.poll-option').forEach(optEl=>{
    optEl.addEventListener('click', async ()=>{
      const optId = optEl.dataset.opt;
      if(myVotes.has(optId)){
        await sbFetch(`/rest/v1/poll_votes?poll_id=eq.${pollId}&option_id=eq.${optId}&user_id=eq.${currentUserId}`,{method:'DELETE'});
      } else {
        if(!poll.allow_multiple && myVotes.size > 0){
          const firstVote = [...myVotes][0];
          await sbFetch(`/rest/v1/poll_votes?poll_id=eq.${pollId}&option_id=eq.${firstVote}&user_id=eq.${currentUserId}`,{method:'DELETE'});
        }
        await sbFetch('/rest/v1/poll_votes',{method:'POST',body:JSON.stringify({poll_id:pollId,option_id:optId,user_id:currentUserId})});
      }
      renderPollCard(pollId, div.parentNode);
      div.remove();
    });
  });
  container.appendChild(div);
}

/* ══════════════════════════════════════════
   LINK PREVIEWS
══════════════════════════════════════════ */
const URL_RE = /https?:\/\/[^\s<>"']{10,}/g;

async function enrichMessageWithPreviews(msgEl, content){
  const urls = (content||'').match(URL_RE);
  if(!urls) return;
  const url = urls[0];
  try{
    const res = await fetch(`${PATCH_SB_URL}/functions/v1/link-preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});
    if(!res.ok) return;
    const lp = await res.json();
    if(!lp.title) return;
    const card = document.createElement('div');
    card.className = 'link-preview-card';
    card.innerHTML = `${lp.image_url?`<img class="link-preview-img" src="${escP(lp.image_url)}" loading="lazy" onerror="this.remove()" />`:''}
      <div class="link-preview-body">
        <div class="link-preview-site">${escP(lp.site_name||'')}</div>
        <div class="link-preview-title">${escP(lp.title)}</div>
        ${lp.description?`<div class="link-preview-desc">${escP(lp.description)}</div>`:''}
      </div>`;
    card.addEventListener('click',()=>window.open(url,'_blank','noopener'));
    msgEl.appendChild(card);
  }catch(e){}
}

/* ══════════════════════════════════════════
   COMMUNITY PAGES + INVITES
══════════════════════════════════════════ */
async function openCommunityPage(serverId){
  const res = await sbFetch(`/rest/v1/servers?id=eq.${serverId}&select=*`);
  const server = res.ok ? (await res.json())[0] : null;
  if(!server){ toastP('Community not found','error'); return; }
  const overlay = document.createElement('div');
  overlay.className = 'patch-modal-overlay';
  const tags = (server.tags||[]).map(t=>`<span class="tag-chip">${escP(t)}</span>`).join('');
  const slug = server.slug||server.id;
  const communityUrl = server.community_url || `https://360-search.com/chat?community=${slug}`;
  const inviteUrl = `https://360-search.com/chat/invite/${slug}`;
  overlay.innerHTML = `<div class="patch-modal">
    <div class="community-header">
      <div style="font-size:36px;margin-bottom:8px;">${escP(server.icon||'🌐')}</div>
      <div class="community-banner">${escP(server.name)}</div>
      <div class="community-url">360-search.com/chat?community=${escP(slug)}</div>
      ${server.verified?'<span style="background:#10b981;color:#fff;font-size:11px;padding:2px 8px;border-radius:999px;margin-top:6px;display:inline-block;">✓ Verified</span>':''}
    </div>
    ${server.description?`<p style="font-size:13.5px;opacity:.8;margin-bottom:10px;">${escP(server.description)}</p>`:''}
    ${tags?`<div style="margin-bottom:12px;">${tags}</div>`:''}
    <div class="invite-card">
      <div style="font-size:12px;opacity:.6;margin-bottom:6px;">Invite link</div>
      <div style="font-size:13px;font-weight:700;word-break:break-all;">${escP(inviteUrl)}</div>
      <button class="patch-btn" style="margin-top:10px;" onclick="navigator.clipboard.writeText('${escP(inviteUrl)}');this.textContent='Copied!'">📋 Copy invite link</button>
    </div>
    <div class="patch-modal-actions">
      <button class="patch-btn outline" id="comm-close">Close</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{ if(e.target===overlay) overlay.remove(); });
  overlay.querySelector('#comm-close').addEventListener('click',()=>overlay.remove());
}

/* Handle ?community=slug on page load */
function checkCommunityUrl(){
  const params = new URLSearchParams(location.search);
  const community = params.get('community');
  if(!community) return;
  sbFetch(`/rest/v1/servers?slug=eq.${encodeURIComponent(community)}&select=*`).then(r=>r.json()).then(rows=>{
    if(rows[0]) openCommunityPage(rows[0].id);
  });
}

/* ══════════════════════════════════════════
   PROFILE CUSTOMISATION (chat-only)
══════════════════════════════════════════ */
const AVATAR_DECORS = ['🌸','⭐','🔥','💎','👑','🌈','⚡','🎮','🐉','🦋','🌙','🎯','🚀','💫','🎭'];
const NAMEPLATE_DECORS = ['gradient-blue','gradient-purple','gradient-fire','gradient-gold','gradient-ice','plain'];

async function openProfileCustomizer(){
  const res = await sbFetch(`/rest/v1/chat_profiles?user_id=eq.${currentUserId}&select=*`);
  const profile = res.ok ? ((await res.json())[0]||{}) : {};
  const overlay = document.createElement('div');
  overlay.className = 'patch-modal-overlay';
  overlay.innerHTML = `<div class="patch-modal">
    <h2>🎨 Chat Profile</h2>
    <div class="patch-tabs">
      <button class="patch-tab active" data-tab="avatar">Avatar Decor</button>
      <button class="patch-tab" data-tab="nameplate">Nameplate</button>
      <button class="patch-tab" data-tab="status">Status</button>
    </div>
    <div id="cp-body"></div>
    <div class="patch-modal-actions">
      <button class="patch-btn outline" id="cp-cancel">Cancel</button>
      <button class="patch-btn" id="cp-save">Save</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{ if(e.target===overlay) overlay.remove(); });
  overlay.querySelector('#cp-cancel').addEventListener('click',()=>overlay.remove());

  let selected = { avatar_decor_id: profile.avatar_decor_id||'', nameplate_decor_id: profile.nameplate_decor_id||'plain', bio: profile.bio||'', status_emoji: profile.status_emoji||'', status_text: profile.status_text||'' };

  function renderTab(tab){
    const box = overlay.querySelector('#cp-body');
    if(tab==='avatar'){
      box.innerHTML = `<div class="decor-grid">${AVATAR_DECORS.map(d=>`<div class="decor-item ${selected.avatar_decor_id===d?'selected':''}" data-d="${d}">${d}</div>`).join('')}</div>`;
      box.querySelectorAll('.decor-item').forEach(el=>el.addEventListener('click',()=>{ selected.avatar_decor_id=el.dataset.d; renderTab('avatar'); }));
    } else if(tab==='nameplate'){
      box.innerHTML = `<div class="decor-grid">${NAMEPLATE_DECORS.map(d=>`<div class="decor-item ${selected.nameplate_decor_id===d?'selected':''}" data-d="${d}" style="${d.startsWith('gradient')?`background:linear-gradient(120deg,${d.includes('blue')?'#3b82f6,#06b6d4':d.includes('purple')?'#8b5cf6,#ec4899':d.includes('fire')?'#f97316,#ef4444':d.includes('gold')?'#fbbf24,#f59e0b':d.includes('ice')?'#e0f2fe,#bae6fd':'transparent'});color:#fff`:''}">${d}</div>`).join('')}</div>`;
      box.querySelectorAll('.decor-item').forEach(el=>el.addEventListener('click',()=>{ selected.nameplate_decor_id=el.dataset.d; renderTab('nameplate'); }));
    } else {
      box.innerHTML = `<input class="patch-field" id="cp-emoji" value="${escP(selected.status_emoji)}" placeholder="Status emoji" style="width:80px;display:inline-block;margin-right:8px;" maxlength="2" />
        <input class="patch-field" id="cp-status" value="${escP(selected.status_text)}" placeholder="Status text…" style="width:calc(100% - 96px);display:inline-block;" />
        <textarea class="patch-field" id="cp-bio" placeholder="Bio…" style="min-height:60px;margin-top:8px;">${escP(selected.bio)}</textarea>`;
      box.querySelector('#cp-emoji').addEventListener('input',e=>selected.status_emoji=e.target.value);
      box.querySelector('#cp-status').addEventListener('input',e=>selected.status_text=e.target.value);
      box.querySelector('#cp-bio').addEventListener('input',e=>selected.bio=e.target.value);
    }
  }

  overlay.querySelectorAll('.patch-tab').forEach(tab=>tab.addEventListener('click',()=>{
    overlay.querySelectorAll('.patch-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    renderTab(tab.dataset.tab);
  }));
  renderTab('avatar');

  overlay.querySelector('#cp-save').addEventListener('click', async ()=>{
    await sbFetch('/rest/v1/chat_profiles',{method:'POST',headers:{'Prefer':'resolution=merge-duplicates'},body:JSON.stringify({user_id:currentUserId,...selected,updated_at:new Date().toISOString()})});
    toastP('Profile saved!','success');
    overlay.remove();
  });
}

/* ══════════════════════════════════════════
   BOT MARKETPLACE
══════════════════════════════════════════ */
async function openBotMarketplace(serverId=null){
  const overlay = document.createElement('div');
  overlay.className = 'patch-modal-overlay';
  overlay.innerHTML = `<div class="patch-modal">
    <h2>🤖 Bot Marketplace</h2>
    <div class="patch-tabs">
      <button class="patch-tab active" data-tab="featured">Featured</button>
      <button class="patch-tab" data-tab="all">All Bots</button>
      ${serverId?`<button class="patch-tab" data-tab="mine">My Bots</button>`:''}
    </div>
    <div id="bot-body"><div style="opacity:.5;font-size:13px;">Loading…</div></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{ if(e.target===overlay) overlay.remove(); });
  overlay.querySelectorAll('.patch-tab').forEach(tab=>tab.addEventListener('click',()=>{
    overlay.querySelectorAll('.patch-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');
    renderBotTab(overlay, tab.dataset.tab, serverId);
  }));
  renderBotTab(overlay, 'featured', serverId);
}

async function renderBotTab(overlay, tab, serverId){
  const box = overlay.querySelector('#bot-body');
  let url = '/rest/v1/bots?select=*&order=install_count.desc';
  if(tab==='featured') url += '&featured=eq.true';
  if(tab==='mine') url = `/rest/v1/bots?owner_id=eq.${currentUserId}&select=*`;
  const res = await sbFetch(url);
  const bots = res.ok ? await res.json() : [];
  if(!bots.length){ box.innerHTML=`<div style="opacity:.5;text-align:center;padding:30px;font-size:13px;">No bots here yet.</div>`; return; }
  box.innerHTML = bots.map(bot=>`<div class="bot-card">
    ${bot.avatar_url?`<img class="bot-avatar" src="${escP(bot.avatar_url)}" />`:`<div class="bot-avatar" style="display:flex;align-items:center;justify-content:center;font-size:20px;">🤖</div>`}
    <div class="bot-info">
      <div class="bot-name">${escP(bot.name)}${bot.verified?' ✓':''}</div>
      <div class="bot-handle">@${escP(bot.handle)}</div>
      <div class="bot-desc">${escP(bot.description||'')}</div>
      <div style="margin-top:6px;display:flex;gap:6px;">
        ${serverId?`<button class="patch-btn" style="font-size:11px;padding:5px 10px;" data-bot="${bot.id}">Add to server</button>`:''}
        ${bot.website_url?`<a href="${escP(bot.website_url)}" target="_blank" class="patch-btn outline" style="font-size:11px;padding:5px 10px;text-decoration:none;">Docs</a>`:''}
      </div>
    </div>
  </div>`).join('');
  box.querySelectorAll('[data-bot]').forEach(btn=>btn.addEventListener('click',async()=>{
    await sbFetch('/rest/v1/server_bots',{method:'POST',body:JSON.stringify({server_id:serverId,bot_id:btn.dataset.bot,installed_by:currentUserId})});
    toastP('Bot added!','success');
    btn.textContent='Added ✓'; btn.disabled=true;
  }));
}

/* ══════════════════════════════════════════
   TOOLBAR INJECTIONS
   Wire new buttons into existing chat toolbar
══════════════════════════════════════════ */
function injectToolbarButtons(){
  const toolbar = document.querySelector('.msg-toolbar, #chatToolbar, .chat-toolbar, [class*="toolbar"]');
  if(!toolbar) return;
  const btns = [
    { title:'📊 Poll', handler: ()=> openPollCreator(activeRoom.id) },
    { title:'📊', handler: ()=> openPollCreator(activeRoom.id) },
  ];
  const pollBtn = document.createElement('button');
  pollBtn.className = 'patch-icon-btn';
  pollBtn.title = 'Create poll';
  pollBtn.textContent = '📊';
  pollBtn.addEventListener('click', ()=>openPollCreator(activeRoom.type==='channel'?activeRoom.id:null, activeRoom.type==='dm'?activeRoom.id:null));
  toolbar.appendChild(pollBtn);
}

function injectRailButtons(){
  const rail = document.querySelector('.rail-top, #chatNav, .sidebar-top, [class*="rail"]');
  if(!rail) return;

  const notifBtn = document.createElement('button');
  notifBtn.className = 'patch-icon-btn';
  notifBtn.title = 'Notifications';
  notifBtn.style.position='relative';
  notifBtn.innerHTML = `🔔<span id="chat-patch-notif-badge" style="display:none"></span>`;
  notifBtn.addEventListener('click', openNotificationsPanel);
  rail.prepend(notifBtn);

  const friendsBtn = document.createElement('button');
  friendsBtn.className = 'patch-icon-btn';
  friendsBtn.title = 'Trusted Friends';
  friendsBtn.textContent = '👥';
  friendsBtn.addEventListener('click', openFriendsPanel);
  rail.prepend(friendsBtn);

  const profileBtn = document.createElement('button');
  profileBtn.className = 'patch-icon-btn';
  profileBtn.title = 'Chat Profile';
  profileBtn.textContent = '🎨';
  profileBtn.addEventListener('click', openProfileCustomizer);
  rail.prepend(profileBtn);

  const botsBtn = document.createElement('button');
  botsBtn.className = 'patch-icon-btn';
  botsBtn.title = 'Bot Marketplace';
  botsBtn.textContent = '🤖';
  botsBtn.addEventListener('click', ()=>openBotMarketplace(activeServerId));
  rail.prepend(botsBtn);
}

/* ══════════════════════════════════════════
   HOOK INTO EXISTING MESSAGE RENDERER
   Extend existing render to add link previews
══════════════════════════════════════════ */
const _origRenderMsgBubble = window.renderMsgBubble;
if(typeof _origRenderMsgBubble === 'function'){
  window.renderMsgBubble = function(...args){
    const el = _origRenderMsgBubble.apply(this, args);
    const msg = args[0];
    if(msg && msg.content && URL_RE.test(msg.content)){
      setTimeout(()=> enrichMessageWithPreviews(el, msg.content), 50);
    }
    return el;
  };
}

/* ══════════════════════════════════════════
   REALTIME NOTIFICATION SUBSCRIPTION
══════════════════════════════════════════ */
function subscribeToNotifications(){
  if(!currentUserId) return;
  sb.channel('chat-notifs-'+currentUserId)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_notifications',filter:'user_id=eq.'+currentUserId}, payload=>{
      notifCount++;
      const badge = document.getElementById('chat-patch-notif-badge');
      if(badge){ badge.textContent = notifCount>9?'9+':String(notifCount); badge.style.display='flex'; }
      toastP(payload.new.title);
    })
    .subscribe();
}

/* ══════════════════════════════════════════
   INIT — wait for existing chat to be ready
══════════════════════════════════════════ */
function patchInit(){
  checkCommunityUrl();
  injectRailButtons();
  injectToolbarButtons();
  refreshNotifBadge();
  subscribeToNotifications();
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', ()=>setTimeout(patchInit, 800));
} else {
  setTimeout(patchInit, 800);
}

window.openCommunityPage = openCommunityPage;
window.openFriendsPanel = openFriendsPanel;
window.openBotMarketplace = openBotMarketplace;
window.openProfileCustomizer = openProfileCustomizer;
window.openPollCreator = openPollCreator;
window.renderPollCard = renderPollCard;
window.openVoiceNotePicker = openVoiceNotePicker;
window.sendFriendRequest = sendFriendRequest;
window.respondFriendRequest = respondFriendRequest;
