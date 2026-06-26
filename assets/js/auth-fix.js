/* ============================================================
   AUTH POPUP FIX — auth-fix.js
   Drop this after main.js on any page that still uses the old
   inline auth popup (#auth-popup) with Sign In / Sign Up buttons.

   The root issue: main.js now routes signInBtn/signUpBtn to
   /account, but openAuth() is still called on some pages
   (e.g. chat.html sendMessage()). This makes the popup appear
   but the login/signup buttons inside it do nothing visible
   because they rely on the old inline Supabase flow.

   FIX STRATEGY:
   - Override openAuth() to redirect straight to /account
   - Keep the old popup hidden entirely (it's dead UI)
   - Pages that call openAuth() will now redirect properly
   ============================================================ */

(function patchAuth() {
  function fromParam() {
    return encodeURIComponent(window.location.pathname + window.location.search);
  }

  // Always persist the current page as the redirect target so email-confirm links
  // and OAuth callbacks can always bounce back here, even across browser sessions.
  const thisPage = window.location.pathname + window.location.search;
  if (!thisPage.startsWith('/account') && !thisPage.startsWith('/signin') && !thisPage.startsWith('/signup')) {
    sessionStorage.setItem('360_auth_redirect', thisPage);
  }

  // Override the global openAuth used by sendMessage, chat, etc.
  window.openAuth = function(mode) {
    const dest = mode === "signup"
      ? "/account?signup&from=" + fromParam()
      : "/account?signin&from=" + fromParam();
    window.location.href = dest;
  };

  // Hide the legacy popup permanently — it's replaced by /account
  const popup = document.getElementById("auth-popup");
  if (popup) {
    popup.style.display = "none";
    popup.classList.add("hidden");
  }

  // Patch any inline auth buttons that might still be wired directly
  const loginBtn  = document.getElementById("auth-login-btn");
  const signupBtn = document.getElementById("auth-signup-btn");
  const closeBtn  = document.getElementById("auth-close-btn");

  if (loginBtn)  loginBtn.onclick  = () => window.openAuth("signin");
  if (signupBtn) signupBtn.onclick = () => window.openAuth("signup");
  if (closeBtn)  closeBtn.onclick  = () => {};

  // Patch github/google OAuth buttons inside the popup
  const ghBtn = document.getElementById("github-login");
  const ggBtn = document.getElementById("google-login");
  if (ghBtn) ghBtn.onclick = () => {
    supabaseClient.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: window.location.origin + "/account?signin&from=" + fromParam() }
    });
  };
  if (ggBtn) ggBtn.onclick = () => {
    supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin + "/account?signin&from=" + fromParam() }
    });
  };

})();
