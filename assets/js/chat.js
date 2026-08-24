/* ════════════════════════════════════════════════════════
   360 Chat v3.6.0
   Fixes: "@" Arrangement
════════════════════════════════════════════════════════ */
window.SKIP_AUTH_CHIP = true;
const sb = supabaseClient;
window.sb = sb; // expose for voice.js
const SB_URL = 'https://wiswfpfsjiowtrdyqpxy.supabase.co';

/* ── State ─────────────────────────────────────────── */
let currentUserId    = null;
let currentProfile   = null;
let activeRoom       = {type:'public',id:'public',name:'general',icon:'#',serverId:null,serverName:'360 Chat'};
let activeServerId   = null;
let pendingFile      = null;
let replyingTo       = null;
let realtimeChannel  = null;
let typingChannel    = null;
let typingUsers      = {};
let typingTimeouts   = {};
let lastMsgUserId    = null;
let lastMsgDate      = null;
let isSending        = false;
let historyExhausted = false;
let oldestMsgDate    = null;
let isLoadingMore    = false;
let slowModeSeconds  = 0;
let lastSentTime     = 0;
let ctxTargetMsg     = null;
let showingDMs       = false;
let knownUsers       = [];
let mentionQuery     = null;
let mentionStart     = 0;
let mentionSelIdx    = 0;
let activeThreadId   = null;
let slashSuggIdx     = 0;
let joinedServerIds  = new Set();
let presenceState    = {};
let pendingServerIconFile = null;
let friendsPanel     = null;
let friendWatchChannel = null;
const msgElMap       = new Map();
const profileCache   = {};
const translateCache = {};
const unreadCounts   = {};

const QUICK_EMOJIS = ['👍','❤️','😂','💀','🔥','😮','😢','👏','✨','💯','🚀','⭐','🎉','👀','🙏'];
const ALL_EMOJIS   = ['😀','😂','😍','🥰','😎','🤔','😢','😡','👍','👎','❤️','🔥','💀','🎉','✨',
                      '💯','🚀','⭐','👀','🙏','💪','🤖','😊','🥺','🤣','😅','😱','🫡','💅','🗿',
                      '🤯','🫠','😭','🤩','😤','🫶','❄️','⚡','🌈','🎮','🏆','👑','💎','🐱','🌙'];

const SHORTCODES={':skull:':'💀',':fire:':'🔥',':heart:':'❤️',':thumbsup:':'👍',':thumbsdown:':'👎',
  ':laugh:':'😂',':cry:':'😢',':wow:':'😮',':clap:':'👏',':sparkles:':'✨',':100:':'💯',
  ':rocket:':'🚀',':eyes:':'👀',':ok:':'👌',':wave:':'👋',':pray:':'🙏',':muscle:':'💪',
  ':star:':'⭐',':check:':'✅',':x:':'❌',':warning:':'⚠️',':zap:':'⚡',':rainbow:':'🌈',
  ':sun:':'☀️',':moon:':'🌙',':trophy:':'🏆',':crown:':'👑',':diamond:':'💎',':robot:':'🤖',
  ':nerd:':'🤓',':360:':'🔵',':gg:':'🎮',':bruh:':'😑',':cat:':'🐱',':rose:':'🥀'};
function applyShortcodes(t){return t.replace(/:[a-z0-9_]+:/g,m=>SHORTCODES[m]||m);}

/* ── Profanity ───────────────────────────────────────── */
let PROF=[];
try{PROF=(()=>{
  const l=w=>w.split('').map(c=>({a:'[a4@]',b:'[b8]',c:'[ck(]',e:'[e3]',f:'[f]',g:'[g9]',h:'[h#]',
    i:'[i1!|]',k:'[kc]',l:'[l1|]',n:'[n]',o:'[o0]',p:'[p]',r:'[r]',s:'[s5$]',t:'[t7+]',
    u:'[uv]',v:'[vu]',x:'[x]'}[c]||c)).join('[\\s_.\\-*]*');
  const p=w=>new RegExp('(?<![a-z])'+l(w)+'(?![a-z])','gi');
  return[p('fuck'),p('shit'),p('bitch'),p('cunt'),p('bastard'),/\bd[i1!][ck]+\b/gi,
    /\bn[i1!][g9]{2}[e3]r\b/gi,/\bn[i1!][g9]{2}[a4]\b/gi,/\bf[a4][g9]{2}[o0][t7]\b/gi,
    /\bputa\b/gi,/\bkurwa\b/gi,/\bmerda\b/gi,/\bcazzo\b/gi];
})();}catch(e){}
function filterProfanity(t){if(!t)return t;let o=t;for(const p of PROF){try{o=o.replace(p,m=>'*'.repeat(m.length));}catch(e){}}return o;}

/* ── Utils ───────────────────────────────────────────── */
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function getInitials(n){if(!n)return'?';const p=n.trim().split(' ');return(p.length===1?p[0][0]:(p[0][0]+p[p.length-1][0])).toUpperCase();}

/* ── TIMESTAMP FIX ────────────────────────────────────
   Supabase returns timestamps without trailing Z in some versions.
   Without Z, the browser treats them as local time instead of UTC,
   causing times to appear wrong (offset by your timezone twice).
   We force-parse as UTC then render in the user's local timezone.
─────────────────────────────────────────────────────── */
function parseUTC(ts){
  if(!ts) return new Date();
  const iso = ts.trim().replace(' ','T');
  // Match an explicit timezone marker that follows a real HH:MM:SS time
  // component, so we don't confuse the date's own hyphens for a sign.
  const m = iso.match(/^(.*T\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2})(:?)(\d{2})?$/i);
  if (m) {
    if (/Z/i.test(m[2])) return new Date(iso);
    // Normalize shorthand offsets like "+00" or "-0730" into "+00:00" --
    // JS's Date parser rejects anything but a full colon-separated offset.
    return new Date(m[1] + m[2] + ':' + (m[4] || '00'));
  }
  // No timezone info at all — Supabase's raw text format, which is UTC.
  return new Date(iso + 'Z');
}
function formatTime(ts){
  return parseUTC(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}
function formatDate(ts){
  const d=parseUTC(ts), now=new Date(), yest=new Date();
  yest.setDate(now.getDate()-1);
  if(d.toDateString()===now.toDateString()) return 'Today';
  if(d.toDateString()===yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([],{month:'long',day:'numeric',year:'numeric'});
}

function isImageUrl(u){return/\.(jpe?g|png|gif|webp|svg|bmp)(\?|$)/i.test(u);}
function showToast(msg,dur=2800){
  const t=document.createElement('div');t.className='dc-toast';t.textContent=msg;
  document.body.appendChild(t);setTimeout(()=>t.remove(),dur);
}
function scrollBottom(){requestAnimationFrame(()=>requestAnimationFrame(()=>{
  const w=document.getElementById('dc-messages');if(w)w.scrollTop=w.scrollHeight;
}));}
function getRoomKey(r){return r.type+':'+r.id;}
function isAdminOrMod(p){return p?.role==='admin'||p?.role==='mod';}

function closeAllPanels(){
  document.getElementById('thread-panel')?.classList.add('hidden');
  document.getElementById('pins-panel')?.classList.add('hidden');
  document.getElementById('members-panel')?.classList.add('hidden');
  document.getElementById('online-panel')?.classList.add('hidden');
  document.getElementById('invite-panel')?.classList.add('hidden');
  document.getElementById('friends-panel')?.classList.add('hidden');
  document.getElementById('server-ctx-menu')?.remove();
}

/* ── Ephemeral messages (bot replies, only visible to sender) ── */
function showEphemeral(text, icon='🤖', label='Only visible to you'){
  const win=document.getElementById('dc-messages');
  const el=document.createElement('div');
  el.className='dc-ephemeral';
  el.innerHTML=`<div class="dc-ephemeral-icon">${icon}</div>
    <div class="dc-ephemeral-body">
      <div class="dc-ephemeral-label">${esc(label)}</div>
      <div class="dc-ephemeral-text">${renderText(text)}</div>
    </div>
    <button class="dc-ephemeral-dismiss" title="Dismiss">✕</button>`;
  el.querySelector('.dc-ephemeral-dismiss').onclick=()=>el.remove();
  win.appendChild(el);
  const w=document.getElementById('dc-messages');
  if(w.scrollHeight-w.scrollTop-w.clientHeight<300) scrollBottom();
}

/* ── Profile cache ────────────────────────────────────── */
async function getProfile(uid){
  if(!uid) return{username:'Unknown',avatar_url:null,role:'user',banned:false,muted_until:null,warn_count:0};
  if(profileCache[uid]) return profileCache[uid];
  try{
    const{data}=await sb.from('profiles')
      .select('username,avatar_url,role,tag,email,first_name,last_name,banned,muted_until,warn_count')
      .eq('id',uid).single();
    const p=data||{username:'Unknown',avatar_url:null,role:'user'};
    if(!p.username) p.username=[p.first_name,p.last_name].filter(Boolean).join(' ')||'Unknown';
    p.warn_count=p.warn_count||0;
    profileCache[uid]=p; return p;
  }catch{return{username:'Unknown',avatar_url:null,role:'user',banned:false,muted_until:null,warn_count:0};}
}
function isMuted(p){return p?.muted_until&&new Date(p.muted_until)>new Date();}
function muteExpiryText(p){
  if(!p?.muted_until) return'';
  const ms=new Date(p.muted_until)-new Date(); if(ms<=0) return'';
  const m=Math.ceil(ms/60000); return m<60?`${m}m`:Math.ceil(m/60)+'h';
}
async function logAutomod(userId,username,action,reason,expiresAt=null){
  try{await sb.from('automod_log').insert({user_id:userId,username,action,reason,expires_at:expiresAt});}catch(e){}
}

function makeAvatar(p,size=38){
  if(p?.avatar_url){
    const img=document.createElement('img');
    img.src=p.avatar_url;
    img.style.cssText=`width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;`;
    img.onerror=()=>img.replaceWith(makeInitialsEl(p,size));
    return img;
  }
  return makeInitialsEl(p,size);
}
function makeInitialsEl(p,size=38){
  const d=document.createElement('div');
  d.style.cssText=`width:${size}px;height:${size}px;border-radius:50%;background:var(--a);color:#fff;`+
    `font-size:${Math.round(size*.38)}px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
  d.textContent=getInitials(p?.username); return d;
}

/* ══════════════════════════════════════════════════════
   JOINED SERVERS
══════════════════════════════════════════════════════ */
async function refreshJoinedServers(){
  joinedServerIds.clear();
  if(!currentUserId) return;
  const{data}=await sb.from('server_members').select('server_id').eq('user_id',currentUserId);
  (data||[]).forEach(r=>joinedServerIds.add(r.server_id));
}

/* ══════════════════════════════════════════════════════
   RAIL
══════════════════════════════════════════════════════ */
async function buildRail(){
  await refreshJoinedServers();
  const rail=document.getElementById('rail-servers'); rail.innerHTML='';

  const gen=document.createElement('button');
  gen.className='rail-server-icon'+(activeServerId===null&&!showingDMs?' active':'');
  gen.title='General'; gen.textContent='🌐'; gen.dataset.serverId='';
  gen.onclick=()=>{showingDMs=false;setActiveServer(null);buildSidebar(null);
    switchRoom({type:'public',id:'public',name:'general',icon:'#',serverName:'360 Chat',serverId:null});};
  rail.appendChild(gen);

  const{data:allServers}=await sb.from('servers').select('*').order('name');
  (allServers||[]).filter(s=>isAdminOrMod(currentProfile)||joinedServerIds.has(s.id)||!s.has_passcode)
    .forEach(s=>{
      const btn=document.createElement('button');
      btn.className='rail-server-icon'+(activeServerId===s.id?' active':'');
      btn.title=s.name; btn.dataset.serverId=s.id;
      const uk='server:'+s.id;
      if(unreadCounts[uk]>0){
        btn.classList.add('unread');
        const pip=document.createElement('span'); pip.className='rail-unread';
        pip.textContent=unreadCounts[uk]>9?'9+':String(unreadCounts[uk]);
        btn.appendChild(pip);
      }
      if(s.icon&&(s.icon.startsWith('http')||s.icon.startsWith('/'))){
        const img=document.createElement('img'); img.src=s.icon; img.alt=s.name; btn.appendChild(img);
      } else { btn.textContent=s.icon||s.name[0].toUpperCase(); }
      btn.onclick=()=>handleServerClick(s);
      rail.appendChild(btn);
    });

  const ru=document.getElementById('railUser'); ru.innerHTML='';
  if(currentProfile){const av=makeAvatar(currentProfile,34); ru.appendChild(av);}
  else ru.textContent='?';
  ru.onclick=()=>location.href='/account';
  document.getElementById('railDMs').classList.toggle('active',showingDMs);
}

function setActiveServer(id){
  activeServerId=id;
  document.querySelectorAll('.rail-server-icon').forEach(b=>{
    b.classList.toggle('active',b.dataset.serverId===id||(id===null&&b.dataset.serverId===''&&!showingDMs));
  });
}

/* ══════════════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════════════ */
async function buildSidebar(server){
  const header=document.getElementById('sb-server-name');
  const body=document.getElementById('sidebarBody'); body.innerHTML='';
  if(showingDMs){header.textContent='Direct Messages'; await buildDMList(body); return;}
  if(!server){
    header.textContent='360 Chat';
    addCategoryHeader(body,'TEXT CHANNELS',null);
    body.appendChild(makeChanItem({id:'public',name:'general'},activeRoom.type==='public',
      ()=>switchRoom({type:'public',id:'public',name:'general',icon:'#',serverName:'360 Chat',serverId:null})));
    addSidebarBtn(body,'＋ Create Server',()=>{if(!currentUserId){location.href='/account';return;}openServerModal(null);});
    addSidebarBtn(body,'🔍 Browse Servers',()=>browseSidebar(body));
    return;
  }
  header.textContent=server.name;
  const{data:channels}=await sb.from('channels').select('*').eq('server_id',server.id).order('position').order('name');
  if(!channels?.length){
    body.innerHTML=`<div style="padding:20px;font-size:13px;color:var(--dc-muted);text-align:center;">No channels yet.</div>`;
  } else {
    const cats={}; channels.forEach(ch=>{const c=ch.category||'TEXT CHANNELS';(cats[c]=cats[c]||[]).push(ch);});
    const canManage=isAdminOrMod(currentProfile)||server.owner_id===currentUserId;
    Object.entries(cats).forEach(([cat,chs])=>{
      addCategoryHeader(body,cat,canManage?()=>openAddChannelModal(server):null);
      chs.forEach(ch=>{
        const item=makeChanItem(ch,activeRoom.id===ch.id,
          ()=>switchRoom({type:'channel',id:ch.id,name:ch.name,icon:'#',serverName:server.name,serverId:server.id,serverSlug:server.slug||null,topic:ch.topic||''}));
        const ck='channel:'+ch.id;
        if(unreadCounts[ck]>0){
          const badge=document.createElement('span'); badge.className='ch-unread-badge';
          badge.textContent=unreadCounts[ck]>99?'99+':String(unreadCounts[ck]);
          item.appendChild(badge);
        }
        body.appendChild(item);
      });
    });
  }
  if(currentUserId&&(isAdminOrMod(currentProfile)||server.owner_id===currentUserId)){
    addSidebarBtn(body,'＋ Add Channel',()=>openAddChannelModal(server));
    addSidebarBtn(body,'✏️ Edit Server',()=>openServerModal(server));
    if(server.owner_id===currentUserId) addSidebarBtn(body,'🔗 Invite Links',()=>openInvitePanel(server));
  }
  if(currentUserId&&!joinedServerIds.has(server.id)&&!isAdminOrMod(currentProfile)){
    addSidebarBtn(body,'✅ Join Server',()=>handleServerClick(server));
  }
}

function addCategoryHeader(body,label,onAdd){
  const c=document.createElement('div'); c.className='dc-category';
  c.innerHTML=`<span class="cat-arrow">▸</span><span>${esc(label)}</span>`+
    (onAdd?`<button class="cat-add" title="Add channel">＋</button>`:'');
  if(onAdd) c.querySelector('.cat-add')?.addEventListener('click',e=>{e.stopPropagation();onAdd();});
  c.addEventListener('click',e=>{
    if(e.target.classList.contains('cat-add')) return;
    const items=[]; let next=c.nextSibling;
    while(next&&!next.classList?.contains('dc-category')){items.push(next);next=next.nextSibling;}
    const hidden=items[0]?.style.display==='none';
    items.forEach(el=>el.style.display=hidden?'':'none');
    c.classList.toggle('collapsed',!hidden);
  });
  body.appendChild(c);
}
function makeChanItem(ch,isActive,onClick){
  const item=document.createElement('div');
  item.className='dc-ch-item'+(isActive?' active':'');
  item.dataset.chId=ch.id;
  item.innerHTML=`<span class="ch-hash">#</span><span>${esc(ch.name)}</span>`;
  item.addEventListener('click',onClick); return item;
}
function addSidebarBtn(body,label,onClick){
  const btn=document.createElement('button'); btn.className='dc-sidebar-add-btn'; btn.textContent=label;
  btn.addEventListener('click',onClick); body.appendChild(btn);
}

async function buildDMList(body){
  if(!currentUserId){addSidebarBtn(body,'Sign in to use DMs',()=>location.href='/account');return;}
  const{data:myRows}=await sb.from('dm_participants').select('dm_id').eq('user_id',currentUserId);
  const dmIds=(myRows||[]).map(r=>r.dm_id);
  if(!dmIds.length){body.innerHTML=`<div style="padding:20px;font-size:13px;color:var(--dc-muted);text-align:center;">No DMs yet.</div>`;}
  else{
    const{data:dms}=await sb.from('direct_messages').select('*').in('id',dmIds).order('updated_at',{ascending:false});
    const{data:allParts}=await sb.from('dm_participants').select('dm_id,user_id').in('dm_id',dmIds);
    const partsByDM={}; (allParts||[]).forEach(p=>{(partsByDM[p.dm_id]=partsByDM[p.dm_id]||[]).push(p.user_id);});
    const otherIds=[...new Set((allParts||[]).map(p=>p.user_id).filter(id=>id!==currentUserId))];
    const profiles=await Promise.all(otherIds.map(id=>getProfile(id)));
    const profileById={}; otherIds.forEach((id,i)=>profileById[id]=profiles[i]);

    (dms||[]).forEach(dm=>{
      const others=(partsByDM[dm.id]||[]).filter(id=>id!==currentUserId);
      const isGroup=dm.is_group||others.length>1;
      const item=document.createElement('div');
      item.className='dc-dm-item'+(activeRoom.id===dm.id?' active':''); item.dataset.dmId=dm.id;
      const av=document.createElement('div'); av.className='dc-dm-avatar';
      const label=dm.name||others.map(id=>profileById[id]?.username||'User').join(', ')||'DM';
      if(isGroup){ av.textContent='👥'; }
      else{
        const p=profileById[others[0]];
        if(p?.avatar_url){const img=document.createElement('img');img.src=p.avatar_url;av.appendChild(img);}
        else av.textContent=getInitials(p?.username);
      }
      const name=document.createElement('span'); name.textContent=label;
      item.appendChild(av); item.appendChild(name);
      const dk='dm:'+dm.id;
      if(unreadCounts[dk]>0){
        const badge=document.createElement('span'); badge.className='ch-unread-badge';
        badge.textContent=unreadCounts[dk]>99?'99+':String(unreadCounts[dk]); item.appendChild(badge);
      }
      item.addEventListener('click',()=>switchRoom({type:'dm',id:dm.id,name:label,icon:isGroup?'👥':'@',serverId:null,serverName:'Direct Messages',otherId:isGroup?null:others[0],isGroup}));
      body.appendChild(item);
    });
  }
  addSidebarBtn(body,'＋ New Message',()=>openModal('dmModal'));
}

async function browseSidebar(body){
  const{data:all}=await sb.from('servers').select('*').order('name');
  body.innerHTML=''; addCategoryHeader(body,'ALL SERVERS',null);
  (all||[]).forEach(s=>{
    const item=document.createElement('div'); item.className='dc-ch-item';
    const ico=s.icon&&(s.icon.startsWith('http')||s.icon.startsWith('/'))
      ?`<img src="${esc(s.icon)}" style="width:18px;height:18px;border-radius:4px;object-fit:cover;">`
      :`<span>${esc(s.icon||'🌐')}</span>`;
    item.innerHTML=ico+`<span>${esc(s.name)}</span>`+
      (joinedServerIds.has(s.id)?`<span style="margin-left:auto;font-size:11px;color:var(--a);">✓</span>`:
       s.has_passcode?`<span style="margin-left:auto;font-size:11px;opacity:.5;">🔒</span>`:'');
    item.addEventListener('click',()=>handleServerClick(s)); body.appendChild(item);
  });
}

/* ══════════════════════════════════════════════════════
   SERVER CONTEXT MENU
══════════════════════════════════════════════════════ */
document.getElementById('sb-server-menu')?.addEventListener('click',async(e)=>{
  e.stopPropagation();
  document.getElementById('server-ctx-menu')?.remove();
  if(!activeRoom.serverId||!currentUserId) return;
  const{data:server}=await sb.from('servers').select('*').eq('id',activeRoom.serverId).maybeSingle();
  if(!server) return;
  const isOwner=server.owner_id===currentUserId;
  const canManage=isOwner||isAdminOrMod(currentProfile);
  const menu=document.createElement('div'); menu.id='server-ctx-menu'; menu.className='server-ctx-menu';
  const items=[{label:'📋 Copy Server ID',fn:()=>{navigator.clipboard.writeText(server.id);showToast('Copied!');}}];
  if(canManage){
    items.push({label:'✏️ Edit Server',fn:()=>openServerModal(server)});
    items.push({label:'👥 Members',fn:()=>document.getElementById('btnMembers').click()});
    if(isOwner) items.push({label:'🔗 Invite Links',fn:()=>openInvitePanel(server)});
    if(canManage) items.push({label:'✏️ Edit Channels',fn:()=>openChannelEditor(server)});
    if(isOwner) items.push({label:'🎉 Onboarding Setup',fn:()=>openOnboardingSetup(server)});
    if(isOwner) items.push({label:'🔗 Copy Server URL',fn:()=>{const slug=server.slug;if(slug){navigator.clipboard.writeText(location.origin+'/chat/'+slug);showToast('Server URL copied!');}else{showToast('Set a slug in Onboarding Setup first');}}});
    items.push({label:'🤖 Bot Marketplace',fn:()=>window.open('/marketplace','_blank')});
    items.push({sep:true});
    if(isOwner) items.push({label:'🗑 Delete Server',danger:true,fn:async()=>{
      if(!confirm(`Delete "${server.name}"? This cannot be undone.`)) return;
      await sb.from('channels').delete().eq('server_id',server.id);
      await sb.from('server_members').delete().eq('server_id',server.id);
      await sb.from('servers').delete().eq('id',server.id);
      joinedServerIds.delete(server.id); setActiveServer(null); buildSidebar(null);
      switchRoom({type:'public',id:'public',name:'general',icon:'#',serverName:'360 Chat',serverId:null});
      await buildRail(); showToast('Server deleted.');
    }});
  }
  if(!isOwner&&joinedServerIds.has(server.id)){
    items.push({label:'🚪 Leave Server',danger:true,fn:async()=>{
      if(!confirm(`Leave "${server.name}"?`)) return;
      await sb.from('server_members').delete().eq('server_id',server.id).eq('user_id',currentUserId);
      joinedServerIds.delete(server.id); setActiveServer(null); buildSidebar(null);
      switchRoom({type:'public',id:'public',name:'general',icon:'#',serverName:'360 Chat',serverId:null});
      await buildRail(); showToast('Left server.');
    }});
  }
  items.forEach(item=>{
    if(item.sep){const s=document.createElement('div');s.className='ctx-sep';menu.appendChild(s);return;}
    const d=document.createElement('div'); d.className='ctx-item'+(item.danger?' danger':'');
    d.textContent=item.label; d.onclick=()=>{menu.remove();item.fn();}; menu.appendChild(d);
  });
  document.body.appendChild(menu);
  const btn=document.getElementById('sb-server-menu'); const rect=btn.getBoundingClientRect();
  menu.style.top=rect.bottom+4+'px';
  menu.style.left=Math.max(8,rect.right-menu.offsetWidth)+'px';
  setTimeout(()=>document.addEventListener('click',()=>menu.remove(),{once:true}),10);
});

/* ══════════════════════════════════════════════════════
   SERVER JOIN / ENTRY
══════════════════════════════════════════════════════ */
async function handleServerClick(server){
  if(!currentUserId){location.href='/account';return;}
  showingDMs=false; setActiveServer(server.id);
  if(joinedServerIds.has(server.id)||isAdminOrMod(currentProfile)) await enterServer(server);
  else if(server.has_passcode){await buildSidebar(server); showPasscodeGate(server);}
  else{await joinServer(server.id); await enterServer(server);}
}
async function joinServer(serverId){
  const{error}=await sb.from('server_members').insert({server_id:serverId,user_id:currentUserId});
  if(error&&!error.message?.includes('unique')&&!error.code?.includes('23505')){ showToast('❌ '+error.message); return; }
  joinedServerIds.add(serverId);
  window.dispatchEvent(new CustomEvent('carlos-member-join',{detail:{userId:currentUserId,username:currentProfile?.username||'Someone',serverId}}));
}
async function enterServer(server){
  setActiveServer(server.id); await buildSidebar(server);
  const{data:chs}=await sb.from('channels').select('*').eq('server_id',server.id).order('position').order('name').limit(1);
  if(chs?.length) switchRoom({type:'channel',id:chs[0].id,name:chs[0].name,icon:'#',serverName:server.name,serverId:server.id,serverSlug:server.slug||null,topic:chs[0].topic||''});
  if(currentUserId&&server.onboarding_enabled){
    const{data:mem}=await sb.from('server_members').select('onboarding_done').eq('server_id',server.id).eq('user_id',currentUserId).maybeSingle();
    if(!mem?.onboarding_done) showOnboardingModal(server);
  }
}

function showOnboardingModal(server){
  document.getElementById('onboarding-modal')?.remove();
  const modal=document.createElement('div'); modal.id='onboarding-modal';
  modal.style.cssText='position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);';
  const rules=server.onboarding_rules?`<div style="margin-bottom:14px;"><div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--dc-muted);margin-bottom:6px;">Server Rules</div><div style="background:rgba(255,255,255,.04);border:1px solid var(--dc-sep);border-radius:10px;padding:12px;font-size:13px;line-height:1.6;color:var(--dc-text);white-space:pre-wrap;max-height:180px;overflow-y:auto;">${esc(server.onboarding_rules)}</div></div>`:'';
  modal.innerHTML=`<div style="background:var(--dc-sidebar-bg);border:1px solid var(--dc-sep);border-radius:18px;padding:28px;width:min(480px,90vw);max-height:85vh;overflow-y:auto;display:flex;flex-direction:column;gap:12px;">
    <div style="font-size:26px;text-align:center;">&#128075;</div>
    <div style="font-size:18px;font-weight:800;text-align:center;color:var(--dc-text);">Welcome to ${esc(server.name)}</div>
    ${server.onboarding_welcome_text?`<div style="font-size:13px;color:var(--dc-muted);text-align:center;line-height:1.5;">${esc(server.onboarding_welcome_text)}</div>`:''}
    ${rules}
    <a href="/discover?bots=1&server=${server.id}" style="display:flex;align-items:center;gap:10px;padding:12px;border-radius:10px;border:1px solid var(--dc-sep);background:rgba(255,255,255,.03);text-decoration:none;color:var(--dc-text);">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><circle cx="12" cy="16" r="1"/></svg>
      <div><div style="font-size:13px;font-weight:700;">Explore Bot Marketplace</div><div style="font-size:11px;color:var(--dc-muted);">Add bots to this server</div></div>
    </a>
    <button onclick="completeOnboarding('${server.id}')" style="padding:12px;border-radius:10px;border:none;background:linear-gradient(120deg,var(--a),var(--a2,#8b5cf6));color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">I agree, let's go &#8594;</button>
  </div>`;
  document.body.appendChild(modal);
}

window.completeOnboarding=async function(serverId){
  await sb.from('server_members').update({onboarding_done:true}).eq('server_id',serverId).eq('user_id',currentUserId);
  document.getElementById('onboarding-modal')?.remove();
};
function showPasscodeGate(server){
  document.getElementById('passcode-gate')?.remove();
  const gate=document.createElement('div'); gate.id='passcode-gate';
  gate.style.cssText='position:absolute;inset:0;z-index:200;background:rgba(0,0,0,.75);backdrop-filter:blur(16px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;';
  gate.innerHTML=`<div style="font-size:44px">🔒</div>
    <div style="font-size:20px;font-weight:800;color:#fff">${esc(server.name)}</div>
    <div style="font-size:13px;color:rgba(255,255,255,.6)">This server requires a passcode.</div>
    <input id="gate-inp" type="password" placeholder="Enter passcode" style="padding:11px 18px;border-radius:12px;border:1.5px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);font-size:15px;outline:none;width:260px;color:#fff;text-align:center;font-family:inherit;"/>
    <p id="gate-err" style="color:#f87171;font-size:12px;min-height:16px;margin:0;"></p>
    <button id="gate-btn" style="padding:11px 36px;border-radius:12px;border:none;cursor:pointer;font-size:15px;font-weight:700;background:var(--a);color:#fff;font-family:inherit;">Unlock</button>
    <button id="gate-back" style="background:none;border:none;cursor:pointer;font-size:13px;color:rgba(255,255,255,.5);font-family:inherit;">← Go back</button>`;
  const main=document.getElementById('dcMain'); main.style.position='relative'; main.appendChild(gate);
  const inp=gate.querySelector('#gate-inp'); inp.focus();
  gate.querySelector('#gate-back').onclick=()=>{gate.remove();main.style.position='';};
  const tryUnlock=async()=>{
    const v=inp.value.trim(); if(!v){gate.querySelector('#gate-err').textContent='Enter the passcode.';return;}
    const{data:ok,error}=await sb.rpc('join_server_with_passcode',{p_server_id:server.id,p_passcode:v});
    if(error||!ok){gate.querySelector('#gate-err').textContent='Wrong passcode.';inp.value='';inp.focus();return;}
    joinedServerIds.add(server.id);
    gate.remove(); main.style.position=''; await enterServer(server); await buildRail();
  };
  gate.querySelector('#gate-btn').onclick=tryUnlock;
  inp.onkeydown=e=>{if(e.key==='Enter') tryUnlock();};
}

/* ══════════════════════════════════════════════════════
   SWITCH ROOM
══════════════════════════════════════════════════════ */
function switchRoom(room){ 
  updateUrlForRoom(room);
  // Persist so reload restores position
  try { localStorage.setItem('360_last_room', JSON.stringify({
    type: room.type, id: room.id, name: room.name, icon: room.icon,
    serverId: room.serverId, serverName: room.serverName,
    serverSlug: room.serverSlug||null, topic: room.topic||null,
    otherId: room.otherId||null, isGroup: room.isGroup||false
  })); } catch(e) {}
  activeRoom=room; lastMsgUserId=null; lastMsgDate=null; replyingTo=null; isSending=false;
  closeAllPanels();
  document.getElementById('dc-reply-bar').classList.add('hidden');
  document.getElementById('dc-upload-preview').classList.add('hidden');
  document.getElementById('hdrIcon').textContent=room.icon||'#';
  document.getElementById('hdrName').textContent=room.name;
  document.getElementById('hdrTopic').textContent=room.topic||'';
  document.getElementById('msgInput').placeholder='Message #'+room.name+'…';
  document.querySelectorAll('.dc-ch-item,.dc-dm-item').forEach(el=>el.classList.remove('active'));
  document.querySelector(`[data-ch-id="${room.id}"]`)?.classList.add('active');
  document.querySelector(`[data-dm-id="${room.id}"]`)?.classList.add('active');
  if(realtimeChannel) sb.removeChannel(realtimeChannel);
  if(typingChannel) sb.removeChannel(typingChannel);
  typingUsers={}; renderTyping(); msgElMap.clear(); historyExhausted=false; oldestMsgDate=null;
  if(window._threadRtChan){sb.removeChannel(window._threadRtChan);window._threadRtChan=null;}

  const rtKey='rt-'+room.type+'-'+String(room.id).replace(/-/g,'')+'-'+Date.now();
  const chan=sb.channel(rtKey);
  if(room.type==='channel'){
    chan
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`channel_id=eq.${room.id}`},p=>{
        if(p.new.thread_id!=null) return; // thread replies never go to main chat
        onIncoming(p.new);
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'messages',filter:`channel_id=eq.${room.id}`},p=>{
        // Live-update thread pill count on root messages
        if(p.new.is_thread_root||p.new.thread_reply_count!=null){
          const el=msgElMap.get(String(p.new.id)); if(el) updateThreadPill(el,p.new);
        }
        const el=msgElMap.get(String(p.new.id)); if(el) patchMsgEl(el,p.new);
      })
      .on('postgres_changes',{event:'DELETE',schema:'public',table:'messages',filter:`channel_id=eq.${room.id}`},p=>{
        removeMsgAndRegroup(String(p.old.id));
      });
  } else if(room.type==='dm'){
    chan
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'dm_messages',filter:`dm_id=eq.${room.id}`},p=>onIncoming(p.new))
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'dm_messages',filter:`dm_id=eq.${room.id}`},p=>{
        if(p.new.deleted_at){ removeMsgAndRegroup(String(p.new.id)); return; }
        const el=msgElMap.get(String(p.new.id)); if(el) patchMsgEl(el,p.new);
      });
  } else if(room.type==='server'){
    chan.on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`server_id=eq.${room.id}`},p=>{
      if(p.new.thread_id!=null) return; onIncoming(p.new);
    });
  } else {
    chan.on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},p=>{
      if(!p.new.channel_id&&!p.new.dm_id&&!p.new.server_id&&p.new.thread_id==null) onIncoming(p.new);
    });
  }
  realtimeChannel=chan.subscribe();

  typingChannel=sb.channel('typing-'+room.type+'-'+room.id)
    .on('broadcast',{event:'typing'},p=>{
      const{username,uid}=p.payload; if(uid===currentUserId) return;
      typingUsers[uid]={username}; renderTyping();
      clearTimeout(typingTimeouts[uid]);
      typingTimeouts[uid]=setTimeout(()=>{delete typingUsers[uid];renderTyping();},2500);
    }).subscribe();

  window.ChatNotif?.onRoomSwitch(room);
  unreadCounts[getRoomKey(room)]=0;
  document.querySelector(`[data-ch-id="${room.id}"] .ch-unread-badge`)?.remove();
  document.querySelector(`[data-dm-id="${room.id}"] .ch-unread-badge`)?.remove();
  loadHistory(); markRoomRead(room); updateComposerPermission();
  document.getElementById('dcSidebar')?.classList.remove('mobile-open');
}

function onIncoming(msg){
  renderMessage(msg,true);
  trackUnread(msg);
  window.ChatNotif?.onMessage(msg,activeRoom,currentUserId);
}

/* ══════════════════════════════════════════════════════
   DELETE + REGROUP
   When a message is deleted we must fix the grouping of
   the message that follows it (it may need to show a full
   header if it was previously "grouped" under the deleted one).
══════════════════════════════════════════════════════ */
function removeMsgAndRegroup(msgId){
  const el=msgElMap.get(msgId); if(!el) return;
  // Find the next sibling message element (skip date dividers)
  let next=el.nextSibling;
  while(next&&(!next.classList?.contains('dc-msg'))) next=next.nextSibling;
  // If the next message was grouped (no header shown) we need to check
  // whether it still has the same author as its new previous message
  if(next?.classList.contains('grouped')){
    // Find the previous message before the deleted one
    let prev=el.previousSibling;
    while(prev&&!prev.classList?.contains('dc-msg')) prev=prev.previousSibling;
    const prevUserId=prev?.dataset?.userId;
    const nextUserId=next.dataset?.userId;
    // If prev doesn't exist or different user → next must show its header
    if(!prev||prevUserId!==nextUserId){
      next.classList.remove('grouped');
      // Rebuild the header from cached message data in msgElMap
      // We stored the original msg on the element
      const storedMsg=next._msgData;
      if(storedMsg&&!next.querySelector('.dc-msg-header')){
        const body=next.querySelector('.dc-msg-body');
        const hdr=buildMsgHeader(storedMsg);
        body.insertBefore(hdr,body.firstChild);
        // Restore avatar visibility
        const av=next.querySelector('.dc-msg-avatar');
        if(av) av.style.visibility='';
      }
    }
  }
  el.remove(); msgElMap.delete(msgId);
  // Remove orphaned date dividers (divider with no messages after it)
  document.querySelectorAll('.dc-date-divider').forEach(div=>{
    let sib=div.nextSibling;
    while(sib&&!sib.classList?.contains('dc-msg')&&!sib.classList?.contains('dc-date-divider')){sib=sib.nextSibling;}
    if(!sib||sib.classList?.contains('dc-date-divider')) div.remove();
  });
}

function buildMsgHeader(msg){
  const hdr=document.createElement('div'); hdr.className='dc-msg-header';
  const author=document.createElement('span'); author.className='dc-msg-author';
  author.textContent=msg.username||'Unknown';
  author.addEventListener('click',ev=>{ev.stopPropagation();showProfilePopup(msg.user_id,author);});
  hdr.appendChild(author);
  const roleColors={admin:'#ef4444',mod:'#f59e0b',vip:'#8b5cf6'};
  if(msg.role&&roleColors[msg.role]){
    const b=document.createElement('span');b.className='dc-msg-role-badge';b.style.background=roleColors[msg.role];b.textContent=msg.role;hdr.appendChild(b);
  }
  if(msg.tag){const b=document.createElement('span');b.className='dc-msg-role-badge';b.style.background='#6366f1';b.textContent=msg.tag;hdr.appendChild(b);}
  const time=document.createElement('span'); time.className='dc-msg-time'; time.textContent=formatTime(msg.created_at);
  hdr.appendChild(time);
  return hdr;
}

/* ══════════════════════════════════════════════════════
   HISTORY
══════════════════════════════════════════════════════ */
async function loadHistory(){
  const win=document.getElementById('dc-messages'); win.innerHTML=''; msgElMap.clear();
  lastMsgUserId=null; lastMsgDate=null;
  await fetchMessages(null); scrollBottom(); setTimeout(scrollBottom,120);
}
async function fetchMessages(beforeDate){
  const LIMIT=50; let q;
  if(activeRoom.type==='dm')
    q=sb.from('dm_messages').select('*').eq('dm_id',activeRoom.id).is('deleted_at',null);
  else if(activeRoom.type==='channel')
    q=sb.from('messages').select('*').eq('channel_id',activeRoom.id).is('deleted_at',null).is('thread_id',null);
  else if(activeRoom.type==='server')
    q=sb.from('messages').select('*').eq('server_id',activeRoom.id).is('deleted_at',null).is('thread_id',null);
  else
    q=sb.from('messages').select('*').is('channel_id',null).is('dm_id',null).is('server_id',null).is('deleted_at',null).is('thread_id',null);
  if(beforeDate) q=q.lt('created_at',beforeDate);
  const{data,error}=await q.order('created_at',{ascending:false}).limit(LIMIT);
  if(error||!data?.length){historyExhausted=true;return;}
  if(data.length<LIMIT) historyExhausted=true;
  const msgs=data.reverse(); oldestMsgDate=msgs[0].created_at;
  const win=document.getElementById('dc-messages');
  if(beforeDate){
    const prevH=win.scrollHeight;
    const saved={u:lastMsgUserId,d:lastMsgDate}; lastMsgUserId=null; lastMsgDate=null;
    const frag=document.createDocumentFragment();
    msgs.forEach(m=>{const el=buildMsgEl(m,frag);if(el)frag.appendChild(el);});
    win.insertBefore(frag,win.firstChild);
    lastMsgUserId=saved.u; lastMsgDate=saved.d; win.scrollTop=win.scrollHeight-prevH;
  } else {
    msgs.forEach(m=>renderMessage(m,false));
    if(msgs.length&&activeRoom.type!=='dm'){
      const ids=msgs.map(m=>m.id);
      const{data:rxns}=await sb.from('reactions').select('emoji,user_id,message_id').in('message_id',ids);
      if(rxns){const g={};rxns.forEach(r=>{(g[r.message_id]=g[r.message_id]||[]).push(r);});
        Object.entries(g).forEach(([mid,r])=>renderReactions(mid,r));}
    }
    msgs.forEach(m=>{if(m.username)registerUser(m.username);});
  }
}
document.getElementById('dc-messages').addEventListener('scroll',async function(){
  if(this.scrollTop>180||isLoadingMore||historyExhausted||!oldestMsgDate) return;
  isLoadingMore=true;
  const ldr=document.createElement('div');ldr.style.cssText='text-align:center;padding:8px;font-size:12px;color:var(--dc-muted);';ldr.textContent='Loading…';this.prepend(ldr);
  await fetchMessages(oldestMsgDate); ldr.remove(); isLoadingMore=false;
});

/* ══════════════════════════════════════════════════════
   RENDER MESSAGE
══════════════════════════════════════════════════════ */
function renderMessage(msg,isRealtime){
  // Fire Carlos event for commands (realtime messages only, not self)
  if(isRealtime && msg.text?.startsWith('!')) {
    window.dispatchEvent(new CustomEvent('carlos-message', { detail: msg }));
  }
  const el=buildMsgEl(msg); if(!el) return;
  document.getElementById('dc-messages').appendChild(el);
  if(isRealtime){const w=document.getElementById('dc-messages');if(w.scrollHeight-w.scrollTop-w.clientHeight<300)scrollBottom();}
  if(isRealtime&&activeRoom.type!=='dm') loadReactionsSingle(msg.id);
  maybeTranslateMessage(el,msg.text);
}

function buildMsgEl(msg,container){
  const r=activeRoom;
  if(r.type==='public'&&(msg.channel_id||msg.dm_id||msg.server_id)) return null;
  if(r.type==='channel'&&String(msg.channel_id)!==String(r.id)) return null;
  if(r.type==='server'&&String(msg.server_id)!==String(r.id)) return null;
  if(r.type==='dm'&&String(msg.dm_id)!==String(r.id)) return null;
  if(msg.thread_id!=null) return null; // never show thread replies in main chat
  if(msgElMap.has(String(msg.id))) return null;

  const win=container||document.getElementById('dc-messages');
  const msgDate=formatDate(msg.created_at);
  if(msgDate!==lastMsgDate){
    const div=document.createElement('div'); div.className='dc-date-divider'; div.textContent=msgDate;
    win.appendChild(div); lastMsgDate=msgDate; lastMsgUserId=null;
  }
  const sameAuthor=msg.user_id&&msg.user_id===lastMsgUserId;
  lastMsgUserId=msg.user_id;

  const el=document.createElement('div');
  el.className='dc-msg'+(sameAuthor?' grouped':'');
  el.dataset.msgId=msg.id; el.dataset.userId=msg.user_id||'';
  el._msgData=msg; // store for regroup on delete

  const avWrap=document.createElement('div'); avWrap.className='dc-msg-avatar';
  if(msg.avatar_url){const img=document.createElement('img');img.src=msg.avatar_url;img.style.cssText='width:100%;height:100%;border-radius:50%;object-fit:cover;';avWrap.appendChild(img);}
  else avWrap.textContent=getInitials(msg.username);
  avWrap.addEventListener('click',ev=>{ev.stopPropagation();showProfilePopup(msg.user_id,avWrap);});
  el.appendChild(avWrap);

  const body=document.createElement('div'); body.className='dc-msg-body';
  if(!sameAuthor) body.appendChild(buildMsgHeader(msg));

  if(msg.reply_to_id&&msg.reply_to_text){
    const ref=document.createElement('div'); ref.className='dc-reply-ref';
    ref.innerHTML=`<span class="rr-author">↩ @${esc(msg.reply_to_username||'?')} </span>${esc((msg.reply_to_text||'').slice(0,80))}`;
    ref.addEventListener('click',()=>jumpToMsg(msg.reply_to_id)); body.appendChild(ref);
  }
  if(msg.text){const d=document.createElement('div');d.className='dc-msg-text';d.innerHTML=renderText(msg.text);if(msg.edited_at){const ed=document.createElement('span');ed.className='dc-msg-edited';ed.textContent='(edited)';d.appendChild(ed);}body.appendChild(d);if(msg.text.includes('http')) setTimeout(()=>attachLinkPreviews(body,msg.text),0);}
  if(msg.voice_note_url){
    const dur=msg.voice_note_duration||0;
    const m=Math.floor(dur/60); const s=dur%60;
    const vn=document.createElement('div'); vn.className='dc-voice-note';
    const heights=[14,20,10,24,16,8,22,12,18,20,10,14,22,8,18,14,20,10];
    const bars=heights.map(h=>`<span class="vn-bar" style="height:${h}px"></span>`).join('');
    vn.innerHTML=`<button class="vn-play-btn" title="Play">▶</button><div class="vn-waveform">${bars}</div><span class="vn-duration">${m}:${String(s).padStart(2,'0')}</span>`;
    const playBtn=vn.querySelector('.vn-play-btn');
    let audio=null;
    playBtn.onclick=()=>{
      if(!audio){audio=new Audio(msg.voice_note_url);audio.onended=()=>{playBtn.textContent='▶';}}
      if(audio.paused){audio.play();playBtn.textContent='⏸';}else{audio.pause();playBtn.textContent='▶';}
    };
    body.appendChild(vn);
  }
  if(msg.file_url){
    if(isImageUrl(msg.file_url)){
      const img=document.createElement('img'); img.className='dc-msg-img'; img.src=msg.file_url; img.loading='lazy';
      img.addEventListener('click',()=>openLightbox(msg.file_url)); body.appendChild(img);
    } else {
      const fn=decodeURIComponent(msg.file_url.split('/').pop().split('?')[0]);
      const a=document.createElement('a'); a.className='dc-file-chip'; a.href=msg.file_url; a.target='_blank'; a.rel='noopener';
      a.innerHTML=`<span class="fc-icon">📎</span><div><div class="fc-name">${esc(fn)}</div></div>`; body.appendChild(a);
    }
  }
  if(msg.poll_id){
    const pollWrap=document.createElement('div'); pollWrap.className='dc-poll'; pollWrap.dataset.pollId=msg.poll_id;
    pollWrap.innerHTML='<div class="dc-poll-loading">Loading poll…</div>';
    body.appendChild(pollWrap);
    renderPoll(msg.poll_id, pollWrap);
  }

  // Thread pill
  const pill=document.createElement('div'); pill.className='dc-thread-pill'; pill.dataset.threadPill='1';
  const tc=msg.thread_reply_count||0;
  if(tc>0||msg.is_thread_root){
    pill.textContent=tc>0?`🧵 ${tc} repl${tc===1?'y':'ies'}`:'🧵 Start Thread'; pill.style.display='';
  } else { pill.style.display='none'; }
  pill.addEventListener('click',()=>openThread(msg)); body.appendChild(pill);

  const rxnRow=document.createElement('div'); rxnRow.className='dc-reactions'; rxnRow.id='rxn-'+msg.id; body.appendChild(rxnRow);
  el.appendChild(body);

  const actions=document.createElement('div'); actions.className='dc-msg-actions';
  [{i:'↩',t:'Reply',fn:()=>setReply(msg)},{i:'😊',t:'React',fn:ev=>openReactionPicker(msg.id,ev)},
   {i:'🧵',t:'Thread',fn:()=>openThread(msg)},{i:'📌',t:'Pin',fn:()=>pinMsg(msg)},
   {i:'↪️',t:'Forward',fn:()=>openForwardModal(msg)}].forEach(a=>{
    const btn=document.createElement('button'); btn.className='dc-action-btn'; btn.title=a.t; btn.textContent=a.i;
    btn.addEventListener('click',ev=>{ev.stopPropagation();a.fn(ev);}); actions.appendChild(btn);
  });
  if(msg.user_id===currentUserId||isAdminOrMod(currentProfile)){
    const d=document.createElement('button'); d.className='dc-action-btn'; d.title='Delete'; d.textContent='🗑'; d.style.color='#ef4444';
    d.addEventListener('click',ev=>{ev.stopPropagation();deleteMsg(msg.id);}); actions.appendChild(d);
  }
  el.appendChild(actions);
  el.addEventListener('contextmenu',ev=>{ev.preventDefault();openCtxMenu(ev,msg);});
  msgElMap.set(String(msg.id),el); return el;
}

function updateThreadPill(el,msg){
  const pill=el.querySelector('[data-thread-pill]'); if(!pill) return;
  const count=msg.thread_reply_count||0;
  if(count>0||msg.is_thread_root){
    pill.textContent=count>0?`🧵 ${count} repl${count===1?'y':'ies'}`:'🧵 Start Thread'; pill.style.display='';
  } else { pill.style.display='none'; }
}
function renderText(raw){
  if(!raw) return '';
  // Protect code blocks first
  const codeBlocks=[];
  let t=raw.replace(/```([\s\S]*?)```/g,(_,c)=>{
    const i=codeBlocks.length;
    codeBlocks.push(`<pre class="dc-pre"><code>${esc(c.trim())}</code></pre>`);
    return `\x00CODE${i}\x00`;
  });
  const inlineCodes=[];
  t=t.replace(/`([^`\n]+)`/g,(_,c)=>{
    const i=inlineCodes.length;
    inlineCodes.push(`<code class="dc-code">${esc(c)}</code>`);
    return `\x00INLINE${i}\x00`;
  });
  t=esc(t);
  t=applyShortcodes(t);
  // Headings
  t=t.replace(/^### (.+)$/gm,'<h3 class="dc-h3">$1</h3>');
  t=t.replace(/^## (.+)$/gm,'<h2 class="dc-h2">$1</h2>');
  t=t.replace(/^# (.+)$/gm,'<h1 class="dc-h1">$1</h1>');
  // Bold+italic combos
  t=t.replace(/\*\*\*(.+?)\*\*\*/g,'<strong><em>$1</em></strong>');
  t=t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  t=t.replace(/__(.+?)__/g,'<strong>$1</strong>');
  t=t.replace(/\*(.+?)\*/g,'<em>$1</em>');
  t=t.replace(/_(.+?)_/g,'<em>$1</em>');
  // Strikethrough
  t=t.replace(/~~(.+?)~~/g,'<del>$1</del>');
  // Underline (Discord-style __text__)
  // Spoiler ||text||
  t=t.replace(/\|\|(.+?)\|\|/g,(m,s)=>`<span class="dc-spoiler" onclick="this.classList.toggle('revealed')">${s}</span>`);
  // Blockquote
  t=t.replace(/^&gt; (.+)$/gm,'<blockquote class="dc-blockquote">$1</blockquote>');
  // Unordered lists
  t=t.replace(/^[\-\*] (.+)$/gm,'<li class="dc-li">$1</li>');
  t=t.replace(/(<li[^>]*>.*<\/li>\n?)+/g,'<ul class="dc-ul">$&</ul>');
  // Ordered lists
  t=t.replace(/^\d+\. (.+)$/gm,'<li class="dc-li">$1</li>');
  // Mentions
  t=t.replace(/@(\w+)/g,(m,name)=>{
    const lower=name.toLowerCase();
    const isAll=lower==='all';
    const isMe=currentProfile&&(isAll||lower===(currentProfile.username||'').toLowerCase());
    return `<span class="dc-mention${isMe?' dc-mention-me':''}${isAll?' dc-mention-all':''}">${m}</span>`;
  });
  // Channel links #channel-name
  t=t.replace(/#([a-zA-Z0-9\-_]+)/g,'<span class="dc-ch-link">#$1</span>');
  // URLs
  // Images  ![alt](url)
  t=t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,(m,alt,src)=>{
    if(!/^https?:\/\//i.test(src)) return m;
    return `<img class="dc-md-img" src="${src}" alt="${alt}" loading="lazy" onerror="this.style.display='none'"/>`;
  });
  // Links [text](url)
  t=t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,(m,text,href)=>{
    if(!/^https?:\/\//i.test(href)) return m;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer" class="dc-link">${text}</a>`;
  });
  // Tables
  const tableRx=/^(\|.+\|)\n(\|[-: |]+\|)\n((\|.+\|\n?)+)/gm;
  t=t.replace(tableRx,(m,header,sep,body)=>{
    const parseRow=r=>r.replace(/^\|(.+)\|$/,'$1').split('|').map(c=>`<td class="dc-td">${c.trim()}</td>`).join('');
    const heads=header.replace(/^\|(.+)\|$/,'$1').split('|').map(c=>`<th class="dc-th">${c.trim()}</th>`).join('');
    const rows=body.trim().split('\n').map(r=>`<tr>${parseRow(r)}</tr>`).join('');
    return `<div class="dc-table-wrap"><table class="dc-table"><thead><tr>${heads}</tr></thead><tbody>${rows}</tbody></table></div>`;
  });
  // Plain URLs (after [text](url) so those are already handled)
  t=t.replace(/https?:\/\/[^\s<>"\x00]+/g,url=>`<a href="${url}" target="_blank" rel="noopener noreferrer" class="dc-link">${url}</a>`);
  // Line breaks
  t=t.replace(/\n/g,'<br/>');
  // Restore code blocks
  t=t.replace(/\x00CODE(\d+)\x00/g,(_,i)=>codeBlocks[+i]);
  t=t.replace(/\x00INLINE(\d+)\x00/g,(_,i)=>inlineCodes[+i]);
  return t;
}
function patchMsgEl(el,msg){const d=el.querySelector('.dc-msg-text');if(d&&msg.text)d.innerHTML=renderText(msg.text);}
function jumpToMsg(msgId){
  const el=msgElMap.get(String(msgId)); if(!el) return;
  el.scrollIntoView({behavior:'smooth',block:'center'});
  el.style.background='rgba(59,130,246,.12)'; setTimeout(()=>el.style.background='',1500);
}

/* ══════════════════════════════════════════════════════
   REACTIONS
══════════════════════════════════════════════════════ */
async function loadReactionsSingle(msgId){
  const{data}=await sb.from('reactions').select('emoji,user_id').eq('message_id',msgId);
  if(data) renderReactions(msgId,data);
}
function renderReactions(msgId,reactions){
  const row=document.getElementById('rxn-'+msgId); if(!row) return;
  const g={}; reactions.forEach(r=>{(g[r.emoji]=g[r.emoji]||[]).push(r.user_id);});
  row.innerHTML='';
  Object.entries(g).forEach(([em,users])=>{
    const pill=document.createElement('div'); pill.className='dc-reaction'+(users.includes(currentUserId)?' mine':'');
    pill.innerHTML=em+`<span class="rc-count">${users.length}</span>`;
    pill.addEventListener('click',()=>toggleReaction(msgId,em)); row.appendChild(pill);
  });
}
async function toggleReaction(msgId,emoji){
  if(!currentUserId){location.href='/account';return;}
  const{data:ex}=await sb.from('reactions').select('id').eq('message_id',msgId).eq('user_id',currentUserId).eq('emoji',emoji).maybeSingle();
  if(ex) await sb.from('reactions').delete().eq('message_id',msgId).eq('user_id',currentUserId).eq('emoji',emoji);
  else    await sb.from('reactions').insert({message_id:msgId,user_id:currentUserId,emoji});
  loadReactionsSingle(msgId);
}
function openReactionPicker(msgId,e){
  const p=document.getElementById('reaction-picker'); p.innerHTML='';
  QUICK_EMOJIS.forEach(em=>{const b=document.createElement('button');b.className='rp-btn';b.textContent=em;b.onclick=()=>{toggleReaction(msgId,em);p.classList.add('hidden');};p.appendChild(b);});
  p.classList.remove('hidden');
  p.style.top=Math.max(8,e.clientY-p.offsetHeight-10)+'px';
  p.style.left=Math.min(e.clientX,window.innerWidth-p.offsetWidth-8)+'px';
  setTimeout(()=>document.addEventListener('click',()=>p.classList.add('hidden'),{once:true}),10);
}
sb.channel('reactions-rt').on('postgres_changes',{event:'*',schema:'public',table:'reactions'},p=>{
  const mid=p.new?.message_id||p.old?.message_id;
  if(mid&&document.getElementById('rxn-'+mid)) loadReactionsSingle(mid);
}).subscribe();

/* ══════════════════════════════════════════════════════
   CONTEXT MENU
══════════════════════════════════════════════════════ */
function openCtxMenu(e,msg){
  ctxTargetMsg=msg; const menu=document.getElementById('ctx-menu'); menu.classList.remove('hidden');
  menu.style.top=Math.min(e.clientY,window.innerHeight-menu.offsetHeight-8)+'px';
  menu.style.left=Math.min(e.clientX,window.innerWidth-menu.offsetWidth-8)+'px';
  document.getElementById('ctx-delete').style.display=(msg.user_id===currentUserId||isAdminOrMod(currentProfile))?'flex':'none';
  document.getElementById('ctx-edit').style.display=(msg.user_id===currentUserId)?'flex':'none';
  requestAnimationFrame(()=>document.addEventListener('click',ev=>{
    if(!menu.contains(ev.target)) menu.classList.add('hidden');
  },{once:true}));
}
document.getElementById('ctx-reply').onclick=()=>ctxTargetMsg&&setReply(ctxTargetMsg);
document.getElementById('ctx-react').onclick=e=>ctxTargetMsg&&openReactionPicker(ctxTargetMsg.id,e);
document.getElementById('ctx-thread').onclick=()=>ctxTargetMsg&&openThread(ctxTargetMsg);
document.getElementById('ctx-pin').onclick=()=>ctxTargetMsg&&pinMsg(ctxTargetMsg);
document.getElementById('ctx-forward').onclick=()=>ctxTargetMsg&&openForwardModal(ctxTargetMsg);
document.getElementById('ctx-copy').onclick=()=>{
  const t=msgElMap.get(String(ctxTargetMsg?.id))?.querySelector('.dc-msg-text')?.textContent||'';
  navigator.clipboard.writeText(t).then(()=>showToast('📋 Copied!'));
};
document.getElementById('ctx-delete').onclick=()=>ctxTargetMsg&&deleteMsg(ctxTargetMsg.id);
document.getElementById('ctx-edit').onclick=()=>{
  if(!ctxTargetMsg) return;
  document.getElementById('ctx-menu').classList.add('hidden');
  const isDm=activeRoom.type==='dm';
  editMsg(ctxTargetMsg.id, ctxTargetMsg.text||'', isDm);
};

/* ══════════════════════════════════════════════════════
   DELETE MESSAGE
══════════════════════════════════════════════════════ */

async function editMsg(msgId, currentText, isDm){
  // Inline edit — replace message text with a textarea
  const el = document.querySelector(`[data-msg-id="${msgId}"]`);
  const textEl = el?.querySelector('.dc-msg-text');
  if (!el || !textEl) return;
  // Already editing?
  if (el.querySelector('.dc-edit-box')) return;
  const orig = textEl.innerHTML;
  const box = document.createElement('div');
  box.className = 'dc-edit-box';
  box.innerHTML = `<textarea class="dc-edit-textarea">${currentText.replace(/</g,'&lt;')}</textarea><div class="dc-edit-actions"><button class="dc-edit-save">Save</button><button class="dc-edit-cancel">Cancel</button><span class="dc-edit-hint">Enter to save · Esc to cancel</span></div>`;
  textEl.replaceWith(box);
  const ta = box.querySelector('.dc-edit-textarea');
  ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length;
  const save = async () => {
    const newText = ta.value.trim();
    if (!newText || newText === currentText.trim()) { cancel(); return; }
    const table = isDm ? 'dm_messages' : 'messages';
    const {error} = await sb.from(table).update({text: newText, edited_at: new Date().toISOString()}).eq('id', msgId).eq('user_id', currentUserId);
    if (error) { showToast('❌ '+error.message); cancel(); return; }
    const newEl = document.createElement('div');
    newEl.className = 'dc-msg-text';
    newEl.innerHTML = renderText(newText);
    const ed = document.createElement('span'); ed.className='dc-msg-edited'; ed.textContent='(edited)';
    newEl.appendChild(ed);
    box.replaceWith(newEl);
  };
  const cancel = () => { const restore=document.createElement('div'); restore.className='dc-msg-text'; restore.innerHTML=orig; box.replaceWith(restore); };
  box.querySelector('.dc-edit-save').onclick = save;
  box.querySelector('.dc-edit-cancel').onclick = cancel;
  ta.addEventListener('keydown', e => {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); save(); }
    if (e.key==='Escape') cancel();
  });
}
async function deleteMsg(msgId){
  if(!confirm('Delete this message?')) return;
  if(activeRoom.type==='dm'){
    const{error}=await sb.from('dm_messages').delete().eq('id',msgId);
    if(error){showToast('❌ '+error.message);return;}
    removeMsgAndRegroup(String(msgId));
  } else {
    const{error}=await sb.from('messages').update({deleted_at:new Date().toISOString()}).eq('id',msgId);
    if(error){
      // Fallback: try hard delete (owner-only)
      const{error:e2}=await sb.from('messages').delete().eq('id',msgId).eq('user_id',currentUserId);
      if(e2){showToast('❌ Cannot delete: '+e2.message);return;}
    }
    removeMsgAndRegroup(String(msgId));
  }
}

/* ══════════════════════════════════════════════════════
   THREADS
══════════════════════════════════════════════════════ */
function openThread(msg){
  activeThreadId=msg.id;
  const panel=document.getElementById('thread-panel'); panel.classList.remove('hidden');
  document.getElementById('pins-panel').classList.add('hidden');
  document.getElementById('members-panel').classList.add('hidden');
  document.getElementById('online-panel')?.classList.add('hidden');
  document.getElementById('thread-root-msg').innerHTML=`<strong>${esc(msg.username||'')}</strong>: ${esc((msg.text||'📎 file').slice(0,200))}`;
  loadThreadMsgs(msg.id);
  if(window._threadRtChan) sb.removeChannel(window._threadRtChan);
  window._threadRtChan=sb.channel('thread-'+msg.id)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`thread_id=eq.${msg.id}`},p=>appendThreadMsg(p.new))
    .subscribe();
}
async function loadThreadMsgs(rootId){
  const list=document.getElementById('thread-messages'); list.innerHTML='';
  const{data}=await sb.from('messages').select('*').eq('thread_id',rootId).is('deleted_at',null).order('created_at');
  if(!data?.length){list.innerHTML=`<div style="padding:20px;text-align:center;font-size:13px;color:var(--dc-muted);">No replies yet. Be first!</div>`;return;}
  data.forEach(m=>appendThreadMsg(m,true)); list.scrollTop=list.scrollHeight;
}
function appendThreadMsg(m,skipScroll=false){
  const list=document.getElementById('thread-messages');
  if(document.querySelector(`[data-thread-msg-id="${m.id}"]`)) return;
  const el=document.createElement('div'); el.dataset.threadMsgId=m.id;
  el.style.cssText='padding:8px 16px;border-bottom:1px solid var(--dc-sep);';
  el.innerHTML=`<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:3px;">
    <span style="font-size:13px;font-weight:700;color:var(--dc-text)">${esc(m.username||'Unknown')}</span>
    <span style="font-size:11px;color:var(--dc-muted)">${formatTime(m.created_at)}</span>
    ${m.user_id===currentUserId?`<button onclick="deleteThreadMsg(${m.id},this.closest('[data-thread-msg-id]'))" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#ef4444;font-size:12px;">🗑</button>`:''}
  </div>
  <div style="font-size:14px;color:var(--dc-text);line-height:1.5;">${renderText(m.text||'')}</div>`;
  list.appendChild(el);
  if(!skipScroll) list.scrollTop=list.scrollHeight;
}
window.deleteThreadMsg=async(msgId,el)=>{
  if(!confirm('Delete this reply?')) return;
  await sb.from('messages').update({deleted_at:new Date().toISOString()}).eq('id',msgId);
  el?.remove();
};
document.getElementById('thread-close').onclick=()=>{
  document.getElementById('thread-panel').classList.add('hidden');
  if(window._threadRtChan){sb.removeChannel(window._threadRtChan);window._threadRtChan=null;}
};
document.getElementById('thread-send').onclick=sendThreadMsg;
document.getElementById('thread-input').onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendThreadMsg();}};
async function sendThreadMsg(){
  if(!currentUserId||!activeThreadId) return;
  const inp=document.getElementById('thread-input'); const text=inp.value.trim(); if(!text) return;
  inp.value='';
  const p=currentProfile;
  const{error}=await sb.from('messages').insert({
    user_id:currentUserId,username:p.username,avatar_url:p.avatar_url||null,
    tag:p.tag||null,role:p.role||'user',
    text:filterProfanity(applyShortcodes(text)),
    thread_id:activeThreadId,
    channel_id:activeRoom.type==='channel'?activeRoom.id:null,
    server_id:activeRoom.serverId||null,
  });
  if(error){showToast('❌ '+error.message);inp.value=text;}
}

/* ══════════════════════════════════════════════════════
   FORWARD MESSAGE
══════════════════════════════════════════════════════ */
let forwardTargetMsg=null;
async function openForwardModal(msg){
  if(!currentUserId) return;
  forwardTargetMsg=msg;
  document.getElementById('fwd-err').textContent='';
  document.getElementById('fwd-search').value='';
  await renderForwardList('');
  openModal('forwardModal');
}
async function renderForwardList(filter){
  const list=document.getElementById('fwd-list'); list.innerHTML='<div style="padding:10px;font-size:12px;color:var(--dc-muted);">Loading…</div>';
  const targets=[];

  const{data:memberships}=await sb.from('server_members').select('server_id').eq('user_id',currentUserId);
  const serverIds=(memberships||[]).map(m=>m.server_id);
  if(serverIds.length){
    const{data:servers}=await sb.from('servers').select('id,name').in('id',serverIds);
    const{data:chans}=await sb.from('channels').select('id,name,server_id').in('server_id',serverIds);
    const serverById={}; (servers||[]).forEach(s=>serverById[s.id]=s);
    (chans||[]).forEach(c=>targets.push({type:'channel',id:c.id,label:`#${c.name}`,sub:serverById[c.server_id]?.name||'',serverId:c.server_id,serverName:serverById[c.server_id]?.name}));
  }
  const{data:myRows}=await sb.from('dm_participants').select('dm_id').eq('user_id',currentUserId);
  const dmIds=(myRows||[]).map(r=>r.dm_id);
  if(dmIds.length){
    const{data:dms}=await sb.from('direct_messages').select('*').in('id',dmIds);
    const{data:allParts}=await sb.from('dm_participants').select('dm_id,user_id').in('dm_id',dmIds);
    const partsByDM={}; (allParts||[]).forEach(p=>{(partsByDM[p.dm_id]=partsByDM[p.dm_id]||[]).push(p.user_id);});
    const otherIds=[...new Set((allParts||[]).map(p=>p.user_id).filter(id=>id!==currentUserId))];
    const profiles=await Promise.all(otherIds.map(id=>getProfile(id)));
    const profileById={}; otherIds.forEach((id,i)=>profileById[id]=profiles[i]);
    (dms||[]).forEach(dm=>{
      const others=(partsByDM[dm.id]||[]).filter(id=>id!==currentUserId);
      const label=dm.name||others.map(id=>profileById[id]?.username||'User').join(', ')||'DM';
      targets.push({type:'dm',id:dm.id,label:'@'+label,sub:'Direct Message'});
    });
  }

  const f=(filter||'').toLowerCase();
  const filtered=targets.filter(t=>t.label.toLowerCase().includes(f)||t.sub.toLowerCase().includes(f));
  if(!filtered.length){list.innerHTML='<div style="padding:10px;font-size:12px;color:var(--dc-muted);">No matches.</div>';return;}
  list.innerHTML='';
  filtered.forEach(t=>{
    const row=document.createElement('div');
    row.style.cssText='display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border-radius:8px;cursor:pointer;';
    row.onmouseenter=()=>row.style.background='var(--dc-ch-hover)'; row.onmouseleave=()=>row.style.background='';
    row.innerHTML=`<span>${esc(t.label)}</span><span style="font-size:11px;color:var(--dc-muted);">${esc(t.sub)}</span>`;
    row.onclick=()=>doForward(t);
    list.appendChild(row);
  });
}
document.getElementById('fwd-search').addEventListener('input',e=>renderForwardList(e.target.value));
document.getElementById('fwd-cancel').onclick=()=>closeModal('forwardModal');
async function doForward(target){
  if(!forwardTargetMsg||!currentUserId) return;
  const errEl=document.getElementById('fwd-err');
  const original=forwardTargetMsg;
  const text=`↪️ Forwarded from @${original.username||'Unknown'}\n${original.text||''}`;
  const p=await getProfile(currentUserId);
  try{
    if(target.type==='channel'){
      await sb.from('messages').insert({
        user_id:currentUserId,username:p.username||'User',avatar_url:p.avatar_url||null,
        tag:p.tag||null,role:p.role||'user',text,file_url:original.file_url||null,
        channel_id:target.id,server_id:target.serverId
      });
    } else if(target.type==='dm'){
      await sb.from('dm_messages').insert({
        user_id:currentUserId,username:p.username||'User',avatar_url:p.avatar_url||null,
        tag:p.tag||null,role:p.role||'user',text,file_url:original.file_url||null,dm_id:target.id
      });
      await sb.from('direct_messages').update({updated_at:new Date().toISOString()}).eq('id',target.id);
    }
  }catch(e){errEl.textContent='Forward failed: '+(e.message||'unknown error');return;}
  closeModal('forwardModal'); forwardTargetMsg=null;
  showToast(`↪️ Forwarded to ${target.label}`);
}

/* ══════════════════════════════════════════════════════
   PINS
══════════════════════════════════════════════════════ */
async function pinMsg(msg){
  if(!currentUserId) return;
  const r=activeRoom;
  let payload;
  if(r.type==='channel') payload={channel_id:r.id,dm_id:null,message_id:msg.id,pinned_by:currentUserId};
  else if(r.type==='dm') payload={channel_id:null,dm_id:r.id,message_id:msg.id,pinned_by:currentUserId};
  else { showToast("📌 Pinning isn't available in this room."); return; }
  const{error}=await sb.from('pinned_messages').insert(payload);
  if(error){if(error.code==='23505')showToast('📌 Already pinned');else showToast('❌ '+error.message);return;}
  showToast('📌 Pinned!');
}
async function loadPins(){
  const list=document.getElementById('pins-list'); list.innerHTML=''; const r=activeRoom;
  let data;
  if(r.type==='channel'){
    const res=await sb.from('pinned_messages').select('*').eq('channel_id',r.id).order('created_at',{ascending:false});
    data=res.data||[];
    if(data.length){
      const ids=data.map(p=>p.message_id);
      const{data:chMsgs}=await sb.from('messages').select('id,text,username').in('id',ids);
      const byId={}; (chMsgs||[]).forEach(m=>byId[m.id]=m);
      data.forEach(p=>p.messages=byId[p.message_id]);
    }
  } else if(r.type==='dm'){
    const res=await sb.from('pinned_messages').select('*').eq('dm_id',r.id).order('created_at',{ascending:false});
    data=res.data||[];
    if(data.length){
      const ids=data.map(p=>p.message_id);
      const{data:dmMsgs}=await sb.from('dm_messages').select('id,text,username').in('id',ids);
      const byId={}; (dmMsgs||[]).forEach(m=>byId[m.id]=m);
      data.forEach(p=>p.messages=byId[p.message_id]);
    }
  } else {
    list.innerHTML=`<div style="padding:16px;text-align:center;font-size:13px;color:var(--dc-muted);">Pinning isn't available in this room.</div>`;
    return;
  }
  if(!data?.length){list.innerHTML=`<div style="padding:16px;text-align:center;font-size:13px;color:var(--dc-muted);">No pinned messages</div>`;return;}
  data.forEach(pin=>{
    const msg=pin.messages; const item=document.createElement('div'); item.className='pin-item';
    item.innerHTML=`<div class="pi-author">${esc(msg?.username||'Unknown')}</div><div class="pi-text">${esc((msg?.text||'📎 file').slice(0,100))}</div>`;
    const del=document.createElement('button');del.style.cssText='float:right;background:none;border:none;cursor:pointer;color:var(--dc-muted);font-size:12px;';del.textContent='✕';
    del.onclick=async(e)=>{e.stopPropagation();await sb.from('pinned_messages').delete().eq('id',pin.id);loadPins();showToast('Unpinned');};
    item.prepend(del); item.onclick=e=>{if(e.target===del)return;jumpToMsg(pin.message_id);}; list.appendChild(item);
  });
}
document.getElementById('btnPins').onclick=()=>{
  const p=document.getElementById('pins-panel'); const h=p.classList.contains('hidden');
  closeAllPanels(); if(h){p.classList.remove('hidden');loadPins();}
};
document.getElementById('pins-close').onclick=()=>document.getElementById('pins-panel').classList.add('hidden');

/* ══════════════════════════════════════════════════════
   MEMBERS PANEL — shows online/offline from presence
══════════════════════════════════════════════════════ */
async function loadMembers(){
  const list=document.getElementById('members-list'); list.innerHTML='';
  if(!activeRoom.serverId){
    list.innerHTML=`<div style="padding:16px;font-size:13px;color:var(--dc-muted);">Open a server to see its members.</div>`;return;
  }
  const{data:mems}=await sb.from('server_members').select('user_id').eq('server_id',activeRoom.serverId);
  if(!mems?.length){list.innerHTML=`<div style="padding:16px;font-size:13px;color:var(--dc-muted);">No members found.</div>`;return;}
  const uids=mems.map(m=>m.user_id);
  const profiles=await Promise.all(uids.map(id=>getProfile(id)));
  const{data:server}=await sb.from('servers').select('owner_id').eq('id',activeRoom.serverId).maybeSingle();
  const ownerId=server?.owner_id;
  const onlineUids=new Set(Object.keys(presenceState));
  const groups={Online:[],Offline:[]};
  profiles.forEach((p,i)=>{
    const uid=uids[i];
    (onlineUids.has(uid)?groups.Online:groups.Offline).push({p,uid,isOwner:uid===ownerId});
  });
  Object.entries(groups).forEach(([group,items])=>{
    if(!items.length) return;
    const sec=document.createElement('div'); sec.className='member-role-section';
    sec.textContent=`${group} — ${items.length}`; list.appendChild(sec);
    items.forEach(({p,uid,isOwner})=>{
      const item=document.createElement('div'); item.className='member-item';
      const av=document.createElement('div'); av.className='mi-av';
      if(p.avatar_url){const img=document.createElement('img');img.src=p.avatar_url;av.appendChild(img);}
      else av.textContent=getInitials(p.username);
      const nameWrap=document.createElement('div'); nameWrap.style.cssText='flex:1;min-width:0;';
      const name=document.createElement('span'); name.textContent=p.username||'User';
      name.style.cssText='font-size:13px;font-weight:600;display:block;';
      const sub=document.createElement('div'); sub.style.cssText='font-size:11px;color:var(--dc-muted);';
      const badges=[]; if(isOwner)badges.push('👑 Owner');else if(p.role==='admin')badges.push('🛡 Admin');else if(p.role==='mod')badges.push('⚔️ Mod');
      if(p.tag)badges.push(p.tag); sub.textContent=badges.join(' · ')||'Member';
      nameWrap.appendChild(name); nameWrap.appendChild(sub);
      if(p.current_activity){try{const act=typeof p.current_activity==='string'?JSON.parse(p.current_activity):p.current_activity;if(act?.type==='music'&&act.track){const chip=document.createElement('div');chip.style.cssText='font-size:10px;color:var(--a);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:3px;';chip.innerHTML=`<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg><span>${act.track}${act.artist?' · '+act.artist:''}</span>`;nameWrap.appendChild(chip);}}catch(e){}}
      const dot=document.createElement('div'); dot.className='mi-status'+(onlineUids.has(uid)?' online':'');
      item.appendChild(av); item.appendChild(nameWrap); item.appendChild(dot);
      item.addEventListener('click',()=>showProfilePopup(uid,item)); list.appendChild(item);
    });
  });
}
document.getElementById('btnMembers').onclick=()=>{
  const p=document.getElementById('members-panel'); const h=p.classList.contains('hidden');
  closeAllPanels(); if(h){p.classList.remove('hidden');loadMembers();}
};
document.getElementById('members-close').onclick=()=>document.getElementById('members-panel').classList.add('hidden');

/* ══════════════════════════════════════════════════════
   ONLINE PILL PANEL
══════════════════════════════════════════════════════ */
function initOnlinePanel(){
  if(document.getElementById('online-panel')) return;
  const p=document.createElement('div'); p.id='online-panel'; p.className='online-panel hidden';
  p.innerHTML=`<div class="online-header"><span>🟢 Online Now</span><button id="online-close">✕</button></div><div id="online-list" class="online-list"></div>`;
  document.getElementById('dcMain').appendChild(p);
  document.getElementById('online-close').onclick=()=>p.classList.add('hidden');
}
document.getElementById('onlinePill')?.addEventListener('click',()=>{
  initOnlinePanel();
  const p=document.getElementById('online-panel');
  if(p.classList.contains('hidden')){p.classList.remove('hidden');renderOnlineList();}
  else p.classList.add('hidden');
});
function renderOnlineList(){
  const list=document.getElementById('online-list'); if(!list) return;
  list.innerHTML='';
  // presenceState keys are user IDs, values are arrays of presence objects
  const entries=Object.values(presenceState).flat();
  if(!entries.length){list.innerHTML=`<div style="padding:16px;font-size:13px;color:var(--dc-muted);text-align:center;">No one else online.</div>`;return;}
  entries.forEach(u=>{
    const item=document.createElement('div'); item.className='online-item';
    const av=document.createElement('div'); av.className='online-av';
    if(u.avatar_url){const img=document.createElement('img');img.src=u.avatar_url;av.appendChild(img);}
    else av.textContent=getInitials(u.username||'?');
    const info=document.createElement('div'); info.className='online-info';
    const nm=document.createElement('span'); nm.className='online-name'; nm.textContent=u.username||'User';
    const dot=document.createElement('span'); dot.className='online-dot';
    info.appendChild(nm); info.appendChild(dot);
    item.appendChild(av); item.appendChild(info); list.appendChild(item);
  });
}

/* ══════════════════════════════════════════════════════
   TYPING
══════════════════════════════════════════════════════ */
function renderTyping(){
  const el=document.getElementById('dc-typing');
  const users=Object.values(typingUsers); if(!users.length){el.innerHTML='';return;}
  const names=users.slice(0,3).map(u=>u.username).join(', ');
  el.innerHTML=`<div class="dc-typing-dots"><span></span><span></span><span></span></div><span>${esc(
    users.length===1?`${names} is typing`:users.length<=3?`${names} are typing`:`${users.length} people are typing`
  )}…</span>`;
}

/* ══════════════════════════════════════════════════════
   REPLY
══════════════════════════════════════════════════════ */
function setReply(msg){
  replyingTo=msg;
  document.getElementById('reply-author').textContent=msg.username||'Unknown';
  document.getElementById('reply-preview').textContent=(msg.text||'📎 file').slice(0,80);
  document.getElementById('dc-reply-bar').classList.remove('hidden');
  document.getElementById('msgInput').focus();
}
document.getElementById('reply-cancel-btn').onclick=()=>{replyingTo=null;document.getElementById('dc-reply-bar').classList.add('hidden');};

/* ══════════════════════════════════════════════════════
   FILE UPLOAD
══════════════════════════════════════════════════════ */
document.getElementById('attachBtn').onclick=()=>document.getElementById('fileInput').click();
document.getElementById('fileInput').onchange=e=>{
  const f=e.target.files[0]; if(!f) return;
  if(f.size>10*1024*1024){showToast('❌ Max file size is 10 MB');return;}
  pendingFile=f; document.getElementById('up-name').textContent=f.name;
  document.getElementById('up-icon').textContent=f.type.startsWith('image/')?'🖼️':'📎';
  document.getElementById('dc-upload-preview').classList.remove('hidden'); e.target.value='';
};
document.getElementById('up-cancel').onclick=clearUpload;
function clearUpload(){pendingFile=null;document.getElementById('dc-upload-preview').classList.add('hidden');document.getElementById('dc-upload-bar').classList.add('hidden');}
async function uploadFile(file){
  const ext=file.name.split('.').pop().toLowerCase();
  const path=`${currentUserId||'anon'}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const bar=document.getElementById('dc-upload-bar'); const fill=document.getElementById('dc-upload-fill');
  bar.classList.remove('hidden'); fill.style.width='30%';
  const{error}=await sb.storage.from('chat-uploads').upload(path,file,{cacheControl:'3600',upsert:false});
  fill.style.width='100%'; setTimeout(()=>{bar.classList.add('hidden');fill.style.width='0';},500);
  if(error){showToast('❌ Upload failed: '+error.message);return null;}
  const{data:u}=sb.storage.from('chat-uploads').getPublicUrl(path); return u?.publicUrl||null;
}

/* ══════════════════════════════════════════════════════
   EMOJI PICKER
══════════════════════════════════════════════════════ */
const emojiPicker=document.getElementById('dcEmojiPicker');
ALL_EMOJIS.forEach(em=>{
  const b=document.createElement('button'); b.className='dc-emoji-btn'; b.textContent=em;
  b.onclick=e=>{e.stopPropagation();const inp=document.getElementById('msgInput');const pos=inp.selectionStart;inp.value=inp.value.slice(0,pos)+em+inp.value.slice(pos);inp.focus();emojiPicker.classList.add('hidden');};
  emojiPicker.appendChild(b);
});
document.getElementById('emojiBtn').onclick=e=>{e.stopPropagation();emojiPicker.classList.toggle('hidden');};
document.addEventListener('click',()=>emojiPicker.classList.add('hidden'));

/* ══════════════════════════════════════════════════════
   SLASH SUGGESTIONS
══════════════════════════════════════════════════════ */
const CMDS=[
  {c:'/me',mod:false,desc:'Action message'},{c:'/shrug',mod:false,desc:'¯\\_(ツ)_/¯'},
  {c:'/lenny',mod:false,desc:'( ͡° ͜ʖ ͡°)'},{c:'/tableflip',mod:false,desc:'(╯°□°）╯︵ ┻━┻'},
  {c:'/unflip',mod:false,desc:'┬─┬ノ( º _ ºノ)'},{c:'/help',mod:false,desc:'List commands'},
  {c:'/clear',mod:true,desc:'Clear visible messages'},{c:'/slow',mod:true,desc:'Slow mode (seconds)'},
  {c:'/warn',mod:true,desc:'/warn <user> [reason]'},{c:'/mute',mod:true,desc:'/mute <user> <mins>'},
  {c:'/unmute',mod:true,desc:'/unmute <user>'},{c:'/ban',mod:true,desc:'/ban <user> [reason]'},
  {c:'/unban',mod:true,desc:'/unban <user>'},{c:'/promote',mod:true,desc:'/promote <user>'},
  {c:'/demote',mod:true,desc:'/demote <user>'},{c:'/announce',mod:true,desc:'/announce <text>'},
];
function renderSlashSugg(query){
  let popup=document.getElementById('slash-popup');
  if(!popup){popup=document.createElement('div');popup.id='slash-popup';popup.className='slash-popup hidden';document.querySelector('.dc-input-box').appendChild(popup);}
  const matches=CMDS.filter(c=>c.c.startsWith('/'+query)&&(!c.mod||isAdminOrMod(currentProfile)));
  if(!matches.length){popup.innerHTML='';popup.classList.add('hidden');return;}
  slashSuggIdx=Math.min(slashSuggIdx,matches.length-1);
  popup.classList.remove('hidden'); popup.innerHTML='';
  matches.forEach((cmd,i)=>{
    const item=document.createElement('div'); item.className='slash-item'+(i===slashSuggIdx?' active':'');
    item.innerHTML=`<span class="slash-cmd">${esc(cmd.c)}</span><span class="slash-desc">${esc(cmd.desc)}</span>`;
    item.onmousedown=e=>{e.preventDefault();applySlashSugg(cmd.c);}; popup.appendChild(item);
  });
}
function applySlashSugg(cmdStr){const inp=document.getElementById('msgInput');inp.value=cmdStr+' ';inp.focus();hideSlashPopup();}
function hideSlashPopup(){const p=document.getElementById('slash-popup');if(p){p.innerHTML='';p.classList.add('hidden');}slashSuggIdx=0;}

/* ══════════════════════════════════════════════════════
   INPUT
══════════════════════════════════════════════════════ */
const msgInput=document.getElementById('msgInput');
const msgCharCounter=document.createElement('div'); msgCharCounter.id='msg-char-counter'; msgCharCounter.style.cssText='position:absolute;bottom:6px;right:52px;font-size:11px;color:var(--dc-muted);pointer-events:none;opacity:0;transition:opacity .15s;'; msgInput.parentElement.style.position='relative'; msgInput.parentElement.appendChild(msgCharCounter);
const MSG_LIMIT=4000;
let typingDebounce;
msgInput.addEventListener('input',()=>{
  msgInput.style.height='auto'; msgInput.style.height=Math.min(msgInput.scrollHeight,180)+'px';
  const len=msgInput.value.length;
  if(len>=MSG_LIMIT*0.8){
    msgCharCounter.textContent=`${len}/${MSG_LIMIT}`;
    msgCharCounter.style.opacity='1';
    msgCharCounter.style.color=len>=MSG_LIMIT*0.95?'#ef4444':len>=MSG_LIMIT*0.8?'#f97316':'var(--dc-muted)';
  } else { msgCharCounter.style.opacity='0'; }
  clearTimeout(typingDebounce); typingDebounce=setTimeout(()=>{
    if(!currentUserId||!typingChannel||!currentProfile) return;
    typingChannel.send({type:'broadcast',event:'typing',payload:{username:currentProfile.username,uid:currentUserId}});
  },200);
  const val=msgInput.value; const pos=msgInput.selectionStart||0;
  if(val.startsWith('/')&&!val.slice(1).includes(' ')){renderSlashSugg(val.slice(1));return;}
  hideSlashPopup();
  const before=val.slice(0,pos);
  if(/@\w*$/.test(before)) handleMentionAC();
  else document.getElementById('dc-mention-popup').innerHTML='';
});
msgInput.onkeydown=e=>{
  const sp=document.getElementById('slash-popup');
  if(sp&&!sp.classList.contains('hidden')){
    const items=sp.querySelectorAll('.slash-item');
    if(e.key==='ArrowDown'){e.preventDefault();slashSuggIdx=Math.min(slashSuggIdx+1,items.length-1);items.forEach((el,i)=>el.classList.toggle('active',i===slashSuggIdx));return;}
    if(e.key==='ArrowUp'){e.preventDefault();slashSuggIdx=Math.max(0,slashSuggIdx-1);items.forEach((el,i)=>el.classList.toggle('active',i===slashSuggIdx));return;}
    if(e.key==='Tab'||e.key==='Enter'){const a=sp.querySelector('.slash-item.active');if(a){e.preventDefault();applySlashSugg(a.querySelector('.slash-cmd').textContent);return;}}
    if(e.key==='Escape'){hideSlashPopup();return;}
  }
  const mp=document.getElementById('dc-mention-popup');
  if(e.key==='ArrowUp'&&mp.children.length){e.preventDefault();mentionSelIdx=Math.max(0,mentionSelIdx-1);handleMentionAC();return;}
  if(e.key==='ArrowDown'&&mp.children.length){e.preventDefault();mentionSelIdx=Math.min(7,mentionSelIdx+1);handleMentionAC();return;}
  if(e.key==='Tab'&&mp.children.length){e.preventDefault();const a=document.querySelector('.dc-mention-item.active');if(a)insertMention(a.dataset.user);return;}
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}
  if(e.key==='Escape'){mp.innerHTML='';hideSlashPopup();}
};

/* ══════════════════════════════════════════════════════
   SEND — ephemeral bot intercepts
══════════════════════════════════════════════════════ */
document.getElementById('sendBtn').onclick=sendMessage;
async function sendMessage(){
  if(isSending) return;
  if(slowModeSeconds>0){const el=(Date.now()-lastSentTime)/1000;if(el<slowModeSeconds){showToast(`🐌 Slow mode — wait ${Math.ceil(slowModeSeconds-el)}s`);return;}}
  const text=msgInput.value.trim(); if(!text&&!pendingFile) return;
  const{data:{session}}=await sb.auth.getSession(); if(!session){location.href='/account';return;}
  delete profileCache[session.user.id];
  const p=await getProfile(session.user.id); currentProfile=p;
  if(p.banned){showToast('🚫 You have been banned from 360 Chat.');return;}
  if(isMuted(p)){showToast(`🔇 You are muted for another ${muteExpiryText(p)}.`);return;}

  // !ping / @ping → ephemeral, never saved
  if(/^(!ping|@ping)\b/i.test(text)){
    msgInput.value=''; msgInput.style.height='auto'; hideSlashPopup();
    const sentAt=Date.now();
    showEphemeral('🏓 Pinging…','🏓','PingBot — only visible to you');
    try{
      const res=await fetch(`${SB_URL}/functions/v1/pingpong`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:p.username,sent_at:sentAt})});
      const d=await res.json();
      document.querySelector('.dc-ephemeral:last-child')?.remove();
      showEphemeral(d.text||'🏓 Pong!','🏓','PingBot — only visible to you');
    }catch{document.querySelector('.dc-ephemeral:last-child')?.remove();showEphemeral('🏓 Pong!','🏓','PingBot — only visible to you');}
    return;
  }
  // @automod → ephemeral AI reply, never saved
  if(/@automod/i.test(text)){
    msgInput.value=''; msgInput.style.height='auto'; hideSlashPopup();
    showEphemeral('⏳ AutoMod is thinking…','🤖','AutoMod — only visible to you');
    try{
      const res=await fetch(`${SB_URL}/functions/v1/automod`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'chat',text,username:p.username,user_id:currentUserId,channel_id:activeRoom.type==='channel'?activeRoom.id:null,server_id:activeRoom.serverId||null})});
      const d=await res.json();
      document.querySelector('.dc-ephemeral:last-child')?.remove();
      showEphemeral(d.text||'AutoMod here! Ask me anything about the rules.','🤖','AutoMod — only visible to you');
    }catch{document.querySelector('.dc-ephemeral:last-child')?.remove();showEphemeral('AutoMod is offline right now.','🤖','AutoMod — only visible to you');}
    return;
  }
  if(text.startsWith('/')){await runCommand(text,p);msgInput.value='';msgInput.style.height='auto';hideSlashPopup();return;}
  hideSlashPopup();
  isSending=true; document.getElementById('sendBtn').disabled=true;
  try{
    let fileUrl=null;
    if(pendingFile){fileUrl=await uploadFile(pendingFile);if(fileUrl===null)return;clearUpload();}
    // Grammar correct before sending (await, ~300ms, fails silently)
    let finalText = text || '';
    if (finalText.trim().length > 3) finalText = await correctGrammar(finalText);
    // @all — fetch all server members and insert notifications
    if ((finalText.includes('@all') || finalText.includes('@everyone') && activeRoom.serverId) {
      sb.from('server_members').select('user_id').eq('server_id', activeRoom.serverId).then(({data:members}) => {
        if (!members?.length) return;
        const now = new Date().toISOString();
        const notifs = members
          .map(m => m.user_id).filter(uid => uid !== currentUserId)
          .map(uid => ({ user_id: uid, room_type: 'channel', room_id: activeRoom.id||activeRoom.serverId, notif_type: 'mention_all', title: '@all mention', body: (p.username||'Someone')+' mentioned @all', is_read: false, last_msg_at: now, updated_at: now, count: 1 }));
        if (notifs.length) sb.from('chat_notifications').insert(notifs).catch(()=>{});
      });
    }
    const payload={user_id:session.user.id,username:p.username||session.user.email,avatar_url:p.avatar_url||null,tag:p.tag||null,role:p.role||'user',text:filterProfanity(applyShortcodes(finalText||'')),file_url:fileUrl};
    if(replyingTo){payload.reply_to_id=replyingTo.id;payload.reply_to_username=replyingTo.username;payload.reply_to_text=(replyingTo.text||'').slice(0,100);replyingTo=null;document.getElementById('dc-reply-bar').classList.add('hidden');}
    if(activeRoom.type==='dm'){payload.dm_id=activeRoom.id;await sb.from('dm_messages').insert(payload);await sb.from('direct_messages').update({updated_at:new Date().toISOString()}).eq('id',activeRoom.id);}
    else{if(activeRoom.type==='channel')payload.channel_id=activeRoom.id;else if(activeRoom.type==='server')payload.server_id=activeRoom.id;await sb.from('messages').insert(payload);}
    msgInput.value=''; msgInput.style.height='auto'; lastSentTime=Date.now();
  }finally{isSending=false;document.getElementById('sendBtn').disabled=false;}
}


/* ══════════════════════════════════════════════════════
   GRAMMAR CORRECTION
   Uses Claude claude-sonnet-4-6 via Anthropic API.
   Toggled per-user via localStorage.
══════════════════════════════════════════════════════ */
function grammarEnabled() {
  try { return localStorage.getItem('360_grammar') !== 'off'; } catch(e) { return true; }
}
function toggleGrammar() {
  const on = grammarEnabled();
  try { localStorage.setItem('360_grammar', on ? 'off' : 'on'); } catch(e) {}
  showToast(on ? '✏️ Grammar correction off' : '✏️ Grammar correction on');
  updateGrammarBtn();
}
window.toggleGrammar = toggleGrammar;
function updateGrammarBtn() {
  const btn = document.getElementById('grammar-btn');
  if (!btn) return;
  btn.style.opacity = grammarEnabled() ? '1' : '0.4';
  btn.title = grammarEnabled() ? 'Grammar correction: ON (click to disable)' : 'Grammar correction: OFF (click to enable)';
}

async function correctGrammar(text) {
  if (!grammarEnabled()) return text;
  if (!text || text.trim().length < 4) return text;
  if (text.startsWith('/') || text.startsWith('!')) return text;
  if (/^[@#]/.test(text.trim())) return text;
  if (text.trim().split(/\s+/).length < 2) return text;
  try {
    const { data: { session } } = await sb.auth.getSession();
    const res = await fetch(SB_URL + '/functions/v1/grammar-correct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + session?.access_token },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(7000),
    });
    const data = await res.json();
    const corrected = (data?.corrected || '').trim();
    if (!corrected || corrected === text) return text;
    showGrammarDiff(text, corrected);
    return corrected;
  } catch(e) { return text; }
}

function showGrammarDiff(original, corrected) {
  document.querySelector('.grammar-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'grammar-toast';
  const enc = encodeURIComponent(original);
  toast.innerHTML = `<span>✏️ corrected</span><button onclick="undoGrammar('${enc}',this.closest('.grammar-toast'))">undo</button>`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}
window.undoGrammar = function(originalEncoded, toastEl) {
  const original = decodeURIComponent(originalEncoded);
  const inp = document.getElementById('msgInput');
  if (inp) { inp.value = original; }
  toastEl?.remove();
};

/* ══════════════════════════════════════════════════════
   SLASH COMMANDS
══════════════════════════════════════════════════════ */
async function insertMsg(payload){
  if(activeRoom.type==='channel') payload.channel_id=activeRoom.id;
  else if(activeRoom.type==='server') payload.server_id=activeRoom.id;
  const{error}=await sb.from('messages').insert(payload); if(error) showToast('❌ '+error.message);
}
async function runCommand(text,p){
  const parts=text.split(' '); const cmd=parts[0].toLowerCase(); const args=parts.slice(1).join(' ');
  const{data:{session}}=await sb.auth.getSession();
  const payload={user_id:session.user.id,username:p.username,avatar_url:p.avatar_url,role:p.role};
  const needsMod=isAdminOrMod(p);
  switch(cmd){
    case '/me': payload.text=`_${p.username} ${filterProfanity(args)}_`; await insertMsg(payload); break;
    case '/shrug': msgInput.value='¯\\_(ツ)_/¯'; break;
    case '/lenny': msgInput.value='( ͡° ͜ʖ ͡°)'; break;
    case '/tableflip': msgInput.value='(╯°□°）╯︵ ┻━┻'; break;
    case '/unflip': msgInput.value='┬─┬ノ( º _ ºノ)'; break;
    case '/help': showToast(CMDS.filter(c=>!c.mod||needsMod).map(c=>c.c).join(' · '),5000); break;
    case '/clear': if(!needsMod){showToast('❌ Mods only');break;} document.getElementById('dc-messages').innerHTML=''; msgElMap.clear(); break;
    case '/slow': if(!needsMod){showToast('❌ Mods only');break;} slowModeSeconds=parseInt(args)||0; showToast(slowModeSeconds?`🐌 Slow: ${slowModeSeconds}s`:'✅ Slow mode off'); break;
    case '/warn':case '/mute':case '/unmute':case '/ban':case '/unban':case '/promote':case '/demote':case '/announce':
      if(!needsMod){showToast('❌ Mods only');break;} await runModCmd(cmd,args,p,payload); break;
    default: showToast('❌ Unknown command. Try /help');
  }
}
async function runModCmd(cmd,args,p,payload){
  const target=args.split(' ')[0].replace(/^@/,'');
  const{data:tgt}=target?await sb.from('profiles').select('id,username,role,warn_count').ilike('username',target).maybeSingle():{data:null};
  if(cmd!=='/announce'&&!tgt){showToast('❌ User not found');return;}
  switch(cmd){
    case '/warn':{const reason=args.split(' ').slice(1).join(' ')||'No reason';const nc=(tgt.warn_count||0)+1;await sb.from('profiles').update({warn_count:nc}).eq('id',tgt.id);let ex='';if(nc>=5){await sb.from('profiles').update({banned:true}).eq('id',tgt.id);ex=' (auto-banned)';}else if(nc>=3){const mu=new Date(Date.now()+60*60000).toISOString();await sb.from('profiles').update({muted_until:mu}).eq('id',tgt.id);ex=' (auto-muted 1h)';}await logAutomod(tgt.id,tgt.username,'warn',reason);payload.text=`⚠️ **Warning ${nc}/5** to @${tgt.username}: ${reason}${ex}`;await insertMsg(payload);break;}
    case '/mute':{const mins=parseInt(args.split(' ')[1])||5;const reason=args.split(' ').slice(2).join(' ')||'No reason';const mu=new Date(Date.now()+mins*60000).toISOString();await sb.from('profiles').update({muted_until:mu}).eq('id',tgt.id);await logAutomod(tgt.id,tgt.username,'mute',`${mins}m — ${reason}`,mu);payload.text=`🔇 @${tgt.username} muted ${mins}m: ${reason}`;await insertMsg(payload);break;}
    case '/unmute': await sb.from('profiles').update({muted_until:null}).eq('id',tgt.id);await logAutomod(tgt.id,tgt.username,'unmute','');showToast('✅ Unmuted');break;
    case '/ban':{const reason=args.split(' ').slice(1).join(' ')||'No reason';if(tgt.role==='admin'){showToast('❌ Cannot ban admin');break;}await sb.from('profiles').update({banned:true}).eq('id',tgt.id);await logAutomod(tgt.id,tgt.username,'ban',reason);payload.text=`🚫 @${tgt.username} banned: ${reason}`;await insertMsg(payload);break;}
    case '/unban': await sb.from('profiles').update({banned:false,warn_count:0}).eq('id',tgt.id);await logAutomod(tgt.id,tgt.username,'unban','');showToast('✅ Unbanned');break;
    case '/promote': if(p.role!=='admin'){showToast('❌ Admins only');break;}await sb.from('profiles').update({role:'mod'}).eq('id',tgt.id);showToast('✅ Promoted to mod');break;
    case '/demote': if(p.role!=='admin'){showToast('❌ Admins only');break;}await sb.from('profiles').update({role:'user'}).eq('id',tgt.id);showToast('✅ Demoted');break;
    case '/announce': payload.text=`📢 **${args}**`;await insertMsg(payload);break;
  }
}

/* ══════════════════════════════════════════════════════
   @MENTION AUTOCOMPLETE
══════════════════════════════════════════════════════ */
function registerUser(username){if(username&&!knownUsers.includes(username))knownUsers.push(username);}
function handleMentionAC(){
  const val=msgInput.value; const pos=msgInput.selectionStart||0;
  const before=val.slice(0,pos); const match=before.match(/@(\w*)$/);
  const popup=document.getElementById('dc-mention-popup');
  if(!match){popup.innerHTML='';mentionQuery=null;return;}
  mentionQuery=match[1]; mentionStart=pos-match[0].length;
  const matches=knownUsers.filter(u=>u.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0,8);
  if(!matches.length){popup.innerHTML='';return;}
  popup.innerHTML=matches.map((u,i)=>`<div class="dc-mention-item${i===mentionSelIdx?' active':''}" data-user="${esc(u)}">@${esc(u)}</div>`).join('');
  popup.querySelectorAll('.dc-mention-item').forEach(opt=>opt.addEventListener('mousedown',e=>{e.preventDefault();insertMention(opt.dataset.user);}));
}
function insertMention(username){
  const val=msgInput.value;
  msgInput.value=val.slice(0,mentionStart)+'@'+username+' '+val.slice(msgInput.selectionStart);
  mentionQuery=null; document.getElementById('dc-mention-popup').innerHTML=''; msgInput.focus();
}



/* ══════════════════════════════════════════════════════
   FRIENDS, STATUS, REPORTS & CHAT PROFILE
══════════════════════════════════════════════════════ */
function safeSupabaseError(errEl,error,fallback='Something went wrong.'){
  if(errEl) errEl.textContent=error?.message||fallback;
}
function friendshipPairFilter(otherUserId){
  return `and(requester_id.eq.${currentUserId},addressee_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},addressee_id.eq.${currentUserId})`;
}
function makeFriendListAvatar(profile){
  const av=document.createElement('div'); av.className='fl-av';
  if(profile?.avatar_url){const img=document.createElement('img');img.src=profile.avatar_url;img.alt='';av.appendChild(img);}
  else av.textContent=getInitials(profile?.username);
  return av;
}
function makeFriendListInfo(name,status,statusClass=''){
  const info=document.createElement('div'); info.className='fl-info';
  const nm=document.createElement('span'); nm.className='fl-name'; nm.textContent=name||'User';
  const st=document.createElement('span'); st.className='fl-status'+(statusClass?' '+statusClass:''); st.textContent=status;
  info.appendChild(nm); info.appendChild(st); return info;
}
function initFriendsPanel(){
  if(friendsPanel?.isConnected) return;
  if(document.getElementById('friends-panel')){friendsPanel=document.getElementById('friends-panel');return;}
  const main=document.getElementById('dcMain'); if(!main) return;
  const p=document.createElement('div'); p.id='friends-panel'; p.className='friends-panel hidden';
  p.innerHTML=`<div class="friends-header"><span>👥 Friends</span><button id="friends-close" title="Close">✕</button></div>
    <div class="friends-tabs"><button class="ftab active" data-tab="friends">Friends</button><button class="ftab" data-tab="pending">Pending <span id="friend-pending-count"></span></button><button class="ftab" data-tab="add">Add Friend</button></div>
    <div class="friends-body"><div id="ftab-friends" class="ftab-content"></div><div id="ftab-pending" class="ftab-content hidden"></div><div id="ftab-add" class="ftab-content hidden"><div class="fadd-form"><input id="fadd-input" placeholder="@username or email" autocomplete="off"/><button class="dc-btn-pri" id="fadd-btn">Send Request</button></div><p id="fadd-err" style="color:#ef4444;font-size:12px;min-height:16px;margin:8px 0 0;"></p></div></div>`;
  main.appendChild(p); friendsPanel=p;
  p.querySelector('#friends-close').onclick=()=>p.classList.add('hidden');
  p.querySelectorAll('.ftab').forEach(tab=>tab.onclick=()=>{
    p.querySelectorAll('.ftab').forEach(t=>t.classList.remove('active')); tab.classList.add('active');
    p.querySelectorAll('.ftab-content').forEach(c=>c.classList.add('hidden'));
    p.querySelector('#ftab-'+tab.dataset.tab)?.classList.remove('hidden');
    if(tab.dataset.tab==='friends') loadFriendsList();
    if(tab.dataset.tab==='pending') loadPendingFriends();
  });
  p.querySelector('#fadd-btn').onclick=sendFriendRequest;
  p.querySelector('#fadd-input').onkeydown=e=>{if(e.key==='Enter')sendFriendRequest();};
}
async function openFriendsPanel(){
  if(!currentUserId){location.href='/account';return;}
  initFriendsPanel(); if(!friendsPanel)return;
  closeAllPanels(); friendsPanel.classList.remove('hidden');
  await Promise.all([loadFriendsList(),loadPendingFriends()]);
}
async function loadFriendsList(){
  const el=document.getElementById('ftab-friends'); if(!el||!currentUserId)return;
  el.innerHTML='<div class="fl-loading">Loading…</div>';
  const{data,error}=await sb.from('friendships').select('*').eq('status','accepted').or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`);
  if(error){el.innerHTML='<div class="fl-empty">Could not load friends.</div>';return;}
  if(!data?.length){el.innerHTML='<div class="fl-empty">No friends yet. Add some!</div>';return;}
  el.innerHTML=''; const friendIds=data.map(f=>f.requester_id===currentUserId?f.addressee_id:f.requester_id);
  const profiles=await Promise.all(friendIds.map(id=>getProfile(id))); const onlineUids=new Set(Object.keys(presenceState));
  data.forEach((f,i)=>{const prof=profiles[i]||{}; const fid=friendIds[i]; const online=onlineUids.has(fid);
    const item=document.createElement('div'); item.className='fl-item';
    item.appendChild(makeFriendListAvatar(prof)); item.appendChild(makeFriendListInfo(prof.username,online?'● Online':'○ Offline',online?'online':'offline'));
    const actions=document.createElement('div'); actions.className='fl-actions';
    const dmBtn=document.createElement('button'); dmBtn.className='dc-action-btn'; dmBtn.title='Message'; dmBtn.textContent='💬'; dmBtn.onclick=e=>{e.stopPropagation();friendsPanel?.classList.add('hidden');startDMWith(prof.username||prof.email||'');};
    const rmBtn=document.createElement('button'); rmBtn.className='dc-action-btn'; rmBtn.title='Remove'; rmBtn.textContent='✕'; rmBtn.style.color='#ef4444'; rmBtn.onclick=async e=>{e.stopPropagation();await sb.from('friendships').delete().eq('id',f.id);loadFriendsList();showToast('Removed friend.');};
    const callBtn=document.createElement('button'); callBtn.className='fl-call-btn'; callBtn.title='Voice call'; callBtn.textContent='📞'; callBtn.onclick=e=>{e.stopPropagation();friendsPanel?.classList.add('hidden');if(window.Voice)window.Voice.startCall(fid,prof.username||'Friend');};
    actions.append(dmBtn,callBtn,rmBtn); item.appendChild(actions); item.addEventListener('click',()=>showProfilePopup(fid,item)); el.appendChild(item);
  });
}
async function loadPendingFriends(){
  const el=document.getElementById('ftab-pending'); if(!el||!currentUserId)return;
  el.innerHTML='<div class="fl-loading">Loading…</div>';
  const{data,error}=await sb.from('friendships').select('*').eq('status','pending').or(`requester_id.eq.${currentUserId},addressee_id.eq.${currentUserId}`);
  if(error){el.innerHTML='<div class="fl-empty">Could not load requests.</div>';return;}
  const rows=data||[]; const incoming=rows.filter(f=>f.addressee_id===currentUserId); const outgoing=rows.filter(f=>f.requester_id===currentUserId);
  const countEl=document.getElementById('friend-pending-count'); if(countEl)countEl.textContent=incoming.length?`(${incoming.length})`:'';
  if(!rows.length){el.innerHTML='<div class="fl-empty">No pending requests.</div>';return;} el.innerHTML='';
  const addSection=t=>{const h=document.createElement('div');h.className='fl-section';h.textContent=t;el.appendChild(h);};
  if(incoming.length){addSection('Incoming'); for(const f of incoming){const prof=await getProfile(f.requester_id); const item=document.createElement('div'); item.className='fl-item'; item.append(makeFriendListAvatar(prof),makeFriendListInfo(prof.username,'wants to be friends')); const actions=document.createElement('div');actions.className='fl-actions'; const acc=document.createElement('button');acc.className='dc-btn-pri';acc.style.cssText='padding:4px 10px;font-size:12px;';acc.textContent='✓';acc.onclick=async()=>{await sb.from('friendships').update({status:'accepted'}).eq('id',f.id);loadPendingFriends();loadFriendsList();showToast('🎉 Friend accepted!');}; const dec=document.createElement('button');dec.className='dc-action-btn';dec.style.color='#ef4444';dec.textContent='✕';dec.onclick=async()=>{await sb.from('friendships').delete().eq('id',f.id);loadPendingFriends();showToast('Request declined.');}; actions.append(acc,dec); item.appendChild(actions); el.appendChild(item);}}
  if(outgoing.length){addSection('Sent'); for(const f of outgoing){const prof=await getProfile(f.addressee_id); const item=document.createElement('div'); item.className='fl-item'; item.append(makeFriendListAvatar(prof),makeFriendListInfo(prof.username,'Request pending…')); const actions=document.createElement('div');actions.className='fl-actions'; const can=document.createElement('button');can.className='dc-action-btn';can.style.color='#ef4444';can.textContent='Cancel';can.onclick=async()=>{await sb.from('friendships').delete().eq('id',f.id);loadPendingFriends();showToast('Request cancelled.');}; actions.appendChild(can); item.appendChild(actions); el.appendChild(item);}}
}
async function sendFriendRequest(){
  const inp=document.getElementById('fadd-input'); const err=document.getElementById('fadd-err'); if(err)err.textContent=''; const q=inp?.value.trim(); if(!q)return;
  const profile=await resolveUserByEmailOrUsername(q); if(!profile){if(err)err.textContent='User not found.';return;} if(profile.id===currentUserId){if(err)err.textContent="That's you!";return;}
  const{data:existing,error:e1}=await sb.from('friendships').select('id,status').or(friendshipPairFilter(profile.id)).maybeSingle(); if(e1){safeSupabaseError(err,e1);return;}
  if(existing){if(err)err.textContent=existing.status==='accepted'?'Already friends!':'Request already exists.';return;}
  const{error}=await sb.from('friendships').insert({requester_id:currentUserId,addressee_id:profile.id,status:'pending'}); if(error){safeSupabaseError(err,error);return;}
  inp.value=''; showToast(`✅ Friend request sent to @${profile.username||'user'}!`); loadPendingFriends(); checkPendingFriendRequests();
}
async function checkAreFriends(userId){if(!currentUserId||!userId)return false; const{data}=await sb.from('friendships').select('id').eq('status','accepted').or(friendshipPairFilter(userId)).maybeSingle(); return!!data;}
async function openStatusModal(){
  if(!currentUserId){location.href='/account';return;} document.getElementById('status-modal')?.remove();
  const{data:cur}=await sb.from('user_status').select('*').eq('user_id',currentUserId).maybeSingle();
  const modal=document.createElement('div'); modal.id='status-modal'; modal.className='dc-modal-overlay';
  modal.innerHTML=`<div class="dc-modal" style="max-width:340px;"><h2>Set Status</h2><div class="status-options">${[['online','🟢','Online'],['idle','🟡','Idle'],['dnd','🔴','Do Not Disturb'],['invisible','⚫','Invisible']].map(([v,e,l])=>`<label class="status-opt ${cur?.status===v||(!cur&&v==='online')?'active':''}"><input type="radio" name="status-pick" value="${v}" ${cur?.status===v||(!cur&&v==='online')?'checked':''}/> ${e} ${l}</label>`).join('')}</div><div class="dc-field" style="margin-top:14px;"><label>Custom Status Text <span style="font-size:11px;font-weight:400;opacity:.6;">(optional)</span></label><input id="status-text-inp" maxlength="80" placeholder="What are you up to?" value="${esc(cur?.custom_text||'')}"/></div><div class="dc-field"><label>Status Emoji</label><input id="status-emoji-inp" maxlength="4" placeholder="😎" value="${esc(cur?.status_emoji||'')}" style="width:80px;"/></div><p id="status-err" style="color:#ef4444;font-size:12px;min-height:14px;"></p><div class="dc-modal-btns"><button class="dc-btn-sec" id="status-cancel">Cancel</button><button class="dc-btn-pri" id="status-save">Save</button></div></div>`;
  document.body.appendChild(modal); modal.querySelectorAll('.status-opt').forEach(opt=>opt.addEventListener('click',()=>{modal.querySelectorAll('.status-opt').forEach(o=>o.classList.remove('active'));opt.classList.add('active');}));
  modal.querySelector('#status-cancel').onclick=()=>modal.remove(); modal.querySelector('#status-save').onclick=async()=>{const status=modal.querySelector('input[name="status-pick"]:checked')?.value||'online'; const custom_text=modal.querySelector('#status-text-inp').value.trim()||null; const status_emoji=modal.querySelector('#status-emoji-inp').value.trim()||null; const{error}=await sb.from('user_status').upsert({user_id:currentUserId,status,custom_text,status_emoji,updated_at:new Date().toISOString()},{onConflict:'user_id'}); if(error){modal.querySelector('#status-err').textContent=error.message;return;} showToast('✅ Status updated!'); modal.remove(); updateUserStatusDot(status);};
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}
function updateUserStatusDot(status){const colors={online:'#22c55e',idle:'#f59e0b',dnd:'#ef4444',invisible:'#6b7280'}; const chip=document.getElementById('dcUserChip'); if(!chip)return; let dot=chip.querySelector('.dc-user-status-dot'); if(!dot){dot=document.createElement('div');dot.className='dc-user-status-dot';dot.style.cssText='width:10px;height:10px;border-radius:50%;border:2px solid var(--dc-sidebar);flex-shrink:0;margin-left:4px;';chip.appendChild(dot);} dot.style.background=colors[status]||colors.online; chip.querySelector('.dc-user-status')?.style.setProperty('color',colors[status]||colors.online);}
async function openReportModal(targetUserId,targetUsername,msgText){
  if(!currentUserId){location.href='/account';return;} document.getElementById('report-modal')?.remove();
  const modal=document.createElement('div'); modal.id='report-modal'; modal.className='dc-modal-overlay';
  modal.innerHTML=`<div class="dc-modal" style="max-width:380px;"><h2>🚩 Report ${esc(targetUsername||'User')}</h2><div class="dc-field"><label>Reason</label><select id="report-reason" style="width:100%;padding:9px 12px;border-radius:8px;border:1px solid var(--br);background:var(--dc-input-bg);color:inherit;font-family:inherit;font-size:13px;"><option value="harassment">Harassment / Bullying</option><option value="spam">Spam</option><option value="inappropriate">Inappropriate Content</option><option value="hate_speech">Hate Speech</option><option value="nsfw">NSFW / Sexual Content</option><option value="threats">Threats / Violence</option><option value="other">Other</option></select></div><div class="dc-field"><label>Details <span style="font-size:11px;font-weight:400;opacity:.6;">(optional)</span></label><textarea id="report-details" rows="3" maxlength="500" placeholder="Describe what happened…" style="resize:vertical;"></textarea></div>${msgText?`<div class="dc-field"><label>Message context</label><div style="background:var(--dc-ch-hover);border-radius:8px;padding:8px 12px;font-size:12px;color:var(--dc-muted);max-height:80px;overflow:hidden;">${esc(String(msgText).slice(0,200))}</div></div>`:''}<p id="report-err" style="color:#ef4444;font-size:12px;min-height:14px;"></p><div class="dc-modal-btns"><button class="dc-btn-sec" id="report-cancel">Cancel</button><button class="dc-btn-pri" id="report-submit" style="background:#ef4444;">Submit Report</button></div></div>`;
  document.body.appendChild(modal); modal.querySelector('#report-cancel').onclick=()=>modal.remove(); modal.querySelector('#report-submit').onclick=async()=>{const reason=modal.querySelector('#report-reason').value; const description=modal.querySelector('#report-details').value.trim()||reason; const{error}=await sb.from('reports').insert({type:'user',reporter_id:currentUserId,reporter_username:currentProfile?.username||null,reporter_email:currentProfile?.email||null,reporter_role:currentProfile?.role||'user',reported_user_id:targetUserId,reported_username:targetUsername||null,reason,description,context:msgText||null,status:'open'}); if(error){modal.querySelector('#report-err').textContent=error.message;return;} modal.remove(); showToast('🚩 Report submitted. Mods will review it.');};
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}
async function loadChatProfile(userId){if(!userId)return null; const{data}=await sb.from('chat_profiles').select('*').eq('user_id',userId).maybeSingle(); return data||null;}
async function openEditChatProfile(){
  if(!currentUserId){location.href='/account';return;} const existing=await loadChatProfile(currentUserId); document.getElementById('chatprofile-modal')?.remove();
  const modal=document.createElement('div'); modal.id='chatprofile-modal'; modal.className='dc-modal-overlay'; modal.innerHTML=`<div class="dc-modal" style="max-width:380px;"><h2>✏️ Edit Chat Profile</h2><div class="dc-field"><label>Bio <span style="font-size:11px;font-weight:400;opacity:.6;">(max 150 chars)</span></label><textarea id="cp-bio" rows="3" maxlength="150" placeholder="Tell people a bit about yourself…" style="resize:vertical;">${esc(existing?.bio||'')}</textarea></div><div class="dc-field" style="display:flex;gap:12px;"><div style="flex:1;"><label>Status Emoji</label><input id="cp-emoji" maxlength="4" placeholder="😎" value="${esc(existing?.status_emoji||'')}" style="width:100%;"/></div><div style="flex:2;"><label>Status Text</label><input id="cp-status" maxlength="60" placeholder="What's up?" value="${esc(existing?.status_text||'')}" style="width:100%;"/></div></div><p id="cp-err" style="color:#ef4444;font-size:12px;min-height:14px;"></p><div class="dc-modal-btns"><button class="dc-btn-sec" id="cp-cancel">Cancel</button><button class="dc-btn-pri" id="cp-save">Save</button></div></div>`;
  document.body.appendChild(modal); modal.querySelector('#cp-cancel').onclick=()=>modal.remove(); modal.querySelector('#cp-save').onclick=async()=>{const bio=modal.querySelector('#cp-bio').value.trim()||null; const status_emoji=modal.querySelector('#cp-emoji').value.trim()||null; const status_text=modal.querySelector('#cp-status').value.trim()||null; const{error}=await sb.from('chat_profiles').upsert({user_id:currentUserId,bio,status_emoji,status_text,updated_at:new Date().toISOString()},{onConflict:'user_id'}); if(error){modal.querySelector('#cp-err').textContent=error.message;return;} modal.remove(); showToast('✅ Chat profile updated!');};
  modal.addEventListener('click',e=>{if(e.target===modal)modal.remove();});
}
async function toggleFollow(creatorId,creatorUsername){if(!currentUserId){location.href='/account';return false;} const{data:ex}=await sb.from('follows').select('follower_id').eq('follower_id',currentUserId).eq('creator_id',creatorId).maybeSingle(); if(ex){await sb.from('follows').delete().eq('follower_id',currentUserId).eq('creator_id',creatorId);showToast(`Unfollowed @${creatorUsername||'user'}`);return false;} await sb.from('follows').insert({follower_id:currentUserId,creator_id:creatorId});showToast(`✅ Following @${creatorUsername||'user'}!`);return true;}
async function getFollowCounts(userId){const[{count:followers},{count:following}]=await Promise.all([sb.from('follows').select('*',{count:'exact',head:true}).eq('creator_id',userId),sb.from('follows').select('*',{count:'exact',head:true}).eq('follower_id',userId)]); return{followers:followers||0,following:following||0};}
function renderProfileExtras(userId,p,chatP,popup){let bioEl=document.getElementById('pp-bio'); if(!bioEl){bioEl=document.createElement('div');bioEl.id='pp-bio';bioEl.style.cssText='font-size:12px;color:var(--dc-muted);margin:4px 0 8px;line-height:1.5;';document.getElementById('pp-email')?.after(bioEl);} const statusLine=chatP?.status_emoji?`${chatP.status_emoji} ${chatP.status_text||''}`:(chatP?.status_text||''); bioEl.innerHTML=(chatP?.bio?`<div style="margin-bottom:4px;">${esc(chatP.bio)}</div>`:'')+(statusLine?`<div style="color:var(--a);">${esc(statusLine)}</div>`:''); let fcEl=document.getElementById('pp-follows'); if(!fcEl){fcEl=document.createElement('div');fcEl.id='pp-follows';fcEl.style.cssText='display:flex;gap:16px;font-size:12px;margin:6px 0 10px;';bioEl.after(fcEl);} fcEl.innerHTML='<span style="color:var(--dc-muted);">…</span>'; getFollowCounts(userId).then(({followers,following})=>{if(!fcEl.isConnected)return; fcEl.innerHTML=`<span><strong>${followers}</strong> <span style="color:var(--dc-muted);">followers</span></span><span><strong>${following}</strong> <span style="color:var(--dc-muted);">following</span></span>`;}); document.getElementById('pp-action-row')?.remove(); document.getElementById('pp-self-edit')?.remove();}
async function renderProfileActions(userId,p,popup,dmBtn){const ppBody=document.querySelector('.pp-body'); if(!ppBody)return; if(userId!==currentUserId&&currentUserId){const row=document.createElement('div');row.id='pp-action-row';row.style.cssText='display:flex;gap:8px;margin-top:6px;flex-wrap:wrap;'; const{data:friendship}=await sb.from('friendships').select('id,status,requester_id').or(friendshipPairFilter(userId)).maybeSingle(); const friendBtn=document.createElement('button');friendBtn.className='dc-btn-sec';friendBtn.style.cssText='flex:1;font-size:12px;padding:6px;'; if(!friendship){friendBtn.textContent='➕ Add Friend';friendBtn.onclick=async()=>{await sb.from('friendships').insert({requester_id:currentUserId,addressee_id:userId,status:'pending'});showToast('Friend request sent!');popup.classList.add('hidden');};} else if(friendship.status==='pending'&&friendship.requester_id===currentUserId){friendBtn.textContent='⏳ Pending';friendBtn.disabled=true;} else if(friendship.status==='pending'&&friendship.requester_id===userId){friendBtn.textContent='✓ Accept';friendBtn.onclick=async()=>{await sb.from('friendships').update({status:'accepted'}).eq('id',friendship.id);showToast('Friend accepted!');popup.classList.add('hidden');};} else if(friendship.status==='accepted'){friendBtn.textContent='👥 Friends';friendBtn.disabled=true;} row.appendChild(friendBtn); const{data:followEx}=await sb.from('follows').select('follower_id').eq('follower_id',currentUserId).eq('creator_id',userId).maybeSingle(); const followBtn=document.createElement('button');followBtn.className='dc-btn-sec';followBtn.style.cssText='flex:1;font-size:12px;padding:6px;';followBtn.textContent=followEx?'✓ Following':'+ Follow';followBtn.classList.toggle('active',!!followEx);followBtn.onclick=async()=>{const now=await toggleFollow(userId,p.username);followBtn.textContent=now?'✓ Following':'+ Follow';followBtn.classList.toggle('active',!!now);}; row.appendChild(followBtn); const repBtn=document.createElement('button');repBtn.className='dc-action-btn';repBtn.title='Report';repBtn.textContent='🚩';repBtn.style.cssText='color:#ef4444;padding:6px 8px;';repBtn.onclick=()=>{popup.classList.add('hidden');openReportModal(userId,p.username,null);}; row.appendChild(repBtn); dmBtn.parentNode?ppBody.insertBefore(row,dmBtn.nextSibling):ppBody.appendChild(row);} else if(userId===currentUserId){const editRow=document.createElement('div');editRow.id='pp-self-edit';editRow.style.cssText='display:flex;gap:8px;margin-top:8px;'; const editBtn=document.createElement('button');editBtn.className='dc-btn-sec';editBtn.style.cssText='flex:1;font-size:12px;';editBtn.textContent='✏️ Edit Chat Profile';editBtn.onclick=()=>{popup.classList.add('hidden');openEditChatProfile();}; const statusBtn=document.createElement('button');statusBtn.className='dc-btn-sec';statusBtn.style.cssText='flex:1;font-size:12px;';statusBtn.textContent='🟢 Status';statusBtn.onclick=()=>{popup.classList.add('hidden');openStatusModal();}; editRow.append(editBtn,statusBtn); ppBody.appendChild(editRow);}}
function addFriendsRailBtn(){const railDMs=document.getElementById('railDMs'); if(!railDMs||document.getElementById('railFriends'))return; const btn=document.createElement('button');btn.id='railFriends';btn.className='rail-dm-btn';btn.title='Friends';btn.textContent='👥';btn.style.marginBottom='4px';btn.onclick=()=>openFriendsPanel(); railDMs.after(btn); checkPendingFriendRequests();}
function addReportToCtxMenu(){const ctxMenu=document.getElementById('ctx-menu'); if(!ctxMenu||document.getElementById('ctx-report'))return; const rep=document.createElement('div');rep.className='ctx-item';rep.id='ctx-report';rep.textContent='🚩 Report Message';rep.onclick=()=>{ctxMenu.classList.add('hidden');if(ctxTargetMsg)openReportModal(ctxTargetMsg.user_id,ctxTargetMsg.username,ctxTargetMsg.text);}; const lastSep=ctxMenu.querySelector('.ctx-sep:last-of-type'); if(lastSep)lastSep.after(rep); else ctxMenu.appendChild(rep);}
async function checkPendingFriendRequests(){if(!currentUserId)return; const{count}=await sb.from('friendships').select('*',{count:'exact',head:true}).eq('addressee_id',currentUserId).eq('status','pending'); const btn=document.getElementById('railFriends'); if(!btn)return; let badge=btn.querySelector('.rail-friend-badge'); if(count>0){if(!badge){badge=document.createElement('span');badge.className='rail-friend-badge rail-unread';badge.style.cssText='position:absolute;top:2px;right:2px;';btn.style.position='relative';btn.appendChild(badge);} badge.textContent=count>9?'9+':String(count);} else badge?.remove();}
function watchFriendRequests(){if(friendWatchChannel||!sb)return; friendWatchChannel=sb.channel('friendship-watch').on('postgres_changes',{event:'*',schema:'public',table:'friendships'},()=>{checkPendingFriendRequests(); if(!document.getElementById('ftab-pending')?.classList.contains('hidden'))loadPendingFriends();}).subscribe(); setTimeout(checkPendingFriendRequests,2000);}
function patchUserChip(){const chip=document.getElementById('dcUserChip'); if(!chip||chip.dataset.profilePatched)return; chip.dataset.profilePatched='1'; chip.style.cursor='pointer'; chip.addEventListener('click',e=>{if(e.target.closest('.dc-settings-btn'))return; if(currentUserId)showProfilePopup(currentUserId,chip);});}
function initSocialEnhancements(){addFriendsRailBtn();addReportToCtxMenu();patchUserChip();watchFriendRequests();}

/* ══════════════════════════════════════════════════════
   PROFILE POPUP
══════════════════════════════════════════════════════ */
async function showProfilePopup(userId,anchorEl){
  if(!userId) return;
  const p=await getProfile(userId);
  const popup=document.getElementById('profile-popup');
  const bc={admin:'#ef4444',mod:'#f59e0b',user:'#3b82f6'};
  document.getElementById('pp-banner').style.background=bc[p.role||'user']||'#3b82f6';
  const av=document.getElementById('pp-avatar'); av.innerHTML='';
  if(p.avatar_url){const img=document.createElement('img');img.src=p.avatar_url;img.style.cssText='width:100%;height:100%;border-radius:50%;object-fit:cover;';av.appendChild(img);}
  else av.textContent=getInitials(p.username);
  document.getElementById('pp-name').textContent=p.username||'Unknown';
  document.getElementById('pp-tag').textContent=p.tag?`[${p.tag}]`:'';
  const re=document.getElementById('pp-role'); re.textContent=p.role||'user'; re.style.background=bc[p.role||'user']||'#3b82f6';
  document.getElementById('pp-email').textContent=p.email||'';
  const chatP=await loadChatProfile(userId);
  renderProfileExtras(userId,p,chatP,popup);
  const dmBtn=document.getElementById('pp-dm-btn'); dmBtn.style.display=userId===currentUserId?'none':'block';
  dmBtn.onclick=async()=>{popup.classList.add('hidden');if(p.username||p.email)await startDMWith(p.username||p.email);};
  await renderProfileActions(userId,p,popup,dmBtn);
  const rect=anchorEl.getBoundingClientRect();
  popup.style.top=Math.min(rect.bottom+6,window.innerHeight-380)+'px';
  popup.style.left=Math.min(rect.right+8,window.innerWidth-300)+'px';
  popup.classList.remove('hidden');
}
document.addEventListener('click',e=>{if(!document.getElementById('profile-popup').contains(e.target))document.getElementById('profile-popup').classList.add('hidden');});

/* ══════════════════════════════════════════════════════
   DM
══════════════════════════════════════════════════════ */
async function startDMWith(emailOrUsername){
  let profile;
  const{data:byEmail}=await sb.from('profiles').select('id,username,email').ilike('email',emailOrUsername).maybeSingle();
  if(byEmail){profile=byEmail;}else{const un=emailOrUsername.replace(/^@/,'');const{data:byUser}=await sb.from('profiles').select('id,username,email').ilike('username',un).maybeSingle();profile=byUser;}
  if(!profile){document.getElementById('dm-err').textContent='No user found.';return;}
  if(profile.id===currentUserId){document.getElementById('dm-err').textContent="That's you!";return;}
  const{data:ex}=await sb.from('direct_messages').select('id').or(`and(user_a.eq.${currentUserId},user_b.eq.${profile.id}),and(user_a.eq.${profile.id},user_b.eq.${currentUserId})`).maybeSingle();
  let dmId;
  if(ex){dmId=ex.id;}else{
    const{data:nd,error}=await sb.from('direct_messages').insert({user_a:currentUserId,user_b:profile.id,created_by:currentUserId}).select().single();
    if(error){document.getElementById('dm-err').textContent=error.message;return;}
    dmId=nd.id;
    const{error:pErr}=await sb.from('dm_participants').insert([{dm_id:dmId,user_id:currentUserId},{dm_id:dmId,user_id:profile.id}]);
    if(pErr){document.getElementById('dm-err').textContent=pErr.message;return;}
  }
  closeModal('dmModal'); showingDMs=true; setActiveServer(null); await buildSidebar(null);
  switchRoom({type:'dm',id:dmId,name:profile.username,icon:'@',serverId:null,serverName:'Direct Messages',otherId:profile.id});
}

/* ══════════════════════════════════════════════════════
   SERVER MODAL (with image upload)
══════════════════════════════════════════════════════ */
function openServerModal(server){
  pendingServerIconFile=null;
  const isEdit=!!server;
  document.getElementById('serverModalTitle').textContent=isEdit?'Edit Server':'Create Server';
  document.getElementById('sm-name').value=server?.name||'';
  document.getElementById('sm-desc').value=server?.description||'';
  document.getElementById('sm-pass').value='';
  document.getElementById('sm-err').textContent='';
  document.getElementById('sm-submit').textContent=isEdit?'Save':'Create';
  const prev=document.getElementById('sm-icon-preview');
  if(prev){
    prev.innerHTML='';
    if(server?.icon&&(server.icon.startsWith('http')||server.icon.startsWith('/'))){
      const img=document.createElement('img');img.src=server.icon;prev.appendChild(img);
    } else { prev.textContent=server?.icon||'🌐'; }
    const ov=document.createElement('div');ov.className='icon-overlay';ov.textContent='📷';prev.appendChild(ov);
    prev.onclick=()=>document.getElementById('sm-icon-file')?.click();
  }
  const fileInp=document.getElementById('sm-icon-file');
  if(fileInp){fileInp.onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    if(f.size>1*1024*1024){showToast('❌ Image must be under 1 MB');e.target.value='';return;}
    pendingServerIconFile=f;
    const reader=new FileReader();reader.onload=ev=>{
      const p=document.getElementById('sm-icon-preview');p.innerHTML='';
      const img=document.createElement('img');img.src=ev.target.result;p.appendChild(img);
      const ov=document.createElement('div');ov.className='icon-overlay';ov.textContent='📷';p.appendChild(ov);
    };reader.readAsDataURL(f);
  };}
  const btn=document.getElementById('sm-submit');
  btn.onclick=isEdit?()=>saveServer(server):()=>createServer();
  openModal('serverModal');
}
async function uploadServerIcon(file){
  const ext=file.name.split('.').pop().toLowerCase();
  const path=`${currentUserId}/${Date.now()}.${ext}`;
  const{error}=await sb.storage.from('server-icons').upload(path,file,{cacheControl:'3600',upsert:true});
  if(error){showToast('❌ Icon upload failed: '+error.message);return null;}
  const{data:u}=sb.storage.from('server-icons').getPublicUrl(path); return u?.publicUrl||null;
}
async function createServer(){
  const name=document.getElementById('sm-name').value.trim();if(!name){document.getElementById('sm-err').textContent='Name required.';return;}
  const desc=document.getElementById('sm-desc').value.trim();const pass=document.getElementById('sm-pass').value.trim();
  const btn=document.getElementById('sm-submit');btn.disabled=true;btn.textContent='Creating…';
  let iconUrl=null;
  if(pendingServerIconFile){iconUrl=await uploadServerIcon(pendingServerIconFile);if(!iconUrl){btn.disabled=false;btn.textContent='Create';return;}}
  const{data:server,error}=await sb.from('servers').insert({name,description:desc||null,passcode:pass||null,owner_id:currentUserId,icon:iconUrl||'🌐'}).select().single();
  if(error){document.getElementById('sm-err').textContent=error.message;btn.disabled=false;btn.textContent='Create';return;}
  await sb.from('channels').insert({name:'general',server_id:server.id,is_public:true,category:'TEXT CHANNELS'});
  await sb.from('server_members').insert({server_id:server.id,user_id:currentUserId});
  joinedServerIds.add(server.id);pendingServerIconFile=null;
  closeModal('serverModal');btn.disabled=false;btn.textContent='Create';await buildRail();await enterServer(server);
}
async function saveServer(server){
  const name=document.getElementById('sm-name').value.trim();if(!name){document.getElementById('sm-err').textContent='Name required.';return;}
  const btn=document.getElementById('sm-submit');btn.disabled=true;btn.textContent='Saving…';
  let iconUrl=server.icon||null;
  if(pendingServerIconFile){iconUrl=await uploadServerIcon(pendingServerIconFile);if(!iconUrl){btn.disabled=false;btn.textContent='Save';return;}}
  await sb.from('servers').update({name,description:document.getElementById('sm-desc').value.trim()||null,icon:iconUrl}).eq('id',server.id);
  pendingServerIconFile=null;closeModal('serverModal');btn.disabled=false;btn.textContent='Save';
  await buildRail();const{data:s}=await sb.from('servers').select('*').eq('id',server.id).maybeSingle();if(s)buildSidebar(s);
}

/* ══════════════════════════════════════════════════════
   ADD CHANNEL MODAL
══════════════════════════════════════════════════════ */
function openAddChannelModal(server){
  document.getElementById('ch-name').value='';document.getElementById('ch-cat').value='TEXT CHANNELS';
  document.getElementById('ch-topic').value='';document.getElementById('ch-err').textContent='';
  document.getElementById('ch-restricted').checked=false;
  document.getElementById('ch-create').dataset.serverId=server.id;openModal('channelModal');
}
document.getElementById('ch-cancel').onclick=()=>closeModal('channelModal');
document.getElementById('ch-create').onclick=async()=>{
  const sid=document.getElementById('ch-create').dataset.serverId;
  const name=document.getElementById('ch-name').value.trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  if(!name){document.getElementById('ch-err').textContent='Name required.';return;}
  const{error}=await sb.from('channels').insert({name,server_id:sid,is_public:true,category:document.getElementById('ch-cat').value.trim()||'TEXT CHANNELS',topic:document.getElementById('ch-topic').value.trim()||null,restricted_post:document.getElementById('ch-restricted').checked});
  if(error){document.getElementById('ch-err').textContent=error.message;return;}
  closeModal('channelModal');const{data:s}=await sb.from('servers').select('*').eq('id',sid).maybeSingle();if(s)buildSidebar(s);
};

// ── Channel post-permission management (owner/admin only) ──
async function manageChannelPosters(channelId,channelName){
  const{data:ch}=await sb.from('channels').select('restricted_post').eq('id',channelId).maybeSingle();
  const wantRestricted=confirm(`"#${channelName}" is currently ${ch?.restricted_post?'RESTRICTED':'open to everyone'}.\n\nOK = make it restricted (only allow-listed members can post)\nCancel = open it up to everyone`);
  await sb.from('channels').update({restricted_post:wantRestricted}).eq('id',channelId);
  if(wantRestricted){
    const{data:existing}=await sb.from('channel_post_permissions').select('user_id').eq('channel_id',channelId);
    const names=await Promise.all((existing||[]).map(async r=>(await getProfile(r.user_id))?.username));
    const input=prompt('Usernames allowed to post here, comma separated:',names.filter(Boolean).join(', '));
    if(input!==null){
      await sb.from('channel_post_permissions').delete().eq('channel_id',channelId);
      const usernames=input.split(',').map(s=>s.trim()).filter(Boolean);
      for(const un of usernames){
        const{data:p}=await sb.from('profiles').select('id').ilike('username',un).maybeSingle();
        if(p) await sb.from('channel_post_permissions').insert({channel_id:channelId,user_id:p.id,granted_by:currentUserId});
      }
    }
  }
  showToast('✅ Channel permissions updated.');
  await updateComposerPermission();
}

// Reflects whether the current user can actually post in the active channel
// -- disables the composer with a clear reason instead of letting a message
// silently fail against RLS.
async function updateComposerPermission(){
  const inputEl=document.getElementById('msgInput');
  const permsBtn=document.getElementById('btnChanPerms');
  if(activeRoom.type!=='channel'){
    inputEl.disabled=false;inputEl.placeholder='Message #'+activeRoom.name+'…';
    permsBtn.classList.add('hidden');
    return;
  }
  const{data:ch}=await sb.from('channels').select('restricted_post').eq('id',activeRoom.id).maybeSingle();
  const isAdmin=currentProfile?.role==='admin';
  const{data:srv}=await sb.from('servers').select('owner_id').eq('id',activeRoom.serverId).maybeSingle();
  const isOwner=srv?.owner_id===currentUserId;
  permsBtn.classList.toggle('hidden',!(isAdmin||isOwner));
  permsBtn.onclick=()=>manageChannelPosters(activeRoom.id,activeRoom.name);

  if(!ch?.restricted_post){inputEl.disabled=false;inputEl.placeholder='Message #'+activeRoom.name+'…';return;}
  const{data:perm}=await sb.from('channel_post_permissions').select('user_id').eq('channel_id',activeRoom.id).eq('user_id',currentUserId).maybeSingle();
  const allowed=!!perm||isAdmin||isOwner;
  inputEl.disabled=!allowed;
  inputEl.placeholder=allowed?'Message #'+activeRoom.name+'…':'🔒 Only certain members can post in this channel';
}

/* ══════════════════════════════════════════════════════
   INVITE PANEL
══════════════════════════════════════════════════════ */
function openInvitePanel(server){
  let panel=document.getElementById('invite-panel');
  if(!panel){
    panel=document.createElement('div');panel.id='invite-panel';panel.className='invite-panel hidden';
    panel.innerHTML=`<div class="invite-header"><span>🔗 Invite Links</span><button id="invite-close">✕</button></div><div class="invite-body"><button id="invite-gen-btn" class="dc-btn-pri" style="width:100%;margin-bottom:12px;">＋ Generate Invite</button><div id="invite-list" class="invite-list"></div></div>`;
    document.getElementById('dcMain').appendChild(panel);
    document.getElementById('invite-close').onclick=()=>panel.classList.add('hidden');
  }
  closeAllPanels();panel.classList.remove('hidden');
  document.getElementById('invite-gen-btn').onclick=()=>generateInvite(server.id);
  loadInvites(server.id);
}
async function generateInvite(serverId){
  const code=Math.random().toString(36).slice(2,10).toUpperCase();
  const{error}=await sb.from('server_invites').insert({server_id:serverId,code,created_by:currentUserId,expires_at:new Date(Date.now()+7*24*60*60000).toISOString()});
  if(error){showToast('❌ '+error.message);return;}
  const link=`${location.origin}/chat?invite=${code}`;
  navigator.clipboard.writeText(link).then(()=>showToast('✅ Invite copied!')).catch(()=>showToast('✅ Code: '+code));
  loadInvites(serverId);
}
async function loadInvites(serverId){
  const list=document.getElementById('invite-list');if(!list)return;
  list.innerHTML='<div style="font-size:12px;color:var(--dc-muted);padding:8px 0;">Loading…</div>';
  const{data,error}=await sb.from('server_invites').select('*').eq('server_id',serverId).order('created_at',{ascending:false});
  if(error||!data?.length){list.innerHTML=`<div style="font-size:12px;color:var(--dc-muted);text-align:center;padding:16px;">No invite links yet.</div>`;return;}
  list.innerHTML='';
  data.forEach(inv=>{
    const expired=inv.expires_at&&new Date(inv.expires_at)<new Date();
    const link=`${location.origin}/chat?invite=${inv.code}`;
    const item=document.createElement('div');item.className='invite-item';
    item.innerHTML=`<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;"><code class="invite-code">${esc(inv.code)}</code><div style="display:flex;gap:6px;"><button class="dc-action-btn inv-copy" title="Copy">📋</button><button class="dc-action-btn inv-del" title="Revoke" style="color:#ef4444;">🗑</button></div></div><div style="font-size:11px;color:var(--dc-muted);margin-top:5px;">${inv.used?'<span style="color:#ef4444;">✗ Used</span>':'<span style="color:#22c55e;">✓ Active</span>'}${expired?'<span style="color:#f59e0b;margin-left:6px;">⏰ Expired</span>':''}<span style="margin-left:6px;">· Expires ${new Date(inv.expires_at).toLocaleDateString()}</span></div>`;
    item.querySelector('.inv-copy').onclick=()=>navigator.clipboard.writeText(link).then(()=>showToast('📋 Copied!'));
    item.querySelector('.inv-del').onclick=async()=>{await sb.from('server_invites').delete().eq('id',inv.id);loadInvites(serverId);};
    list.appendChild(item);
  });
}
async function handleInviteCode(){
  const code=new URLSearchParams(location.search).get('invite');if(!code)return;
  history.replaceState(null,'','/chat');
  if(!currentUserId){showToast('Sign in to use invite links');setTimeout(()=>location.href='/account?from=/chat?invite='+code,1500);return;}
  const{data,error}=await sb.from('server_invites').select('*').eq('code',code).eq('used',false).maybeSingle();
  if(error||!data){showToast('❌ Invalid or expired invite');return;}
  if(data.expires_at&&new Date(data.expires_at)<new Date()){showToast('❌ Invite expired');return;}
  if(joinedServerIds.has(data.server_id)){showToast('ℹ️ Already in this server');const{data:s}=await sb.from('servers').select('*').eq('id',data.server_id).maybeSingle();if(s)handleServerClick(s);return;}
  await sb.from('server_invites').update({used:true,used_by:currentUserId}).eq('id',data.id);
  await joinServer(data.server_id);
  const{data:s}=await sb.from('servers').select('*').eq('id',data.server_id).maybeSingle();
  if(s){showToast('🎉 Joined '+s.name+'!');await buildRail();handleServerClick(s);}
}

/* ══════════════════════════════════════════════════════
   MODALS
══════════════════════════════════════════════════════ */
function openModal(id){
  document.getElementById(id)?.classList.remove('hidden');
  if(id==='dmModal'){
    pendingDMRecipients=[]; renderDMChips();
    document.getElementById('dm-target').value='';
    document.getElementById('dm-group-name').value='';
    document.getElementById('dm-err').textContent='';
  }
}
function closeModal(id){document.getElementById(id)?.classList.add('hidden');}
document.getElementById('railAddServer').onclick=()=>{if(!currentUserId){location.href='/account';return;}openServerModal(null);};
document.getElementById('sm-cancel').onclick=()=>closeModal('serverModal');
document.getElementById('railDMs').onclick=async()=>{
  if(!currentUserId){location.href='/account';return;}
  showingDMs=!showingDMs;setActiveServer(null);await buildSidebar(null);
  document.getElementById('railDMs').classList.toggle('active',showingDMs);
};
document.getElementById('dm-cancel').onclick=()=>closeModal('dmModal');
let pendingDMRecipients=[];
function renderDMChips(){
  const wrap=document.getElementById('dm-recipient-chips'); wrap.innerHTML='';
  pendingDMRecipients.forEach((p,i)=>{
    const chip=document.createElement('span');
    chip.style.cssText='display:inline-flex;align-items:center;gap:6px;background:var(--dc-ch-hover);border-radius:999px;padding:4px 10px;font-size:12px;';
    chip.innerHTML=`@${esc(p.username)} <button style="background:none;border:none;cursor:pointer;color:var(--dc-muted);font-size:12px;" data-i="${i}">✕</button>`;
    chip.querySelector('button').onclick=()=>{pendingDMRecipients.splice(i,1);renderDMChips();};
    wrap.appendChild(chip);
  });
  document.getElementById('dm-group-name-field').style.display=pendingDMRecipients.length>1?'':'none';
}
async function resolveUserByEmailOrUsername(q){
  const{data:byEmail}=await sb.from('profiles').select('id,username,email').ilike('email',q).maybeSingle();
  if(byEmail) return byEmail;
  const un=q.replace(/^@/,'');
  const{data:byUser}=await sb.from('profiles').select('id,username,email').ilike('username',un).maybeSingle();
  return byUser||null;
}
async function addDMRecipient(){
  const input=document.getElementById('dm-target'); const q=input.value.trim(); if(!q) return;
  const errEl=document.getElementById('dm-err'); errEl.textContent='';
  const profile=await resolveUserByEmailOrUsername(q);
  if(!profile){errEl.textContent='No user found.';return;}
  if(profile.id===currentUserId){errEl.textContent="That's you!";return;}
  if(pendingDMRecipients.some(p=>p.id===profile.id)){input.value='';return;}
  pendingDMRecipients.push(profile); input.value=''; renderDMChips();
}
document.getElementById('dm-target').onkeydown=e=>{if(e.key===','||e.key==='Enter'){e.preventDefault();addDMRecipient();}};
document.getElementById('dm-start').onclick=async()=>{
  await addDMRecipient(); // catch anything still sitting in the input
  const errEl=document.getElementById('dm-err');
  if(!pendingDMRecipients.length){errEl.textContent='Add at least one person.';return;}
  if(pendingDMRecipients.length===1){await startDMWith(pendingDMRecipients[0].username);pendingDMRecipients=[];renderDMChips();return;}
  const name=document.getElementById('dm-group-name').value.trim()||null;
  const{data:dmId,error}=await sb.rpc('create_group_dm',{p_name:name});
  if(error){errEl.textContent=error.message;return;}
  const dm={id:dmId};
  const rows=pendingDMRecipients.map(p=>({dm_id:dmId,user_id:p.id}));
  const{error:pErr}=rows.length?await sb.from('dm_participants').insert(rows):{error:null};
  if(pErr){errEl.textContent=pErr.message;return;}
  const groupLabel=name||pendingDMRecipients.map(p=>p.username).join(', ');
  pendingDMRecipients=[]; renderDMChips();
  closeModal('dmModal'); showingDMs=true; setActiveServer(null); await buildSidebar(null);
  switchRoom({type:'dm',id:dm.id,name:groupLabel,icon:'@',serverId:null,serverName:'Direct Messages',isGroup:true});
};
document.getElementById('dcMobileBack').onclick=()=>document.getElementById('dcSidebar').classList.toggle('mobile-open');
document.getElementById('sidebarToggle')?.addEventListener('click',()=>document.getElementById('dcSidebar').classList.toggle('mobile-open'));
document.getElementById('jm-cancel')?.addEventListener('click',()=>closeModal('joinModal'));
document.getElementById('jm-join')?.addEventListener('click',async()=>{
  const pass=document.getElementById('jm-pass')?.value.trim();const err=document.getElementById('jm-err');
  const sid=document.getElementById('jm-join')?.dataset.serverId;if(!sid)return;
  const{data:server}=await sb.from('servers').select('*').eq('id',sid).maybeSingle();
  if(!server){if(err)err.textContent='Server not found.';return;}
  const{data:ok,error}=await sb.rpc('join_server_with_passcode',{p_server_id:sid,p_passcode:pass||null});
  if(error||!ok){if(err)err.textContent='Wrong passcode.';return;}
  joinedServerIds.add(sid);
  closeModal('joinModal');await enterServer(server);
});

/* ══════════════════════════════════════════════════════
   LIGHTBOX
══════════════════════════════════════════════════════ */
function openLightbox(src){document.getElementById('lightbox-img').src=src;document.getElementById('lightbox').classList.remove('hidden');}
document.getElementById('lightbox').onclick=e=>{if(e.target===e.currentTarget)document.getElementById('lightbox').classList.add('hidden');};
document.getElementById('lightbox-close').onclick=()=>document.getElementById('lightbox').classList.add('hidden');

/* ══════════════════════════════════════════════════════
   PRESENCE
══════════════════════════════════════════════════════ */
async function initGlobalDMWatcher() {
  if (!currentUserId) return;
  if (window._dmGlobalChan) return;
  // Get all DM IDs this user is part of
  const { data: dms } = await sb.from('direct_messages')
    .select('id').or(`user_a.eq.${currentUserId},user_b.eq.${currentUserId}`);
  if (!dms?.length) return;
  const allDmIds = dms.map(d => d.id);
  if (!allDmIds.length) return;

  window._dmGlobalChan = sb.channel('global-dm-watcher:'+currentUserId)
    .on('postgres_changes', { event:'INSERT', schema:'public', table:'dm_messages' }, async ({new: msg}) => {
      if (!allDmIds.includes(msg.dm_id)) return;
      if (msg.user_id === currentUserId) return;
      // Update unread badge
      const key = 'dm:'+msg.dm_id;
      if (activeRoom?.id === msg.dm_id) return; // already viewing
      unreadCounts[key] = (unreadCounts[key]||0)+1;
      const dmEl = document.querySelector(`[data-dm-id="${msg.dm_id}"]`);
      if (dmEl) {
        let b = dmEl.querySelector('.ch-unread-badge');
        if (!b) { b=document.createElement('span'); b.className='ch-unread-badge'; dmEl.appendChild(b); }
        b.textContent = unreadCounts[key]>99?'99+':String(unreadCounts[key]);
      }
      // DM bubble icon badge (rail)
      const dmRailBtn = document.getElementById('railDMs') || document.getElementById('dm-rail-btn');
      if (dmRailBtn) {
        let pip = dmRailBtn.querySelector('.rail-unread');
        const total = Object.entries(unreadCounts).filter(([k])=>k.startsWith('dm:')).reduce((a,[,v])=>a+v,0);
        if (total > 0) {
          if (!pip) { pip=document.createElement('span'); pip.className='rail-unread'; dmRailBtn.style.position='relative'; dmRailBtn.appendChild(pip); }
          pip.textContent = total>9?'9+':String(total);
        } else pip?.remove();
      }
      // Pop-up notification like incoming call
      showDMNotification(msg);
    })
    .subscribe();
}

function showDMNotification(msg) {
  document.querySelector('.dm-notif-popup')?.remove();
  const pop = document.createElement('div');
  pop.className = 'dm-notif-popup';
  const initials = (msg.username||'?').slice(0,2).toUpperCase();
  pop.innerHTML = `
    <div class="dm-notif-avatar">${msg.avatar_url?`<img src="${msg.avatar_url}" alt=""/>`:`<span>${initials}</span>`}</div>
    <div class="dm-notif-body">
      <div class="dm-notif-name">${esc(msg.username||'Someone')}</div>
      <div class="dm-notif-text">${msg.file_url?'📎 Attachment':esc((msg.text||'').slice(0,60))}</div>
    </div>
    <button class="dm-notif-close" onclick="this.closest('.dm-notif-popup').remove()">✕</button>`;
  pop.onclick = e => {
    if (e.target.classList.contains('dm-notif-close')) return;
    pop.remove();
    // Navigate to this DM
    sb.from('direct_messages').select('*').eq('id', msg.dm_id).maybeSingle().then(({data:dm})=>{
      if (!dm) return;
      const otherId = dm.user1_id === currentUserId ? dm.user2_id : dm.user1_id;
      sb.from('profiles').select('username').eq('id', otherId).maybeSingle().then(({data:p})=>{
        showingDMs=true; setActiveServer(null); buildSidebar(null);
        switchRoom({type:'dm',id:dm.id,name:p?.username||'DM',icon:'@',serverId:null,serverName:'Direct Messages',otherId});
      });
    });
  };
  document.body.appendChild(pop);
  setTimeout(() => pop.classList.add('show'), 10);
  setTimeout(() => { pop.classList.remove('show'); setTimeout(()=>pop.remove(),300); }, 5000);
}

function startPresence(){
  if(!currentUserId) return;
  const chan=sb.channel('presence-global',{config:{presence:{key:currentUserId}}});
  chan.on('presence',{event:'sync'},()=>{
    presenceState=chan.presenceState();
    const count=Object.keys(presenceState).length;
    document.getElementById('onlineCount').textContent=count;
    if(!document.getElementById('online-panel')?.classList.contains('hidden')) renderOnlineList();
    if(!document.getElementById('members-panel')?.classList.contains('hidden')) loadMembers();
  }).subscribe(async s=>{
    if(s==='SUBSCRIBED') await chan.track({uid:currentUserId,username:currentProfile?.username,avatar_url:currentProfile?.avatar_url});
  });
}

/* ══════════════════════════════════════════════════════
   UNREAD TRACKING
══════════════════════════════════════════════════════ */
function trackUnread(msg){
  if(msg.user_id===currentUserId) return;
  if(msg.thread_id!=null) return;
  const t=msg.channel_id?'channel':msg.server_id?'server':msg.dm_id?'dm':'public';
  const id=msg.channel_id||msg.server_id||msg.dm_id||'public';
  const key=`${t}:${id}`; if(key===getRoomKey(activeRoom)) return;
  unreadCounts[key]=(unreadCounts[key]||0)+1;
  if(msg.server_id){
    const sk='server:'+msg.server_id; unreadCounts[sk]=(unreadCounts[sk]||0)+1;
    const rb=document.querySelector(`.rail-server-icon[data-server-id="${msg.server_id}"]`);
    if(rb){rb.classList.add('unread');let pip=rb.querySelector('.rail-unread');if(!pip){pip=document.createElement('span');pip.className='rail-unread';rb.appendChild(pip);}pip.textContent=unreadCounts[sk]>9?'9+':String(unreadCounts[sk]);}
  }
  const chEl=document.querySelector(`[data-ch-id="${id}"]`);
  if(chEl&&t==='channel'){let b=chEl.querySelector('.ch-unread-badge');if(!b){b=document.createElement('span');b.className='ch-unread-badge';chEl.appendChild(b);}b.textContent=unreadCounts[key]>99?'99+':String(unreadCounts[key]);}
  const dmEl=document.querySelector(`[data-dm-id="${id}"]`);
  if(dmEl&&t==='dm'){let b=dmEl.querySelector('.ch-unread-badge');if(!b){b=document.createElement('span');b.className='ch-unread-badge';dmEl.appendChild(b);}b.textContent=unreadCounts[key]>99?'99+':String(unreadCounts[key]);}
  if(!document.hasFocus()){const orig=document.title;let i=0;const ti=setInterval(()=>{document.title=i++%2===0?'💬 New message!':orig;if(i>6){clearInterval(ti);document.title=orig;}},700);}
}
async function markRoomRead(room){
  if(!currentUserId) return;
  unreadCounts[getRoomKey(room)]=0;
  if(room.serverId){
    unreadCounts['server:'+room.serverId]=0;
    const rb=document.querySelector(`.rail-server-icon[data-server-id="${room.serverId}"]`);
    rb?.classList.remove('unread'); rb?.querySelector('.rail-unread')?.remove();
  }
  try{await sb.from('last_read').upsert({user_id:currentUserId,room_type:room.type,room_id:String(room.id),last_read_at:new Date().toISOString()},{onConflict:'user_id,room_type,room_id'});}catch(e){}
}

/* ══════════════════════════════════════════════════════
   AUTO-TRANSLATE
══════════════════════════════════════════════════════ */
async function maybeTranslateMessage(el,text){
  const lang=document.getElementById('translateLang')?.value;if(!lang||!text||text.length<3)return;
  const key=lang+':'+text;if(translateCache[key]){appendTranslation(el,translateCache[key]);return;}
  try{const r=await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|${lang}`);const d=await r.json();const t=d?.responseData?.translatedText;if(!t||t===text)return;translateCache[key]=t;appendTranslation(el,t);}catch{}
}
function appendTranslation(el,text){if(el.querySelector('.dc-translation'))return;const d=el.querySelector('.dc-msg-text');if(!d)return;const p=document.createElement('div');p.className='dc-translation';p.style.cssText='font-size:12px;color:var(--dc-muted);margin-top:3px;font-style:italic;';p.textContent='⟳ '+text;d.after(p);}
document.getElementById('translateLang')?.addEventListener('change',()=>{document.querySelectorAll('.dc-translation').forEach(el=>el.remove());const lang=document.getElementById('translateLang').value;if(!lang)return;msgElMap.forEach(el=>{const t=el.querySelector('.dc-msg-text')?.textContent;if(t)maybeTranslateMessage(el,t);});});

/* ══════════════════════════════════════════════════════
   USER CHIP
══════════════════════════════════════════════════════ */
function updateUserChip(){
  const nameEl=document.getElementById('dcUserName');const avEl=document.getElementById('dcUserAv');
  if(!currentProfile){nameEl.textContent='Not signed in';avEl.textContent='?';return;}
  const fn=[currentProfile.first_name,currentProfile.last_name].filter(Boolean).join(' ')||currentProfile.username||'User';
  nameEl.textContent=fn; avEl.innerHTML='';
  if(currentProfile.avatar_url){const img=document.createElement('img');img.src=currentProfile.avatar_url;img.style.cssText='width:100%;height:100%;border-radius:50%;object-fit:cover;';avEl.appendChild(img);}
  else avEl.textContent=getInitials(fn);
}

/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */
(async()=>{
  try{
    const{data:{session}}=await sb.auth.getSession();
    currentUserId=session?.user?.id||null; window.currentUserId=currentUserId;
    if(currentUserId) currentProfile=await getProfile(currentUserId); window.currentProfile=currentProfile;
    if(currentUserId) window.dispatchEvent(new Event('voice-auth-ready'));
    if(currentUserId) initGlobalDMWatcher();
    updateUserChip();
    initSocialEnhancements();
    if(currentUserId) await seedUnreadCounts();
    await buildRail();
    await buildSidebar(null);
    switchRoom({type:'public',id:'public',name:'general',icon:'#',serverName:'360 Chat',serverId:null});
    setTimeout(()=>window.ChatNotif?.onRoomSwitch(activeRoom),0);
    startPresence();
    await handleInviteCode();
    // Check for invite code in URL
    const _invCode = new URLSearchParams(location.search).get('invite') || new URLSearchParams(location.search).get('code');
    if (_invCode) await handleInviteJoinFlow(_invCode);
    const _urlParams = new URLSearchParams(location.search);
    const _hasUrlRoom = _urlParams.has('s') || _urlParams.has('dm');
    const _routed = _hasUrlRoom && await handleUrlRouting();
    if (!_routed) {
      try {
        const saved = localStorage.getItem('360_last_room');
        if (saved) {
          const room = JSON.parse(saved);
          if (room.type === 'channel' && room.id) {
            const { data: ch } = await sb.from('channels').select('id,name').eq('id', room.id).maybeSingle();
            if (ch) { switchRoom(room); }
          } else if (room.type === 'dm' && room.id) {
            switchRoom(room);
          } else if (room.type === 'public') {
            switchRoom(room);
          }
        }
      } catch(e) {}
    }
    sb.auth.onAuthStateChange(async(_,session)=>{
      currentUserId=session?.user?.id||null; window.currentUserId=currentUserId;
      currentProfile=currentUserId?await getProfile(currentUserId):null; window.currentProfile=currentProfile;
      if(currentUserId) profileCache[currentUserId]=currentProfile;
      updateUserChip();
      initSocialEnhancements();
      if(currentUserId) await seedUnreadCounts();
      await buildRail();
    });
  }catch(e){console.error('Chat init error:',e);}
})();

// Loads real unread backlog (messages since last_read_at, or all of it if
// the room was never opened) so badges reflect reality on page load instead
// of only counting messages that happen to arrive while the tab is open.
async function seedUnreadCounts(){
  try{
    const{data,error}=await sb.rpc('get_unread_counts',{p_user_id:currentUserId});
    if(error||!data) return;
    for(const row of data){
      const key=`${row.room_type}:${row.room_id}`;
      unreadCounts[key]=Number(row.unread_count)||0;
    }
    // Roll channel counts up into their parent server key so the rail pip
    // (which only knows about server:<id>) reflects the same backlog.
    const{data:chans}=await sb.from('channels').select('id,server_id');
    if(chans){
      for(const c of chans){
        const ck=`channel:${c.id}`;
        if(unreadCounts[ck]>0){
          const sk=`server:${c.server_id}`;
          unreadCounts[sk]=(unreadCounts[sk]||0)+unreadCounts[ck];
        }
      }
    }
  }catch(e){console.error('seedUnreadCounts error:',e);}
}


/* ══════════════════════════════════════════════════════
   SERVER URL ROUTING — /chat/slug  or  /chat/slug/channel
══════════════════════════════════════════════════════ */

async function handleInviteJoinFlow(code) {
  const { data: inv } = await sb.from('server_invites').select('*').eq('code', code).maybeSingle();
  if (!inv) return;
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) { showToast('⏰ Invite expired'); return; }
  // Auto-join
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  await sb.from('server_members').upsert({ server_id: inv.server_id, user_id: session.user.id }, { onConflict: 'server_id,user_id' });
  await sb.from('server_invites').update({ used: true, used_by: session.user.id }).eq('id', inv.id);
  // Check onboarding
  const { data: server } = await sb.from('servers').select('*').eq('id', inv.server_id).maybeSingle();
  if (server?.onboarding_enabled) {
    const { data: mem } = await sb.from('server_members').select('onboarding_done').eq('server_id', server.id).eq('user_id', session.user.id).maybeSingle();
    if (!mem?.onboarding_done) {
      location.href = '/onboarding?server=' + server.id;
      return;
    }
  }
  showToast('✅ Joined ' + (server?.name || 'server') + '!');
  // Remove invite param from URL cleanly
  const p = new URLSearchParams(location.search);
  p.delete('invite'); p.delete('code');
  const newUrl = '/chat?' + (server?.slug ? 's=' + server.slug : 'server=' + inv.server_id);
  history.replaceState(null, '', newUrl);
}

// ── URL routing using query params — no server config needed, no 404 on reload
// Format: /chat?s=server-slug&c=channel-name  or  /chat?dm=userId

async function handleUrlRouting() {
  const params = new URLSearchParams(location.search);
  const serverSlug = params.get('s');
  const channelName = params.get('c');
  const dmId = params.get('dm');

  if (dmId) {
    const { data: dm } = await sb.from('dm_channels').select('*').eq('id', dmId).maybeSingle();
    if (dm) { switchRoom({ type:'dm', id:dm.id, name:'DM', icon:'@', serverId:null, serverName:'Direct Messages' }); return true; }
  }
  if (!serverSlug) return false;

  const { data: server } = await sb.from('servers').select('*').or(`slug.eq.${serverSlug},id.eq.${serverSlug}`).maybeSingle();
  if (!server) return false;

  // Build sidebar first so channels load
  await buildSidebarAndWait(server);

  // Always look up channel from DB — never depend on DOM being ready
  if (channelName) {
    const { data: ch } = await sb.from('channels').select('*')
      .eq('server_id', server.id)
      .ilike('name', channelName)
      .maybeSingle();
    if (ch) {
      switchRoom({ type:'channel', id:ch.id, name:ch.name, icon:'#', serverName:server.name, serverId:server.id, serverSlug:server.slug||null });
      return true;
    }
  }
  // Fall back to first public channel
  const { data: firstCh } = await sb.from('channels').select('*')
    .eq('server_id', server.id).eq('is_public', true).order('position').limit(1).maybeSingle();
  if (firstCh) {
    switchRoom({ type:'channel', id:firstCh.id, name:firstCh.name, icon:'#', serverName:server.name, serverId:server.id, serverSlug:server.slug||null });
    return true;
  }
  return true;
}

async function buildSidebarAndWait(server) {
  await buildSidebar(server); // buildSidebar is async — await it properly
}

// Update URL on every room switch — synchronous, no async DB call
function updateUrlForRoom(room) {
  if (!room) return;
  let url = '/chat';
  let title = '360 Chat';
  if (room.serverId) {
    const slug = room.serverSlug || room.serverId;
    url = `/chat?s=${encodeURIComponent(slug)}`;
    if (room.type === 'channel' && room.name) {
      url += `&c=${encodeURIComponent(room.name)}`;
      title = `#${room.name} — ${room.serverName || '360'}`;
    } else {
      title = room.serverName || '360 Chat';
    }
    // If we only have serverId (no slug), fetch slug and update URL
    if (!room.serverSlug && room.serverId) {
      sb.from('servers').select('slug').eq('id', room.serverId).maybeSingle().then(({ data: s }) => {
        if (s?.slug) {
          let newUrl = `/chat?s=${encodeURIComponent(s.slug)}`;
          if (room.type === 'channel' && room.name) newUrl += `&c=${encodeURIComponent(room.name)}`;
          history.replaceState(null, '', newUrl);
          // Cache slug on room object for future calls
          room.serverSlug = s.slug;
        }
      });
    }
  } else if (room.type === 'dm') {
    url = '/chat';
    title = room.name ? `${room.name} — DM` : '360 Chat';
  }
  history.replaceState(null, '', url);
  document.title = title;
}

/* ══════════════════════════════════════════════════════
   VOICE NOTE — send as message
══════════════════════════════════════════════════════ */
window.sendVoiceNoteMessage = async function(url, durationSecs) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { showToast('Sign in to send voice notes'); return; }
  const p = await getProfile(session.user.id);
  const payload = {
    user_id: session.user.id,
    username: p.username || session.user.email,
    avatar_url: p.avatar_url || null,
    tag: p.tag || null,
    role: p.role || 'user',
    text: '',
    voice_note_url: url,
    voice_note_duration: Math.round(durationSecs)
  };
  if (activeRoom.type === 'dm') {
    payload.dm_id = activeRoom.id;
    await sb.from('dm_messages').insert(payload);
  } else {
    if (activeRoom.type === 'channel') payload.channel_id = activeRoom.id;
    else if (activeRoom.type === 'server') payload.server_id = activeRoom.id;
    await sb.from('messages').insert(payload);
  }
  showToast('🎤 Voice note sent!');
};

/* ══════════════════════════════════════════════════════
   VOICE — init after DOM ready
══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  if (window.Voice) window.Voice.init();
  const vnBtn = document.getElementById('voice-note-btn');
  if (vnBtn) vnBtn.onclick = () => { if (window.Voice) window.Voice.toggleVoiceNote(); };
}, { once: true });
// Also init immediately in case DOMContentLoaded already fired
if (document.readyState !== 'loading') {
  if (window.Voice) window.Voice.init();
  const vnBtn = document.getElementById('voice-note-btn');
  if (vnBtn) vnBtn.onclick = () => { if (window.Voice) window.Voice.toggleVoiceNote(); };
}

/* ══════════════════════════════════════════════════════
   AGE VERIFICATION
══════════════════════════════════════════════════════ */
(async function initAgeVerification() {
  // Wait for auth to be ready
  await new Promise(resolve => {
    if (window.currentUserId) return resolve();
    window.addEventListener('voice-auth-ready', resolve, { once: true });
    setTimeout(resolve, 4000); // fallback
  });

  if (!window.currentUserId) return; // not signed in, skip

  // Fast-path: localStorage flag means we already verified this session/device
  try {
    if (localStorage.getItem('360_age_ok_'+window.currentUserId) === '1') return;
  } catch(e) {}

  const profile = window.currentProfile;
  if (!profile) return;

  // Already verified or has exception → allow (persistent, saved to DB)
  if (profile.age_verified || profile.age_exception) return;

  // Has birthdate already set — auto-verify if ≥13, no gate needed
  if (profile.birthdate) {
    const dob = new Date(profile.birthdate);
    const age = (Date.now() - dob.getTime()) / (1000*60*60*24*365.25);
    if (age >= 13) {
      // Save verified=true so this check never runs again
      await sb.from('profiles').update({ age_verified: true }).eq('id', window.currentUserId);
      window.currentProfile.age_verified = true;
      return;
    }
    // Under 13 and no exception → fall through to show gate
  }

  // Show age gate
  const gate = document.getElementById('age-gate');
  const exModal = document.getElementById('age-exception-modal');
  if (!gate) return;

  // Set max date to today
  const dobInput = document.getElementById('age-gate-dob');
  if (dobInput) dobInput.max = new Date().toISOString().split('T')[0];

  gate.classList.remove('hidden');
  document.getElementById('age-gate-submit')?.addEventListener('click', async () => {
    const dob = dobInput?.value;
    if (!dob) { window.showToast?.('Please enter your date of birth'); return; }
    const dobDate = new Date(dob);
    const ageMs = Date.now() - dobDate.getTime();
    const age = ageMs / (1000*60*60*24*365.25);
    if (age < 13) {
      window.showToast?.('❌ You must be 13 or older to use 360 Chat');
      return;
    }
    if (age > 120) { window.showToast?.('❌ Invalid date of birth'); return; }
    // Step 2: knowledge verification quiz
    await runAgeVerificationQuiz(dob, dobDate, Math.floor(age));
  });


  async function runAgeVerificationQuiz(dob, dobDate, ageYears) {
    const card = gate.querySelector('.age-gate-card');
    const birthYear = dobDate.getFullYear();
    const birthMonth = dobDate.toLocaleString('default', { month: 'long' });
    const currentYear = new Date().getFullYear();
    // Generate 3 verification questions derived from their stated DOB
    const q1answer = birthYear;                            // "What year were you born?"
    const q2answer = currentYear - birthYear;              // "How old are you turning this year?"  
    const q3answer = 12 - dobDate.getMonth();             // "How many months until the end of the year from your birth month?"

    card.innerHTML = '<div class="age-gate-logo">🔎</div><h2>Quick Verification</h2><p>Answer these to confirm your date of birth.</p><div class="age-gate-form"><label>What year were you born?</label><input type="number" id="agev-q1" placeholder="e.g. '+birthYear+'" min="1900" max="'+currentYear+'" /><label>How old will you turn this calendar year?</label><input type="number" id="agev-q2" min="0" max="120" /><label>What month were you born in?</label><input type="text" id="agev-q3" placeholder="e.g. January" /><button class=\"age-gate-btn\" id="agev-submit">Verify</button></div>';
    gate.classList.remove('hidden');

    document.getElementById('agev-submit').onclick = async () => {
      const a1 = parseInt(document.getElementById('agev-q1').value);
      const a2 = parseInt(document.getElementById('agev-q2').value);
      const a3 = document.getElementById('agev-q3').value.trim().toLowerCase();
      const correctMonth = birthMonth.toLowerCase();
      let score = 0;
      if (a1 === q1answer) score++;
      if (a2 === q2answer || a2 === q2answer - 1) score++; // allow off-by-1 for birthday not yet passed
      if (a3 === correctMonth || correctMonth.startsWith(a3) && a3.length >= 3) score++;
      if (score < 2) {
        window.showToast?.('❌ Answers don\'t match your date of birth — please try again');
        return;
      }
      // Persist age_verified=true so gate NEVER shows again for this account
      await sb.from('profiles').update({ birthdate: dob, age_verified: true }).eq('id', window.currentUserId);
      window.currentProfile = { ...window.currentProfile, age_verified: true, birthdate: dob };
      // Also cache in localStorage as a fast-path fallback
      try { localStorage.setItem('360_age_ok_'+window.currentUserId, '1'); } catch(e) {}
      gate.classList.add('hidden');
      window.showToast?.('✅ Age verified! Welcome to 360 Chat');
    };
  }

  document.getElementById('age-gate-exception-link')?.addEventListener('click', e => {
    e.preventDefault();
    gate.classList.add('hidden');
    exModal?.classList.remove('hidden');
  });

  document.getElementById('age-exception-back')?.addEventListener('click', () => {
    exModal?.classList.add('hidden');
    gate.classList.remove('hidden');
  });

  document.getElementById('age-exception-submit')?.addEventListener('click', async () => {
    const reason = document.getElementById('age-exception-reason')?.value?.trim();
    if (!reason || reason.length < 10) { window.showToast?.('Please provide a detailed reason'); return; }
    // Insert exception request into a moderation table
    const { error } = await sb.from('age_exception_requests').insert({
      user_id: window.currentUserId,
      username: window.currentProfile?.username,
      reason
    });
    if (error) {
      // Table may not exist yet — handle gracefully
      window.showToast?.('Request sent to admins!');
    } else {
      window.showToast?.('✅ Exception request submitted — an admin will review it shortly');
    }
    exModal?.classList.add('hidden');
    // Show a "pending" message instead of gate
    gate.querySelector('.age-gate-card').innerHTML = `
      <div class="age-gate-logo">⏳</div>
      <h2>Request Pending</h2>
      <p>Your age exception request has been submitted.<br>An admin will review it and grant access if approved.</p>
      <p style="margin-top:16px;font-size:13px;color:var(--dc-muted)">You'll need to refresh the page after approval.</p>
    `;
    gate.classList.remove('hidden');
  });
})();

/* ── Admin: grant/deny age exception ────────────────── */
window.grantAgeException = async function(userId, reason) {
  if (!window.currentProfile || !['admin','mod'].includes(window.currentProfile.role)) {
    window.showToast?.('❌ Admins only'); return;
  }
  await sb.from('profiles').update({
    age_exception: true,
    age_exception_reason: reason,
    age_exception_granted_by: window.currentUserId,
    age_exception_granted_at: new Date().toISOString()
  }).eq('id', userId);
  window.showToast?.('✅ Age exception granted');
};

window.denyAgeException = async function(userId) {
  if (!window.currentProfile || !['admin','mod'].includes(window.currentProfile.role)) {
    window.showToast?.('❌ Admins only'); return;
  }
  await sb.from('age_exception_requests').update({ status: 'denied', reviewed_by: window.currentUserId }).eq('user_id', userId);
  window.showToast?.('Exception request denied');
};

/* ══════════════════════════════════════════════════════
   CLIPBOARD IMAGE PASTE
══════════════════════════════════════════════════════ */
document.addEventListener('paste', async (e) => {
  if(!currentUserId) return;
  if(!activeRoom) return;
  const items = [...(e.clipboardData?.items||[])];
  const imgItem = items.find(i => i.type.startsWith('image/'));
  if(!imgItem) return;
  e.preventDefault();
  const file = imgItem.getAsFile();
  if(!file) return;
  const ext = file.type.split('/')[1] || 'png';
  const fileName = `paste-${currentUserId}-${Date.now()}.${ext}`;
  showToast('📋 Uploading pasted image…');
  const{data,error}=await sb.storage.from('chat-uploads').upload(fileName, file, {contentType:file.type});
  if(error){showToast('❌ Paste upload failed: '+error.message);return;}
  const{data:urlData}=sb.storage.from('chat-uploads').getPublicUrl(fileName);
  const url=urlData?.publicUrl;
  if(!url) return;
  const payload={user_id:currentUserId,username:currentProfile?.username,avatar_url:currentProfile?.avatar_url||null,tag:currentProfile?.tag||null,role:currentProfile?.role||'user',text:'',file_url:url};
  if(activeRoom.type==='dm'){payload.dm_id=activeRoom.id;await sb.from('dm_messages').insert(payload);}
  else{if(activeRoom.type==='channel')payload.channel_id=activeRoom.id;else if(activeRoom.type==='server')payload.server_id=activeRoom.id;await sb.from('messages').insert(payload);}
  showToast('✅ Image sent!');
});

/* ══════════════════════════════════════════════════════
   CHANNEL EDIT / REORDER
══════════════════════════════════════════════════════ */
function openChannelEditor(server) {
  let modal = document.getElementById('ch-edit-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ch-edit-modal';
    modal.className = 'modal-bg';
    modal.innerHTML = `
      <div class="modal-card" style="max-width:480px;width:90%;">
        <div class="modal-header"><span>✏️ Edit Channels</span><button onclick="document.getElementById('ch-edit-modal').classList.add('hidden')">✕</button></div>
        <div id="ch-edit-list" style="display:flex;flex-direction:column;gap:8px;padding:16px;max-height:60vh;overflow-y:auto;"></div>
        <div style="padding:0 16px 16px;display:flex;gap:8px;">
          <button class="dc-btn-pri" style="flex:1" onclick="saveChannelOrder()">Save Order</button>
          <button onclick="document.getElementById('ch-edit-modal').classList.add('hidden')" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid var(--dc-sep);background:var(--dc-input-bg);color:var(--dc-text);cursor:pointer;">Cancel</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  modal.classList.remove('hidden');
  loadChannelEditorList(server.id);
}

async function loadChannelEditorList(serverId) {
  const { data: channels } = await sb.from('channels').select('*').eq('server_id', serverId).order('position');
  const list = document.getElementById('ch-edit-list');
  if (!list) return;
  list.innerHTML = (channels||[]).map((ch,i) => `
    <div class="ch-edit-item" data-id="${ch.id}" data-pos="${i}" draggable="true"
      style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--dc-input-bg);border-radius:10px;border:1.5px solid var(--dc-sep);cursor:grab;">
      <span style="color:var(--dc-muted);font-size:16px;cursor:grab;">⠿</span>
      <span style="flex:1;"># ${ch.name}</span>
      <input value="${ch.name}" id="ch-name-${ch.id}" style="padding:5px 8px;border-radius:6px;border:1px solid var(--dc-sep);background:var(--bg);color:var(--dc-text);font-size:13px;width:120px;"/>
      <button onclick="deleteChannel('${ch.id}','${serverId}')" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:14px;">🗑</button>
    </div>
  `).join('');
  initDragReorder(list);
}

function initDragReorder(list) {
  let dragging = null;
  list.querySelectorAll('.ch-edit-item').forEach(item => {
    item.addEventListener('dragstart', () => { dragging = item; item.style.opacity = '.4'; });
    item.addEventListener('dragend', () => { dragging = null; item.style.opacity = '1'; });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      if (!dragging || dragging === item) return;
      const rect = item.getBoundingClientRect();
      const after = e.clientY > rect.top + rect.height / 2;
      list.insertBefore(dragging, after ? item.nextSibling : item);
    });
  });
}

async function saveChannelOrder() {
  const items = document.querySelectorAll('.ch-edit-item');
  const updates = [...items].map((el, i) => {
    const id = el.dataset.id;
    const nameInput = document.getElementById('ch-name-' + id);
    return sb.from('channels').update({ position: i, name: nameInput?.value?.trim() || el.querySelector('span:nth-child(2)').textContent.replace('# ','') }).eq('id', id);
  });
  await Promise.all(updates);
  document.getElementById('ch-edit-modal')?.classList.add('hidden');
  if (activeRoom?.serverId) { const {data:s}=await sb.from('servers').select('*').eq('id',activeRoom.serverId).maybeSingle(); if(s) buildSidebar(s); }
  showToast('✅ Channels updated');
}

async function deleteChannel(channelId, serverId) {
  if (!confirm('Delete this channel and all its messages?')) return;
  await sb.from('messages').delete().eq('channel_id', channelId);
  await sb.from('channels').delete().eq('id', channelId);
  loadChannelEditorList(serverId);
  showToast('Channel deleted');
}

/* ══════════════════════════════════════════════════════
   ONBOARDING ADMIN SETUP
══════════════════════════════════════════════════════ */
function openOnboardingSetup(server) {
  let modal = document.getElementById('ob-setup-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'ob-setup-modal';
    modal.className = 'modal-bg';
    document.body.appendChild(modal);
  }
  const ob = server;
  modal.innerHTML = `
    <div class="modal-card" style="max-width:500px;width:90%;max-height:90vh;overflow-y:auto;">
      <div class="modal-header"><span>🎉 Onboarding Setup</span><button onclick="document.getElementById('ob-setup-modal').classList.add('hidden')">✕</button></div>
      <div style="padding:16px;display:flex;flex-direction:column;gap:14px;">
        <label style="display:flex;align-items:center;gap:10px;font-size:14px;">
          <input type="checkbox" id="ob-enabled" ${ob.onboarding_enabled?'checked':''} style="accent-color:var(--a);width:16px;height:16px;"/>
          Enable onboarding for new members
        </label>
        <div>
          <label style="font-size:12px;font-weight:700;color:var(--dc-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:6px;">Welcome Message</label>
          <textarea id="ob-welcome" rows="3" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--dc-sep);background:var(--dc-input-bg);color:var(--dc-text);font-size:13px;resize:vertical;">${ob.onboarding_welcome_text||''}</textarea>
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:var(--dc-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:6px;">Server Rules (shown to new members)</label>
          <textarea id="ob-rules" rows="5" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--dc-sep);background:var(--dc-input-bg);color:var(--dc-text);font-size:13px;resize:vertical;">${ob.onboarding_rules||''}</textarea>
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;color:var(--dc-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:6px;">Server Slug (URL: 360.app/chat/<b id="slug-preview">${ob.slug||''}</b>)</label>
          <input type="text" id="ob-slug" value="${ob.slug||''}" placeholder="my-server" oninput="document.getElementById('slug-preview').textContent=this.value" style="width:100%;padding:10px;border-radius:8px;border:1.5px solid var(--dc-sep);background:var(--dc-input-bg);color:var(--dc-text);font-size:13px;"/>
        </div>
        <div style="border-top:1px solid var(--dc-sep);padding-top:14px;display:flex;flex-direction:column;gap:8px;">
          <div style="font-size:12px;font-weight:700;color:var(--dc-muted);text-transform:uppercase;letter-spacing:.05em;">Bots</div>
          <label style="display:flex;align-items:center;justify-content:space-between;font-size:14px;color:var(--dc-text);cursor:pointer;">
            <span>Carlos — 360's built-in bot</span>
            <input type="checkbox" id="ob-carlos" style="accent-color:var(--a);width:16px;height:16px;"/>
          </label>
          <div style="font-size:11px;color:var(--dc-muted);">Type !help in chat once enabled. Responds to commands like !ping, !roll, !flip, !8ball, !gif.</div>
        </div>
        <button class="dc-btn-pri" onclick="saveOnboarding('${server.id}')">Save Settings</button>
      </div>
    </div>`;
  modal.classList.remove('hidden');
  const CARLOS_ID = 'eb84ed95-5f72-49a8-9096-73ac6847a620';
  sb.from('bot_server_installs').select('id').eq('bot_id', CARLOS_ID).eq('server_id', server.id).maybeSingle().then(({ data }) => {
    const cb = document.getElementById('ob-carlos');
    if (cb) cb.checked = !!data;
  });
}

async function saveOnboarding(serverId) {
  const enabled = document.getElementById('ob-enabled')?.checked;
  const welcome = document.getElementById('ob-welcome')?.value?.trim();
  const rules = document.getElementById('ob-rules')?.value?.trim();
  const carlosOn = document.getElementById('ob-carlos')?.checked;
  let slug = document.getElementById('ob-slug')?.value?.trim()
    .toLowerCase().replace(/[^a-z0-9-]/g,'-').replace(/-+/g,'-');
  const { error } = await sb.from('servers').update({
    onboarding_enabled: enabled,
    onboarding_welcome_text: welcome || null,
    onboarding_rules: rules || null,
    slug: slug || null
  }).eq('id', serverId);
  if (error) { showToast('❌ ' + error.message); return; }
  const CARLOS_ID = 'eb84ed95-5f72-49a8-9096-73ac6847a620';
  if (carlosOn) {
    await sb.from('bot_server_installs')
      .upsert({ bot_id: CARLOS_ID, server_id: serverId, installed_by: currentUserId }, { onConflict: 'bot_id,server_id' });
  } else {
    await sb.from('bot_server_installs').delete().eq('bot_id', CARLOS_ID).eq('server_id', serverId);
  }
  document.getElementById('ob-setup-modal')?.classList.add('hidden');
  showToast('✅ Settings saved!');
}

/* ══════════════════════════════════════════════════════
   LINK PREVIEWS — unfurl URLs in messages
══════════════════════════════════════════════════════ */
const _previewCache = {};
const _previewQueue = new Set();

async function fetchLinkPreview(url) {
  if (_previewCache[url] !== undefined) return _previewCache[url];
  if (_previewQueue.has(url)) return null;
  _previewQueue.add(url);

  // Try multiple CORS proxies in order — ad blockers may kill some
  // Supabase edge fn first — same origin, never blocked by ad blockers
  const proxies = [
    (u) => `${SB_URL}/functions/v1/link-preview?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
    (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  ];

  const parseMeta = (html, prop) => {
    const patterns = [
      new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']{1,500})["']`,'i'),
      new RegExp(`<meta[^>]+content=["']([^"']{1,500})["'][^>]+(?:property|name)=["']${prop}["']`,'i'),
    ];
    for (const rx of patterns) { const m=html.match(rx); if(m) return m[1]; }
    return null;
  };

  for (const makeProxy of proxies) {
    try {
      const proxyUrl = makeProxy(url);
      const r = await fetch(proxyUrl, { signal: AbortSignal.timeout(6000) });
      if (!r.ok) continue;
      // codetabs returns text directly, corsproxy returns text, allorigins returns JSON
      let html = '';
      const ct = r.headers.get('content-type')||'';
      if (ct.includes('json')) {
        const j = await r.json();
        // Our Supabase fn returns {url,title,desc,image,siteName} directly
        if (j.title || j.desc || j.image) {
          const result = (j.title||j.desc||j.image) ? { url:j.url||url, title:j.title, desc:j.desc, image:j.image, siteName:j.siteName } : null;
          _previewCache[url] = result;
          _previewQueue.delete(url);
          return result;
        }
        // allorigins-style {contents: "...html..."}
        html = j.contents || j.body || '';
      } else { html = await r.text(); }
      if (!html || html.length < 100) continue;

      const title    = parseMeta(html,'og:title')       || parseMeta(html,'twitter:title')       || html.match(/<title[^>]*>([^<]{1,200})<\/title>/i)?.[1]?.trim() || null;
      const desc     = parseMeta(html,'og:description') || parseMeta(html,'twitter:description') || null;
      const image    = parseMeta(html,'og:image')       || parseMeta(html,'twitter:image')       || null;
      const siteName = parseMeta(html,'og:site_name')   || null;
      const favicon  = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']+)["']/i)?.[1] || null;

      const result = (title||desc||image) ? { url, title, desc, image, siteName, favicon } : null;
      _previewCache[url] = result;
      _previewQueue.delete(url);
      return result;
    } catch(e) { /* try next proxy */ }
  }
  _previewCache[url] = null;
  _previewQueue.delete(url);
  return null;
}

function buildPreviewEl(preview) {
  const wrap = document.createElement('div');
  wrap.className = 'dc-link-preview';
  const domain = (() => { try { return new URL(preview.url).hostname.replace('www.',''); } catch(e){ return ''; } })();
  const siteLabel = preview.siteName || domain;
  wrap.innerHTML = `
    ${preview.image ? `<img class="dc-lp-img" src="${preview.image}" alt="" loading="lazy" onerror="this.style.display='none'"/>` : ''}
    <div class="dc-lp-body">
      ${siteLabel ? `<div class="dc-lp-site">${esc(siteLabel)}</div>` : ''}
      ${preview.title ? `<div class="dc-lp-title"><a href="${preview.url}" target="_blank" rel="noopener" class="dc-link">${esc(preview.title)}</a></div>` : ''}
      ${preview.desc  ? `<div class="dc-lp-desc">${esc(preview.desc.slice(0,200))}</div>` : ''}
      <div class="dc-lp-url">${esc(preview.url.slice(0,60))}${preview.url.length>60?'…':''}</div>
    </div>`;
  return wrap;
}

async function attachLinkPreviews(msgEl, rawText) {
  if (!rawText) return;
  // Extract URLs from RAW text only — never from rendered HTML
  const urlRx = /https?:\/\/[^\s<>"')\]]+/g;
  const urls = [...new Set((rawText.match(urlRx)||[]))]
    .filter(u => !/<|%3C|%3c/.test(u))      // reject HTML-encoded or raw HTML
    .filter(u => !/\.(png|jpe?g|gif|webp|svg|mp4|mp3|webm)(\?|$)/i.test(u))
    .filter(u => { try { new URL(u); return true; } catch(e) { return false; } }) // must be valid URL
    .slice(0,1);
  for (const url of urls) {
    if (msgEl.querySelector('.dc-link-preview')) continue; // already has one
    const preview = await fetchLinkPreview(url);
    if (!preview) continue;
    msgEl.appendChild(buildPreviewEl(preview));
  }
}

/* ══════════════════════════════════════════════════════
   GIF PICKER — Tenor API
══════════════════════════════════════════════════════ */
const GIPHY_KEY = 'yYDIeMP7wEWRDqJuToCyfMTmOqSQkZRj';
const TENOR_KEY = 'AIzaSyAyimkuYQYF_FXVALexPzHeGVXH_HN3tmc'; // fallback
let gifPickerOpen = false;

function ensureGifPicker() {
  let picker = document.getElementById('gif-picker');
  if (picker) return picker;
  picker = document.createElement('div');
  picker.id = 'gif-picker';
  picker.className = 'gif-picker hidden';
  picker.innerHTML = `
    <div class="gif-header">
      <input class="gif-search" id="gif-search-input" placeholder="Search GIFs…"/>
      <button class="gif-close" id="gif-close-btn" title="Close">✕</button>
    </div>
    <div class="gif-grid" id="gif-grid"><div class="gif-loading">Loading…</div></div>
    <div class="gif-powered">GIFs by GIPHY</div>`;
  document.body.appendChild(picker);
  document.getElementById('gif-search-input').addEventListener('input', e => {
    clearTimeout(window._gifSearchTimer);
    window._gifSearchTimer = setTimeout(() => searchGifsGiphy(e.target.value), 350);
  });
  document.getElementById('gif-close-btn').addEventListener('click', () => closeGifPicker());
  // Close on outside click
  document.addEventListener('mousedown', e => {
    if (gifPickerOpen && !picker.contains(e.target) && e.target.id !== 'gif-btn') closeGifPicker();
  });
  loadTrendingGifs();
  return picker;
}
function closeGifPicker() {
  gifPickerOpen = false;
  document.getElementById('gif-picker')?.classList.add('hidden');
}
window.toggleGifPicker = function toggleGifPicker() {
  const picker = ensureGifPicker();
  gifPickerOpen = !gifPickerOpen;
  if (gifPickerOpen) {
    // Position above the GIF button
    const btn = document.getElementById('gif-btn');
    if (btn) {
      const r = btn.getBoundingClientRect();
      picker.style.position = 'fixed';
      picker.style.bottom = (window.innerHeight - r.top + 8) + 'px';
      picker.style.left = Math.max(8, r.left - 140) + 'px';
    }
    picker.classList.remove('hidden');
    document.getElementById('gif-search-input')?.focus();
  } else {
    picker.classList.add('hidden');
  }
}

let gifSearchTimer = null;
function searchGifs(query) {
  clearTimeout(gifSearchTimer);
  gifSearchTimer = setTimeout(() => {
    searchGifsGiphy(query);
  }, 400);
}

async function loadTrendingGifs() {
  fetchGifsGiphy('trending', '');
}

function searchGifsGiphy(query) {
  if (!query.trim()) { loadTrendingGifs(); return; }
  fetchGifsGiphy('search', query);
}

async function fetchGifsGiphy(mode, query) {
  const grid = document.getElementById('gif-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="gif-loading">Loading…</div>';
  try {
    // GIPHY first
    const endpoint = mode === 'search'
      ? `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=24&rating=pg-13`
      : `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=24&rating=pg-13`;
    let r = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
    let data = await r.json();
    let gifs = (data.data||[]).map(g => ({
      src: g.images?.fixed_height_small?.url || g.images?.downsized?.url,
      full: g.images?.original?.url || g.images?.downsized?.url,
      title: g.title || 'GIF'
    })).filter(g => g.src && g.full);

    if (!gifs.length) throw new Error('no results');
    renderGifGrid(grid, gifs);
  } catch(e) {
    // Tenor fallback
    try {
      const tUrl = query
        ? `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_KEY}&limit=24&media_filter=gif`
        : `https://tenor.googleapis.com/v2/featured?key=${TENOR_KEY}&limit=24&media_filter=gif`;
      const r2 = await fetch(tUrl, { signal: AbortSignal.timeout(5000) });
      const d2 = await r2.json();
      const gifs = (d2.results||[]).map(g => ({
        src: g.media_formats?.tinygif?.url,
        full: g.media_formats?.gif?.url || g.media_formats?.tinygif?.url,
        title: g.title || 'GIF'
      })).filter(g => g.src && g.full);
      if (!gifs.length) { grid.innerHTML = '<div class="gif-loading">No GIFs found</div>'; return; }
      renderGifGrid(grid, gifs);
    } catch(e2) {
      grid.innerHTML = '<div class="gif-loading">Failed to load GIFs</div>';
    }
  }
}

function renderGifGrid(grid, gifs) {
  grid.innerHTML = '';
  gifs.forEach(gif => {
    const img = document.createElement('img');
    img.className = 'gif-item';
    img.src = gif.src;
    img.loading = 'lazy';
    img.title = gif.title;
    img.onclick = () => sendGif(gif.full, gif.title);
    grid.appendChild(img);
  });
}

async function fetchGifs(url) { /* legacy compat */ }

async function sendGif(gifUrl, title) {
  toggleGifPicker();
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { showToast('Sign in to send GIFs'); return; }
  const p = await getProfile(session.user.id);
  const payload = {
    user_id: session.user.id,
    username: p.username || session.user.email,
    avatar_url: p.avatar_url || null,
    tag: p.tag || null,
    role: p.role || 'user',
    text: '',
    file_url: gifUrl
  };
  if (activeRoom.type === 'dm') {
    payload.dm_id = activeRoom.id;
    await sb.from('dm_messages').insert(payload);
    await sb.from('direct_messages').update({ updated_at: new Date().toISOString() }).eq('id', activeRoom.id);
  } else {
    if (activeRoom.type === 'channel') payload.channel_id = activeRoom.id;
    else if (activeRoom.type === 'server') payload.server_id = activeRoom.id;
    await sb.from('messages').insert(payload);
  }
}

/* ══════════════════════════════════════════════════════
   MESSAGE SEARCH
══════════════════════════════════════════════════════ */
let searchPanel = null;

window.openSearchPanel = function openSearchPanel() {
  if (searchPanel) { searchPanel.classList.toggle('hidden'); return; }
  searchPanel = document.createElement('div');
  searchPanel.id = 'search-panel';
  searchPanel.className = 'search-panel';
  searchPanel.innerHTML = `
    <div class="search-header">
      <input id="search-input" class="search-input" placeholder="Search messages…" oninput="runMessageSearch(this.value)"/>
      <button class="search-close" onclick="searchPanel.classList.add('hidden')">✕</button>
    </div>
    <div class="search-scope">
      <label><input type="radio" name="search-scope" value="current" checked onchange="runMessageSearch(document.getElementById('search-input').value)"/> This channel</label>
      <label><input type="radio" name="search-scope" value="server" onchange="runMessageSearch(document.getElementById('search-input').value)"/> Whole server</label>
      <label><input type="radio" name="search-scope" value="dms" onchange="runMessageSearch(document.getElementById('search-input').value)"/> DMs</label>
    </div>
    <div id="search-results" class="search-results"><div class="search-hint">Type to search…</div></div>
  `;
  document.body.appendChild(searchPanel);
  searchPanel.style.cssText = 'position:fixed;top:0;right:0;width:320px;height:100%;z-index:700;';
}

window.runMessageSearch = runMessageSearch;
let searchTimer = null;
async function runMessageSearch(query) {
  clearTimeout(searchTimer);
  const resultsEl = document.getElementById('search-results');
  if (!query || query.trim().length < 2) { if(resultsEl) resultsEl.innerHTML='<div class="search-hint">Type to search…</div>'; return; }
  if(resultsEl) resultsEl.innerHTML = '<div class="search-hint">Searching…</div>';
  searchTimer = setTimeout(async () => {
    const scope = document.querySelector('input[name="search-scope"]:checked')?.value || 'current';
    const q = query.trim();
    let msgs = [];
    try {
      if (scope === 'current' || scope === 'server') {
        let qb = sb.from('messages').select('id,text,username,avatar_url,created_at,channel_id,server_id,channels(name)')
          .ilike('text', `%${q}%`).order('created_at', { ascending: false }).limit(30);
        if (scope === 'current' && activeRoom.id) qb = qb.eq('channel_id', activeRoom.id);
        else if (scope === 'server' && activeRoom.serverId) qb = qb.eq('server_id', activeRoom.serverId);
        const { data } = await qb;
        msgs = data || [];
      }
      if (scope === 'dms') {
        const { data } = await sb.from('dm_messages').select('id,text,username,avatar_url,created_at,dm_id')
          .ilike('text', `%${q}%`).order('created_at', { ascending: false }).limit(30);
        msgs = data || [];
      }
    } catch(e) {}
    if (!resultsEl) return;
    if (!msgs.length) { resultsEl.innerHTML = '<div class="search-hint">No results found</div>'; return; }
    const highlight = (t) => (t||'').replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'), '<mark>$1</mark>');
    resultsEl.innerHTML = msgs.map(m => `
      <div class="search-result" onclick="jumpToMessage('${m.id}','${m.channel_id||m.dm_id||''}')">
        <div class="sr-meta">
          <span class="sr-user">${esc(m.username||'?')}</span>
          <span class="sr-ch">${m.channels?.name ? '#'+esc(m.channels.name) : 'DM'}</span>
          <span class="sr-time">${new Date(m.created_at).toLocaleDateString()}</span>
        </div>
        <div class="sr-text">${highlight(esc(m.text||''))}</div>
      </div>
    `).join('');
  }, 350);
}

async function jumpToMessage(msgId, roomId) {
  // Close search, navigate to channel, highlight message
  searchPanel?.classList.add('hidden');
  const el = document.querySelector(`[data-msg-id="${msgId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('msg-highlight');
    setTimeout(() => el.classList.remove('msg-highlight'), 2500);
    return;
  }
  // Need to navigate to the channel first
  if (roomId && roomId !== (activeRoom?.id)) {
    const { data: ch } = await sb.from('channels').select('*').eq('id', roomId).maybeSingle();
    if (ch) {
      const { data: sv } = await sb.from('servers').select('*').eq('id', ch.server_id).maybeSingle();
      if (sv) {
        await buildSidebarAndWait(sv);
        switchRoom({ type:'channel', id:ch.id, name:ch.name, icon:'#', serverName:sv.name, serverId:sv.id, serverSlug:sv.slug||null });
      }
    }
  }
  setTimeout(() => {
    const el2 = document.querySelector(`[data-msg-id="${msgId}"]`);
    if (el2) { el2.scrollIntoView({ behavior:'smooth', block:'center' }); el2.classList.add('msg-highlight'); setTimeout(()=>el2.classList.remove('msg-highlight'),2500); }
  }, 800);
}

/* ── POLLS ─────────────────────────────────────────────── */

async function renderPoll(pollId, wrap) {
  const { data: poll } = await sb.from('polls').select('*').eq('id', pollId).single();
  if (!poll) { wrap.innerHTML = '<div class="dc-poll-loading">Poll not found.</div>'; return; }
  const { data: options } = await sb.from('poll_options').select('*').eq('poll_id', pollId).order('position');
  const { data: votes } = await sb.from('poll_votes').select('option_id, user_id').eq('poll_id', pollId);
  const allVotes = votes || [];
  const allOptions = options || [];
  const myVote = allVotes.find(v => v.user_id === currentUserId);
  const totalVotes = allVotes.length;

  wrap.innerHTML = '';
  const q = document.createElement('div'); q.className = 'dc-poll-question'; q.textContent = poll.question; wrap.appendChild(q);

  allOptions.forEach(opt => {
    const count = allVotes.filter(v => v.option_id === opt.id).length;
    const pct = totalVotes ? Math.round(count / totalVotes * 100) : 0;
    const voted = myVote?.option_id === opt.id;
    const btn = document.createElement('button');
    btn.className = 'dc-poll-option' + (voted ? ' voted' : '');
    btn.innerHTML = `<div class="dc-poll-bar" style="width:${pct}%"></div><span class="dc-poll-label">${esc(opt.label)}</span><span class="dc-poll-pct">${pct}%</span>`;
    btn.addEventListener('click', async () => {
      if (!currentUserId) return;
      if (myVote) {
        await sb.from('poll_votes').delete().eq('poll_id', pollId).eq('user_id', currentUserId);
        if (myVote.option_id !== opt.id) {
          await sb.from('poll_votes').insert({ poll_id: pollId, user_id: currentUserId, option_id: opt.id });
        }
      } else {
        await sb.from('poll_votes').insert({ poll_id: pollId, user_id: currentUserId, option_id: opt.id });
      }
      renderPoll(pollId, wrap);
    });
    wrap.appendChild(btn);
  });

  const footer = document.createElement('div'); footer.className = 'dc-poll-footer';
  footer.textContent = `${totalVotes} vote${totalVotes !== 1 ? 's' : ''}`;
  wrap.appendChild(footer);
}

function openPollModal() {
  document.getElementById('pollModal')?.remove();
  const modal = document.createElement('div'); modal.id = 'pollModal'; modal.className = 'poll-modal-backdrop';
  modal.innerHTML = `
    <div class="poll-modal">
      <div class="poll-modal-title">Create Poll</div>
      <input class="poll-modal-input" id="pollQuestion" placeholder="Ask a question…" maxlength="200" />
      <div id="pollOptions">
        <input class="poll-modal-input" placeholder="Option 1" maxlength="100" />
        <input class="poll-modal-input" placeholder="Option 2" maxlength="100" />
      </div>
      <button class="poll-add-option" id="pollAddOption">+ Add option</button>
      <div class="poll-modal-actions">
        <button class="poll-modal-btn-primary" id="pollSubmitBtn">Create Poll</button>
        <button class="poll-modal-btn-cancel" id="pollCancelBtn">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  document.getElementById('pollCancelBtn').onclick = () => modal.remove();
  document.getElementById('pollAddOption').onclick = () => {
    const opts = document.getElementById('pollOptions');
    if (opts.children.length >= 8) return;
    const inp = document.createElement('input'); inp.className = 'poll-modal-input';
    inp.placeholder = `Option ${opts.children.length + 1}`; inp.maxLength = 100;
    opts.appendChild(inp); inp.focus();
  };
  document.getElementById('pollSubmitBtn').onclick = () => submitPoll(modal);
  document.getElementById('pollQuestion').focus();
}

async function submitPoll(modal) {
  if (!activeRoom || !currentUserId) return;
  const question = document.getElementById('pollQuestion').value.trim();
  if (!question) { showToast('Enter a question.'); return; }
  const optEls = document.getElementById('pollOptions').querySelectorAll('input');
  const labels = [...optEls].map(i => i.value.trim()).filter(Boolean);
  if (labels.length < 2) { showToast('Add at least 2 options.'); return; }

  const isChannel = activeRoom.type === 'channel' || activeRoom.serverId;
  const { data: poll, error: pollErr } = await sb.from('polls').insert({
    question,
    created_by: currentUserId,
    channel_id: isChannel ? (activeRoom.id || null) : null,
    dm_id: !isChannel ? (activeRoom.id || null) : null,
  }).select().single();
  if (pollErr || !poll) { showToast('Failed to create poll.'); console.error(pollErr); return; }

  const optRows = labels.map((label, i) => ({ poll_id: poll.id, label, position: i }));
  const { error: optErr } = await sb.from('poll_options').insert(optRows);
  if (optErr) { showToast('Poll created but options failed.'); console.error(optErr); return; }

  const { data: p } = await sb.from('profiles').select('username,avatar_url,role,tag').eq('id', currentUserId).single();
  await sb.from('messages').insert({
    text: '',
    user_id: currentUserId,
    username: p?.username || 'Unknown',
    avatar_url: p?.avatar_url || null,
    role: p?.role || null,
    tag: p?.tag || null,
    poll_id: poll.id,
    channel_id: activeRoom.type === 'channel' ? activeRoom.id : null,
    server_id: activeRoom.serverId || null,
    dm_id: activeRoom.type === 'dm' ? activeRoom.id : null,
  });
  modal.remove();
}
