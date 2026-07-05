/* ============================================================
   360 — GALLIUM.JS  (performance pass [again])
   "360 Gallium" — deep Liquid Glass mode toggle.

   v2 changes:
   - Removed the injected SVG feDisplacementMap filter entirely.
     It was applied to a viewport-sized, already-blurred layer —
     expensive on every browser, brutal on integrated GPUs.
   - Removed the document-wide `pointermove` listener that wrote
     --glx/--gly onto <html> on every frame. That invalidated
     style for every element referencing those variables across
     the WHOLE page on every mouse move, which is a page-wide
     recalculation, not a local one — the main JS-side cause of
     the lag. The cursor-tracked gleam is now opt-in per element:
     it only attaches to the small set of "hero" singleton
     surfaces (logo pill, auth box, modal, profile popup) that
     actually exist on the current page, and it writes the
     variable on that element only, throttled.

   Same shape as wide.js on purpose (drop-in sibling, no HTML
   changes required). Gallium and Wide both re-skin the same
   surfaces with backdrop-filter + !important, so they are
   mutually exclusive at runtime — turning one on turns the
   other off.

  @MINGZEW2 HOW TO USE:
   1. Add to <head> (after main.css, after wide.css):
        <link rel="stylesheet" href="/assets/css/gallium.css" />

   2. Add before </body> (after main.js / wide.js):
        <script src="/assets/js/gallium.js"></script>

   3. The script auto-injects a toggle row into .settings-panel.
      No HTML changes required on any existing page.
   ============================================================ */

(function initGalliumMode() {
  "use strict";

  const STORAGE_KEY = "360_gallium_mode";
  const GLEAM_SELECTOR = ".logo-main, .auth-box, .modal-box, #profile-popup";
  const GLEAM_THROTTLE_MS = 40; /* ~25fps — plenty smooth for a slow-moving highlight */

  /* ── Read persisted state ── */
  let galliumOn = localStorage.getItem(STORAGE_KEY) === "true";

  /* ── Apply / remove the class immediately (before paint) ── */
  function applyState(on) {
    document.body.classList.toggle("gallium-mode", on);
    if (on) {
      attachGleamListeners();
    } else {
      detachGleamListeners();
    }
  }

  applyState(galliumOn);

  /* ── Cursor-reactive gleam, scoped to hero elements only ──
     Attaches a lightweight mousemove listener directly to each
     hero element present on the page (there are only ever 0-2 of
     these), writing --glx/--gly onto that element specifically —
     never onto <html> or <body> — so the browser only needs to
     recompute style for that one element's subtree, not the
     whole document. Throttled by timestamp, not rAF piling. */
  let gleamEls = [];
  let lastMove = 0;

  function onHeroMove(e) {
    const now = performance.now();
    if (now - lastMove < GLEAM_THROTTLE_MS) return;
    lastMove = now;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width)  * 100;
    const y = ((e.clientY - rect.top)  / rect.height) * 100;
    el.style.setProperty("--glx", x.toFixed(1) + "%");
    el.style.setProperty("--gly", y.toFixed(1) + "%");
  }

  function attachGleamListeners() {
    detachGleamListeners();
    gleamEls = Array.from(document.querySelectorAll(GLEAM_SELECTOR));
    gleamEls.forEach(el => {
      el.classList.add("gallium-gleam");
      el.addEventListener("mousemove", onHeroMove, { passive: true });
    });
  }

  function detachGleamListeners() {
    gleamEls.forEach(el => {
      el.classList.remove("gallium-gleam");
      el.removeEventListener("mousemove", onHeroMove);
    });
    gleamEls = [];
  }

  /* Hero elements (profile popup, modals) can be created after
     initial load — re-scan lazily on click/DOM changes rather
     than running an expensive observer callback constantly. */
  function rescanGleamTargets() {
    if (!galliumOn) return;
    attachGleamListeners();
  }
  document.addEventListener("click", rescanGleamTargets, { passive: true, capture: true });

  /* ── Build the settings toggle row ── */
  function injectToggle() {
    if (document.getElementById("galliumToggleRow")) return;

    const panel = document.getElementById("settingsPanel");
    if (!panel) return;

    const heading = document.createElement("h3");
    heading.style.marginTop = "25px";
    heading.textContent = "360 Gallium";

    const row = document.createElement("div");
    row.id = "galliumToggleRow";
    row.style.cssText = "margin-top:10px;";
    row.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;cursor:pointer;" id="galliumToggleClickTarget">
        <div>
          <div style="font-size:13px;font-weight:600;color:var(--txt);">Enable 360 Gallium</div>
          <div style="font-size:11px;color:var(--mut);margin-top:2px;">
            Deep Liquid Glass — refractive and cursor-lit
          </div>
        </div>
        <div class="gallium-toggle-track${galliumOn ? " on" : ""}" id="galliumTrack"></div>
      </div>`;

    const headings = panel.querySelectorAll("h3");
    const lastH3   = headings.length ? headings[headings.length - 1] : null;
    if (lastH3) {
      lastH3.after(heading);
      heading.after(row);
    } else {
      panel.appendChild(heading);
      panel.appendChild(row);
    }

    row.querySelector("#galliumToggleClickTarget").addEventListener("click", toggle);
  }

  /* ── Toggle handler ── */
  function toggle() {
    galliumOn = !galliumOn;
    localStorage.setItem(STORAGE_KEY, galliumOn);
    applyState(galliumOn);

    /* Mutually exclusive with 360 Wide — both re-skin the same
       surfaces, so leave only one active at a time. */
    if (galliumOn && window.WideMode && window.WideMode.isOn) {
      window.WideMode.disable();
    }

    const track = document.getElementById("galliumTrack");
    if (track) track.classList.toggle("on", galliumOn);

    const settingsTrack = document.getElementById("settingsGalliumToggle");
    if (settingsTrack) settingsTrack.classList.toggle("on", galliumOn);

    if (galliumOn) pourRipple();
  }

  /* ── "Pour" ripple when activating — a single 0.85s one-shot
     animation, not continuous, so it costs nothing at rest ── */
  function pourRipple() {
    const el = document.createElement("div");
    el.className = "gallium-ripple";
    el.style.left = "50%";
    el.style.top  = "40%";
    document.body.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  }

  /* ── Expose public API so other scripts (and wide.js) can toggle ── */
  window.GalliumMode = {
    enable:  () => { if (!galliumOn) toggle(); },
    disable: () => { if (galliumOn)  toggle(); },
    toggle,
    get isOn() { return galliumOn; },
  };

  /* ── Inject when DOM is ready ── */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectToggle);
  } else {
    injectToggle();
    if (!document.getElementById("galliumToggleRow")) {
      const ob = new MutationObserver(() => {
        if (document.getElementById("settingsPanel")) {
          injectToggle();
          ob.disconnect();
        }
      });
      ob.observe(document.body, { childList: true, subtree: true });
    }
  }

  /* ── Wire to settings.html's visible toggle system, same pattern
     wide.js uses — inserted right after the Wide card if present. */
  document.addEventListener("DOMContentLoaded", () => {
    const visBobSection = document.getElementById("visBobToggle");
    if (!visBobSection) return; /* not settings.html */

    const prefPanel = document.getElementById("panel-preference");
    if (!prefPanel) return;

    const existingToggle = document.getElementById("settingsGalliumToggle");
    if (existingToggle) {
      existingToggle.classList.toggle("on", galliumOn);
      existingToggle.addEventListener("click", function() {
        toggle();
        this.classList.toggle("on", galliumOn);
      });
      return;
    }

    const card = document.createElement("div");
    card.className = "st-card";
    card.id = "settingsGalliumCard";
    card.innerHTML = `
      <div class="st-card-title">360 Gallium</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;">
        <div>
          <div style="font-size:14px;font-weight:500;">Enable 360 Gallium</div>
          <div style="font-size:12px;color:var(--mut);margin-top:2px;">
            Deep Liquid Glass — refractive and cursor-lit. Replaces 360 Wide when on.
          </div>
        </div>
        <button class="st-toggle${galliumOn ? " on" : ""}" id="settingsGalliumToggle"></button>
      </div>`;

    const wideCard = [...prefPanel.querySelectorAll(".st-card")]
      .find(c => c.textContent.includes("360 Wide"));
    const bobCard = [...prefPanel.querySelectorAll(".st-card")]
      .find(c => c.textContent.includes("Bob"));
    if (wideCard) wideCard.after(card);
    else if (bobCard) bobCard.after(card);
    else prefPanel.appendChild(card);

    document.getElementById("settingsGalliumToggle")?.addEventListener("click", function() {
      toggle();
      this.classList.toggle("on", galliumOn);
    });
  });

})();
