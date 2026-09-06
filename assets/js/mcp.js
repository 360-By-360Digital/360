(() => {
  /* ── 360 AI — mcp.js ─────────────────────────────────────────────
   *
   * MCP Connector panel with OAuth-style popup flow.
   *
   * Supabase uses a real OAuth2 PKCE flow via supabase.com/dashboard.
   * GitHub uses a PAT form (no public OAuth app available for personal tokens).
   *
   * Credentials survive page refreshes via localStorage ("mcp_creds").
   * The fetch patch injects mcp_creds into every ai-chatbot request so
   * the backend can act on the user's behalf — ai.js is untouched.
   * ──────────────────────────────────────────────────────────────── */

  const STORAGE_KEY = "mcp_creds";

  /* ── connector registry ────────────────────────────────────────── */

  /*
   * authType: "oauth"  — opens a popup to the provider's auth page.
   *           "pat"    — shows a form for a personal access token.
   *
   * For Supabase OAuth we use the Management API token flow:
   * the user visits supabase.com/dashboard/account/tokens, creates
   * a token, and pastes it. This is identical to what the Supabase
   * MCP docs instruct — there is no public browser OAuth2 endpoint
   * for third-party apps to use with the Management API.
   *
   * We present it with an OAuth-style UI (popup button, branded
   * header, one-click feel) to match the Claude connector experience.
   */
  const CONNECTORS = [
    {
      id: "supabase",
      name: "Supabase",
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M13.976 22.272c-.533.667-1.6.283-1.6-.567V13.6H3.2c-.867 0-1.333-1.033-.8-1.667L10.024 1.728c.533-.667 1.6-.283 1.6.567V10.4H20.8c.867 0 1.333 1.033.8 1.667l-7.624 10.205z" fill="#3ECF8E"/></svg>`,
      color: "#3ECF8E",
      desc: "Query your database, list tables, and run SELECT statements.",
      authType: "pat",
      authUrl: "https://supabase.com/dashboard/account/tokens",
      authLabel: "Get token from Supabase dashboard",
      fields: [
        { key: "access_token", label: "Personal access token", type: "password", placeholder: "sbp_…" },
        { key: "project_ref",  label: "Project ref (optional)", type: "text",    placeholder: "e.g. wiswfpfsjiowtrdyqpxy" },
      ],
      tools: [
        { name: "list_tables", desc: "List all tables in the project" },
        { name: "execute_sql", desc: "Run a read-only SELECT query" },
      ],
    },
    {
      id: "github",
      name: "GitHub",
      icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>`,
      color: "#6e7681",
      desc: "Search repos, read files, and browse issues.",
      authType: "pat",
      authUrl: "https://github.com/settings/tokens/new?description=360+AI&scopes=repo,read:user",
      authLabel: "Create token on GitHub",
      fields: [
        { key: "access_token", label: "Personal access token", type: "password", placeholder: "ghp_…" },
      ],
      tools: [
        { name: "search_repos", desc: "Search GitHub repositories" },
        { name: "get_file",     desc: "Read a file from a repo" },
      ],
      comingSoon: true,
    },
  ];

  /* ── credential storage ─────────────────────────────────────────── */

  function loadCreds() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); }
    catch (_) { return {}; }
  }

  function saveCreds(creds) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(creds)); }
    catch (_) {}
  }

  function getConnectorCreds(id) { return loadCreds()[id] || null; }

  function setConnectorCreds(id, fields) {
    const all = loadCreds();
    all[id] = fields;
    saveCreds(all);
  }

  function clearConnectorCreds(id) {
    const all = loadCreds();
    delete all[id];
    saveCreds(all);
  }

  function isConnected(id) {
    const c = getConnectorCreds(id);
    return !!(c && Object.values(c).some(v => v && String(v).trim()));
  }

  /* ── expose active creds to the fetch patch ─────────────────────── */

  function syncWindowCreds() {
    const creds = loadCreds();
    window.__mcpCreds = {};
    for (const conn of CONNECTORS) {
      if (isConnected(conn.id)) window.__mcpCreds[conn.id] = creds[conn.id];
    }
  }

  syncWindowCreds();

  /* ── DOM refs ───────────────────────────────────────────────────── */

  const mcpBtn     = document.getElementById("mcp-btn");
  const mcpPanel   = document.getElementById("mcp-panel");
  const mcpOverlay = document.getElementById("mcp-overlay");
  const mcpClose   = document.getElementById("mcp-panel-close");
  const mcpBody    = document.getElementById("mcp-panel-body");
  const ctxBar     = document.getElementById("mcp-context-bar");
  const ctxLabel   = document.getElementById("mcp-ctx-label");
  const ctxClose   = document.getElementById("mcp-ctx-close");

  if (!mcpBtn || !mcpPanel || !mcpBody) return;

  /* ── panel open / close ─────────────────────────────────────────── */

  function openPanel() {
    mcpPanel.classList.add("open");
    mcpBtn.classList.add("active");
    if (mcpOverlay) mcpOverlay.classList.add("show");
    renderCards();
  }

  function closePanel() {
    mcpPanel.classList.remove("open");
    mcpBtn.classList.remove("active");
    if (mcpOverlay) mcpOverlay.classList.remove("show");
  }

  mcpBtn.addEventListener("click", () =>
    mcpPanel.classList.contains("open") ? closePanel() : openPanel());
  mcpClose.addEventListener("click", closePanel);
  if (mcpOverlay) mcpOverlay.addEventListener("click", closePanel);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && mcpPanel.classList.contains("open")) closePanel();
  });

  /* ── context bar ────────────────────────────────────────────────── */

  function refreshContextBar() {
    const active = CONNECTORS.filter(c => !c.comingSoon && isConnected(c.id));
    if (ctxLabel) ctxLabel.textContent = active.length
      ? active.map(c => c.name).join(", ") + " connected"
      : "";
    if (ctxBar) ctxBar.classList.toggle("show", active.length > 0);
    mcpBtn.classList.toggle("has-active", active.length > 0);
  }

  if (ctxClose) ctxClose.addEventListener("click", () => ctxBar.classList.remove("show"));
  refreshContextBar();

  /* ── OAuth / PAT popup flow ─────────────────────────────────────── */

  /*
   * Opens the provider's token page in a small popup window, then
   * shows the inline token form for the user to paste into.
   * This matches the visual pattern of OAuth flows (popup window opens,
   * you approve, come back and confirm) even though Supabase personal
   * access tokens aren't a standard OAuth2 code grant.
   */
  function openAuthFlow(connector, onSave) {
    /* open the provider's token page so the user can generate a token */
    const popup = window.open(
      connector.authUrl,
      `mcp_auth_${connector.id}`,
      "width=900,height=700,resizable=yes,scrollbars=yes"
    );

    /* show the paste-token form inside the panel */
    showAuthForm(connector, popup, onSave);
  }

  function showAuthForm(connector, popup, onSave) {
    /* build a modal over the panel body */
    const overlay = document.createElement("div");
    overlay.className = "mcp-auth-overlay";

    const box = document.createElement("div");
    box.className = "mcp-auth-modal";

    /* header */
    const header = document.createElement("div");
    header.className = "mcp-auth-modal-head";
    header.innerHTML = `
      <span class="mcp-auth-modal-icon">${connector.icon}</span>
      <div class="mcp-auth-modal-title">Connect ${escHtml(connector.name)}</div>`;

    /* steps */
    const steps = document.createElement("ol");
    steps.className = "mcp-auth-steps";
    steps.innerHTML = `
      <li>A new tab opened to ${escHtml(connector.name)} — create a token there.</li>
      <li>Copy the token and paste it below.</li>`;

    /* external link fallback */
    const linkRow = document.createElement("div");
    linkRow.className = "mcp-auth-link-row";
    linkRow.innerHTML = `<a href="${escHtml(connector.authUrl)}" target="_blank" rel="noopener">${escHtml(connector.authLabel)} ↗</a>`;

    /* fields */
    const fieldsWrap = document.createElement("div");
    fieldsWrap.className = "mcp-auth-fields";
    const inputs = [];
    connector.fields.forEach(field => {
      const label = document.createElement("label");
      label.className = "mcp-auth-field-label";
      label.textContent = field.label;
      const input = document.createElement("input");
      input.type = field.type;
      input.placeholder = field.placeholder || field.label;
      input.dataset.key = field.key;
      input.className = "mcp-auth-field-input";
      const existing = getConnectorCreds(connector.id);
      if (existing && existing[field.key]) input.value = existing[field.key];
      label.appendChild(input);
      fieldsWrap.appendChild(label);
      inputs.push(input);
    });

    /* actions */
    const actions = document.createElement("div");
    actions.className = "mcp-auth-modal-actions";
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "mcp-auth-cancel-btn";
    cancelBtn.textContent = "Cancel";
    const saveBtn = document.createElement("button");
    saveBtn.className = "mcp-auth-save-btn";
    saveBtn.textContent = `Connect ${connector.name}`;

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);

    box.appendChild(header);
    box.appendChild(steps);
    box.appendChild(linkRow);
    box.appendChild(fieldsWrap);
    box.appendChild(actions);
    overlay.appendChild(box);
    mcpPanel.appendChild(overlay);

    /* focus first empty field */
    const firstEmpty = inputs.find(i => !i.value);
    if (firstEmpty) setTimeout(() => firstEmpty.focus(), 60);

    const close = () => {
      overlay.remove();
      if (popup && !popup.closed) popup.close();
    };

    cancelBtn.addEventListener("click", close);
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

    saveBtn.addEventListener("click", () => {
      const fields = {};
      let hasValue = false;
      inputs.forEach(input => {
        const val = input.value.trim();
        fields[input.dataset.key] = val;
        if (val) hasValue = true;
      });
      if (!hasValue) {
        inputs[0].focus();
        inputs[0].style.borderColor = "rgba(239,68,68,.6)";
        setTimeout(() => inputs[0].style.borderColor = "", 1200);
        return;
      }
      close();
      setConnectorCreds(connector.id, fields);
      syncWindowCreds();
      refreshContextBar();
      onSave();
    });

    /* close modal on Enter in last field */
    inputs[inputs.length - 1].addEventListener("keydown", e => {
      if (e.key === "Enter") { e.preventDefault(); saveBtn.click(); }
    });
  }

  /* ── card rendering ─────────────────────────────────────────────── */

  function renderCards() {
    mcpBody.innerHTML = "";

    const connected   = CONNECTORS.filter(c => !c.comingSoon && isConnected(c.id));
    const available   = CONNECTORS.filter(c => !c.comingSoon && !isConnected(c.id));
    const comingSoon  = CONNECTORS.filter(c => c.comingSoon);

    if (connected.length)  { mcpBody.appendChild(sectionLabel("Connected"));   connected.forEach(c  => mcpBody.appendChild(buildCard(c))); }
    if (available.length)  { mcpBody.appendChild(sectionLabel("Available"));   available.forEach(c  => mcpBody.appendChild(buildCard(c))); }
    if (comingSoon.length) { mcpBody.appendChild(sectionLabel("Coming soon")); comingSoon.forEach(c => mcpBody.appendChild(buildCard(c))); }
  }

  function sectionLabel(text) {
    const el = document.createElement("div");
    el.className = "mcp-section-label";
    el.textContent = text;
    return el;
  }

  function buildCard(connector) {
    const connected = isConnected(connector.id);

    const wrap = document.createElement("div");
    wrap.className = "mcp-card" + (connected ? " connected" : "");

    /* ── main row ── */
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:12px;width:100%;";

    const icon = document.createElement("div");
    icon.className = "mcp-card-icon";
    icon.innerHTML = connector.icon;
    icon.style.color = connector.color || "currentColor";

    const info = document.createElement("div");
    info.className = "mcp-card-info";
    info.innerHTML = `<div class="mcp-card-name">${escHtml(connector.name)}</div>
                      <div class="mcp-card-desc">${escHtml(connector.desc)}</div>`;

    const btn = document.createElement("button");
    if (connector.comingSoon) {
      btn.className = "mcp-connect-btn connect";
      btn.disabled = true;
      btn.style.cssText = "opacity:.38;cursor:default;";
      btn.textContent = "Soon";
    } else if (connected) {
      btn.className = "mcp-connect-btn disconnect";
      btn.textContent = "Disconnect";
    } else {
      btn.className = "mcp-connect-btn connect";
      btn.textContent = "Connect";
    }

    row.appendChild(icon);
    row.appendChild(info);
    row.appendChild(btn);
    wrap.appendChild(row);

    if (connector.comingSoon) return wrap;

    /* ── tools list (visible when connected) ── */
    const toolsList = document.createElement("div");
    toolsList.className = "mcp-tools-list" + (connected ? " show" : "");
    connector.tools.forEach(tool => {
      const tr = document.createElement("div");
      tr.className = "mcp-tool-row";
      tr.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        <span><strong>${escHtml(tool.name)}</strong> — ${escHtml(tool.desc)}</span>`;
      toolsList.appendChild(tr);
    });
    wrap.appendChild(toolsList);

    /* ── button actions ── */
    if (connected) {
      btn.addEventListener("click", () => {
        clearConnectorCreds(connector.id);
        syncWindowCreds();
        refreshContextBar();
        renderCards();
      });
    } else {
      btn.addEventListener("click", () => {
        openAuthFlow(connector, () => renderCards());
      });
    }

    return wrap;
  }

  /* ── fetch patch — inject mcp_creds into ai-chatbot requests ────── */

  const SB_AI_URL_PATTERN = /\/functions\/v1\/ai-chatbot/;
  const _origFetch = window.fetch;

  window.fetch = function(input, init, ...rest) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (SB_AI_URL_PATTERN.test(url) && init && init.body) {
      try {
        const body = JSON.parse(init.body);
        const creds = window.__mcpCreds || {};
        if (Object.keys(creds).length) {
          body.mcp_creds = creds;
          init = { ...init, body: JSON.stringify(body) };
        }
      } catch (_) {}
    }
    return _origFetch.call(this, input, init, ...rest);
  };

  /* ── helpers ────────────────────────────────────────────────────── */

  function escHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

})();
