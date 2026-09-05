/* ============================================================
   360 — CURSOR.JS
   Completely self-contained. Works on every page.
   ============================================================ */
(function () {
  /* Skip on touch devices */
  if (!window.matchMedia("(hover: hover)").matches) return;

  const body = document.body;

  let rafId = null;
  let trailActive = true; // default style uses the trail

  /* Inject cursor elements directly into body */
  function inject() {
    ["cursor-dot", "cursor-trail", "cursor-crosshair", "cursor-blob"].forEach(cls => {
      if (!document.querySelector("." + cls)) {
        const el = document.createElement("div");
        el.className = cls;
        body.appendChild(el);
      }
    });
    run();
  }

  function run() {
    const dot       = document.querySelector(".cursor-dot");
    const trail     = document.querySelector(".cursor-trail");
    const crosshair = document.querySelector(".cursor-crosshair");
    const blob      = document.querySelector(".cursor-blob");

    let mx = 0, my = 0;
    let tx = 0, ty = 0;

    /* Instant elements — dot + crosshair */
    document.addEventListener("mousemove", e => {
      mx = e.clientX;
      my = e.clientY;
      if (dot)       { dot.style.left = mx + "px"; dot.style.top = my + "px"; }
      if (crosshair) { crosshair.style.left = mx + "px"; crosshair.style.top = my + "px"; }
    });

    /* Lagging elements — trail + blob.
       Only runs when one of those styles is active; pauses automatically
       once the element has caught up so it doesn't burn a frame budget
       doing nothing during AI streaming or heavy rendering. */
    function animateTrail() {
      const dx = mx - tx;
      const dy = my - ty;
      tx += dx * 0.18;
      ty += dy * 0.18;
      if (trail) { trail.style.left = tx + "px"; trail.style.top = ty + "px"; }
      if (blob)  { blob.style.left  = tx + "px"; blob.style.top  = ty + "px"; }
      // Stop looping once position has converged — restarts on next mousemove
      if (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3) {
        rafId = requestAnimationFrame(animateTrail);
      } else {
        rafId = null;
      }
    }

    function startTrail() {
      if (trailActive && rafId === null) rafId = requestAnimationFrame(animateTrail);
    }

    document.addEventListener("mousemove", startTrail);

    /* Load + apply saved style */
    const savedStyle = localStorage.getItem("360_cursor_style") || "default";
    const savedColor = localStorage.getItem("360_cursor_color");
    applyStyle(savedStyle);
    if (savedColor) applyColor(savedColor);

    /* Wire up settings panel */
    document.addEventListener("click", e => {
      const opt = e.target.closest(".cursor-option");
      if (opt && opt.dataset.cursor) {
        e.stopPropagation();
        applyStyle(opt.dataset.cursor);
      }
    });

    const picker = document.getElementById("cursorColorPicker");
    if (picker) {
      picker.value = savedColor || "#3b82f6";
      picker.addEventListener("input", e => applyColor(e.target.value));
    }

    const resetBtn = document.getElementById("cursorColorReset");
    if (resetBtn) {
      resetBtn.addEventListener("click", e => {
        e.stopPropagation();
        body.style.removeProperty("--cursor-color");
        localStorage.removeItem("360_cursor_color");
        if (picker) picker.value = "#3b82f6";
      });
    }

    /* Re-wire if settings panel opens later */
    const observer = new MutationObserver(() => {
      const p = document.getElementById("cursorColorPicker");
      if (p && !p._wired) {
        p._wired = true;
        p.value = localStorage.getItem("360_cursor_color") || "#3b82f6";
        p.addEventListener("input", e => applyColor(e.target.value));
      }
      document.querySelectorAll(".cursor-option").forEach(opt => {
        if (!opt._wired) {
          opt._wired = true;
          opt.addEventListener("click", e => {
            e.stopPropagation();
            applyStyle(opt.dataset.cursor);
          });
        }
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function applyStyle(style) {
    body.dataset.cursor = style;
    localStorage.setItem("360_cursor_style", style);
    document.querySelectorAll(".cursor-option").forEach(opt => {
      opt.classList.toggle("active", opt.dataset.cursor === style);
    });
    // trail + blob are the only styles that need the rAF loop
    trailActive = style === "ring" || style === "blob" || style === "default";
    if (!trailActive && rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function applyColor(hex) {
    body.style.setProperty("--cursor-color", hex);
    localStorage.setItem("360_cursor_color", hex);
  }

  /* Run after DOM is ready */
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }
})();
