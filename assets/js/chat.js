/* ════════════════════════════════════════════════════════
   360 Chat — Discord Mode  v3.4
   Fixes: timestamp timezone, members panel shows online users
════════════════════════════════════════════════════════ */
window.SKIP_AUTH_CHIP = true;
const sb = supabaseClient;

/* ── State ─────────────────────────────────────────── */
let currentUserId   = null;
let currentProfile  = null;
let activeRoom      = { type:'public', id:'public', name:'general', icon:'#', serverId:null, serverName:'360 Chat' };
let activeServerId  = null;
let pendingFile     = null;
let replyingTo      = null;
let realtimeChannel = null;
let typingChannel   = null;
let typingUsers     = {};
let typingTimeouts  = {};
let lastMsgUserId   = null;
let lastMsgDate     = null;
let isSending       = false;
let historyExhausted= false;
let oldestMsgDate   = null;
let isLoadingMore   = false;
let slowModeSeconds = 0;
let lastSentTime    = 0;
let ctxTargetMsg    = null;
let showingDMs      = false;
let knownUsers      = [];
let mentionQuery    = null;
let mentionStart    = 0;
let mentionSelIdx   = 0;
let activeThreadId  = null;
let slashSuggIdx    = 0;
let joinedServerIds = new Set();
let presenceState   = {};
const msgElMap      = new Map();
const profileCache  = {};
const translateCache= {};
const unreadCounts  = {};
const QUICK_EMOJIS  = ['👍','❤️','😂','💀','🔥','😮','😢','👏','✨','💯','🚀','⭐','🎉','👀','🙏'];
const ALL_EMOJIS    = ['😀','😂','😍','🥰','😎','🤔','😢','😡','👍','👎','❤️','🔥','💀','🎉','✨',
                       '💯','🚀','⭐','👀','🙏','💪','🤖','😊','🥺','🤣','😅','😱','🫡','💅','🗿',
                       '🤯','🫠','😭','🤩','😤','🫶','❄️','⚡','🌈','🎮','🏆','👑','💎','🐱','🌙'];
const SHORTCODES={':skull:':'💀',':fire:':'🔥',':heart:':'❤️',':thumbsup:':'👍',':thumbsdown:':'👎',
  ':laugh:':'😂',':cry:':'😢',':wow:':'😮',':clap:':'👏',':sparkles:':'✨',':100:':'💯',
  ':rocket:':'🚀',':eyes:':'👀',':ok:':'👌',':wave:':'👋',':pray:':'🙏',':muscle:':'💪',
  ':star:':'⭐',':check:':'✅',':x:':'❌',':warning:':'⚠️',':zap:':'⚡',':rainbow:':'🌈',
  ':sun:':'☀️',':moon:':'🌙',':trophy:':'🏆',':crown:':'👑',':diamond:':'💎',':robot:':'🤖',
  ':nerd:':'🤓',':360:':'🔵',':gg:':'🎮',':bruh:':'😑',':cat:':'🐱',':rose:':'🥀'};
function applyShortcodes(t){return t.replace(/:[a-z0-9_]+:/g,m=>SHORTCODES[m]||m);}

let PROF=[];
try{PROF=(()=>{
  const l=w=>w.split('').map(c=>({a:'[a4@]',b:'[b8]',c:'[ck(]',e:'[e3]',f:'[f]',g:'[g9]',h:'[h#]',i:'[i1!|]',k:'[kc]',l:'[l1|]',n:'[n]',o:'[o0]',p:'[p]',r:'[r]',s:'[s5$]',t:'[t7+]',u:'[uv]',v:'[vu]',x:'[x]'}[c]||c)).join('[\\s_.\\-*]*');
  const p=w=>new RegExp('(?<![a-z])'+l(w)+'(?![a-z])','gi');
  return[p('fuck'),p('fuk'),p('fck'),/ph[uv][ck]+/gi,/f+[uv]+[ck]+[e]*/gi,p('shit'),p('sht'),/a+[s$][s$]+/gi,/a+r+[s$][e]?/gi,/as+hole/gi,p('bitch'),/b[i1!][t7]ch/gi,p('cunt'),/c[uv]n[t7]/gi,/d[i1!][ck]+/gi,/c[o0][ck]+/gi,p('bastard'),/wh[o0]r[e3]?/gi,/sl[uv][t7]/gi,/n[i1!][g9][g9][e3]r/gi,/n[i1!][g9][g9][a4]/gi,/f[a4][g9][g9][o0][t7]/gi,/r[e3][t7][a4]r[d][e3]?[d]?/gi,/[t7]w[a4@][t7]/gi,/pr[i1!][ck]+/gi,/w[a4@]nk[e3]?r?/gi,/wtf/gi,/stfu/gi,/m[o0][t7]h[e3]r[\s\-_.]*f[uv][ck]/gi,/\bputa\b/gi,/\bputo\b/gi,/\bpinche\b/gi,/\bchinga[r]?\b/gi,/\bmerde\b/gi,/\bputain\b/gi,/\bsalope\b/gi,/\bscheisse\b/gi,/\bficken\b/gi,/\barschloch\b/gi,/\bporra\b/gi,/\bmerda\b/gi,/\bcazzo\b/gi,/\bvaffanculo\b/gi,/\bkut\b/gi,/\bkanker\b/gi,/\bkurwa\b/gi,/\bmalaka\b/gi,/\bkontol\b/gi,/\btangina\b/gi];
})();}catch(e){}
function filterProfanity(t){if(!t)return t;let o=t;for(const p of PROF){try{o=o.replace(p,m=>'*'.repeat(m.length));}catch(e){}}return o;}

/* ── Utils ──────────────────────────────────────────── */
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function getInitials(n){if(!n)return'?';const p=n.trim().split(' ');return(p.length===1?p[0][0]:(p[0][0]+p[p.length-1][0])).toUpperCase();}

/* ── FIXED: timestamps ────────────────────────────────
   Supabase stores created_at as UTC (no trailing Z in older rows).
   Appending 'Z' if missing forces correct UTC parse so toLocaleTimeString
   renders in the user's local timezone instead of double-offsetting.
─────────────────────────────────────────────────────── */
function parseTS(ts){
  if(!ts)return new Date();
  // If it already has timezone info (Z or +HH:MM), parse directly
  if(/[Zz]$|[+-]\d{2}:\d{2}$/.test(ts))return new Date(ts);
  // Otherwise Supabase UTC string like "2024-01-15 14:32:00" — append Z
  return new Date(ts.replace(' ','T')+'Z');
}
function formatTime(ts){
  return parseTS(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}
function formatDate(ts){
  const d=parseTS(ts),t=new Date(),y=new Date();
  y.setDate(t.getDate()-1);
  if(d.toDateString()===t.toDateString())return'Today';
  if(d.toDateString()===y.toDateString())return'Yesterday';
  return d.toLocaleDateString([],{month:'long',day:'numeric',year:'numeric'});
}

function isImageUrl(url){return/\.(jpe?g|png|gif|webp|svg|bmp)(\?|$)/i.test(url);}
function showToast(msg,dur=2800){const t=document.createElement('div');t.className='dc-toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),dur);}
function scrollBottom(){requestAnimationFrame(()=>requestAnimationFrame(()=>{const w=document.getElementById('dc-messages');if(w)w.scrollTop=w.scrollHeight;}));}
function getRoomKey(r){return r.type+':'+r.id;}
function isAdminOrMod(p){return p?.role==='admin'||p?.role==='mod';}
function closeAllPanels(){
  document.getElementById('thread-panel').classList.add('hidden');
  document.getElementById('pins-panel').classList.add('hidden');
  document.getElementById('members-panel').classList.add('hidden');
  document.getElementById('online-panel')?.classList.add('hidden');
  document.getElementById('invite-panel')?.classList.add('hidden');
  document.getElementById('server-ctx-menu')?.remove();
}

/* ── Profile cache ──────────────────────────────────── */
async function getProfile(uid){
  if(!uid)return{username:'Unknown',avatar_url:null,role:'user',banned:false,muted_until:null,warn_count:0};
  if(profileCache[uid])return profileCache[uid];
  try{
    const{data}=await sb.from('profiles').select('username,avatar_url,role,tag,email,first_name,last_name,banned,muted_until,warn_count').eq('id',uid).single();
    const p=data||{username:'Unknown',avatar_url:null,role:'user'};
    if(!p.username)p.username=[p.first_name,p.last_name].filter(Boolean).join(' ')||'Unknown';
    p.warn_count=p.warn_count||0;
    profileCache[uid]=p;return p;
  }catch{return{username:'Unknown',avatar_url:null,role:'user',banned:false,muted_until:null,warn_count:0};}
}
async function logAutomod(userId,username,action,reason,expiresAt=null){
  try{await sb.from('automod_log').insert({user_id:userId,username,action,reason,expires_at:expiresAt});}catch(e){}
}
function isMuted(p){return p?.muted_until&&new Date(p.muted_until)>new Date();}
function muteExpiryText(p){if(!p?.muted_until)return'';const ms=new Date(p.muted_until)-new Date();if(ms<=0)return'';const m=Math.ceil(ms/60000);return m<60?`${m}m`:Math.ceil(m/60)+'h';}
function requiresMod(p){return p?.role==='admin'||p?.role==='mod';}

function makeAvatar(p,size=38){
  if(p?.avatar_url){const img=document.createElement('img');img.src=p.avatar_url;img.style.cssText=`width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;`;img.onerror=()=>img.replaceWith(makeInitialsEl(p,size));return img;}
  return makeInitialsEl(p,size);
}
function makeInitialsEl(p,size=38){
  const d=document.createElement('div');
  d.style.cssText=`width:${size}px;height:${size}px;border-radius:50%;background:var(--a);color:#fff;font-size:${Math.round(size*.38)}px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
  d.textContent=getInitials(p?.username);return d;
}

/* ══════════════════════════════════════════════════════
   JOINED SERVERS
══════════════════════════════════════════════════════ */
async function refreshJoinedServers(){
  joinedServerIds.clear();
  if(!currentUserId)return;
  const{data}=await sb.from('server_members').select('server_id').eq('user_id',currentUserId);
  (data||[]).forEach(r=>joinedServerIds.add(r.server_id));
}

/* ══════════════════════════════════════════════════════
   RAIL
══════════════════════════════════════════════════════ */
async function buildRail(){
  await refreshJoinedServers();
  const rail=document.getElementById('rail-servers');rail.innerHTML='';
  const gen=document.createElement('button');
  gen.className='rail-server-icon'+(activeServerId===null&&!showingDMs?' active':'');
  gen.title='General';gen.textContent='🌐';gen.dataset.serverId='';
  gen.onclick=()=>{showingDMs=false;setActiveServer(null);buildSidebar(null);switchRoom({type:'public',id:'public',name:'general',icon:'#',serverName:'360 Chat',serverId:null});};
  rail.appendChild(gen);

  const{data:allServers}=await sb.from('servers').select('*').order('name');
  (allServers||[]).filter(s=>isAdminOrMod(currentProfile)||joinedServerIds.has(s.id)||!s.passcode).forEach(s=>{
    const btn=document.createElement('button');
    btn.className='rail-server-icon'+(activeServerId===s.id?' active':'');
    btn.title=s.name;btn.dataset.serverId=s.id;
    const unreadKey='server:'+s.id;
    if(unreadCounts[unreadKey]>0){
      btn.classList.add('unread');
      const pip=document.createElement('span');pip.className='rail-unread';
      pip.textContent=unreadCounts[unreadKey]>9?'9+':String(unreadCounts[unreadKey]);
      btn.appendChild(pip);
    }
    if(s.icon&&(s.icon.startsWith('http')||s.icon.startsWith('/'))){
      const img=document.createElement('img');img.src=s.icon;img.alt=s.name;btn.appendChild(img);
    }else{
      btn.textContent=s.icon||s.name[0].toUpperCase();
    }
    btn.onclick=()=>handleServerClick(s);
    rail.appendChild(btn);
  });

  const ru=document.getElementById('railUser');ru.innerHTML='';
  if(currentProfile){const av=makeAvatar(currentProfile,34);ru.appendChild(av);}else ru.textContent='?';
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
  const body=document.getElementById('sidebarBody');body.innerHTML='';
  if(showingDMs){header.textContent='Direct Messages';await buildDMList(body);return;}
  if(!server){
    header.textContent='360 Chat';
    addCategoryHeader(body,'TEXT CHANNELS',null);
    body.appendChild(makeChanItem({id:'public',name:'general'},activeRoom.type==='public',()=>switchRoom({type:'public',id:'public',name:'general',icon:'#',serverName:'360 Chat',serverId:null})));
    addSidebarBtn(body,'＋ Create Server',()=>{if(!currentUserId){location.href='/account';return;}openServerModal(null);});
    addSidebarBtn(body,'🔍 Browse Servers',()=>browseSidebar(body));
    return;
  }
  header.textContent=server.name;
  const{data:channels}=await sb.from('channels').select('*').eq('server_id',server.id).order('position').order('name');
  if(!channels?.length){body.innerHTML=`<div style="padding:20px;font-size:13px;color:var(--dc-muted);text-align:center;">No channels yet.</div>`;}
  else{
    const cats={};channels.forEach(ch=>{const c=ch.category||'TEXT CHANNELS';(cats[c]=cats[c]||[]).push(ch);});
    const canManage=isAdminOrMod(currentProfile)||server.owner_id===currentUserId;
    Object.entries(cats).forEach(([cat,chs])=>{
      addCategoryHeader(body,cat,canManage?()=>openAddChannelModal(server):null);
      chs.forEach(ch=>{
        const item=makeChanItem(ch,activeRoom.id===ch.id,()=>switchRoom({type:'channel',id:ch.id,name:ch.name,icon:'#',serverName:server.name,serverId:server.id,topic:ch.topic||''}));
        const chKey='channel:'+ch.id;
        if(unreadCounts[chKey]>0){
          const badge=document.createElement('span');badge.className='ch-unread-badge';
          badge.textContent=unreadCounts[chKey]>99?'99+':String(unreadCounts[chKey]);
          item.appendChild(badge);
        }
        body.appendChild(item);
      });
    });
  }
  if(currentUserId&&(isAdminOrMod(currentProfile)||server.owner_id===currentUserId)){
    addSidebarBtn(body,'＋ Add Channel',()=>openAddChannelModal(server));
    addSidebarBtn(body,'✏️ Edit Server',()=>openServerModal(server));
    if(server.owner_id===currentUserId)addSidebarBtn(body,'🔗 Invite Links',()=>openInvitePanel(server));
  }
  if(currentUserId&&!joinedServerIds.has(server.id)&&!isAdminOrMod(currentProfile)){
    addSidebarBtn(body,'✅ Join Server',()=>handleServerClick(server));
  }
}

function addCategoryHeader(body,label,onAdd){
  const c=document.createElement('div');c.className='dc-category';
  c.innerHTML=`<span class="cat-arrow">▸</span><span>${esc(label)}</span>${onAdd?`<button class="cat-add" title="Add channel">＋</button>`:''}`;
  if(onAdd)c.querySelector('.cat-add')?.addEventListener('click',e=>{e.stopPropagation();onAdd();});
  c.addEventListener('click',e=>{
    if(e.target.classList.contains('cat-add'))return;
    const items=[];let next=c.nextSibling;
    while(next&&!next.classList?.contains('dc-category')){items.push(next);next=next.nextSibling;}
    const collapsed=items[0]?.style.display==='none';
    items.forEach(el=>el.style.display=collapsed?'':'none');
    c.classList.toggle('collapsed',!collapsed);
  });
  body.appendChild(c);
}

function makeChanItem(ch,isActive,onClick){
  const item=document.createElement('div');
  item.className='dc-ch-item'+(isActive?' active':'');
  item.dataset.chId=ch.id;
  item.innerHTML=`<span class="ch-hash">#</span><span>${esc(ch.name)}</span>`;
  item.addEventListener('click',onClick);return item;
}

function addSidebarBtn(body,label,onClick){
  const btn=document.createElement('button');btn.className='dc-sidebar-add-btn';btn.textContent=label;
  btn.addEventListener('click',onClick);body.appendChild(btn);
}

async function buildDMList(body){
  if(!currentUserId){addSidebarBtn(body,'Sign in to use DMs',()=>location.href='/account');return;}
  const{data:dms}=await sb.from('direct_messages').select('*').or(`user_a.eq.${currentUserId},user_b.eq.${currentUserId}`).order('updated_at',{ascending:false});
  if(!dms?.length){body.innerHTML=`<div style="padding:20px;font-size:13px;color:var(--dc-muted);text-align:center;">No DMs yet.</div>`;}
  else{
    const others=dms.map(dm=>dm.user_a===currentUserId?dm.user_b:dm.user_a);
    const profiles=await Promise.all(others.map(id=>getProfile(id)));
    dms.forEach((dm,i)=>{
      const p=profiles[i];const oid=others[i];
      const item=document.createElement('div');item.className='dc-dm-item'+(activeRoom.id===dm.id?' active':'');item.dataset.dmId=dm.id;
      const av=document.createElement('div');av.className='dc-dm-avatar';
      if(p.avatar_url){const img=document.createElement('img');img.src=p.avatar_url;av.appendChild(img);}else av.textContent=getInitials(p.username);
      const name=document.createElement('span');name.textContent=p.username||'User';
      const dmKey='dm:'+dm.id;
      if(unreadCounts[dmKey]>0){
        const badge=document.createElement('span');badge.className='ch-unread-badge';
        badge.textContent=unreadCounts[dmKey]>99?'99+':String(unreadCounts[dmKey]);item.appendChild(badge);
      }
      item.appendChild(av);item.appendChild(name);
      item.addEventListener('click',()=>switchRoom({type:'dm',id:dm.id,name:p.username,icon:'@',serverId:null,serverName:'Direct Messages',otherId:oid}));
      body.appendChild(item);
    });
  }
  addSidebarBtn(body,'＋ New Message',()=>openModal('dmModal'));
}

async function browseSidebar(body){
  const{data:allServers}=await sb.from('servers').select('*').order('name');
  body.innerHTML='';
  addCategoryHeader(body,'ALL SERVERS',null);
  (allServers||[]).forEach(s=>{
    const isJoined=joinedServerIds.has(s.id);
    const item=document.createElement('div');item.className='dc-ch-item';
    const iconHtml=s.icon&&(s.icon.startsWith('http')||s.icon.startsWith('/'))
      ?`<img src="${esc(s.icon)}" style="width:18px;height:18px;border-radius:4px;object-fit:cover;">`
      :`<span>${esc(s.icon||'🌐')}</span>`;
    item.innerHTML=`${iconHtml}<span>${esc(s.name)}</span>${isJoined?`<span style="margin-left:auto;font-size:11px;color:var(--a);">✓</span>`:s.passcode?`<span style="margin-left:auto;font-size:11px;opacity:.5;">🔒</span>`:''}`;
    item.addEventListener('click',()=>handleServerClick(s));body.appendChild(item);
  });
}

/* ══════════════════════════════════════════════════════
   SERVER CONTEXT MENU
══════════════════════════════════════════════════════ */
document.getElementById('sb-server-menu')?.addEventListener('click',async(e)=>{
  e.stopPropagation();
  document.getElementById('server-ctx-menu')?.remove();
  if(!activeRoom.serverId||!currentUserId)return;
  const{data:server}=await sb.from('servers').select('*').eq('id',activeRoom.serverId).maybeSingle();
  if(!server)return;
  const isOwner=server.owner_id===currentUserId;
  const canManage=isOwner||isAdminOrMod(currentProfile);
  const menu=document.createElement('div');menu.id='server-ctx-menu';menu.className='server-ctx-menu';
  const items=[{label:'📋 Copy Server ID',fn:()=>{navigator.clipboard.writeText(server.id);showToast('Copied!');}}];
  if(canManage){
    items.push({label:'✏️ Edit Server',fn:()=>openServerModal(server)});
    items.push({label:'👥 Members',fn:()=>document.getElementById('btnMembers').click()});
    if(isOwner)items.push({label:'🔗 Invite Links',fn:()=>openInvitePanel(server)});
    items.push({sep:true});
    if(isOwner)items.push({label:'🗑 Delete Server',danger:true,fn:async()=>{
      if(!confirm(`Delete "${server.name}"? This cannot be undone.`))return;
      await sb.from('channels').delete().eq('server_id',server.id);
      await sb.from('server_members').delete().eq('server_id',server.id);
      await sb.from('servers').delete().eq('id',server.id);
      joinedServerIds.delete(server.id);setActiveServer(null);buildSidebar(null);
      switchRoom({type:'public',id:'public',name:'general',icon:'#',serverName:'360 Chat',serverId:null});
      await buildRail();showToast('Server deleted.');
    }});
  }
  if(!isOwner&&joinedServerIds.has(server.id)){
    items.push({label:'🚪 Leave Server',danger:true,fn:async()=>{
      if(!confirm(`Leave "${server.name}"?`))return;
      await sb.from('server_members').delete().eq('server_id',server.id).eq('user_id',currentUserId);
      joinedServerIds.delete(server.id);setActiveServer(null);buildSidebar(null);
      switchRoom({type:'public',id:'public',name:'general',icon:'#',serverName:'360 Chat',serverId:null});
      await buildRail();showToast('Left server.');
    }});
  }
  items.forEach(item=>{
    if(item.sep){const s=document.createElement('div');s.className='ctx-sep';menu.appendChild(s);return;}
    const d=document.createElement('div');d.className='ctx-item'+(item.danger?' danger':'');
    d.textContent=item.label;d.onclick=()=>{menu.remove();item.fn();};menu.appendChild(d);
  });
  document.body.appendChild(menu);
  const btn=document.getElementById('sb-server-menu');const rect=btn.getBoundingClientRect();
  menu.style.top=rect.bottom+4+'px';
  menu.style.left=Math.max(8,rect.right-menu.offsetWidth)+'px';
  setTimeout(()=>document.addEventListener('click',()=>menu.remove(),{once:true}),10);
});

/* ══════════════════════════════════════════════════════
   SERVER JOIN/ENTER
══════════════════════════════════════════════════════ */
async function handleServerClick(server){
  if(!currentUserId){location.href='/account';return;}
  showingDMs=false;setActiveServer(server.id);
  if(joinedServerIds.has(server.id)||isAdminOrMod(currentProfile)){await enterServer(server);}
  else if(server.passcode){await buildSidebar(server);showPasscodeGate(server);}
  else{await joinServer(server.id);await enterServer(server);}
}
async function joinServer(serverId){
  const{error}=await sb.from('server_members').insert({server_id:serverId,user_id:currentUserId});
  if(error&&!error.message.includes('unique')&&!error.code?.includes('23505'))showToast('❌ '+error.message);
  else joinedServerIds.add(serverId);
}
async function enterServer(server){
  setActiveServer(server.id);await buildSidebar(server);
  const{data:chs}=await sb.from('channels').select('*').eq('server_id',server.id).order('position').order('name').limit(1);
  if(chs?.length)switchRoom({type:'channel',id:chs[0].id,name:chs[0].name,icon:'#',serverName:server.name,serverId:server.id,topic:chs[0].topic||''});
}
function showPasscodeGate(server){
  document.getElementById('passcode-gate')?.remove();
  const gate=document.createElement('div');gate.id='passcode-gate';
  gate.style.cssText='position:absolute;inset:0;z-index:200;background:rgba(0,0,0,.75);backdrop-filter:blur(16px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;';
  gate.innerHTML=`<div style="font-size:44px">🔒</div>
    <div style="font-size:20px;font-weight:800;color:#fff">${esc(server.name)}</div>
    <div style="font-size:13px;color:rgba(255,255,255,.6)">This server requires a passcode.</div>
    <input id="gate-inp" type="password" placeholder="Enter passcode" style="padding:11px 18px;border-radius:12px;border:1.5px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);font-size:15px;outline:none;width:260px;color:#fff;text-align:center;font-family:inherit;"/>
    <p id="gate-err" style="color:#f87171;font-size:12px;min-height:16px;margin:0;"></p>
    <button id="gate-btn" style="padding:11px 36px;border-radius:12px;border:none;cursor:pointer;font-size:15px;font-weight:700;background:var(--a);color:#fff;font-family:inherit;">Unlock</button>
    <button id="gate-back" style="background:none;border:none;cursor:pointer;font-size:13px;color:rgba(255,255,255,.5);font-family:inherit;">← Go back</button>`;
  const main=document.getElementById('dcMain');main.style.position='relative';main.appendChild(gate);
  const inp=gate.querySelector('#gate-inp');inp.focus();
  gate.querySelector('#gate-back').onclick=()=>{gate.remove();main.style.position='';};
  const tryUnlock=async()=>{
    const v=inp.value.trim();if(!v){gate.querySelector('#gate-err').textContent='Enter the passcode.';return;}
    if(v!==server.passcode){gate.querySelector('#gate-err').textContent='Wrong passcode.';inp.value='';inp.focus();return;}
    await joinServer(server.id);gate.remove();main.style.position='';await enterServer(server);await buildRail();
  };
  gate.querySelector('#gate-btn').onclick=tryUnlock;inp.onkeydown=e=>{if(e.key==='Enter')tryUnlock();};
}

/* ══════════════════════════════════════════════════════
   INVITE MANAGEMENT
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
    item.innerHTML=`<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;">
      <code class="invite-code">${esc(inv.code)}</code>
      <div style="display:flex;gap:6px;">
        <button class="dc-action-btn inv-copy" title="Copy">📋</button>
        <button class="dc-action-btn inv-del" title="Revoke" style="color:#ef4444;">🗑</button>
      </div>
    </div>
    <div style="font-size:11px;color:var(--dc-muted);margin-top:5px;">
      ${inv.used?'<span style="color:#ef4444;">✗ Used</span>':'<span style="color:#22c55e;">✓ Active</span>'}
      ${expired?'<span style="color:#f59e0b;margin-left:6px;">⏰ Expired</span>':''}
      <span style="margin-left:6px;">· Expires ${new Date(inv.expires_at).toLocaleDateString()}</span>
    </div>`;
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
   SERVER MODAL (create/edit with image upload)
══════════════════════════════════════════════════════ */
let pendingServerIconFile=null;
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
    const ov=document.createElement('div');ov.className='icon-overlay';ov.textContent='📷';
    if(server?.icon&&(server.icon.startsWith('http')||server.icon.startsWith('/'))){
      const img=document.createElement('img');img.src=server.icon;prev.appendChild(img);
    }else{prev.textContent=server?.icon||'🌐';}
    prev.appendChild(ov);
  }
  const fileInp=document.getElementById('sm-icon-file');
  if(fileInp){
    fileInp.onchange=e=>{
      const f=e.target.files[0];if(!f)return;
      if(f.size>1*1024*1024){showToast('❌ Image must be under 1 MB');e.target.value='';return;}
      pendingServerIconFile=f;
      const reader=new FileReader();
      reader.onload=ev=>{
        const p=document.getElementById('sm-icon-preview');p.innerHTML='';
        const img=document.createElement('img');img.src=ev.target.result;p.appendChild(img);
        const ov2=document.createElement('div');ov2.className='icon-overlay';ov2.textContent='📷';p.appendChild(ov2);
      };
      reader.readAsDataURL(f);
    };
  }
  document.getElementById('sm-icon-preview')?.addEventListener('click',()=>document.getElementById('sm-icon-file')?.click());
  const btn=document.getElementById('sm-submit');
  btn.onclick=isEdit?()=>saveServer(server):()=>createServer();
  openModal('serverModal');
}
async function uploadServerIcon(file){
  const ext=file.name.split('.').pop().toLowerCase();
  const path=`${currentUserId}/${Date.now()}.${ext}`;
  const{error}=await sb.storage.from('server-icons').upload(path,file,{cacheControl:'3600',upsert:true});
  if(error){showToast('❌ Icon upload failed: '+error.message);return null;}
  const{data:u}=sb.storage.from('server-icons').getPublicUrl(path);return u?.publicUrl||null;
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
