/* ============================================================
   360 — MAIN.JS V.3.0.0
   ============================================================ */

//CHANGE THE FOLLOWING TO CHANGE ALL THE PAGE'S VERSION!!
const version = "3.0.0";

//Get's the current page's URL (Not including domain)
let currentUrl = window.location.pathname + window.location.search + window.location.hash;

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const body = document.body;

/* ============================================================
   SIDEBAR — SINGLE SOURCE OF TRUTH
   Every page just contains an empty <span id="sidebar-slot"></span>
   inside its <aside class="sidebar" id="sidebar">. This function
   builds the sidebar HTML (header, nav links, footer) and injects
   it into that slot, so the sidebar can be changed here, once, for
   every page on the site.

   Extra page-specific nav items (e.g. "Accounts", "Report",
   "360Mail") can be added by putting a JSON string in the slot's
   data-extra attribute, e.g.:
   <span id="sidebar-slot" data-extra='[{"label":"Report","href":"/report"}]'></span>
   ============================================================ */

const PINNED_APPS_STORAGE_KEY = "360_pinned_apps";
const PINNED_APPS_POSITION_KEY = "360_pinned_apps_position";
const PINNED_APP_CATALOG = [
  { label: "360Vids", href: "/apps/360vids", icon: "🎬" },
  { label: "360Music", href: "/apps/360Music", icon: "🎶" },
  { label: "Zone", href: "/apps/360zone", icon: "🏫" },
  { label: "360Notes", href: "/apps/360Notes", icon: "📖" },
  { label: "360Draw", href: "/apps/360Draw", icon: "🎨" },
  { label: "360Docs", href: "/apps/360Docs", icon: "📃" },
  { label: "360Do", href: "/apps/360Do", icon: "💡" },
  { label: "360Mail", href: "/apps/360mail-claim", icon: "✉️" },
  { label: "360Studio", href: "/apps/360Studio", icon: "🎛️" },
  { label: "360MySite", href: "/apps/360MySite", icon: "🌐" },
  { label: "360Canvas", href: "/apps/360Canvas", icon: "🚀" }
];

function safeParseJSON(raw, fallback) {
  try { return raw ? JSON.parse(raw) : fallback; } catch { return fallback; }
}

function normalizeAppHref(href) {
  try { return new URL(href, window.location.origin).pathname.replace(/\.html$/, "").replace(/\/+$/, "") || "/"; }
  catch { return href.replace(/\.html$/, "").replace(/\/+$/, "") || "/"; }
}

function getPinnedAppHrefs() {
  const saved = safeParseJSON(localStorage.getItem(PINNED_APPS_STORAGE_KEY), []);
  return Array.isArray(saved) ? saved.map(normalizeAppHref) : [];
}

function savePinnedAppHrefs(hrefs) {
  const unique = Array.from(new Set(hrefs.map(normalizeAppHref)));
  localStorage.setItem(PINNED_APPS_STORAGE_KEY, JSON.stringify(unique));
}

function getPinnedApps() {
  const pinned = getPinnedAppHrefs();
  return pinned.map(href => PINNED_APP_CATALOG.find(app => normalizeAppHref(app.href) === href)).filter(Boolean);
}

function getPinnedAppsPosition() {
  return localStorage.getItem(PINNED_APPS_POSITION_KEY) || "after-apps";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

const SIDEBAR_NAV_ITEMS = [
  { label: "Home",           href: "/" },
  { label: "AI",             href: "/ai" },
  { label: "Weather",        href: "/weather" },
  { label: "Translator",     href: "/translator" },
  { label: "Stocks",         href: "/stocks" },
  { label: "URL Shortener",  href: "/url-shortener" },
  { label: "Chat",           href: "/chat" },
  { label: "News",           href: "/news" },
  { label: "Apps",           href: "/apps" },
  { label: "Games",          href: "/games" }
];

function renderSidebar() {
  const slot = document.getElementById("sidebar-slot");
  if (!slot) return;

  let extraItems = [];
  if (slot.dataset.extra) {
    try { extraItems = JSON.parse(slot.dataset.extra); } catch {}
  }

  const pinnedApps = getPinnedApps();
  const position = getPinnedAppsPosition();
  const appItemHtml = pinnedApps
    .map(it => `<div class="nav-item pinned-app-item" data-href="${it.href}"><span class="pinned-app-icon">${it.icon}</span>${escapeHtml(it.label)}</div>`)
    .join("");
  const pinnedSectionHtml = pinnedApps.length
    ? `<div class="nav-section pinned-apps-section"><div class="nav-section-label">Pinned Apps</div>${appItemHtml}</div>`
    : "";

  let allItems = SIDEBAR_NAV_ITEMS.concat(extraItems);
  if (position === "after-apps") {
    const appsIndex = allItems.findIndex(it => it.label === "Apps");
    allItems = appsIndex >= 0
      ? allItems.slice(0, appsIndex + 1).concat(pinnedApps.map(app => ({ ...app, pinned: true })), allItems.slice(appsIndex + 1))
      : allItems.concat(pinnedApps.map(app => ({ ...app, pinned: true })));
  }

  const navHtml = allItems
    .map(it => `<div class="nav-item${it.pinned ? " pinned-app-item" : ""}" data-href="${it.href}">${it.icon ? `<span class="pinned-app-icon">${it.icon}</span>` : ""}${escapeHtml(it.label)}</div>`)
    .join("");

  slot.innerHTML = `
    <div class="sidebar-header">
      <div class="logo-mark"></div>
      <button id="settingsBtn">⚙</button>
    </div>
    ${position === "top" ? pinnedSectionHtml : ""}
    <nav class="nav-list">${navHtml}</nav>
    ${position === "bottom" ? pinnedSectionHtml : ""}
    <div class="sidebar-footer"><span id="sidebar-ver">Loading...</span></div>
  `;

  //CHANGES THE FOOTER IN ALL PAGES!!
  const _sidebarVer = document.getElementById("sidebar-ver");
  if (_sidebarVer) _sidebarVer.textContent = "© " + new Date().getFullYear() + " 360Digital, Co. · " + "V." + version;
}
renderSidebar();

/* ============================================================
   SUPABASE CLIENT
   ============================================================ */
const supabaseClient = supabase.createClient(
  "https://wiswfpfsjiowtrdyqpxy.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indpc3dmcGZzamlvd3RyZHlxcHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzg4OTcsImV4cCI6MjA4MzkxNDg5N30.z_4FtM2c8UwgrRlafPYjolQuod4IoHQats95XHio1zM"
);

/* ============================================================
   GRAVATAR HELPER
   MD5 is needed for Gravatar — we use a lightweight implementation
   ============================================================ */
async function getGravatarUrl(email, size = 40) {
  const clean = email.trim().toLowerCase();
  const msgBuffer = new TextEncoder().encode(clean);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  // Gravatar now accepts SHA-256
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
  return `https://www.gravatar.com/avatar/${hashHex}?s=${size}&d=404`;
}

function getInitials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length === 1
    ? parts[0][0].toUpperCase()
    : (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ============================================================
   BUILD USER CHIP
   Replaces the three auth buttons (signIn / signUp / signOut)
   with a single pill containing PFP + @username + dropdown.
   ============================================================ */
async function buildUserChip(user) {
  // Claim the spot synchronously before any awaits — if a chip already
  // exists (real or placeholder) every concurrent call bails out here.
  const container = document.querySelector(".auth-top-right") || document.body;
  if (container.querySelector(".user-chip")) return;
  const chip = document.createElement("div");
  chip.className = "user-chip";
  chip.style.display = "none"; // hidden until fully built
  container.appendChild(chip); // in the DOM NOW — blocks all other calls

  // Hide the three legacy buttons
  const signInBtn  = $("#signInBtn");
  const signUpBtn  = $("#signUpBtn");
  const signOutBtn = $("#signOutBtn");
  if (signInBtn)  signInBtn.style.display  = "none";
  if (signUpBtn)  signUpBtn.style.display  = "none";
  if (signOutBtn) signOutBtn.style.display = "none";

  // Fetch profile for username + avatar_url
  let username = user.user_metadata?.username
              || user.user_metadata?.full_name
              || user.email?.split("@")[0]
              || "User";
  let avatarUrl = user.user_metadata?.avatar_url || null;

  try {
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("username, avatar_url")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.username)   username  = profile.username;
    if (profile?.avatar_url) avatarUrl = profile.avatar_url;
  } catch {}

  // Try Gravatar if no avatar
  if (!avatarUrl) {
    try {
      const gUrl = await getGravatarUrl(user.email || "", 80);
      const probe = await fetch(gUrl, { method: "HEAD" });
      if (probe.ok) avatarUrl = gUrl;
    } catch {}
  }

  const initials = getInitials(username);
  const displayName = "@" + username;

  // Populate the chip that's already in the DOM
  chip.setAttribute("role", "button");
  chip.setAttribute("aria-haspopup", "true");
  chip.setAttribute("aria-expanded", "false");

  const avatarHTML = avatarUrl
    ? `<div class="user-chip-avatar-wrap">
         <img class="user-chip-avatar" src="${avatarUrl}" alt="${initials}"
              onerror="this.outerHTML='<div class=\\'user-chip-initials\\'>${initials}</div>'" />
       </div>`
    : `<div class="user-chip-avatar-wrap">
         <div class="user-chip-initials">${initials}</div>
       </div>`;

  chip.innerHTML = `
    ${avatarHTML}
    <span class="user-chip-name">${displayName}</span>
    <span class="user-chip-caret">▾</span>
    <div class="user-chip-dropdown">
      <div class="ucd-header">
        ${avatarUrl
          ? `<div class="ucd-avatar-wrap"><img class="user-chip-avatar" src="${avatarUrl}" alt="${initials}"
               onerror="this.outerHTML='<div class=\\'user-chip-initials\\'>${initials}</div>'" /></div>`
          : `<div class="ucd-avatar-wrap"><div class="user-chip-initials">${initials}</div></div>`}
        <div>
          <div class="ucd-username">${username}</div>
          <div class="ucd-email">${user.email || ""}</div>
        </div>
      </div>
      <div class="ucd-divider"></div>
      <a class="ucd-item" href="/settings"><span><img style="height: 1em; width: auto;" src="/assets/images/accounts.png"></img></span> My Account</a>
      <div class="ucd-divider"></div>
      <button class="ucd-item ucd-signout" id="chipSignOut"><span><img style="height: 1em; width: auto;" src="/assets/images/signout.gif"></img></span> Sign Out</button>
    </div>`;

  // Chip is already in the DOM — just make it visible now
  chip.style.display = "";

  // Toggle dropdown
  chip.addEventListener("click", e => {
    e.stopPropagation();
    const isOpen = chip.classList.toggle("open");
    chip.setAttribute("aria-expanded", isOpen);
  });

  // Close on outside click
  document.addEventListener("click", () => {
    chip.classList.remove("open");
    chip.setAttribute("aria-expanded", "false");
  });

  // Sign out
     document.getElementById("chipSignOut")?.addEventListener("click", async e => {
     e.stopPropagation();
   
     const confirmed = await confirmSignOut();
     if (!confirmed) return;
   
     const returnTo = window.location.pathname + window.location.search;
     await supabaseClient.auth.signOut();
     // Return to the same page — auth gates will show sign-in prompt if needed
     location.href = returnTo;
   });
}

// ============================================================
// GLOBAL SIGN-OUT CONFIRM MODAL (created once)
// ============================================================
function createSignOutModal() {
  if (document.getElementById("signout-modal")) return;

  const modal = document.createElement("div");
  modal.id = "signout-modal";
  modal.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,.5);
    display: none;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  modal.innerHTML = `
    <div style="
      background: var(--bg);
      color: var(--txt);
      padding: 20px;
      border-radius: 14px;
      width: 280px;
      text-align: center;
      border: 1px solid var(--br);
      box-shadow: 0 20px 50px rgba(0,0,0,.25);
    ">
      <div style="font-size:15px; font-weight:600; margin-bottom:10px;">
        Sign out?
      </div>
      <div style="font-size:13px; opacity:.7; margin-bottom:16px;">
        Are you sure you want to sign out?
      </div>
      <div style="display:flex; gap:10px; justify-content:center;">
        <button id="confirmSignOutCancel" style="
          padding:8px 12px;
          border-radius:8px;
          border:1px solid var(--br);
          background:transparent;
          cursor:pointer;
        ">Cancel</button>

        <button id="confirmSignOutOk" style="
          padding:8px 12px;
          border-radius:8px;
          border:none;
          background:linear-gradient(110deg, var(--a), var(--a2));
          color:#050816;
          font-weight:600;
          cursor:pointer;
        ">Sign Out</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Close handlers
  modal.addEventListener("click", e => {
    if (e.target === modal) modal.style.display = "none";
  });

  document.getElementById("confirmSignOutCancel").onclick = () => {
    modal.style.display = "none";
  };
}

// Show modal and return a Promise
function confirmSignOut() {
  createSignOutModal();

  const modal = document.getElementById("signout-modal");
  modal.style.display = "flex";

  return new Promise(resolve => {
    const okBtn = document.getElementById("confirmSignOutOk");
    const cancelBtn = document.getElementById("confirmSignOutCancel");

    const cleanup = () => {
      okBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    okBtn.onclick = () => {
      modal.style.display = "none";
      cleanup();
      resolve(true);
    };

    cancelBtn.onclick = () => {
      modal.style.display = "none";
      cleanup();
      resolve(false);
    };
  });
}

/* ============================================================
   AUTH SYSTEM
   ============================================================ */
const authPopup    = $("#auth-popup");
const authEmail    = $("#auth-email");
const authPassword = $("#auth-password");
const authLoginBtn = $("#auth-login-btn");
const authSignupBtn= $("#auth-signup-btn");
const authCloseBtn = $("#auth-close-btn");
const authError    = $("#auth-error");
const signInBtn    = $("#signInBtn");
const signUpBtn    = $("#signUpBtn");
const signOutBtn   = $("#signOutBtn");

function openAuth()  { if (authPopup) authPopup.classList.remove("hidden"); }
function closeAuth() {
  if (authPopup) authPopup.classList.add("hidden");
  if (authError) authError.textContent = "";
}

if (signInBtn) signInBtn.onclick = () => location.href = "signin.html?from=" + encodeURIComponent(currentUrl);
if (signUpBtn) signUpBtn.onclick = () => location.href = "signup.html?from=" + encodeURIComponent(currentUrl);
if (authCloseBtn) authCloseBtn.onclick = closeAuth;

if (authPopup) {
  authPopup.addEventListener("click", e => {
    if (e.target === authPopup) closeAuth();
  });
}

if (authSignupBtn) {
  authSignupBtn.onclick = async () => {
    const email    = authEmail?.value.trim();
    const password = authPassword?.value.trim();
    if (!email || !password) { if (authError) authError.textContent = "Email and password required."; return; }
    const { error } = await supabaseClient.auth.signUp({ email, password });
    if (authError) authError.textContent = error ? error.message : "Check your email to confirm your account!";
  };
}

if (authLoginBtn) {
  authLoginBtn.onclick = async () => {
    const email    = authEmail?.value.trim();
    const password = authPassword?.value.trim();
    if (!email || !password) { if (authError) authError.textContent = "Email and password required."; return; }
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      if (authError) authError.textContent = error.message.includes("Email not confirmed")
        ? "Please confirm your email first — check your inbox."
        : error.message;
    } else { closeAuth(); updateAuthUI(); }
  };
}

const githubBtn = $("#github-login");
if (githubBtn) {
  githubBtn.onclick = async () => {
    await supabaseClient.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: window.location.origin }
    });
  };
}

const googleBtn = $("#google-login");
if (googleBtn) {
  googleBtn.onclick = async () => {
    await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin }
    });
  };
}

if (signOutBtn) {
  signOutBtn.onclick = async () => {
    const returnTo = window.location.pathname + window.location.search;
    await supabaseClient.auth.signOut();
    location.href = returnTo;
  };
}

async function updateAuthUI() {
  // /account manages its own auth UI — skip the chip there
  if (window.SKIP_AUTH_CHIP) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  const user = session?.user ?? null;

  if (user) {
    // Show chip, hide legacy buttons
    await buildUserChip(user);
  } else {
    // Remove chip if present
    document.querySelector(".user-chip")?.remove();
    // Show sign in / sign up buttons
    if (signInBtn)  signInBtn.style.display  = "inline-block";
    if (signUpBtn)  signUpBtn.style.display  = "inline-block";
    if (signOutBtn) signOutBtn.style.display = "none";
  }
}

// Run on load
updateAuthUI();

// React to auth state changes (e.g. OAuth redirect)
supabaseClient.auth.onAuthStateChange((event, session) => {
  // /account manages its own auth UI — skip the chip there
  if (window.SKIP_AUTH_CHIP) return;
  // INITIAL_SESSION is handled by updateAuthUI() above — skip it here
  // TOKEN_REFRESHED, USER_UPDATED etc. don't need a chip rebuild
  if (event === "SIGNED_OUT") {
    document.querySelector(".user-chip")?.remove();
    if (signInBtn)  signInBtn.style.display  = "inline-block";
    if (signUpBtn)  signUpBtn.style.display  = "inline-block";
    if (signOutBtn) signOutBtn.style.display = "none";
  } else if (event === "SIGNED_IN" && session?.user && !document.querySelector(".user-chip")) {
    buildUserChip(session.user);
  }
});

/* ============================================================
   SIDEBAR — click outside to close (optimized + animations)
   ============================================================ */

const sidebar       = document.querySelector(".sidebar");
const settingsPanel = document.querySelector(".settings-panel");
const overlay       = document.querySelector(".overlay");
const sidebarToggle = document.querySelector(".sidebar-toggle");
const settingsBtn   = document.getElementById("settingsBtn");
const navItems      = Array.from(document.querySelectorAll(".sidebar .nav-item"));


function trackPageVisit() {
  const key = "navHistory";
  const current = window.location.pathname || "/";
  const raw = sessionStorage.getItem(key);
  const history = raw ? JSON.parse(raw) : [];

  if (!history.length || history[history.length - 1] !== current) {
    history.push(current);
  }

  if (history.length > 30) history.splice(0, history.length - 30);
  sessionStorage.setItem(key, JSON.stringify(history));
}

function goToLastVisitedPage() {
  const key = "navHistory";
  const current = window.location.pathname || "/";
  const raw = sessionStorage.getItem(key);
  const history = raw ? JSON.parse(raw) : [];

  while (history.length && history[history.length - 1] === current) {
    history.pop();
  }

  const target = history.pop();
  sessionStorage.setItem(key, JSON.stringify(history));

  if (target) {
    window.location.href = target;
    return;
  }

  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = "/";
  }
}

trackPageVisit();


/* Faster nav animation (reduce perceived lag) */
navItems.forEach((item, idx) => {
  // Keep stagger but make it MUCH faster
  item.style.setProperty("--nav-index", idx);

  // Optional override: force quicker timing via JS
  item.style.setProperty("--nav-delay", `${idx * 25}ms`);
});

function updateOverlay() {
  const anyOpen =
    sidebar?.classList.contains("open") ||
    settingsPanel?.classList.contains("open");

  overlay?.classList.toggle("active", !!anyOpen);
}

/* Sidebar toggle */
sidebarToggle?.addEventListener("click", e => {
  e.stopPropagation();
  sidebar?.classList.toggle("open");
  updateOverlay();
});

/* Settings toggle */
document.addEventListener("click", e => {
  const btn = e.target.closest("#settingsBtn");
  if (!btn) return;
  e.stopPropagation();
  settingsPanel?.classList.toggle("open");
  updateOverlay();
});

/* Click overlay closes everything */
overlay?.addEventListener("click", () => {
  sidebar?.classList.remove("open");
  settingsPanel?.classList.remove("open");
  updateOverlay();
});

/* Click outside closes everything */
document.addEventListener("click", e => {
  if (
    !e.target.closest(".sidebar") &&
    !e.target.closest(".settings-panel") &&
    !e.target.closest(".sidebar-toggle") &&
    !e.target.closest("#settingsBtn")
  ) {
    sidebar?.classList.remove("open");
    settingsPanel?.classList.remove("open");
    updateOverlay();
  }
});

/* Nav item navigation */
sidebar?.addEventListener("click", e => {
  const item = e.target.closest(".nav-item[data-href]");
  if (!item || !sidebar.contains(item)) return;
  e.stopPropagation();

  const ripple = document.createElement("span");
  ripple.className = "nav-ripple";
  const rect = item.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
  item.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove(), { once: true });

  const href = item.dataset.href;
  if (href) {
    const current = window.location.pathname || "/";
    const targetPath = new URL(href, window.location.origin).pathname;
    if (targetPath !== current) {
      const raw = sessionStorage.getItem("navHistory");
      const history = raw ? JSON.parse(raw) : [];
      if (!history.length || history[history.length - 1] !== current) history.push(current);
      sessionStorage.setItem("navHistory", JSON.stringify(history.slice(-30)));
    }
    setTimeout(() => { window.location.href = href; }, 140);
  }

  sidebar?.classList.remove("open");
  updateOverlay();
});

function refreshSidebarAfterPinnedAppChange() {
  renderSidebar();
  markActiveNav();
  initPinnedAppsSettings();
  initAppsPagePinButtons();
}

function togglePinnedApp(href) {
  const normalized = normalizeAppHref(href);
  const pinned = getPinnedAppHrefs();
  const next = pinned.includes(normalized)
    ? pinned.filter(item => item !== normalized)
    : pinned.concat(normalized);
  savePinnedAppHrefs(next);
  refreshSidebarAfterPinnedAppChange();
}

Array.from(document.querySelectorAll(".back-btn")).forEach(btn => {
  btn.addEventListener("click", e => {
    e.preventDefault();
    e.stopPropagation();
    goToLastVisitedPage();
  });
});

/* ============================================================
   THEME SYSTEM
   ============================================================ */
$$(".swatch").forEach(swatch => {
  swatch.onclick = e => {
    e.stopPropagation();
    const theme = swatch.dataset.theme;
    body.classList.forEach(cls => { if (cls.startsWith("theme-")) body.classList.remove(cls); });
    body.classList.add("theme-" + theme);
    localStorage.setItem("theme", theme);
    $$(".swatch").forEach(s => s.classList.remove("active"));
    swatch.classList.add("active");
  };
});

(function loadTheme() {
  const saved = localStorage.getItem("theme");
  if (!saved) return;
  body.classList.add("theme-" + saved);
  const swatch = $(`.swatch[data-theme="${saved}"]`);
  if (swatch) swatch.classList.add("active");
})();

/* ============================================================
   DARK MODE
   ============================================================ */
const darkToggle = $("#darkToggle");

(function loadDarkMode() {
  const saved = localStorage.getItem("darkMode") === "true";
  body.classList.toggle("dark", saved);
  if (darkToggle) darkToggle.checked = saved;
})();

if (darkToggle) {
  darkToggle.onchange = e => {
    const v = e.target.checked;
    body.classList.toggle("dark", v);
    localStorage.setItem("darkMode", v);
  };
}

/* ============================================================
   BACKGROUND ENGINE
   ============================================================ */
function applyBackground(url) {
  body.style.backgroundImage     = `url('${url}')`;
  body.style.backgroundSize      = "cover";
  body.style.backgroundPosition  = "center";
  body.style.backgroundAttachment= "fixed";
  localStorage.setItem("customBG", url);
}

(function loadBackground() {
  const saved = localStorage.getItem("customBG");
  if (saved) applyBackground(saved);
})();

const bgUpload = $("#bgUpload");
if (bgUpload) {
  bgUpload.addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => applyBackground(reader.result);
    reader.readAsDataURL(file);
  });
}

const bgUrlBtn = $("#bgUrlBtn");
if (bgUrlBtn) {
  bgUrlBtn.onclick = () => {
    const url = $("#bgUrlInput")?.value.trim();
    if (url) applyBackground(url);
  };
}

const bgResetBtn = $("#bgResetBtn");
if (bgResetBtn) {
  bgResetBtn.onclick = () => {
    localStorage.removeItem("customBG");
    body.style.backgroundImage = "";
  };
}

/* ============================================================
   RIPPLE EFFECT
   ============================================================ */
document.addEventListener("click", e => {
  const target = e.target.closest("[data-ripple], button, .nav-item, .swatch, .auth-btn");
  if (!target) return;
  if (target.matches("input, textarea, select, .overlay, .auth-popup")) return;

  const rect   = target.getBoundingClientRect();
  const size   = Math.max(rect.width, rect.height);
  const x      = e.clientX - rect.left - size / 2;
  const y      = e.clientY - rect.top  - size / 2;
  const ripple = document.createElement("span");
  ripple.className = "ripple-fx";

  Object.assign(ripple.style, {
    position:      "absolute",
    width:         size + "px",
    height:        size + "px",
    left:          x + "px",
    top:           y + "px",
    borderRadius:  "50%",
    background:    "rgba(255,255,255,0.3)",
    transform:     "scale(0)",
    opacity:       "1",
    pointerEvents: "none",
    transition:    "transform 0.5s ease, opacity 0.5s ease"
  });

  const prevPosition = getComputedStyle(target).position;
  if (prevPosition === "static") target.style.position = "relative";
  target.style.overflow = "hidden";
  target.appendChild(ripple);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ripple.style.transform = "scale(2.5)";
      ripple.style.opacity   = "0";
    });
  });

  ripple.addEventListener("transitionend", () => {
    ripple.remove();
    if (!target.querySelector(".ripple-fx")) {
      target.style.overflow = "";
      if (prevPosition === "static") target.style.position = "";
    }
  }, { once: true });
});

/* ============================================================
   CLICK SOUND
   ============================================================ */
const clickSound = $("#clickSound");
if (clickSound) {
  document.addEventListener("click", e => {
    const tag = e.target.tagName.toLowerCase();
    if (["button", "a"].includes(tag) || e.target.classList.contains("nav-item")) {
      clickSound.currentTime = 0;
      clickSound.play().catch(() => {});
    }
  });
}

/* ============================================================
   PWA INSTALL
   ============================================================ */
let deferredPrompt;
const installBtn = $("#installBtn");

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.style.display = "block";
});

if (installBtn) installBtn.onclick = () => deferredPrompt?.prompt();

/* ============================================================
   ACTIVE NAV MARK
   ============================================================ */
function markActiveNav() {
  const path = location.pathname.replace(/\/+$/, "") || "/";
  $$(".nav-item[data-href]").forEach(item => {
    const href = item.dataset.href.replace(/\/+$/, "") || "/";
    // Normalise: strip leading ../
    const normHref = href.replace(/^(\.\.\/)+/, "/");
    item.classList.toggle("active", path === normHref || path.endsWith(normHref));
  });
}
markActiveNav();


/* ============================================================
   PINNED APPS CUSTOMIZATION
   ============================================================ */
function initPinnedAppsSettings() {
  const panel = document.getElementById("settingsPanel");
  if (!panel || panel.querySelector("#pinnedAppsSettings")) return;

  const section = document.createElement("div");
  section.id = "pinnedAppsSettings";
  section.className = "pinned-apps-settings";
  section.innerHTML = `
    <h3 style="margin-top:25px;">Pinned Apps</h3>
    <div class="settings-label">Menu bar location</div>
    <select id="pinnedAppsPosition" class="settings-select">
      <option value="after-apps">Under Apps</option>
      <option value="top">Top section</option>
      <option value="bottom">Bottom section</option>
    </select>
    <div class="settings-label" style="margin-top:14px;">Pinned shortcuts</div>
    <div id="pinnedAppsList" class="pinned-apps-list"></div>
  `;
  panel.appendChild(section);

  const positionSelect = section.querySelector("#pinnedAppsPosition");
  positionSelect.value = getPinnedAppsPosition();
  positionSelect.addEventListener("change", () => {
    localStorage.setItem(PINNED_APPS_POSITION_KEY, positionSelect.value);
    refreshSidebarAfterPinnedAppChange();
  });

  const list = section.querySelector("#pinnedAppsList");
  PINNED_APP_CATALOG.forEach(app => {
    const row = document.createElement("label");
    row.className = "pinned-app-toggle";
    const checked = getPinnedAppHrefs().includes(normalizeAppHref(app.href));
    row.innerHTML = `<span>${app.icon} ${escapeHtml(app.label)}</span><input type="checkbox" ${checked ? "checked" : ""} data-href="${app.href}">`;
    row.querySelector("input").addEventListener("change", () => togglePinnedApp(app.href));
    list.appendChild(row);
  });
}

function initAppsPagePinButtons() {
  document.querySelectorAll(".app-card").forEach(card => {
    const title = card.querySelector(".app-title")?.textContent?.trim();
    const cardHref = card.getAttribute("href");
    const app = PINNED_APP_CATALOG.find(item =>
      (cardHref && normalizeAppHref(item.href) === normalizeAppHref(cardHref)) ||
      item.label === title
    );
    if (!app) return;

    // Some newly launched apps may still be plain Coming Soon cards in older
    // markup. Activate them progressively here so users can open and pin them
    // without requiring another apps.html merge touchpoint.
    if (!cardHref) {
      card.style.opacity = "";
      card.style.pointerEvents = "";
      card.setAttribute("role", "link");
      card.setAttribute("tabindex", "0");
      if (!card.dataset.appActivated) {
        card.dataset.appActivated = "true";
        card.addEventListener("click", () => { window.location.href = app.href; });
        card.addEventListener("keydown", event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            window.location.href = app.href;
          }
        });
      }
    }

    let btn = card.querySelector(".app-pin-btn");
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "app-pin-btn";
      btn.dataset.href = app.href;
      btn.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        togglePinnedApp(app.href);
      });
      card.appendChild(btn);
    }

    const pinned = getPinnedAppHrefs().includes(normalizeAppHref(app.href));
    btn.classList.toggle("pinned", pinned);
    btn.textContent = pinned ? "★ Pinned" : "☆ Pin";
    btn.setAttribute("aria-label", `${pinned ? "Unpin" : "Pin"} ${app.label} on the menu bar`);
  });
}

initPinnedAppsSettings();
initAppsPagePinButtons();

console.log("%c360 V.3.0.0 — main.js loaded.", "color:#4ade80;font-weight:bold;font-size:14px;");
