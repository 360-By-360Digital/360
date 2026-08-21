/* 360 Rewards game activity tracker.
 * Every eligible local game gets a server-validated session. The server decides
 * how many Rewards Points are earned from the elapsed active time.
 */
(function () {
  'use strict';

  const path = window.location.pathname.toLowerCase();
  // Block Blast already has score-based Rewards banking. Do not double-award it.
  if (path.endsWith('/blockblast.html')) return;

  const GAME_SLUG = decodeURIComponent(path.split('/').pop().replace(/\.html$/i, ''));
  const SUPABASE_URL = 'https://wiswfpfsjiowtrdyqpxy.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpc3dncGZzamlvd3lxcHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzg4OTcsImV4cCI6MjA4MzkxNDg5N30.z_4FtM2c8UwgrRlafPYjolQuod4IoHQats95XHio1zM';

  function boot() {
    if (!window.supabase?.createClient) return;
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    let sessionId = null;
    let activeSeconds = 0;
    let lastTick = Date.now();
    let visible = !document.hidden;
    let lastInteraction = Date.now();
    let finishing = false;

    const tick = () => {
      const now = Date.now();
      const activelyInteracting = visible && (now - lastInteraction) <= 15000;
      if (activelyInteracting) activeSeconds += Math.max(0, Math.min(10, (now - lastTick) / 1000));
      lastTick = now;
    };

    async function start() {
      try {
        const { data: { session } } = await client.auth.getSession();
        if (!session?.user) return;
        const { data, error } = await client.rpc('start_game_session', { p_game_slug: GAME_SLUG });
        if (!error) sessionId = data;
      } catch (_) {}
    }

    async function finish() {
      if (finishing || !sessionId) return;
      finishing = true;
      tick();
      const seconds = Math.floor(activeSeconds);
      try {
        const { data, error } = await client.rpc('finish_game_session', {
          p_session_id: sessionId,
          p_activity_seconds: seconds
        });
        if (!error && data) {
          const row = Array.isArray(data) ? data[0] : data;
          if (row && Number(row.points_awarded) > 0) {
            try {
              sessionStorage.setItem('360_reward_notice', `+${Number(row.points_awarded).toLocaleString()} Rewards Points earned in ${GAME_SLUG}.`);
            } catch (_) {}
          }
        }
      } catch (_) {}
      sessionId = null;
    }

    ['pointerdown', 'pointermove', 'keydown', 'touchstart'].forEach(type => {
      document.addEventListener(type, () => { lastInteraction = Date.now(); }, { passive: true });
    });

    document.addEventListener('visibilitychange', () => {
      tick();
      visible = !document.hidden;
      lastTick = Date.now();
      if (!visible) finish();
    });

    window.addEventListener('pagehide', finish, { once: true });
    window.addEventListener('beforeunload', finish, { once: true });

    // Keep the activity clock fresh even when a game has no own timer.
    window.setInterval(tick, 5000);
    start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
