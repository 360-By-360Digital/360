(function(){
  const KEYS={
    notes:'360_quick_notes_v1',
    pomodoro:'360_pomodoro_minutes',
    focus:'360_focus_mode'
  };
  const ROUTES=[
    ['Home','/'],['AI','/ai'],['Weather','/weather'],['Translator','/translator'],['Stocks','/stocks'],['Chat','/chat'],['News','/news'],['Apps','/apps'],['Games','/games'],['Settings','/settings.html']
  ];

  function injectUI(){
    if(document.getElementById('v3Fab')) return;
    const style=document.createElement('style');
    style.textContent=`
      #v3Fab{position:fixed;right:14px;bottom:14px;z-index:1200;border:none;border-radius:999px;padding:10px 14px;background:linear-gradient(120deg,var(--a),var(--a2));font-weight:700;cursor:pointer}
      #v3Panel{position:fixed;right:14px;bottom:58px;z-index:1200;width:min(360px,92vw);background:rgba(15,23,42,.9);color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:10px;display:none;backdrop-filter:blur(8px)}
      #v3Panel.open{display:block}.v3row{display:flex;gap:6px;margin-bottom:8px}.v3row>*{flex:1}
      .v3input{width:100%;padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff}
      .v3btn{padding:8px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.12);color:#fff;cursor:pointer}
      #v3Cmd{position:fixed;inset:0;background:rgba(2,6,23,.7);z-index:1300;display:none;align-items:flex-start;justify-content:center;padding-top:12vh}
      #v3Cmd.open{display:flex}#v3CmdBox{width:min(680px,92vw);background:#0f172a;border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:10px}
      #v3CmdList button{display:block;width:100%;text-align:left;margin-top:6px}
      body.v3-focus .sidebar, body.v3-focus .auth-top-right, body.v3-focus .settings-panel{display:none!important}
    `;
    document.head.appendChild(style);

    const fab=document.createElement('button'); fab.id='v3Fab'; fab.textContent='V3 ⚡';
    const panel=document.createElement('section'); panel.id='v3Panel'; panel.innerHTML=`
      <div style="font-size:12px;opacity:.8;margin-bottom:8px;">Quick Hub (Frontend-only)</div>
      <div class="v3row"><button class="v3btn" id="v3FocusBtn">Toggle Focus</button><button class="v3btn" id="v3CmdBtn">Command Palette</button></div>
      <div class="v3row"><input class="v3input" id="v3Pomodoro" type="number" min="5" max="120" placeholder="Pomodoro minutes"/><button class="v3btn" id="v3PomodoroStart">Start</button></div>
      <textarea class="v3input" id="v3Notes" rows="4" placeholder="Quick notes (local)"></textarea>
      <div class="v3row"><button class="v3btn" id="v3SaveNotes">Save Notes</button><button class="v3btn" id="v3ExportNotes">Export .txt</button></div>
    `;

    const cmd=document.createElement('div'); cmd.id='v3Cmd'; cmd.innerHTML=`<div id="v3CmdBox"><input class="v3input" id="v3CmdSearch" placeholder="Type to jump pages... (esc to close)"/><div id="v3CmdList"></div></div>`;

    document.body.append(fab,panel,cmd);

    const notesEl=panel.querySelector('#v3Notes');
    const pomoEl=panel.querySelector('#v3Pomodoro');
    notesEl.value=localStorage.getItem(KEYS.notes)||'';
    pomoEl.value=localStorage.getItem(KEYS.pomodoro)||'25';
    if(localStorage.getItem(KEYS.focus)==='true') document.body.classList.add('v3-focus');

    fab.onclick=()=>panel.classList.toggle('open');
    panel.querySelector('#v3FocusBtn').onclick=()=>{document.body.classList.toggle('v3-focus');localStorage.setItem(KEYS.focus,String(document.body.classList.contains('v3-focus')))};
    panel.querySelector('#v3SaveNotes').onclick=()=>localStorage.setItem(KEYS.notes,notesEl.value);
    panel.querySelector('#v3ExportNotes').onclick=()=>{const b=new Blob([notesEl.value],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='360-notes.txt';a.click();URL.revokeObjectURL(a.href)};
    panel.querySelector('#v3PomodoroStart').onclick=()=>{
      const mins=Math.max(5,Math.min(120,Number(pomoEl.value)||25));
      localStorage.setItem(KEYS.pomodoro,String(mins));
      const end=Date.now()+mins*60000;
      const tick=()=>{
        const left=Math.max(0,Math.ceil((end-Date.now())/1000));
        fab.textContent=left>0?`⏱ ${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`:'Done ✅';
        if(left>0) requestAnimationFrame(tick); else setTimeout(()=>fab.textContent='V3 ⚡',4000);
      };tick();
    };

    const cmdList=cmd.querySelector('#v3CmdList');
    function renderCmd(q=''){
      const qq=q.toLowerCase();
      cmdList.innerHTML='';
      ROUTES.filter(r=>r[0].toLowerCase().includes(qq)).forEach(([n,u])=>{const b=document.createElement('button');b.className='v3btn';b.textContent=`Go to ${n}`;b.onclick=()=>location.href=u;cmdList.appendChild(b);});
    }
    renderCmd();
    panel.querySelector('#v3CmdBtn').onclick=()=>{cmd.classList.add('open');cmd.querySelector('#v3CmdSearch').focus();};
    cmd.querySelector('#v3CmdSearch').oninput=(e)=>renderCmd(e.target.value);
    cmd.addEventListener('click',e=>{if(e.target===cmd) cmd.classList.remove('open');});
    document.addEventListener('keydown',e=>{
      if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();cmd.classList.add('open');cmd.querySelector('#v3CmdSearch').focus();}
      if(e.key==='Escape') cmd.classList.remove('open');
    });
  }

  document.addEventListener('DOMContentLoaded', injectUI);
})();
