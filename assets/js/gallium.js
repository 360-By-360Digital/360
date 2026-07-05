/* ============================================================
   360 — GALLIUM.JS
   "360 Gallium" — deep Liquid Glass mode toggle.

   Same shape as wide.js on purpose (drop-in sibling, no HTML
   changes required), but drives the specular gleam that tracks
   the cursor, injects the SVG refraction filter used by the
   ambient backdrop, and plays a "pour" ripple on activation
   instead of Wide's flat shimmer.

   Gallium and Wide both re-skin the same surfaces with
   backdrop-filter + !important, so they are mutually exclusive
   at runtime — turning one on turns the other off.

   HOW TO USE:
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

  /* ── Read persisted state ── */
  let galliumOn = localStorage.getItem(STORAGE_KEY) === "true";

  /* ── Apply / remove the class immediately (before paint) ── */
  function applyState(on) {
    document.body.classList.toggle("gallium-mode", on);
    if (on) {
      ensureWarpFilter();
      startGleamTracking();
    } else {
      stopGleamTracking();
    }
  }

  applyState(galliumOn);

  /* ── SVG refraction filter used by the ambient backdrop ──
     A very low-frequency turbulence + displacement map, applied
     only to the fixed ambient layer (body.gallium-mode::before)
     so the "light" behind the glass looks like it's bending
     rather than just blurred. Cheap: one hidden 0x0 SVG node. */
  function ensureWarpFilter() {
    if (document.getElementById("_gallium_warp_svg")) return;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("id", "_gallium_warp_svg");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.style.cssText = "position:absolute;overflow:hidden;pointer-events:none;";
    svg.innerHTML = `
      <filter id="galliumWarp" x="-20%" y="-20%" width="140%" height="140%">
        <feTurbulence type="fractalNoise" baseFrequency="0.008 0.012" numOctaves="2" seed="7" result="n" />
        <feDisplacementMap in="SourceGraphic" in2="n" scale="40" xChannelSelector="R" yChannelSelector="G" />
      </filter>`;
    document.body.appendChild(svg);
  }

  /* ── Mouse-reactive specular gleam ──
     Sets --glx/--gly (percentages) on the root so every glass
     surface's radial-gradient highlight reacts to one shared
     light source, like reflections skating across a liquid
     surface as the cursor moves. Throttled to rAF. */
  let rafPending = false;
  let lastEvent  = null;

  function onPointerMove(e) {
    lastEvent = e;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (!lastEvent) return;
      const x = (lastEvent.clientX / window.innerWidth)  * 100;
      const y = (lastEvent.clientY / window.innerHeight) * 100;
      document.documentElement.style.setProperty("--glx", x.toFixed(2) + "%");
      document.documentElement.style.setProperty("--gly", y.toFixed(2) + "%");
    });
  }

  function startGleamTracking() {
    document.addEventListener("pointermove", onPointerMove, { passive: true });
  }

  function stopGleamTracking() {
    document.removeEventListener("pointermove", onPointerMove);
  }

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
            Deep Liquid Glass — refractive, cursor-lit, and alive
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

  /* ── "Pour" ripple when activating — a soft droplet bloom from
     the center of the viewport, standing in for Wide's shimmer ── */
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

    const card = document.createElement("div");
    card.className = "st-card";
    card.innerHTML = `
      <div class="st-card-title">360 Gallium</div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;">
        <div>
          <div style="font-size:14px;font-weight:500;">Enable 360 Gallium</div>
          <div style="font-size:12px;color:var(--mut);margin-top:2px;">
            Deep Liquid Glass — refractive, cursor-lit, and alive. Replaces 360 Wide when on.
          </div>
        </div>
        <button class="st-toggle${galliumOn ? " on" : ""}" id="settingsGalliumToggle"></button>
      </div>`;

    /* Insert right after the Wide card if it exists, else after Bob */
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
