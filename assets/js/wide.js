/* ============================================================
   360 — WIDE.JS
   "360 Wide" glassmorphism mode toggle.

   HOW TO USE:
   1. Add to <head> (after main.css):
        <link rel="stylesheet" href="/assets/css/wide.css" />

   2. Add before </body> (after main.js):
        <script src="/assets/js/wide.js"></script>

   3. The script auto-injects a toggle row into .settings-panel.
      No HTML changes required on any existing page.
   ============================================================ */

(function initWideMode() {
  "use strict";

  const STORAGE_KEY = "360_wide_mode";

  /* ── Read persisted state ── */
  let wideOn = localStorage.getItem(STORAGE_KEY) === "true";

  /* ── Apply / remove the class immediately (before paint) ── */
  function applyState(on) {
    document.body.classList.toggle("wide-mode", on);
  }

  applyState(wideOn);

  /* ── Build the settings toggle row ── */
  function injectToggle() {
    /* Don't double-inject */
    if (document.getElementById("wideToggleRow")) return;

    const panel = document.getElementById("settingsPanel");
    if (!panel) return;

    /* ── Section heading ── */
    const heading = document.createElement("h3");
    heading.style.marginTop = "25px";
    heading.textContent = "360 Wide";

    /* ── Row ── */
    const row = document.createElement("div");
    row.id = "wideToggleRow";
    row.style.cssText = "margin-top:10px;";
    row.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;cursor:pointer;" id="wideToggleClickTarget">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--txt);">Enable 360 Wide</div>
          <div style="font-size:11px;color:var(--mut);margin-top:2px;">
            Deep glassmorphism overlay across the whole UI
          </div>
        </div>
        <div class="wide-toggle-track${wideOn ? " on" : ""}" id="wideTrack"></div>
      </div>`;

    /* ── Insert after the last <h3> in the panel (or append) ── */
    const headings = panel.querySelectorAll("h3");
    const lastH3   = headings.length ? headings[headings.length - 1] : null;
    if (lastH3) {
      lastH3.after(heading);
      heading.after(row);
    } else {
      panel.appendChild(heading);
      panel.appendChild(row);
    }

    /* ── Wire click ── */
    row.querySelector("#wideToggleClickTarget").addEventListener("click", toggle);
  }

  /* ── Toggle handler ── */
  function toggle() {
    wideOn = !wideOn;
    localStorage.setItem(STORAGE_KEY, wideOn);
    applyState(wideOn);

    /* Mutually exclusive with 360 Gallium — both re-skin the same
       surfaces, so leave only one active at a time. */
    if (wideOn && window.GalliumMode && window.GalliumMode.isOn) {
      window.GalliumMode.disable();
    }

    /* Sync track pill */
    const track = document.getElementById("wideTrack");
    if (track) track.classList.toggle("on", wideOn);

    /* Optional: brief shimmer on activate to signal the change */
    if (wideOn) shimmer();
  }

  /* ── Subtle full-page shimmer when activating ── */
  function shimmer() {
    const el = document.createElement("div");
    el.style.cssText = `
      position: fixed; inset: 0; z-index: 99998;
      pointer-events: none;
      background: linear-gradient(135deg,
        rgba(59,130,246,0.08) 0%,
        rgba(6,182,212,0.06) 50%,
        rgba(139,92,246,0.08) 100%);
      opacity: 1;
      animation: wideModeShimmer 0.55s ease forwards;
    `;
    const style = document.createElement("style");
    style.id    = "_wide_shimmer_style";
    style.textContent = `
      @keyframes wideModeShimmer {
        0%   { opacity: 0; }
        30%  { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    if (!document.getElementById("_wide_shimmer_style")) {
      document.head.appendChild(style);
    }
    document.body.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }

  /* ── Expose public API so other scripts can toggle wide mode ── */
  window.WideMode = {
    enable:  () => { if (!wideOn) toggle(); },
    disable: () => { if (wideOn)  toggle(); },
    toggle,
    get isOn() { return wideOn; },
  };

  /* ── Inject when DOM is ready ── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectToggle);
  } else {
    /* Panel may not exist yet if main.js runs after us — try now and retry */
    injectToggle();
    if (!document.getElementById("wideToggleRow")) {
      const ob = new MutationObserver(() => {
        if (document.getElementById("settingsPanel")) {
          injectToggle();
          ob.disconnect();
        }
      });
      ob.observe(document.body, { childList: true, subtree: true });
    }
  }

  /* ── Also wire to settings.html's visible Bob-style toggle if present ──
     (settings.html has its own inline toggle system)              */
  document.addEventListener("DOMContentLoaded", () => {
    /* settings.html panel wiring — no-op on other pages */
    const visBobSection = document.getElementById("visBobToggle");
    if (!visBobSection) return; /* not settings.html */

    /* Inject a visible toggle row into settings.html preference panel */
    const prefPanel = document.getElementById("panel-preference");
    if (!prefPanel) return;

    const card = document.createElement("div");
    card.className = "st-card";
    card.innerHTML = `
      <div class="st-card-title">360 Wide Mode</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;">
        <div>
          <div style="font-size:14px;font-weight:500;">Enable 360 Wide</div>
          <div style="font-size:12px;color:var(--mut);margin-top:2px;">
            Deep glassmorphism across every UI surface.
          </div>
        </div>
        <button class="st-toggle${wideOn ? " on" : ""}" id="settingsWideToggle"></button>
      </div>`;

    /* Insert after the Bob card */
    const bobCard = [...prefPanel.querySelectorAll(".st-card")]
      .find(c => c.textContent.includes("Bob"));
    if (bobCard) bobCard.after(card);
    else prefPanel.appendChild(card);

    document.getElementById("settingsWideToggle")?.addEventListener("click", function() {
      toggle();
      this.classList.toggle("on", wideOn);
    });
  });

})();
