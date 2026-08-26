/* ============================================================
   360 — MEMBERSHIP STATUS MANAGER
   ============================================================
   Include this on any page (after the cursor/base scripts) to:
     - Resolve the current user's effective membership tier
     - Auto-check/expire lapsed subscriptions (server + client side)
     - Keep membership tags/badges in the UI in sync in real time

   It creates its own Supabase client (same pattern as the game and
   rewards pages) so it doesn't depend on script load order with
   main.js.

   Public API (window.Membership):
     .getStatus()            -> current status object (or null if not loaded yet)
     .refresh()               -> force a re-sync against the server
     .onChange(fn)            -> fn(status) called immediately + on every update
     .isAtLeast(tierFamily)   -> e.g. Membership.isAtLeast('pro')
   ============================================================ */
(function () {
  "use strict";

  const SUPABASE_URL = "https://wiswfpfsjiowtrdyqpxy.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpc3dmcGZzamlvd3RyZHlxcHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzg4OTcsImV4cCI6MjA4MzkxNDg5N30.z_4FtM2c8UwgrRlafPYjolQuod4IoHQats95XHio1zM";

  // How often to re-check expiry against the server while the tab stays open.
  const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  if (typeof supabase === "undefined") {
    console.warn("[membership.js] supabase-js not loaded — include the Supabase <script> before this file.");
    return;
  }

  const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ----------------------------------------------------------
  // Tier metadata
  // ----------------------------------------------------------
  // "family" groups every duration of a tier (pro_3day, pro_1week, ...)
  // under one badge/rank so UI checks like isAtLeast('pro') work
  // regardless of which specific duration a user redeemed.
  const TIER_META = {
    free:             { family: "free",     rank: 0, label: "Free" },
    lite_3day:        { family: "lite",     rank: 1, label: "Lite" },
    lite_1week:       { family: "lite",     rank: 1, label: "Lite" },
    lite_6month:      { family: "lite",     rank: 1, label: "Lite" },
    lite_1year:       { family: "lite",     rank: 1, label: "Lite" },
    lite_5year:       { family: "lite",     rank: 1, label: "Lite" },
    pro_3day:         { family: "pro",      rank: 2, label: "Pro" },
    pro_1week:        { family: "pro",      rank: 2, label: "Pro" },
    pro_6month:       { family: "pro",      rank: 2, label: "Pro" },
    pro_1year:        { family: "pro",      rank: 2, label: "Pro" },
    pro_5year:        { family: "pro",      rank: 2, label: "Pro" },
    premium_3day:     { family: "premium",  rank: 3, label: "Premium" },
    premium_1week:    { family: "premium",  rank: 3, label: "Premium" },
    premium_6month:   { family: "premium",  rank: 3, label: "Premium" },
    premium_1year:    { family: "premium",  rank: 3, label: "Premium" },
    premium_5year:    { family: "premium",  rank: 3, label: "Premium" },
    premium_lifetime: { family: "premium_lifetime", rank: 4, label: "Premium · Lifetime" }
  };

  const FAMILY_RANK = { free: 0, lite: 1, pro: 2, premium: 3, premium_lifetime: 4 };

  function metaFor(tier) {
    return TIER_META[tier] || TIER_META.free;
  }

  // ----------------------------------------------------------
  // State
  // ----------------------------------------------------------
  let currentUser = null;
  let currentStatus = null; // normalized status object, see computeStatus()
  let profileChannel = null;
  let syncTimer = null;
  const listeners = [];

  function computeStatus({ tier, until, revoked, revokedReason, points, lifetimePoints }) {
    const now = Date.now();
    const untilDate = until ? new Date(until) : null;

    // Client-side safety net: even if the server hasn't lazily expired
    // this row yet (sync runs periodically, not on every millisecond),
    // never *display* a lapsed tier as active.
    const isLifetime = tier === "premium_lifetime";
    const isExpiredLocally =
      !!tier && !isLifetime && (!untilDate || untilDate.getTime() <= now);

    const effectiveTier = revoked
      ? "revoked"
      : (isExpiredLocally ? "free" : (tier || "free"));

    const meta = effectiveTier === "revoked"
      ? { family: "revoked", rank: -1, label: "Revoked" }
      : metaFor(effectiveTier);

    return {
      loggedIn: true,
      tier: effectiveTier,          // 'free' | 'lite_3day' | ... | 'premium_lifetime' | 'revoked'
      family: meta.family,          // 'free' | 'lite' | 'pro' | 'premium' | 'premium_lifetime' | 'revoked'
      rank: meta.rank,
      label: meta.label,
      revoked: !!revoked,
      revokedReason: revokedReason || null,
      expiresAt: isLifetime ? null : untilDate,
      isLifetime,
      rewardPoints: Number(points || 0),
      rewardPointsLifetime: Number(lifetimePoints || 0)
    };
  }

  const LOGGED_OUT_STATUS = {
    loggedIn: false,
    tier: "free",
    family: "free",
    rank: 0,
    label: "Free",
    revoked: false,
    revokedReason: null,
    expiresAt: null,
    isLifetime: false,
    rewardPoints: 0,
    rewardPointsLifetime: 0
  };

  // ----------------------------------------------------------
  // Server sync — this is what actually expires lapsed
  // subscriptions (clears membership_tier/premium_until once
  // premium_until has passed) rather than just hiding it client-side.
  // ----------------------------------------------------------
  async function syncFromServer() {
    if (!currentUser) return;
    try {
      const { data, error } = await supabaseClient.rpc("sync_membership_status");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return;
      setStatus(computeStatus({
        tier: row.tier,
        until: row.premium_until,
        revoked: row.revoked,
        revokedReason: row.revoked_reason,
        points: row.reward_points,
        lifetimePoints: row.reward_points_lifetime
      }));
    } catch (err) {
      // Fall back to a plain read so the UI still reflects *something*
      // even if the RPC is unreachable (e.g. offline).
      try {
        const { data } = await supabaseClient
          .from("profiles")
          .select("reward_points, reward_points_lifetime, premium_until, membership_tier, membership_revoked, membership_revoked_reason")
          .eq("id", currentUser.id)
          .maybeSingle();
        if (data) {
          setStatus(computeStatus({
            tier: data.membership_tier,
            until: data.premium_until,
            revoked: data.membership_revoked,
            revokedReason: data.membership_revoked_reason,
            points: data.reward_points,
            lifetimePoints: data.reward_points_lifetime
          }));
        }
      } catch { /* leave currentStatus as-is */ }
    }
  }

  function subscribeToProfile() {
    if (!currentUser) return;
    if (profileChannel) supabaseClient.removeChannel(profileChannel);
    profileChannel = supabaseClient
      .channel("membership-profile-" + currentUser.id)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "profiles",
        filter: `id=eq.${currentUser.id}`
      }, (payload) => {
        const n = payload.new || {};
        setStatus(computeStatus({
          tier: n.membership_tier,
          until: n.premium_until,
          revoked: n.membership_revoked,
          revokedReason: n.membership_revoked_reason,
          points: n.reward_points,
          lifetimePoints: n.reward_points_lifetime
        }));
      })
      .subscribe();
  }

  function startAutoSync() {
    stopAutoSync();
    syncTimer = setInterval(syncFromServer, SYNC_INTERVAL_MS);
    // Also re-check whenever the tab regains focus/visibility — catches
    // expirations that happened while the tab was backgrounded/asleep.
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  function stopAutoSync() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = null;
    document.removeEventListener("visibilitychange", onVisibilityChange);
  }

  function onVisibilityChange() {
    if (document.visibilityState === "visible") syncFromServer();
  }

  // ----------------------------------------------------------
  // UI rendering
  // ----------------------------------------------------------
  function badgeHTML(status) {
    return `<span class="membership-badge tier-${status.family}">${escapeHtml(status.label)}</span>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function shouldShow(status, el) {
    if (status.family === "free" && el.dataset.showFree !== "true") return false;
    return true;
  }

  // Renders into every [data-membership-badge] element on the page.
  function renderDataBadges(status) {
    document.querySelectorAll("[data-membership-badge]").forEach(el => {
      if (!shouldShow(status, el)) {
        el.innerHTML = "";
        el.style.display = "none";
        return;
      }
      el.style.display = "";
      el.innerHTML = badgeHTML(status);
    });

    // Optional plain-text targets, e.g. <span data-membership-label></span>
    document.querySelectorAll("[data-membership-label]").forEach(el => {
      el.textContent = status.label;
    });

    // Optional expiry targets, e.g. <span data-membership-expiry></span>
    document.querySelectorAll("[data-membership-expiry]").forEach(el => {
      if (status.isLifetime) {
        el.textContent = "Never expires";
      } else if (status.expiresAt) {
        el.textContent = "Until " + status.expiresAt.toLocaleDateString(undefined, {
          year: "numeric", month: "short", day: "numeric"
        });
      } else {
        el.textContent = "";
      }
    });

    // Body-level class hook, e.g. `body.membership-pro { ... }`
    Object.values(FAMILY_RANK).map((_, i) => Object.keys(FAMILY_RANK)[i])
      .forEach(fam => document.body.classList.remove("membership-" + fam));
    document.body.classList.add("membership-" + status.family);
  }

  // Injects a badge next to the user-chip name and inside its dropdown
  // header. The chip is built asynchronously by main.js, so this is
  // driven by a MutationObserver rather than a one-shot query.
  //
  // IMPORTANT: this must be idempotent. It runs every time the observer
  // fires, and if it always writes to the DOM, that write itself re-triggers
  // the observer -> infinite loop -> frozen tab ("Page Unresponsive").
  // So we only touch the DOM when the badge is actually missing or wrong.
  function applyBadge(container, status) {
    if (!container) return;
    const existing = container.querySelector(":scope > .membership-badge");

    if (status.family === "free") {
      if (existing) existing.remove();
      return;
    }

    const wantedClass = "membership-badge tier-" + status.family;
    if (existing) {
      if (existing.className !== wantedClass) existing.className = wantedClass;
      if (existing.textContent !== status.label) existing.textContent = status.label;
      return; // already correct — no DOM mutation, no re-trigger
    }

    const span = document.createElement("span");
    span.className = wantedClass;
    span.textContent = status.label;
    container.appendChild(span);
  }

  function renderChipBadge(status) {
    const chip = document.querySelector(".user-chip");
    if (!chip) return;
    applyBadge(chip.querySelector(".user-chip-name"), status);
    applyBadge(chip.querySelector(".ucd-username"), status);
  }

  function renderAll(status) {
    renderDataBadges(status);
    renderChipBadge(status);
    listeners.forEach(fn => {
      try { fn(status); } catch (e) { console.error("[membership.js] listener error", e); }
    });
  }

  function setStatus(status) {
    currentStatus = status;
    renderAll(status);
  }

  // Watch for the chip appearing/re-rendering (main.js builds it async
  // and can rebuild it on auth state changes) and re-apply the badge.
  //
  // subtree:true is required: main.js appends an *empty* chip div first,
  // then fills it in later via chip.innerHTML after its own async
  // profile/avatar fetch — that later mutation happens *inside* the chip,
  // not as a direct child of the container, so subtree:false would miss
  // it and the badge would never appear. This is safe against the
  // infinite-loop bug because applyBadge() above is idempotent: once the
  // badge matches, our own re-render is a no-op and doesn't mutate the
  // DOM, so the observer has nothing left to re-trigger on.
  const chipObserver = new MutationObserver(() => {
    if (currentStatus) renderChipBadge(currentStatus);
  });

  function observeChipContainer() {
    const container = document.querySelector(".auth-top-right") || document.body;
    chipObserver.observe(container, { childList: true, subtree: true });
  }

  // ----------------------------------------------------------
  // Init
  // ----------------------------------------------------------
  async function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init, { once: true });
      return;
    }

    observeChipContainer();

    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session?.user || null;

    if (!currentUser) {
      setStatus(LOGGED_OUT_STATUS);
    } else {
      await syncFromServer();
      subscribeToProfile();
      startAutoSync();
    }

    supabaseClient.auth.onAuthStateChange(async (_event, session) => {
      const newUser = session?.user || null;
      const changed = (newUser?.id || null) !== (currentUser?.id || null);
      currentUser = newUser;

      if (!currentUser) {
        stopAutoSync();
        if (profileChannel) supabaseClient.removeChannel(profileChannel);
        setStatus(LOGGED_OUT_STATUS);
        return;
      }

      if (changed) {
        await syncFromServer();
        subscribeToProfile();
        startAutoSync();
      }
    });
  }

  init();

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------
  window.Membership = {
    getStatus() {
      return currentStatus;
    },
    refresh() {
      return syncFromServer();
    },
    onChange(fn) {
      if (typeof fn !== "function") return;
      listeners.push(fn);
      if (currentStatus) fn(currentStatus);
    },
    isAtLeast(familyName) {
      const need = FAMILY_RANK[familyName];
      if (need === undefined || !currentStatus) return false;
      if (currentStatus.family === "revoked") return false;
      return currentStatus.rank >= need;
    }
  };
})();
