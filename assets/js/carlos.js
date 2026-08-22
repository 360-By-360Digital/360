/* ════════════════════════════════════════════════════════
   CARLOS v1.0 — 360's built-in bot
   Place at: /assets/js/carlos.js  (load after chat.js)
   Carlos sends messages as himself using the server's
   realtime channel — no separate auth needed, he's
   client-side powered by Supabase direct inserts.
════════════════════════════════════════════════════════ */

window.Carlos = (function () {

  const BOT_NAME    = 'carlos';
  const BOT_TAG     = 'BOT';
  const BOT_AVATAR  = null; // set to a URL if you upload one @Mingzew2
  const GIPHY_KEY   = 'yYDIeMP7wEWRDqJuToCyfMTmOqSQkZRj';

  const CARLOS_BOT_ID = 'eb84ed95-5f72-49a8-9096-73ac6847a620';

  function getSb()  { return window.supabaseClient || window.sb; }

  async function isCarlosEnabled(serverId) {
    if (!serverId) return true;
    const { data } = await getSb()
      .from('bot_server_installs')
      .select('id')
      .eq('server_id', serverId)
      .eq('bot_id', CARLOS_BOT_ID)
      .maybeSingle();
    return !!data;
  }
  function myRoom() { return window.activeRoom; }

  /* ── Send as Carlos ─────────────────────────────────── */
  async function send(text, fileUrl, serverId, channelId) {
    const sb = getSb();
    const uid = window.currentUserId;
    if (!sb || !uid) return; // must be signed in to send
    const payload = {
      user_id:    uid,          // use real user — RLS requires it
      username:   BOT_NAME,     // display as "carlos"
      tag:        BOT_TAG,      // shows [BOT] badge
      avatar_url: BOT_AVATAR,
      role:       'bot',
      text:       text || '',
      file_url:   fileUrl || null,
    };
    if (channelId)  payload.channel_id = channelId;
    else if (serverId) payload.server_id = serverId;
    const { error } = await sb.from('messages').insert(payload);
    if (error) console.warn('Carlos send error:', error.message);
  }

  /* ── Command parser ─────────────────────────────────── */
  const COMMANDS = {
    '!help': cmdHelp,
    '!ping': cmdPing,
    '!gif':  cmdGif,
    '!roll': cmdRoll,
    '!flip': cmdFlip,
    '!8ball':cmd8ball,
    '!weather': cmdWeather,
    '!poll': cmdPoll,
    '!announce': cmdAnnounce,
    '!purge': cmdPurge,
    '!warn': cmdWarn,
    '!mute': cmdMute,
    '!stats': cmdStats,
    '!carlos': cmdInfo,
  };

  async function handleMessage(msg) {
    if (!msg.text?.startsWith('!')) return;
    if (msg.username === BOT_NAME && msg.tag === BOT_TAG) return; // don't respond to self
    const room = myRoom();
    if (!room) return;
    // Check if Carlos is enabled for this server
    if (room.serverId) {
      if (!await isCarlosEnabled(room.serverId)) return;
    }
    const parts = msg.text.trim().split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    const fn = COMMANDS[cmd];
    if (fn) await fn(args, msg, room);
  }

  /* ── Commands ───────────────────────────────────────── */
  async function cmdHelp(args, msg, room) {
    await send(
      `**Carlos Commands**\n` +
      `\`!ping\` — Pong!\n` +
      `\`!gif <query>\` — Send a GIF\n` +
      `\`!roll <N>\` — Roll a dice (default d6)\n` +
      `\`!flip\` — Flip a coin\n` +
      `\`!8ball <question>\` — Ask the magic 8 ball\n` +
      `\`!weather <city>\` — Get weather\n` +
      `\`!poll <question> | opt1 | opt2 ...\` — Create a poll\n` +
      `\`!stats\` — Server stats\n` +
      `\`!announce <message>\` — (Mod) Announce something\n` +
      `\`!purge <N>\` — (Mod) Delete N messages\n` +
      `\`!warn @user <reason>\` — (Mod) Warn a user\n` +
      `\`!mute @user <minutes>\` — (Mod) Mute a user`,
      null, room.serverId, room.id
    );
  }

  async function cmdPing(args, msg, room) {
    const t = Date.now() - new Date(msg.created_at||Date.now()).getTime();
    await send(`🏓 Pong! Latency: **${Math.abs(t)}ms**`, null, room.serverId, room.id);
  }

  async function cmdGif(args, msg, room) {
    const query = args.join(' ') || 'random';
    try {
      const r = await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(query)}&limit=10&rating=pg-13`);
      const data = await r.json();
      const gifs = data.data || [];
      if (!gifs.length) { await send(`😔 No GIFs found for **${query}**`, null, room.serverId, room.id); return; }
      const gif = gifs[Math.floor(Math.random() * Math.min(gifs.length, 5))];
      const url = gif.images?.original?.url || gif.images?.downsized?.url;
      await send('', url, room.serverId, room.id);
    } catch(e) {
      await send('❌ Failed to fetch GIF', null, room.serverId, room.id);
    }
  }

  async function cmdRoll(args, msg, room) {
    const n = parseInt(args[0]) || 6;
    const clamped = Math.max(2, Math.min(n, 1000));
    const roll = Math.floor(Math.random() * clamped) + 1;
    await send(`🎲 ${msg.username} rolled **${roll}** (d${clamped})`, null, room.serverId, room.id);
  }

  async function cmdFlip(args, msg, room) {
    const result = Math.random() < 0.5 ? '**Heads** 🪙' : '**Tails** 🪙';
    await send(`${msg.username} flipped a coin: ${result}`, null, room.serverId, room.id);
  }

  const EIGHT_BALL = ['It is certain','It is decidedly so','Without a doubt','Yes definitely','You may rely on it','As I see it, yes','Most likely','Outlook good','Yes','Signs point to yes','Reply hazy, try again','Ask again later','Better not tell you now','Cannot predict now','Concentrate and ask again','Don\'t count on it','My reply is no','My sources say no','Outlook not so good','Very doubtful'];
  async function cmd8ball(args, msg, room) {
    if (!args.length) { await send('❓ Ask me a question! e.g. `!8ball Will it rain?`', null, room.serverId, room.id); return; }
    const answer = EIGHT_BALL[Math.floor(Math.random() * EIGHT_BALL.length)];
    const positive = EIGHT_BALL.indexOf(answer) < 10;
    const emoji = positive ? '🟢' : EIGHT_BALL.indexOf(answer) < 15 ? '🟡' : '🔴';
    await send(`🎱 *${args.join(' ')}*\n${emoji} **${answer}**`, null, room.serverId, room.id);
  }

  async function cmdWeather(args, msg, room) {
    if (!args.length) { await send('🌤️ Usage: `!weather London`', null, room.serverId, room.id); return; }
    const city = args.join(' ');
    try {
      const r = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=3`);
      const text = await r.text();
      await send(`🌤️ ${text.trim()}`, null, room.serverId, room.id);
    } catch(e) {
      await send('❌ Could not fetch weather', null, room.serverId, room.id);
    }
  }

  async function cmdPoll(args, msg, room) {
    const raw = args.join(' ');
    const parts = raw.split('|').map(s => s.trim()).filter(Boolean);
    if (parts.length < 2) { await send('📊 Usage: `!poll Question | Option 1 | Option 2 | ...`', null, room.serverId, room.id); return; }
    const [question, ...options] = parts;
    const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];
    const optLines = options.slice(0,10).map((o,i) => `${emojis[i]} ${o}`).join('\n');
    await send(`📊 **Poll: ${question}**\n${optLines}\n\nReact to vote!`, null, room.serverId, room.id);
  }

  async function cmdAnnounce(args, msg, room) {
    const p = window.currentProfile;
    if (!p || !['admin','mod','owner'].includes(p.role)) { await send('❌ Mods only!', null, room.serverId, room.id); return; }
    const text = args.join(' ');
    if (!text) return;
    await send(`📢 **Announcement** from ${msg.username}\n\n${text}`, null, room.serverId, room.id);
  }

  async function cmdPurge(args, msg, room) {
    const p = window.currentProfile;
    if (!p || !['admin','mod','owner'].includes(p.role)) { await send('❌ Mods only!', null, room.serverId, room.id); return; }
    const n = Math.min(parseInt(args[0])||5, 50);
    const sb = getSb();
    // Get last N messages in channel
    const { data: msgs } = await sb.from('messages').select('id').eq('channel_id', room.id).order('created_at',{ascending:false}).limit(n);
    if (!msgs?.length) return;
    await sb.from('messages').update({ deleted_at: new Date().toISOString() }).in('id', msgs.map(m=>m.id));
    await send(`🧹 Deleted **${msgs.length}** messages.`, null, room.serverId, room.id);
  }

  async function cmdWarn(args, msg, room) {
    const p = window.currentProfile;
    if (!p || !['admin','mod','owner'].includes(p.role)) { await send('❌ Mods only!', null, room.serverId, room.id); return; }
    const target = args[0]?.replace('@','');
    const reason = args.slice(1).join(' ') || 'No reason given';
    if (!target) { await send('❌ Usage: `!warn @username reason`', null, room.serverId, room.id); return; }
    await getSb().from('carlos_logs').insert({ server_id: room.serverId, channel_id: room.id, triggered_by: window.currentUserId, command: '!warn', response: `Warned ${target}: ${reason}` });
    await send(`⚠️ **${target}** has been warned: *${reason}*`, null, room.serverId, room.id);
  }

  async function cmdMute(args, msg, room) {
    const p = window.currentProfile;
    if (!p || !['admin','mod','owner'].includes(p.role)) { await send('❌ Mods only!', null, room.serverId, room.id); return; }
    const target = args[0]?.replace('@','');
    const mins = parseInt(args[1]) || 10;
    if (!target) { await send('❌ Usage: `!mute @username minutes`', null, room.serverId, room.id); return; }
    await send(`🔇 **${target}** muted for **${mins} minutes**.`, null, room.serverId, room.id);
  }

  async function cmdStats(args, msg, room) {
    if (!room.serverId) { await send('❌ Must be in a server', null, room.serverId, room.id); return; }
    const sb = getSb();
    const [{ count: members }, { count: msgs }, { count: channels }] = await Promise.all([
      sb.from('server_members').select('*',{count:'exact',head:true}).eq('server_id', room.serverId),
      sb.from('messages').select('*',{count:'exact',head:true}).eq('server_id', room.serverId),
      sb.from('channels').select('*',{count:'exact',head:true}).eq('server_id', room.serverId),
    ]);
    await send(`📊 **Server Stats**\n👥 Members: **${members||0}**\n💬 Messages: **${msgs||0}**\n📣 Channels: **${channels||0}**`, null, room.serverId, room.id);
  }

  async function cmdInfo(args, msg, room) {
    await send(`🤖 Hi! I'm **Carlos**, 360's built-in bot.\nType \`!help\` to see what I can do!\n\n*Powered by 360 · GIFs by GIPHY*`, null, room.serverId, room.id);
  }

  /* ── Welcome new members ────────────────────────────── */
  async function welcomeMember(userId, username, serverId) {
    const sb = getSb();
    if (!await isCarlosEnabled(serverId)) return;
    const { data: firstCh } = await sb.from('channels').select('id').eq('server_id', serverId).order('position').limit(1).maybeSingle();
    if (!firstCh) return;
    const msg = (cfg.welcome_message || 'Welcome to the server, {user}! 🎉').replace('{user}', `**${username}**`).replace('{server}', '');
    await send(msg, null, serverId, firstCh.id);
  }

  /* ── Listen for messages ────────────────────────────── */
  function init() {
    // Hook into the realtime message stream
    window.addEventListener('carlos-message', async (e) => {
      await handleMessage(e.detail);
    });
    // Also hook into new member joins
    window.addEventListener('carlos-member-join', async (e) => {
      const { userId, username, serverId } = e.detail;
      await welcomeMember(userId, username, serverId);
    });
  }

  return { init, handleMessage, welcomeMember, send };
})();

// Auto-init
document.addEventListener('DOMContentLoaded', () => window.Carlos.init(), { once: true });
if (document.readyState !== 'loading') window.Carlos.init();
