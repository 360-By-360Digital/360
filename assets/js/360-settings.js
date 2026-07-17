/**
 * 360 ACCOUNT SETTINGS SYNC
 * ─────────────────────────
 * A small helper so a per-user setting (theme, safe search, whatever) can
 * live in one place — a user's account — instead of separately in every
 * app's localStorage. Falls back to localStorage-only when signed out, so
 * nothing breaks for anonymous visitors.
 *
 * Backed by a single `user_settings` table (one JSONB blob per user, RLS
 * locked to its owner) — see the `create_user_settings` migration.
 *
 * USAGE
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="/assets/js/360-settings.js"></script>
 *   <script>
 *     const sb = supabase.createClient(URL, ANON_KEY);
 *     Settings360.init(sb).then(() => {
 *       const theme = Settings360.get('theme', 'light');
 *       Settings360.set('theme', 'dark'); // writes local instantly, syncs in background
 *     });
 *     // Optional: react to a setting changing in another tab/device
 *     Settings360.onChange((key, value) => { ... });
 *   </script>
 *
 * This is intentionally app-agnostic: any page can read/write any key
 * without the settings table needing to know about it up front. Rolling
 * this out further just means swapping an app's localStorage calls for
 * Settings360.get/set — it hasn't been done for every existing page yet.
 */
(function (global) {
  const LOCAL_KEY = '360_settings_cache';
  let sbClient = null;
  let userId = null;
  let cache = {};
  let saveTimer = null;
  const listeners = [];

  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function saveLocal() {
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify(cache)); } catch (e) {}
  }

  async function init(supabaseClient) {
    sbClient = supabaseClient;
    cache = loadLocal();

    if (!sbClient) return cache;
    const { data: { session } } = await sbClient.auth.getSession();
    userId = session?.user?.id || null;
    if (!userId) return cache;

    const { data, error } = await sbClient.from('user_settings').select('settings').eq('user_id', userId).maybeSingle();
    if (!error && data?.settings) {
      // Remote is the source of truth once signed in — merge local-only
      // keys (e.g. set while signed out) on top so nothing set moments
      // ago gets clobbered, then push the merged result back up.
      const merged = { ...data.settings, ...cache };
      cache = merged;
      saveLocal();
      pushRemote();
    } else {
      // First time this account has synced settings — seed it from
      // whatever's already in localStorage.
      pushRemote();
    }

    sbClient.auth.onAuthStateChange((_e, session) => {
      const newId = session?.user?.id || null;
      if (newId !== userId) { userId = newId; if (userId) init(sbClient); }
    });

    return cache;
  }

  function pushRemote() {
    if (!sbClient || !userId) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await sbClient.from('user_settings').upsert({ user_id: userId, settings: cache, updated_at: new Date().toISOString() });
      } catch (e) { /* best-effort — local copy is already saved */ }
    }, 400); // debounce rapid toggles
  }

  function get(key, fallback) {
    return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : fallback;
  }
  function set(key, value) {
    cache[key] = value;
    saveLocal();
    pushRemote();
    listeners.forEach(fn => { try { fn(key, value); } catch (e) {} });
  }
  function getAll() { return { ...cache }; }
  function onChange(fn) { listeners.push(fn); }

  global.Settings360 = { init, get, set, getAll, onChange };
})(window);
