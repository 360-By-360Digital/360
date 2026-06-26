/* ============================================================
   360 — COOKIE.JS
   Cookie consent banner for localStorage usage.
   Only shows once. Dismissed state persisted in localStorage.
   ============================================================ */

(function initCookieBanner() {
  /* Already accepted — don't show */
  if (localStorage.getItem("360_cookies_accepted") === "true") return;

  /* Build banner */
  const banner = document.createElement("div");
  banner.id = "cookie-banner";
  banner.innerHTML = `
    <div class="cookie-inner">
      <div class="cookie-text">
        <strong>360 uses cookies</strong>
        <p>We use local storage to save your preferences — theme, dark mode, background, and session data. We don't share your data with anyone or use it for advertising.</p>
      </div>
      <div class="cookie-actions">
        <button id="cookie-accept">Got it</button>
        <a href="/privacypolicy" class="cookie-link">Privacy Policy</a>
      </div>
    </div>
  `;

  /* Styles — injected so cookie.js is self-contained */
  const style = document.createElement("style");
  style.textContent = `
    #cookie-banner {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 9000;
      background: rgba(15, 23, 42, 0.97);
      backdrop-filter: blur(14px);
      border-top: 1px solid rgba(255,255,255,0.1);
      padding: 16px 20px;
      animation: slideUp 0.4s ease;
    }
    @keyframes slideUp {
      from { transform: translateY(100%); opacity: 0; }
      to   { transform: translateY(0);   opacity: 1; }
    }
    .cookie-inner {
      max-width: 860px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    }
    .cookie-text {
      flex: 1;
      min-width: 200px;
    }
    .cookie-text strong {
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      display: block;
      margin-bottom: 4px;
    }
    .cookie-text p {
      font-size: 13px;
      color: rgba(255,255,255,0.65);
      line-height: 1.5;
      margin: 0;
    }
    .cookie-actions {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-shrink: 0;
    }
    #cookie-accept {
      padding: 9px 22px;
      border-radius: 999px;
      border: none;
      background: linear-gradient(110deg, var(--a, #3b82f6), var(--a2, #06b6d4));
      color: #050816;
      font-weight: 700;
      font-size: 13px;
      cursor: pointer;
      transition: opacity .2s;
    }
    #cookie-accept:hover { opacity: .85; }
    .cookie-link {
      font-size: 12px;
      color: rgba(255,255,255,0.5);
      text-decoration: underline;
      cursor: pointer;
    }
    .cookie-link:hover { color: rgba(255,255,255,0.8); }
    @media (max-width: 600px) {
      .cookie-inner { flex-direction: column; align-items: flex-start; gap: 12px; }
      .cookie-actions { width: 100%; justify-content: space-between; }
      #cookie-accept { flex: 1; }
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(banner);

  /* Accept button */
  document.getElementById("cookie-accept").onclick = () => {
    localStorage.setItem("360_cookies_accepted", "true");
    banner.style.animation = "slideUp 0.3s ease reverse";
    setTimeout(() => banner.remove(), 300);
  };
})();
