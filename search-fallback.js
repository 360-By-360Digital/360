/* ============================================================
   360 — SEARCH FALLBACK V2
   Tries Google CSE first. On quota/error falls back to Vyntr.
   Results styled to match 360's glassmorphism UI exactly.
   ============================================================ */

(function () {
  function octicon(name) { return window.Octicons?.icon ? window.Octicons.icon(name) : ''; }
  // Requests go through the vyntr-proxy Supabase edge function so the Vyntr
  // API key stays server-side instead of shipping to every visitor's browser.
  const VYNTR_URL = "https://wiswfpfsjiowtrdyqpxy.supabase.co/functions/v1/vyntr-proxy";
  let cseWorking = true;
  let vyntrActive = false;

  /* Watch for CSE quota errors */
  const observer = new MutationObserver(() => {
    const errEl = document.querySelector(".gs-no-results-result, .gsc-results-wrapper-visible");
    if ((errEl?.textContent || "").match(/INVALID_ACCESS|quota|error/i)) {
      if (!vyntrActive) triggerVyntr();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  /* Intercept form submits when CSE is down */
  document.addEventListener("submit", e => {
    if (vyntrActive) {
      e.preventDefault();
      const q = document.querySelector("input.gsc-input, #search-input")?.value?.trim();
      if (q) showVyntrResults(q);
    }
  });

  /* On page load — check for ?q= and CSE failure */
  window.addEventListener("load", () => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q && vyntrActive) showVyntrResults(q);
  });

  function triggerVyntr() {
    vyntrActive = true;
    cseWorking = false;
    const q = new URLSearchParams(window.location.search).get("q")
            || document.querySelector("input.gsc-input")?.value?.trim();
    if (q) showVyntrResults(q);
  }

  /* Inject styles */
  const style = document.createElement("style");
  style.textContent = `
    #vyntr-results { max-width:680px; margin:20px auto; padding:0 16px; font-family:var(--font,system-ui); }
    .vyntr-header { font-size:13px; color:var(--mut,#6b7280); margin-bottom:16px; display:flex; align-items:center; gap:8px; }
    .vyntr-header strong { color:var(--a,#3b82f6); }
    .vyntr-result {
      background:rgba(255,255,255,.6); backdrop-filter:blur(10px);
      border-radius:16px; padding:16px; margin-bottom:14px;
      border:1px solid var(--br,rgba(148,163,184,.4)); transition:.2s;
      text-decoration:none; display:block; color:inherit;
    }
    body.dark .vyntr-result { background:rgba(15,23,42,.7); border-color:rgba(255,255,255,.15); }
    .vyntr-result:hover { border-color:var(--a,#3b82f6); transform:translateY(-1px); }
    .vyntr-result-meta { display:flex; align-items:center; gap:6px; margin-bottom:5px; }
    .vyntr-favicon { width:14px; height:14px; border-radius:2px; }
    .vyntr-domain { font-size:12px; color:var(--mut,#6b7280); }
    body.dark .vyntr-domain { color:var(--mutd,#a3a7b3); }
    .vyntr-title { font-size:18px; font-weight:600; color:var(--a,#3b82f6); margin-bottom:4px; }
    .vyntr-snippet { font-size:13px; color:var(--mut,#6b7280); line-height:1.6; }
    body.dark .vyntr-snippet { color:var(--mutd,#a3a7b3); }
    .vyntr-loading { text-align:center; padding:40px; color:var(--mut,#6b7280); font-size:14px; }
    .vyntr-badge {
      display:inline-flex; align-items:center; gap:5px; padding:3px 10px;
      border-radius:999px; background:rgba(59,130,246,.1);
      border:1px solid rgba(59,130,246,.25); font-size:11px; font-weight:600; color:var(--a,#3b82f6);
    }
  `;
  document.head.appendChild(style);

  async function showVyntrResults(query) {
    /* Hide CSE results */
    document.querySelector(".gsc-results-wrapper-visible, .gsc-above-wrapper-area, .gcsc-find-more-on-google-root")?.style?.setProperty("display","none","important");

    let container = document.getElementById("vyntr-results");
    if (!container) {
      container = document.createElement("div");
      container.id = "vyntr-results";
      const shell = document.querySelector(".search-shell, .gcse-search, #search-wrap");
      shell ? shell.after(container) : document.body.appendChild(container);
    }

    container.innerHTML = `<div class="vyntr-loading">${octicon('search')} Searching with Vyntr...</div>`;

    try {
      const res  = await fetch(`${VYNTR_URL}?q=${encodeURIComponent(query)}`, {
        headers: { "Accept": "application/json" }
      });
      if (!res.ok) throw new Error("Vyntr error " + res.status);
      const data = await res.json();
      renderVyntr(container, query, data);
    } catch (err) {
      container.innerHTML = `<div class="vyntr-loading">${octicon('x-circle')} Search unavailable right now. Try again later.</div>`;
    }
  }

  function renderVyntr(container, query, data) {
    const results = data.results || data.web?.results || [];
    if (!results.length) {
      container.innerHTML = `<div class="vyntr-loading">No results found for "<strong>${query}</strong>"</div>`;
      return;
    }

    let html = `
      <div class="vyntr-header">
        <span class="vyntr-badge">${octicon('zap')} Vyntr Search</span>
        Results for <strong>${query}</strong>
      </div>`;

    results.forEach(r => {
      const url     = r.url || r.link || "#";
      const title   = (r.title || "").replace(/</g,"&lt;");
      const snippet = (r.snippet || r.description || r.content || "").replace(/</g,"&lt;");
      let domain = "";
      try { domain = new URL(url).hostname.replace("www.",""); } catch {}
      const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;

      html += `
        <a class="vyntr-result" href="${url}" target="_blank" rel="noopener noreferrer">
          <div class="vyntr-result-meta">
            <img class="vyntr-favicon" src="${favicon}" alt="" onerror="this.style.display='none'" />
            <span class="vyntr-domain">${domain}</span>
          </div>
          <div class="vyntr-title">${title}</div>
          ${snippet ? `<div class="vyntr-snippet">${snippet}</div>` : ""}
        </a>`;
    });

    container.innerHTML = html;
  }
})();
