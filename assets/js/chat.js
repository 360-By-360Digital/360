/* ════════════════════════════════════════════════════════
   360 Chat v3.3 — Full rewrite
   Fixes: timestamps (UTC→local), delete+regroup, members=online,
   ephemeral bot messages, thread count, joined-only rail, all panels
════════════════════════════════════════════════════════ */
window.SKIP_AUTH_CHIP = true;
const sb = supabaseClient;
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
  return[p('fuck'),p('shit'),p('bitch'),p('cunt'),p('bastard'),/d[i1!][ck]+/gi,
    /n[i1!][g9][g9][e3]r/gi,/n[i1!][g9][g9][a4]/gi,/f[a4][g9][g9][o0][t7]/gi,
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
  // Already has timezone offset marker — parse directly
  if(/Z$/i.test(ts) || /[+-]\d{2}:\d{2}$/.test(ts)) return new Date(ts);
  // Supabase format: "2024-05-01 14:32:00.123" — treat as UTC
  return new Date(ts.trim().replace(' ','T') + 'Z');
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
  (allServers||[]).filter(s=>isAdminOrMod(currentProfile)||joinedServerIds.has(s.id)||!s.passcode)
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
          ()=>switchRoom({type:'channel',id:ch.id,name:ch.name,icon:'#',serverName:server.name,serverId:server.id,topic:ch.topic||''}));
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
  const{data:dms}=await sb.from('direct_messages').select('*')
    .or(`user_a.eq.${currentUserId},user_b.eq.${currentUserId}`).order('updated_at',{ascending:false});
  if(!dms?.length){body.innerHTML=`<div style="padding:20px;font-size:13px;color:var(--dc-muted);text-align:center;">No DMs yet.</div>`;}
  else{
    const others=dms.map(dm=>dm.user_a===currentUserId?dm.user_b:dm.user_a);
    const profiles=await Promise.all(others.map(id=>getProfile(id)));
    dms.forEach((dm,i)=>{
      const p=profiles[i]; const oid=others[i];
      const item=document.createElement('div');
      item.className='dc-dm-item'+(activeRoom.id===dm.id?' active':''); item.dataset.dmId=dm.id;
      const av=document.createElement('div'); av.className='dc-dm-avatar';
      if(p.avatar_url){const img=document.createElement('img');img.src=p.avatar_url;av.appendChild(img);}
      else av.textContent=getInitials(p.username);
      const name=document.createElement('span'); name.textContent=p.username||'User';
      const dk='dm:'+dm.id;
      if(unreadCounts[dk]>0){
        const badge=document.createElement('span'); badge.className='ch-unread-badge';
        badge.textContent=unreadCounts[dk]>99?'99+':String(unreadCounts[dk]); item.appendChild(badge);
      }
      item.appendChild(av); item.appendChild(name);
      item.addEventListener('click',()=>switchRoom({type:'dm',id:dm.id,name:p.username,icon:'@',serverId:null,serverName:'Direct Messages',otherId:oid}));
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
       s.passcode?`<span style="margin-left:auto;font-size:11px;opacity:.5;">🔒</span>`:'');
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
  else if(server.passcode){await buildSidebar(server); showPasscodeGate(server);}
  else{await joinServer(server.id); await enterServer(server);}
}
async function joinServer(serverId){
  const{error}=await sb.from('server_members').insert({server_id:serverId,user_id:currentUserId});
  if(error&&!error.message?.includes('unique')&&!error.code?.includes('23505')) showToast('❌ '+error.message);
  else joinedServerIds.add(serverId);
}
async function enterServer(server){
  setActiveServer(server.id); await buildSidebar(server);
  const{data:chs}=await sb.from('channels').select('*').eq('server_id',server.id).order('position').order('name').limit(1);
  if(chs?.length) switchRoom({type:'channel',id:chs[0].id,name:chs[0].name,icon:'#',serverName:server.name,serverId:server.id,topic:chs[0].topic||''});
}
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
    if(v!==server.passcode){gate.querySelector('#gate-err').textContent='Wrong passcode.';inp.value='';inp.focus();return;}
    await joinServer(server.id); gate.remove(); main.style.position=''; await enterServer(server); await buildRail();
  };
  gate.querySelector('#gate-btn').onclick=tryUnlock;
  inp.onkeydown=e=>{if(e.key==='Enter') tryUnlock();};
}

/* ══════════════════════════════════════════════════════
   SWITCH ROOM
══════════════════════════════════════════════════════ */
function switchRoom(room){
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
    chan.on('postgres_changes',{event:'INSERT',schema:'public',table:'dm_messages',filter:`dm_id=eq.${room.id}`},p=>onIncoming(p.new));
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
  loadHistory(); markRoomRead(room);
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
    q=sb.from('dm_messages').select('*').eq('dm_id',activeRoom.id);
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
    msgs.forEach(m=>{const el=buildMsgEl(m);if(el)frag.appendChild(el);});
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
  const el=buildMsgEl(msg); if(!el) return;
  document.getElementById('dc-messages').appendChild(el);
  if(isRealtime){const w=document.getElementById('dc-messages');if(w.scrollHeight-w.scrollTop-w.clientHeight<300)scrollBottom();}
  if(isRealtime&&activeRoom.type!=='dm') loadReactionsSingle(msg.id);
  maybeTranslateMessage(el,msg.text);
}

function buildMsgEl(msg){
  const r=activeRoom;
  if(r.type==='public'&&(msg.channel_id||msg.dm_id||msg.server_id)) return null;
  if(r.type==='channel'&&String(msg.channel_id)!==String(r.id)) return null;
  if(r.type==='server'&&String(msg.server_id)!==String(r.id)) return null;
  if(r.type==='dm'&&String(msg.dm_id)!==String(r.id)) return null;
  if(msg.thread_id!=null) return null; // never show thread replies in main chat
  if(msgElMap.has(String(msg.id))) return null;

  const win=document.getElementById('dc-messages');
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
  if(msg.text){const d=document.createElement('div');d.className='dc-msg-text';d.innerHTML=renderText(msg.text);body.appendChild(d);}
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
   {i:'🧵',t:'Thread',fn:()=>openThread(msg)},{i:'📌',t:'Pin',fn:()=>pinMsg(msg)}].forEach(a=>{
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
  let t=esc(raw);
  t=applyShortcodes(t);
  t=t.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>');
  t=t.replace(/\*(.+?)\*/g,'<em>$1</em>');
  t=t.replace(/`([^`]+)`/g,'<code>$1</code>');
  t=t.replace(/```([\s\S]*?)```/g,'<pre>$1</pre>');
  t=t.replace(/@(\w+)/g,(m,name)=>{
    const isMe=currentProfile&&name.toLowerCase()===(currentProfile.username||'').toLowerCase();
    return `<span style="${isMe?'color:#fbbf24;background:rgba(251,191,36,.18);':'color:var(--a);background:rgba(59,130,246,.12);'}border-radius:3px;padding:0 3px;font-weight:${isMe?'700':'600'};">${m}</span>`;
  });
  t=t.replace(/https?:\/\/[^\s<>"]+/g,url=>`<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
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
  setTimeout(()=>document.addEventListener('click',()=>menu.classList.add('hidden'),{once:true}),10);
}
document.getElementById('ctx-reply').onclick=()=>ctxTargetMsg&&setReply(ctxTargetMsg);
document.getElementById('ctx-react').onclick=e=>ctxTargetMsg&&openReactionPicker(ctxTargetMsg.id,e);
document.getElementById('ctx-thread').onclick=()=>ctxTargetMsg&&openThread(ctxTargetMsg);
document.getElementById('ctx-pin').onclick=()=>ctxTargetMsg&&pinMsg(ctxTargetMsg);
document.getElementById('ctx-copy').onclick=()=>{
  const t=msgElMap.get(String(ctxTargetMsg?.id))?.querySelector('.dc-msg-text')?.textContent||'';
  navigator.clipboard.writeText(t).then(()=>showToast('📋 Copied!'));
};
document.getElementById('ctx-delete').onclick=()=>ctxTargetMsg&&deleteMsg(ctxTargetMsg.id);

/* ══════════════════════════════════════════════════════
   DELETE MESSAGE
══════════════════════════════════════════════════════ */
async function deleteMsg(msgId){
  if(!confirm('Delete this message?')) return;
  if(activeRoom.type==='dm'){
    await sb.from('dm_messages').delete().eq('id',msgId);
    removeMsgAndRegroup(String(msgId));
  } else {
    await sb.from('messages').update({deleted_at:new Date().toISOString()}).eq('id',msgId);
    // Realtime UPDATE fires deleted_at which we handle via soft-delete visibility
    // But we also remove immediately client-side for snappiness
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
   PINS
══════════════════════════════════════════════════════ */
async function pinMsg(msg){
  if(!currentUserId) return;
  const r=activeRoom;
  const{error}=await sb.from('pinned_messages').insert({
    channel_id:r.type==='channel'?r.id:null,server_id:r.serverId||null,
    message_id:msg.id,pinned_by:currentUserId
  });
  if(error){if(error.code==='23505')showToast('📌 Already pinned');else showToast('❌ '+error.message);return;}
  showToast('📌 Pinned!');
}
async function loadPins(){
  const list=document.getElementById('pins-list'); list.innerHTML=''; const r=activeRoom;
  let q=sb.from('pinned_messages').select('*,messages(id,text,username)');
  if(r.type==='channel') q=q.eq('channel_id',r.id); else if(r.serverId) q=q.eq('server_id',r.serverId);
  const{data}=await q.order('created_at',{ascending:false});
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
let typingDebounce;
msgInput.addEventListener('input',()=>{
  msgInput.style.height='auto'; msgInput.style.height=Math.min(msgInput.scrollHeight,180)+'px';
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
    const payload={user_id:session.user.id,username:p.username||session.user.email,avatar_url:p.avatar_url||null,tag:p.tag||null,role:p.role||'user',text:filterProfanity(applyShortcodes(text||'')),file_url:fileUrl};
    if(replyingTo){payload.reply_to_id=replyingTo.id;payload.reply_to_username=replyingTo.username;payload.reply_to_text=(replyingTo.text||'').slice(0,100);replyingTo=null;document.getElementById('dc-reply-bar').classList.add('hidden');}
    if(activeRoom.type==='dm'){payload.dm_id=activeRoom.id;await sb.from('dm_messages').insert(payload);await sb.from('direct_messages').update({updated_at:new Date().toISOString()}).eq('id',activeRoom.id);}
    else{if(activeRoom.type==='channel')payload.channel_id=activeRoom.id;else if(activeRoom.type==='server')payload.server_id=activeRoom.id;await sb.from('messages').insert(payload);}
    msgInput.value=''; msgInput.style.height='auto'; lastSentTime=Date.now();
  }finally{isSending=false;document.getElementById('sendBtn').disabled=false;}
}

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
  const dmBtn=document.getElementById('pp-dm-btn'); dmBtn.style.display=userId===currentUserId?'none':'block';
  dmBtn.onclick=async()=>{popup.classList.add('hidden');if(p.email)await startDMWith(p.email);};
  const rect=anchorEl.getBoundingClientRect();
  popup.style.top=Math.min(rect.bottom+6,window.innerHeight-320)+'px';
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
  if(ex){dmId=ex.id;}else{const{data:nd,error}=await sb.from('direct_messages').insert({user_a:currentUserId,user_b:profile.id}).select().single();if(error){document.getElementById('dm-err').textContent=error.message;return;}dmId=nd.id;}
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
  document.getElementById('ch-create').dataset.serverId=server.id;openModal('channelModal');
}
document.getElementById('ch-cancel').onclick=()=>closeModal('channelModal');
document.getElementById('ch-create').onclick=async()=>{
  const sid=document.getElementById('ch-create').dataset.serverId;
  const name=document.getElementById('ch-name').value.trim().toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'');
  if(!name){document.getElementById('ch-err').textContent='Name required.';return;}
  const{error}=await sb.from('channels').insert({name,server_id:sid,is_public:true,category:document.getElementById('ch-cat').value.trim()||'TEXT CHANNELS',topic:document.getElementById('ch-topic').value.trim()||null});
  if(error){document.getElementById('ch-err').textContent=error.message;return;}
  closeModal('channelModal');const{data:s}=await sb.from('servers').select('*').eq('id',sid).maybeSingle();if(s)buildSidebar(s);
};

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
function openModal(id){document.getElementById(id)?.classList.remove('hidden');}
function closeModal(id){document.getElementById(id)?.classList.add('hidden');}
document.getElementById('railAddServer').onclick=()=>{if(!currentUserId){location.href='/account';return;}openServerModal(null);};
document.getElementById('sm-cancel').onclick=()=>closeModal('serverModal');
document.getElementById('railDMs').onclick=async()=>{
  if(!currentUserId){location.href='/account';return;}
  showingDMs=!showingDMs;setActiveServer(null);await buildSidebar(null);
  document.getElementById('railDMs').classList.toggle('active',showingDMs);
};
document.getElementById('dm-cancel').onclick=()=>closeModal('dmModal');
document.getElementById('dm-start').onclick=async()=>await startDMWith(document.getElementById('dm-target').value.trim());
document.getElementById('dm-target').onkeydown=e=>{if(e.key==='Enter')document.getElementById('dm-start').click();};
document.getElementById('dcMobileBack').onclick=()=>document.getElementById('dcSidebar').classList.toggle('mobile-open');
document.getElementById('sidebarToggle')?.addEventListener('click',()=>document.getElementById('dcSidebar').classList.toggle('mobile-open'));
document.getElementById('jm-cancel')?.addEventListener('click',()=>closeModal('joinModal'));
document.getElementById('jm-join')?.addEventListener('click',async()=>{
  const pass=document.getElementById('jm-pass')?.value.trim();const err=document.getElementById('jm-err');
  const sid=document.getElementById('jm-join')?.dataset.serverId;if(!sid)return;
  const{data:server}=await sb.from('servers').select('*').eq('id',sid).maybeSingle();
  if(!server){if(err)err.textContent='Server not found.';return;}
  if(server.passcode&&pass!==server.passcode){if(err)err.textContent='Wrong passcode.';return;}
  closeModal('joinModal');await joinServer(server.id);await enterServer(server);
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
    currentUserId=session?.user?.id||null;
    if(currentUserId) currentProfile=await getProfile(currentUserId);
    updateUserChip();
    await buildRail();
    await buildSidebar(null);
    switchRoom({type:'public',id:'public',name:'general',icon:'#',serverName:'360 Chat',serverId:null});
    setTimeout(()=>window.ChatNotif?.onRoomSwitch(activeRoom),0);
    startPresence();
    await handleInviteCode();
    sb.auth.onAuthStateChange(async(_,session)=>{
      currentUserId=session?.user?.id||null;
      currentProfile=currentUserId?await getProfile(currentUserId):null;
      if(currentUserId) profileCache[currentUserId]=currentProfile;
      updateUserChip(); await buildRail();
    });
  }catch(e){console.error('Chat init error:',e);}
})();
