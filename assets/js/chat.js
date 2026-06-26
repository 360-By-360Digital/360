/* ════════════════════════════════════════════════════════
   360 Chat — Discord Mode  v3.1
   Three-panel layout: server rail → channel list → chat
   Features: servers, channels (with categories), DMs,
   threads, pins, members panel, reactions, @mentions,
   /slash commands, upload, realtime presence, unread
   badges, push notifications, profanity filter,
   auto-translate, context-menu, right-click reactions.
════════════════════════════════════════════════════════ */

// Prevent main.js from injecting its own user-chip (chat has its own rail user widget)
window.SKIP_AUTH_CHIP = true;

const sb = supabaseClient;

/* ── State ─────────────────────────────────────────── */
let currentUserId    = null;
let currentProfile   = null;
let activeRoom       = { type:"public", id:"public", name:"general", icon:"#", serverId:null, serverName:"360 Chat" };
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
const msgElMap       = new Map();
const profileCache   = {};
const translateCache = {};
const unreadCounts   = {};
const QUICK_EMOJIS   = ["👍","❤️","😂","💀","🔥","😮","😢","👏","✨","💯","🚀","⭐","🎉","👀","🙏"];
const ALL_EMOJIS     = ["😀","😂","😍","🥰","😎","🤔","😢","😡","👍","👎","❤️","🔥","💀","🎉","✨",
                        "💯","🚀","⭐","👀","🙏","💪","🤖","😊","🥺","🤣","😅","😱","🫡","💅","🗿",
                        "🤯","🫠","😭","🤩","😤","🫶","❄️","⚡","🌈","🎮","🏆","👑","💎","🐱","🌙"];

/* ── Shortcodes ─────────────────────────────────────── */
const SHORTCODES={":skull:":"💀",":fire:":"🔥",":heart:":"❤️",":thumbsup:":"👍",":thumbsdown:":"👎",
  ":laugh:":"😂",":cry:":"😢",":wow:":"😮",":clap:":"👏",":sparkles:":"✨",":100:":"💯",
  ":rocket:":"🚀",":eyes:":"👀",":ok:":"👌",":wave:":"👋",":pray:":"🙏",":muscle:":"💪",
  ":star:":"⭐",":check:":"✅",":x:":"❌",":warning:":"⚠️",":zap:":"⚡",":rainbow:":"🌈",
  ":sun:":"☀️",":moon:":"🌙",":trophy:":"🏆",":crown:":"👑",":diamond:":"💎",":robot:":"🤖",
  ":nerd:":"🤓",":360:":"🔵",":gg:":"🎮",":bruh:":"😑",":cat:":"🐱",":rose:":"🥀"};
function applyShortcodes(t){ return t.replace(/:[a-z0-9_]+:/g, m=>SHORTCODES[m]||m); }

/* ── Profanity filter ───────────────────────────────── */
let PROF=[];
try{ PROF=(()=>{
  const l=w=>w.split("").map(c=>({a:"[a4@]",b:"[b8]",c:"[ck(]",e:"[e3]",f:"[f]",g:"[g9]",h:"[h#]",i:"[i1!|]",k:"[kc]",l:"[l1|]",n:"[n]",o:"[o0]",p:"[p]",r:"[r]",s:"[s5$]",t:"[t7+]",u:"[uv]",v:"[vu]",x:"[x]"}[c]||c)).join("[\\s_.\\-*]*");
  const p=w=>new RegExp("(?<![a-z])"+l(w)+"(?![a-z])","gi");
  return[p("fuck"),p("fuk"),p("fck"),/ph[uv][ck]+/gi,/f+[uv]+[ck]+[e]*/gi,p("shit"),p("sht"),/a+[s$][s$]+/gi,/a+r+[s$][e]?/gi,/as+hole/gi,p("bitch"),/b[i1!][t7]ch/gi,p("cunt"),/c[uv]n[t7]/gi,/d[i1!][ck]+/gi,/c[o0][ck]+/gi,p("bastard"),/wh[o0]r[e3]?/gi,/sl[uv][t7]/gi,/n[i1!][g9][g9][e3]r/gi,/n[i1!][g9][g9][a4]/gi,/f[a4][g9][g9][o0][t7]/gi,/r[e3][t7][a4]r[d][e3]?[d]?/gi,/[t7]w[a4@][t7]/gi,/pr[i1!][ck]+/gi,/w[a4@]nk[e3]?r?/gi,/wtf/gi,/stfu/gi,/m[o0][t7]h[e3]r[\s\-_.]*f[uv][ck]/gi,
  /\bputa\b/gi,/\bputo\b/gi,/\bpinche\b/gi,/\bchinga[r]?\b/gi,/\bmerde\b/gi,/\bputain\b/gi,/\bsalope\b/gi,/\bscheisse\b/gi,/\bficken\b/gi,/\barschloch\b/gi,/\bporra\b/gi,/\bmerda\b/gi,/\bcazzo\b/gi,/\bvaffanculo\b/gi,/\bkut\b/gi,/\bkanker\b/gi,/\bkurwa\b/gi,/\bmalaka\b/gi,/\bkontol\b/gi,/\btangina\b/gi];
})();}catch(e){console.warn("profanity filter",e);}
function filterProfanity(t){ if(!t)return t; let o=t; for(const p of PROF){try{o=o.replace(p,m=>"*".repeat(m.length));}catch(e){}} return o; }

/* ── Utils ──────────────────────────────────────────── */
function esc(s){ return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function getInitials(n){ if(!n)return "?"; const p=n.trim().split(" "); return(p.length===1?p[0][0]:(p[0][0]+p[p.length-1][0])).toUpperCase(); }
function formatTime(ts){ return new Date(ts).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}); }
function formatDate(ts){
  const d=new Date(ts),t=new Date(),y=new Date();y.setDate(t.getDate()-1);
  if(d.toDateString()===t.toDateString())return "Today";
  if(d.toDateString()===y.toDateString())return "Yesterday";
  return d.toLocaleDateString([],{month:"long",day:"numeric",year:"numeric"});
}
function isImageUrl(url){ return /\.(jpe?g|png|gif|webp|svg|bmp)(\?|$)/i.test(url); }
function showToast(msg,dur=2800){
  const t=document.createElement("div");t.className="dc-toast";t.textContent=msg;
  document.body.appendChild(t);setTimeout(()=>t.remove(),dur);
}
function scrollBottom(){ requestAnimationFrame(()=>requestAnimationFrame(()=>{ const w=document.getElementById("dc-messages");if(w)w.scrollTop=w.scrollHeight; })); }
function getRoomKey(r){ return r.type+":"+r.id; }
function closeAllPanels(){
  document.getElementById("thread-panel").classList.add("hidden");
  document.getElementById("pins-panel").classList.add("hidden");
  document.getElementById("members-panel").classList.add("hidden");
}

/* ── Profile cache ──────────────────────────────────── */
async function getProfile(uid){
  if(!uid)return{username:"Unknown",avatar_url:null,role:"user",banned:false,muted_until:null,warn_count:0};
  if(profileCache[uid])return profileCache[uid];
  try{
    const{data}=await sb.from("profiles").select("username,avatar_url,role,tag,email,first_name,last_name,banned,muted_until,warn_count").eq("id",uid).single();
    const p=data||{username:"Unknown",avatar_url:null,role:"user",banned:false,muted_until:null,warn_count:0};
    if(!p.username)(p.username=[p.first_name,p.last_name].filter(Boolean).join(" ")||"Unknown");
    p.warn_count=p.warn_count||0;
    profileCache[uid]=p;return p;
  }catch{return{username:"Unknown",avatar_url:null,role:"user",banned:false,muted_until:null,warn_count:0};}
}

/* ── Automod helpers ─────────────────────────────────── */
async function logAutomod(userId,username,action,reason,expiresAt=null){
  try{
    await sb.from("automod_log").insert({user_id:userId,username,action,reason,expires_at:expiresAt});
  }catch(e){console.warn("automod_log write failed",e);}
}

function isMuted(profile){
  if(!profile?.muted_until)return false;
  return new Date(profile.muted_until)>new Date();
}

function muteExpiryText(profile){
  if(!profile?.muted_until)return"";
  const ms=new Date(profile.muted_until)-new Date();
  if(ms<=0)return"";
  const m=Math.ceil(ms/60000);
  return m<60?`${m}m`:Math.ceil(m/60)+"h";
}

/* ── Mod-only command guard ──────────────────────────── */
function requiresMod(profile){
  return profile?.role==="admin"||profile?.role==="mod";
}

/* ── Avatar elements ────────────────────────────────── */
function makeAvatar(p,size=38){
  if(p?.avatar_url){
    const img=document.createElement("img");
    img.src=p.avatar_url;img.style.cssText=`width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;`;
    img.onerror=()=>img.replaceWith(makeInitialsEl(p,size));
    return img;
  }
  return makeInitialsEl(p,size);
}
function makeInitialsEl(p,size=38){
  const d=document.createElement("div");
  d.style.cssText=`width:${size}px;height:${size}px;border-radius:50%;background:var(--a);color:#fff;font-size:${Math.round(size*.38)}px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;`;
  d.textContent=getInitials(p?.username);return d;
}

/* ══════════════════════════════════════════════════════
   RAIL
══════════════════════════════════════════════════════ */
async function buildRail(){
  const rail=document.getElementById("rail-servers");rail.innerHTML="";
  const{data:servers}=await sb.from("servers").select("*").order("name");

  // Public / General pill
  const gen=document.createElement("button");
  gen.className="rail-server-icon"+(activeServerId===null&&!showingDMs?" active":"");
  gen.title="General";gen.textContent="🌐";
  gen.addEventListener("click",()=>{ showingDMs=false;setActiveServer(null);buildSidebar(null);switchRoom({type:"public",id:"public",name:"general",icon:"#",serverName:"360 Chat",serverId:null}); });
  rail.appendChild(gen);

  (servers||[]).forEach(s=>{
    const btn=document.createElement("button");
    btn.className="rail-server-icon"+(activeServerId===s.id?" active":"");
    btn.title=s.name;btn.textContent=s.icon||s.name[0].toUpperCase();
    btn.dataset.serverId=s.id;
    if(unreadCounts["server:"+s.id]>0)btn.classList.add("unread");
    btn.addEventListener("click",()=>handleServerClick(s));
    rail.appendChild(btn);
  });

  // Update user avatar
  const ru=document.getElementById("railUser");ru.innerHTML="";
  if(currentProfile){const av=makeAvatar(currentProfile,34);ru.appendChild(av);}
  else ru.textContent="?";
  ru.onclick=()=>location.href="/account";

  document.getElementById("railDMs").classList.toggle("active",showingDMs);
}

function setActiveServer(id){
  activeServerId=id;
  document.querySelectorAll(".rail-server-icon").forEach(b=>{
    b.classList.toggle("active",b.dataset.serverId===id||(id===null&&!b.dataset.serverId&&!showingDMs));
  });
}

/* ══════════════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════════════ */
async function buildSidebar(server){
  const header=document.getElementById("sb-server-name");
  const body=document.getElementById("sidebarBody");body.innerHTML="";

  if(showingDMs){header.textContent="Direct Messages";await buildDMList(body);return;}

  if(!server){
    header.textContent="360 Chat";
    addCategoryHeader(body,"TEXT CHANNELS",null);
    const item=makeChanItem({id:"public",name:"general",topic:""},activeRoom.type==="public",()=>switchRoom({type:"public",id:"public",name:"general",icon:"#",serverName:"360 Chat",serverId:null}));
    body.appendChild(item);
    addSidebarBtn(body,"＋ Create Server",()=>{ if(!currentUserId){location.href="/account";return;}openModal("serverModal"); });
    addSidebarBtn(body,"🔍 Browse Servers",()=>browseSidebar(body));
    return;
  }

  header.textContent=server.name;
  const{data:channels}=await sb.from("channels").select("*").eq("server_id",server.id).order("position").order("name");
  if(!channels||!channels.length){body.innerHTML=`<div style="padding:20px;font-size:13px;color:var(--dc-muted);text-align:center;">No channels yet.</div>`;}
  else{
    const cats={};channels.forEach(ch=>{const c=ch.category||"TEXT CHANNELS";(cats[c]=cats[c]||[]).push(ch);});
    const isAdmin=currentProfile?.role==="admin"||server.owner_id===currentUserId;
    Object.entries(cats).forEach(([cat,chs])=>{
      addCategoryHeader(body,cat,isAdmin?()=>openAddChannelModal(server):null);
      chs.forEach(ch=>{
        const item=makeChanItem(ch,activeRoom.id===ch.id,()=>switchRoom({type:"channel",id:ch.id,name:ch.name,icon:"#",serverName:server.name,serverId:server.id,topic:ch.topic||""}));
        body.appendChild(item);
      });
    });
  }
  if(currentUserId){
    addSidebarBtn(body,"＋ Add Channel",()=>openAddChannelModal(server));
    if(server.owner_id===currentUserId)addSidebarBtn(body,"✏️ Edit Server",()=>openEditServerModal(server));
  }
}

function addCategoryHeader(body,label,onAdd){
  const c=document.createElement("div");c.className="dc-category";
  c.innerHTML=`<span class="cat-arrow">▸</span><span>${esc(label)}</span>${onAdd?`<button class="cat-add" title="Add channel">＋</button>`:""}`;
  if(onAdd)c.querySelector(".cat-add")?.addEventListener("click",e=>{e.stopPropagation();onAdd();});
  body.appendChild(c);
}

function makeChanItem(ch,isActive,onClick){
  const item=document.createElement("div");
  item.className="dc-ch-item"+(isActive?" active":"");
  item.dataset.chId=ch.id;
  item.innerHTML=`<span class="ch-hash">#</span><span>${esc(ch.name)}</span>`;
  item.addEventListener("click",onClick);return item;
}

function addSidebarBtn(body,label,onClick){
  const btn=document.createElement("button");btn.className="dc-sidebar-add-btn";btn.textContent=label;
  btn.addEventListener("click",onClick);body.appendChild(btn);
}

async function buildDMList(body){
  if(!currentUserId){addSidebarBtn(body,"Sign in to use DMs",()=>location.href="/account");return;}
  const{data:dms}=await sb.from("direct_messages").select("*").or(`user_a.eq.${currentUserId},user_b.eq.${currentUserId}`).order("updated_at",{ascending:false});
  if(!dms||!dms.length){body.innerHTML=`<div style="padding:20px;font-size:13px;color:var(--dc-muted);text-align:center;">No DMs yet.</div>`;}
  else{
    const others=dms.map(dm=>dm.user_a===currentUserId?dm.user_b:dm.user_a);
    const profiles=await Promise.all(others.map(id=>getProfile(id)));
    dms.forEach((dm,i)=>{
      const p=profiles[i];const oid=others[i];
      const item=document.createElement("div");item.className="dc-dm-item"+(activeRoom.id===dm.id?" active":"");item.dataset.dmId=dm.id;
      const av=document.createElement("div");av.className="dc-dm-avatar";
      if(p.avatar_url){const img=document.createElement("img");img.src=p.avatar_url;av.appendChild(img);}else av.textContent=getInitials(p.username);
      const name=document.createElement("span");name.textContent=p.username||"User";
      item.appendChild(av);item.appendChild(name);
      item.addEventListener("click",()=>switchRoom({type:"dm",id:dm.id,name:p.username,icon:"@",serverId:null,serverName:"Direct Messages",otherId:oid}));
      body.appendChild(item);
    });
  }
  addSidebarBtn(body,"＋ New Message",()=>openModal("dmModal"));
}

async function browseSidebar(body){
  const{data:servers}=await sb.from("servers").select("*").order("name");
  body.innerHTML="";
  addCategoryHeader(body,"ALL SERVERS",null);
  (servers||[]).forEach(s=>{
    const item=document.createElement("div");item.className="dc-ch-item";
    item.innerHTML=`<span class="ch-hash">${esc(s.icon||"🌐")}</span><span>${esc(s.name)}</span>${s.passcode?`<span style="margin-left:auto;font-size:11px;opacity:.5;">🔒</span>`:""}`;
    item.addEventListener("click",()=>handleServerClick(s));body.appendChild(item);
  });
}

/* ══════════════════════════════════════════════════════
   SERVER ENTRY / JOIN
══════════════════════════════════════════════════════ */
async function handleServerClick(server){
  if(!currentUserId){location.href="/account";return;}
  showingDMs=false;setActiveServer(server.id);
  const{data:mem}=await sb.from("server_members").select("id").eq("server_id",server.id).eq("user_id",currentUserId).maybeSingle();
  if(mem){await enterServer(server);}
  else if(server.passcode){await buildSidebar(server);showPasscodeGate(server);}
  else{await joinServer(server.id);await enterServer(server);}
}

async function joinServer(serverId){
  const{error}=await sb.from("server_members").insert({server_id:serverId,user_id:currentUserId});
  if(error&&!error.message.includes("unique"))showToast("❌ "+error.message);
}

async function enterServer(server){
  setActiveServer(server.id);await buildSidebar(server);
  const{data:chs}=await sb.from("channels").select("*").eq("server_id",server.id).order("position").order("name").limit(1);
  if(chs&&chs.length){switchRoom({type:"channel",id:chs[0].id,name:chs[0].name,icon:"#",serverName:server.name,serverId:server.id,topic:chs[0].topic||""});}
}

function showPasscodeGate(server){
  document.getElementById("passcode-gate")?.remove();
  const gate=document.createElement("div");gate.id="passcode-gate";
  gate.style.cssText="position:absolute;inset:0;z-index:200;background:rgba(0,0,0,.75);backdrop-filter:blur(16px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;";
  gate.innerHTML=`<div style="font-size:44px">🔒</div>
    <div style="font-size:20px;font-weight:800;color:#fff">${esc(server.name)}</div>
    <div style="font-size:13px;color:rgba(255,255,255,.6)">This server requires a passcode.</div>
    <input id="gate-inp" type="password" placeholder="Enter passcode" style="padding:11px 18px;border-radius:12px;border:1.5px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);font-size:15px;outline:none;width:260px;color:#fff;text-align:center;font-family:inherit;"/>
    <p id="gate-err" style="color:#f87171;font-size:12px;min-height:16px;margin:0;"></p>
    <button id="gate-btn" style="padding:11px 36px;border-radius:12px;border:none;cursor:pointer;font-size:15px;font-weight:700;background:var(--a);color:#fff;font-family:inherit;">Unlock</button>
    <button id="gate-back" style="background:none;border:none;cursor:pointer;font-size:13px;color:rgba(255,255,255,.5);font-family:inherit;">← Go back</button>`;
  const main=document.getElementById("dcMain");main.style.position="relative";main.appendChild(gate);
  const inp=gate.querySelector("#gate-inp");inp.focus();
  gate.querySelector("#gate-back").onclick=()=>{gate.remove();main.style.position="";};
  const tryUnlock=async()=>{
    const v=inp.value.trim();if(!v){gate.querySelector("#gate-err").textContent="Enter the passcode.";return;}
    if(v!==server.passcode){gate.querySelector("#gate-err").textContent="Wrong passcode.";inp.value="";inp.focus();return;}
    await joinServer(server.id);gate.remove();main.style.position="";await enterServer(server);
  };
  gate.querySelector("#gate-btn").onclick=tryUnlock;inp.onkeydown=e=>{if(e.key==="Enter")tryUnlock();};
}

/* ══════════════════════════════════════════════════════
   SWITCH ROOM
══════════════════════════════════════════════════════ */
function switchRoom(room){
  activeRoom=room;lastMsgUserId=null;lastMsgDate=null;replyingTo=null;isSending=false;
  closeAllPanels();
  document.getElementById("dc-reply-bar").classList.add("hidden");
  document.getElementById("dc-upload-preview").classList.add("hidden");

  document.getElementById("hdrIcon").textContent=room.icon||"#";
  document.getElementById("hdrName").textContent=room.name;
  document.getElementById("hdrTopic").textContent=room.topic||"";
  document.getElementById("msgInput").placeholder="Message #"+room.name+"…";

  document.querySelectorAll(".dc-ch-item,.dc-dm-item").forEach(el=>el.classList.remove("active"));
  document.querySelector(`[data-ch-id="${room.id}"]`)?.classList.add("active");
  document.querySelector(`[data-dm-id="${room.id}"]`)?.classList.add("active");

  if(realtimeChannel)sb.removeChannel(realtimeChannel);
  if(typingChannel)sb.removeChannel(typingChannel);
  typingUsers={};renderTyping();msgElMap.clear();historyExhausted=false;oldestMsgDate=null;

  const rtKey="rt-"+room.type+"-"+String(room.id).replace(/-/g,"")+"-"+Date.now();
  const chan=sb.channel(rtKey);
  if(room.type==="channel"){
    chan.on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`channel_id=eq.${room.id}`},p=>onIncoming(p.new))
       .on("postgres_changes",{event:"UPDATE",schema:"public",table:"messages",filter:`channel_id=eq.${room.id}`},p=>{const el=msgElMap.get(String(p.new.id));if(el)patchMsgEl(el,p.new);})
       .on("postgres_changes",{event:"DELETE",schema:"public",table:"messages",filter:`channel_id=eq.${room.id}`},p=>{msgElMap.get(String(p.old.id))?.remove();msgElMap.delete(String(p.old.id));});
  }else if(room.type==="dm"){
    chan.on("postgres_changes",{event:"INSERT",schema:"public",table:"dm_messages",filter:`dm_id=eq.${room.id}`},p=>onIncoming(p.new));
  }else if(room.type==="server"){
    chan.on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`server_id=eq.${room.id}`},p=>onIncoming(p.new));
  }else{
    chan.on("postgres_changes",{event:"INSERT",schema:"public",table:"messages"},p=>{if(!p.new.channel_id&&!p.new.dm_id&&!p.new.server_id)onIncoming(p.new);});
  }
  realtimeChannel=chan.subscribe();

  typingChannel=sb.channel("typing-"+room.type+"-"+room.id)
    .on("broadcast",{event:"typing"},p=>{const{username,uid}=p.payload;if(uid===currentUserId)return;typingUsers[uid]={username};renderTyping();clearTimeout(typingTimeouts[uid]);typingTimeouts[uid]=setTimeout(()=>{delete typingUsers[uid];renderTyping();},2500);})
    .subscribe();

  // Notify the notification system that we switched rooms (clears unread badge for this room)
  window.ChatNotif?.onRoomSwitch(room);

  loadHistory();markRoomRead(room);
  document.getElementById("dcSidebar")?.classList.remove("mobile-open");
}

function onIncoming(msg){
  renderMessage(msg,true);
  trackUnread(msg);
  // Delegate push notifications and badge updates to notifications.js
  window.ChatNotif?.onMessage(msg,activeRoom,currentUserId);
}

/* ══════════════════════════════════════════════════════
   HISTORY
══════════════════════════════════════════════════════ */
async function loadHistory(){
  const win=document.getElementById("dc-messages");win.innerHTML="";msgElMap.clear();lastMsgUserId=null;lastMsgDate=null;
  await fetchMessages(null);scrollBottom();setTimeout(scrollBottom,120);
}

async function fetchMessages(beforeDate){
  const LIMIT=50;let q;
  if(activeRoom.type==="dm") q=sb.from("dm_messages").select("*").eq("dm_id",activeRoom.id);
  else if(activeRoom.type==="channel") q=sb.from("messages").select("*").eq("channel_id",activeRoom.id).is("deleted_at",null);
  else if(activeRoom.type==="server") q=sb.from("messages").select("*").eq("server_id",activeRoom.id).is("deleted_at",null);
  else q=sb.from("messages").select("*").is("channel_id",null).is("dm_id",null).is("server_id",null).is("deleted_at",null);
  if(beforeDate)q=q.lt("created_at",beforeDate);
  const{data,error}=await q.order("created_at",{ascending:false}).limit(LIMIT);
  if(error||!data||!data.length){historyExhausted=true;return;}
  if(data.length<LIMIT)historyExhausted=true;
  const msgs=data.reverse();oldestMsgDate=msgs[0].created_at;
  const win=document.getElementById("dc-messages");
  if(beforeDate){
    const prevH=win.scrollHeight;
    const saved={u:lastMsgUserId,d:lastMsgDate};lastMsgUserId=null;lastMsgDate=null;
    const frag=document.createDocumentFragment();
    msgs.forEach(m=>{const el=buildMsgEl(m);if(el)frag.appendChild(el);});
    win.insertBefore(frag,win.firstChild);
    lastMsgUserId=saved.u;lastMsgDate=saved.d;win.scrollTop=win.scrollHeight-prevH;
  }else{
    msgs.forEach(m=>renderMessage(m,false));
    if(msgs.length&&activeRoom.type!=="dm"){
      const ids=msgs.map(m=>m.id);
      const{data:rxns}=await sb.from("reactions").select("emoji,user_id,message_id").in("message_id",ids);
      if(rxns){const g={};rxns.forEach(r=>{(g[r.message_id]=g[r.message_id]||[]).push(r);});Object.entries(g).forEach(([mid,r])=>renderReactions(mid,r));}
    }
    msgs.forEach(m=>{if(m.username)registerUser(m.username);});
  }
}

document.getElementById("dc-messages").addEventListener("scroll",async function(){
  if(this.scrollTop>180||isLoadingMore||historyExhausted||!oldestMsgDate)return;
  isLoadingMore=true;
  const ldr=document.createElement("div");ldr.style.cssText="text-align:center;padding:8px;font-size:12px;color:var(--dc-muted);";ldr.textContent="Loading…";this.prepend(ldr);
  await fetchMessages(oldestMsgDate);ldr.remove();isLoadingMore=false;
});

/* ══════════════════════════════════════════════════════
   RENDER MESSAGE
══════════════════════════════════════════════════════ */
function renderMessage(msg,isRealtime){
  const el=buildMsgEl(msg);if(!el)return;
  document.getElementById("dc-messages").appendChild(el);
  if(isRealtime){const w=document.getElementById("dc-messages");if(w.scrollHeight-w.scrollTop-w.clientHeight<300)scrollBottom();}
  if(isRealtime&&activeRoom.type!=="dm")loadReactionsSingle(msg.id);
  maybeTranslateMessage(el,msg.text);
}

function buildMsgEl(msg){
  const r=activeRoom;
  if(r.type==="public"&&(msg.channel_id||msg.dm_id||msg.server_id))return null;
  if(r.type==="channel"&&String(msg.channel_id)!==String(r.id))return null;
  if(r.type==="server"&&String(msg.server_id)!==String(r.id))return null;
  if(r.type==="dm"&&String(msg.dm_id)!==String(r.id))return null;
  if(msgElMap.has(String(msg.id)))return null;

  const win=document.getElementById("dc-messages");
  const msgDate=formatDate(msg.created_at);
  if(msgDate!==lastMsgDate){
    const div=document.createElement("div");div.className="dc-date-divider";div.textContent=msgDate;
    win.appendChild(div);lastMsgDate=msgDate;lastMsgUserId=null;
  }
  const sameAuthor=msg.user_id&&msg.user_id===lastMsgUserId;
  lastMsgUserId=msg.user_id;

  const el=document.createElement("div");
  el.className="dc-msg"+(sameAuthor?" grouped":"");
  el.dataset.msgId=msg.id;el.dataset.userId=msg.user_id||"";

  // Avatar
  const avWrap=document.createElement("div");avWrap.className="dc-msg-avatar";
  if(msg.avatar_url){const img=document.createElement("img");img.src=msg.avatar_url;img.style.cssText="width:100%;height:100%;border-radius:50%;object-fit:cover;";avWrap.appendChild(img);}
  else avWrap.textContent=getInitials(msg.username);
  avWrap.addEventListener("click",e=>{e.stopPropagation();showProfilePopup(msg.user_id,avWrap);});
  el.appendChild(avWrap);

  // Body
  const body=document.createElement("div");body.className="dc-msg-body";

  if(!sameAuthor){
    const hdr=document.createElement("div");hdr.className="dc-msg-header";
    const author=document.createElement("span");author.className="dc-msg-author";author.textContent=msg.username||"Unknown";
    author.addEventListener("click",e=>{e.stopPropagation();showProfilePopup(msg.user_id,author);});
    hdr.appendChild(author);
    const roleBadgeColor={admin:"#ef4444",mod:"#f59e0b",vip:"#8b5cf6"};
    if(msg.role&&roleBadgeColor[msg.role]){const b=document.createElement("span");b.className="dc-msg-role-badge";b.style.background=roleBadgeColor[msg.role];b.textContent=msg.role;hdr.appendChild(b);}
    if(msg.tag){const b=document.createElement("span");b.className="dc-msg-role-badge";b.style.background="#6366f1";b.textContent=msg.tag;hdr.appendChild(b);}
    const time=document.createElement("span");time.className="dc-msg-time";time.textContent=formatTime(msg.created_at);hdr.appendChild(time);
    body.appendChild(hdr);
  }

  // Reply quote
  if(msg.reply_to_id&&msg.reply_to_text){
    const ref=document.createElement("div");ref.className="dc-reply-ref";
    ref.innerHTML=`<span class="rr-author">@${esc(msg.reply_to_username||"?")} </span>${esc((msg.reply_to_text||"").slice(0,80))}`;
    ref.addEventListener("click",()=>jumpToMsg(msg.reply_to_id));body.appendChild(ref);
  }

  // Text
  if(msg.text){const d=document.createElement("div");d.className="dc-msg-text";d.innerHTML=renderText(msg.text);body.appendChild(d);}

  // Media / file
  if(msg.file_url){
    if(isImageUrl(msg.file_url)){
      const img=document.createElement("img");img.className="dc-msg-img";img.src=msg.file_url;img.loading="lazy";
      img.addEventListener("click",()=>openLightbox(msg.file_url));body.appendChild(img);
    }else{
      const fn=decodeURIComponent(msg.file_url.split("/").pop().split("?")[0]);
      const a=document.createElement("a");a.className="dc-file-chip";a.href=msg.file_url;a.target="_blank";a.rel="noopener";
      a.innerHTML=`<span class="fc-icon">📎</span><div><div class="fc-name">${esc(fn)}</div></div>`;body.appendChild(a);
    }
  }

  // Thread pill
  if(msg.thread_reply_count>0||msg.is_thread_root){
    const pill=document.createElement("div");pill.className="dc-thread-pill";
    pill.textContent=msg.thread_reply_count>0?`🧵 ${msg.thread_reply_count} repl${msg.thread_reply_count===1?"y":"ies"}`:"🧵 Open Thread";
    pill.addEventListener("click",()=>openThread(msg));body.appendChild(pill);
  }

  // Reactions
  const rxnRow=document.createElement("div");rxnRow.className="dc-reactions";rxnRow.id="rxn-"+msg.id;body.appendChild(rxnRow);

  el.appendChild(body);

  // Hover action bar
  const actions=document.createElement("div");actions.className="dc-msg-actions";
  [
    {i:"↩",t:"Reply",  fn:()=>setReply(msg)},
    {i:"😊",t:"React", fn:e=>openReactionPicker(msg.id,e)},
    {i:"🧵",t:"Thread",fn:()=>openThread(msg)},
    {i:"📌",t:"Pin",   fn:()=>pinMsg(msg)},
  ].forEach(a=>{
    const btn=document.createElement("button");btn.className="dc-action-btn";btn.title=a.t;btn.textContent=a.i;
    btn.addEventListener("click",e=>{e.stopPropagation();a.fn(e);});actions.appendChild(btn);
  });
  if(msg.user_id===currentUserId||currentProfile?.role==="admin"){
    const d=document.createElement("button");d.className="dc-action-btn";d.title="Delete";d.textContent="🗑";d.style.color="#ef4444";
    d.addEventListener("click",e=>{e.stopPropagation();deleteMsg(msg.id);});actions.appendChild(d);
  }
  el.appendChild(actions);

  el.addEventListener("contextmenu",e=>{e.preventDefault();openCtxMenu(e,msg);});
  msgElMap.set(String(msg.id),el);return el;
}

function renderText(raw){
  let t=esc(raw);
  t=applyShortcodes(t);
  t=t.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");
  t=t.replace(/\*(.+?)\*/g,"<em>$1</em>");
  t=t.replace(/`([^`]+)`/g,"<code>$1</code>");
  t=t.replace(/```([\s\S]*?)```/g,"<pre>$1</pre>");
  t=t.replace(/@(\w+)/g,(m,name)=>{
    const isMe=currentProfile&&name.toLowerCase()===(currentProfile.username||"").toLowerCase();
    const style=isMe
      ?"color:#fbbf24;background:rgba(251,191,36,.18);border-radius:3px;padding:0 3px;font-weight:700;"
      :"color:var(--a);background:rgba(59,130,246,.12);border-radius:3px;padding:0 3px;font-weight:600;";
    return `<span style="${style}">${m}</span>`;
  });
  t=t.replace(/https?:\/\/[^\s<>"]+/g,url=>`<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
  return t;
}

function patchMsgEl(el,msg){const d=el.querySelector(".dc-msg-text");if(d&&msg.text)d.innerHTML=renderText(msg.text);}
function jumpToMsg(msgId){const el=msgElMap.get(String(msgId));if(el){el.scrollIntoView({behavior:"smooth",block:"center"});el.style.background="rgba(59,130,246,.12)";setTimeout(()=>el.style.background="",1500);}}

/* ══════════════════════════════════════════════════════
   REACTIONS
══════════════════════════════════════════════════════ */
async function loadReactionsSingle(msgId){
  const{data}=await sb.from("reactions").select("emoji,user_id").eq("message_id",msgId);
  if(data)renderReactions(msgId,data);
}
function renderReactions(msgId,reactions){
  const row=document.getElementById("rxn-"+msgId);if(!row)return;
  const g={};reactions.forEach(r=>{(g[r.emoji]=g[r.emoji]||[]).push(r.user_id);});
  row.innerHTML="";
  Object.entries(g).forEach(([em,users])=>{
    const pill=document.createElement("div");pill.className="dc-reaction"+(users.includes(currentUserId)?" mine":"");
    pill.innerHTML=em+`<span class="rc-count">${users.length}</span>`;
    pill.addEventListener("click",()=>toggleReaction(msgId,em));row.appendChild(pill);
  });
}
async function toggleReaction(msgId,emoji){
  if(!currentUserId){location.href="/account";return;}
  const{data:ex}=await sb.from("reactions").select("id").eq("message_id",msgId).eq("user_id",currentUserId).eq("emoji",emoji).maybeSingle();
  if(ex)await sb.from("reactions").delete().eq("message_id",msgId).eq("user_id",currentUserId).eq("emoji",emoji);
  else   await sb.from("reactions").insert({message_id:msgId,user_id:currentUserId,emoji});
  loadReactionsSingle(msgId);
}
function openReactionPicker(msgId,e){
  const p=document.getElementById("reaction-picker");p.innerHTML="";
  QUICK_EMOJIS.forEach(em=>{const b=document.createElement("button");b.className="rp-btn";b.textContent=em;b.onclick=()=>{toggleReaction(msgId,em);p.classList.add("hidden");};p.appendChild(b);});
  p.classList.remove("hidden");
  p.style.top=Math.max(8,e.clientY-p.offsetHeight-10)+"px";
  p.style.left=Math.min(e.clientX,window.innerWidth-p.offsetWidth-8)+"px";
  setTimeout(()=>document.addEventListener("click",()=>p.classList.add("hidden"),{once:true}),10);
}
sb.channel("reactions-rt").on("postgres_changes",{event:"*",schema:"public",table:"reactions"},p=>{
  const mid=p.new?.message_id||p.old?.message_id;
  if(mid&&document.getElementById("rxn-"+mid))loadReactionsSingle(mid);
}).subscribe();

/* ══════════════════════════════════════════════════════
   CONTEXT MENU
══════════════════════════════════════════════════════ */
function openCtxMenu(e,msg){
  ctxTargetMsg=msg;const menu=document.getElementById("ctx-menu");menu.classList.remove("hidden");
  menu.style.top=Math.min(e.clientY,window.innerHeight-menu.offsetHeight-8)+"px";
  menu.style.left=Math.min(e.clientX,window.innerWidth-menu.offsetWidth-8)+"px";
  const canDel=msg.user_id===currentUserId||currentProfile?.role==="admin";
  document.getElementById("ctx-delete").style.display=canDel?"flex":"none";
  setTimeout(()=>document.addEventListener("click",()=>menu.classList.add("hidden"),{once:true}),10);
}
document.getElementById("ctx-reply").onclick=()=>ctxTargetMsg&&setReply(ctxTargetMsg);
document.getElementById("ctx-react").onclick=e=>ctxTargetMsg&&openReactionPicker(ctxTargetMsg.id,e);
document.getElementById("ctx-thread").onclick=()=>ctxTargetMsg&&openThread(ctxTargetMsg);
document.getElementById("ctx-pin").onclick=()=>ctxTargetMsg&&pinMsg(ctxTargetMsg);
document.getElementById("ctx-copy").onclick=()=>{
  const t=msgElMap.get(String(ctxTargetMsg?.id))?.querySelector(".dc-msg-text")?.textContent||"";
  navigator.clipboard.writeText(t).then(()=>showToast("📋 Copied!"));
};
document.getElementById("ctx-delete").onclick=()=>ctxTargetMsg&&deleteMsg(ctxTargetMsg.id);

/* ══════════════════════════════════════════════════════
   THREADS
══════════════════════════════════════════════════════ */
function openThread(msg){
  activeThreadId=msg.id;
  const panel=document.getElementById("thread-panel");panel.classList.remove("hidden");
  document.getElementById("pins-panel").classList.add("hidden");
  document.getElementById("members-panel").classList.add("hidden");
  document.getElementById("thread-root-msg").innerHTML=`<strong>${esc(msg.username||"")}</strong>: ${esc((msg.text||"📎 file").slice(0,200))}`;
  loadThreadMsgs(msg.id);
}
async function loadThreadMsgs(rootId){
  const list=document.getElementById("thread-messages");list.innerHTML="";
  const{data}=await sb.from("messages").select("*").eq("thread_id",rootId).order("created_at");
  (data||[]).forEach(m=>{
    const el=document.createElement("div");el.style.cssText="padding:6px 16px;";
    el.innerHTML=`<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:2px;"><span style="font-size:13px;font-weight:700;color:var(--dc-text)">${esc(m.username)}</span><span style="font-size:11px;color:var(--dc-muted)">${formatTime(m.created_at)}</span></div><div style="font-size:14px;color:var(--dc-text);">${renderText(m.text||"")}</div>`;
    list.appendChild(el);
  });
  list.scrollTop=list.scrollHeight;
}
document.getElementById("thread-close").onclick=()=>document.getElementById("thread-panel").classList.add("hidden");
document.getElementById("thread-send").onclick=sendThreadMsg;
document.getElementById("thread-input").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendThreadMsg();}};
async function sendThreadMsg(){
  if(!currentUserId||!activeThreadId)return;
  const inp=document.getElementById("thread-input");const text=inp.value.trim();if(!text)return;
  const p=currentProfile;inp.value="";
  await sb.from("messages").insert({user_id:currentUserId,username:p.username,avatar_url:p.avatar_url,text:filterProfanity(applyShortcodes(text)),thread_id:activeThreadId,channel_id:activeRoom.type==="channel"?activeRoom.id:null});
  try { await sb.rpc("increment_thread_count",{msg_id:activeThreadId}); } catch(e) {}
  await loadThreadMsgs(activeThreadId);
}

/* ══════════════════════════════════════════════════════
   PINS
══════════════════════════════════════════════════════ */
async function pinMsg(msg){
  if(!currentUserId)return;
  const r=activeRoom;
  await sb.from("pinned_messages").insert({channel_id:r.type==="channel"?r.id:null,server_id:r.serverId||null,message_id:msg.id,pinned_by:currentUserId});
  showToast("📌 Message pinned");
}
async function loadPins(){
  const list=document.getElementById("pins-list");list.innerHTML="";const r=activeRoom;
  let q=sb.from("pinned_messages").select("*,messages(id,text,username)");
  if(r.type==="channel")q=q.eq("channel_id",r.id);else if(r.serverId)q=q.eq("server_id",r.serverId);
  const{data}=await q.order("created_at",{ascending:false});
  if(!data||!data.length){list.innerHTML=`<div style="padding:16px;text-align:center;font-size:13px;color:var(--dc-muted);">No pinned messages</div>`;return;}
  data.forEach(pin=>{
    const msg=pin.messages;const item=document.createElement("div");item.className="pin-item";
    item.innerHTML=`<div class="pi-author">${esc(msg?.username||"Unknown")}</div><div class="pi-text">${esc((msg?.text||"📎 file").slice(0,100))}</div>`;
    item.onclick=()=>jumpToMsg(pin.message_id);list.appendChild(item);
  });
}
document.getElementById("btnPins").onclick=()=>{const p=document.getElementById("pins-panel");const h=p.classList.contains("hidden");closeAllPanels();if(h){p.classList.remove("hidden");loadPins();}};
document.getElementById("pins-close").onclick=()=>document.getElementById("pins-panel").classList.add("hidden");

/* ══════════════════════════════════════════════════════
   MEMBERS
══════════════════════════════════════════════════════ */
async function loadMembers(){
  const list=document.getElementById("members-list");list.innerHTML="";
  if(!activeRoom.serverId){list.innerHTML=`<div style="padding:16px;font-size:13px;color:var(--dc-muted);">Members visible in servers.</div>`;return;}
  const{data:mems}=await sb.from("server_members").select("user_id").eq("server_id",activeRoom.serverId);
  if(!mems||!mems.length){list.innerHTML=`<div style="padding:16px;font-size:13px;color:var(--dc-muted);">No members found.</div>`;return;}
  const profiles=await Promise.all(mems.map(m=>getProfile(m.user_id)));
  const groups={Admin:[],Mod:[],Member:[]};
  profiles.forEach(p=>{ if(p.role==="admin")groups.Admin.push(p);else if(p.role==="mod")groups.Mod.push(p);else groups.Member.push(p); });
  Object.entries(groups).forEach(([role,ps])=>{
    if(!ps.length)return;
    const sec=document.createElement("div");sec.className="member-role-section";sec.textContent=`${role} — ${ps.length}`;list.appendChild(sec);
    ps.forEach(p=>{
      const item=document.createElement("div");item.className="member-item";
      const av=document.createElement("div");av.className="mi-av";
      if(p.avatar_url){const img=document.createElement("img");img.src=p.avatar_url;av.appendChild(img);}else av.textContent=getInitials(p.username);
      const name=document.createElement("span");name.textContent=p.username||"User";
      const dot=document.createElement("div");dot.className="mi-status online";
      item.appendChild(av);item.appendChild(name);item.appendChild(dot);
      item.addEventListener("click",()=>showProfilePopup(mems[profiles.indexOf(p)]?.user_id,item));
      list.appendChild(item);
    });
  });
}
document.getElementById("btnMembers").onclick=()=>{const p=document.getElementById("members-panel");const h=p.classList.contains("hidden");closeAllPanels();if(h){p.classList.remove("hidden");loadMembers();}};
document.getElementById("members-close").onclick=()=>document.getElementById("members-panel").classList.add("hidden");

/* ══════════════════════════════════════════════════════
   TYPING
══════════════════════════════════════════════════════ */
function renderTyping(){
  const el=document.getElementById("dc-typing");
  const users=Object.values(typingUsers);if(!users.length){el.innerHTML="";return;}
  const names=users.slice(0,3).map(u=>u.username).join(", ");
  const label=users.length===1?`${names} is typing`:users.length<=3?`${names} are typing`:`${users.length} people are typing`;
  el.innerHTML=`<div class="dc-typing-dots"><span></span><span></span><span></span></div><span>${esc(label)}…</span>`;
}

/* ══════════════════════════════════════════════════════
   REPLY BAR
══════════════════════════════════════════════════════ */
function setReply(msg){
  replyingTo=msg;
  document.getElementById("reply-author").textContent=msg.username||"Unknown";
  document.getElementById("reply-preview").textContent=(msg.text||"📎 file").slice(0,80);
  document.getElementById("dc-reply-bar").classList.remove("hidden");
  document.getElementById("msgInput").focus();
}
document.getElementById("reply-cancel-btn").onclick=()=>{replyingTo=null;document.getElementById("dc-reply-bar").classList.add("hidden");};

/* ══════════════════════════════════════════════════════
   FILE UPLOAD
══════════════════════════════════════════════════════ */
document.getElementById("attachBtn").onclick=()=>document.getElementById("fileInput").click();
document.getElementById("fileInput").onchange=e=>{
  const f=e.target.files[0];if(!f)return;
  if(f.size>10*1024*1024){showToast("❌ Max file size is 10 MB");return;}
  pendingFile=f;document.getElementById("up-name").textContent=f.name;
  document.getElementById("up-icon").textContent=f.type.startsWith("image/")?"🖼️":"📎";
  document.getElementById("dc-upload-preview").classList.remove("hidden");e.target.value="";
};
document.getElementById("up-cancel").onclick=clearUpload;
function clearUpload(){pendingFile=null;document.getElementById("dc-upload-preview").classList.add("hidden");document.getElementById("dc-upload-bar").classList.add("hidden");}
async function uploadFile(file){
  const ext=file.name.split(".").pop().toLowerCase();
  const path=`${currentUserId||"anon"}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const bar=document.getElementById("dc-upload-bar");const fill=document.getElementById("dc-upload-fill");
  bar.classList.remove("hidden");fill.style.width="30%";
  const{error}=await sb.storage.from("chat-uploads").upload(path,file,{cacheControl:"3600",upsert:false});
  fill.style.width="100%";setTimeout(()=>{bar.classList.add("hidden");fill.style.width="0";},500);
  if(error){showToast("❌ Upload failed: "+error.message);return null;}
  const{data:u}=sb.storage.from("chat-uploads").getPublicUrl(path);return u?.publicUrl||null;
}

/* ══════════════════════════════════════════════════════
   EMOJI PICKER
══════════════════════════════════════════════════════ */
const emojiPicker=document.getElementById("dcEmojiPicker");
ALL_EMOJIS.forEach(em=>{
  const b=document.createElement("button");b.className="dc-emoji-btn";b.textContent=em;
  b.onclick=e=>{e.stopPropagation();const inp=document.getElementById("msgInput");const p=inp.selectionStart;inp.value=inp.value.slice(0,p)+em+inp.value.slice(p);inp.focus();emojiPicker.classList.add("hidden");};
  emojiPicker.appendChild(b);
});
document.getElementById("emojiBtn").onclick=e=>{e.stopPropagation();emojiPicker.classList.toggle("hidden");};
document.addEventListener("click",()=>emojiPicker.classList.add("hidden"));

/* ══════════════════════════════════════════════════════
   TEXTAREA AUTO-RESIZE + TYPING BROADCAST
══════════════════════════════════════════════════════ */
const msgInput=document.getElementById("msgInput");
let typingDebounce;
msgInput.addEventListener("input",()=>{
  msgInput.style.height="auto";msgInput.style.height=Math.min(msgInput.scrollHeight,180)+"px";
  clearTimeout(typingDebounce);typingDebounce=setTimeout(()=>{
    if(!currentUserId||!typingChannel||!currentProfile)return;
    typingChannel.send({type:"broadcast",event:"typing",payload:{username:currentProfile.username,uid:currentUserId}});
  },200);
  handleMentionAC();
});

/* ══════════════════════════════════════════════════════
   SEND
══════════════════════════════════════════════════════ */
document.getElementById("sendBtn").onclick=sendMessage;
msgInput.onkeydown=e=>{
  if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}
  if(e.key==="Escape")document.getElementById("dc-mention-popup").innerHTML="";
  if(e.key==="ArrowUp"&&document.getElementById("dc-mention-popup").children.length){e.preventDefault();mentionSelIdx=Math.max(0,mentionSelIdx-1);handleMentionAC();}
  if(e.key==="ArrowDown"&&document.getElementById("dc-mention-popup").children.length){e.preventDefault();mentionSelIdx=Math.min(7,mentionSelIdx+1);handleMentionAC();}
  if(e.key==="Tab"&&document.getElementById("dc-mention-popup").children.length){e.preventDefault();const active=document.querySelector(".dc-mention-item.active");if(active)insertMention(active.dataset.user);}
};

async function sendMessage(){
  if(isSending)return;
  if(slowModeSeconds>0){const el=(Date.now()-lastSentTime)/1000;if(el<slowModeSeconds){showToast(`🐌 Slow mode — wait ${Math.ceil(slowModeSeconds-el)}s`);return;}}
  const text=msgInput.value.trim();if(!text&&!pendingFile)return;
  const{data:{session}}=await sb.auth.getSession();if(!session){location.href="/account";return;}
  // Always re-fetch own profile so ban/mute state is current
  delete profileCache[session.user.id];
  const p=await getProfile(session.user.id);
  currentProfile=p;
  // Enforce ban
  if(p.banned){showToast("🚫 You have been banned from 360 Chat.");return;}
  // Enforce mute
  if(isMuted(p)){showToast(`🔇 You are muted for another ${muteExpiryText(p)}.`);return;}
  if(text.startsWith("/")){await runCommand(text,p);msgInput.value="";msgInput.style.height="auto";return;}
  isSending=true;document.getElementById("sendBtn").disabled=true;
  try{
    let fileUrl=null;
    if(pendingFile){fileUrl=await uploadFile(pendingFile);if(fileUrl===null)return;clearUpload();}
    const payload={user_id:session.user.id,username:p.username||session.user.email,avatar_url:p.avatar_url||null,tag:p.tag||null,role:p.role||"user",text:filterProfanity(applyShortcodes(text||"")),file_url:fileUrl};
    if(replyingTo){payload.reply_to_id=replyingTo.id;payload.reply_to_username=replyingTo.username;payload.reply_to_text=(replyingTo.text||"").slice(0,100);replyingTo=null;document.getElementById("dc-reply-bar").classList.add("hidden");}
    if(activeRoom.type==="dm"){payload.dm_id=activeRoom.id;await sb.from("dm_messages").insert(payload);await sb.from("direct_messages").update({updated_at:new Date().toISOString()}).eq("id",activeRoom.id);}
    else{if(activeRoom.type==="channel")payload.channel_id=activeRoom.id;else if(activeRoom.type==="server")payload.server_id=activeRoom.id;await sb.from("messages").insert(payload);}
    msgInput.value="";msgInput.style.height="auto";lastSentTime=Date.now();
  }finally{isSending=false;document.getElementById("sendBtn").disabled=false;}
}

async function deleteMsg(msgId){
  if(!confirm("Delete this message?"))return;
  if(activeRoom.type==="dm")await sb.from("dm_messages").delete().eq("id",msgId);
  else await sb.from("messages").update({deleted_at:new Date().toISOString()}).eq("id",msgId);
  msgElMap.get(String(msgId))?.remove();msgElMap.delete(String(msgId));
}

/* ══════════════════════════════════════════════════════
   SLASH COMMANDS
══════════════════════════════════════════════════════ */
const CMDS=[
  // ── Anyone ──────────────────────────────────────────────
  {c:"/me",      mod:false, fn:async(args,p,pay)=>{pay.text=`_${p.username} ${filterProfanity(args)}_`;await insertMsg(pay);}},
  {c:"/shrug",   mod:false, fn:async()=>{msgInput.value="¯\\_(ツ)_/¯";}},
  {c:"/help",    mod:false, fn:async(args,p)=>{
    const all=CMDS.filter(c=>!c.mod||requiresMod(p));
    showToast(all.map(c=>c.c).join("  ·  "),5000);
  }},
  // ── Mod / Admin only ────────────────────────────────────
  {c:"/clear",   mod:true, fn:async()=>{document.getElementById("dc-messages").innerHTML="";msgElMap.clear();}},
  {c:"/slow",    mod:true, fn:async(args)=>{slowModeSeconds=parseInt(args)||0;showToast(slowModeSeconds?`🐌 Slow mode: ${slowModeSeconds}s`:"✅ Slow mode off");}},
  {c:"/warn",    mod:true, fn:async(args,p)=>{
    const[target,...rest]=args.split(" ");const reason=rest.join(" ")||"No reason given";
    if(!target){showToast("Usage: /warn <username> [reason]");return;}
    const{data:tgt}=await sb.from("profiles").select("id,username,warn_count").eq("username",target.replace(/^@/,"")).maybeSingle();
    if(!tgt){showToast("❌ User not found.");return;}
    const newCount=(tgt.warn_count||0)+1;
    await sb.from("profiles").update({warn_count:newCount}).eq("id",tgt.id);
    // Auto-mute at 3 warnings (1 hour), auto-ban at 5
    let extra="";
    if(newCount>=5){
      await sb.from("profiles").update({banned:true}).eq("id",tgt.id);
      await logAutomod(tgt.id,tgt.username,"auto_ban",`${newCount} warnings — last: ${reason}`);
      extra=" (auto-banned after 5 warnings)";
    } else if(newCount>=3){
      const muteUntil=new Date(Date.now()+60*60*1000).toISOString();
      await sb.from("profiles").update({muted_until:muteUntil}).eq("id",tgt.id);
      await logAutomod(tgt.id,tgt.username,"auto_mute","3 warnings reached",muteUntil);
      extra=" (auto-muted 1h)";
    }
    await logAutomod(tgt.id,tgt.username,"warn",reason);
    const pay={user_id:p.id||currentUserId,username:p.username,avatar_url:p.avatar_url,role:p.role};
    pay.text=`⚠️ **Warning ${newCount}/5** to @${tgt.username}: ${reason}${extra} — by ${p.username}`;
    await insertMsg(pay);
    showToast(`⚠️ Warned ${tgt.username} (${newCount}/5)${extra}`);
  }},
  {c:"/mute",    mod:true, fn:async(args,p)=>{
    const[target,mins,...rest]=args.split(" ");const reason=rest.join(" ")||"No reason given";
    if(!target||!mins||isNaN(parseInt(mins))){showToast("Usage: /mute <username> <minutes> [reason]");return;}
    const{data:tgt}=await sb.from("profiles").select("id,username").eq("username",target.replace(/^@/,"")).maybeSingle();
    if(!tgt){showToast("❌ User not found.");return;}
    const muteUntil=new Date(Date.now()+parseInt(mins)*60*1000).toISOString();
    await sb.from("profiles").update({muted_until:muteUntil}).eq("id",tgt.id);
    await logAutomod(tgt.id,tgt.username,"mute",`${mins}m — ${reason}`,muteUntil);
    const pay={user_id:currentUserId,username:p.username,avatar_url:p.avatar_url,role:p.role};
    pay.text=`🔇 @${tgt.username} muted for ${mins} minute(s): ${reason} — by ${p.username}`;
    await insertMsg(pay);
    showToast(`🔇 Muted ${tgt.username} for ${mins}m`);
  }},
  {c:"/unmute",  mod:true, fn:async(args,p)=>{
    const target=args.trim().replace(/^@/,"");if(!target){showToast("Usage: /unmute <username>");return;}
    const{data:tgt}=await sb.from("profiles").select("id,username").eq("username",target).maybeSingle();
    if(!tgt){showToast("❌ User not found.");return;}
    await sb.from("profiles").update({muted_until:null}).eq("id",tgt.id);
    await logAutomod(tgt.id,tgt.username,"unmute",`by ${p.username}`);
    showToast(`✅ Unmuted ${tgt.username}`);
  }},
  {c:"/ban",     mod:true, fn:async(args,p)=>{
    const[target,...rest]=args.split(" ");const reason=rest.join(" ")||"No reason given";
    if(!target){showToast("Usage: /ban <username> [reason]");return;}
    const{data:tgt}=await sb.from("profiles").select("id,username,role").eq("username",target.replace(/^@/,"")).maybeSingle();
    if(!tgt){showToast("❌ User not found.");return;}
    if(tgt.role==="admin"){showToast("❌ Cannot ban an admin.");return;}
    await sb.from("profiles").update({banned:true}).eq("id",tgt.id);
    await logAutomod(tgt.id,tgt.username,"ban",`${reason} — by ${p.username}`);
    const pay={user_id:currentUserId,username:p.username,avatar_url:p.avatar_url,role:p.role};
    pay.text=`🚫 @${tgt.username} has been banned: ${reason} — by ${p.username}`;
    await insertMsg(pay);
    showToast(`🚫 Banned ${tgt.username}`);
  }},
  {c:"/unban",   mod:true, fn:async(args,p)=>{
    const target=args.trim().replace(/^@/,"");if(!target){showToast("Usage: /unban <username>");return;}
    const{data:tgt}=await sb.from("profiles").select("id,username").eq("username",target).maybeSingle();
    if(!tgt){showToast("❌ User not found.");return;}
    await sb.from("profiles").update({banned:false,warn_count:0}).eq("id",tgt.id);
    await logAutomod(tgt.id,tgt.username,"unban",`by ${p.username}`);
    showToast(`✅ Unbanned ${tgt.username}`);
  }},
  {c:"/promote", mod:true, fn:async(args,p)=>{
    if(p.role!=="admin"){showToast("❌ Only admins can promote.");return;}
    const target=args.trim().replace(/^@/,"");
    await sb.from("profiles").update({role:"mod"}).eq("username",target);
    await logAutomod(null,target,"promote",`by ${p.username}`);
    showToast("✅ Promoted "+target+" to mod");
  }},
  {c:"/demote",  mod:true, fn:async(args,p)=>{
    if(p.role!=="admin"){showToast("❌ Only admins can demote.");return;}
    const target=args.trim().replace(/^@/,"");
    await sb.from("profiles").update({role:"user"}).eq("username",target);
    await logAutomod(null,target,"demote",`by ${p.username}`);
    showToast("✅ Demoted "+target);
  }},
  {c:"/announce",mod:true, fn:async(args,p,pay)=>{pay.text=`📢 **${args}**`;await insertMsg(pay);}},
  {c:"/delete",  mod:true, fn:async(args)=>{const id=parseInt(args);if(id)await deleteMsg(id);}},
];
async function insertMsg(payload){
  if(activeRoom.type==="channel")payload.channel_id=activeRoom.id;else if(activeRoom.type==="server")payload.server_id=activeRoom.id;
  const{error}=await sb.from("messages").insert(payload);
  if(error){console.error("insertMsg failed:",error);showToast("❌ Could not send message: "+error.message);}
}
async function runCommand(text,p){
  const parts=text.split(" ");const cmd=parts[0].toLowerCase();const args=parts.slice(1).join(" ");
  const def=CMDS.find(c=>c.c===cmd);
  if(!def){showToast("❌ Unknown command. Try /help");return;}
  if(def.mod&&!requiresMod(p)){showToast("❌ You need to be a mod or admin to use "+cmd);return;}
  const{data:{session}}=await sb.auth.getSession();
  const payload={user_id:session.user.id,username:p.username,avatar_url:p.avatar_url,role:p.role};
  await def.fn(args,p,payload);
}

/* ══════════════════════════════════════════════════════
   @MENTION AUTOCOMPLETE
══════════════════════════════════════════════════════ */
function registerUser(username){if(username&&!knownUsers.includes(username))knownUsers.push(username);}
function handleMentionAC(){
  const val=msgInput.value;const pos=msgInput.selectionStart||0;
  const before=val.slice(0,pos);const match=before.match(/@(\w*)$/);
  const popup=document.getElementById("dc-mention-popup");
  if(!match){popup.innerHTML="";mentionQuery=null;return;}
  mentionQuery=match[1];mentionStart=pos-match[0].length;
  const matches=knownUsers.filter(u=>u.toLowerCase().startsWith(mentionQuery.toLowerCase())).slice(0,8);
  if(!matches.length){popup.innerHTML="";return;}
  popup.innerHTML=matches.map((u,i)=>`<div class="dc-mention-item${i===mentionSelIdx?" active":""}" data-user="${esc(u)}">@${esc(u)}</div>`).join("");
  popup.querySelectorAll(".dc-mention-item").forEach(opt=>opt.addEventListener("mousedown",e=>{e.preventDefault();insertMention(opt.dataset.user);}));
}
function insertMention(username){const val=msgInput.value;msgInput.value=val.slice(0,mentionStart)+"@"+username+" "+val.slice(msgInput.selectionStart);mentionQuery=null;document.getElementById("dc-mention-popup").innerHTML="";msgInput.focus();}

/* ══════════════════════════════════════════════════════
   PROFILE POPUP
══════════════════════════════════════════════════════ */
async function showProfilePopup(userId,anchorEl){
  if(!userId)return;
  const p=await getProfile(userId);
  const popup=document.getElementById("profile-popup");
  const bc={admin:"#ef4444",mod:"#f59e0b",user:"#3b82f6"};
  document.getElementById("pp-banner").style.background=bc[p.role||"user"]||"#3b82f6";
  const av=document.getElementById("pp-avatar");av.innerHTML="";
  if(p.avatar_url){const img=document.createElement("img");img.src=p.avatar_url;img.style.cssText="width:100%;height:100%;border-radius:50%;object-fit:cover;";av.appendChild(img);}else av.textContent=getInitials(p.username);
  document.getElementById("pp-name").textContent=p.username||"Unknown";
  document.getElementById("pp-tag").textContent=p.tag?`[${p.tag}]`:"";
  const re=document.getElementById("pp-role");re.textContent=p.role||"user";re.style.background=bc[p.role||"user"]||"#3b82f6";
  document.getElementById("pp-email").textContent=p.email||"";
  const dmBtn=document.getElementById("pp-dm-btn");dmBtn.style.display=userId===currentUserId?"none":"block";
  dmBtn.onclick=async()=>{popup.classList.add("hidden");if(p.email)await startDMWith(p.email);};
  const rect=anchorEl.getBoundingClientRect();
  popup.style.top=Math.min(rect.bottom+6,window.innerHeight-320)+"px";
  popup.style.left=Math.min(rect.right+8,window.innerWidth-300)+"px";
  popup.classList.remove("hidden");
}
document.addEventListener("click",e=>{if(!document.getElementById("profile-popup").contains(e.target))document.getElementById("profile-popup").classList.add("hidden");});

/* ══════════════════════════════════════════════════════
   DM HELPERS
══════════════════════════════════════════════════════ */
async function startDMWith(emailOrUsername){
  let profile;
  const{data:byEmail}=await sb.from("profiles").select("id,username,email").eq("email",emailOrUsername.toLowerCase()).maybeSingle();
  if(byEmail){profile=byEmail;}else{const un=emailOrUsername.replace(/^@/,"");const{data:byUser}=await sb.from("profiles").select("id,username,email").eq("username",un).maybeSingle();profile=byUser;}
  if(!profile){document.getElementById("dm-err").textContent="No user found.";return;}
  if(profile.id===currentUserId){document.getElementById("dm-err").textContent="That's you!";return;}
  const{data:ex}=await sb.from("direct_messages").select("id").or(`and(user_a.eq.${currentUserId},user_b.eq.${profile.id}),and(user_a.eq.${profile.id},user_b.eq.${currentUserId})`).maybeSingle();
  let dmId;
  if(ex){dmId=ex.id;}else{const{data:nd,error}=await sb.from("direct_messages").insert({user_a:currentUserId,user_b:profile.id}).select().single();if(error){document.getElementById("dm-err").textContent=error.message;return;}dmId=nd.id;}
  closeModal("dmModal");showingDMs=true;setActiveServer(null);await buildSidebar(null);
  switchRoom({type:"dm",id:dmId,name:profile.username,icon:"@",serverId:null,serverName:"Direct Messages",otherId:profile.id});
}

/* ══════════════════════════════════════════════════════
   MODALS
══════════════════════════════════════════════════════ */
function openModal(id){document.getElementById(id)?.classList.remove("hidden");}
function closeModal(id){document.getElementById(id)?.classList.add("hidden");}

// Server create
document.getElementById("railAddServer").onclick=()=>{if(!currentUserId){location.href="/account";return;}["sm-name","sm-icon","sm-desc","sm-pass"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});document.getElementById("sm-icon").value="🌐";document.getElementById("sm-err").textContent="";document.getElementById("serverModalTitle").textContent="Create Server";document.getElementById("sm-submit").textContent="Create";openModal("serverModal");};
document.getElementById("sm-cancel").onclick=()=>closeModal("serverModal");
document.getElementById("sm-submit").onclick=async()=>{
  const name=document.getElementById("sm-name").value.trim();if(!name){document.getElementById("sm-err").textContent="Name required.";return;}
  const icon=document.getElementById("sm-icon").value.trim()||"🌐";const desc=document.getElementById("sm-desc").value.trim();const pass=document.getElementById("sm-pass").value.trim();
  const btn=document.getElementById("sm-submit");btn.disabled=true;btn.textContent="Creating…";
  const{data:server,error}=await sb.from("servers").insert({name,icon,description:desc||null,passcode:pass||null,owner_id:currentUserId}).select().single();
  if(error){document.getElementById("sm-err").textContent=error.message;btn.disabled=false;btn.textContent="Create";return;}
  await sb.from("channels").insert({name:"general",server_id:server.id,is_public:true,category:"TEXT CHANNELS"});
  await sb.from("server_members").insert({server_id:server.id,user_id:currentUserId});
  closeModal("serverModal");btn.disabled=false;btn.textContent="Create";await buildRail();await enterServer(server);
};

// Edit server
function openEditServerModal(server){
  document.getElementById("sm-name").value=server.name;document.getElementById("sm-icon").value=server.icon||"🌐";document.getElementById("sm-desc").value=server.description||"";document.getElementById("sm-pass").value="";document.getElementById("sm-err").textContent="";
  document.getElementById("serverModalTitle").textContent="Edit Server";const btn=document.getElementById("sm-submit");btn.textContent="Save";
  const orig=btn.onclick;btn.onclick=async()=>{
    const n=document.getElementById("sm-name").value.trim();if(!n)return;
    await sb.from("servers").update({name:n,icon:document.getElementById("sm-icon").value.trim()||"🌐",description:document.getElementById("sm-desc").value.trim()||null}).eq("id",server.id);
    closeModal("serverModal");btn.onclick=orig;btn.textContent="Create";await buildRail();
  };
  openModal("serverModal");
}

// Add channel
function openAddChannelModal(server){
  document.getElementById("ch-name").value="";document.getElementById("ch-cat").value="TEXT CHANNELS";document.getElementById("ch-topic").value="";document.getElementById("ch-err").textContent="";
  document.getElementById("ch-create").dataset.serverId=server.id;openModal("channelModal");
}
document.getElementById("ch-cancel").onclick=()=>closeModal("channelModal");
document.getElementById("ch-create").onclick=async()=>{
  const sid=document.getElementById("ch-create").dataset.serverId;
  const name=document.getElementById("ch-name").value.trim().toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,"");
  if(!name){document.getElementById("ch-err").textContent="Channel name required.";return;}
  const{error}=await sb.from("channels").insert({name,server_id:sid,is_public:true,category:document.getElementById("ch-cat").value.trim()||"TEXT CHANNELS",topic:document.getElementById("ch-topic").value.trim()||null});
  if(error){document.getElementById("ch-err").textContent=error.message;return;}
  closeModal("channelModal");const{data:s}=await sb.from("servers").select("*").eq("id",sid).maybeSingle();if(s)await buildSidebar(s);
};

// DM modal
document.getElementById("railDMs").onclick=async()=>{
  if(!currentUserId){location.href="/account";return;}
  showingDMs=!showingDMs;setActiveServer(null);await buildSidebar(null);
  document.getElementById("railDMs").classList.toggle("active",showingDMs);
};
document.getElementById("dm-cancel").onclick=()=>closeModal("dmModal");
document.getElementById("dm-start").onclick=async()=>await startDMWith(document.getElementById("dm-target").value.trim());
document.getElementById("dm-target").onkeydown=e=>{if(e.key==="Enter")document.getElementById("dm-start").click();};

// Mobile back
document.getElementById("dcMobileBack").onclick=()=>document.getElementById("dcSidebar").classList.toggle("mobile-open");

// Lightbox
function openLightbox(src){document.getElementById("lightbox-img").src=src;document.getElementById("lightbox").classList.remove("hidden");}
document.getElementById("lightbox").onclick=e=>{if(e.target===e.currentTarget)document.getElementById("lightbox").classList.add("hidden");};
document.getElementById("lightbox-close").onclick=()=>document.getElementById("lightbox").classList.add("hidden");

// Mobile sidebar toggle (hamburger in the rail)
document.getElementById("sidebarToggle")?.addEventListener("click",()=>{
  document.getElementById("dcSidebar").classList.toggle("mobile-open");
});

// Server settings menu button — open edit modal if user owns the server
document.getElementById("sb-server-menu")?.addEventListener("click",async()=>{
  if(!activeRoom.serverId||!currentUserId)return;
  const{data:server}=await sb.from("servers").select("*").eq("id",activeRoom.serverId).maybeSingle();
  if(server&&(server.owner_id===currentUserId||currentProfile?.role==="admin")){
    openEditServerModal(server);
  }else{
    showToast("Only the server owner can edit settings.");
  }
});

// joinModal cancel/join buttons (legacy fallback — passcode gate handles inline)
document.getElementById("jm-cancel")?.addEventListener("click",()=>closeModal("joinModal"));
document.getElementById("jm-join")?.addEventListener("click",async()=>{
  const pass=document.getElementById("jm-pass")?.value.trim();
  const err=document.getElementById("jm-err");
  const serverId=document.getElementById("jm-join")?.dataset.serverId;
  if(!serverId)return;
  const{data:server}=await sb.from("servers").select("*").eq("id",serverId).maybeSingle();
  if(!server){if(err)err.textContent="Server not found.";return;}
  if(server.passcode&&pass!==server.passcode){if(err)err.textContent="Wrong passcode.";return;}
  closeModal("joinModal");
  await joinServer(server.id);await enterServer(server);
});

/* ══════════════════════════════════════════════════════
   PRESENCE + NOTIFICATIONS
══════════════════════════════════════════════════════ */
function startPresence(){
  if(!currentUserId)return;
  const presenceChan=sb.channel("presence-global",{config:{presence:{key:currentUserId}}});
  presenceChan
    .on("presence",{event:"sync"},()=>{document.getElementById("onlineCount").textContent=Object.keys(presenceChan.presenceState()).length;})
    .subscribe(async s=>{if(s==="SUBSCRIBED")await presenceChan.track({uid:currentUserId,username:currentProfile?.username});});
}

function trackUnread(msg){
  const t=msg.channel_id?"channel":msg.server_id?"server":msg.dm_id?"dm":"public";
  const id=msg.channel_id||msg.server_id||msg.dm_id||"public";
  const key=`${t}:${id}`;if(key===getRoomKey(activeRoom)||msg.user_id===currentUserId)return;
  unreadCounts[key]=(unreadCounts[key]||0)+1;
  document.querySelector(`.rail-server-icon[data-server-id="${msg.server_id}"]`)?.classList.add("unread");
  if(!document.hasFocus()){const orig=document.title;let i=0;const ti=setInterval(()=>{document.title=i++%2===0?"💬 New message!":orig;if(i>6){clearInterval(ti);document.title=orig;}},700);}
}

async function markRoomRead(room){
  if(!currentUserId)return;
  unreadCounts[getRoomKey(room)]=0;
  document.querySelector(`.rail-server-icon[data-server-id="${room.serverId}"]`)?.classList.remove("unread");
  try {
    await sb.from("last_read").upsert(
      {user_id:currentUserId,room_type:room.type,room_id:String(room.id),last_read_at:new Date().toISOString()},
      {onConflict:"user_id,room_type,room_id"}
    );
  } catch(e) { console.warn("markRoomRead:",e); }
}

/* ══════════════════════════════════════════════════════
   AUTO-TRANSLATE
══════════════════════════════════════════════════════ */
async function maybeTranslateMessage(el,text){
  const lang=document.getElementById("translateLang")?.value;if(!lang||!text||text.length<3)return;
  const key=lang+":"+text;if(translateCache[key]){appendTranslation(el,translateCache[key]);return;}
  try{const r=await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=autodetect|${lang}`);const d=await r.json();const t=d?.responseData?.translatedText;if(!t||t===text)return;translateCache[key]=t;appendTranslation(el,t);}catch{}
}
function appendTranslation(el,text){if(el.querySelector(".dc-translation"))return;const d=el.querySelector(".dc-msg-text");if(!d)return;const p=document.createElement("div");p.className="dc-translation";p.style.cssText="font-size:12px;color:var(--dc-muted);margin-top:3px;font-style:italic;";p.textContent="⟳ "+text;d.after(p);}
document.getElementById("translateLang")?.addEventListener("change",()=>{document.querySelectorAll(".dc-translation").forEach(el=>el.remove());const lang=document.getElementById("translateLang").value;if(!lang)return;msgElMap.forEach((el)=>{const t=el.querySelector(".dc-msg-text")?.textContent;if(t)maybeTranslateMessage(el,t);});});

/* ══════════════════════════════════════════════════════
   USER CHIP
══════════════════════════════════════════════════════ */
function updateUserChip(){
  const nameEl=document.getElementById("dcUserName");const avEl=document.getElementById("dcUserAv");
  if(!currentProfile){nameEl.textContent="Not signed in";avEl.textContent="?";return;}
  const fn=[currentProfile.first_name,currentProfile.last_name].filter(Boolean).join(" ")||currentProfile.username||"User";
  nameEl.textContent=fn;avEl.innerHTML="";
  if(currentProfile.avatar_url){const img=document.createElement("img");img.src=currentProfile.avatar_url;img.style.cssText="width:100%;height:100%;border-radius:50%;object-fit:cover;";avEl.appendChild(img);}
  else avEl.textContent=getInitials(fn);
}

/* ══════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════ */
(async()=>{
  try{
    const{data:{session}}=await sb.auth.getSession();
    currentUserId=session?.user?.id||null;
    if(currentUserId)currentProfile=await getProfile(currentUserId);
    updateUserChip();
    await buildRail();
    await buildSidebar(null);
    switchRoom({type:"public",id:"public",name:"general",icon:"#",serverName:"360 Chat",serverId:null});
    // Sync notification system with initial room (notifications.js loaded after us, so defer briefly)
    setTimeout(()=>window.ChatNotif?.onRoomSwitch(activeRoom),0);
    startPresence();
    sb.auth.onAuthStateChange(async(_,session)=>{
      currentUserId=session?.user?.id||null;
      currentProfile=currentUserId?await getProfile(currentUserId):null;
      if(currentUserId)profileCache[currentUserId]=currentProfile;
      updateUserChip();await buildRail();
    });
  }catch(e){console.error("Chat init error:",e);}
})();
