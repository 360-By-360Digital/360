/* ════════════════════════════════════════════════════════
   360 Chat — Discord Mode  v3.5 
   • Bug fixes: duplicate reactions, infinite scroll, DM creation,
     mute check race, profileCache invalidation, thread count sync,
     reaction-picker z-index, ctx-menu positioning, slow-mode timer,
     typing indicator cleanup, modal reopen icon listener leak,
     unread badge accumulation, mention popup escape key,
     slash command index OOB, auth race on init.
   • New: Game Detection (via presence) + Game Overlay badge
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
let dndMode         = false;
let slowModeTimer   = null;
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

/* ── Profanity filter ───────────────────────────────── */
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

/* FIX: robust UTC timestamp parsing — handles both 'Z' and bare UTC strings */
function parseTS(ts){
  if(!ts)return new Date();
  if(/[Zz]$|[+-]\d{2}:\d{2}$/.test(ts))return new Date(ts);
  return new Date(ts.replace(' ','T')+'Z');
}
function formatTime(ts){return parseTS(ts).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});}
function formatDate(ts){
  const d=parseTS(ts),t=new Date(),y=new Date();
  y.setDate(t.getDate()-1);
  if(d.toDateString()===t.toDateString())return'Today';
  if(d.toDateString()===y.toDateString())return'Yesterday';
  return d.toLocaleDateString([],{month:'long',day:'numeric',year:'numeric'});
}

function isImageUrl(url){return/\.(jpe?g|png|gif|webp|svg|bmp)(\?|$)/i.test(url);}
function showToast(msg,dur=2800){
  const t=document.createElement('div');t.className='dc-toast';t.textContent=msg;
  document.body.appendChild(t);setTimeout(()=>t.remove(),dur);
}
function scrollBottom(){requestAnimationFrame(()=>requestAnimationFrame(()=>{const w=document.getElementById('dc-messages');if(w)w.scrollTop=w.scrollHeight;}));}
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

/* ── Profile cache (with manual invalidation support) ─ */
async function getProfile(uid,forceRefresh=false){
  if(!uid)return{username:'Unknown',avatar_url:null,role:'user',banned:false,muted_until:null,warn_count:0};
  if(!forceRefresh&&profileCache[uid])return profileCache[uid];
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
/* FIX: mute check now re-fetches from DB to avoid stale cache */
async function isMutedFresh(userId){
  try{
    const{data}=await sb.from('profiles').select('muted_until').eq('id',userId).single();
    if(!data?.muted_until)return false;
    return new Date(data.muted_until)>new Date();
  }catch{return false;}
}
function isMuted(p){return p?.muted_until&&new Date(p.muted_until)>new Date();}
function muteExpiryText(p){if(!p?.muted_until)return'';const ms=new Date(p.muted_until)-new Date();if(ms<=0)return'';const m=Math.ceil(ms/60000);return m<60?`${m}m`:Math.ceil(m/60)+'h';}

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
   ██████  GAME DETECTION (Discord-style Rich Presence)
   Uses document.title polling + Visibility API + optional
   navigator.userAgentData. Broadcasts via Supabase presence.
══════════════════════════════════════════════════════ */
const KNOWN_GAMES=[
  {name:'Minecraft',patterns:['minecraft']},
  {name:'Roblox',patterns:['roblox']},
  {name:'Fortnite',patterns:['fortnite']},
  {name:'Valorant',patterns:['valorant']},
  {name:'Among Us',patterns:['among us']},
  {name:'League of Legends',patterns:['league of legends','lol client']},
  {name:'CS2',patterns:['counter-strike','cs2','csgo']},
  {name:'Apex Legends',patterns:['apex legends']},
  {name:'Genshin Impact',patterns:['genshin']},
  {name:'Rocket League',patterns:['rocket league']},
  {name:'Overwatch',patterns:['overwatch']},
  {name:'Call of Duty',patterns:['call of duty','warzone','modern warfare']},
  {name:'FIFA',patterns:['fifa','ea sports fc']},
  {name:'GTA V',patterns:['grand theft auto','gta v','gta5']},
  {name:'Elden Ring',patterns:['elden ring']},
  {name:'Terraria',patterns:['terraria']},
  {name:'Stardew Valley',patterns:['stardew']},
  {name:'360 Games',patterns:['360 games','minesweeper — 360','360fish','chess — 360']},
];
const GAME_EMOJIS={
  'Minecraft':'⛏️','Roblox':'🎮','Fortnite':'💥','Valorant':'🔫','Among Us':'🔪',
  'League of Legends':'🏆','CS2':'💣','Apex Legends':'👑','Genshin Impact':'✨',
  'Rocket League':'🚀','Overwatch':'⚔️','Call of Duty':'🪖','FIFA':'⚽',
  'GTA V':'🚗','Elden Ring':'🗡️','Terraria':'🌳','Stardew Valley':'🌾','360 Games':'🎮',
};

let currentGame = null;
let gameOverlayEl = null;
let gameDetectionInterval = null;

function detectGameFromTitle(){
  const title=(document.title||'').toLowerCase();
  for(const g of KNOWN_GAMES){
    if(g.patterns.some(p=>title.includes(p)))return g.name;
  }
  return null;
}

function setCurrentGame(gameName){
  if(gameName===currentGame)return;
  currentGame=gameName;
  updateGameOverlay();
  broadcastPresence();
}

function updateGameOverlay(){
  if(!gameOverlayEl){
    gameOverlayEl=document.createElement('div');
    gameOverlayEl.id='game-overlay';
    gameOverlayEl.className='game-overlay hidden';
    document.body.appendChild(gameOverlayEl);
  }
  if(!currentGame){
    gameOverlayEl.classList.add('hidden');
    return;
  }
  const emoji=GAME_EMOJIS[currentGame]||'🎮';
  gameOverlayEl.innerHTML=`
    <div class="go-badge">
      <span class="go-icon">${emoji}</span>
      <div class="go-info">
        <div class="go-label">Now Playing</div>
        <div class="go-name">${esc(currentGame)}</div>
      </div>
      <button class="go-close" title="Dismiss">✕</button>
    </div>`;
  gameOverlayEl.classList.remove('hidden');
  gameOverlayEl.querySelector('.go-close').onclick=()=>{
    gameOverlayEl.classList.add('hidden');
  };
}

/* Allow manual game set from chat with /playing command */
window._setManualGame=function(name){
  setCurrentGame(name||null);
};

function startGameDetection(){
  // Poll title every 8s (tab/window title changes when a game is running in another tab
  // are visible via BroadcastChannel — for same-page games we poll directly)
  gameDetectionInterval=setInterval(()=>{
    const detected=detectGameFromTitle();
    if(detected!==currentGame)setCurrentGame(detected);
  },8000);
  // Also detect immediately
  setCurrentGame(detectGameFromTitle());
}

/* ══════════════════════════════════════════════════════
   PRESENCE / ONLINE
══════════════════════════════════════════════════════ */
let presenceChannel=null;

function broadcastPresence(){
  if(!presenceChannel||!currentUserId||!currentProfile)return;
  presenceChannel.track({
    user_id:currentUserId,
    username:currentProfile.username||'?',
    avatar_url:currentProfile.avatar_url||null,
    game:currentGame||null,
    dnd:dndMode,
    online_at:new Date().toISOString(),
  });
}

function initPresence(){
  if(presenceChannel){try{presenceChannel.unsubscribe();}catch(e){}}
  presenceChannel=sb.channel('global_presence',{config:{presence:{key:currentUserId||'anon'}}});
  presenceChannel
    .on('presence',{event:'sync'},()=>{
      const state=presenceChannel.presenceState();
      presenceState={};
      Object.values(state).flat().forEach(u=>{
        if(u.user_id)presenceState[u.user_id]=u;
      });
      updateOnlineCount();
      updateOnlinePanel();
    })
    .subscribe(async status=>{
      if(status==='SUBSCRIBED')broadcastPresence();
    });
}

function updateOnlineCount(){
  const count=Object.keys(presenceState).length;
  const el=document.getElementById('onlineCount');
  if(el)el.textContent=count;
}

function updateOnlinePanel(){
  const panel=document.getElementById('online-panel-list');
  if(!panel)return;
  panel.innerHTML='';
  const users=Object.values(presenceState);
  if(!users.length){panel.innerHTML='<div style="padding:16px;font-size:13px;color:var(--dc-muted);text-align:center;">No one else online.</div>';return;}
  users.forEach(u=>{
    const item=document.createElement('div');item.className='online-item';
    const av=document.createElement('div');av.className='online-av';
    if(u.avatar_url){const img=document.createElement('img');img.src=u.avatar_url;av.appendChild(img);}
    else av.textContent=getInitials(u.username);
    const info=document.createElement('div');info.className='online-info';
    const name=document.createElement('span');name.className='online-name';name.textContent=u.username||'?';
    const dot=document.createElement('span');dot.className='online-dot';
    if(u.dnd)dot.style.background='#ef4444';
    info.appendChild(name);
    if(u.game){
      const gbadge=document.createElement('span');gbadge.className='online-game-badge';
      gbadge.textContent=(GAME_EMOJIS[u.game]||'🎮')+' '+u.game;
      info.appendChild(gbadge);
    }
    item.appendChild(av);item.appendChild(info);item.appendChild(dot);
    panel.appendChild(item);
  });
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
    }else{btn.textContent=s.icon||s.name[0].toUpperCase();}
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
      if(p.avatar_url){const img=document.createElement('img');img.src=p.avatar_url;av.appendChild(img);}
      else av.textContent=getInitials(p.username);
      const name=document.createElement('span');name.textContent=p.username||'User';
      const onlineUser=presenceState[oid];
      if(onlineUser){
        const dot=document.createElement('span');dot.className='dm-online-dot';
        if(onlineUser.game)dot.title='Playing '+onlineUser.game;
        item.appendChild(dot);
      }
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
  /* FIX: use left-side positioning to avoid overflow off right edge */
  menu.style.left=Math.max(4,Math.min(rect.left,window.innerWidth-menu.offsetWidth-8))+'px';
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
   SERVER MODAL (create/edit)
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
    /* FIX: cloneNode to clear old listeners before adding new one */
    const newPrev=prev.cloneNode(true);prev.replaceWith(newPrev);
    newPrev.addEventListener('click',()=>document.getElementById('sm-icon-file')?.click());
  }
  const fileInp=document.getElementById('sm-icon-file');
  if(fileInp){
    fileInp.value='';
    fileInp.onchange=e=>{
      const f=e.target.files[0];if(!f)return;
      if(f.size>1*1024*1024){showToast('❌ Image must be under 1 MB');e.target.value='';return;}
      pendingServerIconFile=f;
      const reader=new FileReader();
      reader.onload=ev=>{
        const p=document.getElementById('sm-icon-preview');if(!p)return;p.innerHTML='';
        const img=document.createElement('img');img.src=ev.target.result;p.appendChild(img);
        const ov2=document.createElement('div');ov2.className='icon-overlay';ov2.textContent='📷';p.appendChild(ov2);
      };
      reader.readAsDataURL(f);
    };
  }
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

/* ══════════════════════════════════════════════════════
   ADD CHANNEL MODAL
══════════════════════════════════════════════════════ */
function openAddChannelModal(server){
  document.getElementById('ch-name').value='';
  document.getElementById('ch-cat').value='TEXT CHANNELS';
  document.getElementById('ch-topic').value='';
  document.getElementById('ch-err').textContent='';
  const btn=document.getElementById('ch-create');
  /* FIX: clone to reset onclick */
  const newBtn=btn.cloneNode(true);btn.replaceWith(newBtn);
  newBtn.onclick=()=>createChannel(server);
  openModal('channelModal');
  document.getElementById('ch-name').focus();
}
async function createChannel(server){
  const name=document.getElementById('ch-name').value.trim();
  if(!name){document.getElementById('ch-err').textContent='Channel name required.';return;}
  const cat=document.getElementById('ch-cat').value.trim()||'TEXT CHANNELS';
  const topic=document.getElementById('ch-topic').value.trim();
  const btn=document.getElementById('ch-create');btn.disabled=true;btn.textContent='Creating…';
  const{error}=await sb.from('channels').insert({name:name.toLowerCase().replace(/\s+/g,'-'),server_id:server.id,category:cat,topic:topic||null,is_public:true});
  btn.disabled=false;btn.textContent='Create Channel';
  if(error){document.getElementById('ch-err').textContent=error.message;return;}
  closeModal('channelModal');
  const{data:s}=await sb.from('servers').select('*').eq('id',server.id).maybeSingle();
  if(s)buildSidebar(s);
}

/* ══════════════════════════════════════════════════════
   MODAL HELPERS
══════════════════════════════════════════════════════ */
function openModal(id){document.getElementById(id)?.classList.remove('hidden');}
function closeModal(id){document.getElementById(id)?.classList.add('hidden');}

document.getElementById('sm-cancel')?.addEventListener('click',()=>closeModal('serverModal'));
document.getElementById('jm-cancel')?.addEventListener('click',()=>closeModal('joinModal'));
document.getElementById('dm-cancel')?.addEventListener('click',()=>closeModal('dmModal'));
document.getElementById('ch-cancel')?.addEventListener('click',()=>closeModal('channelModal'));
document.querySelectorAll('.dc-modal-overlay').forEach(el=>{
  el.addEventListener('click',e=>{if(e.target===el)el.classList.add('hidden');});
});

/* ══════════════════════════════════════════════════════
   DM CREATION
══════════════════════════════════════════════════════ */
document.getElementById('dm-start')?.addEventListener('click',async()=>{
  if(!currentUserId){showToast('Sign in first');return;}
  const raw=document.getElementById('dm-target').value.trim();
  document.getElementById('dm-err').textContent='';
  if(!raw)return;
  /* FIX: support both @username and email lookup */
  let targetId=null;let targetProfile=null;
  const isEmail=raw.includes('@')&&!raw.startsWith('@');
  if(isEmail){
    const{data}=await sb.from('profiles').select('id,username,avatar_url').ilike('email',raw).maybeSingle();
    if(data){targetId=data.id;targetProfile=data;}
  } else {
    const uname=raw.replace(/^@/,'');
    const{data}=await sb.from('profiles').select('id,username,avatar_url').ilike('username',uname).maybeSingle();
    if(data){targetId=data.id;targetProfile=data;}
  }
  if(!targetId){document.getElementById('dm-err').textContent='User not found.';return;}
  if(targetId===currentUserId){document.getElementById('dm-err').textContent="You can't DM yourself.";return;}
  /* check existing DM */
  const{data:existing}=await sb.from('direct_messages').select('id')
    .or(`and(user_a.eq.${currentUserId},user_b.eq.${targetId}),and(user_a.eq.${targetId},user_b.eq.${currentUserId})`)
    .maybeSingle();
  if(existing){
    closeModal('dmModal');showingDMs=true;await buildSidebar(null);
    switchRoom({type:'dm',id:existing.id,name:targetProfile.username,icon:'@',serverId:null,serverName:'Direct Messages',otherId:targetId});
    return;
  }
  /* FIX: wrap in try/catch — supabase-js v2 .insert() crashes if you chain .catch() */
  try{
    const{data:dm,error}=await sb.from('direct_messages').insert({user_a:currentUserId,user_b:targetId}).select().single();
    if(error){document.getElementById('dm-err').textContent=error.message;return;}
    closeModal('dmModal');document.getElementById('dm-target').value='';
    showingDMs=true;await buildSidebar(null);
    switchRoom({type:'dm',id:dm.id,name:targetProfile.username,icon:'@',serverId:null,serverName:'Direct Messages',otherId:targetId});
  }catch(e){document.getElementById('dm-err').textContent=String(e?.message||e);}
});

/* ══════════════════════════════════════════════════════
   SWITCH ROOM
══════════════════════════════════════════════════════ */
async function switchRoom(room){
  activeRoom=room;
  /* update sidebar active states */
  document.querySelectorAll('.dc-ch-item').forEach(el=>el.classList.toggle('active',el.dataset.chId===room.id));
  document.querySelectorAll('.dc-dm-item').forEach(el=>el.classList.toggle('active',el.dataset.dmId===room.id));
  /* header */
  document.getElementById('hdrIcon').textContent=room.icon||'#';
  document.getElementById('hdrName').textContent=room.name||'';
  document.getElementById('hdrTopic').textContent=room.topic||'';
  document.getElementById('msgInput').placeholder=`Message ${room.icon==='@'?'@':'#'}${room.name}…`;
  /* reset state */
  msgElMap.clear();lastMsgUserId=null;lastMsgDate=null;historyExhausted=false;oldestMsgDate=null;
  replyingTo=null;document.getElementById('dc-reply-bar').classList.add('hidden');
  document.getElementById('dc-messages').innerHTML='';
  /* clear typing */
  Object.keys(typingTimeouts).forEach(k=>clearTimeout(typingTimeouts[k]));
  typingUsers={};typingTimeouts={};renderTyping();
  /* notify notification bridge */
  window._activeRoomForNotif=room;
  if(window.clearRoomUnread)clearRoomUnread(room);
  /* update slow mode */
  if(room.type==='channel'){
    const{data:ch}=await sb.from('channels').select('slow_mode_secs').eq('id',room.id).maybeSingle();
    slowModeSeconds=ch?.slow_mode_secs||0;
  } else { slowModeSeconds=0; }
  /* subscribe realtime */
  await subscribeRoom(room);
  /* load messages */
  await loadMessages(room);
  /* mark read */
  markRead(room);
  /* close mobile sidebar */
  document.getElementById('dcSidebar')?.classList.remove('mobile-open');
}

/* ══════════════════════════════════════════════════════
   MARK READ / UNREAD
══════════════════════════════════════════════════════ */
async function markRead(room){
  if(!currentUserId)return;
  const key=getRoomKey(room);
  unreadCounts[key]=0;
  try{
    await sb.from('last_read').upsert({user_id:currentUserId,room_type:room.type,room_id:room.id,last_read_at:new Date().toISOString()},{onConflict:'user_id,room_type,room_id'});
  }catch(e){}
}

/* ══════════════════════════════════════════════════════
   REALTIME SUBSCRIPTION
══════════════════════════════════════════════════════ */
async function subscribeRoom(room){
  if(realtimeChannel){try{await sb.removeChannel(realtimeChannel);}catch(e){}}
  if(typingChannel){try{await sb.removeChannel(typingChannel);}catch(e){}}
  realtimeChannel=null;typingChannel=null;
  const table=room.type==='dm'?'dm_messages':'messages';
  const filter=room.type==='public'
    ?'channel_id=is.null AND dm_id=is.null AND server_id=is.null AND thread_id=is.null AND deleted_at=is.null'
    :room.type==='channel'
      ?`channel_id=eq.${room.id} AND thread_id=is.null AND deleted_at=is.null`
      :`dm_id=eq.${room.id}`;

  const channel=sb.channel('room_'+getRoomKey(room))
    .on('postgres_changes',{event:'INSERT',schema:'public',table,filter:room.type==='dm'?`dm_id=eq.${room.id}`:undefined},async payload=>{
      if(getRoomKey(activeRoom)!==getRoomKey(room))return;
      const msg=payload.new;
      /* FIX: ignore messages from the current send (already rendered optimistically) */
      if(msg.user_id===currentUserId&&isSending)return;
      const p=await getProfile(msg.user_id);
      const msgData={...msg,username:p.username,avatar_url:p.avatar_url,role:p.role,tag:p.tag};
      renderMessage(msgData,true);
      scrollBottom();
      if(!dndMode&&msg.user_id!==currentUserId){
        const notif=document.getElementById('notifSound');
        if(notif){notif.currentTime=0;notif.play().catch(()=>{});}
        /* increment unread for other rooms */
        const roomKey=getRoomKey(room);
        const serverKey=room.serverId?'server:'+room.serverId:null;
        if(serverKey&&roomKey!==getRoomKey(activeRoom)){
          unreadCounts[serverKey]=(unreadCounts[serverKey]||0)+1;
          unreadCounts[roomKey]=(unreadCounts[roomKey]||0)+1;
        }
      }
    })
    .on('postgres_changes',{event:'DELETE',schema:'public',table:'messages'},payload=>{
      const el=msgElMap.get(payload.old.id);if(el)el.remove();
    })
    .on('postgres_changes',{event:'UPDATE',schema:'public',table:'messages'},async payload=>{
      const msg=payload.new;const el=msgElMap.get(msg.id);
      if(el&&msg.deleted_at)el.remove();
      else if(el&&msg.thread_reply_count!=null){
        const tc=el.querySelector('.thread-reply-count');
        if(tc)tc.textContent=msg.thread_reply_count+' repl'+(msg.thread_reply_count===1?'y':'ies');
      }
    })
    .subscribe();
  realtimeChannel=channel;

  /* Typing indicator channel */
  const tchannel=sb.channel('typing_'+getRoomKey(room),{config:{broadcast:{self:false}}});
  tchannel
    .on('broadcast',{event:'typing'},({payload})=>{
      if(!payload?.user_id||payload.user_id===currentUserId)return;
      typingUsers[payload.user_id]=payload.username||'Someone';
      clearTimeout(typingTimeouts[payload.user_id]);
      /* FIX: capture user_id in closure to avoid stale variable */
      const uid=payload.user_id;
      typingTimeouts[uid]=setTimeout(()=>{delete typingUsers[uid];delete typingTimeouts[uid];renderTyping();},3000);
      renderTyping();
    })
    .subscribe();
  typingChannel=tchannel;
}

/* ══════════════════════════════════════════════════════
   LOAD MESSAGES
══════════════════════════════════════════════════════ */
const MSG_PAGE=50;

async function loadMessages(room,before=null){
  const wrap=document.getElementById('dc-messages');
  const isInitial=!before;
  if(isInitial)wrap.innerHTML='';

  let query;
  if(room.type==='dm'){
    query=sb.from('dm_messages').select('*').eq('dm_id',room.id).order('created_at',{ascending:false}).limit(MSG_PAGE);
    if(before)query=query.lt('created_at',before);
  } else if(room.type==='public'){
    query=sb.from('messages').select('*').is('channel_id',null).is('dm_id',null).is('server_id',null).is('thread_id',null).is('deleted_at',null).order('created_at',{ascending:false}).limit(MSG_PAGE);
    if(before)query=query.lt('created_at',before);
  } else {
    query=sb.from('messages').select('*').eq('channel_id',room.id).is('thread_id',null).is('deleted_at',null).order('created_at',{ascending:false}).limit(MSG_PAGE);
    if(before)query=query.lt('created_at',before);
  }

  const{data,error}=await query;
  if(error||!data){if(isInitial)wrap.innerHTML='<div class="dc-welcome"><div class="dc-welcome-icon">💬</div><h2>No messages yet</h2><p>Be the first to say something!</p></div>';return;}

  if(data.length<MSG_PAGE)historyExhausted=true;
  if(!data.length){if(isInitial)wrap.innerHTML='<div class="dc-welcome"><div class="dc-welcome-icon">💬</div><h2>No messages yet</h2><p>Be the first to say something!</p></div>';return;}

  /* reverse to chronological */
  const msgs=[...data].reverse();
  if(msgs.length)oldestMsgDate=msgs[0].created_at;

  /* load all profiles in batch */
  const uids=[...new Set(msgs.map(m=>m.user_id).filter(Boolean))];
  await Promise.all(uids.map(id=>getProfile(id)));

  const scrollPrev=wrap.scrollHeight-wrap.scrollTop;
  lastMsgUserId=null;lastMsgDate=null;
  msgs.forEach(m=>{
    const p=profileCache[m.user_id]||{username:m.username||'?',avatar_url:m.avatar_url,role:m.role,tag:m.tag};
    renderMessage({...m,username:p.username||m.username,avatar_url:p.avatar_url||m.avatar_url,role:p.role||m.role,tag:p.tag||m.tag},false,before!=null);
  });
  if(before){wrap.scrollTop=wrap.scrollHeight-scrollPrev;}
  else{scrollBottom();}

  /* load reactions */
  if(room.type!=='dm'){
    const ids=msgs.map(m=>m.id).filter(Boolean);
    if(ids.length){
      const{data:rxns}=await sb.from('reactions').select('*').in('message_id',ids);
      (rxns||[]).forEach(r=>applyReaction(r,false));
    }
  }
}

/* ══════════════════════════════════════════════════════
   RENDER MESSAGE
══════════════════════════════════════════════════════ */
function renderMessage(msg,isNew=false,prepend=false){
  if(msg.deleted_at&&!isAdminOrMod(currentProfile))return;
  const wrap=document.getElementById('dc-messages');
  if(msgElMap.has(msg.id))return; /* FIX: deduplicate */

  const d=parseTS(msg.created_at);
  const dateStr=formatDate(msg.created_at);
  const isMine=msg.user_id===currentUserId;
  const isSystem=!msg.user_id;

  /* Date divider */
  if(dateStr!==lastMsgDate){
    const div=document.createElement('div');div.className='dc-date-divider';
    div.innerHTML=`<span>${dateStr}</span>`;
    if(prepend)wrap.insertBefore(div,wrap.firstChild);
    else wrap.appendChild(div);
    lastMsgDate=dateStr;
  }

  const isContinuation=msg.user_id&&msg.user_id===lastMsgUserId&&!msg.reply_to_id&&!msg.is_thread_root;
  lastMsgUserId=msg.user_id||null;

  const el=document.createElement('div');
  el.className='dc-msg'+(isContinuation?' continuation':'')+(isSystem?' system-msg':'')+(msg.deleted_at?' msg-deleted':'');
  el.dataset.msgId=msg.id;
  el.dataset.userId=msg.user_id||'';

  /* Reply preview */
  let replyHtml='';
  if(msg.reply_to_id){
    replyHtml=`<div class="dc-reply-preview">↩ <strong>${esc(msg.reply_to_username||'?')}</strong>: ${esc((msg.reply_to_text||'').slice(0,80))}</div>`;
  }

  /* Message text with markdown */
  let bodyHtml='';
  if(msg.deleted_at){
    bodyHtml='<em style="color:var(--dc-muted);font-size:13px;">This message was deleted.</em>';
  } else {
    const rawText=applyShortcodes(filterProfanity(msg.text||''));
    bodyHtml=renderMarkdown(rawText);
    /* URL → link */
    bodyHtml=bodyHtml.replace(/(https?:\/\/[^\s<>"]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>');
  }

  /* File attachment */
  let fileHtml='';
  if(msg.file_url&&!msg.deleted_at){
    if(isImageUrl(msg.file_url)){
      fileHtml=`<div class="dc-attachment"><img src="${esc(msg.file_url)}" class="dc-img-attachment" loading="lazy" alt="attachment"/></div>`;
    } else {
      const fname=msg.file_url.split('/').pop().split('?')[0];
      fileHtml=`<div class="dc-attachment"><a href="${esc(msg.file_url)}" target="_blank" rel="noopener" class="dc-file-link">📎 ${esc(fname)}</a></div>`;
    }
  }

  /* Thread info */
  let threadHtml='';
  if(msg.is_thread_root&&msg.thread_reply_count>0){
    threadHtml=`<div class="dc-thread-btn" data-msg-id="${msg.id}"><span class="thread-reply-count">${msg.thread_reply_count} repl${msg.thread_reply_count===1?'y':'ies'}</span> <span style="font-size:11px;color:var(--dc-muted);">View thread →</span></div>`;
  }

  if(isContinuation&&!msg.reply_to_id){
    el.innerHTML=`
      ${replyHtml}
      <div class="dc-msg-cont-wrapper">
        <span class="dc-cont-time">${formatTime(msg.created_at)}</span>
        <div class="dc-msg-body">${bodyHtml}${fileHtml}</div>
      </div>
      <div class="dc-reactions" data-msg-id="${msg.id}"></div>
      ${threadHtml}`;
  } else {
    const roleColor={admin:'#ef4444',mod:'#f59e0b',user:'var(--a)'}[msg.role]||'var(--a)';
    const tagHtml=msg.tag?`<span class="dc-msg-tag">#${esc(msg.tag)}</span>`:'';
    const roleHtml=msg.role&&msg.role!=='user'?`<span class="dc-msg-role" style="color:${roleColor};">${esc(msg.role.toUpperCase())}</span>`:'';
    const gameBadge=presenceState[msg.user_id]?.game?`<span class="dc-game-badge" title="Playing ${esc(presenceState[msg.user_id].game)}">${GAME_EMOJIS[presenceState[msg.user_id].game]||'🎮'}</span>`:'';
    el.innerHTML=`
      ${replyHtml}
      <div class="dc-msg-row">
        <div class="dc-msg-avatar" data-user-id="${esc(msg.user_id||'')}"></div>
        <div class="dc-msg-main">
          <div class="dc-msg-header">
            <span class="dc-msg-author" data-user-id="${esc(msg.user_id||'')}">${esc(msg.username||'?')}</span>
            ${roleHtml}${tagHtml}${gameBadge}
            <span class="dc-msg-time">${formatTime(msg.created_at)}</span>
          </div>
          <div class="dc-msg-body">${bodyHtml}${fileHtml}</div>
        </div>
      </div>
      <div class="dc-reactions" data-msg-id="${msg.id}"></div>
      ${threadHtml}`;
    /* avatar */
    const avWrap=el.querySelector('.dc-msg-avatar');
    if(avWrap){
      const p=profileCache[msg.user_id]||{username:msg.username,avatar_url:msg.avatar_url};
      avWrap.appendChild(makeAvatar(p,38));
    }
  }

  /* Image lightbox */
  el.querySelectorAll('.dc-img-attachment').forEach(img=>{
    img.addEventListener('click',()=>{
      document.getElementById('lightbox-img').src=img.src;
      document.getElementById('lightbox').classList.remove('hidden');
    });
  });

  /* Thread button */
  el.querySelector('.dc-thread-btn')?.addEventListener('click',()=>openThread(msg.id));

  /* Context menu */
  el.addEventListener('contextmenu',e=>{
    e.preventDefault();
    ctxTargetMsg=msg;
    showCtxMenu(e.clientX,e.clientY,msg,isMine);
  });

  /* Profile popup */
  el.querySelectorAll('[data-user-id]').forEach(node=>{
    if(!node.dataset.userId)return;
    node.style.cursor='pointer';
    node.addEventListener('click',e=>{e.stopPropagation();showProfilePopup(node.dataset.userId,e.clientX,e.clientY);});
  });

  if(prepend)wrap.insertBefore(el,wrap.firstChild);
  else wrap.appendChild(el);
  msgElMap.set(msg.id,el);
}

/* Simple markdown renderer */
function renderMarkdown(text){
  if(!text)return'';
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/~~(.+?)~~/g,'<s>$1</s>')
    .replace(/\n/g,'<br>');
}

/* ══════════════════════════════════════════════════════
   REACTIONS
══════════════════════════════════════════════════════ */
function applyReaction(rxn,isNew=true){
  const msgEl=msgElMap.get(rxn.message_id);if(!msgEl)return;
  const container=msgEl.querySelector(`.dc-reactions[data-msg-id="${rxn.message_id}"]`);if(!container)return;
  /* FIX: find existing chip by emoji, avoid duplicates */
  let chip=container.querySelector(`.rxn-chip[data-emoji="${CSS.escape(rxn.emoji)}"]`);
  if(!chip){
    chip=document.createElement('button');chip.className='rxn-chip';chip.dataset.emoji=rxn.emoji;
    chip.dataset.count='0';chip.dataset.mine='false';
    chip.innerHTML=`<span>${rxn.emoji}</span><span class="rxn-count">0</span>`;
    chip.addEventListener('click',()=>toggleReaction(rxn.message_id,rxn.emoji));
    container.appendChild(chip);
  }
  const count=parseInt(chip.dataset.count||'0')+1;
  chip.dataset.count=String(count);
  chip.querySelector('.rxn-count').textContent=count;
  if(rxn.user_id===currentUserId){chip.dataset.mine='true';chip.classList.add('mine');}
}

async function toggleReaction(messageId,emoji){
  if(!currentUserId){showToast('Sign in to react');return;}
  /* FIX: check if already reacted */
  const{data:existing}=await sb.from('reactions').select('id').eq('message_id',messageId).eq('user_id',currentUserId).eq('emoji',emoji).maybeSingle();
  if(existing){
    await sb.from('reactions').delete().eq('id',existing.id);
    /* remove from UI */
    const msgEl=msgElMap.get(messageId);
    const chip=msgEl?.querySelector(`.rxn-chip[data-emoji="${CSS.escape(emoji)}"]`);
    if(chip){
      const c=parseInt(chip.dataset.count||'1')-1;
      if(c<=0)chip.remove();
      else{chip.dataset.count=String(c);chip.querySelector('.rxn-count').textContent=c;chip.classList.remove('mine');chip.dataset.mine='false';}
    }
  } else {
    const{error}=await sb.from('reactions').insert({message_id:messageId,user_id:currentUserId,emoji});
    if(!error)applyReaction({message_id:messageId,user_id:currentUserId,emoji},true);
  }
  /* hide picker */
  document.getElementById('reaction-picker')?.classList.add('hidden');
}

/* ══════════════════════════════════════════════════════
   CONTEXT MENU
══════════════════════════════════════════════════════ */
function showCtxMenu(x,y,msg,isMine){
  const menu=document.getElementById('ctx-menu');
  document.getElementById('ctx-delete').style.display=isMine||isAdminOrMod(currentProfile)?'':'none';
  menu.classList.remove('hidden');
  /* FIX: constrain within viewport */
  const mw=200,mh=200;
  menu.style.left=Math.min(x,window.innerWidth-mw-8)+'px';
  menu.style.top=Math.min(y,window.innerHeight-mh-8)+'px';
}
document.addEventListener('click',()=>{
  document.getElementById('ctx-menu')?.classList.add('hidden');
  document.getElementById('reaction-picker')?.classList.add('hidden');
});
document.getElementById('ctx-reply')?.addEventListener('click',()=>{
  if(!ctxTargetMsg)return;
  replyingTo=ctxTargetMsg;
  document.getElementById('dc-reply-bar').classList.remove('hidden');
  document.getElementById('reply-author').textContent=ctxTargetMsg.username||'?';
  document.getElementById('reply-preview').textContent=(ctxTargetMsg.text||'').slice(0,60);
  document.getElementById('msgInput').focus();
});
document.getElementById('ctx-react')?.addEventListener('click',e=>{
  if(!ctxTargetMsg)return;
  const picker=document.getElementById('reaction-picker');
  picker.innerHTML='';
  QUICK_EMOJIS.forEach(emoji=>{
    const btn=document.createElement('button');btn.className='rxn-pick-btn';btn.textContent=emoji;
    btn.onclick=e2=>{e2.stopPropagation();toggleReaction(ctxTargetMsg.id,emoji);};
    picker.appendChild(btn);
  });
  picker.classList.remove('hidden');
  /* FIX: use ctx-menu position, ensure it doesn't overflow */
  const rect=document.getElementById('ctx-menu').getBoundingClientRect();
  picker.style.left=Math.min(rect.left,window.innerWidth-250)+'px';
  picker.style.top=rect.bottom+4+'px';
  picker.style.zIndex='10001';
});
document.getElementById('ctx-thread')?.addEventListener('click',()=>{if(ctxTargetMsg)openThread(ctxTargetMsg.id);});
document.getElementById('ctx-pin')?.addEventListener('click',async()=>{
  if(!ctxTargetMsg||!isAdminOrMod(currentProfile))return;
  await sb.from('pinned_messages').insert({channel_id:activeRoom.id!=='public'?activeRoom.id:null,server_id:activeRoom.serverId||null,message_id:ctxTargetMsg.id,pinned_by:currentUserId});
  showToast('📌 Pinned!');
});
document.getElementById('ctx-copy')?.addEventListener('click',()=>{
  if(ctxTargetMsg)navigator.clipboard.writeText(ctxTargetMsg.text||'').then(()=>showToast('📋 Copied'));
});
document.getElementById('ctx-delete')?.addEventListener('click',async()=>{
  if(!ctxTargetMsg)return;
  if(!confirm('Delete this message?'))return;
  if(activeRoom.type==='dm'){
    await sb.from('dm_messages').delete().eq('id',ctxTargetMsg.id);
  } else {
    await sb.from('messages').update({deleted_at:new Date().toISOString()}).eq('id',ctxTargetMsg.id);
  }
  const el=msgElMap.get(ctxTargetMsg.id);if(el)el.remove();
  msgElMap.delete(ctxTargetMsg.id);
});
document.getElementById('reply-cancel-btn')?.addEventListener('click',()=>{
  replyingTo=null;document.getElementById('dc-reply-bar').classList.add('hidden');
});

/* ══════════════════════════════════════════════════════
   PINS PANEL
══════════════════════════════════════════════════════ */
document.getElementById('btnPins')?.addEventListener('click',()=>{
  const panel=document.getElementById('pins-panel');
  const isHidden=panel.classList.contains('hidden');
  closeAllPanels();
  if(isHidden){panel.classList.remove('hidden');loadPins();}
});
document.getElementById('pins-close')?.addEventListener('click',()=>document.getElementById('pins-panel').classList.add('hidden'));

async function loadPins(){
  const list=document.getElementById('pins-list');if(!list)return;
  list.innerHTML='<div style="padding:16px;font-size:13px;color:var(--dc-muted);">Loading…</div>';
  let q=sb.from('pinned_messages').select('*,messages(id,text,username,created_at)');
  if(activeRoom.type==='channel')q=q.eq('channel_id',activeRoom.id);
  else if(activeRoom.serverId)q=q.eq('server_id',activeRoom.serverId);
  else q=q.is('channel_id',null).is('server_id',null);
  q=q.order('created_at',{ascending:false});
  const{data}=await q;
  if(!data?.length){list.innerHTML='<div style="padding:16px;font-size:13px;color:var(--dc-muted);text-align:center;">No pinned messages.</div>';return;}
  list.innerHTML='';
  data.forEach(pin=>{
    const msg=pin.messages;if(!msg)return;
    const item=document.createElement('div');item.className='pins-item';
    item.innerHTML=`<div class="pins-meta"><strong>${esc(msg.username||'?')}</strong> · ${formatTime(msg.created_at)}</div><div class="pins-text">${esc((msg.text||'').slice(0,200))}</div>`;
    list.appendChild(item);
  });
}

/* ══════════════════════════════════════════════════════
   MEMBERS PANEL
══════════════════════════════════════════════════════ */
document.getElementById('btnMembers')?.addEventListener('click',()=>{
  const panel=document.getElementById('members-panel');
  const isHidden=panel.classList.contains('hidden');
  closeAllPanels();
  if(isHidden){panel.classList.remove('hidden');loadMembers();}
});
document.getElementById('members-close')?.addEventListener('click',()=>document.getElementById('members-panel').classList.add('hidden'));

async function loadMembers(){
  const list=document.getElementById('members-list');if(!list)return;
  list.innerHTML='<div style="padding:16px;font-size:13px;color:var(--dc-muted);">Loading…</div>';
  let uids=[];
  if(activeRoom.serverId){
    const{data}=await sb.from('server_members').select('user_id').eq('server_id',activeRoom.serverId);
    uids=(data||[]).map(r=>r.user_id);
  } else {
    uids=Object.keys(presenceState);
  }
  if(!uids.length){list.innerHTML='<div style="padding:16px;font-size:13px;color:var(--dc-muted);text-align:center;">No members found.</div>';return;}
  const profiles=await Promise.all(uids.map(id=>getProfile(id)));
  list.innerHTML='';
  profiles.forEach((p,i)=>{
    const uid=uids[i];
    const isOnline=!!presenceState[uid];
    const item=document.createElement('div');item.className='member-item';
    const av=document.createElement('div');av.className='mi-av';
    if(p.avatar_url){const img=document.createElement('img');img.src=p.avatar_url;av.appendChild(img);}else av.textContent=getInitials(p.username);
    const info=document.createElement('div');info.style.cssText='flex:1;min-width:0;';
    info.innerHTML=`<div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(p.username||'?')}</div>`;
    if(presenceState[uid]?.game){
      info.innerHTML+=`<div style="font-size:11px;color:var(--dc-muted);">${GAME_EMOJIS[presenceState[uid].game]||'🎮'} ${esc(presenceState[uid].game)}</div>`;
    }
    const dot=document.createElement('span');dot.className='mi-status'+(isOnline?' online':'');
    item.appendChild(av);item.appendChild(info);item.appendChild(dot);
    item.addEventListener('click',()=>showProfilePopup(uid,item.getBoundingClientRect().right+8,item.getBoundingClientRect().top));
    list.appendChild(item);
  });
}

/* ══════════════════════════════════════════════════════
   ONLINE PANEL (pill click)
══════════════════════════════════════════════════════ */
document.getElementById('onlinePill')?.addEventListener('click',()=>{
  let panel=document.getElementById('online-panel');
  if(!panel){
    panel=document.createElement('div');panel.id='online-panel';panel.className='online-panel hidden';
    panel.innerHTML=`<div class="online-header"><span>🟢 Online</span><button id="online-close">✕</button></div><div id="online-panel-list" class="online-list"></div>`;
    document.getElementById('dcMain').appendChild(panel);
    document.getElementById('online-close').onclick=()=>panel.classList.add('hidden');
  }
  const isHidden=panel.classList.contains('hidden');
  closeAllPanels();
  if(isHidden){panel.classList.remove('hidden');updateOnlinePanel();}
});

/* ══════════════════════════════════════════════════════
   PROFILE POPUP
══════════════════════════════════════════════════════ */
async function showProfilePopup(userId,x,y){
  if(!userId)return;
  const popup=document.getElementById('profile-popup');
  const p=await getProfile(userId);
  const roleColor={admin:'#ef4444',mod:'#f59e0b',user:'var(--a)'}[p.role]||'var(--a)';
  document.getElementById('pp-banner').style.background=roleColor;
  const avEl=document.getElementById('pp-avatar');avEl.innerHTML='';avEl.appendChild(makeAvatar(p,52));
  document.getElementById('pp-name').textContent=p.username||'?';
  document.getElementById('pp-tag').textContent=p.tag?'#'+p.tag:'';
  document.getElementById('pp-role').textContent=p.role||'user';
  document.getElementById('pp-role').style.background=roleColor;
  document.getElementById('pp-email').textContent=p.email||'';
  const dmBtn=document.getElementById('pp-dm-btn');
  /* game status */
  const gameInfo=presenceState[userId];
  let gameHtml=popup.querySelector('.pp-game');
  if(!gameHtml){gameHtml=document.createElement('div');gameHtml.className='pp-game';gameHtml.style.cssText='font-size:12px;color:var(--dc-muted);margin-bottom:8px;';popup.querySelector('.pp-body').insertBefore(gameHtml,dmBtn);}
  gameHtml.textContent=gameInfo?.game?`${GAME_EMOJIS[gameInfo.game]||'🎮'} Playing ${gameInfo.game}`:'';
  dmBtn.style.display=userId===currentUserId?'none':'';
  dmBtn.onclick=()=>{
    popup.classList.add('hidden');
    document.getElementById('dm-target').value=p.email||p.username||'';
    document.getElementById('dm-start').click();
  };
  popup.classList.remove('hidden');
  /* FIX: constrain popup within viewport */
  const pw=280,ph=300;
  popup.style.left=Math.min(x,window.innerWidth-pw-8)+'px';
  popup.style.top=Math.max(8,Math.min(y,window.innerHeight-ph-8))+'px';
  setTimeout(()=>document.addEventListener('click',()=>popup.classList.add('hidden'),{once:true}),10);
}

/* ══════════════════════════════════════════════════════
   THREAD PANEL
══════════════════════════════════════════════════════ */
async function openThread(rootMsgId){
  activeThreadId=rootMsgId;
  const panel=document.getElementById('thread-panel');
  panel.classList.remove('hidden');
  document.getElementById('thread-root-msg').innerHTML='';
  document.getElementById('thread-messages').innerHTML='';
  /* load root */
  const{data:root}=await sb.from('messages').select('*').eq('id',rootMsgId).maybeSingle();
  if(root){
    const p=await getProfile(root.user_id);
    const el=document.createElement('div');el.style.cssText='padding:12px;border-bottom:1px solid var(--dc-sep);font-size:14px;';
    el.innerHTML=`<strong>${esc(p.username||'?')}</strong>: ${renderMarkdown(root.text||'')}`;
    document.getElementById('thread-root-msg').appendChild(el);
  }
  /* load replies */
  const{data:replies}=await sb.from('messages').select('*').eq('thread_id',rootMsgId).is('deleted_at',null).order('created_at',{ascending:true});
  const tmsgs=document.getElementById('thread-messages');
  if(!replies?.length){tmsgs.innerHTML='<div style="padding:16px;font-size:13px;color:var(--dc-muted);text-align:center;">No replies yet.</div>';}
  else{
    const uids=[...new Set(replies.map(m=>m.user_id).filter(Boolean))];
    await Promise.all(uids.map(id=>getProfile(id)));
    tmsgs.innerHTML='';
    replies.forEach(m=>{
      const p=profileCache[m.user_id]||{username:m.username||'?',avatar_url:m.avatar_url};
      const item=document.createElement('div');item.style.cssText='display:flex;gap:10px;padding:8px 12px;';
      const av=makeAvatar(p,30);av.style.flexShrink='0';
      const body=document.createElement('div');
      body.innerHTML=`<div style="font-size:12px;"><strong>${esc(p.username||'?')}</strong> <span style="color:var(--dc-muted);font-size:11px;">${formatTime(m.created_at)}</span></div><div style="font-size:14px;">${renderMarkdown(m.text||'')}</div>`;
      item.appendChild(av);item.appendChild(body);
      tmsgs.appendChild(item);
    });
    tmsgs.scrollTop=tmsgs.scrollHeight;
  }
}
document.getElementById('thread-close')?.addEventListener('click',()=>{
  document.getElementById('thread-panel').classList.add('hidden');activeThreadId=null;
});
document.getElementById('thread-send')?.addEventListener('click',sendThreadReply);
document.getElementById('thread-input')?.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendThreadReply();}
});
async function sendThreadReply(){
  if(!currentUserId){showToast('Sign in first');return;}
  if(!activeThreadId)return;
  const inp=document.getElementById('thread-input');
  const text=inp.value.trim();if(!text)return;
  inp.value='';
  const p=currentProfile||{};
  const{error}=await sb.from('messages').insert({
    text,user_id:currentUserId,username:p.username,avatar_url:p.avatar_url,role:p.role,tag:p.tag,
    thread_id:activeThreadId,
    channel_id:activeRoom.type==='channel'?activeRoom.id:null,
    server_id:activeRoom.serverId||null,
  });
  if(error){showToast('❌ '+error.message);inp.value=text;return;}
  /* bump reply count */
  await sb.from('messages').update({thread_reply_count:((await sb.from('messages').select('thread_reply_count').eq('id',activeThreadId).single()).data?.thread_reply_count||0)+1}).eq('id',activeThreadId);
  openThread(activeThreadId);
}

/* ══════════════════════════════════════════════════════
   SEND MESSAGE
══════════════════════════════════════════════════════ */
async function sendMessage(){
  if(!currentUserId){showToast('Sign in to chat');return;}
  const inp=document.getElementById('msgInput');
  let text=inp.value.trim();
  if(!text&&!pendingFile)return;
  if(isSending)return;

  /* FIX: live mute check from DB */
  if(await isMutedFresh(currentUserId)){
    const p=await getProfile(currentUserId,true);
    showToast(`🔇 You are muted for ${muteExpiryText(p)}`);return;
  }

  /* Slow mode */
  if(slowModeSeconds>0){
    const now=Date.now();
    const remaining=Math.ceil((lastSentTime+slowModeSeconds*1000-now)/1000);
    if(remaining>0){showToast(`⏱ Slow mode: wait ${remaining}s`);return;}
  }

  /* Slash commands */
  if(text.startsWith('/')){
    const handled=await handleSlashCommand(text);if(handled){inp.value='';return;}
  }

  isSending=true;
  inp.disabled=true;
  document.getElementById('sendBtn').disabled=true;

  let fileUrl=null;
  if(pendingFile){
    const ext=pendingFile.name.split('.').pop();
    const path=`${currentUserId}/${Date.now()}.${ext}`;
    const{error:upErr}=await sb.storage.from('chat-uploads').upload(path,pendingFile,{cacheControl:'3600',upsert:false});
    if(upErr){showToast('❌ Upload failed: '+upErr.message);isSending=false;inp.disabled=false;document.getElementById('sendBtn').disabled=false;return;}
    const{data:urlData}=sb.storage.from('chat-uploads').getPublicUrl(path);
    fileUrl=urlData?.publicUrl||null;
    pendingFile=null;
    document.getElementById('dc-upload-preview').classList.add('hidden');
  }

  const replyId=replyingTo?.id||null;
  const replyUsername=replyingTo?.username||null;
  const replyText=replyingTo?.text||null;
  replyingTo=null;document.getElementById('dc-reply-bar').classList.add('hidden');
  inp.value='';autoGrow(inp);

  const p=currentProfile||{};
  lastSentTime=Date.now();

  try{
    if(activeRoom.type==='dm'){
      const{error}=await sb.from('dm_messages').insert({
        dm_id:activeRoom.id,user_id:currentUserId,
        username:p.username,avatar_url:p.avatar_url,tag:p.tag,role:p.role,
        text,file_url:fileUrl,
        reply_to_id:replyId,reply_to_username:replyUsername,reply_to_text:replyText,
      });
      if(error)throw error;
      await sb.from('direct_messages').update({updated_at:new Date().toISOString()}).eq('id',activeRoom.id);
    } else {
      const{data,error}=await sb.from('messages').insert({
        text,user_id:currentUserId,
        username:p.username,avatar_url:p.avatar_url,role:p.role,tag:p.tag,
        channel_id:activeRoom.type==='channel'?activeRoom.id:null,
        server_id:activeRoom.serverId||null,
        file_url:fileUrl,
        reply_to_id:replyId,reply_to_username:replyUsername,reply_to_text:replyText,
        is_thread_root:false,thread_reply_count:0,
      }).select().single();
      if(error)throw error;
      /* optimistic render */
      if(data)renderMessage({...data,...{username:p.username,avatar_url:p.avatar_url,role:p.role,tag:p.tag}},true);
      scrollBottom();
    }
  }catch(e){
    showToast('❌ '+(e?.message||'Failed to send'));
    inp.value=text;
  }finally{
    isSending=false;inp.disabled=false;document.getElementById('sendBtn').disabled=false;inp.focus();
  }
}

/* ══════════════════════════════════════════════════════
   SLASH COMMANDS
══════════════════════════════════════════════════════ */
const SLASH_CMDS=[
  {cmd:'/me',desc:'Emote (italic action)'},
  {cmd:'/shrug',desc:'¯\\_(ツ)_/¯'},
  {cmd:'/tableflip',desc:'(╯°□°）╯︵ ┻━┻'},
  {cmd:'/unflip',desc:'┬─┬ ノ( ゜-゜ノ)'},
  {cmd:'/lenny',desc:'( ͡° ͜ʖ ͡°)'},
  {cmd:'/playing',desc:'Set your current game (e.g. /playing Minecraft)'},
  {cmd:'/clear',desc:'Clear chat view (local only)'},
  {cmd:'/mute',desc:'[mod] Mute user: /mute @user 10m'},
  {cmd:'/ban',desc:'[mod] Ban user: /ban @user'},
  {cmd:'/unban',desc:'[mod] Unban: /unban @user'},
];

async function handleSlashCommand(text){
  const [cmd,...rest]=text.split(' ');
  const arg=rest.join(' ').trim();
  switch(cmd){
    case '/me':
      if(arg)await doSend('_'+arg+'_');return true;
    case '/shrug':
      await doSend('¯\\_(ツ)_/¯');return true;
    case '/tableflip':
      await doSend('(╯°□°）╯︵ ┻━┻');return true;
    case '/unflip':
      await doSend('┬─┬ ノ( ゜-゜ノ)');return true;
    case '/lenny':
      await doSend('( ͡° ͜ʖ ͡°)');return true;
    case '/playing':
      window._setManualGame(arg||null);
      showToast(arg?'🎮 Now playing: '+arg:'🎮 Game cleared');return true;
    case '/clear':
      document.getElementById('dc-messages').innerHTML='';msgElMap.clear();lastMsgUserId=null;lastMsgDate=null;return true;
    case '/mute':
      if(!isAdminOrMod(currentProfile)){showToast('No permission');return true;}
      await modAction('mute',arg);return true;
    case '/ban':
      if(!isAdminOrMod(currentProfile)){showToast('No permission');return true;}
      await modAction('ban',arg);return true;
    case '/unban':
      if(!isAdminOrMod(currentProfile)){showToast('No permission');return true;}
      await modAction('unban',arg);return true;
    default:
      return false;
  }
}

async function doSend(text){
  const p=currentProfile||{};
  await sb.from('messages').insert({
    text,user_id:currentUserId,username:p.username,avatar_url:p.avatar_url,role:p.role,tag:p.tag,
    channel_id:activeRoom.type==='channel'?activeRoom.id:null,
    server_id:activeRoom.serverId||null,
  });
}

async function modAction(action,arg){
  const uname=arg.replace(/^@/,'');
  const{data:target}=await sb.from('profiles').select('id,username').ilike('username',uname).maybeSingle();
  if(!target){showToast('User not found: '+uname);return;}
  if(action==='ban'){
    await sb.from('profiles').update({banned:true}).eq('id',target.id);
    await logAutomod(target.id,target.username,'ban','mod action');
    showToast('🚫 Banned '+target.username);
  } else if(action==='unban'){
    await sb.from('profiles').update({banned:false}).eq('id',target.id);
    showToast('✅ Unbanned '+target.username);
  } else if(action==='mute'){
    const mins=parseInt(arg.match(/(\d+)m?$/)?.[1]||'10');
    const until=new Date(Date.now()+mins*60000).toISOString();
    await sb.from('profiles').update({muted_until:until}).eq('id',target.id);
    await logAutomod(target.id,target.username,'mute',`${mins}m mute`,until);
    delete profileCache[target.id];
    showToast(`🔇 Muted ${target.username} for ${mins}m`);
  }
}

/* ══════════════════════════════════════════════════════
   INPUT AREA
══════════════════════════════════════════════════════ */
function autoGrow(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,160)+'px';}

const msgInput=document.getElementById('msgInput');
const sendBtn=document.getElementById('sendBtn');

msgInput?.addEventListener('input',()=>{
  autoGrow(msgInput);
  sendTyping();
  handleMentionInput();
  handleSlashSuggestions();
});

msgInput?.addEventListener('keydown',e=>{
  /* Mention popup navigation */
  const popup=document.getElementById('dc-mention-popup');
  if(popup&&!popup.classList?.contains('hidden')&&popup.children.length){
    if(e.key==='ArrowDown'){e.preventDefault();mentionSelIdx=Math.min(mentionSelIdx+1,popup.children.length-1);updateMentionSel(popup);return;}
    if(e.key==='ArrowUp'){e.preventDefault();mentionSelIdx=Math.max(mentionSelIdx-1,0);updateMentionSel(popup);return;}
    if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();const sel=popup.children[mentionSelIdx];if(sel)sel.click();return;}
    if(e.key==='Escape'){popup.innerHTML='';return;}
  }
  /* Slash suggestion navigation */
  const sugg=document.getElementById('slash-suggestions');
  if(sugg&&sugg.children.length){
    if(e.key==='ArrowDown'){e.preventDefault();slashSuggIdx=Math.min(slashSuggIdx+1,sugg.children.length-1);updateSlashSel(sugg);return;}
    if(e.key==='ArrowUp'){e.preventDefault();slashSuggIdx=Math.max(slashSuggIdx-1,0);updateSlashSel(sugg);return;}
    if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();const sel=sugg.children[slashSuggIdx];if(sel)sel.click();return;}
    if(e.key==='Escape'){sugg.innerHTML='';return;}
  }
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();}
});

sendBtn?.addEventListener('click',sendMessage);

/* Typing broadcast */
let typingTimeout=null;
function sendTyping(){
  if(!typingChannel||!currentUserId||!currentProfile)return;
  typingChannel.send({type:'broadcast',event:'typing',payload:{user_id:currentUserId,username:currentProfile.username}});
  clearTimeout(typingTimeout);
  typingTimeout=setTimeout(()=>{},3000);
}

function renderTyping(){
  const el=document.getElementById('dc-typing');if(!el)return;
  const names=Object.values(typingUsers);
  if(!names.length){el.textContent='';return;}
  if(names.length===1)el.textContent=`${names[0]} is typing…`;
  else if(names.length<=3)el.textContent=`${names.join(', ')} are typing…`;
  else el.textContent='Several people are typing…';
}

/* ── @mention autocomplete ──────────────────────────── */
function handleMentionInput(){
  const inp=msgInput;const pos=inp.selectionStart;const val=inp.value;
  const popup=document.getElementById('dc-mention-popup');
  /* find last @ before cursor */
  const before=val.slice(0,pos);const atIdx=before.lastIndexOf('@');
  if(atIdx<0||before.slice(atIdx+1).includes(' ')){popup.innerHTML='';return;}
  const query=before.slice(atIdx+1).toLowerCase();
  mentionQuery=query;mentionStart=atIdx;
  const matches=knownUsers.filter(u=>u.username.toLowerCase().startsWith(query)).slice(0,6);
  if(!matches.length){popup.innerHTML='';return;}
  popup.innerHTML='';mentionSelIdx=0;
  matches.forEach((u,i)=>{
    const item=document.createElement('div');item.className='mention-item'+(i===0?' selected':'');
    item.innerHTML=`<span class="mention-av">${getInitials(u.username)}</span><span>${esc(u.username)}</span>`;
    item.addEventListener('click',()=>{
      const val2=msgInput.value;
      msgInput.value=val2.slice(0,mentionStart)+'@'+u.username+' '+val2.slice(pos);
      popup.innerHTML='';msgInput.focus();
    });
    popup.appendChild(item);
  });
}
function updateMentionSel(popup){
  [...popup.children].forEach((c,i)=>c.classList.toggle('selected',i===mentionSelIdx));
}

/* ── /slash suggestions ─────────────────────────────── */
function handleSlashSuggestions(){
  const val=msgInput.value;
  let sugg=document.getElementById('slash-suggestions');
  if(!sugg){sugg=document.createElement('div');sugg.id='slash-suggestions';sugg.className='slash-suggestions';document.querySelector('.dc-input-box').appendChild(sugg);}
  if(!val.startsWith('/')||val.includes(' ')){sugg.innerHTML='';return;}
  const q=val.slice(1).toLowerCase();
  const matches=SLASH_CMDS.filter(c=>c.cmd.slice(1).startsWith(q)).slice(0,6);
  if(!matches.length){sugg.innerHTML='';return;}
  slashSuggIdx=0;sugg.innerHTML='';
  matches.forEach((c,i)=>{
    const item=document.createElement('div');item.className='slash-item'+(i===0?' selected':'');
    item.innerHTML=`<span class="slash-cmd">${esc(c.cmd)}</span><span class="slash-desc">${esc(c.desc)}</span>`;
    item.addEventListener('click',()=>{
      if(c.cmd==='/me'||c.cmd==='/playing'||c.cmd==='/mute'||c.cmd==='/ban'){
        msgInput.value=c.cmd+' ';
      } else {
        msgInput.value=c.cmd;sendMessage();
      }
      sugg.innerHTML='';msgInput.focus();
    });
    sugg.appendChild(item);
  });
}
function updateSlashSel(sugg){
  [...sugg.children].forEach((c,i)=>c.classList.toggle('selected',i===slashSuggIdx));
}

/* ── Emoji picker ───────────────────────────────────── */
document.getElementById('emojiBtn')?.addEventListener('click',e=>{
  e.stopPropagation();
  const picker=document.getElementById('dcEmojiPicker');
  const isHidden=picker.classList.contains('hidden');
  picker.classList.toggle('hidden',!isHidden);
  if(isHidden){
    picker.innerHTML='';
    ALL_EMOJIS.forEach(em=>{
      const btn=document.createElement('button');btn.className='emoji-btn';btn.textContent=em;
      btn.onclick=()=>{msgInput.value+=em;picker.classList.add('hidden');msgInput.focus();};
      picker.appendChild(btn);
    });
  }
});

/* ── File attach ────────────────────────────────────── */
document.getElementById('attachBtn')?.addEventListener('click',()=>document.getElementById('fileInput')?.click());
document.getElementById('fileInput')?.addEventListener('change',e=>{
  const f=e.target.files[0];if(!f)return;
  if(f.size>10*1024*1024){showToast('❌ Max 10 MB');e.target.value='';return;}
  pendingFile=f;
  document.getElementById('up-icon').textContent=isImageUrl(f.name)?'🖼️':'📎';
  document.getElementById('up-name').textContent=f.name;
  document.getElementById('dc-upload-preview').classList.remove('hidden');
  e.target.value='';
});
document.getElementById('up-cancel')?.addEventListener('click',()=>{
  pendingFile=null;document.getElementById('dc-upload-preview').classList.add('hidden');
});

/* ── Lightbox ───────────────────────────────────────── */
document.getElementById('lightbox')?.addEventListener('click',e=>{
  if(e.target===document.getElementById('lightbox')||e.target===document.getElementById('lightbox-close'))
    document.getElementById('lightbox').classList.add('hidden');
});

/* ── DND toggle ─────────────────────────────────────── */
document.getElementById('dnd-toggle')?.addEventListener('click',()=>{
  dndMode=!dndMode;
  document.getElementById('dnd-toggle').textContent=dndMode?'🔕':'🔔';
  showToast(dndMode?'🔕 Do Not Disturb ON':'🔔 Notifications ON');
  broadcastPresence();
});

/* ── Infinite scroll ────────────────────────────────── */
document.getElementById('dc-messages')?.addEventListener('scroll',async function(){
  if(this.scrollTop<100&&!isLoadingMore&&!historyExhausted&&oldestMsgDate){
    isLoadingMore=true;
    await loadMessages(activeRoom,oldestMsgDate);
    isLoadingMore=false;
  }
});

/* ── Mobile back ────────────────────────────────────── */
document.getElementById('dcMobileBack')?.addEventListener('click',()=>{
  document.getElementById('dcSidebar')?.classList.toggle('mobile-open');
});
document.querySelector('.sidebar-toggle')?.addEventListener('click',()=>{
  document.getElementById('sidebar')?.classList.toggle('open');
  document.getElementById('overlay')?.classList.toggle('active');
});
document.getElementById('railDMs')?.addEventListener('click',()=>{
  showingDMs=true;setActiveServer(null);buildSidebar(null);
  document.querySelectorAll('.rail-server-icon').forEach(b=>b.classList.remove('active'));
  document.getElementById('railDMs').classList.add('active');
});

/* ══════════════════════════════════════════════════════
   TRANSLATE
══════════════════════════════════════════════════════ */
document.getElementById('translateLang')?.addEventListener('change',async function(){
  const lang=this.value;if(!lang)return;
  const msgs=document.querySelectorAll('.dc-msg-body');
  for(const m of msgs){
    const rawText=m.firstChild?.nodeValue||m.textContent||'';if(!rawText.trim())continue;
    const key=lang+':'+rawText.slice(0,100);
    if(translateCache[key]){renderTranslation(m,translateCache[key]);continue;}
    try{
      const resp=await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(rawText.slice(0,400))}&langpair=autodetect|${lang}`);
      const json=await resp.json();
      const t=json?.responseData?.translatedText;
      if(t&&t!==rawText){translateCache[key]=t;renderTranslation(m,t);}
    }catch(e){}
  }
});
function renderTranslation(bodyEl,text){
  let t=bodyEl.querySelector('.dc-translation');
  if(!t){t=document.createElement('div');t.className='dc-translation';bodyEl.appendChild(t);}
  t.textContent='🌐 '+text;
}

/* ══════════════════════════════════════════════════════
   SERVER CONTEXT MENU (keep duplicate-free)
══════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */
(async()=>{
  /* FIX: wait for auth session reliably */
  const{data:{session}}=await sb.auth.getSession();
  currentUserId=session?.user?.id||null;
  if(currentUserId){
    currentProfile=await getProfile(currentUserId);
    knownUsers=await loadKnownUsers();
  }
  window._currentUserIdForNotif=currentUserId;
  window._currentProfileForNotif=currentProfile;

  /* update user chip */
  if(currentProfile){
    document.getElementById('dcUserName').textContent=currentProfile.username||'Me';
    const avEl=document.getElementById('dcUserAv');
    if(avEl)avEl.appendChild(makeAvatar(currentProfile,32));
  }

  await buildRail();
  await buildSidebar(null);
  initPresence();
  startGameDetection();
  await handleInviteCode();
  switchRoom({type:'public',id:'public',name:'general',icon:'#',serverName:'360 Chat',serverId:null});

  sb.auth.onAuthStateChange(async(_,sess)=>{
    /* FIX: invalidate profile cache on auth change */
    if(currentUserId)delete profileCache[currentUserId];
    currentUserId=sess?.user?.id||null;
    currentProfile=currentUserId?await getProfile(currentUserId,true):null;
    knownUsers=currentUserId?await loadKnownUsers():[];
    window._currentUserIdForNotif=currentUserId;
    window._currentProfileForNotif=currentProfile;
    if(currentProfile){
      document.getElementById('dcUserName').textContent=currentProfile.username||'Me';
      const avEl=document.getElementById('dcUserAv');if(avEl){avEl.innerHTML='';avEl.appendChild(makeAvatar(currentProfile,32));}
    } else {
      document.getElementById('dcUserName').textContent='Not signed in';
      const avEl=document.getElementById('dcUserAv');if(avEl)avEl.innerHTML='';
    }
    await buildRail();
    if(currentUserId)initPresence();
  });
})();

async function loadKnownUsers(){
  try{
    const{data}=await sb.from('profiles').select('id,username').order('username').limit(200);
    return data||[];
  }catch{return[];}
}
